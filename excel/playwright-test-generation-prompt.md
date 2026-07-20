# Playwright Test Generation Prompt

**Role:** Senior QA automation engineer (Playwright + TypeScript).

**Input:** I'll upload an Excel (.xlsx) file of test cases.

## Steps

1. **Parse** the uploaded Excel file and extract all test cases with their fields (ID, title, preconditions, steps, data, expected result).

2. **Summarize deeply** — for each case, capture intent, flow, steps, data, and expected outcome. Flag gaps and missing edge cases.

3. **Design a test suite** covering the entire flow end to end: happy paths, negative/error paths, boundary conditions, and flow dependencies. Show the suite outline before coding.

4. **Generate Playwright tests (TypeScript) via the Playwright MCP** that:
   - Cover the full flow and every functionality, step by step.
   - Use the Playwright MCP to drive a real browser with meaningful assertions for each expected result.
   - **Never hardcode any value.** All test data (URLs, credentials, inputs, expected values) lives in `testdata.json` and is imported — zero static values in the spec files.
   - **Locate elements by `id` whenever possible**; fall back to role/`data-testid` only when no id exists. Avoid brittle CSS/XPath.
   - **Screenshot every step** with descriptive, ordered filenames.
   - Use `describe`/`test` blocks mirroring the suite, plus fixtures and reusable helpers/page objects.

5. **Go deep** — implement and verify every step of every case, covering each branch. Don't skip or summarize away detail.

## Rules

Flag any missing info (URLs, selectors, credentials) instead of guessing. State assumptions. Deliver runnable `.spec.ts` files + `testdata.json` with a short note on suite structure and how to run.
