# Normalización Estricta de SKUs y Nombres de Productos en Consolidación

Implementación de una función de normalización de cadenas de texto (limpieza de espacios, conversión a mayúsculas, eliminación de diacríticos/acentos y estandarización de caracteres especiales) aplicada antes del proceso de agrupación y consolidación de pedidos en `src/utils/pickingLogic.ts`, `src/utils/deterministicConsolidator.ts` y `server.ts`.

## Decisiones Críticas y Confirmaciones

> [!IMPORTANT]
> **Criterio de Normalización Estandarizado (Default Recomendado)**:
> - **Normalización de SKU**: Remueve espacios extras, convierte a mayúsculas, elimina tildes/acentos (NFD normalization) y estandariza separadores (dashes/puntos) para generar una clave de comparación idéntica entre registros.
> - **Conservación de Título Principal**: Cuando dos filas comparten el mismo SKU normalizado pero varían levemente en el nombre, la aplicación conserva automáticamente el título más largo y descriptivo, guardando las variaciones en el visor desplegable de detalles de la fila.

---

## 1. Visión General y Objetivo

El objetivo principal es eliminar duplicados en la planilla maestra de picking cuando distintas cuentas o etiquetas presentan pequeñas variaciones en el SKU o en la descripción del producto (por ejemplo, diferencias en tildes, minúsculas/mayúsculas, dobles espacios o signos de puntuación como comillas `´´` o guiones).

---

## 2. Experiencia de Usuario y Diseño Visual

- **Consolidación Unificada**: Las tablas y resúmenes mostrarán un único registro consolidado por cada producto con la suma total de unidades físicas de las 5 cuentas.
- **Transparencia en Variantes**: Al hacer clic en el indicador de variante de la fila, el operador podrá consultar los nombres exactos y las cantidades provenientes de cada cuenta sin alterar la suma general.
- **Exportaciones e Impresión Limpias**: Las exportaciones a PDF Vertical y Excel CSV utilizarán el SKU y título normalizado y limpio, garantizando legibilidad en bodega.

---

## 3. Decisiones Técnicas y Rationale

- **Normalización NFD de Unicode**: Uso de `str.normalize("NFD").replace(/[\u0300-\u036f]/g, "")` para desarticular tildes y diacríticos (ej. `ó` $\rightarrow$ `O`).
- **Estandarización de Separadores**: Limpieza de guiones redundantes y caracteres de control (comillas encorvadas `´´`, comillas tipográficas, comas innecesarias) antes de la indexación `Map<string, PickingItem>`.
- **Paridad Cliente-Servidor**: Aplicación de la misma regla tanto en la función de consolidación local (`src/utils/pickingLogic.ts`) como en el backend Express (`server.ts` y `deterministicConsolidator.ts`).

---

## 4. Arquitectura de Datos y Normalización

```
┌────────────────────────────────────────────────────────┐
│ Archivos PDF de Mercado Libre (Cuentas 1 a 5)         │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Extracción de Texto / Gemini AI / pdfjs-dist           │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Normalización Previa de String (SKU + Producto)        │
│ 1. trim() + toUpperCase()                              │
│ 2. Unicode NFD Accent Removal (á->A, ñ->N)            │
│ 3. Clean Special Punctuation & Extra Spaces           │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Consolidación e Indexación (Map<NormKey, PickingItem>) │
│ Suma acumulativa: cta1 + cta2 + cta3 + cta4 + cta5      │
└────────────────────────────────────────────────────────┘
```

### Funciones a Modificar
1. `src/utils/pickingLogic.ts`:
   - Añadir `normalizeKeyString(val: string): string`
   - Actualizar `normalizePickingItems` y `parsePdfLocally` para normalizar las claves de agrupación.
2. `src/utils/deterministicConsolidator.ts`:
   - Aplicar `normalizeKeyString` en `cleanSku` y `cleanProductName`.
3. `server.ts`:
   - Asegurar que la respuesta devuelta por la API de Gemini sea procesada con la misma función de normalización.
