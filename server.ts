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

import { consolidatePdfsDeterministically } from "./src/utils/deterministicConsolidator";

app.post("/api/consolidate", async (req, res) => {
  try {
    const { files, accountNames, engine = "deterministic" } = req.body as {
      files: UploadedPdfPayload[];
      accountNames: string[];
      engine?: "deterministic" | "ai";
    };

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        error: "Debes adjuntar al menos un archivo PDF para procesar la consolidación.",
      });
    }

    const names = Array.isArray(accountNames) && accountNames.length === 5
      ? accountNames
      : ["Cuenta ML 1", "Cuenta ML 2", "Cuenta ML 3", "Cuenta ML 4", "Cuenta ML 5"];

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      // Fallback si no hay clave: intentar modo determinista
      const fallbackResult = await consolidatePdfsDeterministically(files, names);
      return res.json(fallbackResult);
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const systemInstruction = `Eres el motor experto de máxima precisión para auditoría logística y consolidación de bodega de "FerreHousePicking", especializado en Mercado Libre (Mercado Envíos / Colecta / Flex / Full / Agencias).

TU OBJETIVO PRINCIPAL:
Analizar y consolidar con EXACTITUD TOTAL todos los productos y órdenes de preparación contenidos en los ${files.length} archivos PDF adjuntos de hasta 5 cuentas:
- Cuenta 1 (cta1): "${names[0]}"
- Cuenta 2 (cta2): "${names[1]}"
- Cuenta 3 (cta3): "${names[2]}"
- Cuenta 4 (cta4): "${names[3]}"
- Cuenta 5 (cta5): "${names[4]}"

REGLAS DE MÁXIMA EXACTITUD:
1. EXTRACCIÓN ESPECÍFICA DEL SKU (SIN ALTERACIONES):
   - Extrae el código SKU exacto tal cual figura en cada PDF (código de vendedor, código interno, código de barra o publicación ML).
   - No inventes códigos ni cambies letras, guiones o números. Consérvalo fidedigno.
   - Si un producto tiene título descriptivo, úsalo en 'producto'.

2. CONTEO EXACTO POR CUENTA:
   - Para cada producto vendido, asigna su cantidad exacta a la cuenta correspondiente (cta1, cta2, cta3, cta4, cta5).
   - Si un SKU aparece en múltiples ventas u órdenes dentro del PDF de una misma cuenta, suma todas sus unidades de esa cuenta antes de asignarlo.
   - Si una cuenta no tiene archivo o no vendió ese SKU, coloca 0.
   - totalPreparar DEBE ser la suma matemática exacta: cta1 + cta2 + cta3 + cta4 + cta5.

3. CONSOLIDACIÓN ENTRE CUENTAS:
   - Si dos o más cuentas vendieron el mismo SKU o producto, agrúpalos en una sola fila con sus cantidades desglosadas por cuenta.
   - No omitas ningún producto. Revisa todas las páginas del PDF.`;

    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [];

    parts.push({
      text: `Procesa y consolida los siguientes ${files.length} archivo(s) PDF de resúmenes de ventas de Mercado Libre con Gemini 3.8 Flash.`,
    });

    for (const file of files) {
      const slotNumber = file.slotIndex + 1; // 1 to 5
      const cleanBase64 = file.base64Data.includes(",")
        ? file.base64Data.split(",")[1]
        : file.base64Data;

      parts.push({
        text: `--- INICIO ARCHIVO CUENTA ${slotNumber} (cta${slotNumber} - Nombre: "${file.accountName}" - Archivo: "${file.fileName}") ---`,
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

    // Usar el modelo gemini-3.8-flash solicitado por el usuario
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: { parts },
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: pickingResponseSchema,
      },
    });

    const rawText = (response.text ?? "{}").trim();
    const parsed = JSON.parse(rawText);

    return res.json(parsed);
  } catch (error: unknown) {
    console.error("Error en /api/consolidate:", error);
    // En caso de error en la API, intentar consolidación determinista directa de respaldo
    try {
      const { files, accountNames } = req.body as {
        files: UploadedPdfPayload[];
        accountNames: string[];
      };
      const names = Array.isArray(accountNames) && accountNames.length === 5
        ? accountNames
        : ["Cuenta ML 1", "Cuenta ML 2", "Cuenta ML 3", "Cuenta ML 4", "Cuenta ML 5"];
      const fallbackResult = await consolidatePdfsDeterministically(files, names);
      if (fallbackResult.items.length > 0) {
        return res.json(fallbackResult);
      }
    } catch {
      // Ignorar error secundario
    }

    const errMsg =
      error instanceof Error
        ? error.message
        : "Error al procesar los archivos PDF de Mercado Libre.";
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
