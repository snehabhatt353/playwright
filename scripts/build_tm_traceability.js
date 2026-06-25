// Builds tests/data/traceability/threat_models_screen.json from the xlsx.
// One section ("Threat Models Screen"), 135 cases. Every C-ID gets a
// planned test name; fixture-dependent cases are flagged for test.fixme().
const fs = require("fs");
const path = require("path");
const xlsx = require("xlsx");

const XLSX_PATH = "testcases_excel/threat_models_screen.xlsx";
const OUT = "tests/data/traceability/threat_models_screen.json";

const wb = xlsx.readFile(XLSX_PATH);
const rows = xlsx.utils.sheet_to_json(wb.Sheets["Worksheet"], { defval: "" });

function tagOp(title) {
  const t = (title || "").toLowerCase();
  // Most specific first
  if (/login.*navigates|check ui|panel and ui|verify.*header features|check threat models panel/.test(t)) return "render";
  if (/^create new|^create.*model|new tag|verify.*creation/.test(t)) return "create";
  if (/edit.*model|update.*model|^edit |modify|change model info|change the user permission|edit threat model|edit the group permission|edited model|change model/.test(t)) return "edit";
  if (/permanent delete|permanantdelete|permanant delete|^delete.*model|delete tm/.test(t)) return "delete_permanent";
  if (/archive|restore|unarchive/.test(t)) return "archive_restore";
  if (/search/.test(t)) return "search";
  if (/sort.*column|ascending\/descending|filter feature|filter in all|click on filter/.test(t)) return "filter_sort";
  if (/columns? feature|adding\/removing columns|add and remove columns/.test(t)) return "columns";
  if (/select all|uncheck all|checkbox/.test(t)) return "select_all";
  if (/refresh/.test(t)) return "refresh";
  if (/important|mark.*star|unmark.*star|star.*model/.test(t)) return "important_star";
  if (/share|collaborator|member|user.+permission|admin permission|read\/write|read[- ]only/.test(t)) return "collaborator";
  if (/created by me/.test(t)) return "filter_created_by_me";
  if (/shared with me/.test(t)) return "filter_shared_with_me";
  if (/status to|change.*status|project status|approval|completed.*read[- ]only|started or review/.test(t)) return "status_change";
  if (/click on.*dashboard|navigates to correct screen|threat framework|template builder|configurations|user management|navigate.*diagram/.test(t)) return "navigation";
  if (/tag/.test(t)) return "tags";
  if (/export.*csv|csv file|click on export and check csv/.test(t)) return "export_csv";
  if (/excel file|click on export.*excel/.test(t)) return "export_excel";
  if (/download.*report|download audit|download developer|download custom report|report download/.test(t)) return "report_download";
  if (/item per page|items? per page|page size/.test(t)) return "pagination";
  if (/modified date|created date|modified column|model.*list row|modified column get updated/.test(t)) return "row_metadata";
  if (/refresh button removes/.test(t)) return "refresh";
  return "other";
}

function classifyRunnable(title, op) {
  const t = (title || "").toLowerCase();
  // Destructive writes on a shared production-like tenant: archive,
  // permanent delete, member removal, restore. The tenant carries
  // ~600 models and we cannot tolerate mutating real data.
  if (op === "delete_permanent" || op === "archive_restore") {
    return { runnable: false, fixtureNeeded: "destructive-write-on-shared-tenant" };
  }
  // CSV/Excel downloads need waitForEvent('download').
  if (op === "export_csv" || op === "export_excel" || op === "report_download") {
    return { runnable: false, fixtureNeeded: "download-handler" };
  }
  // "login with that user" cases need a second test account with the
  // requested role -- multi-user fixture.
  if (/login with (that|the) user|login to that user account|login.*read[- ]only.*user|login.*read.\/write.*user|login.*admin.*user/.test(t)) {
    return { runnable: false, fixtureNeeded: "multi-user-role-login" };
  }
  // Collaborator add/remove/share cases require a seeded model owned by
  // the test user with a clean collaborator slate. On the shared tenant
  // these mutate state in a way that breaks parallel runs.
  if (op === "collaborator" && /add|remove|change|edit|save|update/.test(t)) {
    return { runnable: false, fixtureNeeded: "collaborator-seed" };
  }
  // Tag creation on a real model is a destructive write.
  if (op === "tags" && /^create new tag/.test(t)) {
    return { runnable: false, fixtureNeeded: "destructive-write-on-shared-tenant" };
  }
  // Status changes mutate real models (we can't pick a throwaway row on
  // a shared tenant). Defer.
  if (op === "status_change") {
    return { runnable: false, fixtureNeeded: "destructive-write-on-shared-tenant" };
  }
  // Approval workflow cases need an existing pending-approval model.
  if (/pending for approval|submitted model status|submit model for approval/.test(t)) {
    return { runnable: false, fixtureNeeded: "approval-workflow-seed" };
  }
  // Editing real models on shared tenant: destructive.
  if (op === "edit" && /threat model|model info|model details/.test(t)) {
    return { runnable: false, fixtureNeeded: "destructive-write-on-shared-tenant" };
  }
  // Most renders, search inputs, sort/filter/column UI toggles are safe
  // to assert on the live list.
  return { runnable: true };
}

function planTestName(row) {
  const op = tagOp(row.Title);
  return { describe: `tm/${op}`, name: `TM ${op} - ${row.ID}` };
}

const plan = [];
for (const r of rows) {
  if (!r.ID) continue;
  const op = tagOp(r.Title);
  const rc = classifyRunnable(r.Title, op);
  const tn = planTestName(r);
  plan.push({
    id: r.ID,
    title: (r.Title || "").toString().trim(),
    module: (r.Section || "Threat Models Screen").trim(),
    moduleSlug: "threat_models_screen",
    operation: op,
    describe: tn.describe,
    testName: tn.name,
    runnable: rc.runnable,
    ...(rc.fixtureNeeded ? { fixtureNeeded: rc.fixtureNeeded } : {}),
  });
}

const summary = {
  totalRows: plan.length,
  byOperation: {},
  byRunnable: { runnable: 0, needsFixture: 0 },
  byFixtureNeeded: {},
};
for (const p of plan) {
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
