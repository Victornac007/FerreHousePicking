import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { consolidatePdfsDeterministically } from "./src/utils/deterministicConsolidator";
import { auditPickingConsolidation } from "./src/utils/pickingLogic";

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

    const names = Array.isArray(accountNames) && accountNames.length === 5
      ? accountNames
      : ["Cuenta ML 1", "Cuenta ML 2", "Cuenta ML 3", "Cuenta ML 4", "Cuenta ML 5"];

    // 100% PROCESAMIENTO DETERMINISTA LOCAL (NODE.JS + PDF-PARSE DE ALTA VELOCIDAD Y PRECISIÓN SOBERANA)
    // Cero llamadas a APIs externas de IA, cero límites de cuota, cero errores de red o cuota.
    const deterministicResult = await consolidatePdfsDeterministically(files, names);
    const finalItems = deterministicResult.items;

    const auditReport = auditPickingConsolidation(
      deterministicResult.rawExtractedItems,
      finalItems
    );

    const totalPhysicalUnits = finalItems.reduce((acc, i) => acc + i.totalPreparar, 0);
    const auditStatusStr = auditReport.isValid
      ? "Auditoría de integridad: 100% exacto (0 discrepancias)"
      : `¡Discrepancia detectada!: ${auditReport.alertMessage}`;

    const resumenOperativo = `Consolidación de picking realizada en modo Determinista Local 100% Independiente: se procesaron ${files.length} archivo(s) PDF de Mercado Libre, consolidando ${finalItems.length} SKUs únicos y ${totalPhysicalUnits} unidades físicas exactas. ${auditStatusStr}.`;

    return res.json({
      resumenOperativo,
      items: finalItems,
      auditReport,
    });
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
