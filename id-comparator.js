(function (root, factory) {
  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.IdComparator = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const ID_PATTERN = /^[0-9]+$/;
  const TEXT_SEPARATOR = /[,\t;\r\n]+/;
  const SPACE_SEPARATOR = / +/;

  function isBlank(value) {
    return typeof value === "string" && value.trim() === "";
  }

  function createMetrics() {
    return {
      originalEntries: 0,
      validUnique: 0,
      duplicates: 0,
      duplicateValues: [],
      invalid: 0,
      invalidValues: []
    };
  }

  function normalizeToken(value) {
    if (typeof value !== "string") {
      return null;
    }

    const token = value.trim();
    return token && ID_PATTERN.test(token) ? token : null;
  }

  function addInvalid(metrics, value) {
    metrics.invalid++;
    metrics.invalidValues.push(value);
  }

  function collectValues(values) {
    const metrics = createMetrics();
    const unique = [];
    const seen = new Set();
    const duplicates = new Set();

    for (const value of values) {
      if (isBlank(value)) {
        continue;
      }

      metrics.originalEntries++;
      const normalized = normalizeToken(value);

      if (normalized === null) {
        addInvalid(metrics, value);
        continue;
      }

      if (seen.has(normalized)) {
        metrics.duplicates++;
        duplicates.add(normalized);
        continue;
      }

      seen.add(normalized);
      unique.push(normalized);
    }

    metrics.validUnique = unique.length;
    metrics.duplicateValues = [...duplicates];

    return { metrics, unique };
  }

  function tokenizeText(source) {
    const values = [];

    for (const chunk of source.split(TEXT_SEPARATOR)) {
      const trimmedChunk = chunk.trim();

      if (!trimmedChunk) {
        continue;
      }

      const pieces = trimmedChunk.split(SPACE_SEPARATOR).filter(Boolean);

      if (
        pieces.length > 1 &&
        pieces.every((piece) => normalizeToken(piece) !== null)
      ) {
        values.push(...pieces);
      } else {
        values.push(trimmedChunk);
      }
    }

    return values;
  }

  function parseManualInput(input) {
    if (Array.isArray(input)) {
      return {
        values: input.map((value) =>
          typeof value === "string" ? value.trim() : value
        ),
        empty: input.length === 0
      };
    }

    const source = String(input ?? "");

    if (!source.trim()) {
      return { values: [], empty: true };
    }

    try {
      const parsed = JSON.parse(source);

      if (Array.isArray(parsed)) {
        return {
          values: parsed.map((value) =>
            typeof value === "string" ? value.trim() : value
          ),
          empty: parsed.length === 0
        };
      }
    } catch {
      // Plain text input uses the documented separators.
    }

    return {
      values: tokenizeText(source),
      empty: false
    };
  }

  function collectBackoffice(records) {
    const values = Array.isArray(records)
      ? records.map((record) => record?.localId)
      : [];

    return collectValues(values);
  }

  function warning(code, message, source) {
    return { code, message, source };
  }

  function blockedResult(reason, metricsA, metricsB, warnings) {
    return {
      status: "BLOCKED",
      complete: false,
      partial: false,
      executed: false,
      reason,
      matches: [],
      missing: [],
      extra: [],
      metrics: {
        backoffice: metricsA,
        manual: metricsB,
        matches: 0,
        missing: 0,
        extra: 0
      },
      warnings
    };
  }

  function compareIdLists({
    backofficeRecords,
    manualInput,
    backofficeStatus,
    manualEmptyConfirmed = false
  }) {
    const parsedManual = parseManualInput(manualInput);
    const collectedA = collectBackoffice(backofficeRecords);
    const collectedB = collectValues(parsedManual.values);
    const metricsA = collectedA.metrics;
    const metricsB = collectedB.metrics;
    const warnings = [];
    const status = backofficeStatus || {};

    if (status.failed) {
      return blockedResult(
        "BACKOFFICE_FAILED",
        metricsA,
        metricsB,
        [warning(
          "BACKOFFICE_FAILED",
          "La extracción de BackOffice falló; vuelve a ejecutarla.",
          "backoffice"
        )]
      );
    }

    if (!status.available) {
      return blockedResult(
        "BACKOFFICE_NOT_AVAILABLE",
        metricsA,
        metricsB,
        [warning(
          "BACKOFFICE_NOT_AVAILABLE",
          "No hay una extracción de BackOffice disponible.",
          "backoffice"
        )]
      );
    }

    if (!status.complete && !status.partial) {
      return blockedResult(
        "BACKOFFICE_STATUS_UNKNOWN",
        metricsA,
        metricsB,
        [warning(
          "BACKOFFICE_STATUS_UNKNOWN",
          "El estado de completitud de BackOffice no está disponible.",
          "backoffice"
        )]
      );
    }

    if (status.partial) {
      warnings.push(warning(
        "BACKOFFICE_PARTIAL",
        "La extracción de BackOffice es parcial; los resultados no representan una conciliación completa.",
        "backoffice"
      ));
    }

    if (metricsA.invalid > 0) {
      warnings.push(warning(
        "BACKOFFICE_INVALID_VALUES",
        `BackOffice contiene ${metricsA.invalid} valor(es) inválido(s).`,
        "backoffice"
      ));
    }

    if (metricsB.invalid > 0) {
      warnings.push(warning(
        "MANUAL_INVALID_VALUES",
        `La lista manual contiene ${metricsB.invalid} valor(es) inválido(s).`,
        "manual"
      ));
    }

    if (metricsB.validUnique === 0 && metricsB.invalid > 0) {
      return blockedResult(
        "MANUAL_ALL_INVALID",
        metricsA,
        metricsB,
        warnings.concat(warning(
          "MANUAL_ALL_INVALID",
          "La lista manual solo contiene valores inválidos; corrígela antes de comparar.",
          "manual"
        ))
      );
    }

    if (parsedManual.empty && !manualEmptyConfirmed) {
      return blockedResult(
        "MANUAL_EMPTY_NOT_CONFIRMED",
        metricsA,
        metricsB,
        warnings.concat(warning(
          "MANUAL_EMPTY_NOT_CONFIRMED",
          "Confirma explícitamente que quieres comparar contra una lista manual vacía.",
          "manual"
        ))
      );
    }

    if (parsedManual.empty && manualEmptyConfirmed) {
      warnings.push(warning(
        "MANUAL_EMPTY_CONFIRMED",
        "La comparación se ejecutó contra una lista manual vacía confirmada.",
        "manual"
      ));
    }

    const setA = new Set(collectedA.unique);
    const matches = collectedB.unique.filter((id) => setA.has(id));
    const missing = collectedB.unique.filter((id) => !setA.has(id));
    const setB = new Set(collectedB.unique);
    const extra = collectedA.unique.filter((id) => !setB.has(id));

    return {
      status: status.partial ? "PARTIAL" : "COMPLETE",
      complete: !status.partial,
      partial: Boolean(status.partial),
      executed: true,
      reason: null,
      matches,
      missing,
      extra,
      metrics: {
        backoffice: metricsA,
        manual: metricsB,
        matches: matches.length,
        missing: missing.length,
        extra: extra.length
      },
      warnings
    };
  }

  return {
    compareIdLists,
    parseManualInput,
    tokenizeText,
    normalizeToken
  };
});
