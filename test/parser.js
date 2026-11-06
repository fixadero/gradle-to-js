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

    it('will keep the line after a comment with nothing in it', function() {
      // Written out line by line, so that the whitespace after the `//`s stays put
      var dsl = [
        'android {',
        '  defaultConfig {',
        '    applicationId "com.example"',
        '    //',
        '    versionCode 7',
        '    // ',
        '    versionName "1.0"',
        '    //\t',
        '',
        '    minSdkVersion 21',
        '    //',
        '  }',
        '}',
        'repositories {',
        '  //',
        '  google()',
        '}',
        'dependencies {',
        '  //',
        '  implementation "a:b:1"',
        '}',
        'after "value"',
        '//'
      ].join('\n');

      var expected = {
        android: {
          defaultConfig: {applicationId: 'com.example', versionCode: '7', versionName: '1.0', minSdkVersion: '21'}
        },
        repositories: [{type: 'unknown', data: {name: 'google()'}}],
        dependencies: [{group: 'a', name: 'b', version: '1', type: 'implementation', excludes: []}],
        after: 'value'
      };
      return Promise.all([
        parser.parseText(dsl),
        parser.parseText(dsl.replace(/\n/g, '\r\n'))
      ]).then(function(parsedValues) {
        assert.deepStrictEqual(parsedValues[0], expected);
        assert.deepStrictEqual(parsedValues[1], expected);
      });
    });

    it('will keep what comes right after a block comment', function() {
      var dsl = stripIndent(`
        android {
          /**/
          namespace "com.example"
          /* */
          compileSdk 34
          /*
          */
          defaultConfig {
            /* the id */applicationId "com.example"
            versionCode 7
          /* end */}
        }
        dependencies {
          /*/ still a comment */
          implementation "a:b:1"
          /* end */}
        after "value"
      `);

      var expected = {
        android: {
          namespace: 'com.example',
          compileSdk: '34',
          defaultConfig: {applicationId: 'com.example', versionCode: '7'}
        },
        dependencies: [{group: 'a', name: 'b', version: '1', type: 'implementation', excludes: []}],
        after: 'value'
      };
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

    it('should collect declarations with a type or modifier instead of def as regular variables', function() {
      var dsl = stripIndent(`
             final a = "1"
             String b = "2"
             final String c = "3"
             int d = 4
             java.io.File e = file("e")
             List<String> f = ["f"]
             static final int[] g = [7]
             def h
             final String i // set later
             private void addAuthority(String path) {
               println path
             }
             minSdk = 21
             versionName "1.0"
             flag x == y
             `);

      var expected = {
        a: '1',
        b: '2',
        c: '3',
        d: '4',
        e: 'file("e")',
        f: ['f'],
        g: ['7'],
        minSdk: '21',
        versionName: '1.0',
        flag: 'x == y'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('will leave variables declared among dependencies out of them', function() {
      var dsl = stripIndent(`
             dependencies {
               def okHttpVersion = '3.4.1'
               String retrofitVersion = '2.1.0'
               final String mockito = 'org.mockito:mockito-core:1.9.5'
               implementation "com.squareup.okhttp3:okhttp:$okHttpVersion"
             }
             `);

      var expected = {
        dependencies: [
          {group: 'com.squareup.okhttp3', name: 'okhttp', version: '$okHttpVersion', type: 'implementation', excludes: []}
        ]
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

    it('can parse blocks that open and close on the same line', function() {
      var dsl = stripIndent(`
        android {
          buildFeatures { compose true }
          kotlinOptions { jvmTarget = "17" }
          namespace "com.example"
        }
        repositories {
          maven { url 'https://www.jitpack.io' }
          mavenCentral()
        }
        allprojects { repositories { google() } }
        buildscript { dependencies { classpath 'a:b:1' } }
        plugins { id 'java' }
        dependencies { implementation 'c:d:2' }
        after "value"
      `);

      var expected = {
        android: {
          buildFeatures: {compose: true},
          kotlinOptions: {jvmTarget: '17'},
          namespace: 'com.example'
        },
        repositories: [
          {type: 'maven', data: {url: 'https://www.jitpack.io'}},
          {type: 'unknown', data: {name: 'mavenCentral()'}}
        ],
        allprojects: {repositories: [{type: 'unknown', data: {name: 'google()'}}]},
        buildscript: {dependencies: [{group: 'a', name: 'b', version: '1', type: 'classpath', excludes: []}]},
        plugins: [{id: 'java'}],
        dependencies: [{group: 'c', name: 'd', version: '2', type: 'implementation', excludes: []}],
        after: 'value'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can parse blocks without a space before their brace', function() {
      var dsl = stripIndent(`
        android{
          defaultConfig{
            minSdk 21
          }
          compileSdk 34
        }
        repositories{
          maven{ url 'https://www.jitpack.io' }
          google()
        }
        dependencies{
          implementation 'a:b:1'
        }
        plugins{ id 'java' }
        if (flag) {
          skipped "value"
        }else{
          kept "value"
        }
        after "value"
      `);

      var expected = {
        android: {
          defaultConfig: {minSdk: '21'},
          compileSdk: '34'
        },
        repositories: [
          {type: 'maven', data: {url: 'https://www.jitpack.io'}},
          {type: 'unknown', data: {name: 'google()'}}
        ],
        dependencies: [{group: 'a', name: 'b', version: '1', type: 'implementation', excludes: []}],
        plugins: [{id: 'java'}],
        // The same as for `} else {`
        '': {kept: 'value'},
        after: 'value'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('will keep nested blocks inside a dependency together', function() {
      var dsl = stripIndent(`
        dependencies {
          implementation('a:b:1') { version { strictly '1' } }
          implementation 'c:d:2'
        }
        after "value"
      `);

      var expected = {
        dependencies: [
          {group: 'a', name: 'b', version: '1', type: 'implementation', excludes: []},
          {group: 'c', name: 'd', version: '2', type: 'implementation', excludes: []}
        ],
        after: 'value'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can parse dependency versions that use variables', function() {
      var dsl = stripIndent(`
        dependencies {
          classpath "com.android.tools.build:gradle:\${versions.android_gradle_plugin}"
          classpath "org.jetbrains.kotlin:kotlin-gradle-plugin:$kotlin_version"
          implementation("com.facebook.fresco:animated-gif:\${expoLibs.versions.fresco.get()}")
          implementation "com.example:lib:\${findProperty('libVersion') ?: '1.0'}"
        }
      `);

      var expected = {
        dependencies: [
          {group: 'com.android.tools.build', name: 'gradle', version: '${versions.android_gradle_plugin}', type: 'classpath', excludes: []},
          {group: 'org.jetbrains.kotlin', name: 'kotlin-gradle-plugin', version: '$kotlin_version', type: 'classpath', excludes: []},
          {group: 'com.facebook.fresco', name: 'animated-gif', version: '${expoLibs.versions.fresco.get()}', type: 'implementation', excludes: []},
          {group: 'com.example', name: 'lib', version: '${findProperty(\'libVersion\') ?: \'1.0\'}', type: 'implementation', excludes: []}
        ]
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('will add up repeated dependencies, repositories and plugins blocks', function() {
      var dsl = stripIndent(`
        plugins {
          id 'com.android.application'
        }
        repositories {
          google()
        }
        dependencies {
          implementation 'a:b:1'
        }
        key "value"
        plugins {
          id 'kotlin-android'
        }
        repositories {
          mavenCentral()
        }
        dependencies {
          implementation 'c:d:2'
        }
      `);

      var expected = {
        plugins: [{id: 'com.android.application'}, {id: 'kotlin-android'}],
        repositories: [
          {type: 'unknown', data: {name: 'google()'}},
          {type: 'unknown', data: {name: 'mavenCentral()'}}
        ],
        dependencies: [
          {group: 'a', name: 'b', version: '1', type: 'implementation', excludes: []},
          {group: 'c', name: 'd', version: '2', type: 'implementation', excludes: []}
        ],
        key: 'value'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can parse empty strings', function() {
      var dsl = stripIndent(`
        key ""
        key2 ''
        block {
          key3 ""
        }
        list ["", "a"]
      `);

      var expected = {key: '', key2: '', block: {key3: ''}, list: ['', 'a']};
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can parse plugins from a version catalog', function() {
      var dsl = stripIndent(`
        plugins {
          alias(libs.plugins.android.application)
          alias(libs.plugins.kotlin.android) apply false
          alias libs.plugins.compose.compiler
          id 'org.jetbrains.kotlin.android' version '2.0.0'
        }
      `);

      var expected = {
        plugins: [
          {alias: 'libs.plugins.android.application'},
          {alias: 'libs.plugins.kotlin.android'},
          {alias: 'libs.plugins.compose.compiler'},
          {id: 'org.jetbrains.kotlin.android', version: '2.0.0'}
        ]
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('will keep braces inside strings as part of the value', function() {
      var dsl = stripIndent(`
        android {
          defaultConfig {
            versionName "\${major}.\${minor}"
            versionCode 3
          }
          namespace "com.example"
        }
        repositories {
          maven { url "https://example.com/\${repo}" }
        }
        closing "}"
        after "value"
      `);

      var expected = {
        android: {
          defaultConfig: {versionName: '${major}.${minor}', versionCode: '3'},
          namespace: 'com.example'
        },
        repositories: [{type: 'maven', data: {url: 'https://example.com/${repo}'}}],
        closing: '}',
        after: 'value'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('will keep every repository of the same type, in file order', function() {
      var dsl = stripIndent(`
        repositories {
          google()
          maven {
            url 'https://a.example'
          }
          mavenCentral()
          maven { url 'https://b.example' }
          maven {
            url 'https://c.example'
            credentials {
              username 'user'
            }
          }
        }
      `);

      var expected = {
        repositories: [
          {type: 'unknown', data: {name: 'google()'}},
          {type: 'maven', data: {url: 'https://a.example'}},
          {type: 'unknown', data: {name: 'mavenCentral()'}},
          {type: 'maven', data: {url: 'https://b.example'}},
          {type: 'maven', data: {url: 'https://c.example', credentials: {username: 'user'}}}
        ]
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can parse strings that carry on over several lines', function() {
      var dsl = stripIndent(`
        proguard {
          keepclassmembers 'class * { \\
              public <init>(...); \\
          }'
          dontwarn 'x'
        }
        json """{
          "version": "\${version}"
        }"""
        description '''first line
        second line // not a comment'''
        after "value"
      `);

      var expected = {
        proguard: {
          keepclassmembers: 'class * { \\\n      public <init>(...); \\\n  }',
          dontwarn: 'x'
        },
        json: '{\n  "version": "${version}"\n}',
        description: 'first line\nsecond line // not a comment',
        after: 'value'
      };
      return Promise.all([parser.parseText(dsl), parser.parseText(dsl.replace(/\n/g, '\r\n'))]).then(function(parsedValues) {
        assert.deepStrictEqual(parsedValues[0], expected);
        // With Windows line breaks the strings keep their \r, but everything around them still parses the same
        assert.strictEqual(parsedValues[1].proguard.dontwarn, 'x');
        assert.strictEqual(parsedValues[1].description, 'first line\r\nsecond line // not a comment');
        assert.strictEqual(parsedValues[1].after, 'value');
      });
    });

    it('can parse calls that carry on over several lines', function() {
      // The tasks come from #13
      var dsl = stripIndent(`
        def coverageTaskAndroidJob = task("coverageTaskAndroidJob",
                dependsOn: ':android-job:createCovAndroidTestCoverageReport') {
            group = "Coverage"
            description 'Runs coverage for android-job'
        }
        def coverageTaskVolley = task("coverageTaskVolley",
                dependsOn: ':volley:createCovCoverageReport') {
            group = "Coverage"
            description 'Runs coverage for volley'
        }
        android {
          namespace computeNamespace("com.example", // the base
              flavor)
          versionCode = (major * 100 +
              minor)
        }
        def match = text =~ /v\\(\\d+/
        name "a(b"
        broken {
          value foo(
          key "1"
        }
        after "value"
      `);

      var expected = {
        coverageTaskAndroidJob: {group: 'Coverage', description: 'Runs coverage for android-job'},
        coverageTaskVolley: {group: 'Coverage', description: 'Runs coverage for volley'},
        android: {
          namespace: 'computeNamespace("com.example",\n      flavor)',
          versionCode: '(major * 100 +\n      minor)'
        },
        // A parenthesis in a /slashy/ regex or a string doesn't carry the value on to the next line
        match: 'text =~ /v\\(\\d+/',
        name: 'a(b',
        // One that's never closed stops at the end of its block
        broken: {value: 'foo(\n  key "1"'},
        after: 'value'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can parse dependencies that carry on over several lines or declare several at once', function() {
      // The runtime dependencies come from #17, which took them from Gradle's documentation
      var dsl = stripIndent(`
        dependencies {
          runtime group: 'org.springframework', name: 'spring-core', version: '2.5'
          runtime 'org.springframework:spring-core:2.5',
                  'org.springframework:spring-aop:2.5'
          runtime(
              [group: 'org.springframework', name: 'spring-core', version: '2.5'],
              [group: 'org.springframework', name: 'spring-aop', version: '2.5']
          )
          runtime('org.hibernate:hibernate:3.0.5') {
            transitive = true
          }
          runtime group: 'org.hibernate', name: 'hibernate', version: '3.0.5', transitive: true
          runtime(group: 'org.hibernate', name: 'hibernate', version: '3.0.5') {
            transitive = true
          }
          testImplementation libraries.junit, // the runner
                  libraries.truth
          testCompile(['junit:junit:4.12', 'org.hamcrest:hamcrest:2.2'])
          implementation(
              libs.foo
          )
        }
        after "value"
      `);

      function dependency(type, group, name, version) {
        return {group: group, name: name, version: version, type: type, excludes: []};
      }
      var expected = {
        dependencies: [
          dependency('runtime', 'org.springframework', 'spring-core', '2.5'),
          dependency('runtime', 'org.springframework', 'spring-core', '2.5'),
          dependency('runtime', 'org.springframework', 'spring-aop', '2.5'),
          dependency('runtime', 'org.springframework', 'spring-core', '2.5'),
          dependency('runtime', 'org.springframework', 'spring-aop', '2.5'),
          dependency('runtime', 'org.hibernate', 'hibernate', '3.0.5'),
          {
            group: 'org.hibernate', name: 'hibernate', version: '3.0.5', transitive: 'true', type: 'runtime',
            excludes: []
          },
          dependency('runtime', 'org.hibernate', 'hibernate', '3.0.5'),
          dependency('testImplementation', '', 'libraries.junit', ''),
          dependency('testImplementation', '', 'libraries.truth', ''),
          dependency('testCompile', 'junit', 'junit', '4.12'),
          dependency('testCompile', 'org.hamcrest', 'hamcrest', '2.2'),
          dependency('implementation', '', 'libs.foo', '')
        ],
        after: 'value'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('will read the block of a dependency, wherever it is', function() {
      var dsl = stripIndent(`
        dependencies {
          androidTestImplementation deps.espresso, {
            exclude group: 'com.android.support', module: 'support-annotations'
          }
          implementation('a:b:1', {
            exclude group: 'c'
          })
          implementation(libs.bar) {
            exclude group: 'd'
          }
        }
      `);

      var expected = {
        dependencies: [
          {
            group: '', name: 'deps.espresso', version: '', type: 'androidTestImplementation',
            excludes: [{group: 'com.android.support', module: 'support-annotations'}]
          },
          {group: 'a', name: 'b', version: '1', type: 'implementation', excludes: [{group: 'c'}]},
          {group: '', name: 'libs.bar', version: '', type: 'implementation', excludes: [{group: 'd'}]}
        ]
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can parse project dependencies with a deep path', function() {
      var dsl = stripIndent(`
        dependencies {
          implementation project(':features:home:ui')
          implementation(project(":core:data:local"))
        }
      `);

      var expected = {
        dependencies: [
          {group: '', name: 'project(\':features:home:ui\')', version: '', type: 'implementation', excludes: []},
          {group: '', name: 'project(":core:data:local")', version: '', type: 'implementation', excludes: []}
        ]
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can parse dependencies without a version', function() {
      var dsl = stripIndent(`
        dependencies {
          classpath('com.android.tools.build:gradle')
          implementation "com.facebook.react:react-android"
          implementation platform('androidx.compose:compose-bom:2024.09.00')
          implementation 'androidx.compose.ui:ui'
          implementation('com.google.firebase:firebase-analytics') {
            exclude group: 'x', module: 'y'
          }
          implementation project('sub:lib')
        }
      `);

      var expected = {
        dependencies: [
          {group: 'com.android.tools.build', name: 'gradle', version: '', type: 'classpath', excludes: []},
          {group: 'com.facebook.react', name: 'react-android', version: '', type: 'implementation', excludes: []},
          {group: 'androidx.compose', name: 'compose-bom', version: '2024.09.00', type: 'implementation', excludes: []},
          {group: 'androidx.compose.ui', name: 'ui', version: '', type: 'implementation', excludes: []},
          {group: 'com.google.firebase', name: 'firebase-analytics', version: '', type: 'implementation', excludes: [{group: 'x', module: 'y'}]},
          {group: '', name: 'project(\'sub:lib\')', version: '', type: 'implementation', excludes: []}
        ]
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('will add up the dependencies of repeated blocks around them', function() {
      var dsl = stripIndent(`
        buildscript {
          repositories {
            google()
          }
          dependencies {
            classpath 'a:b:1'
          }
        }
        android {
          defaultConfig {
            versionCode 1
          }
        }
        buildscript {
          repositories {
            mavenCentral()
          }
          dependencies {
            classpath 'c:d:2'
          }
        }
        android {
          defaultConfig {
            versionCode 2
            versionName "2.0"
          }
        }
      `);

      var expected = {
        buildscript: {
          repositories: [
            {type: 'unknown', data: {name: 'google()'}},
            {type: 'unknown', data: {name: 'mavenCentral()'}}
          ],
          dependencies: [
            {group: 'a', name: 'b', version: '1', type: 'classpath', excludes: []},
            {group: 'c', name: 'd', version: '2', type: 'classpath', excludes: []}
          ]
        },
        android: {defaultConfig: {versionCode: '2', versionName: '2.0'}}
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('will read the dependencies in every branch of an if', function() {
      var dsl = stripIndent(`
        dependencies {
          implementation 'a:b:1'
          if (isGifEnabled) {
            implementation("com.facebook.fresco:animated-gif:\${frescoVersion}")
          }
          if (isWebpEnabled) {
            implementation 'c:d:2'
            if (isWebpAnimatedEnabled) {
              implementation 'e:f:3'
            }
          }
          if (hermesEnabled.toBoolean()) {
            implementation("com.facebook.react:hermes-android")
          } else if (findProperty('x') == ')') {
            implementation 'g:h:4'
          } else {
            implementation jscFlavor
          }
          if (debug) implementation 'i:j:5'
          if(a){ implementation 'k:l:6' }else{ implementation 'm:n:7' }
          implementation 'o:p:8'
        }
        after "value"
      `);

      function dependency(group, name, version) {
        return {group: group, name: name, version: version, type: 'implementation', excludes: []};
      }
      var expected = {
        dependencies: [
          dependency('a', 'b', '1'),
          dependency('com.facebook.fresco', 'animated-gif', '${frescoVersion}'),
          dependency('c', 'd', '2'),
          dependency('e', 'f', '3'),
          dependency('com.facebook.react', 'hermes-android', ''),
          dependency('g', 'h', '4'),
          dependency('', 'jscFlavor', ''),
          dependency('i', 'j', '5'),
          dependency('k', 'l', '6'),
          dependency('m', 'n', '7'),
          dependency('o', 'p', '8')
        ],
        after: 'value'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can parse lists with comments, nested brackets and commas in strings', function() {
      var dsl = stripIndent(`
        project.ext.react = [
            enableHermes: true,  // clean and rebuild if changing
            // hermesFlagsRelease: ["-w", "-O", "-output-source-map"],
            /* bundleInDebug: false, */
            bundleInRelease: true,
            deleteDebugFilesForVariant: { // https://github.com/facebook/react-native/issues/33177
                def v -> v.name.toLowerCase().contains('release')
            },
        ]
        nested [["a", "b"], ["c"]]
        strings ["a, b", 'c]', "d // e"]
        calls [file('a', 'b'), 'c']
        empty []
        after "value"
      `);

      var expected = {
        'project.ext.react': {
          enableHermes: true,
          bundleInRelease: true,
          deleteDebugFilesForVariant: '{\n        def v -> v.name.toLowerCase().contains(\'release\')\n    }'
        },
        nested: [['a', 'b'], ['c']],
        strings: ['a, b', 'c]', 'd // e'],
        calls: ['file(\'a\', \'b\')', 'c'],
        empty: [],
        after: 'value'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
      });
    });

    it('can parse maps, nested or not, and keep everything else in a list as text', function() {
      var dsl = stripIndent(`
        ext.versions = [kotlin: '2.0.0', 'agp': "8.5.0", "compose bom": '2024.09.00']
        ext.deps = [
          kotlin: [
            stdlib: [common: "org.jetbrains.kotlin:kotlin-stdlib-common:$kotlin_version", jdk: 'x'],
          ],
          flags: [true, "false", 'yes'],
        ]
        manifestPlaceholders = [appAuthRedirectScheme: 'com.example', __proto__: 'not a prototype']
        emptyMap = [:]
        mixed [a: 1, 'b']
        ternaries [flag ? 'x' : 'y', 'z']
        coordinates ['a:b:1', "c:d:2"]
        after "value"
      `);

      var expected = {
        'ext.versions': {kotlin: '2.0.0', agp: '8.5.0', 'compose bom': '2024.09.00'},
        'ext.deps': {
          kotlin: {stdlib: {common: 'org.jetbrains.kotlin:kotlin-stdlib-common:$kotlin_version', jdk: 'x'}},
          flags: [true, false, 'yes']
        },
        manifestPlaceholders: JSON.parse('{"appAuthRedirectScheme": "com.example", "__proto__": "not a prototype"}'),
        emptyMap: {},
        mixed: ['a: 1', 'b'],
        ternaries: ['flag ? \'x\' : \'y\'', 'z'],
        coordinates: ['a:b:1', 'c:d:2'],
        after: 'value'
      };
      return parser.parseText(dsl).then(function(parsedValue) {
        assert.deepStrictEqual(parsedValue, expected);
        assert.strictEqual(Object.getPrototypeOf(parsedValue.manifestPlaceholders), Object.prototype);
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

    it('will reject with the file system error when it cannot read the file', function() {
      var missingFilePath = path.join(os.tmpdir(), 'gradle-to-js-does-not-exist', 'build.gradle');

      return assert.rejects(parser.parseFile(missingFilePath), function(error) {
        assert.ok(error instanceof Error);
        assert.strictEqual(error.code, 'ENOENT');
        return true;
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
    ['expo.app', 'expo.root', 'react-native.app', 'special.dependencies', 'test.compile'].forEach(function(name) {
      it('should keep its output for the ' + name + ' gradle file', function() {
        var sampleFilePath = 'test/sample-data/' + name + '.build.gradle';
        var expected = require(process.cwd() + '/' + sampleFilePath + '.expected.js').expected;

        return parser.parseFile(sampleFilePath).then(function(parsedValue) {
          assert.deepStrictEqual(parsedValue, expected);
        });
      });
    });
  });
});
