#!/usr/bin/env node
'use strict';

var parser = require('./lib/parser');
var args = process.argv.slice(2);

if (args.length !== 1) {
  console.error('Usage: gradle-to-js <path to build.gradle>');
  process.exitCode = 1;
} else {
  parser.parseFile(args[0]).then(function(parsedValue) {
    console.log(JSON.stringify(parsedValue, null, 2));
  }, function(error) {
    console.error('gradle-to-js: ' + (error instanceof Error ? error.message : error));
    process.exitCode = 1;
  });
}
