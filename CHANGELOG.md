# Changelog

## 2.0.2

- Parser failures now reject the promise instead of crashing the host process ([#45](https://github.com/ninetwozero/gradle-to-js/issues/45))
- An unbalanced `project(...)` and a key named `hasOwnProperty` now parse like any other line
- `parseFile` no longer drops everything but the last part of files over 64 KB
- Non-ASCII characters are no longer mangled
- Plugin versions can contain a `+`, like `3.2.+` ([#44](https://github.com/ninetwozero/gradle-to-js/pull/44), thanks @mrbusche)
- A dependency or plugin written without a space before its parenthesis, like `implementation("a:b:1")` or `id('com.android.application')`, no longer swallows the line after it ([#32](https://github.com/ninetwozero/gradle-to-js/issues/32), [#29](https://github.com/ninetwozero/gradle-to-js/issues/29))
- Comments after a value are no longer part of it: `versionCode 12 // bump me` now gives `'12'`
- Blocks that open and close on the same line keep their contents: `buildFeatures { compose true }` and `maven { url '…' }` no longer come back empty, and `plugins { id 'java' }` no longer swallows the rest of the file
- Dependency versions that use variables, like `"…:kotlin-gradle-plugin:$kotlin_version"` or `"…:gradle:${versions.agp}"`, now come back split into group, name and version ([#42](https://github.com/ninetwozero/gradle-to-js/issues/42))
- A second `dependencies`, `repositories` or `plugins` block in the same place now adds to the first one instead of replacing it
- `parseFile` now rejects with the original file system error, an `Error` with a `code` like `ENOENT`, instead of the string `"Error parsing stream: …"`. If you matched on that text, check `error.code` instead
- The CLI exits with code 1 and a one-line message on errors, instead of exiting 0 or printing a stack trace, and takes exactly one path
- Empty strings come back as `''` instead of keeping their quotes (`'""'`)
- Plugins from a version catalog, like `alias(libs.plugins.android.application)`, come back as `{alias: 'libs.plugins.android.application'}` instead of `{id: '.application'}`
- A dependency with nested braces, like `api('a:b') { version { strictly '1' } }` or Expo's `if (…) { … } else { … }`, no longer ends the `dependencies` block early and pushes the rest of it to the top level
- Braces inside strings are part of the value: `versionName "${major}.${minor}"` now gives `'${major}.${minor}'` instead of `{}` and a stray `""` key
- Several repositories of the same type, like two `maven { url … }` blocks, now all come back in file order, instead of being merged into the last one
- Strings that carry on over several lines, either `"""triple-quoted"""` or with a `\` at the end of the line, come back whole instead of their later lines turning into junk keys
- Project dependencies with a deep path, like `project(':features:home:ui')`, are no longer read as group `features`, name `home` and version `ui`
- Dependencies without a version, like `'com.android.tools.build:gradle'` or `"com.facebook.react:react-android"`, now come back split into group and name with an empty version, instead of the whole quoted string as the name
