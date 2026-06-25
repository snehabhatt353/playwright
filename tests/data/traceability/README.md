# Access Management Traceability

Source xlsx: `testcases_excel/threatmodeler_7.x (11).xlsx` — 710 cases across
9 modules under the Access Management suite. The export ships only
`ID/Title/Type/Section/Priority` columns (Preconditions/Steps/Data/
Expected are blank), so intent is inferred from each title.

## Files in this directory

| File | Purpose |
|---|---|
| `parsed_cases.json` | Raw xlsx parse, grouped by module with operation tags |
| `access_management.json` | Full plan: every C-ID → {module, describe, testName, runnable, fixtureNeeded} |
| `TRACEABILITY.md` | Human-readable C-ID → spec file → test name table (one row per C-ID) |
| `README.md` | This file |

## How to regenerate

```bash
node scripts/build_traceability.js   # rebuilds access_management.json
node scripts/generate_specs.js       # rewrites tests/access_management_*.spec.ts
node -e "..." > TRACEABILITY.md      # see commit history for the inline script
```

## Coverage strategy

Every C-ID lands in a `test()` title (often merged with siblings that share
the same module + operation). Tests are split into two buckets:

- **Runnable**: the merged test asserts the page-level surface relevant to
  the merged C-IDs (tab activation, column shape, search input acceptance).
- **Fixture-dependent (test.fixme)**: the merged test is declared with the
  same C-ID list in its title but uses `test.fixme()` with a documented
  fixture need. The test appears in the Playwright HTML report as
  expected-to-fail rather than a silent skip, and the C-IDs remain
  auditable.

The five fixture needs that gate the 532 fixme tests:

| Fixture | Used by | Cases | What it would require |
|---|---|---|---|
| `multi-user-role-login` | Permission matrix | 454 | One test user per role (Enterprise/Department × Administrator/Manager/Auditor/Contributor × All/RW/RO) |
| `csv-upload-fixture` | Bulk import | 24 | Valid/invalid CSV fixtures for User and User+Group templates |
| `contributor-role-login` | Contributor module | 18 | Test user with Contributor role at Enterprise + Department scopes |
| `department-group-seed` | Default group | 14 | A fresh Department + Group pair the suite can mutate |
| `download-handler` | Export Users | 11 | Playwright download fixtures + CSV/Excel parse |
| `destructive-write-on-shared-tenant` | Users/Groups | 11 | Either a dedicated tenant or row-level cleanup that survives parallel runs |

## Spec file map

| Module | Spec file | C-IDs |
|---|---|---|
| Access Management (UTF-8) | `tests/access_management_utf8.spec.ts` | 12 |
| Groups | `tests/access_management_groups.spec.ts` | 32 |
| Departments | `tests/access_management_departments.spec.ts` | 80 |
| Users | `tests/access_management_users.spec.ts` | 65 |
| Export Users | `tests/access_management_export_users.spec.ts` | 11 |
| Bulk Add user | `tests/access_management_bulk_import.spec.ts` | 24 |
| Permission matrix | `tests/access_management_permissions.spec.ts` | 454 |
| Contributor | `tests/access_management_contributor.spec.ts` | 18 |
| Default group | `tests/access_management_default_group.spec.ts` | 14 |
| Page chrome smoke | `tests/access_management.spec.ts` | 7 anchor cases (overlap) |
| **Total** | | **710** |
