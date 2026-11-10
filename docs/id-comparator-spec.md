# Especificación funcional del comparador de IDs

## 1. Objetivo y alcance

Esta especificación define el contrato funcional del comparador de IDs de la
vista **Comparar IDs**. Su propósito es permitir que la Fase 1 implemente una
comparación verificable entre los IDs extraídos de BackOffice y una lista
introducida manualmente, sin perder ceros iniciales, ocultar errores de entrada
ni confundir datos ausentes con listas vacías.

El alcance incluye:

- obtención conceptual y estado de los datos de Tabla A;
- captura, tokenización y validación de Tabla B;
- normalización, deduplicación y clasificación de IDs;
- estados de disponibilidad de la extracción;
- los conjuntos de resultados, métricas, advertencias y criterios de
  aceptación.

No incluye cambios en el extractor, la interfaz, el almacenamiento, la
exportación XLSX ni el algoritmo productivo. Esos cambios pertenecen a fases
posteriores.

## 2. Fuente de verdad observada

La especificación se fundamenta en el código existente:

- [`extractor.js`](../extractor.js) obtiene enlaces de catálogo cuyo path
  contiene `/partners/<dígitos>/catalogue` y guarda la captura de dígitos como
  `localId`. Descarta enlaces que no cumplen ese formato o cuyo texto está
  vacío. Deduplica por la clave compuesta `localId|brand|store`, no por
  `localId` aislado.
- [`dashboard.js`](../dashboard.js) carga `backofficeRecords` desde
  `chrome.storage.session`; si no hay un arreglo `records`, usa una lista
  vacía. La misma inicialización no conserva actualmente un estado explícito de
  extracción parcial o fallida.
- La UI de [`dashboard.html`](../dashboard.html) presenta un textarea para la
  lista manual y actualmente muestra dos salidas: coincidencias y faltantes.
  No contiene todavía una salida para «Nos sobran», ni controles de confirmación
  de lista vacía o de extracción parcial.
- La lógica actual de [`dashboard.js`](../dashboard.js) usa una expresión que
  extrae secuencias numéricas parciales, permite separadores por espacios,
  comas y punto y coma, elimina duplicados y convierte las salidas a `Number`.
  También calcula únicamente `B−A` y `A∩B`.
- [`results.js`](../results.js) contiene un comparador heredado que extrae todas
  las secuencias numéricas de la entrada y también genera solo coincidencias y
  faltantes. Se considera referencia histórica, no contrato para la nueva
  comparativa.

El repositorio no contiene actualmente un `README.md` ni documentación
específica previa sobre comparación de IDs. Por tanto, no se modifica el README
en esta fase.

## 3. Definiciones, glosario y alcance de cada tabla

### 3.1 Tabla A — BackOffice

Tabla A es la colección de IDs locales pertenecientes a los registros obtenidos
por la extracción de BackOffice. El valor de comparación se toma del campo
`localId` de cada registro. La tabla debe conservar metadatos de disponibilidad
de la extracción, como mínimo:

- `available`: si existe un resultado de extracción utilizable;
- `complete`: si la extracción cubre el universo esperado;
- `failed`: si la extracción terminó con error;
- `recordCount`: cantidad de registros entregados por la extracción.

Estos metadatos son parte del estado funcional aunque el almacenamiento actual
todavía no los persista.

### 3.2 Tabla B — Manual

Tabla B es la lista de IDs introducida por el usuario en el dashboard. La
entrada puede ser texto delimitado o, por compatibilidad con el placeholder
actual, un arreglo JSON de valores de texto. La confirmación explícita de una
lista vacía es un estado distinto de no haber introducido nada.

### 3.3 Resultados

Sean `A` y `B` los conjuntos de IDs válidos, normalizados y únicos:

- **Coincidencias**: `A ∩ B`. El ID está en BackOffice y en la lista manual.
- **Nos faltan**: `B − A`. El ID fue solicitado en la lista manual pero no
  aparece en BackOffice. Son registros que faltan en BackOffice respecto de la
  lista manual.
- **Nos sobran**: `A − B`. El ID aparece en BackOffice pero no en la lista
  manual. Son registros de BackOffice que no aparecen en la lista manual.

«Nos faltan» y «Nos sobran» son diferencias opuestas; nunca deben usarse como
sinónimos. Por ejemplo, si `A={100,200}` y `B={100,300}`, «Nos faltan» es
`{300}` y «Nos sobran» es `{200}`.

## 4. Reglas de normalización y validación

### 4.1 Tipo e identidad

1. Cada ID se trata como **cadena** durante toda la comparación.
2. No se usa `Number`, `parseInt`, conversión numérica equivalente ni orden
   numérico para comparar o serializar resultados.
3. La identidad provisional del dominio es una secuencia no vacía de dígitos
   ASCII: `^[0-9]+$`.
4. Se conservan los ceros iniciales: `00123` y `123` son IDs distintos.
5. No se extraen secuencias parciales. `ID 123 / 456`, `123-extra` y
   `abc123` no se transforman silenciosamente en IDs válidos.

La extracción actual solo evidencia IDs numéricos en la URL de BackOffice; no
hay evidencia de IDs alfanuméricos en el repositorio. La regla numérica es, por
ello, la decisión conservadora para esta fase. Si negocio confirma IDs con
letras, debe cambiarse la gramática y sus pruebas antes de implementar.

### 4.2 Espacios y separadores admitidos

En texto plano se admiten como separadores:

- salto de línea (`LF` o `CRLF`);
- coma;
- punto y coma;
- tabulación;
- uno o más espacios ASCII externos o entre tokens.

Los separadores consecutivos no crean valores. Las líneas vacías se ignoran.
El espacio interno no se elimina de un token: con la gramática numérica, un
espacio separa tokens y por tanto `12 34` representa dos entradas (`12` y
`34`), no un ID nuevo.

La elección de gramática numérica evita inventar cómo interpretar un futuro ID
con espacios internos. Si el negocio necesita IDs con espacios, esa excepción
debe validarse y especificarse antes de la Fase 1.

### 4.3 JSON heredado

Se admite un arreglo JSON únicamente por compatibilidad con el placeholder
actual, por ejemplo `["00123","456"]`. Cada elemento debe ser una cadena
completa que cumpla `^[0-9]+$`, después de quitar espacios externos.

Un número JSON (`[123]`) no es la representación contractual de un ID cadena y
debe marcarse como inválido. Esto corrige la discrepancia del placeholder
actual (`["1234", "1235", 1236]`) y evita perder información de identidad.
Objetos, arreglos anidados, `null`, booleanos y texto no válido son inválidos.

### 4.4 Vacíos e inválidos

- Entrada vacía, líneas en blanco o solo separadores: no contiene IDs; no se
  reportan como inválidos.
- Token no vacío que no cumple la gramática: valor inválido. Se conserva su
  representación textual razonable para mostrarla al usuario, sin incluirla en
  ningún conjunto.
- La validación es completa por token. Nunca se acepta una coincidencia
  parcial.
- Los IDs válidos se normalizan quitando únicamente espacios externos y se
  deduplican conservando la primera aparición.
- La comparación puede continuar excluyendo inválidos, pero debe mostrar una
  advertencia explícita por origen con cantidad y valores inválidos. No se
  presentan resultados como libres de errores.

La continuación con advertencia es la decisión provisional más segura: permite
corregir entradas sin bloquear una revisión útil, pero hace visible que los
resultados no representan los valores descartados.

## 5. Duplicados

La operación es de conjuntos. Los duplicados no representan registros
adicionales salvo que negocio defina una semántica distinta.

Para cada origen se mantienen por separado:

1. **Entradas originales**: cantidad de valores/filas recibidos antes de
   eliminar vacíos; los separadores no cuentan como entradas.
2. **IDs válidos únicos**: cardinalidad del conjunto normalizado.
3. **Duplicados**: cantidad de apariciones válidas posteriores a la primera,
   calculada como `entradas válidas - IDs válidos únicos`.
4. **IDs repetidos**: conjunto opcional de valores que aparecieron más de una
   vez, mostrado para facilitar la corrección.
5. **Inválidos**: cantidad y valores no vacíos que no pasaron validación.

Los duplicados de A y B se detectan y reportan por separado. No generan
coincidencias adicionales ni alteran las tres listas de salida.

## 6. Estados de datos y habilitación de la comparación

### 6.1 Tabla A

- **Sin registros disponibles**: no hay datos cargados; no equivale a una
  extracción válida de cero registros.
- **Extracción válida con cero registros**: la extracción terminó correctamente
  y confirmó `recordCount=0`; A es el conjunto vacío y puede compararse.
- **No extraída**: no existe resultado de extracción en almacenamiento. No se
  permite una conciliación; se solicita extraer BackOffice.
- **Extracción fallida**: el proceso terminó con error o no produjo un resultado
  confiable. No se permite una conciliación.
- **Extracción parcial**: existe resultado, pero el alcance no cubre todo el
  universo esperado. Se permite comparar con una advertencia persistente
  «resultado parcial» y todos los contadores; nunca se etiqueta como
  conciliación completa.

La distinción entre cero válido, ausente, fallido y parcial requiere metadatos
explícitos. La integración los persiste junto con `backofficeRecords`; no se
infiere éxito solo porque `records` sea `[]`. La extracción visible actual se
marca como parcial porque no demuestra la cobertura total del catálogo.

### 6.2 Tabla B

- **Sin contenido introducido**: no se ejecuta la comparación.
- **Vacía confirmada explícitamente**: se permite comparar contra `B=∅`,
  mostrando una advertencia de confirmación. Todos los IDs válidos de A quedan
  en «Nos sobran».
- **Solo separadores o líneas vacías, sin IDs válidos**: se trata como entrada
  vacía no confirmada; no se ejecuta hasta que el usuario confirme que quiere
  comparar contra una lista vacía.
- **Todos los valores inválidos**: no se ejecuta una comparación de resultados;
  se muestra la advertencia y los valores a corregir. No se puede interpretar
  como `B=∅`.

La confirmación explícita es obligatoria para una Tabla B vacía. Así se evita
que olvidar pegar la lista convierta accidentalmente todos los IDs de A en
«Nos sobran».

### 6.3 Combinaciones bloqueadas

La comparación se bloquea si A no fue extraída, falló, o B está vacía sin
confirmar. También se bloquea si ambos orígenes carecen de IDs válidos sin que
uno de ellos sea una lista vacía confirmada. La UI debe explicar el estado, no
mostrar tres listas vacías como si fueran un resultado válido.

## 7. Fórmulas, métricas e invariantes

Después de validar y deduplicar:

```text
A = conjunto de IDs válidos únicos de BackOffice
B = conjunto de IDs válidos únicos manuales
Coincidencias = A ∩ B
Nos faltan = B − A
Nos sobran = A − B
```

Contadores mínimos visibles:

- entradas originales de A y B;
- IDs válidos únicos de A y B;
- coincidencias;
- nos faltan;
- nos sobran;
- duplicados de A y B;
- inválidos de A y B.

Invariantes obligatorias:

```text
|A| = |Coincidencias| + |Nos sobran|
|B| = |Coincidencias| + |Nos faltan|
```

Además:

- los tres conjuntos son mutuamente excluyentes;
- `Coincidencias ∪ Nos sobran = A`;
- `Coincidencias ∪ Nos faltan = B`;
- cada resultado no contiene duplicados;
- los valores inválidos y vacíos no aparecen en ningún resultado.

El orden de cada salida conserva la primera aparición en su origen:

- Coincidencias y «Nos faltan»: orden de primera aparición en B;
- «Nos sobran»: orden de primera aparición en A.

No se ordenan numéricamente ni lexicográficamente.

## 8. Casos de uso verificables

En las tablas siguientes, `A` y `B` representan valores ya introducidos; los
resultados muestran cadenas, aunque su apariencia sea numérica.

| Caso | Entrada A / estado | Entrada B / estado | Coincidencias | Nos faltan | Nos sobran | Estado/advertencia |
|---|---|---|---|---|---|---|
| 1. Coincidencias parciales | `["100","200","400"]`, completa | `["100","300","400"]`, confirmada | `["100","400"]` | `["300"]` | `["200"]` | Completa; `A únicos=3`, `B únicos=3` |
| 2. Listas idénticas | `["001","2"]`, completa | `["001","2"]`, confirmada | `["001","2"]` | `[]` | `[]` | Completa; `A únicos=B únicos=2` |
| 3. A vacía válida | extracción válida, `A=[]` | `["10","20"]`, confirmada | `[]` | `["10","20"]` | `[]` | Advertencia informativa: A tiene cero registros válidos |
| 4. B vacía confirmada | `["10","20"]`, completa | vacío + confirmación | `[]` | `[]` | `["10","20"]` | Advertencia: comparación contra B vacía confirmada |
| 5. B vacía sin confirmar | `["10","20"]`, completa | vacío sin confirmar | no ejecutar | no ejecutar | no ejecutar | Bloqueada; pedir confirmación |
| 6. Duplicados en A | `["10","10","20"]`, completa | `["10","20"]`, confirmada | `["10","20"]` | `[]` | `[]` | A: 3 entradas, 2 únicos, 1 duplicado |
| 7. Duplicados en B | `["10","20"]`, completa | `["10","10","30"]`, confirmada | `["10"]` | `["30"]` | `["20"]` | B: 3 entradas, 2 únicos, 1 duplicado |
| 8. Inválidos mezclados | `["10","20"]`, completa | `["10","ID 30","20-extra","30"]`, confirmada | `["10"]` | `["30"]` | `["20"]` | Advertir 2 inválidos; continuar con válidos |
| 9. Ceros iniciales | `["00123","123"]`, completa | `["00123"]`, confirmada | `["00123"]` | `[]` | `["123"]` | No convertir ni colapsar ceros |
| 10. Espacios/separadores | `["10","20","30"]`, completa | texto ` 10,\t20;\r\n30,, `, confirmada | `["10","20","30"]` | `[]` | `[]` | Separadores consecutivos y bordes ignorados |
| 11. A parcial | `["10","20"]`, parcial | `["10","20","30"]`, confirmada | `["10","20"]` | `["30"]` | `[]` | Resultado permitido, marcado «parcial» |
| 12. A ausente/fallida | no extraída o fallida | `["10"]`, confirmada | no ejecutar | no ejecutar | no ejecutar | Bloqueada; solicitar extracción válida |
| 13. Ninguna lista con IDs válidos | extracción válida `A=[]` | solo separadores o todos inválidos | no ejecutar si B no fue confirmada | no ejecutar | no ejecutar | Diferenciar B vacía no confirmada de inválidos; mostrar métricas |

En el caso 8, `ID 30` y `20-extra` son inválidos completos; no se rescata
`30` ni `20`. En el caso 13, si el usuario confirma explícitamente que B es
vacía y A es una extracción válida de cero registros, la comparación sí puede
ejecutarse y los tres conjuntos son vacíos.

## 9. Criterios de aceptación para la Fase 1

1. Dado un ID válido con espacios externos, el sistema los elimina sin cambiar
   los caracteres internos ni los ceros iniciales.
2. Dado `00123` y `123`, el sistema los mantiene como dos IDs distintos.
3. Dada una entrada `ID 123 / 456` o `123-extra`, el sistema reporta el valor
   inválido y no extrae ninguna secuencia parcial.
4. Dadas líneas vacías o separadores consecutivos, el sistema no crea IDs ni
   inválidos artificiales.
5. Dado un duplicado en A o B, los contadores de únicos y los resultados no se
   inflan; el duplicado queda reportado en su origen.
6. Dados valores válidos e inválidos mezclados, el sistema continúa solo con
   válidos y muestra una advertencia explícita con cantidades y valores
   inválidos.
7. Sin extracción de A o con extracción fallida, el comparador no produce una
   conciliación.
8. Con extracción válida de cero registros, el comparador distingue ese estado
   de A no disponible y puede calcular `B−A`.
9. Con extracción parcial, el comparador permite el cálculo pero marca todos los
   resultados como parciales.
10. Con B vacía sin confirmación, el comparador no se ejecuta; con B vacía
    confirmada, se ejecuta y `Nos sobran=A`.
11. Para toda comparación habilitada se cumplen las dos invariantes
    cardinales, la exclusión mutua y la reconstrucción de A y B.
12. Las salidas son cadenas sin conversión numérica y conservan el orden de
    primera aparición definido en esta especificación.
13. Se muestran entradas originales, únicos, coincidencias, diferencias,
    duplicados e inválidos por cada origen.
14. Los resultados distinguen y rotulan inequívocamente «Nos faltan» (`B−A`)
    de «Nos sobran» (`A−B`), incluyendo el ejemplo del caso 1.
15. La implementación no modifica ni interpreta como contrato los comparadores
    heredados de [`results.js`](../results.js).

## 10. Decisiones tomadas y justificación

| Decisión | Justificación |
|---|---|
| IDs como cadenas numéricas | El extractor actual captura dígitos de la URL; tratar cadenas evita pérdida de ceros y mantiene exportaciones textuales. |
| Ceros iniciales significativos | No existe evidencia de una regla de equivalencia numérica; se aplica el criterio predeterminado conservador. |
| Validación completa sin rescate parcial | La lógica heredada rescata fragmentos y puede producir falsos positivos; el contrato prioriza trazabilidad. |
| Separadores de texto explícitos | Coincide con los separadores que el dashboard actual intenta admitir y evita interpretar puntuación arbitrariamente. |
| Conservar primera aparición | Es determinista y mantiene el contexto de la entrada del usuario y de la extracción. |
| Comparación como conjuntos | El objetivo es conciliación de presencia; no hay evidencia de que repeticiones tengan significado de negocio. |
| Continuar con inválidos advertidos | Permite una revisión útil sin ocultar datos descartados; el usuario puede corregirlos y repetir. |
| Confirmación para B vacía | Evita el falso resultado masivo «Nos sobran» por omisión accidental de la lista. |
| Parcial permitido con marca visible | Permite diagnóstico operativo, pero evita presentar una muestra como conciliación completa. |

## 11. Información de negocio pendiente de validación

Estas decisiones son provisionales y deben confirmarse antes o durante la
Fase 1:

1. Si BackOffice puede tener IDs alfanuméricos o con separadores internos. La
   evidencia actual solo muestra IDs numéricos en la URL.
2. Qué evidencia observable adicional permitiría marcar una extracción como
   completa y cómo se conoce el universo esperado. Mientras no exista, la
   integración conserva el estado parcial.
3. Si una extracción válida de cero registros es operativamente posible y quién
   puede confirmarla.
4. Si el formato JSON con números debe seguir siendo compatible. Esta
   especificación lo marca inválido para preservar el contrato de cadenas,
   aunque el placeholder y la lógica heredada aceptan números.
5. Si los usuarios necesitan ver también los valores duplicados completos o
   solo el conteo y el primer valor repetido.

Hasta resolver estos puntos, la implementación debe aplicar las reglas
conservadoras de este documento y hacer visibles sus advertencias.
