# CRYPT in 200 words

Every app is a Frankenstein, stitched together from strangers' code. Somewhere in your lockfile is a package with a known vulnerability, and you find out when a scanner prints a list of two hundred lines that nobody reads.

CRYPT turns that list into a creature. Each dependency is a limb. Limbs with known vulnerabilities rot, and limbs that attackers are exploiting right now (CISA KEV) are possessed. You heal them by playing a text adventure that runs on the Z-machine, the virtual machine Infocom shipped in 1979. Type `GRAFT JQUERY` and CRYPT writes the fix as a pull request.

The guarantee is simple. CRYPT has no merge call. `SEAL CRYPT` blocks every graft. By default a graft is a dry run that writes a file and sends nothing. A person reviews and lands every pull request, and only then does the limb heal.

CRYPT is the last mile and complements Dependabot, Snyk and Socket: exploited first, a named owner, one fix pull request, and a person merges. [Competitors](COMPETITORS.md).

Kiro shaped the work: specs before code, binding steering files, hooks on each save, and two custom agents.

Open the page, or from a checkout run one command:

```
npm ci && npx --no-install crypt raid fixtures/vulnerable-npm --offline
```

Live demo: https://e-1305.github.io/Crypt/ (npm and pip lockfiles only).
