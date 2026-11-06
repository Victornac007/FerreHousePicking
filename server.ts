import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import { consolidatePdfsDeterministically, cleanSku, detectBrand, normalizeStringKey } from "./src/utils/deterministicConsolidator";
import { auditPickingConsolidation, PickingItem, RawExtractedProduct } from "./src/utils/pickingLogic";

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

// Global Gemini AI client instance (server-side only)
let aiClient: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

app.post("/api/consolidate", async (req, res) => {
  try {
    const { files, accountNames, useGeminiAI } = req.body as {
      files: UploadedPdfPayload[];
      accountNames: string[];
      useGeminiAI?: boolean;
    };

    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        error: "Debes adjuntar al menos un archivo PDF para procesar la consolidación.",
      });
    }

    const names = Array.isArray(accountNames) && accountNames.length === 5
      ? accountNames
      : ["Cuenta ML 1", "Cuenta ML 2", "Cuenta ML 3", "Cuenta ML 4", "Cuenta ML 5"];

    // 1. Ejecutar procesamiento determinista directo para establecer la línea base de conteo 100% verificado
    const deterministicResult = await consolidatePdfsDeterministically(files, names);
    const deterministicUnits = deterministicResult.items.reduce((acc, i) => acc + i.totalPreparar, 0);

    // 2. Intentar extracción Híbrida con Gemini AI si el cliente está configurado
    if (aiClient && useGeminiAI !== false) {
      try {
        console.log("Iniciando extracción con Gemini AI (gemini-3.8-flash)...");
        const allRawExtracted: RawExtractedProduct[] = [];
        const mergedMap = new Map<string, PickingItem>();

        for (const file of files) {
          const slotIdx = file.slotIndex;
          if (slotIdx < 0 || slotIdx > 4) continue;

          const cleanBase64 = file.base64Data.includes(",")
            ? file.base64Data.split(",")[1]
            : file.base64Data;

          const prompt = `Analiza este documento PDF de Mercado Libre (cuenta: ${names[slotIdx]}).
Extrae absolutamente TODOS los productos listados en TODAS las páginas sin omitir ninguna etiqueta ni envío.

REGLAS DE EXTRACCIÓN Y AGRUPACIÓN POR SKU:
1. Para cada producto, extrae obligatoriamente el código SKU completo que figura exactamente debajo del título del producto (marcado como "SKU: ...").
2. En el campo "sku", coloca la cadena completa y exacta de SKU tal como aparece en la planilla, sin recortar ni abreviar (ejemplos reales: "orilladora bencinera tasbel 37´´", "setjardine5en1 0116-40", "0040 grande - 22", "Perchero Circular - 12´´").
3. Es OBLIGATORIO agrupar los registros basándose ÚNICAMENTE en la coincidencia del código SKU. NO agrupes por título ni por nombre de producto. Si dos productos tienen nombres o palabras distintas pero poseen el mismo SKU exacto, pertenecen al mismo producto y deben unificarse sumando sus cantidades.
4. Extrae también el título o nombre principal del producto y la cantidad exacta de unidades enviadas ("Cantidad: ...").

Responde únicamente en el formato JSON estructurado especificado.`;

          const aiResponse = await aiClient.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [
              {
                inlineData: {
                  mimeType: file.mimeType || "application/pdf",
                  data: cleanBase64,
                },
              },
              { text: prompt },
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sku: { type: Type.STRING, description: "Código SKU o código de vendedor exacto" },
                    producto: { type: Type.STRING, description: "Título o descripción del producto" },
                    cantidad: { type: Type.INTEGER, description: "Cantidad de unidades enviadas o vendidas" },
                  },
                  required: ["sku", "cantidad"],
                },
              },
            },
          });

          const jsonText = (aiResponse.text ?? "[]").trim();
          let parsedArray: Array<{ sku: string; producto?: string; cantidad: number }> = [];
          try {
            parsedArray = JSON.parse(jsonText);
          } catch {
            parsedArray = [];
          }

          for (const rawItem of parsedArray) {
            const rawSku = cleanSku(rawItem.sku || "");
            if (!rawSku) continue;
            const qty = Math.max(1, Math.round(Number(rawItem.cantidad) || 1));
            const prodTitle = (rawItem.producto || rawSku).trim();

            allRawExtracted.push({
              sku: rawSku,
              producto: prodTitle,
              cantidad: qty,
              slotIndex: slotIdx,
              accountName: names[slotIdx],
            });

            const normKey = normalizeStringKey(rawSku) || rawSku.toUpperCase();
            const existing = mergedMap.get(normKey);

            if (existing) {
              if (slotIdx === 0) existing.cta1 += qty;
              else if (slotIdx === 1) existing.cta2 += qty;
              else if (slotIdx === 2) existing.cta3 += qty;
              else if (slotIdx === 3) existing.cta4 += qty;
              else if (slotIdx === 4) existing.cta5 += qty;

              existing.totalPreparar = existing.cta1 + existing.cta2 + existing.cta3 + existing.cta4 + existing.cta5;

              // Registrar variante de nombre si es diferente
              existing.variantesNombre = existing.variantesNombre || [];
              if (!existing.variantesNombre.some((v) => v.title.toLowerCase() === prodTitle.toLowerCase())) {
                existing.variantesNombre.push({
                  accountIndex: slotIdx,
                  accountName: names[slotIdx],
                  title: prodTitle,
                  quantity: qty,
                });
              }

              if (prodTitle.length > existing.producto.length) {
                existing.producto = prodTitle;
                existing.marca = detectBrand(prodTitle);
              }
            } else {
              const c1 = slotIdx === 0 ? qty : 0;
              const c2 = slotIdx === 1 ? qty : 0;
              const c3 = slotIdx === 2 ? qty : 0;
              const c4 = slotIdx === 3 ? qty : 0;
              const c5 = slotIdx === 4 ? qty : 0;

              mergedMap.set(normKey, {
                id: `item-${normKey}`,
                sku: rawSku,
                producto: prodTitle,
                marca: detectBrand(prodTitle),
                modelo: "Estándar",
                categoria: "Ferretería",
                cta1: c1,
                cta2: c2,
                cta3: c3,
                cta4: c4,
                cta5: c5,
                totalPreparar: c1 + c2 + c3 + c4 + c5,
                preparado: false,
                variantesNombre: [
                  {
                    accountIndex: slotIdx,
                    accountName: names[slotIdx],
                    title: prodTitle,
                    quantity: qty,
                  },
                ],
              });
            }
          }
        }

        const finalItems = Array.from(mergedMap.values());
        const geminiUnits = finalItems.reduce((acc, i) => acc + i.totalPreparar, 0);

        // Seguridad: Si Gemini AI devuelve menos unidades que la extracción determinista de todas las páginas,
        // usar el resultado determinista completo para garantizar que no falte ningún producto.
        if (geminiUnits >= deterministicUnits && finalItems.length > 0) {
          const auditReport = auditPickingConsolidation(allRawExtracted, finalItems);
          return res.json({
            resumenOperativo: `Consolidación Híbrida Inteligente (Gemini AI gemini-3.8-flash): Se procesaron ${files.length} archivo(s) PDF de Mercado Libre, unificando ${finalItems.length} SKUs únicos y ${geminiUnits} unidades físicas exactas entre las 5 cuentas.`,
            items: finalItems,
            auditReport,
            mode: "gemini",
          });
        } else {
          console.warn(`Gemini AI extrajo ${geminiUnits} unidades, pero el escaneo determinista halló ${deterministicUnits} unidades completas. Utilizando resultado determinista completo.`);
        }
      } catch (geminiErr) {
        console.warn("Fallo temporal en Gemini AI, alternando a modo determinista local:", geminiErr);
      }
    }

    return res.json(deterministicResult);
  } catch (error: unknown) {
    console.error("Error en /api/consolidate:", error);
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
    console.log(`FerreHousePicking server running locally on http://0.0.0.0:${PORT}`);
  });
}

startServer();

