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

    // 1. PROCESAR CADA ARCHIVO PDF POR SEPARADO CON GEMINI 3.8 FLASH
    // Esto garantiza que cada PDF se audite individualmente sin confundir las cuentas ni las cantidades
    interface SingleAccountExtraction {
      slotIndex: number;
      accountName: string;
      items: Array<{
        sku: string;
        producto: string;
        marca?: string;
        modelo?: string;
        categoria?: string;
        cantidad: number;
      }>;
    }

    const perAccountSchema = {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          description: "Lista de todos los productos y cantidades vendidas en este documento PDF específico.",
          items: {
            type: Type.OBJECT,
            properties: {
              sku: {
                type: Type.STRING,
                description: "Código SKU exacto, código de vendedor, código de barra o publicación ML tal cual figura en el documento sin alteraciones.",
              },
              producto: {
                type: Type.STRING,
                description: "Nombre o descripción del producto tal cual figura en el documento.",
              },
              marca: {
                type: Type.STRING,
                description: "Marca del producto (ej. DeWalt, Bosch, Makita, Truper, Stanley, Genérico).",
              },
              modelo: {
                type: Type.STRING,
                description: "Modelo o especificación técnica (o 'Estándar').",
              },
              categoria: {
                type: Type.STRING,
                description: "Categoría ferretera general.",
              },
              cantidad: {
                type: Type.INTEGER,
                description: "Cantidad física TOTAL de unidades vendidas para este SKU en este documento específico.",
              },
            },
            required: ["sku", "producto", "cantidad"],
          },
        },
      },
      required: ["items"],
    };

    const extractions: SingleAccountExtraction[] = [];

    // Procesar cada archivo en paralelo para máxima velocidad y precisión aislada
    await Promise.all(
      files.map(async (file) => {
        try {
          const cleanBase64 = file.base64Data.includes(",")
            ? file.base64Data.split(",")[1]
            : file.base64Data;

          const slotNum = file.slotIndex + 1;
          const prompt = `Analiza este documento PDF de Mercado Libre perteneciente a la Cuenta ${slotNum} ("${file.accountName}").
INSTRUCCIONES DE CONTEO Y EXTRACCIÓN EXACTA:
1. Extrae TODOS los productos vendidos en este PDF.
2. Identifica el código SKU o código de producto EXACTO tal cual está impreso, sin inventar ni cambiar caracteres.
3. Para cada producto, determina la CANTIDAD EXACTA vendida en este documento.
4. Si un mismo SKU se repite en varias órdenes, etiquetas o líneas de este documento, suma todas sus unidades en un solo registro con la cantidad total acumulada.
5. Devuelve la lista en formato JSON con 'sku', 'producto' y 'cantidad' exacta.`;

          const response = await ai.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [
              { text: prompt },
              {
                inlineData: {
                  mimeType: file.mimeType || "application/pdf",
                  data: cleanBase64,
                },
              },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: perAccountSchema,
            },
          });

          const rawText = (response.text ?? "{}").trim();
          const parsed = JSON.parse(rawText);
          const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];

          extractions.push({
            slotIndex: file.slotIndex,
            accountName: file.accountName,
            items: rawItems,
          });
        } catch (fileErr) {
          console.error(`Error procesando archivo de cuenta ${file.slotIndex + 1}:`, fileErr);
        }
      })
    );

    // 2. CONSOLIDACIÓN MATEMÁTICA EN EL SERVIDOR (CERO ALUCINACIÓN EN SUMAS)
    const consolidatedMap = new Map<
      string,
      {
        sku: string;
        producto: string;
        marca: string;
        modelo: string;
        categoria: string;
        cta1: number;
        cta2: number;
        cta3: number;
        cta4: number;
        cta5: number;
        totalPreparar: number;
      }
    >();

    for (const extraction of extractions) {
      const slotIdx = extraction.slotIndex;
      for (const item of extraction.items) {
        const rawSku = String(item.sku || "").trim();
        if (!rawSku) continue;
        const normalizedKey = rawSku.toUpperCase();
        const qty = Math.max(0, Math.round(Number(item.cantidad) || 0));
        if (qty === 0) continue;

        const existing = consolidatedMap.get(normalizedKey);
        if (existing) {
          if (slotIdx === 0) existing.cta1 += qty;
          else if (slotIdx === 1) existing.cta2 += qty;
          else if (slotIdx === 2) existing.cta3 += qty;
          else if (slotIdx === 3) existing.cta4 += qty;
          else if (slotIdx === 4) existing.cta5 += qty;
          existing.totalPreparar =
            existing.cta1 + existing.cta2 + existing.cta3 + existing.cta4 + existing.cta5;

          if (item.producto && item.producto.length > existing.producto.length) {
            existing.producto = item.producto.trim();
          }
        } else {
          consolidatedMap.set(normalizedKey, {
            sku: rawSku,
            producto: (item.producto || rawSku).trim(),
            marca: (item.marca || "Ferretería").trim(),
            modelo: (item.modelo || "Estándar").trim(),
            categoria: (item.categoria || "Ferretería General").trim(),
            cta1: slotIdx === 0 ? qty : 0,
            cta2: slotIdx === 1 ? qty : 0,
            cta3: slotIdx === 2 ? qty : 0,
            cta4: slotIdx === 3 ? qty : 0,
            cta5: slotIdx === 4 ? qty : 0,
            totalPreparar: qty,
          });
        }
      }
    }

    const finalItems = Array.from(consolidatedMap.values());
    const totalPhysicalUnits = finalItems.reduce((acc, i) => acc + i.totalPreparar, 0);

    const resumenOperativo = `Auditoría individual completada con Gemini 3.8 Flash: se analizaron por separado ${files.length} archivo(s) PDF de Mercado Libre, consolidando ${finalItems.length} SKUs únicos y ${totalPhysicalUnits} unidades físicas exactas con suma matemática en el servidor.`;

    return res.json({
      resumenOperativo,
      items: finalItems,
    });
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
