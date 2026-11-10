const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dashboard = fs.readFileSync(path.join(root, "dashboard.js"), "utf8");
const html = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
const popup = fs.readFileSync(path.join(root, "popup.js"), "utf8");
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, "manifest.json"), "utf8")
);

test("Dashboard consume los tres arrays del comparador", () => {
  for (const key of ["matches", "missing", "extra"]) {
    assert.match(dashboard, new RegExp(`${key}: result\\.${key}`));
    assert.match(html, new RegExp(`data-result-panel="${key}"`));
    assert.match(html, new RegExp(`data-copy-result="${key}"`));
  }
});

test("Dashboard usa métricas y estados sin recalcular conjuntos", () => {
  assert.match(dashboard, /const \{ backoffice, manual \} = result\.metrics/);
  assert.match(dashboard, /result\.metrics\.matches/);
  assert.match(dashboard, /result\.metrics\.missing/);
  assert.match(dashboard, /result\.metrics\.extra/);
  assert.match(dashboard, /result\.warnings/);
  assert.match(dashboard, /result\.executed/);
  assert.match(dashboard, /renderManualState\("stale"/);
  assert.doesNotMatch(dashboard, /new Set\(.*result\.(matches|missing|extra)/s);
});

test("persistencia de extracción incluye estados y limpia fallos", () => {
  assert.match(popup, /comparisonStatus/);
  assert.match(popup, /state: "running"/);
  assert.match(popup, /state: "partial"/);
  assert.match(popup, /state: "failed"/);
  assert.match(popup, /records: \[\]/);
});

test("Manifest V3 conserva permisos y carga local", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes("storage"));
  assert.match(html, /<script src="id-comparator\.js"><\/script>/);
  assert.match(html, /<script src="dashboard\.js" defer><\/script>/);
});

test("comparación automática BackOffice/Vendor mantiene sus rutas", () => {
  assert.match(dashboard, /function buildComparison/);
  assert.match(dashboard, /vendorsByName/);
  assert.match(dashboard, /normalizeName/);
  assert.match(dashboard, /matched-count/);
  assert.match(dashboard, /ambiguous-count/);
});

test("no quedan controles JSON heredados del comparador manual", () => {
  assert.doesNotMatch(dashboard, /json-matches|json-missing-a|json-extra/);
  assert.doesNotMatch(html, /data-copy-json/);
});

test("la confirmación de lista vacía no se expone en la interfaz", () => {
  assert.doesNotMatch(dashboard, /confirm-empty-manual-ids/);
  assert.doesNotMatch(html, /confirm-empty-manual-ids/);
});

test("la copia usa el conjunto seleccionado", () => {
  assert.match(dashboard, /copyResult\(button\.dataset\.copyResult\)/);
  assert.match(dashboard, /values\.join\("\\n"\)/);
  assert.match(dashboard, /navigator\.clipboard\.writeText/);
  assert.doesNotMatch(dashboard, /data-export-result|exportResult|escapeCsvCell/);
  assert.doesNotMatch(html, /data-export-result|Exportar CSV/);
});
