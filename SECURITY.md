# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately: open the [Security tab](https://github.com/ninetwozero/gradle-to-js/security) and click **Report a vulnerability**. Please don't open a public issue for it.

Only the latest release gets security fixes.

## What isn't a vulnerability

`parseFile(path)` and the CLI read whichever file they're given. That's their job, the same as `fs.readFile`. The code that calls them decides which paths are safe to read, so "it can read `/etc/passwd`" isn't treated as a vulnerability in this package.
