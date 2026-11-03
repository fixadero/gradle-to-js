'use strict';
var assert = require('node:assert');
var childProcess = require('node:child_process');
var os = require('node:os');
var path = require('node:path');
var test = require('node:test');
var describe = test.describe;
var it = test.it;

var parser = require('../lib/parser');

var cliPath = path.join(__dirname, '..', 'cli.js');

function runCli(args) {
  return childProcess.spawnSync(process.execPath, [cliPath].concat(args), {encoding: 'utf8'});
}

describe('Command line tool', function() {
  it('prints the parsed file as JSON', function() {
    var sampleFilePath = path.join(__dirname, 'sample-data', 'small.build.gradle');
    var result = runCli([sampleFilePath]);

    assert.strictEqual(result.status, 0);
    assert.strictEqual(result.stderr, '');
    return parser.parseFile(sampleFilePath).then(function(parsedValue) {
      assert.deepStrictEqual(JSON.parse(result.stdout), parsedValue);
    });
  });

  it('shows how to use it and fails when not given exactly one path', function() {
    [[], ['first.gradle', 'second.gradle']].forEach(function(args) {
      var result = runCli(args);

      assert.strictEqual(result.status, 1);
      assert.strictEqual(result.stdout, '');
      assert.match(result.stderr, /^Usage: gradle-to-js /);
    });
  });

  it('fails with a one-line message when it cannot read the file', function() {
    var missingFilePath = path.join(os.tmpdir(), 'gradle-to-js-does-not-exist', 'build.gradle');

    [missingFilePath, __dirname].forEach(function(filePath) {
      var result = runCli([filePath]);

      assert.strictEqual(result.status, 1);
      assert.strictEqual(result.stdout, '');
      assert.match(result.stderr, /^gradle-to-js: E[A-Z]+: [^\n]*\n$/);
    });
  });
});
