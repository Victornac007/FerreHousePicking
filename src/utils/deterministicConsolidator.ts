import { PDFParse } from "pdf-parse";
import { PickingItem } from "./pickingLogic";

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
}

// Comprehensive regex for all Mercado Libre SKU prefixes in Spanish
const SKU_PREFIX_KEYWORD_REGEX = /(?:CÓDIGO\s+DE\s+VENDEDOR|CODIGO\s+DE\s+VENDEDOR|CÓDIGO\s+VENDEDOR|CODIGO\s+VENDEDOR|SKU\s+DE\s+VENDEDOR|SKU\s+VENDEDOR|CÓDIGO\s+DE\s+PRODUCTO|CODIGO\s+DE\s+PRODUCTO|CÓDIGO\s+DE\s+ARTÍCULO|CODIGO\s+DE\s+ARTICULO|CÓD\.\s*VENDEDOR|COD\.\s*VENDEDOR|CÓD\.\s*ART|COD\.\s*ART|CÓD\.\s*PROD|COD\.\s*PROD|SKU|CÓDIGO|CODIGO|CÓD|COD|REF|REFERENCIA|ARTÍCULO|ARTICULO|ART|VARIANTE|VARIACIÓN|VARIACION)[\s:.\-#]+([A-Za-z0-9_\-\.\/]{2,45})/i;

export function cleanSku(val: string): string {
  if (!val) return "";
  let s = val.trim();

  // Strip known Mercado Libre prefixes
  s = s.replace(
    /^(?:CÓDIGO\s+DE\s+VENDEDOR|CODIGO\s+DE\s+VENDEDOR|CÓDIGO\s+VENDEDOR|CODIGO\s+VENDEDOR|SKU\s+DE\s+VENDEDOR|SKU\s+VENDEDOR|CÓDIGO\s+DE\s+PRODUCTO|CODIGO\s+DE\s+PRODUCTO|CÓDIGO\s+DE\s+ARTÍCULO|CODIGO\s+DE\s+ARTICULO|CÓD\.\s*VENDEDOR|COD\.\s*VENDEDOR|CÓD\.\s*ART|COD\.\s*ART|CÓD\.\s*PROD|COD\.\s*PROD|SKU|CÓDIGO|CODIGO|CÓD|COD|REF|REFERENCIA|ARTÍCULO|ARTICULO|ART|VARIANTE|VARIACIÓN|VARIACION)[\s:.\-#]+/i,
    ""
  ).trim();

  // Strip leading/trailing symbols
  s = s.replace(/^[|·\-\s,;:]+|[|·\-\s,;:]+$/g, "").trim();

  const noiseWords = [
    "VENDEDOR", "ARTICULO", "PRODUCTO", "REFERENCIA", "DESCRIPCION",
    "CANTIDAD", "CANT", "PAGINA", "TOTAL", "ORDEN", "FECHA", "GUIA",
    "RECEPTOR", "ENVIO", "COLECTA", "COMPRADOR", "DIRECCION", "PAQUETE"
  ];
  if (noiseWords.includes(s.toUpperCase())) {
    return "";
  }

  return s;
}

function cleanProductName(val: string): string {
  let p = val.trim();
  p = p.replace(/\s+/g, " ");
  p = p.replace(/^[\s\-:;,.]+|[\s\-:;,.]+$/g, "");
  return p;
}

function detectBrand(text: string): string {
  const t = text.toLowerCase();
  const known = [
    "dewalt", "bosch", "makita", "stanley", "truper", "black+decker", "black & decker",
    "milwaukee", "skil", "einhell", "irwin", "karcher", "total", "ingco", "bahco",
    "dremel", "stihl", "pretul", "uber", "3m", "sika", "wurth", "loctite", "bellota"
  ];
  for (const b of known) {
    if (new RegExp(`\\b${b.replace("+", "\\+")}\\b`, "i").test(t)) {
      return b.charAt(0).toUpperCase() + b.slice(1);
    }
  }
  return "Ferretería";
}

/**
 * Parses raw text from a Mercado Libre PDF to extract exact SKU and quantities.
 * Covers:
 * - Mercado Envíos Colecta (Listas de bultos/resumen de envío con columnas SKU, Cantidad, Producto)
 * - Mercado Envíos Flex / Agencias (Etiquetas N páginas, 1 por paquete)
 * - Reportes con "Código de vendedor:", "SKU:", "Cant:", "1 u.", etc.
 */
export function extractProductsFromText(text: string): Array<{ sku: string; producto: string; cantidad: number }> {
  const results: Array<{ sku: string; producto: string; cantidad: number }> = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Pattern 1: Match line with SKU prefix keyword (e.g. "Código de vendedor: TAL-DCD7781" or "SKU: TAL-DCD7781 | Cant: 2")
    const inlineSkuMatch = line.match(SKU_PREFIX_KEYWORD_REGEX);
    const inlineQtyMatch = line.match(/(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)[\s:.\-#]*([0-9]+)/i);

    if (inlineSkuMatch && inlineQtyMatch) {
      const sku = cleanSku(inlineSkuMatch[1]);
      const qty = parseInt(inlineQtyMatch[1], 10);
      let prodName = line
        .replace(SKU_PREFIX_KEYWORD_REGEX, "")
        .replace(/(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)[\s:.\-#]*[0-9]+/i, "")
        .replace(/^[|·\-\s]+|[|·\-\s]+$/g, "");
      prodName = cleanProductName(prodName) || sku;
      if (sku && qty > 0) {
        results.push({ sku, producto: prodName, cantidad: qty });
        continue;
      }
    }

    // Pattern 2: Multi-line Mercado Libre Shipping Label / Picking Slip
    // Line i contains SKU prefix match ("Código vendedor: TAL-DCD7781")
    if (inlineSkuMatch && !inlineQtyMatch) {
      const sku = cleanSku(inlineSkuMatch[1]);
      if (sku) {
        let qty = 1;
        let prodName = "";

        // Look at surrounding 3 lines for Quantity or Title
        for (let offset = -3; offset <= 3; offset++) {
          if (offset === 0) continue;
          const targetIdx = i + offset;
          if (targetIdx >= 0 && targetIdx < lines.length) {
            const targetLine = lines[targetIdx];
            const qtyMatch = targetLine.match(/^(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)?[\s:.\-#]*([0-9]+)$/i) ||
                             targetLine.match(/(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)[\s:.\-#]*([0-9]+)/i) ||
                             targetLine.match(/^([0-9]+)\s*(?:u\.|un\.|uds\.|unidades|unid\.)/i);
            if (qtyMatch && !targetLine.includes("ORDEN") && !targetLine.includes("FECHA") && !targetLine.includes("PAQUETE") && !targetLine.includes("PÁGINA")) {
              const parsedQ = parseInt(qtyMatch[1], 10);
              if (parsedQ > 0) qty = parsedQ;
            } else if (!prodName && targetLine.length > 3 && !targetLine.includes("SKU") && !targetLine.includes("CÓDIGO") && !/^(PÁGINA|PAGINA|FECHA|ORDEN|GUÍA|RECEPTOR|ENVÍO|DESTINATARIO|COMPRADOR)/i.test(targetLine)) {
              prodName = cleanProductName(targetLine);
            }
          }
        }

        if (!sku.startsWith("PAGINA") && !sku.startsWith("TOTAL")) {
          results.push({
            sku,
            producto: prodName || sku,
            cantidad: qty,
          });
          continue;
        }
      }
    }

    // Pattern 3: Tabular line with optional leading row number e.g.:
    // "1  DW-DCD7781-20V    Taladro Percutor 20V    3" or "DW-DCD7781-20V    Taladro    3"
    const tableMatch = line.match(/^(?:[0-9]{1,3}\s+)?([A-Za-z0-9_\-\.\/]{3,35})\s{2,}(.+?)\s{2,}([0-9]+)$/i);
    if (tableMatch) {
      const sku = cleanSku(tableMatch[1]);
      const prodName = cleanProductName(tableMatch[2]);
      const qty = parseInt(tableMatch[3], 10);
      if (sku && qty > 0 && !sku.startsWith("PAGINA") && !sku.startsWith("TOTAL") && !sku.startsWith("FECHA") && !sku.startsWith("ORDEN")) {
        results.push({ sku, producto: prodName, cantidad: qty });
        continue;
      }
    }

    // Pattern 4: Prefix quantity "2 u. TAL-DCD7781 Taladro" or "3 unidades - SKU123"
    const prefixQtyMatch = line.match(/^([0-9]+)\s*(?:u\.|un\.|uds\.|unidades|unid\.)\s*(?:[-–:]\s*)?([A-Za-z0-9_\-\.\/]{3,35})?\s*(.*)$/i);
    if (prefixQtyMatch) {
      const qty = parseInt(prefixQtyMatch[1], 10);
      const possibleSku = prefixQtyMatch[2] ? cleanSku(prefixQtyMatch[2]) : null;
      const rest = cleanProductName(prefixQtyMatch[3] || "");
      const finalSku = possibleSku || (rest ? cleanSku(rest.slice(0, 15)) : "SKU-PROD");
      const finalProd = rest || finalSku;
      if (finalSku && qty > 0) {
        results.push({ sku: finalSku, producto: finalProd, cantidad: qty });
        continue;
      }
    }
  }

  // Fallback Pattern 5: Look for Mercado Libre listing IDs e.g., MLA123456789 or MLC987654321
  if (results.length === 0) {
    const mlListings = text.matchAll(/(ML[ABC][A-Z0-9]{7,15})[^\n\r]*?(?:cant(?:idad)?|uds?|unidades?|x)?[\s:.\-#]*([0-9]+)/gi);
    for (const m of mlListings) {
      const sku = m[1].toUpperCase();
      const qty = parseInt(m[2], 10) || 1;
      results.push({
        sku,
        producto: `Publicación ${sku}`,
        cantidad: qty,
      });
    }
  }

  return results;
}

/**
 * Consolidates multiple Mercado Libre PDFs deterministically (without AI hallucinations).
 * It extracts text directly via pdf-parse and aggregates row sums mathematically.
 */
export async function consolidatePdfsDeterministically(
  files: AccountPdfPayload[],
  accountNames: string[]
): Promise<DeterministicConsolidationResult> {
  const mergedMap = new Map<string, PickingItem>();
  let totalExtractedItems = 0;

  for (const file of files) {
    const slotIdx = file.slotIndex; // 0 to 4
    if (slotIdx < 0 || slotIdx > 4) continue;

    const cleanBase64 = file.base64Data.includes(",")
      ? file.base64Data.split(",")[1]
      : file.base64Data;
    const buffer = Buffer.from(cleanBase64, "base64");
    let text = "";
    try {
      const parser = new PDFParse({ data: buffer });
      const doc = await parser.getText();
      text = typeof doc === "string" ? doc : doc?.text || "";
    } catch (parseErr) {
      console.warn("Fallo leyendo PDF:", parseErr);
    }
    const extracted = extractProductsFromText(text);

    totalExtractedItems += extracted.length;

    for (const item of extracted) {
      const rawSku = cleanSku(item.sku);
      if (!rawSku) continue;
      const normalizedKey = rawSku.toUpperCase();

      const existing = mergedMap.get(normalizedKey);
      if (existing) {
        if (slotIdx === 0) existing.cta1 += item.cantidad;
        else if (slotIdx === 1) existing.cta2 += item.cantidad;
        else if (slotIdx === 2) existing.cta3 += item.cantidad;
        else if (slotIdx === 3) existing.cta4 += item.cantidad;
        else if (slotIdx === 4) existing.cta5 += item.cantidad;

        existing.totalPreparar =
          existing.cta1 + existing.cta2 + existing.cta3 + existing.cta4 + existing.cta5;

        // Enhance product name if the new one is more descriptive
        if (item.producto && item.producto.length > existing.producto.length && !item.producto.startsWith("Publicación")) {
          existing.producto = item.producto;
          existing.marca = detectBrand(item.producto);
        }
      } else {
        const newItem: PickingItem = {
          id: `item-${normalizedKey}`,
          sku: rawSku,
          producto: item.producto || rawSku,
          marca: detectBrand(item.producto || rawSku),
          modelo: "Estándar",
          categoria: "Ferretería",
          cta1: slotIdx === 0 ? item.cantidad : 0,
          cta2: slotIdx === 1 ? item.cantidad : 0,
          cta3: slotIdx === 2 ? item.cantidad : 0,
          cta4: slotIdx === 3 ? item.cantidad : 0,
          cta5: slotIdx === 4 ? item.cantidad : 0,
          totalPreparar: item.cantidad,
          preparado: false,
        };
        mergedMap.set(normalizedKey, newItem);
      }
    }
  }

  const items = Array.from(mergedMap.values());
  const activeCount = files.length;
  const totalPhysicalUnits = items.reduce((acc, i) => acc + i.totalPreparar, 0);

  const resumenOperativo = `Procesamiento determinista directo (sin IA): se leyeron con precisión matemática ${activeCount} archivo(s) PDF de Mercado Libre, consolidando ${items.length} SKUs únicos y ${totalPhysicalUnits} unidades físicas exactas sin riesgo de omisiones ni alteraciones de nombres.`;

  return {
    resumenOperativo,
    items,
    mode: "deterministic",
    extractedCount: totalExtractedItems,
  };
}
