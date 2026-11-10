const $ = (selector) => document.querySelector(selector);

const state = {
  backoffice: [],
  vendor: [],
  comparison: [],
  vendorMeta: null,
  backofficeStatus: { available: false },
  manualComparison: []
};

const definitions = {
  backoffice: {
    title: "BackOffice",
    description: "Registros extraídos del catálogo y comparación manual de IDs.",
    storageKey: "backofficeRecords",
    columns: [
      { key: "brand", label: "Marca" },
      { key: "localId", label: "ID Local" },
      { key: "store", label: "Tienda" }
    ],
    filename: "BackOffice.xlsx",
    sheetName: "BackOffice"
  },
  vendor: {
    title: "Vendor",
    description: "Registros extraídos recorriendo la paginación visible de Vendor.",
    storageKey: "vendorRecords",
    columns: [
      { key: "vendorName", label: "Vendor Name" },
      { key: "chainId", label: "Chain ID" },
      { key: "remoteId", label: "Remote ID" },
      { key: "integration", label: "Integration" }
    ],
    filename: "Vendor.xlsx",
    sheetName: "Vendor"
  },
  comparison: {
    title: "Comparativa",
    description: "Cruce de tiendas de BackOffice con Vendors.",
    columns: [
      { key: "brand", label: "Marca" },
      { key: "localId", label: "ID Local" },
      { key: "store", label: "Tienda" },
      { key: "remoteId", label: "Remote ID" },
      { key: "chainId", label: "Chain ID" },
      { key: "integration", label: "Integration" }
    ],
    filename: "Comparativa.xlsx",
    sheetName: "Comparativa"
  }
};

let activeView = "backoffice";

function getRecords(view) {
  if (view === "comparison") return state.comparison;
  return state[view];
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizeName(value) {
  return cleanText(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es");
}

function renderTable(view) {
  const definition = definitions[view];
  const records = getRecords(view);
  const table = $(`#${view}-table`);
  const tbody = table.querySelector("tbody");

  tbody.replaceChildren();

  const fragment = document.createDocumentFragment();

  for (const record of records) {
    const tr = document.createElement("tr");

    for (const column of definition.columns) {
      const td = document.createElement("td");
      td.textContent = cleanText(record[column.key]);
      tr.appendChild(td);
    }

    fragment.appendChild(tr);
  }

  tbody.appendChild(fragment);

  $(`#${view}-count`).textContent =
    `${records.length} ${records.length === 1 ? "registro" : "registros"}`;
}

function renderVendorMeta() {
  const meta = state.vendorMeta;

  if (!meta) {
    $("#vendor-meta").textContent =
      "Todavía no se han extraído datos de Vendor.";
    return;
  }

  const parts = [];

  if (meta.chainId) {
    parts.push(`Chain ID: ${meta.chainId}`);
  }

  if (meta.paginationSummary) {
    parts.push(`Paginación inicial: ${meta.paginationSummary}`);
  }

  if (Number.isFinite(meta.totalExpected)) {
    parts.push(`Total esperado: ${meta.totalExpected}`);
  }

  if (Number.isFinite(meta.pagesRead)) {
    parts.push(`Páginas recorridas: ${meta.pagesRead}`);
  }

  if (meta.extractedAt) {
    parts.push(
      `Extracción: ${new Date(meta.extractedAt).toLocaleString()}`
    );
  }

  $("#vendor-meta").textContent = parts.join(" · ");
}

function buildComparison() {
  const vendorsByName = new Map();

  for (const vendor of state.vendor) {
    const key = normalizeName(vendor.vendorName);

    if (!key) continue;

    if (!vendorsByName.has(key)) {
      vendorsByName.set(key, []);
    }

    vendorsByName.get(key).push(vendor);
  }

  let matched = 0;
  let missing = 0;
  let ambiguous = 0;

  state.comparison = state.backoffice.map((record) => {
    const key = normalizeName(record.store);
    const candidates = key ? vendorsByName.get(key) ?? [] : [];

    let remoteId = "";
    let chainId = "";
    let integration = "";
    let matchStatus = "missing";

    if (candidates.length === 1) {
      remoteId = cleanText(candidates[0].remoteId);
      chainId = cleanText(candidates[0].chainId);
      integration = cleanText(candidates[0].integration);
      matchStatus = "matched";
      matched++;
    } else if (candidates.length > 1) {
      matchStatus = "ambiguous";
      ambiguous++;
    } else {
      missing++;
    }

    return {
      brand: cleanText(record.brand),
      localId: cleanText(record.localId),
      store: cleanText(record.store),
      remoteId,
      chainId,
      integration,
      matchStatus
    };
  });

  $("#matched-count").textContent = String(matched);
  $("#missing-count").textContent = String(missing);
  $("#ambiguous-count").textContent = String(ambiguous);

  renderTable("comparison");
}

function compareManualIds() {
  const result = IdComparator.compareIdLists({
    backofficeRecords: state.backoffice,
    manualInput: $("#manual-ids-b").value,
    manualEmptyConfirmed: $("#confirm-empty-manual-ids").checked,
    backofficeStatus: state.backofficeStatus
  });

  $("#json-matches").value = result.executed
    ? JSON.stringify(result.matches, null, 2)
    : "[]";
  $("#json-missing-a").value = result.executed
    ? JSON.stringify(result.missing, null, 2)
    : "[]";
  $("#json-extra").value = result.executed
    ? JSON.stringify(result.extra, null, 2)
    : "[]";

  const { backoffice, manual } = result.metrics;
  const metricsText =
    `A: ${backoffice.originalEntries} entradas, ${backoffice.validUnique} únicos, ` +
    `${backoffice.duplicates} duplicados, ${backoffice.invalid} inválidos · ` +
    `B: ${manual.originalEntries} entradas, ${manual.validUnique} únicos, ` +
    `${manual.duplicates} duplicados, ${manual.invalid} inválidos`;
  const resultText = result.executed
    ? ` · ${result.metrics.matches} coincidencias · ` +
      `${result.metrics.missing} nos faltan · ${result.metrics.extra} nos sobran`
    : ` · Comparación bloqueada: ${result.reason}`;

  $("#manual-compare-summary").textContent =
    `${result.status}${result.partial ? " (PARCIAL)" : ""} · ` +
    `${metricsText}${resultText} ` +
    `${result.warnings.map(({ message }) => `[Aviso: ${message}]`).join(" ")}`;
}

function renderAll() {
  renderTable("backoffice");
  renderTable("vendor");
  renderVendorMeta();
  buildComparison();
}

function showView(view) {
  if (!definitions[view]) return;

  activeView = view;

  document.querySelectorAll(".view").forEach((section) => {
    section.hidden = section.id !== `${view}-view`;
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    const selected = button.dataset.view === view;

    button.classList.toggle("active", selected);

    if (selected) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  $("#page-title").textContent = definitions[view].title;
  $("#page-description").textContent = definitions[view].description;

  history.replaceState(null, "", `#${view}`);
}

function makeTableText(view) {
  const definition = definitions[view];
  const records = getRecords(view);

  const header = definition.columns
    .map((column) => column.label)
    .join("\t");

  const rows = records.map((record) =>
    definition.columns.map((column) =>
      cleanText(record[column.key]).replace(/[\t\r\n]+/g, " ")
    ).join("\t")
  );

  return [header, ...rows].join("\r\n");
}

async function copyTable(view) {
  try {
    await navigator.clipboard.writeText(makeTableText(view));
    $("#status").textContent = "Tabla copiada al portapapeles.";
  } catch {
    $("#status").textContent =
      "No se pudo copiar. Comprueba los permisos del portapapeles.";
  }
}

function safeFilenamePart(value, fallback) {
  const cleaned = cleanText(value)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/[. ]+$/g, "")
    .trim();
  return cleaned || fallback;
}

function getExportFilename(view, records) {
  if (view === "vendor") {
    const chainIds = [...new Set(records.map((record) => cleanText(record.chainId)).filter(Boolean))];
    return `${safeFilenamePart(chainIds[0], "Vendor")}.xlsx`;
  }
  if (view === "backoffice" || view === "comparison") {
    const brands = [...new Set(records.map((record) => cleanText(record.brand)).filter(Boolean))];
    return `${safeFilenamePart(brands[0], view === "comparison" ? "Comparativa" : "BackOffice")}.xlsx`;
  }
  return "Exportacion.xlsx";
}

function exportTable(view) {
  try {
    if (!globalThis.XLSX) {
      throw new Error("No se cargó la biblioteca local de XLSX.");
    }

    const definition = definitions[view];
    const records = getRecords(view);

    const data = [
      definition.columns.map((column) => column.label),
      ...records.map((record) =>
        definition.columns.map((column) =>
          cleanText(record[column.key])
        )
      )
    ];

    const worksheet = XLSX.utils.aoa_to_sheet(data);

    // Mantener los identificadores como texto.
    for (let row = 1; row < data.length; row++) {
      for (let col = 0; col < definition.columns.length; col++) {
        const key = definition.columns[col].key;

        if (["localId", "chainId", "remoteId"].includes(key)) {
          const address = XLSX.utils.encode_cell({
            r: row,
            c: col
          });

          if (worksheet[address]) {
            worksheet[address].t = "s";
          }
        }
      }
    }

    worksheet["!cols"] = definition.columns.map((column) => ({
      wch: Math.min(
        45,
        Math.max(
          column.label.length + 2,
          ...records.slice(0, 100).map((record) =>
            cleanText(record[column.key]).length
          )
        )
      )
    }));

    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      definition.sheetName
    );

    const filename = getExportFilename(view, records);
    XLSX.writeFileXLSX(workbook, filename);

    $("#status").textContent =
      `Archivo generado: ${filename}`;
  } catch (error) {
    $("#status").textContent =
      error.message || "No se pudo exportar el archivo.";
  }
}

document.querySelectorAll(".nav-item").forEach((button) => {
  button.addEventListener("click", () => {
    showView(button.dataset.view);
  });
});

document.querySelectorAll("[data-copy]").forEach((button) => {
  button.addEventListener("click", () => {
    copyTable(button.dataset.copy);
  });
});

document.querySelectorAll("[data-export]").forEach((button) => {
  button.addEventListener("click", () => {
    exportTable(button.dataset.export);
  });
});

$("#compare-manual-ids").addEventListener("click", () => {
  compareManualIds();
});

$("#clear-manual-ids").addEventListener("click", () => {
  $("#manual-ids-b").value = "";
  $("#confirm-empty-manual-ids").checked = false;
  $("#manual-compare-summary").textContent = "";
  $("#json-matches").value = "[]";
  $("#json-missing-a").value = "[]";
  $("#json-extra").value = "[]";
});

document.querySelectorAll("[data-copy-json]").forEach((button) => {
  button.addEventListener("click", async () => {
    const fields = {
      matches: "#json-matches",
      missing: "#json-missing-a",
      extra: "#json-extra"
    };
    try {
      await navigator.clipboard.writeText($(fields[button.dataset.copyJson]).value);
      $("#status").textContent = "Lista JSON copiada al portapapeles.";
    } catch {
      $("#status").textContent = "No se pudo copiar el JSON. Comprueba los permisos del portapapeles.";
    }
  });
});

async function init() {
  const saved = await chrome.storage.session.get([
    "backofficeRecords",
    "vendorRecords"
  ]);

  state.backoffice = Array.isArray(saved.backofficeRecords?.records)
    ? saved.backofficeRecords.records
    : [];
  state.backofficeStatus = saved.backofficeRecords?.comparisonStatus ?? {
    available: false
  };

  state.vendor = Array.isArray(saved.vendorRecords?.records)
    ? saved.vendorRecords.records
    : [];

  state.vendorMeta = saved.vendorRecords ?? null;

  renderAll();

  const requestedView = location.hash.slice(1);

  showView(
    definitions[requestedView] ? requestedView : "backoffice"
  );

  $("#status").textContent =
    `${state.backoffice.length} registros de BackOffice y ` +
    `${state.vendor.length} registros de Vendor disponibles.`;
}

init().catch(() => {
  $("#status").textContent =
    "No se pudieron cargar los datos de la sesión.";
});