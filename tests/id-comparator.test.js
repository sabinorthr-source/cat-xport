const test = require("node:test");
const assert = require("node:assert/strict");
const { compareIdLists } = require("../id-comparator.js");

function run(a, b, options = {}) {
  return compareIdLists({
    backofficeRecords: a.map((localId) => ({ localId })),
    manualInput: b,
    backofficeStatus: { available: true, complete: true },
    ...options
  });
}

function assertInvariants(result) {
  const { backoffice, manual } = result.metrics;
  assert.equal(backoffice.validUnique, result.matches.length + result.extra.length);
  assert.equal(manual.validUnique, result.matches.length + result.missing.length);
  assert.equal(new Set(result.matches).size, result.matches.length);
  assert.equal(new Set(result.missing).size, result.missing.length);
  assert.equal(new Set(result.extra).size, result.extra.length);
  assert.equal(
    new Set([...result.matches, ...result.extra]).size,
    backoffice.validUnique
  );
  assert.equal(
    new Set([...result.matches, ...result.missing]).size,
    manual.validUnique
  );
  assert.equal(
    new Set([
      ...result.matches,
      ...result.missing,
      ...result.extra
    ]).size,
    result.matches.length + result.missing.length + result.extra.length
  );
}

test("calcula las tres diferencias y conserva el orden", () => {
  const result = run(["100", "200", "400"], ["100", "300", "400"]);
  assert.equal(result.status, "COMPLETE");
  assert.deepEqual(result.matches, ["100", "400"]);
  assert.deepEqual(result.missing, ["300"]);
  assert.deepEqual(result.extra, ["200"]);
  assertInvariants(result);
});

test("preserva ceros iniciales y trata IDs como cadenas", () => {
  const result = run(["00123", "123"], ["00123"]);
  assert.deepEqual(result.matches, ["00123"]);
  assert.deepEqual(result.extra, ["123"]);
  assert.equal(typeof result.matches[0], "string");
  assertInvariants(result);
});

test("deduplica y cuenta duplicados por origen", () => {
  const result = run(["10", "10", "20"], ["10", "10", "30"]);
  assert.equal(result.metrics.backoffice.duplicates, 1);
  assert.deepEqual(result.metrics.backoffice.duplicateValues, ["10"]);
  assert.equal(result.metrics.manual.duplicates, 1);
  assert.deepEqual(result.metrics.manual.duplicateValues, ["10"]);
  assert.deepEqual(result.matches, ["10"]);
  assertInvariants(result);
});

test("rechaza tokens completos inválidos sin rescatar dígitos", () => {
  const result = run(["10"], ["10", "ID 123 / 456", "123-extra", "abc123"]);
  assert.deepEqual(result.matches, ["10"]);
  assert.deepEqual(result.missing, []);
  assert.equal(result.metrics.manual.invalid, 3);
  assert.deepEqual(result.metrics.manual.invalidValues, [
    "ID 123 / 456",
    "123-extra",
    "abc123"
  ]);
  assertInvariants(result);
});

test("admite separadores y espacios exteriores", () => {
  const result = run(["10", "20", "30"], " 10,\t20;\r\n30,, ");
  assert.deepEqual(result.matches, ["10", "20", "30"]);
  assert.equal(result.metrics.manual.invalid, 0);
  assertInvariants(result);
});

test("acepta JSON solo con cadenas y reporta otros tipos como inválidos", () => {
  const result = run(
    ["123", "001"],
    '["123", "001", 456, null, false, {"id":"7"}]'
  );
  assert.deepEqual(result.matches, ["123", "001"]);
  assert.equal(result.metrics.manual.invalid, 4);
  assert.deepEqual(result.metrics.manual.invalidValues, [
    456,
    null,
    false,
    { id: "7" }
  ]);
  assertInvariants(result);
});

test("bloquea B vacía sin confirmación y permite B vacía confirmada", () => {
  const blocked = run(["10"], "");
  assert.equal(blocked.status, "BLOCKED");
  assert.equal(blocked.reason, "MANUAL_EMPTY_NOT_CONFIRMED");

  const confirmed = run(["10"], "", { manualEmptyConfirmed: true });
  assert.equal(confirmed.status, "COMPLETE");
  assert.deepEqual(confirmed.extra, ["10"]);
  assertInvariants(confirmed);
});

test("bloquea B cuando todos sus valores son inválidos", () => {
  const result = run(["10"], "ID 10,123-extra");
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.reason, "MANUAL_ALL_INVALID");
  assert.deepEqual(result.matches, []);
});

test("distingue extracción válida vacía de estados no disponibles", () => {
  const validEmpty = run([], ["10"]);
  assert.equal(validEmpty.status, "COMPLETE");
  assert.deepEqual(validEmpty.missing, ["10"]);

  const unavailable = run([], ["10"], {
    backofficeStatus: { available: false }
  });
  assert.equal(unavailable.reason, "BACKOFFICE_NOT_AVAILABLE");

  const failed = run([], ["10"], {
    backofficeStatus: { available: true, failed: true }
  });
  assert.equal(failed.reason, "BACKOFFICE_FAILED");
});

test("permite extracción parcial y la marca", () => {
  const result = run(["10"], ["10", "20"], {
    backofficeStatus: { available: true, partial: true }
  });
  assert.equal(result.status, "PARTIAL");
  assert.equal(result.partial, true);
  assert.ok(result.warnings.some(({ code }) => code === "BACKOFFICE_PARTIAL"));
  assertInvariants(result);
});

test("no modifica las entradas y mantiene resultados deterministas", () => {
  const records = [{ localId: "001" }, { localId: "2" }];
  const manual = ["2", "001"];
  const recordsSnapshot = JSON.stringify(records);
  const manualSnapshot = JSON.stringify(manual);
  const input = {
    backofficeRecords: records,
    manualInput: manual,
    backofficeStatus: { available: true, complete: true }
  };

  const first = compareIdLists(input);
  const second = compareIdLists(input);
  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(records), recordsSnapshot);
  assert.equal(JSON.stringify(manual), manualSnapshot);
  assert.deepEqual(first.matches, ["2", "001"]);
  assertInvariants(first);
});
