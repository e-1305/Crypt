---
inclusion: always
---
# Paste your repo flow

- npm only: read `package-lock.json` of a public GitHub repo. Other lockfiles stop with a typed error.
- Network: raw.githubusercontent.com and OSV only. No other host, no token, no server.
- Fail safe: any error, outage or rate limit shows a message and draws no creature. Unchecked packages stay Rotting (unknown), never Healthy.
- Dry run only: PR payloads are labelled dry run with the `raid <repo> --live` command, capped at five. Nothing is sent.
- Owners come from CODEOWNERS only, per blameless.md. The browser uses the same ranking code as the CLI.
