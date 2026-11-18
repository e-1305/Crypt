# Works with your stack

CRYPT can raise a creature from a scanner file you already have. The file is read on your machine. CRYPT makes no OSV call for an import. Ranking uses the local KEV and EPSS feeds, the same as for a lockfile.

```
npx crypt exhume --from <sarif|dependabot|trivy|grype|snyk> <file> [--feeds data/feeds] [--out out/creature.json]
```

Then `crypt raise` and `crypt play` work as usual.

| Tool | Make the file | Import it |
| --- | --- | --- |
| SARIF 2.1.0 | any scanner that writes SARIF, for example `trivy fs . -f sarif -o results.sarif` | `npx crypt exhume --from sarif results.sarif` |
| GitHub Dependabot alerts | `gh api repos/OWNER/REPO/dependabot/alerts --paginate > alerts.json` | `npx crypt exhume --from dependabot alerts.json` |
| Trivy | `trivy fs . -f json -o trivy.json` (add `--list-all-pkgs` to include clean packages) | `npx crypt exhume --from trivy trivy.json` |
| Grype | `grype dir:. -o json > grype.json` | `npx crypt exhume --from grype grype.json` |
| Snyk | `snyk test --json > snyk.json` | `npx crypt exhume --from snyk snyk.json` |

## What is read

- Package ecosystem, name, version, and the vulnerability ids with their CVE and GHSA aliases. Only npm and PyPI packages are modelled.
- SARIF is not package oriented. CRYPT reads `properties.purl`, `packageName` and `packageVersion`, or the `Package:` and `Installed Version:` lines that Trivy writes into the message.
- Dependabot alerts carry no installed version, so every Dependabot limb is Unknown. Alerts with state `fixed` are skipped.
- Findings of one package and version are merged into one limb. The order of the findings in the file does not matter.

## Safety notes

- **Ranking is deterministic.** KEV decides first, then EPSS. The severity written by the tool is shown as `vendorSeverity` and is never used to rank or to set a state.
- **Unknown stays Unknown.** A finding with no name, no version, an unparsable purl, an unsupported ecosystem (for example Go) or a vulnerability entry without an id is marked Unknown. It is never Healthy.
- **Bad input changes nothing.** Invalid JSON, a file of another format, or a file without packages stops with an error, and no creature.json is written.
- **Nothing is run.** The file is parsed as data. The import makes no network call.
- **Owners.** Imported limbs show "no owner yet". The file name is the manifest.


## Works in your team workflow

Three outputs already exist for the people who do not play the game: the GitHub Action job summary, a Slack digest and a Teams digest. CSV and JSON export for spreadsheets ships in the scan result (since [#157](https://github.com/e-1305/Crypt/pull/157)).

All payloads and numbers below are **SAMPLE DATA** (the built-in sample, repository `e-1305/crypt-demo`). They are not a customer report.

### GitHub Action job summary

The Action in report mode (`mode: report`, see [INSTALL-ACTION.md](INSTALL-ACTION.md)) writes this to the job summary. It reads only the checked-out repository and never writes to it. The funnel is the noise funnel: findings, how many were exorcised as noise, and the monsters left to fight.

```markdown
## CRYPT report

| Findings | Exorcised | Monsters |
| --- | --- | --- |
| 12 | 9 | 3 |

12 findings, 9 exorcised as noise, 3 monsters left to fight.

(the creature plate, in a code block)

creature.json and autopsy.html are in the workflow artifact. Report mode never writes to the repository.
```

SAMPLE DATA: the three counts above are an example. If any finding is unresolved or unknown, the step fails with `## CRYPT action FAILED (report)` instead of showing a clean result.

### Slack and Teams digest (`crypt gazette`)

`crypt gazette` prints the weekly digest as JSON. It posts only with `--send`. Try it with the built-in sample, which needs no raid:

```
npx crypt gazette --sample                  # Slack payload (default)
npx crypt gazette --sample --format teams   # Teams Adaptive Card payload
```

Slack payload (SAMPLE DATA, output of `crypt gazette --sample`):

```json
{
  "text": "Gravedigger's Gazette",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "Gravedigger's Gazette",
        "emoji": false
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Nights without possession*\n0"
        },
        {
          "type": "mrkdwn",
          "text": "*Healed this week*\n2"
        },
        {
          "type": "mrkdwn",
          "text": "*Newly possessed*\n0"
        },
        {
          "type": "mrkdwn",
          "text": "*SLA at risk*\n1"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Healed*\n• `jquery` healed by `@e-1305`\n• `minimist` healed by `@e-1305`"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Newly possessed*\nNone this week."
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*SLA at risk*\n• `handlebars`"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Crypt report for `e-1305/crypt-demo`"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "Open the War Room",
            "emoji": false
          },
          "url": "https://e-1305.github.io/Crypt/"
        }
      ]
    }
  ]
}
```

Teams payload (SAMPLE DATA, output of `crypt gazette --sample --format teams`):

```json
{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "contentUrl": null,
      "content": {
        "type": "AdaptiveCard",
        "version": "1.4",
        "body": [
          {
            "type": "TextBlock",
            "text": "Gravedigger's Gazette",
            "wrap": true,
            "size": "Large",
            "weight": "Bolder"
          },
          {
            "type": "FactSet",
            "facts": [
              {
                "title": "Nights without possession",
                "value": "0"
              },
              {
                "title": "Healed this week",
                "value": "2"
              },
              {
                "title": "Newly possessed",
                "value": "0"
              },
              {
                "title": "SLA at risk",
                "value": "1"
              }
            ]
          },
          {
            "type": "TextBlock",
            "text": "**Healed**",
            "wrap": true,
            "separator": true
          },
          {
            "type": "TextBlock",
            "text": "- jquery healed by @e\\-1305\n- minimist healed by @e\\-1305",
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": "**Newly possessed**",
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": "None this week.",
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": "**SLA at risk**",
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": "- handlebars",
            "wrap": true
          },
          {
            "type": "TextBlock",
            "text": "Crypt report for e\\-1305/crypt\\-demo",
            "wrap": true,
            "isSubtle": true,
            "size": "Small"
          }
        ],
        "actions": [
          {
            "type": "Action.OpenUrl",
            "title": "Open the War Room",
            "url": "https://e-1305.github.io/Crypt/"
          }
        ]
      }
    }
  ]
}
```

To send the digest of your own raid, put the webhook URL in an environment variable and pass the variable name. The URL is never printed.

```
export SLACK_WEBHOOK_URL=<your incoming webhook URL>
npx crypt gazette --send --webhook-env SLACK_WEBHOOK_URL

export TEAMS_WEBHOOK_URL=<your Teams workflow webhook URL>
npx crypt gazette --send --webhook-env TEAMS_WEBHOOK_URL
```

- Without `--send` the payload is only printed (the default, same as `--dry-run`).
- `--send` posts real data, so it cannot be combined with `--sample` or `--dry-run`.
- The format follows the variable name. Use `--format slack` or `--format teams` to set it yourself.
- `--war-room <url>` sets the https link of the "Open the War Room" button.
- Names appear only in praise ("healed by"), never in failure.
