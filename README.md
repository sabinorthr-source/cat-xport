# Cat-Xport

Extensión Chrome Manifest V3 para extraer localmente datos de catálogos de
PedidosYa BackOffice y Vendor, exportarlos y comparar IDs de BackOffice con
una lista manual.

## Funcionalidades

- Extracción de registros visibles de BackOffice.
- Extracción secuencial de registros de Vendor.
- Tablas locales con copia y exportación XLSX.
- Comparación manual de IDs con tres resultados:
  - **Coincidencias**: `A ∩ B`.
  - **Nos faltan**: IDs manuales (`B`) ausentes en BackOffice (`A`).
  - **Nos sobran**: IDs de BackOffice (`A`) ausentes de la lista manual (`B`).
- Copia individual de cada conjunto.
- Procesamiento local mediante `chrome.storage.session`; no se añade backend ni
  telemetría.

## Requisitos y compatibilidad

- Google Chrome con soporte para extensiones Manifest V3.
- Acceso a las páginas autenticadas de BackOffice y Vendor.
- La extensión debe poder acceder a las pestañas activas y al almacenamiento de
  sesión del navegador, según los permisos declarados en `manifest.json`.

## Instalación local

1. Descarga o clona este directorio.
2. Abre `chrome://extensions`.
3. Activa **Modo de desarrollador**.
4. Selecciona **Cargar descomprimida**.
5. Elige la carpeta del proyecto que contiene `manifest.json`.
6. Abre la extensión desde la barra de Chrome.

No se publica ni se distribuye ningún artefacto automáticamente desde este
proyecto.

## Uso

### Extracción

1. Abre la página correspondiente en la pestaña activa.
2. Abre Cat-Xport.
3. Pulsa **Extraer BackOffice** o **Extraer Vendor**.
4. Consulta los datos en el Dashboard y usa las acciones de copia o exportación
   de cada tabla.

La extracción de BackOffice captura los enlaces de catálogo visibles que
cumplen el formato esperado. Como la interfaz visible no demuestra que se haya
recorrido todo el catálogo, el resultado se marca como **parcial**. Una
extracción fallida invalida los datos anteriores para la comparación manual.

### Comparación manual de IDs

La **Tabla A** se obtiene exclusivamente de
`backofficeRecords.records[].localId`. La **Tabla B** se introduce en el campo
manual del Dashboard y la comparación se ejecuta solo al pulsar
**Comparar listas**.

Se admiten como separadores de texto saltos de línea, comas, punto y coma,
tabulaciones y espacios ASCII. También se admite un arreglo JSON de cadenas,
por ejemplo:

```json
["00123", "123", "456"]
```

Reglas de procesamiento:

- Los IDs son cadenas; nunca se convierten a números.
- Los ceros iniciales son significativos: `00123` y `123` son distintos.
- Se eliminan únicamente los espacios externos de cada token.
- Un ID válido contiene solo dígitos ASCII (`^[0-9]+$`).
- No se rescatan fragmentos: `ID 123`, `123-extra` y `abc123` son inválidos.
- Líneas vacías y separadores consecutivos se ignoran.
- Los duplicados se eliminan del cálculo, conservando la primera aparición, y
  se muestran en las métricas.
- Los inválidos no participan en los resultados y se muestran como advertencia.
- Una lista manual vacía se bloquea para evitar una comparación accidental.
- Una lista con todos sus valores inválidos bloquea la comparación.
- Una extracción BackOffice fallida, ausente o con estado desconocido bloquea
  la comparación. Una extracción parcial permite resultados, pero estos se
  identifican como parciales y no como conciliación completa.

Ejemplo:

```text
A = ["1001", "1002", "1003", "1004"]
B = ["1002", "1003", "1005"]

Coincidencias = ["1002", "1003"]
Nos faltan     = ["1005"]
Nos sobran     = ["1001", "1004"]
```

La comparación manual por IDs es independiente de la comparación automática de
tiendas BackOffice/Vendor por nombres. Esta última utiliza `store` y
`vendorName`, y mantiene sus propios estados de coincidencia y ambigüedad.

La especificación completa está en
[`docs/id-comparator-spec.md`](docs/id-comparator-spec.md).

## Pruebas

Las pruebas usan el runner nativo de Node.js y no requieren abrir Chrome:

```powershell
node --test tests\*.test.js
```

Incluyen validación del comparador, invariantes de conjuntos, estados de
extracción, duplicados, inválidos, volúmenes de hasta 50.000 IDs y
comprobaciones estáticas de la integración del Dashboard.

Las operaciones reales del portapapeles, descargas y extracción requieren
ejecutar la extensión dentro de Chrome.

## Limitaciones conocidas

- BackOffice se clasifica como parcial porque solo se puede demostrar la
  captura de elementos visibles; no se afirma cobertura total.
- Los estados de extracción se almacenan en `chrome.storage.session` y se
  pierden cuando Chrome elimina la sesión.
- La extracción depende de la estructura visible y de los dominios configurados
  en [popup.js](popup.js).
- No se realizan solicitudes remotas adicionales ni se garantiza compatibilidad
  con cambios futuros de las interfaces de PedidosYa.
