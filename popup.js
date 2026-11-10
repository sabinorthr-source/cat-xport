const status = document.getElementById("status");

const buttons = {
  backoffice: document.getElementById("extract-backoffice"),
  vendor: document.getElementById("extract-vendor")
};

const SOURCES = {
  backoffice: {
    host: "backoffice-app.pedidosya.com",
    file: "extractor.js",
    functionName: "extractCatalog",
    storageKey: "backofficeRecords"
  },
  vendor: {
    host: "vbo.us.logisticsbackoffice.com",
    file: "vendor-extractor.js",
    functionName: "extractVendor",
    storageKey: "vendorRecords"
  }
};

async function extract(sourceName) {
  const config = SOURCES[sourceName];

  for (const button of Object.values(buttons)) {
    button.disabled = true;
  }

  status.textContent = sourceName === "vendor"
    ? "Extrayendo Vendors de forma secuencial. No cierres la pestaña..."
    : "Leyendo los registros visibles de BackOffice...";

  const extractionStartedAt = new Date().toISOString();

  try {
    if (sourceName === "backoffice") {
      await chrome.storage.session.set({
        [config.storageKey]: {
          records: [],
          comparisonStatus: {
            available: false,
            complete: false,
            partial: false,
            failed: false,
            state: "running",
            startedAt: extractionStartedAt
          }
        }
      });
    }

    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });

    if (!tab?.id || !tab.url) {
      throw new Error("No se pudo identificar la pestaña activa.");
    }

    const url = new URL(tab.url);

    if (url.hostname !== config.host || url.protocol !== "https:") {
      throw new Error(
        sourceName === "backoffice"
          ? "Abre PedidosYa BackOffice para extraer sus datos."
          : "Abre Vendor Management para extraer sus datos."
      );
    }

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: [config.file]
    });

    const execution = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (functionName) => {
        const extractor = globalThis[functionName];

        if (typeof extractor !== "function") {
          throw new Error("No se encontró la función de extracción.");
        }

        return extractor();
      },
      args: [config.functionName]
    });

    const result = execution[0]?.result;

    if (!result || !Array.isArray(result.records)) {
      throw new Error("La página no devolvió registros válidos.");
    }

    const storedResult = sourceName === "backoffice"
      ? {
          ...result,
          comparisonStatus: {
            available: true,
            complete: false,
            partial: true,
            failed: false,
            state: "partial",
            startedAt: extractionStartedAt,
            extractedAt: result.extractedAt,
            recordCount: result.records.length,
            message:
              "Se capturaron los registros visibles; la cobertura total del catálogo no está demostrada."
          }
        }
      : result;

    await chrome.storage.session.set({
      [config.storageKey]: storedResult
    });

    const dashboardUrl = chrome.runtime.getURL(
      "dashboard.html#" + sourceName
    );

    await chrome.tabs.create({ url: dashboardUrl });

    status.textContent =
      `${result.records.length} registros extraídos.`;

    window.close();
  } catch (error) {
    if (sourceName === "backoffice") {
      try {
        await chrome.storage.session.set({
          [config.storageKey]: {
            records: [],
            comparisonStatus: {
              available: false,
              complete: false,
              partial: false,
              failed: true,
              state: "failed",
              startedAt: extractionStartedAt,
              failedAt: new Date().toISOString(),
              message: error.message || "No se pudo completar la extracción."
            }
          }
        });
      } catch {
        // Preserve the original extraction error for the popup.
      }
    }

    status.textContent =
      error.message || "No se pudo completar la extracción.";

    for (const button of Object.values(buttons)) {
      button.disabled = false;
    }
  }
}

buttons.backoffice.addEventListener("click", () => {
  extract("backoffice");
});

buttons.vendor.addEventListener("click", () => {
  extract("vendor");
});