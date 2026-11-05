# Plan de Conteo y Agrupación de SKUs de Mercado Libre (5 Cuentas)

Sistema web especializado para cargar, procesar, agrupar y contar de forma exacta cada SKU proveniente de hasta 5 archivos PDF correspondientes a 5 cuentas distintas de Mercado Libre. Garantiza la unificación estricta por código SKU, agrupando productos aunque tengan nombres o descripciones diferentes en distintas cuentas.

## Confirmaciones del Usuario y Decisiones Críticas

> [!IMPORTANT]
> **Elecciones confirmadas en Fase 1:**
> - **Método de Procesamiento:** Procesamiento híbrido combinando Gemini AI (`gemini-3.8-flash`) a través de un servidor backend seguro en Node.js/Express y un motor de extracción local en navegador (`pdfjs-dist`) para máxima velocidad y precisión sin pérdida de datos.
> - **Visualización de Resultados:** Tabla consolidada general con desglose interactivo por pestañas independientes para las 5 cuentas de Mercado Libre y filtros en tiempo real.
> - **Exportación:** Reporte en formato PDF descargable e impresión optimizada en formato vertical (A4 / Letter portrait) enfocado en listas de selección (*Pick List*) y verificación de stock para almacén.

---

## 1. Visión General del Producto

- **Propósito Principal:** Eliminar los errores en el conteo manual de inventario de Mercado Libre unificando archivos PDF de ventas, etiquetas o listas de empaque de hasta 5 cuentas independientes.
- **Regla Fundamental de SKU:** El sistema prioriza el código SKU sobre el título del producto. Si dos registros de cuentas distintas o del mismo archivo poseen el mismo SKU (ej. `SKU-10293`), se agrupan en una única fila consolidada sumando sus cantidades exactas e identificando las variantes de nombre y el desglose por cuenta.
- **Flujo de Trabajo:** 
  1. Carga múltiple o simultánea de los 5 archivos PDF (asignando o autodetectando cada cuenta).
  2. Procesamiento híbrido inteligente de extracción.
  3. Vista consolidada instantánea con métricas globales (Total de SKUs únicos, Unidades totales a despachar, Cuentas procesadas).
  4. Generación de reporte vertical para impresión física y descarga PDF.

---

## 2. Experiencia de Usuario y Diseño Visual

- **Estilo:** Interfaz limpia, profesional y utilitaria para gestión de inventarios y almacén (SaaS / Operations Dashboard).
- **Tipografía:** 
  - Títulos y navegación: `Plus Jakarta Sans` / `Outfit`.
  - Datos numéricos y SKUs: `JetBrains Mono` con números tabulares (`font-mono tabular-nums`) para evitar desplazamientos al comparar cifras.
- **Paleta de Colores (Disciplina 60-30-10):**
  - **Lienzo (60%):** Fondo blanco neutro en modo claro (`#F8FAFC` / `#FFFFFF`) o pizarra en modo oscuro (`#0F172A`).
  - **Estructura (30%):** Tarjetas con bordes ultra-delgados (`#E2E8F0` / `#1E293B`) sin redundancia de sombra.
  - **Acentos (10%):** Amarillo Mercado Libre / Azul profesional para botones de acción principal, resaltado de SKUs y badges de cuenta.
- **Pestañas y Filtros:**
  - Pestaña principal: **"Consolidado Total"** (Muestra todos los SKUs unificados con la suma global de unidades).
  - Pestañas secundarias: **"Cuenta 1"**, **"Cuenta 2"**, **"Cuenta 3"**, **"Cuenta 4"**, **"Cuenta 5"** (Filtran la tabla para mostrar únicamente lo correspondiente a esa cuenta específica).
  - Barra de búsqueda rápida por SKU o término de producto.

---

## 3. Decisiones Clave de Arquitectura y Estrategia de Datos

1. **Extracción Híbrida Inteligente (Servidor Express + AI Studio):**
   - El backend Express expondrá una ruta `/api/extract-skus` que procesa las páginas del PDF.
   - Utilizará el SDK oficial `@google/genai` con `gemini-3.8-flash` recibiendo las imágenes o texto codificado de los PDF para estructurar esquemas JSON estrictos con: `{ sku: string, nombreProducto: string, cantidad: number, numeroOrden?: string }`.
   - En caso de desconexión o PDF puramente de texto vectorial, el navegador ejecuta una fallback con `pdfjs-dist` y patrones de expresiones regulares avanzados especificos de Mercado Libre.

2. **Algoritmo de Normalización y Agrupación:**
   ```typescript
   interface SKUGroupItem {
     sku: string;
     nombresDetectados: string[]; // Nombres asociados en diferentes cuentas
     totalCantidad: number;
     desglosePorCuenta: Record<string, number>; // { "Cuenta 1": 12, "Cuenta 2": 5, ... }
   }
   ```
   - Normalización de SKU: Eliminación de espacios extras, conversión a mayúsculas.
   - Si se encuentra un SKU idéntico, se incrementa `totalCantidad` y se registra la cantidad correspondiente en la cuenta de origen.

3. **Impresión y Generación de PDF Vertical:**
   - Hoja de estilo CSS `@media print` para diseño vertical limpio de alta densidad en A4/Carta.
   - Opciones para imprimir directamente o exportar a archivo PDF mediante `html2pdf.js` / `jsPDF`.
   - Incluye código de barras visual para cada SKU en la impresión, facilitando el escaneo con lector en almacén.

---

## 4. Arquitectura Técnica y Diagrama de Componentes

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             CLIENTE REACT (Vite UI)                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌─────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐   │
│   │ FileUploadDropzone  │  │ AccountTabs & Filter │  │  VerticalPrintReport │   │
│   └──────────┬──────────┘  └──────────┬───────────┘  └──────────┬───────────┘   │
│              │                        │                         │               │
│              ▼                        ▼                         ▼               │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                      ConsolidatedSKUTable Component                      │   │
│   └──────────────────────────────────┬──────────────────────────────────────┘   │
│                                      │                                          │
└──────────────────────────────────────┼──────────────────────────────────────────┘
                                       │ POST /api/extract-skus (PDF Files)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                             SERVIDOR EXPRESS (server.ts)                        │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                 /api/extract-skus Endpoint                             │   │
│   │   - Utiliza @google/genai SDK ('gemini-3.8-flash')                       │   │
│   │   - Recibe buffers de PDF de las 5 cuentas                              │   │
│   │   - Retorna array JSON estructurado de SKUs y Cantidades                │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Plan de Ejecución

1. **Configuración del Entorno & Servidor Full-Stack:**
   - Instalar paquetes backend y frontend necesarios (`@google/genai`, `pdfjs-dist`, `lucide-react`, `jspdf`, `html2canvas`).
   - Configurar `server.ts` con Express y Vite middleware.
   - Actualizar `metadata.json` con `"MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"`.

2. **Implementación de Extracción de SKUs (Backend & Engine):**
   - Crear la ruta backend `/api/extract-skus` con el cliente Gemini AI.
   - Implementar el motor de resolución local en cliente (`pdfParser.ts`) para procesamiento de emergencia o pruebas locales sin conexión.

3. **Desarrollo de la Interfaz Dashboard (UI):**
   - Construir la zona de carga para 5 archivos PDF etiquetados por Cuenta de Mercado Libre.
   - Desarrollar la tabla consolidada de SKUs con ordenamiento, búsqueda por SKU, paginación y desglose de nombres variantes.
   - Agregar pestañas para cambiar entre Vista Consolidada y Vistas por Cuenta Individual.

4. **Desarrollo del Reporte de Impresión Vertical:**
   - Diseñar la vista de impresión optimizada para almacén (Listado vertical con casilla de verificación, SKU grande, nombre, cantidad total y desglosada por cuenta).
   - Generación de PDF e integración con `@media print`.

5. **Pruebas y Verificación:**
   - Probar la agrupación de SKUs con nombres diferentes.
   - Ejecutar `compile_applet` y `lint_applet` para garantizar cero errores de construcción.
