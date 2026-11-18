# CRYPT for a SOC

An actively exploited vulnerability (in the CISA KEV catalogue) sitting in production code is a SOC concern, not only a developer one. CRYPT gives you its findings in two forms a SOC already works with: standard events for your SIEM, and a ticket queue.

## 1. OCSF events for your SIEM

From an empty folder (Node 20 or later). State goes to `out/` in the current folder; nothing is written elsewhere.

```bash
mkdir crypt-soc && cd crypt-soc
npx @e-1305/crypt raid https://github.com/e-1305/crypt-demo </dev/null
npx @e-1305/crypt alerts --format ocsf
```

`</dev/null` keeps the raid non-interactive: it digs up the dependencies, writes `out/creature.json`, plays the story to its end on empty input and exits 0. The first command clones the repository and asks OSV, CISA KEV and FIRST EPSS, so it needs network access. The second command writes `out/alerts.ocsf.json`.

Without a raid, `exhume` alone is enough, because `alerts` reads only `out/creature.json`:

```bash
npx @e-1305/crypt exhume <dir> && npx @e-1305/crypt alerts --format ocsf
```

To try it with no network at all, use the fixture bundled in the package (answers come from the shipped cache):

```bash
npx @e-1305/crypt exhume <path-to-package>/fixtures/vulnerable-npm --offline
npx @e-1305/crypt alerts --format ocsf
```

`out/alerts.ocsf.json` holds one **OCSF 1.1 Vulnerability Finding** (`class_uid` 2002, category Findings) per limb that spawned, most urgent first. Schema: https://schema.ocsf.io/1.1.0/classes/vulnerability_finding

| OCSF field | What CRYPT puts there |
|---|---|
| `finding_info.uid` | `crypt:<ecosystem>:<package>@<version>`, stable across runs |
| `vulnerabilities[].cve.uid` | every CVE on that locked version |
| `vulnerabilities[].is_exploit_available` | `true` when the CVE is in CISA KEV |
| `vulnerabilities[].affected_packages` | package name, locked version, ecosystem |
| `severity_id` | from the advisory severity; `0 Unknown` when there is none (never guessed) |
| `unmapped.kev`, `unmapped.epss` | KEV flag and FIRST EPSS score |
| `unmapped.sla`, `unmapped.sla_deadline` | `48 hours` for KEV (with the deadline), `this sprint` for EPSS ≥ 0.1, else `backlog` |
| `unmapped.owner_team` | the team from `CODEOWNERS`, or `no owner`. Never a person. |

Where it goes:
- **Amazon Security Lake**: Security Lake stores data in OCSF. Add CRYPT as a custom source and write the events into its S3 location (one object per run).
- **Splunk**: send the file to an HTTP Event Collector, or monitor the file with a forwarder, `sourcetype=ocsf:vulnerability_finding`.
- **Microsoft Sentinel**: ingest with the Logs Ingestion API into a custom table, then map `class_uid = 2002` rows in your analytics rules.

`alerts` makes no network call. If `out/creature.json` is missing or invalid it writes nothing and exits non-zero (fail-safe: no events is not the same as no findings).

### Sample event (SAMPLE DATA, the e-1305/crypt-demo repo)

```json
{
  "class_uid": 2002,
  "class_name": "Vulnerability Finding",
  "category_uid": 2,
  "activity_id": 1,
  "type_uid": 200201,
  "severity_id": 3,
  "severity": "Medium",
  "status": "New",
  "time": 1795003200000,
  "metadata": { "version": "1.1.0", "product": { "name": "CRYPT", "vendor_name": "e-1305", "version": "0.1.0" } },
  "finding_info": {
    "uid": "crypt:npm:jquery@3.4.1",
    "title": "Actively exploited (CISA KEV) dependency: jquery 3.4.1",
    "types": ["Dependency"]
  },
  "vulnerabilities": [
    { "cve": { "uid": "CVE-2020-11023" }, "is_exploit_available": true, "severity": "Medium",
      "affected_packages": [{ "name": "jquery", "version": "3.4.1", "type": "npm" }] }
  ],
  "unmapped": { "kev": true, "epss": 0.85, "sla": "48 hours", "sla_deadline": "2026-11-20T12:00:00.000Z", "owner_team": "no owner" }
}
```

## 2. A queue: one GitHub issue per KEV limb

```bash
crypt alerts --format issues                                  # dry run: prints the issues
GITHUB_TOKEN=... crypt alerts --format issues --live --repo owner/name
```

One issue per Possessed (KEV) limb, titled `[CRYPT] KEV: <package> <version>`, with the CVEs, the owning team, the 48-hour deadline and the graft command. It never opens the same title twice, at most 5 per run, and never merges anything. The GitHub Action takes `alerts: issues` for the same behaviour in CI.

## What this is not

CRYPT reads lockfiles. A finding means the locked version has a known advisory, not that the vulnerable code is reachable or running. It does not replace runtime detection, EDR or your vulnerability scanner of record; it routes the dependency findings that matter (KEV first) to an owner and a ticket.
