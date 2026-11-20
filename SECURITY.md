# Security policy

## Reporting a vulnerability in CRYPT

Use GitHub private vulnerability reporting on this repository: open [Security > Report a vulnerability](https://github.com/e-1305/Crypt/security/advisories/new) on [e-1305/Crypt](https://github.com/e-1305/Crypt). Please do not open a public issue for a vulnerability.

Include the CRYPT version (`crypt --version`), the command you ran, and what you saw.

## What to expect

CRYPT is maintained by one person in their spare time. Replies and fixes are best effort. There is no response-time guarantee, no SLA and no support contract. The maintainer will acknowledge a report when able and will say in the advisory what was fixed and in which version.

## Supported versions

| Version | Supported |
|---|---|
| 0.2.x | Yes |
| 0.1.x and older | No. Upgrade to 0.2.x. |

## Scope

This policy covers the CRYPT code in this repository: the CLI, the GitHub Action, the static demo site, the paste-your-repo flow (the browser fetches a public repo's lockfile and CODEOWNERS) and the War Room, including its optional GitHub token field. For the assets, trust boundaries and hostile-input cases, see [docs/THREAT-MODEL.md](docs/THREAT-MODEL.md). For what CRYPT reads, stores and sends, see [docs/SECURITY-REVIEW.md](docs/SECURITY-REVIEW.md). A vulnerability in a dependency that CRYPT reports on belongs to that project.
