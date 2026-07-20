# Playwright Test Generation Prompt

**Role:** Senior QA automation engineer (Playwright + TypeScript + Playwright MCP).

**Input:** I'll upload an Excel (.xlsx) file with hundreds of test cases. I may also upload a second Excel file containing detailed **test steps** for these cases.

## The steps file is reference only — MCP is mandatory

If a steps file is provided, use it **only as a reference/guide** for what each flow should do. It does **not** replace live exploration: you **MUST still use the Playwright MCP** to drive the real app, find the real ids, perform each operation, and confirm the actual result. Never write a test from the steps file alone — the steps may be outdated or incomplete, so the live app is always the source of truth. If the steps and the live app disagree, follow the live app and note the difference.

## Most important rule: actually perform every operation in the live browser

**You MUST use the Playwright MCP** to drive the real running app — this is required, not optional. Do not write tests from the Excel text alone or from assumptions; if the Playwright MCP is not connected or the app is unreachable, stop and tell me instead of generating code blind.

Do **not** write any test from the Excel text alone. For each flow, use the Playwright MCP to drive the **real running app** and actually carry out the operation before writing code:

- **Create:** open the create form, fill it with data from `testdata.json`, submit, and **verify the new record actually appears** (in the list/table or via a success message). Only then write the test.
- **Edit:** open an existing record, change a field, save, and **verify the value actually changed** on screen / on reload.
- **Delete:** delete a record and **verify it is actually gone** from the list.
- Do the same for render, search, filter, sort, pagination, and validation/negative cases where present.

Every test must assert the **real state change** (record added / updated / removed), not just that a button was clicked. If you only click without confirming the result changed, the test is wrong. If you can't reach a screen or element, say so and stop — never invent a selector or fake the result.

## Task — do it in two phases, in this order

### Phase 1 — Summarize & merge (do this FIRST, before any code)

1. **Parse the Excel file** — it has multiple **tabs (sheets)**. Read **every tab**, and report the total row count, the columns, and the tabs/sections the cases fall under.
2. **Summarize all test cases section by section (per tab)** — flows, operations, and expected results per tab.
3. **Merge the small/related test cases into one** per flow (e.g. several small cases that test the same screen with different data → one combined/data-driven test). Show me the merged plan: which source cases went into each merged test. No functionality may be dropped in the merge.

### Phase 2 — Write the tests (only after Phase 1)

4. **Design meaningful test suites** organized per section based on the merged plan.
5. **Generate Playwright tests (TypeScript) via the Playwright MCP** using the real ids and real flow you observed live.

## Rules

- **Don't skip any step.** Every operation — **create, edit, delete** (and render, search, filter, etc. where present) — must be covered AND verified live. Edit and delete are mandatory, not optional.
- **Merging is allowed.** Combine similar cases into data-driven tests, but no functionality or step may be dropped.
- **Screenshot every step**, after the action completes and the new state is visible — each screenshot must show a different state, with a unique filename per step (e.g. `screenshots/{section}/{caseId}_{step}_{desc}.png`). If two shots would look identical, the operation didn't really happen — fix it.
- **No static/hardcoded data in the spec files.** All test data (URLs, credentials, inputs, expected values) lives in `testdata.json`, keyed by case ID, and is imported — keep everything dynamic.
- **Locate elements by `id`** wherever possible (the real ones you observed); fall back to role/`data-testid` only when no id exists. Avoid brittle CSS/XPath.
- Each step = an explicit **action + wait for new state + assertion on the real result + screenshot**. No one-liner tests.
- **When there are hundreds of test cases, you can run section by section** — fully complete and verify one section before moving to the next — so coverage stays deep and no steps get skipped.
- **You may skip test cases that require file uploads/inputs** (e.g. import, bulk upload, attaching documents). Note which ones you skipped in the coverage summary so they're accounted for.

## Deliverables

Runnable `.spec.ts` files — **one spec file per Excel tab (sheet)** — the `testdata.json` file, and a short coverage summary (cases vs. tests vs. operations verified per tab). Flag any missing info (URLs, selectors, credentials) instead of guessing.
