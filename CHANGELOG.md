# Changelog

## 3.0.1

### Fixes

- A comment line with nothing after the `//` no longer swallows the next line that has something on it: a bare `//` right above `versionCode 7` used to drop the `versionCode`. The same goes for a `//` followed only by spaces or tabs
- A block comment at the start of a line no longer swallows the character after its `*/`, so `/* … */}` closes its block. An empty one, like `/**/` or `/* */`, no longer swallows everything up to the next `*/` or the end of the file
- Values with a call or parentheses that carry on over several lines come back whole, instead of being cut off at the first line break and their later lines turning into junk keys ([#13](https://github.com/fixadero/gradle-to-js/issues/13)). `def coverage = task("coverage",` followed by `dependsOn: 'x') { … }` now gives `coverage` the block, like it does when the call fits on one line
- Dependencies that carry on over several lines come back whole ([#17](https://github.com/fixadero/gradle-to-js/issues/17)). That's a call that isn't closed on its first line, like `testCompile(` with its dependencies on the lines below, or a line that ends with a comma, like `runtime 'a:b:1',` followed by `'c:d:2'`. Their later lines used to come back as dependencies of their own, with a type like `'org'` or `'com'`
- A dependency item can declare several dependencies, and each one comes back on its own: `runtime 'a:b:1', 'c:d:2'`, `testCompile(['a:b:1', 'c:d:2'])` and `runtime([group: 'a', …], [group: 'c', …])` all give two. Only the first one used to come back, or a junk one for the list of maps
- A map notation in parentheses followed by a block, like `compile(group: 'g', name: 'n', version: '1') { exclude … }`, gives `group: 'g'` instead of `'': 'g'`
- A dependency like `implementation(libs.foo) { exclude … }` gives the name `libs.foo` instead of `.foo`
- The block of a dependency written as its last argument, like `implementation 'a:b:1', { exclude … }` or `implementation('a:b:1', { exclude … })`, gives its excludes, and doesn't end up in the name

## 3.0.0

Most of this release fixes values that 2.x parsed wrong or dropped, so the output changes for many build files. If you snapshot the output or work around the old results, check them against 3.0.0.

### Breaking changes

- **`parseFile` rejects with an `Error`.** It used to reject with the string `"Error parsing stream: …"`. It now rejects with Node's own error, with a `code` like `ENOENT`, so check `error.code` or `error.message` instead of the text
- **The CLI exits with code 1 on errors and takes exactly one path.** It used to exit 0 when given no path, print a stack trace for a missing file, and glue several arguments together into one path
- **Maps come back as objects.** `manifestPlaceholders = [scheme: 'com.example']` gives `{scheme: 'com.example'}` instead of `["scheme: 'com.example'"]`. Lists inside lists come back as lists, and `true` and `false` inside both come back as booleans
- **Each repository is its own entry.** Two `maven { url … }` blocks give two entries, in file order. They used to be merged into one with the last URL, so `repositories.find(r => r.type === 'maven')` now finds the first one
- **Repeated blocks are merged differently.** When a block like `buildscript { … }` appears twice, the `dependencies`, `repositories` and `plugins` in both copies add up, and any other list in the second copy replaces the first copy's. Lists used to be laid over each other entry by entry
- **`if`/`else` inside `dependencies` counts every branch.** The parser can't tell which branch Gradle takes, so you get the dependencies from all of them: Expo's and React Native's files list both `hermes-android` and `jscFlavor`. You used to get one junk entry with type `'if'`
- **Some dependencies are split differently** (see the fixes below): versions that are variables, dependencies without a version, and project paths with three or more parts. If you matched on the old `name` text, match on `group` and `name` instead

### Fixes

- Parser failures now reject the promise instead of crashing the host process ([#45](https://github.com/fixadero/gradle-to-js/issues/45))
- An unbalanced `project(...)` and a key named `hasOwnProperty` now parse like any other line
- `parseFile` no longer drops everything but the last part of files over 64 KB
- Non-ASCII characters are no longer mangled
- Plugin versions can contain a `+`, like `3.2.+` ([#44](https://github.com/fixadero/gradle-to-js/pull/44), thanks @mrbusche)
- A dependency or plugin written without a space before its parenthesis, like `implementation("a:b:1")` or `id('com.android.application')`, no longer swallows the line after it ([#32](https://github.com/fixadero/gradle-to-js/issues/32), [#29](https://github.com/fixadero/gradle-to-js/issues/29))
- Comments after a value are no longer part of it: `versionCode 12 // bump me` now gives `'12'`
- Blocks that open and close on the same line keep their contents: `buildFeatures { compose true }` and `maven { url '…' }` no longer come back empty, and `plugins { id 'java' }` no longer swallows the rest of the file
- Dependency versions that use variables, like `"…:kotlin-gradle-plugin:$kotlin_version"` or `"…:gradle:${versions.agp}"`, now come back split into group, name and version ([#42](https://github.com/fixadero/gradle-to-js/issues/42))
- A second `dependencies`, `repositories` or `plugins` block in the same place now adds to the first one instead of replacing it
- Empty strings come back as `''` instead of keeping their quotes (`'""'`)
- Plugins from a version catalog, like `alias(libs.plugins.android.application)`, come back as `{alias: 'libs.plugins.android.application'}` instead of `{id: '.application'}`
- A dependency with nested braces, like `api('a:b') { version { strictly '1' } }` or Expo's `if (…) { … } else { … }`, no longer ends the `dependencies` block early and pushes the rest of it to the top level
- Braces inside strings are part of the value: `versionName "${major}.${minor}"` now gives `'${major}.${minor}'` instead of `{}` and a stray `""` key
- Strings that carry on over several lines, either `"""triple-quoted"""` or with a `\` at the end of the line, come back whole instead of their later lines turning into junk keys
- Project dependencies with a deep path, like `project(':features:home:ui')`, are no longer read as group `features`, name `home` and version `ui`
- Dependencies without a version, like `'com.android.tools.build:gradle'` or `"com.facebook.react:react-android"`, now come back split into group and name with an empty version, instead of the whole quoted string as the name
- Lists with comments, nested lists or commas inside strings now parse correctly. Comments are left out, nested lists stay whole, and everything after the list is still there ([#39](https://github.com/fixadero/gradle-to-js/issues/39)). A trailing comma or an empty list no longer adds a `''` item

### Other changes

- gradle-to-js no longer depends on `lodash.merge`, or on any other package
