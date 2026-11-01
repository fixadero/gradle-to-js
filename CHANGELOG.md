# Changelog

## 2.0.2

- Parser failures now reject the promise instead of crashing the host process ([#45](https://github.com/ninetwozero/gradle-to-js/issues/45))
- An unbalanced `project(...)` and a key named `hasOwnProperty` now parse like any other line
- `parseFile` no longer drops everything but the last part of files over 64 KB
- Non-ASCII characters are no longer mangled
- Plugin versions can contain a `+`, like `3.2.+` ([#44](https://github.com/ninetwozero/gradle-to-js/pull/44), thanks @mrbusche)
