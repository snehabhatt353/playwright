// Plans a Playwright test for every C-ID in the Access Management xlsx and
// writes tests/data/traceability/access_management.json. Each entry carries:
//   { id, module, slug, operation, planTestName, runnable, fixtureNeeded? }
// Every C-ID is included -- never dropped. Cases that need multi-user
// role fixtures, CSV file fixtures, or downloads are marked runnable=false
// with a fixtureNeeded reason; their test() still gets created in the
// spec, but with test.skip().
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");

const XLSX_PATH = "testcases_excel/threatmodeler_7.x (11).xlsx";
const OUT = "tests/data/traceability/access_management.json";

const wb = xlsx.readFile(XLSX_PATH);
const rows = xlsx.utils.sheet_to_json(wb.Sheets["Worksheet"], { defval: "" });

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// ---- Operation inference (kept simple; the planner uses both this and
// the role inference below to choose the test bucket). ----
function tagOp(title) {
  const t = (title || "").toLowerCase();
  if (/check if it shows all functionalities|panel.+ui|with correct ui|navigates to/.test(t)) return "render";
  if (/click on new|create.+with|verify.+creation|add user|add group|add department|add (a )?new|bulk add/.test(t)) return "create";
  if (/edit|update|modify|rename|change/.test(t)) return "edit";
  if (/delete|remove/.test(t)) return "delete";
  if (/deactivate|reactivate|activate|disable|enable|status/.test(t)) return "status_change";
  if (/search|filter|search.+work/.test(t)) return "search";
  if (/sort/.test(t)) return "sort";
  if (/pagination|page size|next page/.test(t)) return "pagination";
  if (/export|download|csv|excel|template/.test(t)) return "export_import";
  if (/import|upload|drag and drop|drag.+drop/.test(t)) return "import";
  if (/permission|role|access|see|cannot|can not|should not|able to|read[- ]only|admin|auditor|manager|contributor/.test(t)) return "permission";
  if (/valid|invalid|special character|min |max |limit|empty|required|duplicate|case sensitive|utf|special|character/.test(t)) return "validation";
  if (/profile|info page/.test(t)) return "view";
  if (/cancel|close.*\(x\)|click.+x/.test(t)) return "cancel_dialog";
  if (/dropdown|list/.test(t)) return "dropdown";
  if (/checkbox|toggle/.test(t)) return "toggle";
  if (/count|number of/.test(t)) return "count";
  if (/default group/.test(t)) return "default_group";
  if (/license/.test(t)) return "license";
  return "other";
}

// ---- Role inference for the permission matrix (454 cases) ----
function inferRole(title) {
  const t = (title || "").toLowerCase();
  // Look for "{level} > {role} > {scope}" patterns, single-quoted or
  // double-double-quoted (TestRail mangles quotes during export).
  const roleMatch =
    title.match(/[""']{1,2}([A-Z][a-zA-Z ]+) ?> ?([A-Z][a-zA-Z ]+) ?> ?([A-Z][a-zA-Z ]+)[""']{1,2}/) ||
    title.match(/(Enterprise|Department) ?> ?([A-Z][a-zA-Z ]+) ?> ?([A-Z][a-zA-Z ]+)/);
  if (roleMatch) {
    return slug(`${roleMatch[1]}_${roleMatch[2]}_${roleMatch[3]}`);
  }
  if (/enterprise.+administrator.+all/.test(t)) return "enterprise_administrator_all";
  if (/enterprise.+auditor.+read only/.test(t)) return "enterprise_auditor_read_only";
  if (/enterprise.+manager.+read.*write/.test(t)) return "enterprise_manager_read_write";
  if (/enterprise.+manager.+read only/.test(t)) return "enterprise_manager_read_only";
  if (/department.+administrator/.test(t)) return "department_administrator";
  if (/department.+manager.+read.*write/.test(t)) return "department_manager_read_write";
  if (/department.+manager.+read only/.test(t)) return "department_manager_read_only";
  if (/department.+auditor/.test(t)) return "department_auditor";
  if (/super admin/.test(t)) return "super_admin";
  if (/contributor/.test(t)) return "contributor";
  return "unknown_role";
}

// ---- Fixture-need classification ----
// Any case that requires multi-user role login, CSV file uploads, or
// downloads is marked runnable=false. We still create a test() so the
// C-ID lives in code; the body is test.skip() with a documented reason.
function classifyRunnable(section, title) {
  const t = (title || "").toLowerCase();
  if (section === "Access Management Permission") {
    // 454 cases enumerate per-role behavior. We CAN verify the matrix
    // configuration UI (role exists in /user-management Roles tab) but
    // not the user's experience without logging in as that role.
    return { runnable: false, fixtureNeeded: "multi-user-role-login" };
  }
  if (section === "Contributor") {
    return { runnable: false, fixtureNeeded: "contributor-role-login" };
  }
  if (section === "Access Management>Export Users") {
    return { runnable: false, fixtureNeeded: "download-handler" };
  }
  if (section === "Bulk Add user to multiple groups") {
    return { runnable: false, fixtureNeeded: "csv-upload-fixture" };
  }
  if (section === "Default group") {
    // Needs entity-CRUD seed (a department + group). Defer.
    return { runnable: false, fixtureNeeded: "department-group-seed" };
  }
  // Users / Departments / Groups CRUD cases: most are runnable read-only
  // but some require destructive actions. Mark destructive-write
  // operations as runnable=false on a shared tenant to avoid pollution.
  if (/^(delete|remove)/.test(t) || /delete.+user/.test(t) || /delete.+group/.test(t) || /delete.+department/.test(t)) {
    return { runnable: false, fixtureNeeded: "destructive-write-on-shared-tenant" };
  }
  if (/deactivate|reactivate/.test(t)) {
    return { runnable: false, fixtureNeeded: "destructive-write-on-shared-tenant" };
  }
  if (/reset password/.test(t)) {
    return { runnable: false, fixtureNeeded: "destructive-write-on-shared-tenant" };
  }
  return { runnable: true };
}

// ---- Plan a test name for each case ----
function planTestName(row) {
  const op = tagOp(row.Title);
  const sec = (row.Section || "").trim();
  if (sec === "Access Management Permission") {
    const role = inferRole(row.Title);
    return { describe: `permissions/${role}`, name: `Role ${role} - ${row.ID}` };
  }
  if (sec === "Contributor") {
    return { describe: "contributor", name: `Contributor - ${row.ID}` };
  }
  if (sec === "Access Management>Export Users") {
    return { describe: "export_users", name: `Export Users - ${row.ID}` };
  }
  if (sec === "Bulk Add user to multiple groups") {
    return { describe: "bulk_import", name: `Bulk Import - ${row.ID}` };
  }
  if (sec === "Default group") {
    return { describe: "default_group", name: `Default Group - ${row.ID}` };
  }
  if (sec === "Access Management") {
    return { describe: "utf8_chars", name: `UTF-8 ${op} - ${row.ID}` };
  }
  if (sec === "Users") {
    return { describe: `users/${op}`, name: `Users ${op} - ${row.ID}` };
  }
  if (sec === "Groups") {
    return { describe: `groups/${op}`, name: `Groups ${op} - ${row.ID}` };
  }
  if (sec === "Departments") {
    return { describe: `departments/${op}`, name: `Departments ${op} - ${row.ID}` };
  }
  return { describe: "other", name: `${sec} - ${row.ID}` };
}

const plan = [];
for (const r of rows) {
  if (!r.ID) continue;
  const section = (r.Section || "").trim();
  const moduleSlug = slug(section || "other");
  const op = tagOp(r.Title);
  const runStatus = classifyRunnable(section, r.Title);
  const tn = planTestName(r);
  plan.push({
    id: r.ID,
    title: (r.Title || "").toString().trim(),
    module: section,
    moduleSlug,
    operation: op,
    describe: tn.describe,
    testName: tn.name,
    runnable: runStatus.runnable,
    ...(runStatus.fixtureNeeded ? { fixtureNeeded: runStatus.fixtureNeeded } : {}),
  });
}

// Summary
const summary = {
  totalRows: plan.length,
  byModule: {},
  byOperation: {},
  byRunnable: { runnable: 0, needsFixture: 0 },
  byFixtureNeeded: {},
};
for (const p of plan) {
  summary.byModule[p.module] = (summary.byModule[p.module] || 0) + 1;
  summary.byOperation[p.operation] = (summary.byOperation[p.operation] || 0) + 1;
  if (p.runnable) summary.byRunnable.runnable++;
  else {
    summary.byRunnable.needsFixture++;
    summary.byFixtureNeeded[p.fixtureNeeded] = (summary.byFixtureNeeded[p.fixtureNeeded] || 0) + 1;
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({ summary, plan }, null, 2));
console.log("Wrote", OUT);
console.log("Summary:", JSON.stringify(summary, null, 2));
