# gradle-to-js

[![NPM Version](https://img.shields.io/npm/v/gradle-to-js.svg)](https://www.npmjs.com/package/gradle-to-js)
[![Build Status][1]][2]

## What's this `gradle-to-js` thing?

gradle-to-js is a quick & dirty Gradle build file to JavaScript object parser. It is quick & dirty in the sense that it doesn't give you an exact replica of whatever the build file represents during runtime, as evaluations and similar bits are (currently) too much of a hassle to accurately represent while parsing.

Only the Groovy DSL is supported. Kotlin DSL files (`build.gradle.kts`) are a different language, and may look like they parse while dependencies go missing.

## Installation

Simply run the following command to include it into your project:

```sh
npm install gradle-to-js --save
```

## Usage

### As a module

Using `gradle-to-js` as a module, you can parse both strings and files as seen below.

#### Files

```js
var g2js = require('gradle-to-js/lib/parser');
g2js.parseFile('path/to/buildfile').then(function(representation) {
  console.log(representation);
});
```

`parseFile` reads whatever path you give it, just like `fs.readFile`. It doesn't look at the file name or extension. If the path comes from user input, check it yourself before calling `parseFile`, for example by making sure it points inside the directory you expect.

#### Strings

```js
var g2js = require('gradle-to-js/lib/parser');
g2js.parseText('key "value"').then(function(representation) {
  console.log(representation);
});
```

The promise will eventually resolve an object matching the build file structure and values.

### Using the CLI

You can also use the module directly from the CLI, and get a json representation out of it. Nifty ey? Currently only supporting files from this direction.

```bash
./cli.js test/sample-data/small.build.gradle
```

```json
{
  "testblock": {
    "key1": "value1",
    "key2": "value2",
    "nestedKey": {
      "key3": "value3",
      "key4": "value4",
      "key5": {
        "key6": "value6"
      }
    }
  },
  "testblock2": {
    "key1": "value1",
    "key2": "value2"
  },
  "testblock3": "not really"
}
```

## Author

[Karl Lindmark](https://www.github.com/karllindmark)

## License

Apache 2.0

[1]: https://github.com/ninetwozero/gradle-to-js/actions/workflows/ci.yml/badge.svg
[2]: https://github.com/ninetwozero/gradle-to-js/actions
