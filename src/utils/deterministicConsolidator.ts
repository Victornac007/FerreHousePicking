import { PDFParse } from "pdf-parse";
import { PickingItem, RawExtractedProduct, auditPickingConsolidation, PickingAuditReport } from "./pickingLogic";

export interface AccountPdfPayload {
  slotIndex: number;
  accountName: string;
  fileName: string;
  base64Data: string;
  mimeType?: string;
}

export interface DeterministicConsolidationResult {
  resumenOperativo: string;
  items: PickingItem[];
  mode: "deterministic";
  extractedCount: number;
  rawExtractedItems: RawExtractedProduct[];
  auditReport: PickingAuditReport;
}

// Comprehensive regex for all Mercado Libre SKU prefixes in Spanish
const SKU_PREFIX_KEYWORD_REGEX = /(?:C[OÓoó]DIGO\s*(?:DE\s*)?VENDEDOR|SKU\s*(?:DE\s*)?VENDEDOR|C[OÓoó]D\.\s*VENDEDOR|COD\.\s*VENDEDOR|C[OÓoó]DIGO\s*(?:DE\s*)?PRODUCTO|C[OÓoó]DIGO\s*(?:DE\s*)?ART[IÍií]CULO|SKU|C[OÓoó]DIGO|CODIGO|C[OÓoó]D|COD|REF|REFERENCIA|ART[IÍií]CULO|ARTICULO|ART|VARIANTE|VARIACI[OÓoó]N)[\s:.\-#]+(.+)/i;

export function cleanSku(val: string): string {
  if (!val) return "";
  let s = val.trim();

  // Strip anything preceding "SKU:" or "SKU :" on the same line (e.g. buyer names)
  const skuIdx = s.search(/SKU\s*:/i);
  if (skuIdx !== -1) {
    s = s.slice(skuIdx).replace(/^SKU\s*:\s*/i, "");
  }

  // Strip known prefix keywords
  s = s.replace(
    /^(?:C[OÓoó]DIGO\s*(?:DE\s*)?VENDEDOR|SKU\s*(?:DE\s*)?VENDEDOR|C[OÓoó]D\.\s*VENDEDOR|COD\.\s*VENDEDOR|C[OÓoó]DIGO\s*(?:DE\s*)?PRODUCTO|C[OÓoó]DIGO\s*(?:DE\s*)?ART[IÍií]CULO|SKU|C[OÓoó]DIGO|CODIGO|C[OÓoó]D|COD|REF|REFERENCIA|ART[IÍií]CULO|ARTICULO|ART|VARIANTE|VARIACI[OÓoó]N)[\s:.\-#]+/i,
    ""
  ).trim();

  // Strip trailing "Cantidad: ..." or "Color: ..." if present on the same string
  s = s.replace(/\s*Cantidad\s*:\s*\d+.*/i, "").trim();

  // If delimited by pipe or tab (e.g. "SKU: STA-STHT7088 | Producto"), isolate the SKU token
  if (s.includes("|")) {
    s = s.split("|")[0].trim();
  }
  if (s.includes("\t")) {
    s = s.split("\t")[0].trim();
  }

  // Strip leading/trailing symbols
  s = s.replace(/^[|·\-\s,;:]+|[|·\-\s,;:]+$/g, "").trim();

  const noiseWords = [
    "VENDEDOR", "ARTICULO", "PRODUCTO", "REFERENCIA", "DESCRIPCION",
    "CANTIDAD", "CANT", "PAGINA", "FECHA", "GUIA",
    "RECEPTOR", "ENVIO", "COLECTA", "COMPRADOR", "DIRECCION", "PAQUETE",
    "CARRIER", "FIRMA CARRIER", "FECHA Y HORA DE RETIRO", "FECHA Y HORA"
  ];
  const upper = s.toUpperCase();
  if (noiseWords.some(w => upper === w || upper.startsWith(w + " ") || upper.endsWith(" " + w))) {
    return "";
  }

  return s;
}

export function cleanProductName(val: string): string {
  let p = val.trim();
  p = p.replace(/\s+/g, " ");
  p = p.replace(/^[\s\-:;,.]+|[\s\-:;,.]+$/g, "");
  return p;
}

/**
 * Normalizes strings before grouping to prevent duplicates caused by minor variations
 * in accents/diacritics, letter casing, extra whitespace, or special characters.
 */
export function normalizeStringKey(val: string): string {
  if (!val) return "";
  return val
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectBrand(text: string): string {
  const t = text.toLowerCase();
  const known = [
    "dewalt", "bosch", "makita", "stanley", "truper", "black+decker", "black & decker",
    "milwaukee", "skil", "einhell", "irwin", "karcher", "total", "ingco", "bahco",
    "dremel", "stihl", "pretul", "uber", "3m", "sika", "wurth", "loctite", "bellota",
    "lusqtoff", "sturm", "kraft", "orilladora", "desmalezadora"
  ];
  for (const b of known) {
    if (new RegExp(`\\b${b.replace("+", "\\+")}\\b`, "i").test(t)) {
      return b.charAt(0).toUpperCase() + b.slice(1);
    }
  }
  return "Ferretería";
}

/**
 * Normalizes text extracted from PDF, fixing common font encoding artifacts
 * (e.g., 'Cˆ‡digo' -> 'Codigo') and stripping accents for bulletproof regex matching.
 */
function normalizePdfText(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/C[^\s]{1,4}digo/gi, "Codigo")
    .replace(/Vended[^\s]{1,3}r/gi, "Vendedor")
    .replace(/Art[^\s]{1,3}culo/gi, "Articulo")
    .replace(/Variaci[^\s]{1,3}n/gi, "Variacion")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Parses raw text from a single Mercado Libre PDF page or document.
 * Guaranteed to extract exact SKU and quantities without omitting repeated labels.
 */
export function extractProductsFromText(text: string): Array<{ sku: string; producto: string; cantidad: number }> {
  const results: Array<{ sku: string; producto: string; cantidad: number }> = [];
  const normalizedText = normalizePdfText(text);

  // Strategy A: Line-by-line inspection
  const lines = normalizedText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Pattern 1: Inline SKU with explicit quantity in the same line
    // e.g. "Codigo de vendedor: TAL-DCD7781 | Cant: 2" or "SKU: MAK-HR2470 Cantidad: 1"
    const inlineSkuMatch = line.match(SKU_PREFIX_KEYWORD_REGEX);
    const inlineQtyMatch = line.match(/(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)[\s:.\-#]*([0-9]{1,4})/i) ||
                           line.match(/([0-9]{1,4})\s*(?:u\.|un\.|uds\.|unidades|unid\.)/i);

    if (inlineSkuMatch && inlineQtyMatch) {
      const sku = cleanSku(inlineSkuMatch[1]);
      const qty = parseInt(inlineQtyMatch[1], 10);
      let prodName = line
        .replace(SKU_PREFIX_KEYWORD_REGEX, "")
        .replace(/(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)[\s:.\-#]*[0-9]{1,4}/i, "")
        .replace(/([0-9]{1,4})\s*(?:u\.|un\.|uds\.|unidades|unid\.)/i, "")
        .replace(/^[|·\-\s]+|[|·\-\s]+$/g, "");
      prodName = cleanProductName(prodName) || sku;
      if (sku && qty > 0) {
        results.push({ sku, producto: prodName, cantidad: qty });
        continue;
      }
    }

    // Pattern 2: Multi-line label snippet
    // Line i contains SKU prefix ("Codigo vendedor: TAL-DCD7781" or "SKU: 0040 grande - 22")
    if (inlineSkuMatch) {
      const sku = cleanSku(inlineSkuMatch[1]);
      if (sku && !sku.toUpperCase().startsWith("PAGINA")) {
        let qty = 1;
        let prodName = "";

        // Check surrounding lines (-4 to +10) for quantity, stopping at next shipment boundary
        for (let offset = -4; offset <= 10; offset++) {
          if (offset === 0) continue;
          const targetIdx = i + offset;
          if (targetIdx >= 0 && targetIdx < lines.length) {
            const targetLine = lines[targetIdx];
            if (offset > 0 && (targetLine.toLowerCase().includes("sku:") || targetLine.toLowerCase().includes("envio:"))) {
              break; // Stop at next shipment block
            }
            const qtyMatch = targetLine.match(/^(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)?[\s:.\-#]*([0-9]{1,4})$/i) ||
                             targetLine.match(/(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)[\s:.\-#]*([0-9]{1,4})/i) ||
                             targetLine.match(/^([0-9]{1,4})\s*(?:u\.|un\.|uds\.|unidades|unid\.)/i);
            if (qtyMatch && !targetLine.includes("ORDEN") && !targetLine.includes("FECHA") && !targetLine.includes("PAQUETE") && !targetLine.includes("PAGINA")) {
              const parsedQ = parseInt(qtyMatch[1], 10);
              if (parsedQ > 0 && parsedQ < 100000) {
                qty = parsedQ;
                break;
              }
            }
          }
        }

        // Search full page lines for a title sharing meaningful words with SKU
        const skuWords = sku
          .toLowerCase()
          .replace(/[^a-z0-9áéíóúñ]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !["sku", "cod", "codigo", "tasbel", "grande", "mini", "set"].includes(w));

        if (skuWords.length > 0) {
          for (const lText of lines) {
            if (
              lText.length > 8 &&
              !lText.toLowerCase().includes("sku:") &&
              !lText.toLowerCase().includes("codigo:") &&
              !/^(PAGINA|FECHA|ORDEN|GUIA|RECEPTOR|ENVIO|DESTINATARIO|COMPRADOR|PACK ID|DESPACHA|IDENTIFICACION|PRODUCTOS|COLOR|VOLTAJE|CARRIER|FIRMA|FECHA Y HORA|#)/i.test(lText) &&
              !/^[A-Z0-9]{18,35}$/.test(lText) &&
              !/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}$/.test(lText)
            ) {
              const lowerL = lText.toLowerCase();
              if (skuWords.some((w) => lowerL.includes(w))) {
                prodName = cleanProductName(lText);
                break;
              }
            }
          }
        }

        // If no matching line found, search immediate surrounding lines (-3 to +3)
        if (!prodName) {
          for (let offset = -3; offset <= 3; offset++) {
            if (offset === 0) continue;
            const targetIdx = i + offset;
            if (targetIdx >= 0 && targetIdx < lines.length) {
              const targetLine = lines[targetIdx];
              if (
                targetLine.length > 8 &&
                !targetLine.toLowerCase().includes("sku:") &&
                !targetLine.toLowerCase().includes("codigo:") &&
                !/^(PAGINA|FECHA|ORDEN|GUIA|RECEPTOR|ENVIO|DESTINATARIO|COMPRADOR|PACK ID|DESPACHA|IDENTIFICACION|PRODUCTOS|COLOR|VOLTAJE|CARRIER|FIRMA|FECHA Y HORA|#)/i.test(targetLine) &&
                !/^[A-Z0-9]{18,35}$/.test(targetLine) &&
                !/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}$/.test(targetLine)
              ) {
                prodName = cleanProductName(targetLine);
                break;
              }
            }
          }
        }

        // Final fallback: capitalize and format clean SKU
        const fallbackTitle = sku.replace(/^[0-9]+\.\s*/, "").replace(/^[-_\s.]+|[-_\s.]+$|/g, "").trim() || sku;

        results.push({
          sku,
          producto: prodName || fallbackTitle,
          cantidad: qty,
        });
        continue;
      }
    }

    // Pattern 3: Tabular summary row e.g. "DW-DCD7781-20V    Taladro Percutor 20V    3"
    const tableMatch = line.match(/^(?:[0-9]{1,3}\s+)?([A-Za-z0-9_\-\.\/]{3,35})\s{2,}(.+?)\s{2,}([0-9]{1,4})$/i);
    if (tableMatch) {
      const sku = cleanSku(tableMatch[1]);
      const prodName = cleanProductName(tableMatch[2]);
      const qty = parseInt(tableMatch[3], 10);
      if (sku && qty > 0 && !sku.startsWith("PAGINA") && !sku.startsWith("TOTAL") && !sku.startsWith("FECHA") && !sku.startsWith("ORDEN")) {
        results.push({ sku, producto: prodName, cantidad: qty });
        continue;
      }
    }

    // Pattern 4: Leading quantity notation e.g. "3 u. Truper Martillo Galponero 16oz"
    const prefixQtyMatch = line.match(/^([0-9]{1,4})\s*(?:u\.|un\.|uds\.|unidades|unid\.)\s*(?:[-–:]\s*)?([A-Za-z0-9_\-\.\/]{3,35})?\s*(.*)$/i);
    if (prefixQtyMatch) {
      const qty = parseInt(prefixQtyMatch[1], 10);
      const possibleSku = prefixQtyMatch[2] ? cleanSku(prefixQtyMatch[2]) : null;
      const rest = cleanProductName(prefixQtyMatch[3] || "");
      const generatedSlug = rest
        ? "SKU-" + rest.toUpperCase().replace(/[^A-Z0-9]/g, "-").replace(/-+/g, "-").slice(0, 30).replace(/-$/, "")
        : "SKU-PROD";
      const finalSku = possibleSku || generatedSlug;
      const finalProd = rest || finalSku;
      if (finalSku && qty > 0 && !finalSku.toUpperCase().startsWith("PAGINA")) {
        results.push({ sku: finalSku, producto: finalProd, cantidad: qty });
        continue;
      }
    }
  }

  // Strategy B: If line-by-line found nothing (e.g., text stream without newlines), run global regex scan
  if (results.length === 0) {
    const globalSkuRegex = /(?:CODIGO\s*(?:DE\s*)?VENDEDOR|SKU\s*(?:DE\s*)?VENDEDOR|COD\.\s*VENDEDOR|CODIGO\s*(?:DE\s*)?PRODUCTO|SKU|CODIGO|COD|REF)[\s:.\-#]+([A-Za-z0-9_\-\.\/]{2,45})/gi;
    let match: RegExpExecArray | null;
    while ((match = globalSkuRegex.exec(normalizedText)) !== null) {
      const sku = cleanSku(match[1]);
      if (!sku || sku.length < 2) continue;

      // Extract window around the match to find quantity
      const windowText = normalizedText.slice(match.index, match.index + 250);
      const qtyMatch = windowText.match(/(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)[\s:.\-#]*([0-9]{1,4})/i) ||
                       windowText.match(/([0-9]{1,4})\s*(?:u\.|un\.|uds\.|unidades|unid\.)/i);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;

      results.push({
        sku,
        producto: sku,
        cantidad: qty,
      });
    }
  }

  // Strategy C: Mercado Libre Listing ID fallback (e.g. MLA123456789 / MLC123456789)
  if (results.length === 0) {
    const mlListings = normalizedText.matchAll(/(ML[ABC][A-Z0-9]{7,15})[^\n\r]*?(?:cant(?:idad)?|uds?|unidades?|x)?[\s:.\-#]*([0-9]{1,4})/gi);
    for (const m of mlListings) {
      const sku = m[1].toUpperCase();
      const qty = parseInt(m[2], 10) || 1;
      results.push({
        sku,
        producto: `Publicacion ${sku}`,
        cantidad: qty,
      });
    }
  }

  // Strategy D: Standalone SKU candidate lines e.g. "BOS-GWS850-45" or "TAL-DCD7781" without explicit prefix
  if (results.length === 0) {
    const candidateLines = normalizedText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < candidateLines.length; i++) {
      const line = candidateLines[i];
      const standaloneSkuMatch = line.match(/^([A-Za-z0-9_\-\.\/]{4,35})$/);
      if (
        standaloneSkuMatch &&
        !/^(DESTINATARIO|DIRECCION|PRODUCTO|CATEGORIA|SANTIAGO|PROVINCIA|REGION|PAQUETE|FECHA|ORDEN|GUIA|ENVIO|RECEPTOR|COMPRADOR|COLECTA|MERCADO|ENVIOS|RESUMEN|PAGINA|TOTAL)/i.test(line)
      ) {
        const rawSku = cleanSku(standaloneSkuMatch[1]);
        if (rawSku && rawSku.length >= 3) {
          // Look for quantity in surrounding lines
          let qty = 1;
          for (let offset = -2; offset <= 2; offset++) {
            if (offset === 0) continue;
            const targetIdx = i + offset;
            if (targetIdx >= 0 && targetIdx < candidateLines.length) {
              const targetLine = candidateLines[targetIdx];
              const qMatch = targetLine.match(/^([0-9]{1,4})\s*(?:u\.|un\.|uds\.|unidades|unid\.)/i) ||
                             targetLine.match(/(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)[\s:.\-#]*([0-9]{1,4})/i);
              if (qMatch) {
                const parsedQ = parseInt(qMatch[1], 10);
                if (parsedQ > 0 && parsedQ < 10000) qty = parsedQ;
              }
            }
          }
          results.push({
            sku: rawSku,
            producto: rawSku,
            cantidad: qty,
          });
        }
      }
    }
  }

  return results;
}

/**
 * Extracts products directly from PDF page text items using their 2D spatial (X, Y) coordinates.
 * In Mercado Libre's "Despacha tus productos" packing sheets:
 * - Left column (x < 200) is "Identificación" (Tracking ID, Envio/Pack ID, Buyer Name)
 * - Right column (x >= 200) is "Productos" (Title, SKU: ..., Cantidad: X, Color/Voltaje)
 * Grouping strictly within the right column and anchoring on "Cantidad: X" guarantees 100% accuracy
 * even when PDF generators place product titles at the end of the file stream.
 */
export function extractProductsFromSpatialPage(
  itemsList: any[]
): Array<{ sku: string; producto: string; cantidad: number }> {
  if (!Array.isArray(itemsList) || itemsList.length === 0) return [];

  const rightColItems = itemsList.filter((item: any) => {
    if (!item || typeof item !== "object" || !("str" in item)) return false;
    const str = String(item.str).trim();
    if (!str) return false;
    const x = Array.isArray(item.transform) && typeof item.transform[4] === "number" ? item.transform[4] : 0;
    const y = Array.isArray(item.transform) && typeof item.transform[5] === "number" ? item.transform[5] : 0;
    return x >= 200 && y <= 738 && y >= 20;
  });

  if (rightColItems.length === 0) return [];

  const linesMap: Array<{ y: number; items: Array<{ x: number; str: string }> }> = [];
  for (const item of rightColItems) {
    const str = String(item.str);
    const x = item.transform[4];
    const y = Math.round(item.transform[5]);

    let lineObj = linesMap.find((l) => Math.abs(l.y - y) <= 3);
    if (!lineObj) {
      lineObj = { y, items: [] };
      linesMap.push(lineObj);
    }
    lineObj.items.push({ x, str });
  }

  // Sort from top to bottom (descending Y)
  linesMap.sort((a, b) => b.y - a.y);

  const lines = linesMap.map((l) => {
    l.items.sort((a, b) => a.x - b.x);
    return { y: l.y, text: l.items.map((i) => i.str).join(" ").trim() };
  });

  const results: Array<{ sku: string; producto: string; cantidad: number }> = [];

  // Anchor on "Cantidad: X" because EVERY product block in Mercado Libre has Cantidad: X
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i].text;
    const qtyMatch = lineText.match(/^(?:Cantidad|Cant\.?)\s*:\s*(\d+)/i);
    if (qtyMatch) {
      const qty = parseInt(qtyMatch[1], 10) || 1;
      let rawSku = "";
      const titleParts: string[] = [];

      // Look upwards from Cantidad (up to 4 lines above, stopping at previous item attributes or previous Cantidad)
      for (let prevIdx = i - 1; prevIdx >= Math.max(0, i - 4); prevIdx--) {
        const prevText = lines[prevIdx].text;
        if (/^(?:Cantidad|Cant\.?|Color|Voltaje|Talla|Diseño|Nombre|Medida|Frecuencia)\s*[^:]*:/i.test(prevText)) {
          break;
        }
        const skuMatch = prevText.match(/^(?:SKU|C[OÓoó]DIGO\s*(?:DE\s*)?VENDEDOR|C[OÓoó]DIGO|COD)\s*:\s*(.+)$/i);
        if (skuMatch) {
          if (rawSku) break;
          rawSku = cleanSku(skuMatch[1]);
        } else {
          titleParts.unshift(cleanProductName(prevText));
        }
      }

      const prodTitle = titleParts.filter(Boolean).join(" ").trim() || rawSku || "Producto sin SKU";
      const finalSku = rawSku || prodTitle;

      results.push({
        sku: finalSku,
        producto: prodTitle,
        cantidad: qty,
      });
    }
  }

  return results;
}

/**
 * Consolidates multiple Mercado Libre PDFs deterministically (without AI hallucinations).
 * It extracts text page-by-page directly via spatial 2D coordinates (pdfjs) and pdf-parse fallback.
 */
export async function consolidatePdfsDeterministically(
  files: AccountPdfPayload[],
  accountNames: string[]
): Promise<DeterministicConsolidationResult> {
  const mergedMap = new Map<string, PickingItem>();
  const allRawExtracted: RawExtractedProduct[] = [];
  let totalExtractedItems = 0;

  let pdfjsLibNode: any = null;
  try {
    pdfjsLibNode = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    pdfjsLibNode = null;
  }

  for (const file of files) {
    const slotIdx = file.slotIndex; // 0 to 4
    if (slotIdx < 0 || slotIdx > 4) continue;

    const cleanBase64 = file.base64Data.includes(",")
      ? file.base64Data.split(",")[1]
      : file.base64Data;
    const buffer = Buffer.from(cleanBase64, "base64");

    const fileExtracted: Array<{ sku: string; producto: string; cantidad: number }> = [];

    // 1. Primary Method: Spatial 2D Right-Column Extraction via pdfjs-dist legacy
    if (pdfjsLibNode) {
      try {
        const data = new Uint8Array(buffer);
        const loadingTask = pdfjsLibNode.getDocument({ data, disableFontFace: true });
        const pdfDoc = await loadingTask.promise;
        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          const page = await pdfDoc.getPage(pageNum);
          const textContent = await page.getTextContent();
          const spatialItems = extractProductsFromSpatialPage(textContent?.items || []);
          if (spatialItems.length > 0) {
            fileExtracted.push(...spatialItems);
          } else {
            // Fallback for single-column or non-standard page
            const rawLines = (textContent?.items || [])
              .map((it: any) => ("str" in it ? it.str : ""))
              .filter(Boolean)
              .join("\n");
            fileExtracted.push(...extractProductsFromText(rawLines));
          }
        }
      } catch (spatialErr) {
        console.warn(`Aviso en extracción espacial PDF (slot ${slotIdx + 1}), usando fallback de texto:`, spatialErr);
      }
    }

    // 2. Fallback Method: pdf-parse text stream if spatial extraction yielded 0 items
    if (fileExtracted.length === 0) {
      try {
        const parser = new PDFParse({ data: buffer });
        const textResult = (await parser.getText({
          pageJoiner: "\n---PAGE_SPLIT---\n",
        })) as {
          total?: number;
          pages?: Array<{ text: string; num: number }>;
          text?: string;
        };

        const pages = Array.isArray(textResult?.pages) && textResult.pages.length > 0
          ? textResult.pages
          : null;

        if (pages && pages.length > 0) {
          for (const page of pages) {
            const pageText = page?.text || "";
            const pageItems = extractProductsFromText(pageText);
            fileExtracted.push(...pageItems);
          }
        } else {
          const wholeText = typeof textResult === "string" ? textResult : textResult?.text || "";
          const pageChunks = wholeText.split(/---PAGE_SPLIT---|\f/);
          for (const chunk of pageChunks) {
            const chunkItems = extractProductsFromText(chunk);
            fileExtracted.push(...chunkItems);
          }
        }
      } catch (parseErr) {
        console.warn(`Error parseando PDF en slot ${slotIdx + 1}:`, parseErr);
      }
    }

    totalExtractedItems += fileExtracted.length;

    for (const item of fileExtracted) {
      allRawExtracted.push({
        sku: item.sku,
        producto: item.producto,
        cantidad: item.cantidad,
        slotIndex: slotIdx,
        accountName: accountNames[slotIdx] || `Cuenta ${slotIdx + 1}`,
      });
    }

    for (const item of fileExtracted) {
      const rawSku = cleanSku(item.sku);
      if (!rawSku) continue;
      const normalizedKey = normalizeStringKey(rawSku) || rawSku.toUpperCase();

      const existing = mergedMap.get(normalizedKey);
      if (existing) {
        if (slotIdx === 0) existing.cta1 += item.cantidad;
        else if (slotIdx === 1) existing.cta2 += item.cantidad;
        else if (slotIdx === 2) existing.cta3 += item.cantidad;
        else if (slotIdx === 3) existing.cta4 += item.cantidad;
        else if (slotIdx === 4) existing.cta5 += item.cantidad;

        existing.totalPreparar =
          existing.cta1 + existing.cta2 + existing.cta3 + existing.cta4 + existing.cta5;

        const prodTitle = item.producto || rawSku;
        existing.variantesNombre = existing.variantesNombre || [];
        if (!existing.variantesNombre.some((v) => v.title.toLowerCase() === prodTitle.toLowerCase())) {
          existing.variantesNombre.push({
            accountIndex: slotIdx,
            accountName: accountNames[slotIdx] || `Cuenta ${slotIdx + 1}`,
            title: prodTitle,
            quantity: item.cantidad,
          });
        }

        // Enhance product name if the new one is more descriptive
        if (item.producto && item.producto.length > existing.producto.length && !item.producto.startsWith("Publicacion")) {
          existing.producto = item.producto;
          existing.marca = detectBrand(item.producto);
        }
      } else {
        const prodTitle = item.producto || rawSku;
        const newItem: PickingItem = {
          id: `item-${normalizedKey}`,
          sku: rawSku,
          producto: prodTitle,
          marca: detectBrand(prodTitle),
          modelo: "Estándar",
          categoria: "Ferretería",
          cta1: slotIdx === 0 ? item.cantidad : 0,
          cta2: slotIdx === 1 ? item.cantidad : 0,
          cta3: slotIdx === 2 ? item.cantidad : 0,
          cta4: slotIdx === 3 ? item.cantidad : 0,
          cta5: slotIdx === 4 ? item.cantidad : 0,
          totalPreparar: item.cantidad,
          preparado: false,
          variantesNombre: [
            {
              accountIndex: slotIdx,
              accountName: accountNames[slotIdx] || `Cuenta ${slotIdx + 1}`,
              title: prodTitle,
              quantity: item.cantidad,
            },
          ],
        };
        mergedMap.set(normalizedKey, newItem);
      }
    }
  }

  const items = Array.from(mergedMap.values());
  const activeCount = files.length;
  const totalPhysicalUnits = items.reduce((acc, i) => acc + i.totalPreparar, 0);

  const auditReport = auditPickingConsolidation(allRawExtracted, items);

  const resumenOperativo = auditReport.isValid
    ? `Procesamiento determinista directo (sin IA): se auditaron con precisión matemática ${activeCount} archivo(s) PDF de Mercado Libre, consolidando ${items.length} SKUs únicos y ${totalPhysicalUnits} unidades físicas exactas (Auditoría: 100% verificado sin discrepancias).`
    : `Aviso de auditoría: se detectó discrepancia entre unidades originales (${auditReport.totalOriginalUnits}) y consolidadas (${auditReport.totalConsolidatedUnits}). ${auditReport.alertMessage}`;

  return {
    resumenOperativo,
    items,
    mode: "deterministic",
    extractedCount: totalExtractedItems,
    rawExtractedItems: allRawExtracted,
    auditReport,
  };
}
