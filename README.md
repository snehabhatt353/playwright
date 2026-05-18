# PlaywrightDemo — ThreatModeler E2E Tests

Playwright tests for the ThreatModeler web app at `https://tmdev.threatmodeler.us`.

## Tests

| Test | Description |
| --- | --- |
| `creates a new blank threat model with required fields` | Logs in, opens the Create dialog, fills Name + Version, creates the model, asserts redirect to the diagram editor. |
| `edits an existing threat model's version and persists the change` | Creates a TM, returns to the list, expands inline details, bumps Version to `2.0`, asserts the row reflects the new version. |
| `archives (deletes) a threat model and it appears in Archived` | Creates a TM, selects the row, archives via the Threat Model menu, confirms removal from active list and presence in Archived. |
| `Create New Model is disabled when Name is empty` | Negative validation — Create button stays disabled when Name is blank. |

## Setup

```bash
npm install
npx playwright install chromium
```

## Run

Credentials default to a developer account inside the spec file. Override via env vars:

```bash
# bash
TM_USER=<username> TM_PASS=<password> npx playwright test

# PowerShell
$env:TM_USER="<username>"; $env:TM_PASS="<password>"; npx playwright test
```

Common variants:

```bash
npx playwright test                                       # all tests
npx playwright test -g "creates a new blank"              # one test by title
npx playwright test --headed                              # watch the browser
npx playwright test --ui                                  # interactive runner
npx playwright show-report                                # open last HTML report
```

## Artifacts

- `screenshots/<test>/<NN>-<step>.png` — per-step full-page screenshots
- `playwright-report/` — HTML report with embedded screenshots (open via `npx playwright show-report`)
- `test-results/` — traces and end-of-test screenshots
