
(() => {
  globalThis.extractCatalog = function () {
    const links = document.querySelectorAll(
      'a.link--secondary[href*="/partners/"][href*="/catalogue"]'
    );

    const records = [];
    const seen = new Set();

    for (const link of links) {
      const href = link.getAttribute("href") || "";

      const match = href.match(
        /\/partners\/(\d+)\/catalogue(?:[/?#]|$)/
      );

      if (!match) continue;

      const localId = match[1];

      const text = (link.textContent || "")
        .trim()
        .replace(/\s+/g, " ");

      if (!text) continue;

      let brand = text;
      let store = "";

      // Buscar desde el final el paréntesis que abre el nombre
      // del local completo. Admite paréntesis anidados.
      if (text.endsWith(")")) {
        let depth = 0;
        let openingIndex = -1;

        for (let i = text.length - 1; i >= 0; i--) {
          if (text[i] === ")") {
            depth++;
          } else if (text[i] === "(") {
            depth--;

            if (depth === 0) {
              openingIndex = i;
              break;
            }
          }
        }

        if (openingIndex > 0) {
          const candidateBrand = text
            .slice(0, openingIndex)
            .trim();

          const candidateStore = text
            .slice(openingIndex + 1, -1)
            .trim();

          if (candidateBrand && candidateStore) {
            brand = candidateBrand;
            store = candidateStore;
          }
        }
      }

      const key = `${localId}|${brand}|${store}`;

      if (seen.has(key)) continue;
      seen.add(key);

      records.push({
        brand,
        localId,
        store,
        url: href
      });
    }

    return {
      records,
      pageUrl: location.href,
      extractedAt: new Date().toISOString()
    };
  };
})();
