# CRYPT in 200 words

Every app is a Frankenstein, stitched together from strangers' code. Scanners find its weak parts; nobody owns them. Across 20 popular projects, 95.2% of findings were noise and 84.7% of dependencies had no owner.

CRYPT turns that list into a creature. Each dependency is a limb. Limbs with known vulnerabilities rot, and limbs that attackers are exploiting right now (CISA KEV) are possessed. You heal them by playing a text adventure that runs on the Z-machine, the virtual machine Infocom shipped in 1979. Type `GRAFT JQUERY` and CRYPT writes the fix as a pull request.

The guarantee is simple. CRYPT has no merge call. `SEAL CRYPT` blocks every graft. By default a graft is a dry run that writes a file and sends nothing. A person reviews and lands every pull request, and only then does the limb heal.

CRYPT works alongside Dependabot, Snyk or Socket: it does the last mile, not detection. Kiro shaped the work: specs before code, steering that binds every change, hooks, and two custom agents.

Open the page, or from a checkout of this repository run one command:

```
npm ci && npx --no-install crypt raid fixtures/vulnerable-npm --offline
```

Live demo: https://e-1305.github.io/Crypt/ (npm and pip lockfiles only).
