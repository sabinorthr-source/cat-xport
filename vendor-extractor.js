(() => {
  globalThis.extractVendor = async function () {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
    const normalizeHeader = (value) => normalize(value).toLocaleLowerCase("es");
    const timeoutMs = 12000;
    const pageSettleMs = 350;
    const maxPages = 1000;

    const findTable = () => Array.from(document.querySelectorAll("table")).find((candidate) => {
      const headers = Array.from(candidate.querySelectorAll("thead th")).map((th) => normalizeHeader(th.textContent));
      return headers.includes("vendor name") && headers.includes("remote id") && headers.includes("integration");
    });

    const table = findTable();
    if (!table) throw new Error("No se encontró la tabla de Vendors. Comprueba que esté cargada.");

    const chainMatch = location.pathname.match(/\/chains\/([^/]+)\/vendors\/?$/);
    if (!chainMatch) throw new Error("No se pudo identificar el Chain ID en la URL actual.");
    const chainId = decodeURIComponent(chainMatch[1]);

    const getSummary = () => normalize(document.querySelector('[data-testid="pagination-summary"]')?.textContent);
    const parseSummary = (summary) => {
      const match = summary.match(/([\d,\.\s]+)\s*[-–]\s*([\d,\.\s]+)\s+of\s+([\d,\.\s]+)/i);
      if (!match) return null;
      const number = (value) => Number(value.replace(/[,.\s]/g, ""));
      return { start: number(match[1]), end: number(match[2]), total: number(match[3]) };
    };

    const headerIndexes = () => {
      const currentTable = findTable();
      if (!currentTable) throw new Error("La tabla de Vendors dejó de estar disponible durante la extracción.");
      const headers = Array.from(currentTable.querySelectorAll("thead th")).map((th) => normalizeHeader(th.textContent));
      return {
        table: currentTable,
        vendor: headers.indexOf("vendor name"),
        remote: headers.indexOf("remote id"),
        integration: headers.indexOf("integration")
      };
    };

    const readCurrentPage = () => {
      const indexes = headerIndexes();
      const rows = Array.from(indexes.table.querySelectorAll("tbody tr"));
      return rows.map((row) => {
        const cells = Array.from(row.querySelectorAll("td"));
        const cell = (index) => index >= 0 ? normalize(cells[index]?.innerText) : "";
        const vendorName = cell(indexes.vendor);
        if (!vendorName) return null;
        return {
          vendorName,
          chainId,
          remoteId: cell(indexes.remote),
          integration: cell(indexes.integration)
        };
      }).filter(Boolean);
    };

    const isEnabled = (button) => !button.disabled && button.getAttribute("aria-disabled") !== "true" && button.getAttribute("data-disabled") !== "true";
    const buttons = () => Array.from(document.querySelectorAll('[data-testid="PageNavigationPageButton"]')).filter((button) => button.getClientRects().length);
    const labelOf = (button) => normalize([
      button.getAttribute("aria-label"), button.getAttribute("title"), button.textContent
    ].filter(Boolean).join(" ")).toLocaleLowerCase("es");

    const clickAndWait = async (button) => {
      if (!button || !isEnabled(button)) return false;
      const before = getSummary();
      button.click();
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        await sleep(150);
        const after = getSummary();
        if (after && after !== before) {
          await sleep(pageSettleMs);
          return true;
        }
      }
      throw new Error("La paginación no respondió a tiempo. Se detuvo la extracción para evitar repetir acciones.");
    };

    const navigate = async (direction, targetPage) => {
      const visible = buttons();
      const target = visible.find((button) => normalize(button.textContent) === String(targetPage) && isEnabled(button));
      if (direction === "next" && target) return clickAndWait(target);

      const labelMatch = visible.find((button) => {
        const label = labelOf(button);
        return isEnabled(button) && (direction === "next"
          ? /next|siguiente|próxima|proxima|›|»/.test(label)
          : /previous|prev|anterior|‹|«/.test(label));
      });
      if (labelMatch) return clickAndWait(labelMatch);

      // Fallback: next/previous is normally the last/first pagination control.
      const fallback = direction === "next" ? visible[visible.length - 1] : visible[0];
      if (fallback && isEnabled(fallback)) return clickAndWait(fallback);
      return false;
    };

    const initialSummary = getSummary();
    let pageInfo = parseSummary(initialSummary);
    if (!pageInfo) throw new Error("No se pudo leer el total de Vendors desde la paginación.");

    // Si no estamos en la primera página, volver al inicio usando la paginación visible.
    let guard = 0;
    while (pageInfo.start > 1 && guard++ < maxPages) {
      const moved = await navigate("previous", Math.max(1, Math.ceil(pageInfo.start / Math.max(1, pageInfo.end - pageInfo.start + 1))));
      if (!moved) throw new Error("No se pudo volver a la primera página. Abre la primera página de Vendors e inténtalo otra vez.");
      pageInfo = parseSummary(getSummary());
      if (!pageInfo) throw new Error("No se pudo interpretar la paginación actual.");
    }

    const originalPageInfo = parseSummary(initialSummary);
    const originalStart = originalPageInfo?.start ?? 1;
    const records = [];
    const seen = new Set();
    const total = pageInfo.total;
    let pagesRead = 0;
    const temporaryKey = "vendorExtractionBuffer";
    const persistProgress = async (complete = false) => {
      const payload = {
        records: records.slice(), chainId, totalExpected: total, pagesRead,
        paginationSummary: initialSummary, pageUrl: location.href,
        extractedAt: new Date().toISOString(), complete
      };
      try {
        if (globalThis.chrome?.storage?.session) {
          await chrome.storage.session.set({ [temporaryKey]: payload });
        }
      } catch (error) {
        console.warn("No se pudo persistir el progreso temporal de Vendor.", error);
      }
    };

    while (pagesRead < maxPages) {
      const currentInfo = parseSummary(getSummary());
      if (!currentInfo) throw new Error("Se perdió el resumen de paginación durante la extracción.");

      for (const record of readCurrentPage()) {
        const key = [record.vendorName, record.chainId, record.remoteId, record.integration].join("|");
        if (!seen.has(key)) {
          seen.add(key);
          records.push(record);
        }
      }
      pagesRead++;
      // Persistir cada página para no depender únicamente del resultado final de executeScript.
      await persistProgress(false);

      if (currentInfo.end >= currentInfo.total || records.length >= total) break;
      const nextPage = Math.floor(currentInfo.start / Math.max(1, currentInfo.end - currentInfo.start + 1)) + 2;
      const moved = await navigate("next", nextPage);
      if (!moved) {
        // If the site uses a nonstandard pagination control, fail instead of silently returning partial data.
        throw new Error(`La extracción quedó incompleta (${records.length} de ${total} Vendors). No se encontró el control para avanzar.`);
      }
    }

    if (pagesRead >= maxPages && records.length < total) {
      throw new Error("Se alcanzó el límite de seguridad de páginas; la extracción quedó incompleta.");
    }

    // Volver a la página desde la que comenzó el usuario, sin alterar el resultado extraído.
    let restoreInfo = parseSummary(getSummary());
    let restoreGuard = 0;
    while (restoreInfo && restoreInfo.start !== originalStart && restoreGuard++ < maxPages) {
      const pageSize = Math.max(1, restoreInfo.end - restoreInfo.start + 1);
      const targetPage = Math.floor(originalStart / pageSize) + 1;
      const direction = restoreInfo.start < originalStart ? "next" : "previous";
      const moved = await navigate(direction, targetPage);
      if (!moved) break;
      restoreInfo = parseSummary(getSummary());
    }

    const result = {
      records,
      chainId,
      pageUrl: location.href,
      paginationSummary: initialSummary,
      totalExpected: total,
      pagesRead,
      extractedAt: new Date().toISOString()
    };

    // Guardar el resultado final y eliminar el buffer temporal una vez consolidado.
    try {
      if (globalThis.chrome?.storage?.session) {
        await chrome.storage.session.set({ vendorRecords: result });
        await chrome.storage.session.remove(temporaryKey);
      }
    } catch (error) {
      console.warn("No se pudo consolidar la extracción de Vendor en storage.session.", error);
    }
    return result;
  };
})();
