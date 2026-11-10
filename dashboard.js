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
    description: "",
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
    description: "",
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
    description: "",
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
let comparisonBusy = false;
let lastComparisonInput = null;
let manualComparisonResult = null;

const resultLabels = {
  matches: "coincidencias",
  missing: "nos-faltan",
  extra: "nos-sobran"
};

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
  if (comparisonBusy) return;
  comparisonBusy = true;
  $("#compare-manual-ids").disabled = true;

  const result = IdComparator.compareIdLists({
    backofficeRecords: state.backoffice,
    manualInput: $("#manual-ids-b").value,
    backofficeStatus: state.backofficeStatus
  });

  manualComparisonResult = result;
  renderManualComparison(result);

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
    `${metricsText}${resultText}`;

  lastComparisonInput = {
    manualInput: $("#manual-ids-b").value,
    backofficeStatus: state.backofficeStatus
  };
  comparisonBusy = false;
  $("#compare-manual-ids").disabled = false;
}

function getResultArrays(result) {
  return {
    matches: result.matches,
    missing: result.missing,
    extra: result.extra
  };
}

function renderManualComparison(result) {
  const arrays = getResultArrays(result);
  const hasExecutedResult = result.executed;

  Object.entries(arrays).forEach(([key, values]) => {
    const panel = $(`[data-result-panel="${key}"]`);
    const list = $(`[data-result-list="${key}"]`);
    const count = $(`[data-result-count="${key}"]`);
    const copyButton = $(`[data-copy-result="${key}"]`);

    panel.classList.remove("is-blocked", "is-stale", "is-empty");
    count.textContent = hasExecutedResult ? String(values.length) : "—";
    copyButton.disabled = !hasExecutedResult || values.length === 0;

    if (!hasExecutedResult) {
      panel.classList.add("is-blocked");
      list.textContent = "No hay un resultado válido para mostrar.";
      return;
    }

    if (values.length === 0) {
      panel.classList.add("is-empty");
      list.textContent = "Sin IDs en este conjunto.";
      return;
    }

    list.textContent = values.join("\n");
  });

  const { backoffice, manual } = result.metrics;
  $("#manual-metrics").textContent =
    `A — ${backoffice.originalEntries} entradas · ${backoffice.validUnique} IDs únicos · ` +
    `${backoffice.duplicates} duplicados · ${backoffice.invalid} inválidos | ` +
    `B — ${manual.originalEntries} entradas · ${manual.validUnique} IDs únicos · ` +
    `${manual.duplicates} duplicados · ${manual.invalid} inválidos`;

  const issues = [
    ...result.warnings.map(({ message }) => message),
    backoffice.invalidValues.length
      ? `Inválidos en A: ${backoffice.invalidValues.join(", ")}`
      : "",
    manual.invalidValues.length
      ? `Inválidos en B: ${manual.invalidValues.join(", ")}`
      : "",
    backoffice.duplicateValues.length
      ? `Duplicados en A: ${backoffice.duplicateValues.join(", ")}`
      : "",
    manual.duplicateValues.length
      ? `Duplicados en B: ${manual.duplicateValues.join(", ")}`
      : ""
  ].filter(Boolean);

  $("#manual-issues").textContent = issues.length
    ? issues.join(" · ")
    : "Sin advertencias.";
}

function invalidateManualComparison(message) {
  if (!lastComparisonInput) return;

  manualComparisonResult = null;
  renderManualState("stale", message);
  $("#manual-compare-summary").textContent =
    `${message} Pulsa «Comparar listas» para actualizar.`;
  lastComparisonInput = null;
}

function clearManualComparison() {
  lastComparisonInput = null;
  manualComparisonResult = null;
  renderManualState("initial", "Aún no se ha ejecutado una comparación.");
}

function renderManualState(stateName, message) {
  ["matches", "missing", "extra"].forEach((key) => {
    const panel = $(`[data-result-panel="${key}"]`);
    const list = $(`[data-result-list="${key}"]`);
    const count = $(`[data-result-count="${key}"]`);
    const copyButton = $(`[data-copy-result="${key}"]`);

    panel.classList.remove("is-blocked", "is-stale", "is-empty");
    if (stateName === "stale") panel.classList.add("is-stale");
    if (stateName === "initial") panel.classList.add("is-blocked");
    count.textContent = "—";
    list.textContent = message;
    copyButton.disabled = true;
  });

  $("#manual-metrics").textContent = "";
  $("#manual-issues").textContent = "";
  $("#manual-compare-summary").textContent = message;
}

function applyBackofficeStorage(value) {
  state.backoffice = Array.isArray(value?.records)
    ? value.records
    : [];
  state.backofficeStatus = value?.comparisonStatus ?? {
    available: false
  };
  invalidateManualComparison(
    state.backofficeStatus.failed
      ? "La extracción de BackOffice falló y los resultados anteriores fueron invalidados."
      : "La extracción de BackOffice cambió y los resultados anteriores quedaron desactualizados."
  );
  renderTable("backoffice");
  buildComparison();
}

function renderAll() {
  renderTable("backoffice");
  renderTable("vendor");
  renderVendorMeta();
  buildComparison();
  renderManualState("initial", "Aún no se ha ejecutado una comparación.");
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

$("#manual-ids-b").addEventListener("input", () => {
  invalidateManualComparison("La lista manual cambió.");
});

$("#clear-manual-ids").addEventListener("click", () => {
  $("#manual-ids-b").value = "";
  clearManualComparison();
});

function getResultValues(key) {
  if (!manualComparisonResult?.executed) return null;
  return manualComparisonResult[key];
}

async function copyResult(key) {
  const values = getResultValues(key);

  if (!values || values.length === 0) {
    $("#status").textContent = "No hay IDs para copiar en este conjunto.";
    return;
  }

  try {
    await navigator.clipboard.writeText(values.join("\n"));
    $("#status").textContent =
      `Se copiaron ${values.length} IDs de ${resultLabels[key]}.`;
  } catch {
    $("#status").textContent =
      "No se pudo copiar la lista. Comprueba los permisos del portapapeles.";
  }
}

document.querySelectorAll("[data-copy-result]").forEach((button) => {
  button.addEventListener("click", () => {
    copyResult(button.dataset.copyResult);
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

  const status = state.backofficeStatus;
  const backofficeMessage = status.failed
    ? "La última extracción de BackOffice falló."
    : status.partial
      ? "BackOffice disponible con extracción parcial."
      : status.complete
        ? "BackOffice disponible con extracción completa."
        : "BackOffice aún no está disponible.";
  $("#status").textContent =
    `${backofficeMessage} ${state.vendor.length} registros de Vendor disponibles.`;

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "session" || !changes.backofficeRecords) return;
    applyBackofficeStorage(changes.backofficeRecords.newValue);
    $("#status").textContent = state.backofficeStatus.failed
      ? "La extracción de BackOffice falló; vuelve a ejecutarla."
      : "La extracción de BackOffice se actualizó.";
  });
}

init().catch(() => {
  $("#status").textContent =
    "No se pudieron cargar los datos de la sesión.";
});