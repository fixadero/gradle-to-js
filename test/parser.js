'use strict';
var assert = require('node:assert');
var fs = require('node:fs');
var os = require('node:os');
var path = require('node:path');
var test = require('node:test');
var describe = test.describe;
var it = test.it;

var parser = require('../lib/parser');

function parseTemporaryFile(t, content) {
  var directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gradle-to-js-'));
  t.after(function() {
    fs.rmSync(directory, {recursive: true});
  });

  var filePath = path.join(directory, 'build.gradle');
  fs.writeFileSync(filePath, content);
  return parser.parseFile(filePath);
}

// Removes the first and last line breaks of a template literal, along with the indentation of its least indented line
function stripIndent(text) {
  var lines = text.replace(/^[ \t]*\r?\n/, '').replace(/\r?\n[ \t]*$/, '').split('\n');
  var indent = lines.reduce(function(smallest, line) {
    return line.trim() ? Math.min(smallest, line.match(/^[ \t]*/)[0].length) : smallest;
  }, Infinity);
  return lines.map(function(line) {
    return line.slice(indent);
  }).join('\n');
}

describe('Gradle build file parser', function() {
  describe('(text parsing)', function() {
    it('can parse a single <<key value>>', function() {
      var dsl = 'key "value"';
      var expected = {key: 'value'};

      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can parse a single key=value', function() {
      var dsl = 'key = "value"';
      var expected = {key: 'value'};
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can parse a multiple <<key value>> combinations', function() {
      var dsl = stripIndent(`
             key "value"
             key2 "value2"
             `);
      var expected = {key: 'value', key2: 'value2'};

      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can parse a multiple <<key=value>> combinations', function() {
      var dsl = stripIndent(`
             key = "value"
             key2 = "value2"
             `);
      var expected = {key: 'value', key2: 'value2'};

      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can detect a block', function() {
      var dsl = stripIndent(`
             testblock {

             }
             `);
      var expected = {testblock: {}};

      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });

    });

    it('can detect a single level block and its values', function() {
      var dsl = stripIndent(`
             testblock {
             key1 "value1"
             key2 "value2"
             }
             `);
      var expected = {testblock: {key1: 'value1', key2: 'value2'}};

      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });

    });

    it('can detect a multiple single level block and their values', function() {
      var dsl = stripIndent(`
             testblock {
             key1 "value1"
             key2 "value2"
             }
             testblock2 {
             key3 "value3"
             key4 "value4"
             }
             `);
      var expected = {
        testblock: {key1: 'value1', key2: 'value2'},
        testblock2: {key3: 'value3', key4: 'value4'}
      };

      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });

    });

    it('can detect a mix of single level items', function() {
      var dsl = stripIndent(`
             testblock {
             key1 "value1"
             key2 "value2"
             }
             testblock3 "not really"
             testblock2 {
             key3 "value3"
             key4 "value4"
             }
             `);
      var expected = {
        testblock: {key1: 'value1', key2: 'value2'},
        testblock2: {key3: 'value3', key4: 'value4'},
        testblock3: 'not really'
      };

      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });

    });

    it('can detect chaos', function() {
      var dsl = stripIndent(`
             testblock {
             key1 "value1"
             key2 "value2"
             nestedKey {
             key3 "value3"
             key4 "value4"
             key5 {
             key6 "value6"
             }
             }
             }
             testblock2 {
             key1 "value1"
             key2 "value2"
             }
             testblock3 "not really"
             `);
      var expected = {
        testblock: {
          key1: 'value1',
          key2: 'value2',
          nestedKey: {
            key3: 'value3',
            key4: 'value4',
            key5: {
              key6: 'value6'
            }
          }
        },
        testblock2: {key1: 'value1', key2: 'value2'},
        testblock3: 'not really'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });

    });

    it('will skip commented lines', function() {
      var dsl = 'key "value"' + '\n';
      dsl += '// this is a single line comment' + '\n';
      dsl += 'key2 "value2"' + '\n';
      dsl += '/* this is a multi' + '\n';
      dsl += 'line comment */' + '\n';
      dsl += '    key3 "value3"' + '\n';
      dsl += '/**' + '\n';
      dsl += ' *' + '\n';
      dsl += ' * Something here' + '\n';
      dsl += ' *' + '\n';
      dsl += ' */';

      var expected = {key: 'value', key2: 'value2', key3: 'value3'};
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });
    it('will store multiple occurences of a key as an array', function() {
      var dsl = stripIndent(`
                testblock {
                    key1 "value1"
                    key1 "value2"
                }
                key1 "value3"
                key1 "value4"
            `);

      var expected = {
        testblock: {
          key1: ['value1', 'value2']
        },
        key1: ['value3', 'value4']
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('will be able to parse a list of items', function() {
      var dsl = stripIndent(`
                testblock {
                    key1 ["value1", "value2"]
                }
                key1 ["value3", "value4"]
                specialKey " " + key1["sausage"]
            `);

      var expected = {
        testblock: {
          key1: ['value1', 'value2']
        },
        key1: ['value3', 'value4'],
        specialKey: '" " + key1["sausage"]'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    // Because the scoping that def imposes doesn't make a difference for us
    it('should be able to collect definitions as regular variables', function() {
      var dsl = stripIndent(`
             def myVar1 = new Var()
             def myVar2 = new Var(2)
             `);

      var expected = {
        myVar1: 'new Var()',
        myVar2: 'new Var(2)'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('should be able to collect complex definitions as regular variables', function() {
      var dsl = stripIndent(`
             def MyType myVar1 = new Var()
             def MyType myVar2 = new Var(2)
             `);

      var expected = {
        myVar1: 'new Var()',
        myVar2: 'new Var(2)'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('should skip (seemingly) function calls to variables', function() {
      var dsl = stripIndent(`
             def MyType myVar1 = new Var()
             myVar1.loadSomething(new Cake())
             `);

      var expected = {
        myVar1: 'new Var()'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('should group repositories into an array', function() {
      var dsl = stripIndent(`
             repositories {
                mavenCentral()
                maven {
                    url "http://test"
                }
             }
            `);

      var expected = {
        repositories: [
            {type: 'unknown', data: {name: 'mavenCentral()'}},
            {type: 'maven', data: {url: 'http://test'}}
        ]
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('should group plugins into an array with a given format', function() {
      var dsl = stripIndent(`
             plugins {
                id 'some.id.here' version 'some.version.here'
                id 'another.id.here'
                version 'some.other.version.here' id 'some.other.id.here'
                id "plugin.id.doublequotes"
                id 'id.with.hyphen-symbol'
                id 'id.with.underscore_symbol'
                id ('plugin.id.parens')
                id ('plugin.id.parens.version') version '1.2.3'
                id 'plugin.with.plus.wildcard' version '3.2.+'
             }
            `);

      var expected = {
        plugins: [
            {id: 'some.id.here', version: 'some.version.here'},
            {id: 'another.id.here'},
            {id: 'some.other.id.here', version: 'some.other.version.here'},
            {id: 'plugin.id.doublequotes'},
            {id: 'id.with.hyphen-symbol'},
            {id: 'id.with.underscore_symbol'},
            {id: 'plugin.id.parens'},
            {id: 'plugin.id.parens.version', version: '1.2.3'},
            {id: 'plugin.with.plus.wildcard', version: '3.2.+'}
        ]
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('should be able to parse booleans into booleans', function() {
      var dsl = stripIndent(`
             myVar1 true
             someAttribute true
             someFalseAttribute false
             myVar2 false
             `);

      var expected = {
        myVar1: true,
        someAttribute: true,
        someFalseAttribute: false,
        myVar2: false
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('should parse numbers as strings', function() {
      var dsl = stripIndent(`
             myVar301 1
             myVar402 32
             myVar103 33
             myVar204 4
             `);

      var expected = {
        myVar301: '1',
        myVar402: '32',
        myVar103: '33',
        myVar204: '4'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });
    it('can skip if blocks', function() {
      var dsl = stripIndent(`
             myVar1 "a"
             if (myVar301 === "sausage") {
                myVar2 "b"
             }
             myVar2 "c"
             `);

      var expected = {
        myVar1: 'a',
        myVar2: 'c'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can skip if clauses without brackets', function() {
      var dsl = stripIndent(`
             myVar1 "a"
             if (myBreakfast === "eggs") myVar1 "b"
             myVar2 "c"
             if (myBreakfast === "bacon")
                myVar2 "d"
             `);

      var expected = {
        myVar1: 'a',
        myVar2: 'c'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
});

    it('can skip function definitions', function() {
      var dsl = stripIndent(`
             myVar1 "a"
             def fibonacci (int i) {
               if (i <= 2) {
                 return 1;
               } else {
                 return fibonacci(i - 1) + fibonacci(i - 2);
               }
             }
             myVar2 "c"
             `);

      var expected = {
        myVar1: 'a',
        myVar2: 'c'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('will manage to parse closures that have brackets on another line', function() {
      var dsl = stripIndent(`
        android {
          property1 'one'
        }

        android
        {
          property2 'two'
        }
      `);

      var expected = { android: { property1: 'one', property2: 'two'} };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('will merge multiple closures with the same key into one', function() {
      var dsl = stripIndent(`
        android {
          property1 'one'
        }

        android {
          property2 'two'
        }

        android {
          property3 'three'
        }
      `);

      var expected = { android: { property1: 'one', property2: 'two', property3: 'three' } };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });
    it('will deep merge multiple complex closures with the same key into one', function() {
      var dsl = stripIndent(`
        foo {
          android {
            property1 'one'
          }

          android {
            property2 'two'
          }

          android {
            property3 'three'
          }

          android {
            property4 'four'
          }
        }
      `);

      var expected = {foo: { android: { property1: 'one', property2: 'two', property3: 'three', property4: 'four' } } };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('will handle compile keywords separately', function() {
      var dsl = stripIndent(`
      dependencies {
        compile (project(':react-native-maps')) {
          exclude group: 'com.google.android.gms', module: 'play-services-base'
          exclude group: 'com.google.android.gms', module: 'play-services-maps'
        }
        compile (project(':react-native-background-geolocation')) {
          exclude group: 'com.google.android.gms', module: 'play-services-location'
        }
        compile 'g1:a1:v1'
        compile group: 'g2', name: 'a2', version: 'v2'
      }
      `);

      var expected = {
        dependencies: [
          {
            group: '',
            name: 'project(\':react-native-maps\')',
            version: '',
            type: 'compile',
            excludes: [
              {
                group: 'com.google.android.gms',
                module: 'play-services-base'
              },
              {
                group: 'com.google.android.gms',
                module: 'play-services-maps'
              }
            ]
          },
          {
            group: '',
            name: 'project(\':react-native-background-geolocation\')',
            version: '',
            type: 'compile',
            excludes: [
              {
                group: 'com.google.android.gms',
                module: 'play-services-location'
              }
            ]
          },
          {
            group: 'g1',
            name: 'a1',
            version: 'v1',
            type: 'compile',
            excludes: []
          },
          {
            group: 'g2',
            name: 'a2',
            version: 'v2',
            type: 'compile',
            excludes: []
          }
        ]
      };

      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can handle Windows style CRLF gradle files accordingly', function() {
        var sampleFilePath = 'test/sample-data/windows_crlf.gradle';
        var expected = require(process.cwd() + '/test/sample-data/windows_crlf.gradle.expected.js').expected;

        return parser.parseFile(sampleFilePath).then(function(parsedValue) {
          assert.deepStrictEqual(parsedValue, expected);
        });
    });

    it('will keep non-ASCII characters intact', function() {
      var dsl = stripIndent(`
        name "Mållgan åäö 日本語 🫡"
        block {
          nyckel "värde"
        }
        dependencies {
          implementation 'a:b:1'
        }
      `);

      var expected = {
        name: 'Mållgan åäö 日本語 🫡',
        block: {nyckel: 'värde'},
        dependencies: [{group: 'a', name: 'b', version: '1', type: 'implementation', excludes: []}]
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can handle an unbalanced project reference', function() {
      var dsl = stripIndent(`
        dependencies {
          implementation project(':some-module'
        }
        key "value"
      `);

      var expected = {
        dependencies: [
          {group: '', name: 'project(\':some-module\'', version: '', type: 'implementation', excludes: []}
        ],
        key: 'value'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can handle a key named hasOwnProperty', function() {
      var dsl = stripIndent(`
        hasOwnProperty "value"
        key "value2"
      `);

      var expected = {hasOwnProperty: 'value', key: 'value2'};
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('will reject when it fails to parse the input', function() {
      var tooDeeplyNested = 'key {\n'.repeat(100000);

      return assert.rejects(parser.parseText(tooDeeplyNested), RangeError);
    });

    it('will not pollute the Object prototype', function() {
      var dsl = stripIndent(`
        key {
          __proto__ {
            polluted "yes"
          }
        }
        key {
          __proto__ {
            polluted "yes"
          }
        }
      `);

      return parser.parseText(dsl).then(function() {
        assert.strictEqual({}.polluted, undefined);
      });
    });

    it('can parse dependencies and plugins without a space before the parenthesis', function() {
      var dsl = stripIndent(`
        plugins {
          id('com.android.application')
          id('com.github.triplet.play') version '2.3.0' apply false
        }
        dependencies {
          implementation("org.example:name1:1.0.0")
          implementation("org.example:name2:1.0.0")
          classpath('org.example:name3:1.0.0')
        }
      `);

      var expected = {
        plugins: [
          {id: 'com.android.application'},
          {id: 'com.github.triplet.play', version: '2.3.0'}
        ],
        dependencies: [
          {group: 'org.example', name: 'name1', version: '1.0.0', type: 'implementation', excludes: []},
          {group: 'org.example', name: 'name2', version: '1.0.0', type: 'implementation', excludes: []},
          {group: 'org.example', name: 'name3', version: '1.0.0', type: 'classpath', excludes: []}
        ]
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('will leave out comments that come after a value', function() {
      var dsl = stripIndent(`
        android {
          defaultConfig {
            versionCode 12 // bump me
            versionName "1.2" /* x */
            applicationId "com.example" /* a */ // b
          }
        }
        repositories {
          maven {
            url "https://example.com/repo" // mirror
          }
          google() // the main one
        }
        dependencies {
          implementation deps.foo // pinned
          implementation 'a:b:1' // see https://example.com
          implementation("c:d:2") {
            // exclude group: 'not', module: 'excluded'
            exclude group: 'x', module: 'y'
          }
        }
        plugins {
          id 'com.android.application' // version is set elsewhere
        }
        url "https://example.com/a//b" // the string keeps its slashes
      `);

      var expected = {
        android: {
          defaultConfig: {versionCode: '12', versionName: '1.2', applicationId: 'com.example'}
        },
        repositories: [
          {type: 'maven', data: {url: 'https://example.com/repo'}},
          {type: 'unknown', data: {name: 'google()'}}
        ],
        dependencies: [
          {group: '', name: 'deps.foo', version: '', type: 'implementation', excludes: []},
          {group: 'a', name: 'b', version: '1', type: 'implementation', excludes: []},
          {group: 'c', name: 'd', version: '2', type: 'implementation', excludes: [{group: 'x', module: 'y'}]}
        ],
        plugins: [{id: 'com.android.application'}],
        url: 'https://example.com/a//b'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });
    // TODO: Add test for ...
  });
  describe('(file parsing)', function() {
    it('should be able to parse the small sample gradle file', function() {
      var sampleFilePath = 'test/sample-data/small.build.gradle';
      var expected = {
        testblock: {
          key1: 'value1',
          key2: 'value2',
          nestedKey: {
            key3: 'value3',
            key4: 'value4',
            key5: {
              key6: 'value6'
            }
          }
        },
        testblock2: {key1: 'value1', key2: 'value2'},
        testblock3: 'not really'
      };
      return parser.parseFile(sampleFilePath).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('should be able to parse the muzei gradle file', function() {
      var sampleFilePath = 'test/sample-data/muzei.build.gradle';
      var expected = require(process.cwd() + '/test/sample-data/muzei.build.gradle.expected.js').expected;

      return parser.parseFile(sampleFilePath).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('should be able to parse the ivy gradle file', function() {
      var sampleFilePath = 'test/sample-data/ivy.build.gradle';
      var expected = require(process.cwd() + '/test/sample-data/ivy.build.gradle.expected.js').expected;

      return parser.parseFile(sampleFilePath).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('should be able to parse files larger than a single stream chunk', function(t) {
      var content = 'first "value"\nandroid {\n  key "value"\n}\n';
      for (var i = 0; i < 10000; i++) {
        content += 'key' + i + ' "value"\n';
      }
      content += 'last "value"\n';

      return parseTemporaryFile(t, content).then(function(parsedValue) {
        assert.strictEqual(Object.keys(parsedValue).length, 10003);
        assert.strictEqual(parsedValue.first, 'value');
        assert.deepStrictEqual(parsedValue.android, {key: 'value'});
        assert.strictEqual(parsedValue.last, 'value');
      });
    });

    it('will keep non-ASCII characters intact across stream chunks', function(t) {
      // Places the first byte of the two-byte å at the very end of the first 64 KiB chunk
      var content = 'key "' + 'a'.repeat(65536 - 'key "'.length - 1) + 'å"\nlast "value"\n';

      return parseTemporaryFile(t, content).then(function(parsedValue) {
        assert.strictEqual(parsedValue.key.slice(-2), 'aå');
        assert.strictEqual(parsedValue.last, 'value');
      });
    });

    // Output snapshots, not a statement of correctness: some of these values are plainly wrong, but consumers see them.
    // The Expo files come from expo/expo@dfb069d9cc5b, the React Native one from react-native-community/template@4f3db581f9ba.
    ['expo.app', 'expo.root', 'react-native.app', 'special.dependencies'].forEach(function(name) {
      it('should keep its output for the ' + name + ' gradle file', function() {
        var sampleFilePath = 'test/sample-data/' + name + '.build.gradle';
        var expected = require(process.cwd() + '/' + sampleFilePath + '.expected.js').expected;

        return parser.parseFile(sampleFilePath).then(function(parsedValue) {
          assert.deepStrictEqual(parsedValue, expected);
        });
      });
    });

    it('should be able to parse the testCompile with multiline gradle file', function() {
      var sampleFilePath = 'test/sample-data/test.compile.build.gradle';
      var expected = require(process.cwd() + '/test/sample-data/test.compile.build.gradle.expected.js').expected;

      return parser.parseFile(sampleFilePath).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });
  });
});
