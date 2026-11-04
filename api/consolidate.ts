import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";

interface UploadedPdfPayload {
  slotIndex: number;
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
              "Código SKU unificado o código de referencia del producto (en mayúsculas, sin espacios extra).",
          },
          producto: {
            type: Type.STRING,
            description:
              "Nombre comercial estandarizado y claro del producto.",
          },
          marca: {
            type: Type.STRING,
            description: "Marca del producto o herramienta.",
          },
          modelo: {
            type: Type.STRING,
            description: "Modelo o especificación técnica clave del producto.",
          },
          categoria: {
            type: Type.STRING,
            description: "Categoría ferretera.",
          },
          ubicacionSugerida: {
            type: Type.STRING,
            description: "Pasillo/Estante de bodega sugerido.",
          },
          cta1: { type: Type.INTEGER },
          cta2: { type: Type.INTEGER },
          cta3: { type: Type.INTEGER },
          cta4: { type: Type.INTEGER },
          cta5: { type: Type.INTEGER },
          totalPreparar: { type: Type.INTEGER },
        },
        required: [
          "sku",
          "producto",
          "marca",
          "modelo",
          "categoria",
          "ubicacionSugerida",
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

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

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
          "No se encontró la variable de entorno GEMINI_API_KEY en el servidor.",
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

    const names =
      Array.isArray(accountNames) && accountNames.length === 5
        ? accountNames
        : [
            "Cuenta ML 1",
            "Cuenta ML 2",
            "Cuenta ML 3",
            "Cuenta ML 4",
            "Cuenta ML 5",
          ];

    const systemInstruction = `Eres el motor experto de auditoría y consolidación logística de bodega para "FerreHousePicking", especializado en comercio electrónico de ferretería industrial y Mercado Libre (Mercado Envíos / Colecta / Flex).

TU MISIÓN CRÍTICA:
Analizar simultáneamente los archivos PDF adjuntos correspondientes a hasta 5 cuentas distintas de Mercado Libre:
- Cuenta 1 (cta1): "${names[0]}"
- Cuenta 2 (cta2): "${names[1]}"
- Cuenta 3 (cta3): "${names[2]}"
- Cuenta 4 (cta4): "${names[3]}"
- Cuenta 5 (cta5): "${names[4]}"

REGLAS OBLIGATORIAS DE EXTRACCIÓN Y HOMOLOGACIÓN:
1. Identifica TODOS los productos vendidos y sus cantidades exactas en cada uno de los PDFs adjuntos.
2. Unifica y homologa productos idénticos entre las 5 cuentas en una sola fila consolidada (agrupándolos por SKU, modelo y marca aunque el título varíe en mayúsculas o espacios).
3. Asigna las cantidades vendidas en la propiedad correspondiente a la cuenta de origen (cta1 a cta5).
4. Calcula 'totalPreparar' como la suma exacta: cta1 + cta2 + cta3 + cta4 + cta5.`;

    const parts: Array<
      | { text: string }
      | { inlineData: { mimeType: string; data: string } }
    > = [
      {
        text: `Procesa y consolida los siguientes ${files.length} archivo(s) PDF de resúmenes de ventas / órdenes de preparación de Mercado Libre.`,
      },
    ];

    for (const file of files) {
      const slotNumber = file.slotIndex + 1;
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

    return res.status(200).json(parsed);
  } catch (error: unknown) {
    const errMsg =
      error instanceof Error
        ? error.message
        : "Error inesperado al procesar los archivos PDF.";
    return res.status(500).json({ error: errMsg });
  }
}
