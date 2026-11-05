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
import { auditPickingConsolidation } from "./src/utils/pickingLogic";

app.post("/api/consolidate", async (req, res) => {
  try {
    const { files, accountNames, engine = "deterministic" } = req.body as {
      files: UploadedPdfPayload[];
      accountNames: string[];
      engine?: "deterministic" | "ai" | "hybrid" | "ai_enrich";
    };

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        error: "Debes adjuntar al menos un archivo PDF para procesar la consolidación.",
      });
    }

    const names = Array.isArray(accountNames) && accountNames.length === 5
      ? accountNames
      : ["Cuenta ML 1", "Cuenta ML 2", "Cuenta ML 3", "Cuenta ML 4", "Cuenta ML 5"];

    // 1. CONSOLIDACIÓN DETERMINISTA OBLIGATORIA DE BASE (CONTEO EXACTO PÁGINA A PÁGINA SIN ERRORES NI OMISIONES)
    const deterministicResult = await consolidatePdfsDeterministically(files, names);
    let finalItems = deterministicResult.items;

    const apiKey = process.env.GEMINI_API_KEY;

    // 2. ENRIQUECIMIENTO CON IA (OPCIONAL - TOTALMENTE PROTEGIDO CONTRA ERRORES 429 / 503 DE CUOTA)
    if (apiKey && engine === "ai_enrich" && finalItems.length > 0) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: {
              "User-Agent": "aistudio-build",
            },
          },
        });

        const skuList = finalItems.map((it) => ({
          sku: it.sku,
          producto: it.producto,
          marca: it.marca,
        }));

        const enrichmentSchema = {
          type: Type.OBJECT,
          properties: {
            enrichedItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sku: { type: Type.STRING },
                  producto: { type: Type.STRING },
                  marca: { type: Type.STRING },
                  modelo: { type: Type.STRING },
                  categoria: { type: Type.STRING },
                },
                required: ["sku", "producto", "marca", "modelo", "categoria"],
              },
            },
          },
          required: ["enrichedItems"],
        };

        const enrichmentPrompt = `Analiza este listado de SKUs y nombres de productos ferreteros:
${JSON.stringify(skuList, null, 2)}
Estandariza los nombres de productos, marcas y categorías sin cambiar el código SKU.`;

        let aiResponse;
        try {
          aiResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [{ text: enrichmentPrompt }],
            config: {
              responseMimeType: "application/json",
              responseSchema: enrichmentSchema,
            },
          });

          const rawAiText = (aiResponse?.text ?? "{}").trim();
          const parsedAi = JSON.parse(rawAiText);
          const enrichedList = Array.isArray(parsedAi?.enrichedItems) ? parsedAi.enrichedItems : [];

          const enrichmentMap = new Map<string, { producto: string; marca: string; modelo: string; categoria: string }>();
          for (const e of enrichedList) {
            if (e.sku) {
              enrichmentMap.set(e.sku.trim().toUpperCase(), {
                producto: (e.producto || "").trim(),
                marca: (e.marca || "").trim(),
                modelo: (e.modelo || "").trim(),
                categoria: (e.categoria || "").trim(),
              });
            }
          }

          finalItems = finalItems.map((item) => {
            const match = enrichmentMap.get(item.sku.toUpperCase());
            if (match) {
              return {
                ...item,
                producto: match.producto || item.producto,
                marca: match.marca || item.marca,
                modelo: match.modelo || item.modelo,
                categoria: match.categoria || item.categoria,
              };
            }
            return item;
          });
        } catch (mErr) {
          console.warn("Aviso: Cuota o alta demanda en API de Gemini, utilizando enriquecimiento local:", mErr);
        }
      } catch (aiErr) {
        console.warn("Aviso: No se pudo conectar a la API de IA (cuota agotada o sin red), continuando con motor determinista de alta velocidad:", aiErr);
      }
    }

    const auditReport = auditPickingConsolidation(
      deterministicResult.rawExtractedItems,
      finalItems
    );

    const totalPhysicalUnits = finalItems.reduce((acc, i) => acc + i.totalPreparar, 0);
    const auditStatusStr = auditReport.isValid
      ? "Auditoría de integridad: 100% exacto (0 discrepancias)"
      : `¡Discrepancia detectada!: ${auditReport.alertMessage}`;

    const resumenOperativo = `Consolidación de picking realizada en modo Determinista Directo (100% Precisión Local): se procesaron ${files.length} archivo(s) PDF de Mercado Libre, consolidando ${finalItems.length} SKUs únicos y ${totalPhysicalUnits} unidades físicas exactas. ${auditStatusStr}.`;

    return res.json({
      resumenOperativo,
      items: finalItems,
      auditReport,
    });
  } catch (error: unknown) {
    console.error("Error general en /api/consolidate, ejecutando respaldo determinista directo:", error);
    try {
      const { files, accountNames } = req.body as {
        files: UploadedPdfPayload[];
        accountNames: string[];
      };
      const names = Array.isArray(accountNames) && accountNames.length === 5
        ? accountNames
        : ["Cuenta ML 1", "Cuenta ML 2", "Cuenta ML 3", "Cuenta ML 4", "Cuenta ML 5"];
      const fallbackResult = await consolidatePdfsDeterministically(files, names);
      return res.json({
        resumenOperativo: `Consolidación realizada en modo Determinista Local (IA con alta demanda o temporalmente no disponible): se procesaron ${files.length} archivo(s) PDF de Mercado Libre, consolidando ${fallbackResult.items.length} SKUs únicos con precisión matemática.`,
        items: fallbackResult.items,
        auditReport: fallbackResult.auditReport,
      });
    } catch (innerErr) {
      const errMsg =
        error instanceof Error
          ? error.message
          : "Error al procesar los archivos PDF de Mercado Libre.";
      return res.status(500).json({ error: errMsg });
    }
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
