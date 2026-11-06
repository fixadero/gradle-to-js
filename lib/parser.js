'use strict';
var stream = require('stream');
var fs = require('fs');

var exports = module.exports = {};

var CHAR_TAB = 9;
var CHAR_NEWLINE = 10;
var CHAR_CARRIAGE_RETURN = 13;
var CHAR_SPACE = 32;
var CHAR_DOUBLE_QUOTE = 34;
var CHAR_SINGLE_QUOTE = 39;
var CHAR_LEFT_PARENTHESIS = 40;
var CHAR_RIGHT_PARENTHESIS = 41;
var CHAR_ASTERISK = 42;
var CHAR_COMMA = 44;
var CHAR_PERIOD = 46;
var CHAR_SLASH = 47;
var CHAR_EQUALS = 61;
var CHAR_ARRAY_START = 91;
var CHAR_BACKSLASH = 92;
var CHAR_ARRAY_END = 93;
var CHAR_BLOCK_START = 123;
var CHAR_BLOCK_END = 125;

var KEYWORD_DEF = 'def';
var KEYWORD_IF = 'if';
var KEYWORD_ELSE = 'else';

var WHITESPACE_CHARACTERS = {};
WHITESPACE_CHARACTERS[CHAR_TAB] = true;
WHITESPACE_CHARACTERS[CHAR_NEWLINE] = true;
WHITESPACE_CHARACTERS[CHAR_CARRIAGE_RETURN] = true;
WHITESPACE_CHARACTERS[CHAR_SPACE] = true;

var SPECIAL_KEYS = {
  repositories: parseRepositoryClosure,
  dependencies: parseDependencyClosure,
  plugins: parsePluginsClosure
};

var DEPS_KEYWORD_STRING_PATTERN = '[ \\t]*([A-Za-z0-9_-]+)[ \\t]*';
var DEPS_KEYWORD_STRING_REGEX = RegExp(DEPS_KEYWORD_STRING_PATTERN);
// The version can use variables, as in `$kotlin_version` or `${versions.agp}`
var DEPS_EASY_GAV_STRING_REGEX = RegExp('(["\']?)([\\w.-]+):([\\w.-]+):((?:\\$\\{[^}]*\\}|[\\w\\[\\]\\(\\),+.$-])+)\\1');
// A quoted group:name without a version, as in `'com.android.tools.build:gradle'`, where a plugin or BOM sets it
var DEPS_VERSIONLESS_GAV_STRING_REGEX = /(["'])([\w.-]+):([\w.-]+)\1/;
var DEPS_HARD_GAV_STRING_REGEX =RegExp(DEPS_KEYWORD_STRING_PATTERN + '(?:\\((.*)\\)|(.*))');
var DEPS_ITEM_BLOCK_REGEX = RegExp(DEPS_KEYWORD_STRING_PATTERN + '\\(((["\']?)(.*)\\3)\\)[ \\t]*\\{');
var DEPS_EXCLUDE_LINE_REGEX = RegExp('exclude[ \\t]+([^\\n]+)', 'g');
// Whole words only, so that the "id" in `alias(libs.plugins.android.application)` isn't taken for a plugin id
var PLUGINS_LINE_PATTERN = RegExp('\\b(id|version|alias)\\b[ \\t]*\\(?(["\']?)([A-Za-z0-9+._-]+)\\2\\)?', 'g');
var SPECIAL_CLOSURE_KEY_REGEX = /^[A-Za-z0-9_-]+$/;
// The key of a map entry, as in `enableHermes: true` or `'kotlin': '2.0.0'`. A key has to be a name or a plain string,
// so that `flag ? a : b` and "a:b:1" aren't taken for entries.
var MAP_ENTRY_KEY_REGEX = /^([A-Za-z_$][\w$]*|'[^'\\]*'|"[^"\\]*")\s*:/;


// When given, `entries` gets each key and value of this block in file order, including keys that repeat
function deepParse(chunk, state, keepFunctionCalls, skipEmptyValues, entries) {
  var out = {};

  function addValue(key, value) {
    addValueToStructure(out, key, value);
    if (entries && key) {
      entries.push({key: key, value: getRealValue(value)});
    }
  }

  var chunkLength = chunk.length;
  var character = 0;
  var tempString = '';

  var currentKey = '';
  var parsingKey = true;
  var isBeginningOfLine = true;
  var quotes = new QuoteTracker();
  // How many parentheses the current value has left open, as in `task("a",` when the call carries on to the next line
  var openParentheses = 0;

  if (typeof skipEmptyValues === 'undefined') {
    skipEmptyValues = true;
  }

  for (; state.index < chunkLength; state.index++) {
    character = chunk[state.index];

    if (isBeginningOfLine && isWhitespace(character)) {
      continue;
    }

    // A comment is skipped whole from its first character, wherever it is on the line, so that what comes right after
    // it is kept: the line after a bare `//`, or the brace after `/* … */`. A comment after a value, as in
    // `versionCode 12 // bump me`, ends the value.
    if (!quotes.isInString()) {
      var endOfComment = findEndOfComment(chunk, state.index);
      if (endOfComment !== -1) {
        state.index = endOfComment;
        tempString = tempString.trimEnd();
        continue;
      }
    }

    if (parsingKey && !keepFunctionCalls && character === CHAR_LEFT_PARENTHESIS) {
      skipFunctionCall(chunk, state);
      currentKey = '';
      tempString = '';
      isBeginningOfLine = true;
      continue;
    }

    if (isLineBreakCharacter(character)) {
      if (quotes.endLine(character)) {
        // The value is a string that carries on to the next line, so the line break is part of it
        tempString += String.fromCharCode(character);
        continue;
      }

      if (openParentheses > 0) {
        // The value is a call or expression that carries on to the next line, so the line break is part of it.
        // A brace still opens or ends a block, so a parenthesis that's never closed can't take more than its block.
        tempString += String.fromCharCode(character);
        continue;
      }

      if (!currentKey && tempString) {
        if (parsingKey) {
          if (isFunctionCall(tempString) && !keepFunctionCalls) {
            continue;
          } else {
            currentKey = tempString.trim();
            tempString = '';
          }
        }
      }

      if (tempString || (currentKey && !skipEmptyValues)) {
        addValue(currentKey, trimWrappingQuotes(tempString));

        currentKey = '';
        tempString = '';
      }

      parsingKey = true;
      isBeginningOfLine = true;
      continue;
    }

    // Only parse as an array if the first *real* char is a [
    if (!parsingKey && !tempString && character === CHAR_ARRAY_START) {
      var array = parseArray(chunk, state);
      out[currentKey] = array;
      if (entries) {
        entries.push({key: currentKey, value: array});
      }
      currentKey = '';
      tempString = '';
      continue;
    }

    // Braces inside strings, as in `versionName "${major}.${minor}"`, are part of the value
    var isBrace = (character === CHAR_BLOCK_START || character === CHAR_BLOCK_END) && !quotes.isInString();

    if (isBrace && character === CHAR_BLOCK_START) {
      // A block can start right after its name, as in `android{`. `}else{` reads like `} else {`.
      if (parsingKey && tempString) {
        currentKey = tempString === KEYWORD_ELSE ? '' : tempString;
        tempString = '';
      }

      // We need to skip the current (=start) character so that we literally "step into" the next closure/block
      state.index++;

      var block;
      if (SPECIAL_KEYS.hasOwnProperty(currentKey)) {
        block = SPECIAL_KEYS[currentKey](chunk, state);
        // A second `dependencies { … }` block in the same place adds to the first one
        out[currentKey] = Array.isArray(out[currentKey]) ? out[currentKey].concat(block) : block;
      } else {
        block = deepParse(chunk, state, keepFunctionCalls, skipEmptyValues);
        var earlierBlock = Object.prototype.hasOwnProperty.call(out, currentKey) ? out[currentKey] : undefined;
        out[currentKey] = isPlainObject(earlierBlock) ? mergeBlocks(earlierBlock, block) : block;
      }
      if (entries) {
        entries.push({key: currentKey, value: block});
      }
      currentKey = '';
      // The block either ends the value, as in `task("a", dependsOn: 'b') { … }`, or is an argument to it, as in
      // `files(sources.collect { … })`, so the parentheses before it no longer carry the value on to the next line
      openParentheses = 0;
    } else if (isBrace && character === CHAR_BLOCK_END) {
      // The last value of a block can end at its closing brace, as in `buildFeatures { compose true }`
      tempString = tempString.trimEnd();
      if (parsingKey && tempString) {
        currentKey = tempString;
        tempString = '';
      }
      if (tempString || (currentKey && !skipEmptyValues)) {
        addValue(currentKey, trimWrappingQuotes(tempString));
      }

      currentKey = '';
      tempString = '';
      break;
    } else if (isDelimiter(character) && parsingKey) {
      if (isKeyword(tempString)) {
        if (tempString === KEYWORD_DEF) {
          tempString = fetchDefinedNameOrSkipFunctionDefinition(chunk, state);
        } else if (tempString === KEYWORD_IF) {
          skipIfStatement(chunk, state);
          currentKey = '';
          tempString = '';
          continue;
        }
      }

      currentKey = tempString;
      tempString = '';
      parsingKey = false;
      if (!currentKey) {
        continue;
      }
    } else {
      if (!tempString && isDelimiter(character)) {
        continue;
      }
      // A backslash before a parenthesis means it's inside a /slashy/ regex, as in `text =~ /v\(\d+/`, which
      // QuoteTracker doesn't know about
      if (!parsingKey && !quotes.isInString() && !isEscaped(chunk, state.index)) {
        if (character === CHAR_LEFT_PARENTHESIS) {
          openParentheses++;
        } else if (character === CHAR_RIGHT_PARENTHESIS && openParentheses > 0) {
          openParentheses--;
        }
      }
      tempString += String.fromCharCode(character);
      quotes.track(chunk, state.index);
      isBeginningOfLine = false;
    }
  }

  // Add the last value to the structure
  addValue(currentKey, trimWrappingQuotes(tempString));
  return out;
}

function skipIfStatement(chunk, state) {
  skipFunctionCall(chunk, state);

  var character = '';
  var hasFoundTheCurlyBraces = false;
  var hasFoundAStatementWithoutBraces = false;
  var curlyBraceCount = 0;

  for (var max = chunk.length; state.index < max; state.index++) {
    character = chunk[state.index];

    if (hasFoundAStatementWithoutBraces) {
      if (isLineBreakCharacter(character)) {
        break;
      }
    } else {
      if (character === CHAR_BLOCK_START) {
        hasFoundTheCurlyBraces = true;
        curlyBraceCount++;
      } else if (character === CHAR_BLOCK_END) {
        curlyBraceCount--;
      } else if (!hasFoundTheCurlyBraces && !isWhitespace(character)) {
        hasFoundAStatementWithoutBraces = true;
      }

      if ((hasFoundTheCurlyBraces && curlyBraceCount === 0)) {
        break;
      }
    }
  }
  return curlyBraceCount === 0;
}

function skipFunctionDefinition(chunk, state) {
  var start = state.index;
  var parenthesisNest = 1;
  var character = chunk[++state.index];
  while (character !== undefined && parenthesisNest) {
    if (character === CHAR_LEFT_PARENTHESIS) {
      parenthesisNest++;
    } else if (character === CHAR_RIGHT_PARENTHESIS) {
      parenthesisNest--;
    }

    character = chunk[++state.index];
  }

  while (character && character !== CHAR_BLOCK_START) {
    character = chunk[++state.index];
  }

  character = chunk[++state.index];
  var blockNest = 1;
  while (character !== undefined && blockNest) {
    if (character === CHAR_BLOCK_START) {
      blockNest++;
    } else if (character === CHAR_BLOCK_END) {
      blockNest--;
    }

    character = chunk[++state.index];
  }

  state.index--;
}

function parseDependencyClosure(chunk, state) {
  return parseSpecialClosure(chunk, state, createStructuresForDependencyItem);
}

// Returns every dependency that an item declares, as in `implementation 'a:b:1'`, `runtime 'a:b:1', 'c:d:2'` or
// `compile(group: 'g', name: 'n', version: '1') { exclude … }`
function createStructuresForDependencyItem(data) {
  var keyword = DEPS_KEYWORD_STRING_REGEX.exec(data);
  var type = (keyword && keyword[1]) || '';
  var notations = keyword ? data.slice(keyword.index + keyword[0].length).trim() : data;

  // The block of a dependency, as in `compile('a:b:1') { exclude group: 'c' }`, applies to all its notations. It can
  // also be the last argument, as in `implementation 'a:b:1', { … }` or `implementation('a:b:1', { … })`.
  var outer = splitOffItemBlock(notations);
  if (!outer.notations) {
    // A block without a notation in front of it, as in `constraints { … }`, isn't a dependency of its own
    return [createStructureForBlockItem(data)];
  }
  var inner = splitOffItemBlock(withoutWrappingParentheses(outer.notations));

  var excludes = readExcludes(outer.block + inner.block);
  return splitDependencyNotations(inner.notations).map(function(notation) {
    // A notation that carries on over several lines reads the same as one on a single line
    var out = parseGavString(type + ' ' + notation.replace(/\s*[\r\n]+\s*/g, ' '));
    out.type = type;
    out.excludes = excludes;
    return out;
  });
}

// Reads a block without a notation in front of it, as in `constraints { implementation('a:b:1') }`, by finding the
// first dependency inside it. That's a guess, but it's what these blocks have always given.
function createStructureForBlockItem(data) {
  var matches = DEPS_ITEM_BLOCK_REGEX.exec(data);
  if (matches && matches[2]) {
    var out = parseGavString(matches[2]);
    out.type = matches[1];
    out.excludes = readExcludes(data);
    return out;
  }

  var structure = parseGavString(data);
  var keyword = DEPS_KEYWORD_STRING_REGEX.exec(data);
  structure.type = (keyword && keyword[1]) || '';
  structure.excludes = [];
  return structure;
}

// Returns the modules that a dependency's block leaves out, as in `exclude group: 'a', module: 'b'`
function readExcludes(block) {
  var excludes = [];
  var match;
  while ((match = DEPS_EXCLUDE_LINE_REGEX.exec(block))) {
    excludes.push(parseMapNotation(match[0].substring(findFirstSpaceOrTabPosition(match[0]))));
  }
  return excludes;
}

// Splits the notations of a dependency item, as in `'a:b:1', 'c:d:2'`, into one per dependency. Notations in a list,
// as in `['a:b:1', 'c:d:2']`, count as their own. A map, as in `group: 'g', name: 'n'`, is one dependency.
function splitDependencyNotations(notations) {
  // There's no closing bracket, so that an unbalanced notation, as in `project(':a'`, can't take one in
  var items = readListItems(toCharacterCodes('[' + notations), {index: 0}).map(function(item) {
    return item.trim();
  });
  if (!items.length || MAP_ENTRY_KEY_REGEX.test(items[0])) {
    return [notations];
  }

  return items.reduce(function(out, item) {
    return out.concat(isListLiteral(item) ? splitDependencyNotations(item.slice(1, -1)) : [item]);
  }, []);
}

function isListLiteral(text) {
  return text.charAt(0) === '[' && text.charAt(text.length - 1) === ']';
}

// `('a:b:1')` reads the same as `'a:b:1'`. Empty parentheses, as in Expo's `addUnimodulesDependencies()`, stay.
function withoutWrappingParentheses(text) {
  var characters = toCharacterCodes(text);
  var inside = text.slice(1, -1).trim();
  var isWrapped = characters[0] === CHAR_LEFT_PARENTHESIS &&
      findEndOfCondition(characters, 0) === characters.length - 1 &&
      characters[characters.length - 1] === CHAR_RIGHT_PARENTHESIS;
  return isWrapped && inside ? inside : text;
}

// Splits text like `'a:b:1' { exclude … }` or `'a:b:1', { exclude … }` into its notations and its block
function splitOffItemBlock(text) {
  var start = findItemBlockStart(text);
  if (start === -1) {
    return {notations: text, block: ''};
  }
  return {notations: text.slice(0, start).trim().replace(/,$/, '').trim(), block: text.slice(start)};
}

// Returns where the block after a dependency's notations starts, as in the `{` of `compile('a:b:1') { … }`, or -1
// if there's none. Braces inside strings or parentheses, as in "a:b:${version}", don't count.
function findItemBlockStart(text) {
  var characters = toCharacterCodes(text);
  var quotes = new QuoteTracker();
  var openBrackets = 0;
  for (var i = 0; i < characters.length; i++) {
    var character = characters[i];
    if (isLineBreakCharacter(character)) {
      quotes.endLine(character);
    } else {
      quotes.track(characters, i);
    }

    if (quotes.isInString()) {
      continue;
    }
    if (character === CHAR_LEFT_PARENTHESIS || character === CHAR_ARRAY_START) {
      openBrackets++;
    } else if (character === CHAR_RIGHT_PARENTHESIS || character === CHAR_ARRAY_END) {
      openBrackets = Math.max(openBrackets - 1, 0);
    } else if (character === CHAR_BLOCK_START && openBrackets === 0) {
      return i;
    }
  }
  return -1;
}

function parsePluginsClosure(chunk, state) {
  return parseSpecialClosure(chunk, state, createStructureForPlugin);
}

function createStructureForPlugin(pluginRow) {
  var out = {};

  var match;
  while(match = PLUGINS_LINE_PATTERN.exec(pluginRow)) {
    if (match && match[1]) {
      out[match[1]] = match[3];
    }
  }

  return out;
}

function findFirstSpaceOrTabPosition(input) {
  var position = input.indexOf(' ');
  if (position === -1) {
    position = input.indexOf('\t');
  }
  return position;
}

function parseGavString(gavString) {
  var out = { group: '', name: '', version: '' };
  var easyGavStringMatches = DEPS_EASY_GAV_STRING_REGEX.exec(gavString);
  var versionlessGavStringMatches = DEPS_VERSIONLESS_GAV_STRING_REGEX.exec(gavString);
  // Project references come first, so that `project(':features:home:ui')` isn't taken for group:name:version
  if (gavString.indexOf('project(') !== -1) {
    var projectMatches = gavString.match(/(project\([^\)]+\))/g);
    out['name'] = projectMatches ? projectMatches[0] : gavString.slice(gavString.indexOf('project(')).trim();
  } else if (easyGavStringMatches) {
    out['group'] = easyGavStringMatches[2];
    out['name'] = easyGavStringMatches[3];
    out['version'] = easyGavStringMatches[4];
  } else if (versionlessGavStringMatches) {
    out['group'] = versionlessGavStringMatches[2];
    out['name'] = versionlessGavStringMatches[3];
  } else {
    var hardGavMatches = DEPS_HARD_GAV_STRING_REGEX.exec(gavString);
    if (hardGavMatches && (hardGavMatches[3] || hardGavMatches[2])) {
      out = parseMapNotationWithFallback(out, hardGavMatches[3] || hardGavMatches[2]);
    } else {
      out = parseMapNotationWithFallback(out, gavString, gavString.slice(findFirstSpaceOrTabPosition(gavString)));
    }
  }
  return out;
}

function parseMapNotationWithFallback(out, string, name) {
  var outFromMapNotation = parseMapNotation(string);
  if (outFromMapNotation['name']) {
    out = outFromMapNotation;
  } else {
    out['name'] = name ? name : string;
  }
  return out;
}

function parseMapNotation(input) {
  var out = {};
  var currentKey = '';
  var quotation = '';

  for (var i = 0, max = input.length; i < max; i++) {
    if (input[i] === ':') {
      currentKey = currentKey.trim();
      out[currentKey] = '';

      for (var innerLoop = 0, i = i + 1; i < max; i++) {
        if (innerLoop === 0) {
          // Skip any leading spaces before the actual value
          if (isWhitespaceLiteral(input[i])) {
            continue;
          }
        }

        // We just take note of what the "latest" quote was so that we can
        if (input[i] === '"' || input[i] === "'") {
          quotation = input[i];
          continue;
        }

        // Moving on to the next value if we find a comma
        if (input[i] === ',') {
          out[currentKey] = out[currentKey].trim();
          currentKey = '';
          break;
        }

        out[currentKey] += input[i];
        innerLoop++;
      }
    } else {
      currentKey += input[i];
    }
  }

  // If the last character contains a quotation mark, we remove it
  if (out[currentKey]) {
    out[currentKey] = out[currentKey].trim();
    if (out[currentKey].slice(-1) === quotation) {
      out[currentKey] = out[currentKey].slice(0, -1);
    }
  }
  return out;
}

function parseRepositoryClosure(chunk, state) {
  // Goes by entries rather than keys, so that two `maven { … }` repositories stay two repositories
  var entries = [];
  deepParse(chunk, state, true, false, entries);
  return entries.map(function(entry) {
    if (entry.value) {
      return {type: entry.key, data: entry.value};
    }
    return {type: 'unknown', data: {name: entry.key}};
  });
}

function parseSpecialClosure(chunk, state, mapFunction) {
  var out = [];
  // openBlockCount starts at 1 due to us entering after "<key> {"
  var openBlockCount = 1;
  var currentKey = '';
  var currentValue = '';

  // How deep we are in braces that belong to an item, as in `implementation('a:b:1') { exclude … }`
  var itemBlockDepth = 0;
  for (; state.index < chunk.length; state.index++) {
    // A comment between items is skipped whole, so that a `/* … */` right before the closing brace doesn't take the
    // brace with it
    if (!currentKey) {
      var endOfLeadingComment = findEndOfComment(chunk, state.index);
      if (endOfLeadingComment !== -1) {
        state.index = endOfLeadingComment;
        continue;
      }
    }

    if (chunk[state.index] === CHAR_BLOCK_START) {
      openBlockCount++;
    } else if (chunk[state.index] === CHAR_BLOCK_END) {
      openBlockCount--;
    } else if (chunk[state.index] === CHAR_LEFT_PARENTHESIS && SPECIAL_CLOSURE_KEY_REGEX.test(currentKey)) {
      // `implementation("a:b:1")` means the same as `implementation ("a:b:1")`, so the key ends here
      currentValue = '(';
    } else {
      currentKey += String.fromCharCode(chunk[state.index]);
    }

    // Keys shouldn't have any leading nor trailing whitespace
    currentKey = currentKey.trim();

    // Gradle only runs one branch of an `if (…) { … } else { … }`, and we can't tell which. So we step over the
    // `if (…)` and `else` themselves, and read the items in every branch as if they weren't inside one.
    if (currentKey === KEYWORD_IF && (currentValue || isWhitespace(chunk[state.index]))) {
      var endOfCondition = findEndOfCondition(chunk, state.index);
      if (endOfCondition !== -1) {
        state.index = endOfCondition;
        currentKey = '';
        currentValue = '';
        continue;
      }
    } else if (currentKey === KEYWORD_ELSE &&
        (chunk[state.index] === CHAR_BLOCK_START || isWhitespace(chunk[state.index]))) {
      currentKey = '';
      continue;
    }

    if (currentKey && (currentValue || isWhitespace(chunk[state.index]))) {
      var character = '';
      var quotes = new QuoteTracker();
      // How many parentheses and brackets the item has left open, as in `testCompile(` or `[group: 'a',` when it
      // carries on to the next line
      var openBrackets = currentValue === '(' ? 1 : 0;
      for (state.index = state.index + 1; state.index < chunk.length; state.index++) {
        character = chunk[state.index];

        // Leaves out comments after a value, as in `implementation deps.foo // pinned`
        if (!quotes.isInString()) {
          var endOfComment = findEndOfComment(chunk, state.index);
          if (endOfComment !== -1) {
            state.index = endOfComment;
            currentValue = currentValue.trimEnd();
            continue;
          }
        }

        currentValue += String.fromCharCode(character);
        if (isLineBreakCharacter(character)) {
          quotes.endLine(character);
        } else {
          quotes.track(chunk, state.index);
        }

        if (quotes.isInString() || isEscaped(chunk, state.index)) {
          // Brackets and line breaks inside strings, as in "a:b:${version}", or after a backslash don't open or end
          // anything
        } else if (character === CHAR_LEFT_PARENTHESIS || character === CHAR_ARRAY_START) {
          openBrackets++;
        } else if (character === CHAR_RIGHT_PARENTHESIS || character === CHAR_ARRAY_END) {
          openBrackets = Math.max(openBrackets - 1, 0);
        } else if (character === CHAR_BLOCK_START) {
          itemBlockDepth++;
        } else if (itemBlockDepth > 0 && character === CHAR_BLOCK_END) {
          itemBlockDepth--;
        } else if (character === CHAR_BLOCK_END) {
          // The closure ends on the same line as its last item, as in `plugins { id 'java' }`
          currentValue = currentValue.slice(0, -1);
          openBlockCount--;
          break;
        } else if (itemBlockDepth === 0 && isLineBreakCharacter(character)) {
          // The item carries on to the next line while a parenthesis or bracket is open, or after a comma, as in
          // `runtime 'a:b:1',` followed by `'c:d:2'`
          if (!openBrackets && !/,\s*$/.test(currentValue)) {
            break;
          }
        }
      }

      // One item can declare several dependencies, as in `runtime 'a:b:1', 'c:d:2'`
      out = out.concat(mapFunction(currentKey + ' ' + currentValue));
      currentKey = '';
      currentValue = '';
    }

    if (openBlockCount == 0) {
      break;
    }
  }
  return out;
}

// Returns the index of the parenthesis that closes the `(…)` starting at index, after any whitespace, or -1 if there's
// no `(` there
function findEndOfCondition(chunk, index) {
  while (index < chunk.length && isWhitespace(chunk[index])) {
    index++;
  }
  if (chunk[index] !== CHAR_LEFT_PARENTHESIS) {
    return -1;
  }

  var openParenthesisCount = 0;
  var quotes = new QuoteTracker();
  for (; index < chunk.length; index++) {
    var character = chunk[index];
    if (isLineBreakCharacter(character)) {
      quotes.endLine(character);
    } else {
      quotes.track(chunk, index);
    }

    // Parentheses inside strings, as in `if (findProperty('x') == ')')`, don't count
    if (quotes.isInString()) {
      continue;
    }
    if (character === CHAR_LEFT_PARENTHESIS) {
      openParenthesisCount++;
    } else if (character === CHAR_RIGHT_PARENTHESIS && --openParenthesisCount === 0) {
      return index;
    }
  }
  return chunk.length - 1;
}

function fetchDefinedNameOrSkipFunctionDefinition(chunk, state) {
  var character = 0;
  var temp = '';
  var isVariableDefinition = true;
  for (var max = chunk.length; state.index < max; state.index++) {
    character = chunk[state.index];

    if (character === CHAR_EQUALS) {
      // Variable definition, break and return name
      break;
    } else if (character === CHAR_LEFT_PARENTHESIS) {
      // Function definition, skip parsing
      isVariableDefinition = false;
      skipFunctionDefinition(chunk, state);
      break;
    }

    temp += String.fromCharCode(character);
  }

  if (isVariableDefinition) {
    var values = temp.trim().split(' ');
    return values[values.length - 1];
  } else {
    return '';
  }
}

// Reads a list like `["a", 'b', file('c')]` or a map like `[a: 1, b: [2, 3]]`, starting with state.index on its
// opening bracket and leaving it on the closing one. Nested lists and maps are read too; closures and other
// expressions come back as their text.
function parseArray(chunk, state) {
  return toListOrMap(readListItems(chunk, state));
}

// Returns the text of each item in a `[…]` literal, starting with state.index on its opening bracket and leaving it
// on the closing one. Comments are left out, and commas or brackets inside strings, comments or nested brackets
// don't split or end it.
function readListItems(chunk, state) {
  var items = [];
  var item = '';
  var nestingDepth = 0;
  var quotes = new QuoteTracker();

  for (state.index++; state.index < chunk.length; state.index++) {
    var character = chunk[state.index];

    if (!quotes.isInString()) {
      var endOfComment = findEndOfComment(chunk, state.index);
      if (endOfComment !== -1) {
        state.index = endOfComment;
        item = item.trimEnd();
        continue;
      }
    }

    if (isLineBreakCharacter(character)) {
      quotes.endLine(character);
    } else {
      quotes.track(chunk, state.index);
    }

    if (!quotes.isInString()) {
      if (nestingDepth === 0 && character === CHAR_ARRAY_END) {
        break;
      } else if (nestingDepth === 0 && character === CHAR_COMMA) {
        items.push(item);
        item = '';
        continue;
      } else if (character === CHAR_ARRAY_START || character === CHAR_LEFT_PARENTHESIS || character === CHAR_BLOCK_START) {
        nestingDepth++;
      } else if (character === CHAR_ARRAY_END || character === CHAR_RIGHT_PARENTHESIS || character === CHAR_BLOCK_END) {
        nestingDepth = Math.max(nestingDepth - 1, 0);
      }
    }
    item += String.fromCharCode(character);
  }
  items.push(item);

  // Nothing after the last comma, as in `[a, b,]`, or in an empty list isn't an item
  if (!items[items.length - 1].trim()) {
    items.pop();
  }

  return items;
}

// Turns the items of a `[…]` literal into a map when every item is a `key: value` entry, and into a list otherwise.
// A list that mixes entries and plain items isn't valid Groovy, so it's left as a list of text.
function toListOrMap(items) {
  // `[:]` is Groovy's empty map
  if (items.length === 1 && items[0].trim() === ':') {
    return {};
  }

  var entries = items.map(function(item) {
    return MAP_ENTRY_KEY_REGEX.exec(item.trim());
  });
  if (!entries.length || !entries.every(Boolean)) {
    return items.map(toLiteralValue);
  }

  var out = {};
  entries.forEach(function(entry, i) {
    // Defined rather than assigned, so that a key named __proto__ is just a key
    Object.defineProperty(out, trimWrappingQuotes(entry[1]), {
      value: toLiteralValue(items[i].trim().slice(entry[0].length)),
      enumerable: true,
      writable: true,
      configurable: true
    });
  });
  return out;
}

// A list item or map value: a nested `[…]` becomes a list or map, anything else is text, or a boolean for true/false
function toLiteralValue(text) {
  text = text.trim();
  if (text.charAt(0) === '[') {
    var chunk = toCharacterCodes(text);
    var state = {index: 0};
    var value = parseArray(chunk, state);
    // Only when the brackets are the whole value, and not the start of something like `[1, 2].sum()`
    if (state.index === chunk.length - 1) {
      return value;
    }
  }
  return getRealValue(trimWrappingQuotes(text));
}

function skipFunctionCall(chunk, state) {
  var openParenthesisCount = 0;
  var character = '';
  for (var max = chunk.length; state.index < max; state.index++) {
    character = chunk[state.index];
    if (character === CHAR_LEFT_PARENTHESIS) {
      openParenthesisCount++;
    } else if (character === CHAR_RIGHT_PARENTHESIS) {
      openParenthesisCount--;
    }
    if (openParenthesisCount === 0 && !isWhitespace(character)) {
      state.index++;
      break;
    }
  }
  return openParenthesisCount === 0;
}

// Merges a block into an earlier block with the same name, the way Gradle reads two `android { … }` blocks as one.
// Later values win, except that the lists from dependencies, repositories and plugins blocks add up.
function mergeBlocks(earlier, later) {
  var out = {};
  Object.keys(earlier).forEach(function(key) {
    out[key] = earlier[key];
  });

  Object.keys(later).forEach(function(key) {
    var earlierValue = Object.prototype.hasOwnProperty.call(out, key) ? out[key] : undefined;
    var laterValue = later[key];
    if (SPECIAL_KEYS.hasOwnProperty(key) && Array.isArray(earlierValue) && Array.isArray(laterValue)) {
      out[key] = earlierValue.concat(laterValue);
    } else if (isPlainObject(earlierValue) && isPlainObject(laterValue)) {
      out[key] = mergeBlocks(earlierValue, laterValue);
    } else {
      out[key] = laterValue;
    }
  });
  return out;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function addValueToStructure(structure, currentKey, value) {
  if (currentKey) {
    if (Object.prototype.hasOwnProperty.call(structure, currentKey)) {
      if (structure[currentKey].constructor === Array) {
        structure[currentKey].push(getRealValue(value));
      } else {
        var oldValue = structure[currentKey];
        structure[currentKey] = [oldValue, getRealValue(value)];
      }
    } else {
      structure[currentKey] = getRealValue(value);
    }
  }
}

function getRealValue(value) {
  if (value === 'true' || value === 'false') { // booleans
    return value === 'true';
  }

  return value;
}

function trimWrappingQuotes(string) {
  var tripleQuoted = /^("""|''')([\s\S]*)\1$/.exec(string);
  if (tripleQuoted) {
    return tripleQuoted[2];
  }

  var firstCharacter = string.slice(0, 1);
  if (firstCharacter === '"') {
    return string.replace(/^"([^"]*)"$/g, '$1');
  } else if (firstCharacter === '\'') {
    return string.replace(/^'([^']*)'$/g, '$1');
  }
  return string;
}

function isDelimiter(character) {
  return character === CHAR_SPACE || character === CHAR_EQUALS;
}

function isWhitespace(character) {
  return WHITESPACE_CHARACTERS.hasOwnProperty(character);
}

function isWhitespaceLiteral(character) {
  return isWhitespace(character.charCodeAt(0));
}

// Tells whether the character at index has an odd number of backslashes right before it, as in `\(` but not `\\(`
function isEscaped(chunk, index) {
  var escaped = false;
  for (var previous = index - 1; previous >= 0 && chunk[previous] === CHAR_BACKSLASH; previous--) {
    escaped = !escaped;
  }
  return escaped;
}

function isLineBreakCharacter(character) {
  return character == CHAR_CARRIAGE_RETURN || character == CHAR_NEWLINE
}

function isKeyword(string) {
  return string === KEYWORD_DEF || string === KEYWORD_IF;
}

// Returns the index of the last character of the comment that starts at index, or -1 if none starts there.
// A single line comment ends right before its line break, so that the caller still gets to see the line break.
function findEndOfComment(chunk, index) {
  if (chunk[index] !== CHAR_SLASH) {
    return -1;
  }

  if (chunk[index + 1] === CHAR_SLASH) {
    while (index + 1 < chunk.length && !isLineBreakCharacter(chunk[index + 1])) {
      index++;
    }
    return index;
  }

  if (chunk[index + 1] === CHAR_ASTERISK) {
    for (var i = index + 2; i + 1 < chunk.length; i++) {
      if (chunk[i] === CHAR_ASTERISK && chunk[i + 1] === CHAR_SLASH) {
        return i + 1;
      }
    }
    return chunk.length - 1;
  }

  return -1;
}

// Tells whether the characters seen so far leave us inside a quoted string, so that `"https://…"` isn't mistaken for
// a comment, nor the braces in `"${version}"` for a block
function QuoteTracker() {
  this.reset();
}

QuoteTracker.prototype.reset = function() {
  this.quote = 0;
  this.isTripleQuoted = false;
  this.isEscaped = false;
  this.quotesToSkip = 0;
};

// Takes the character at chunk[index], looking ahead to tell a """triple-quoted""" string from a "plain" one
QuoteTracker.prototype.track = function(chunk, index) {
  var character = chunk[index];
  var isTripleQuote = chunk[index + 1] === character && chunk[index + 2] === character;

  if (this.quotesToSkip > 0) {
    this.quotesToSkip--;
  } else if (this.isEscaped) {
    this.isEscaped = false;
  } else if (this.quote) {
    if (character === CHAR_BACKSLASH) {
      this.isEscaped = true;
    } else if (character === this.quote && (!this.isTripleQuoted || isTripleQuote)) {
      this.quotesToSkip = this.isTripleQuoted ? 2 : 0;
      this.quote = 0;
    }
  } else if (character === CHAR_DOUBLE_QUOTE || character === CHAR_SINGLE_QUOTE) {
    this.quote = character;
    this.isTripleQuoted = isTripleQuote;
    this.quotesToSkip = isTripleQuote ? 2 : 0;
  }
};

// Takes a line break, and tells whether it's inside a string that carries on to the next line: a """triple-quoted"""
// one, or one whose line ends with a backslash
QuoteTracker.prototype.endLine = function(character) {
  if (this.quote && (this.isTripleQuoted || this.isEscaped)) {
    // The \r of a \r\n line break leaves the backslash waiting for the \n
    this.isEscaped = this.isEscaped && character === CHAR_CARRIAGE_RETURN;
    return true;
  }
  this.reset();
  return false;
};

QuoteTracker.prototype.isInString = function() {
  return this.quote !== 0;
};

function isFunctionCall(string) {
  return string.match(/\w+\(.*\);?$/) !== null;
}

// The parser builds its strings one character code at a time, which mangles anything outside of ASCII if fed raw bytes
function toCharacterCodes(text) {
  var characterCodes = new Uint16Array(text.length);
  for (var i = 0, max = text.length; i < max; i++) {
    characterCodes[i] = text.charCodeAt(i);
  }
  return characterCodes;
}

function parse(readableStream) {
  return new Promise(function(resolve, reject) {
    var chunks = [];
    readableStream.on('data', function(chunk) {
      chunks.push(chunk);
    });

    readableStream.on('end', function() {
      var state = {index: 0};

      // Stream handlers run outside of the promise, so anything thrown here would take down the host process
      try {
        resolve(deepParse(toCharacterCodes(Buffer.concat(chunks).toString('utf8')), state, false, undefined));
      } catch (error) {
        reject(error);
      }
    });
    // Passes on the original error, like fs.readFile does, so that callers can check its code (ENOENT and so on)
    readableStream.on('error', reject);
  });
}

function parseText(text) {
  var textAsStream = new stream.Readable();
  textAsStream._read = function noop() {};
  textAsStream.push(text);
  textAsStream.push(null);
  return parse(textAsStream);
}

function parseFile(path) {
  var stream = fs.createReadStream(path);
  return parse(stream);
}

module.exports = {
  parseText: parseText,
  parseFile: parseFile
};
