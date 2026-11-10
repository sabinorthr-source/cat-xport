# Changelog

## [2.4.0] - 2026-11-09

### Añadido

- Comparación manual de IDs con Coincidencias, Nos faltan y Nos sobran.
- Copia individual por conjunto.
- Confirmación explícita para comparar contra una lista manual vacía.
- Métricas y advertencias visibles para duplicados, inválidos y estados
  parciales o bloqueados.
- Pruebas automatizadas del comparador y verificaciones de integridad del
  Dashboard.

### Mejorado

- Normalización como cadenas, preservando ceros iniciales y orden de primera
  aparición.
- Invalidación de resultados cuando cambia la entrada manual o la extracción.
- Persistencia explícita de estados `running`, `partial` y `failed` de
  BackOffice.
- Documentación de instalación, uso, limitaciones y formato de entrada.

### Corregido

- Se eliminó la extracción parcial silenciosa de secuencias numéricas.
- Los duplicados ya no inflan los conjuntos de comparación.
- Las extracciones fallidas no reutilizan silenciosamente datos anteriores.
- Las listas JSON compuestas solo por blancos se tratan como vacías y requieren
  confirmación.

### Documentación

- Añadido `README.md`.
- Añadido `docs/id-comparator-spec.md` como contrato funcional del comparador.

## [2.3.0]

- Versión anterior a la integración completa del comparador manual.
