
const columns = [
  { key: "brand", label: "Marca" },
  { key: "localId", label: "ID Local" },
  { key: "store", label: "Tienda" }
];

const $ = (selector) => document.querySelector(selector);

const tbody = $("#rows");
const summary = $("#summary");
const status = $("#status");
const compareInput = $("#platform-input");
const compareResults = $("#compare-results");
const compareSummary = $("#compare-summary");

let records = [];
let missingIds = [];
let matchedIds = [];

function getValue(record, key) {
  return String(record[key] ?? "");
}

function render() {
  tbody.replaceChildren();

  for (const record of records) {
    const tr = document.createElement("tr");

    for (const column of columns) {
      const td = document.createElement("td");
      td.textContent = getValue(record, column.key);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  summary.textContent =
    `${records.length} ${records.length === 1 ? "registro encontrado" : "registros encontrados"}`;
}

function makeTableText() {
  const header = columns.map(column => column.label).join("\t");

  const rows = records.map(record =>
    columns.map(column =>
      getValue(record, column.key).replace(/[\t\r\n]+/g, " ")
    ).join("\t")
  );

  return [header, ...rows].join("\r\n");
}

$("#copy").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(makeTableText());
    status.textContent = "Tabla copiada.";
  } catch {
    status.textContent = "No se pudo copiar la tabla.";
  }
});

$("#xlsx").addEventListener("click", () => {
  try {
    if (!globalThis.XLSX) {
      throw new Error("No se ha cargado la biblioteca Excel.");
    }

    const data = [
      columns.map(column => column.label),
      ...records.map(record =>
        columns.map(column => getValue(record, column.key))
      )
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);

    // Conservar los IDs como texto.
    for (let row = 1; row < data.length; row++) {
      const address = XLSX.utils.encode_cell({ r: row, c: 1 });

      if (worksheet[address]) {
        worksheet[address].t = "s";
      }
    }

    worksheet["!cols"] = [
      { wch: 38 },
      { wch: 16 },
      { wch: 38 }
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Catalogo");

    XLSX.writeFileXLSX(workbook, "pedidosya-catalogo.xlsx");
    status.textContent = "Excel generado.";
  } catch (error) {
    status.textContent = error.message || "Error al exportar Excel.";
  }
});

// Extrae números sin importar comillas, comas, corchetes u objetos.
function extractNumericIds(input) {
  const matches = String(input ?? "").match(/\d+/g) || [];
  return [...new Set(matches)];
}

// Formato solicitado:
// [
// 591514,
// 599182,
// 592266
// ]
function formatIdsAsArray(ids) {
  return `[\n${ids.join(",\n")}\n]`;
}

function renderComparison() {
  $("#missing-ids").textContent = formatIdsAsArray(missingIds);
  $("#matched-ids").textContent = formatIdsAsArray(matchedIds);

  compareSummary.textContent =
    `${matchedIds.length} coincidentes · ${missingIds.length} faltantes`;

  compareResults.hidden = false;
}

$("#compare").addEventListener("click", () => {
  const platformIds = extractNumericIds(compareInput.value);

  if (platformIds.length === 0) {
    status.textContent = "Introduce al menos un ID numérico.";
    compareResults.hidden = true;
    return;
  }

  const localIds = new Set(
    records
      .map(record => String(record.localId ?? "").trim())
      .filter(id => /^\d+$/.test(id))
  );

  // En platformVendors pero ausentes en los registros extraídos.
  missingIds = platformIds.filter(id => !localIds.has(id));

  // Presentes tanto en platformVendors como en los registros extraídos.
  matchedIds = platformIds.filter(id => localIds.has(id));

  renderComparison();

  status.textContent = "Comparación completada.";
});

async function copyIds(ids, label) {
  try {
    await navigator.clipboard.writeText(formatIdsAsArray(ids));
    status.textContent = `${label}: IDs copiados.`;
  } catch {
    status.textContent = "No se pudieron copiar los IDs.";
  }
}

$("#copy-missing").addEventListener("click", () => {
  copyIds(missingIds, "Faltantes");
});

$("#copy-matched").addEventListener("click", () => {
  copyIds(matchedIds, "Coincidentes");
});

$("#clear-compare").addEventListener("click", () => {
  compareInput.value = "";
  compareResults.hidden = true;
  compareSummary.textContent = "";
  $("#missing-ids").textContent = "";
  $("#matched-ids").textContent = "";
  missingIds = [];
  matchedIds = [];
  status.textContent = "Comparación limpiada.";
});

async function init() {
  const { catalogExportResult } =
    await chrome.storage.session.get("catalogExportResult");

  if (!catalogExportResult) {
    summary.textContent = "Sin datos";

    $("#copy").disabled = true;
    $("#xlsx").disabled = true;
    $("#compare").disabled = true;

    status.textContent = "Vuelve al Backoffice y extrae el catálogo.";
    return;
  }

  records = Array.isArray(catalogExportResult.records)
    ? catalogExportResult.records
    : [];

  render();
}

init().catch(() => {
  summary.textContent = "Error al cargar los datos";
  status.textContent = "Vuelve a ejecutar la extensión.";
});
