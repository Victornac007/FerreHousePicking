import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Increase body limit to support up to 5 base64 PDF files
app.use(express.json({ limit: "50mb" }));

interface UploadedPdfPayload {
  slotIndex: number; // 0 to 4
  accountName: string;
  fileName: string;
  base64Data: string;
  mimeType?: string;
}

const pickingResponseSchema = {
  type: Type.OBJECT,
  properties: {
    resumenOperativo: {
      type: Type.STRING,
      description:
        "Breve resumen ejecutivo de la consolidación realizada (ej. cuántas cuentas aportaron productos y observaciones clave de homologación).",
    },
    items: {
      type: Type.ARRAY,
      description:
        "Lista consolidada y homologada de todos los productos únicos a preparar en bodega.",
      items: {
        type: Type.OBJECT,
        properties: {
          sku: {
            type: Type.STRING,
            description:
              "Código SKU unificado o código de referencia del producto (en mayúsculas, sin espacios extra). Si el PDF no indica SKU explícito, genera un código corto estandarizado basado en marca y modelo (ej. BOSCH-GSB13RE).",
          },
          producto: {
            type: Type.STRING,
            description:
              "Nombre comercial estandarizado y claro del producto (unificando variaciones mínimas de título entre las cuentas).",
          },
          marca: {
            type: Type.STRING,
            description: "Marca del producto o herramienta (ej. DeWalt, Bosch, Makita, Stanley, Truper).",
          },
          modelo: {
            type: Type.STRING,
            description: "Modelo o especificación técnica clave del producto (ej. DCD7781, 750W 1/2\", 18V).",
          },
          categoria: {
            type: Type.STRING,
            description: "Categoría ferretera (ej. Herramientas Eléctricas, Accesorios, Fijaciones, Seguridad Industrial, Manuales).",
          },
          cta1: {
            type: Type.INTEGER,
            description: "Cantidad de unidades vendidas en la Cuenta 1 (0 si no hubo ventas en esta cuenta).",
          },
          cta2: {
            type: Type.INTEGER,
            description: "Cantidad de unidades vendidas en la Cuenta 2 (0 si no hubo ventas en esta cuenta).",
          },
          cta3: {
            type: Type.INTEGER,
            description: "Cantidad de unidades vendidas en la Cuenta 3 (0 si no hubo ventas en esta cuenta).",
          },
          cta4: {
            type: Type.INTEGER,
            description: "Cantidad de unidades vendidas en la Cuenta 4 (0 si no hubo ventas en esta cuenta).",
          },
          cta5: {
            type: Type.INTEGER,
            description: "Cantidad de unidades vendidas en la Cuenta 5 (0 si no hubo ventas en esta cuenta).",
          },
          totalPreparar: {
            type: Type.INTEGER,
            description: "Suma exacta de cta1 + cta2 + cta3 + cta4 + cta5.",
          },
        },
        required: [
          "sku",
          "producto",
          "marca",
          "modelo",
          "categoria",
          "cta1",
          "cta2",
          "cta3",
          "cta4",
          "cta5",
          "totalPreparar",
        ],
      },
    },
  },
  required: ["resumenOperativo", "items"],
};

app.post("/api/consolidate", async (req, res) => {
  try {
    const { files, accountNames } = req.body as {
      files: UploadedPdfPayload[];
      accountNames: string[];
    };

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        error: "Debes adjuntar al menos un archivo PDF para procesar la consolidación.",
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error:
          "No se encontró la clave GEMINI_API_KEY en el servidor. Verifica la configuración en el panel Settings > Secrets.",
      });
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const names = Array.isArray(accountNames) && accountNames.length === 5
      ? accountNames
      : ["Cuenta ML 1", "Cuenta ML 2", "Cuenta ML 3", "Cuenta ML 4", "Cuenta ML 5"];

    const systemInstruction = `Eres el motor experto de auditoría, conteo riguroso y consolidación logística de bodega para "FerreHousePicking", especializado en comercio electrónico de ferretería industrial y Mercado Libre (Mercado Envíos / Colecta / Flex / Full).

TU MISIÓN CRÍTICA:
Analizar exhaustivamente cada página de los archivos PDF adjuntos correspondientes a hasta 5 cuentas de Mercado Libre:
- Cuenta 1 (cta1): "${names[0]}"
- Cuenta 2 (cta2): "${names[1]}"
- Cuenta 3 (cta3): "${names[2]}"
- Cuenta 4 (cta4): "${names[3]}"
- Cuenta 5 (cta5): "${names[4]}"

PROTOCOLO ESTRICTO DE CONTEO Y AUDITORÍA DE SKUs:
1. CONTEO COMPLETO Y SIN OMISIONES:
   - Examina línea por línea, tabla por tabla y página por página de CADA PDF adjunto.
   - Identifica la cantidad exacta de unidades ("Cant.", "Cantidad", "Uds.", "Unidades", "x2", "x3", etc.) de cada venta o bulto.
   - Si un mismo SKU se repite en varias ventas u órdenes dentro del mismo PDF de la misma cuenta, SUMA rigurosamente todas las unidades de esa cuenta antes de asignarlas a su propiedad (cta1 a cta5).

2. HOMOLOGACIÓN Y NORMALIZACIÓN DE SKUs:
   - Identifica el código SKU, código de publicación (#MLA, #MLC, etc.), código universal (EAN/UPC) o código de barra indicado en el documento.
   - Si dos o más cuentas vendieron el mismo producto bajo títulos ligeramente distintos (por ejemplo: "Taladro Percutor Inalambrico DeWalt 20v DCD7781" vs "TALADRO DEWALT DCD7781 20V SIN CARBONES"), DEBES consolidarlos en un único SKU idéntico unificado (ej. "DW-DCD7781-20V" o el SKU oficial del fabricante).
   - Unifica en mayúsculas y elimina espacios extras para que la clave sea exacta.

3. ASIGNACIÓN MATEMÁTICA EXACTA POR CUENTA:
   - cta1: Total exacto de unidades vendidas en la Cuenta 1 (0 si no vendió o no tiene PDF).
   - cta2: Total exacto de unidades vendidas en la Cuenta 2 (0 si no vendió o no tiene PDF).
   - cta3: Total exacto de unidades vendidas en la Cuenta 3 (0 si no vendió o no tiene PDF).
   - cta4: Total exacto de unidades vendidas en la Cuenta 4 (0 si no vendió o no tiene PDF).
   - cta5: Total exacto de unidades vendidas en la Cuenta 5 (0 si no vendió o no tiene PDF).
   - totalPreparar: DEBE ser exactamente igual a la suma aritmética: cta1 + cta2 + cta3 + cta4 + cta5.

4. AUDITORÍA FINAL:
   - En el campo 'resumenOperativo', incluye un reporte conciso confirmando: total de SKUs detectados, unidades físicas totales auditadas y verificación de que la suma de cuentas coincide exactamente con los documentos revisados.`;

    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [];

    parts.push({
      text: `Procesa y consolida los siguientes ${files.length} archivo(s) PDF de resúmenes de ventas / etiquetas / órdenes de preparación de Mercado Libre.`,
    });

    for (const file of files) {
      const slotNumber = file.slotIndex + 1; // 1 to 5
      const cleanBase64 = file.base64Data.includes(",")
        ? file.base64Data.split(",")[1]
        : file.base64Data;

      parts.push({
        text: `--- INICIO ARCHIVO DE CUENTA ${slotNumber} (Propiedad JSON: cta${slotNumber} - Nombre Cuenta: "${file.accountName}" - Archivo: "${file.fileName}") ---`,
      });
      parts.push({
        inlineData: {
          mimeType: file.mimeType || "application/pdf",
          data: cleanBase64,
        },
      });
    }

    parts.push({
      text: "Devuelve exclusivamente el objeto JSON estructurado con la lista consolidada de picking para bodega.",
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: pickingResponseSchema,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      },
    });

    const rawText = (response.text ?? "{}").trim();
    const parsed = JSON.parse(rawText);

    return res.json(parsed);
  } catch (error: unknown) {
    console.error("Error en /api/consolidate:", error);
    const errMsg =
      error instanceof Error
        ? error.message
        : "Error inesperado al procesar los archivos PDF con Gemini.";
    return res.status(500).json({ error: errMsg });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*all", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FerreHousePicking server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
