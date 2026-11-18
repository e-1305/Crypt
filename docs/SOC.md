# CRYPT for the SOC: OCSF alerts

`crypt alerts --format ocsf` turns `out/creature.json` into [OCSF](https://schema.ocsf.io/1.3.0/classes/vulnerability_finding) Vulnerability Finding events (class_uid 2002, category_uid 2, OCSF 1.3.0). It reads and writes local files only. It makes no network call.

```sh
crypt raid <target>
crypt alerts --format ocsf --out out/alerts.ocsf.json
```

## What it emits

A JSON array with one event per spawned limb (a Possessed limb, or a Rotting limb with EPSS >= 0.1). Each event holds:

| Data | Where |
| --- | --- |
| CVE ids | `vulnerabilities[0].related_cves`, first one in `cve.uid` |
| KEV flag | `vulnerabilities[0].is_exploit_available`, `unmapped.kev` |
| EPSS | `vulnerabilities[0].cve.epss.score`, `unmapped.epss` |
| Severity | `severity_id`, `severity` (a KEV limb is at least High) |
| Package name, version, fixed version | `vulnerabilities[0].affected_packages[0]` (`fixed_in_version` only when known) |
| Owner | `unmapped.owner`: the CODEOWNERS team, or `unowned` |
| SLA | `unmapped.sla_policy` and `unmapped.sla_deadline` per `.kiro/steering/sla-policy.md`: KEV 48h, EPSS >= 0.1 this sprint (14 days), others backlog (deadline `null`) |

The SLA deadline counts from the time the command runs.

## Safety

- If `out/creature.json` is missing, unreadable, or has a field the command does not know, it writes nothing and exits non-zero.
- Owners come from CODEOWNERS only. Events never contain a commit author or a person's name.

## SAMPLE event (SAMPLE DATA from fixture `tests/fixtures/soc/creature.json`)

```json
{
  "activity_id": 1,
  "activity_name": "Create",
  "category_uid": 2,
  "category_name": "Findings",
  "class_uid": 2002,
  "class_name": "Vulnerability Finding",
  "type_uid": 200201,
  "time": 1793610000000,
  "severity_id": 5,
  "severity": "Critical",
  "status": "New",
  "status_id": 1,
  "message": "lodash@4.17.15 is possessed. Owner: @acme/platform.",
  "metadata": {
    "version": "1.3.0",
    "product": {
      "name": "CRYPT",
      "vendor_name": "e-1305"
    }
  },
  "finding_info": {
    "uid": "crypt:acme/widgets:npm:lodash@4.17.15",
    "title": "Possessed dependency lodash@4.17.15",
    "types": [
      "Vulnerability"
    ]
  },
  "vulnerabilities": [
    {
      "cve": {
        "uid": "CVE-2019-10744",
        "epss": {
          "score": "0.9"
        }
      },
      "related_cves": [
        "CVE-2019-10744",
        "CVE-2020-8203"
      ],
      "severity": "Critical",
      "is_exploit_available": true,
      "is_fix_available": true,
      "affected_packages": [
        {
          "name": "lodash",
          "version": "4.17.15",
          "type": "npm",
          "fixed_in_version": "4.17.21"
        }
      ]
    }
  ],
  "resources": [
    {
      "type": "Package",
      "name": "lodash",
      "owner": {
        "name": "@acme/platform"
      }
    }
  ],
  "unmapped": {
    "cve_ids": [
      "CVE-2019-10744",
      "CVE-2020-8203"
    ],
    "kev": true,
    "epss": 0.9,
    "crypt_state": "Possessed",
    "owner": "@acme/platform",
    "sla_policy": "48h",
    "sla_deadline": "2026-11-04T09:00:00.000Z",
    "repo": "acme/widgets"
  }
}
```

## Ingest

The file is a JSON array. Split it into one event per line (NDJSON) first where the target needs that: `jq -c '.[]' out/alerts.ocsf.json > alerts.ndjson`.

- **Amazon Security Lake.** Security Lake stores OCSF natively. Add a custom source with the OCSF class "Vulnerability Finding", write the events as Parquet to the source's S3 prefix (an AWS Glue job or a small script converts the NDJSON), and subscribers query them in Athena. See [Custom sources in Security Lake](https://docs.aws.amazon.com/security-lake/latest/userguide/custom-sources.html).
- **Splunk.** Send the NDJSON to an HTTP Event Collector (HEC) token with sourcetype `ocsf:vulnerability_finding`. Search `class_uid=2002` and alert on `unmapped.sla_deadline`. The Splunk Add-on for OCSF can map the fields to CIM. See [Set up and use HEC](https://docs.splunk.com/Documentation/Splunk/latest/Data/UsetheHTTPEventCollector).
- **Microsoft Sentinel.** Create a custom table with a Data Collection Rule and send the NDJSON through the [Logs Ingestion API](https://learn.microsoft.com/azure/azure-monitor/logs/logs-ingestion-api-overview). Write analytics rules over the table (for example `unmapped_sla_policy == "48h"`).

Schema reference: [OCSF Vulnerability Finding 1.3.0](https://schema.ocsf.io/1.3.0/classes/vulnerability_finding).
