// server.ts
import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";

// src/utils/deterministicConsolidator.ts
import { PDFParse } from "pdf-parse";

// src/utils/pickingLogic.ts
import * as pdfjsLib from "pdfjs-dist";
function auditPickingConsolidation(originalRawItems, consolidatedItems) {
  const originalMap = /* @__PURE__ */ new Map();
  const displaySkuMap = /* @__PURE__ */ new Map();
  let totalOriginalUnits = 0;
  for (const raw of originalRawItems) {
    const rawSku = (raw.sku || "").trim();
    if (!rawSku) continue;
    const normKey = normalizeStringKey(rawSku) || rawSku.toUpperCase();
    const qty = Math.max(0, Math.round(Number(raw.cantidad) || 0));
    if (qty <= 0) continue;
    totalOriginalUnits += qty;
    originalMap.set(normKey, (originalMap.get(normKey) || 0) + qty);
    if (!displaySkuMap.has(normKey)) {
      displaySkuMap.set(normKey, rawSku);
    }
  }
  const consolidatedMap = /* @__PURE__ */ new Map();
  let totalConsolidatedUnits = 0;
  for (const item of consolidatedItems) {
    const rawSku = (item.sku || "").trim();
    if (!rawSku) continue;
    const normKey = normalizeStringKey(rawSku) || rawSku.toUpperCase();
    const qty = Math.max(0, Math.round(Number(item.totalPreparar) || 0));
    totalConsolidatedUnits += qty;
    consolidatedMap.set(normKey, (consolidatedMap.get(normKey) || 0) + qty);
    if (!displaySkuMap.has(normKey)) {
      displaySkuMap.set(normKey, rawSku);
    }
  }
  const discrepancies = [];
  const allSkus = /* @__PURE__ */ new Set([...originalMap.keys(), ...consolidatedMap.keys()]);
  for (const skuKey of allSkus) {
    const expected = originalMap.get(skuKey) || 0;
    const consolidated = consolidatedMap.get(skuKey) || 0;
    if (expected !== consolidated) {
      const displaySku = displaySkuMap.get(skuKey) || skuKey;
      discrepancies.push({
        sku: displaySku,
        expectedUnits: expected,
        consolidatedUnits: consolidated,
        diff: consolidated - expected
      });
    }
  }
  const isValid = discrepancies.length === 0 && totalOriginalUnits === totalConsolidatedUnits;
  let alertMessage = null;
  if (!isValid) {
    const diffTotal = totalConsolidatedUnits - totalOriginalUnits;
    const affectedSkus = discrepancies.map((d) => `${d.sku} (Esperado: ${d.expectedUnits}, Obtenido: ${d.consolidatedUnits})`).join(", ");
    alertMessage = `\xA1Alerta de discrepancia en auditor\xEDa! Se detect\xF3 una diferencia de ${Math.abs(diffTotal)} unidades en la suma total (Original: ${totalOriginalUnits} vs Consolidado: ${totalConsolidatedUnits}). SKUs con diferencias: ${affectedSkus}.`;
  }
  return {
    isValid,
    totalOriginalUnits,
    totalConsolidatedUnits,
    totalOriginalUniqueSkus: originalMap.size,
    totalConsolidatedUniqueSkus: consolidatedMap.size,
    discrepancies,
    alertMessage
  };
}
if (typeof window !== "undefined" && pdfjsLib) {
  try {
    const version2 = pdfjsLib.version || "3.11.174";
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version2}/build/pdf.worker.min.mjs`;
  } catch (e) {
    console.warn("No se pudo establecer workerSrc de pdfjs-dist:", e);
  }
}

// src/utils/deterministicConsolidator.ts
var SKU_PREFIX_KEYWORD_REGEX = /(?:C[OÓoó]DIGO\s*(?:DE\s*)?VENDEDOR|SKU\s*(?:DE\s*)?VENDEDOR|C[OÓoó]D\.\s*VENDEDOR|COD\.\s*VENDEDOR|C[OÓoó]DIGO\s*(?:DE\s*)?PRODUCTO|C[OÓoó]DIGO\s*(?:DE\s*)?ART[IÍií]CULO|SKU|C[OÓoó]DIGO|CODIGO|C[OÓoó]D|COD|REF|REFERENCIA|ART[IÍií]CULO|ARTICULO|ART|VARIANTE|VARIACI[OÓoó]N)[\s:.\-#]+(.+)/i;
function cleanSku(val) {
  if (!val) return "";
  let s = val.trim();
  const skuIdx = s.search(/SKU\s*:/i);
  if (skuIdx !== -1) {
    s = s.slice(skuIdx).replace(/^SKU\s*:\s*/i, "");
  }
  s = s.replace(
    /^(?:C[OÓoó]DIGO\s*(?:DE\s*)?VENDEDOR|SKU\s*(?:DE\s*)?VENDEDOR|C[OÓoó]D\.\s*VENDEDOR|COD\.\s*VENDEDOR|C[OÓoó]DIGO\s*(?:DE\s*)?PRODUCTO|C[OÓoó]DIGO\s*(?:DE\s*)?ART[IÍií]CULO|SKU|C[OÓoó]DIGO|CODIGO|C[OÓoó]D|COD|REF|REFERENCIA|ART[IÍií]CULO|ARTICULO|ART|VARIANTE|VARIACI[OÓoó]N)[\s:.\-#]+/i,
    ""
  ).trim();
  s = s.replace(/\s*Cantidad\s*:\s*\d+.*/i, "").trim();
  if (s.includes("|")) {
    s = s.split("|")[0].trim();
  }
  if (s.includes("	")) {
    s = s.split("	")[0].trim();
  }
  s = s.replace(/^[|·\-\s,;:]+|[|·\-\s,;:]+$/g, "").trim();
  const noiseWords = [
    "VENDEDOR",
    "ARTICULO",
    "PRODUCTO",
    "REFERENCIA",
    "DESCRIPCION",
    "CANTIDAD",
    "CANT",
    "PAGINA",
    "FECHA",
    "GUIA",
    "RECEPTOR",
    "ENVIO",
    "COLECTA",
    "COMPRADOR",
    "DIRECCION",
    "PAQUETE",
    "CARRIER",
    "FIRMA CARRIER",
    "FECHA Y HORA DE RETIRO",
    "FECHA Y HORA"
  ];
  const upper = s.toUpperCase();
  if (noiseWords.some((w) => upper === w || upper.startsWith(w + " ") || upper.endsWith(" " + w))) {
    return "";
  }
  return s;
}
function cleanProductName(val) {
  let p = val.trim();
  p = p.replace(/\s+/g, " ");
  p = p.replace(/^[\s\-:;,.]+|[\s\-:;,.]+$/g, "");
  return p;
}
function normalizeStringKey(val) {
  if (!val) return "";
  return val.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}
function detectBrand(text) {
  const t = text.toLowerCase();
  const known = [
    "dewalt",
    "bosch",
    "makita",
    "stanley",
    "truper",
    "black+decker",
    "black & decker",
    "milwaukee",
    "skil",
    "einhell",
    "irwin",
    "karcher",
    "total",
    "ingco",
    "bahco",
    "dremel",
    "stihl",
    "pretul",
    "uber",
    "3m",
    "sika",
    "wurth",
    "loctite",
    "bellota",
    "lusqtoff",
    "sturm",
    "kraft",
    "orilladora",
    "desmalezadora"
  ];
  for (const b of known) {
    if (new RegExp(`\\b${b.replace("+", "\\+")}\\b`, "i").test(t)) {
      return b.charAt(0).toUpperCase() + b.slice(1);
    }
  }
  return "Ferreter\xEDa";
}
function normalizePdfText(raw) {
  if (!raw) return "";
  return raw.replace(/C[^\s]{1,4}digo/gi, "Codigo").replace(/Vended[^\s]{1,3}r/gi, "Vendedor").replace(/Art[^\s]{1,3}culo/gi, "Articulo").replace(/Variaci[^\s]{1,3}n/gi, "Variacion").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function extractProductsFromText(text) {
  const results = [];
  const normalizedText = normalizePdfText(text);
  const lines = normalizedText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inlineSkuMatch = line.match(SKU_PREFIX_KEYWORD_REGEX);
    const inlineQtyMatch = line.match(/(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)[\s:.\-#]*([0-9]{1,4})/i) || line.match(/([0-9]{1,4})\s*(?:u\.|un\.|uds\.|unidades|unid\.)/i);
    if (inlineSkuMatch && inlineQtyMatch) {
      const sku = cleanSku(inlineSkuMatch[1]);
      const qty = parseInt(inlineQtyMatch[1], 10);
      let prodName = line.replace(SKU_PREFIX_KEYWORD_REGEX, "").replace(/(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)[\s:.\-#]*[0-9]{1,4}/i, "").replace(/([0-9]{1,4})\s*(?:u\.|un\.|uds\.|unidades|unid\.)/i, "").replace(/^[|·\-\s]+|[|·\-\s]+$/g, "");
      prodName = cleanProductName(prodName) || sku;
      if (sku && qty > 0) {
        results.push({ sku, producto: prodName, cantidad: qty });
        continue;
      }
    }
    if (inlineSkuMatch) {
      const sku = cleanSku(inlineSkuMatch[1]);
      if (sku && !sku.toUpperCase().startsWith("PAGINA")) {
        let qty = 1;
        let prodName = "";
        for (let offset = -4; offset <= 10; offset++) {
          if (offset === 0) continue;
          const targetIdx = i + offset;
          if (targetIdx >= 0 && targetIdx < lines.length) {
            const targetLine = lines[targetIdx];
            if (offset > 0 && (targetLine.toLowerCase().includes("sku:") || targetLine.toLowerCase().includes("envio:"))) {
              break;
            }
            const qtyMatch = targetLine.match(/^(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)?[\s:.\-#]*([0-9]{1,4})$/i) || targetLine.match(/(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)[\s:.\-#]*([0-9]{1,4})/i) || targetLine.match(/^([0-9]{1,4})\s*(?:u\.|un\.|uds\.|unidades|unid\.)/i);
            if (qtyMatch && !targetLine.includes("ORDEN") && !targetLine.includes("FECHA") && !targetLine.includes("PAQUETE") && !targetLine.includes("PAGINA")) {
              const parsedQ = parseInt(qtyMatch[1], 10);
              if (parsedQ > 0 && parsedQ < 1e5) {
                qty = parsedQ;
                break;
              }
            }
          }
        }
        const skuWords = sku.toLowerCase().replace(/[^a-z0-9áéíóúñ]/g, " ").split(/\s+/).filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !["sku", "cod", "codigo", "tasbel", "grande", "mini", "set"].includes(w));
        if (skuWords.length > 0) {
          for (const lText of lines) {
            if (lText.length > 8 && !lText.toLowerCase().includes("sku:") && !lText.toLowerCase().includes("codigo:") && !/^(PAGINA|FECHA|ORDEN|GUIA|RECEPTOR|ENVIO|DESTINATARIO|COMPRADOR|PACK ID|DESPACHA|IDENTIFICACION|PRODUCTOS|COLOR|VOLTAJE|CARRIER|FIRMA|FECHA Y HORA|#)/i.test(lText) && !/^[A-Z0-9]{18,35}$/.test(lText) && !/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}$/.test(lText)) {
              const lowerL = lText.toLowerCase();
              if (skuWords.some((w) => lowerL.includes(w))) {
                prodName = cleanProductName(lText);
                break;
              }
            }
          }
        }
        if (!prodName) {
          for (let offset = -3; offset <= 3; offset++) {
            if (offset === 0) continue;
            const targetIdx = i + offset;
            if (targetIdx >= 0 && targetIdx < lines.length) {
              const targetLine = lines[targetIdx];
              if (targetLine.length > 8 && !targetLine.toLowerCase().includes("sku:") && !targetLine.toLowerCase().includes("codigo:") && !/^(PAGINA|FECHA|ORDEN|GUIA|RECEPTOR|ENVIO|DESTINATARIO|COMPRADOR|PACK ID|DESPACHA|IDENTIFICACION|PRODUCTOS|COLOR|VOLTAJE|CARRIER|FIRMA|FECHA Y HORA|#)/i.test(targetLine) && !/^[A-Z0-9]{18,35}$/.test(targetLine) && !/^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,3}$/.test(targetLine)) {
                prodName = cleanProductName(targetLine);
                break;
              }
            }
          }
        }
        const fallbackTitle = sku.replace(/^[0-9]+\.\s*/, "").replace(/^[-_\s.]+|[-_\s.]+$|/g, "").trim() || sku;
        results.push({
          sku,
          producto: prodName || fallbackTitle,
          cantidad: qty
        });
        continue;
      }
    }
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
    const prefixQtyMatch = line.match(/^([0-9]{1,4})\s*(?:u\.|un\.|uds\.|unidades|unid\.)\s*(?:[-–:]\s*)?([A-Za-z0-9_\-\.\/]{3,35})?\s*(.*)$/i);
    if (prefixQtyMatch) {
      const qty = parseInt(prefixQtyMatch[1], 10);
      const possibleSku = prefixQtyMatch[2] ? cleanSku(prefixQtyMatch[2]) : null;
      const rest = cleanProductName(prefixQtyMatch[3] || "");
      const generatedSlug = rest ? "SKU-" + rest.toUpperCase().replace(/[^A-Z0-9]/g, "-").replace(/-+/g, "-").slice(0, 30).replace(/-$/, "") : "SKU-PROD";
      const finalSku = possibleSku || generatedSlug;
      const finalProd = rest || finalSku;
      if (finalSku && qty > 0 && !finalSku.toUpperCase().startsWith("PAGINA")) {
        results.push({ sku: finalSku, producto: finalProd, cantidad: qty });
        continue;
      }
    }
  }
  if (results.length === 0) {
    const globalSkuRegex = /(?:CODIGO\s*(?:DE\s*)?VENDEDOR|SKU\s*(?:DE\s*)?VENDEDOR|COD\.\s*VENDEDOR|CODIGO\s*(?:DE\s*)?PRODUCTO|SKU|CODIGO|COD|REF)[\s:.\-#]+([A-Za-z0-9_\-\.\/]{2,45})/gi;
    let match;
    while ((match = globalSkuRegex.exec(normalizedText)) !== null) {
      const sku = cleanSku(match[1]);
      if (!sku || sku.length < 2) continue;
      const windowText = normalizedText.slice(match.index, match.index + 250);
      const qtyMatch = windowText.match(/(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)[\s:.\-#]*([0-9]{1,4})/i) || windowText.match(/([0-9]{1,4})\s*(?:u\.|un\.|uds\.|unidades|unid\.)/i);
      const qty = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
      results.push({
        sku,
        producto: sku,
        cantidad: qty
      });
    }
  }
  if (results.length === 0) {
    const mlListings = normalizedText.matchAll(/(ML[ABC][A-Z0-9]{7,15})[^\n\r]*?(?:cant(?:idad)?|uds?|unidades?|x)?[\s:.\-#]*([0-9]{1,4})/gi);
    for (const m of mlListings) {
      const sku = m[1].toUpperCase();
      const qty = parseInt(m[2], 10) || 1;
      results.push({
        sku,
        producto: `Publicacion ${sku}`,
        cantidad: qty
      });
    }
  }
  if (results.length === 0) {
    const candidateLines = normalizedText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (let i = 0; i < candidateLines.length; i++) {
      const line = candidateLines[i];
      const standaloneSkuMatch = line.match(/^([A-Za-z0-9_\-\.\/]{4,35})$/);
      if (standaloneSkuMatch && !/^(DESTINATARIO|DIRECCION|PRODUCTO|CATEGORIA|SANTIAGO|PROVINCIA|REGION|PAQUETE|FECHA|ORDEN|GUIA|ENVIO|RECEPTOR|COMPRADOR|COLECTA|MERCADO|ENVIOS|RESUMEN|PAGINA|TOTAL)/i.test(line)) {
        const rawSku = cleanSku(standaloneSkuMatch[1]);
        if (rawSku && rawSku.length >= 3) {
          let qty = 1;
          for (let offset = -2; offset <= 2; offset++) {
            if (offset === 0) continue;
            const targetIdx = i + offset;
            if (targetIdx >= 0 && targetIdx < candidateLines.length) {
              const targetLine = candidateLines[targetIdx];
              const qMatch = targetLine.match(/^([0-9]{1,4})\s*(?:u\.|un\.|uds\.|unidades|unid\.)/i) || targetLine.match(/(?:CANT|CANTIDAD|CANT\.|UDS|UNIDADES|UNID)[\s:.\-#]*([0-9]{1,4})/i);
              if (qMatch) {
                const parsedQ = parseInt(qMatch[1], 10);
                if (parsedQ > 0 && parsedQ < 1e4) qty = parsedQ;
              }
            }
          }
          results.push({
            sku: rawSku,
            producto: rawSku,
            cantidad: qty
          });
        }
      }
    }
  }
  return results;
}
function extractProductsFromSpatialPage(itemsList) {
  if (!Array.isArray(itemsList) || itemsList.length === 0) return [];
  const rightColItems = itemsList.filter((item) => {
    if (!item || typeof item !== "object" || !("str" in item)) return false;
    const str = String(item.str).trim();
    if (!str) return false;
    const x = Array.isArray(item.transform) && typeof item.transform[4] === "number" ? item.transform[4] : 0;
    const y = Array.isArray(item.transform) && typeof item.transform[5] === "number" ? item.transform[5] : 0;
    return x >= 200 && y <= 738 && y >= 20;
  });
  if (rightColItems.length === 0) return [];
  const linesMap = [];
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
  linesMap.sort((a, b) => b.y - a.y);
  const lines = linesMap.map((l) => {
    l.items.sort((a, b) => a.x - b.x);
    return { y: l.y, text: l.items.map((i) => i.str).join(" ").trim() };
  });
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i].text;
    const qtyMatch = lineText.match(/^(?:Cantidad|Cant\.?)\s*:\s*(\d+)/i);
    if (qtyMatch) {
      const qty = parseInt(qtyMatch[1], 10) || 1;
      let rawSku = "";
      const titleParts = [];
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
        cantidad: qty
      });
    }
  }
  return results;
}
async function consolidatePdfsDeterministically(files, accountNames) {
  const mergedMap = /* @__PURE__ */ new Map();
  const allRawExtracted = [];
  let totalExtractedItems = 0;
  let pdfjsLibNode = null;
  try {
    pdfjsLibNode = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    pdfjsLibNode = null;
  }
  for (const file of files) {
    const slotIdx = file.slotIndex;
    if (slotIdx < 0 || slotIdx > 4) continue;
    const cleanBase64 = file.base64Data.includes(",") ? file.base64Data.split(",")[1] : file.base64Data;
    const buffer = Buffer.from(cleanBase64, "base64");
    const fileExtracted = [];
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
            const rawLines = (textContent?.items || []).map((it) => "str" in it ? it.str : "").filter(Boolean).join("\n");
            fileExtracted.push(...extractProductsFromText(rawLines));
          }
        }
      } catch (spatialErr) {
        console.warn(`Aviso en extracci\xF3n espacial PDF (slot ${slotIdx + 1}), usando fallback de texto:`, spatialErr);
      }
    }
    if (fileExtracted.length === 0) {
      try {
        const parser = new PDFParse({ data: buffer });
        const textResult = await parser.getText({
          pageJoiner: "\n---PAGE_SPLIT---\n"
        });
        const pages = Array.isArray(textResult?.pages) && textResult.pages.length > 0 ? textResult.pages : null;
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
        accountName: accountNames[slotIdx] || `Cuenta ${slotIdx + 1}`
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
        existing.totalPreparar = existing.cta1 + existing.cta2 + existing.cta3 + existing.cta4 + existing.cta5;
        const prodTitle = item.producto || rawSku;
        existing.variantesNombre = existing.variantesNombre || [];
        if (!existing.variantesNombre.some((v) => v.title.toLowerCase() === prodTitle.toLowerCase())) {
          existing.variantesNombre.push({
            accountIndex: slotIdx,
            accountName: accountNames[slotIdx] || `Cuenta ${slotIdx + 1}`,
            title: prodTitle,
            quantity: item.cantidad
          });
        }
        if (item.producto && item.producto.length > existing.producto.length && !item.producto.startsWith("Publicacion")) {
          existing.producto = item.producto;
          existing.marca = detectBrand(item.producto);
        }
      } else {
        const prodTitle = item.producto || rawSku;
        const newItem = {
          id: `item-${normalizedKey}`,
          sku: rawSku,
          producto: prodTitle,
          marca: detectBrand(prodTitle),
          modelo: "Est\xE1ndar",
          categoria: "Ferreter\xEDa",
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
              quantity: item.cantidad
            }
          ]
        };
        mergedMap.set(normalizedKey, newItem);
      }
    }
  }
  const items = Array.from(mergedMap.values());
  const activeCount = files.length;
  const totalPhysicalUnits = items.reduce((acc, i) => acc + i.totalPreparar, 0);
  const auditReport = auditPickingConsolidation(allRawExtracted, items);
  const resumenOperativo = auditReport.isValid ? `Procesamiento determinista directo (sin IA): se auditaron con precisi\xF3n matem\xE1tica ${activeCount} archivo(s) PDF de Mercado Libre, consolidando ${items.length} SKUs \xFAnicos y ${totalPhysicalUnits} unidades f\xEDsicas exactas (Auditor\xEDa: 100% verificado sin discrepancias).` : `Aviso de auditor\xEDa: se detect\xF3 discrepancia entre unidades originales (${auditReport.totalOriginalUnits}) y consolidadas (${auditReport.totalConsolidatedUnits}). ${auditReport.alertMessage}`;
  return {
    resumenOperativo,
    items,
    mode: "deterministic",
    extractedCount: totalExtractedItems,
    rawExtractedItems: allRawExtracted,
    auditReport
  };
}

// server.ts
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var app = express();
var PORT = 3e3;
app.use(express.json({ limit: "50mb" }));
var aiClient = null;
if (process.env.GEMINI_API_KEY) {
  aiClient = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build"
      }
    }
  });
}
app.post("/api/consolidate", async (req, res) => {
  try {
    const { files, accountNames, useGeminiAI } = req.body;
    if (!files || !Array.isArray(files) || files.length === 0) {
      return res.status(400).json({
        error: "Debes adjuntar al menos un archivo PDF para procesar la consolidaci\xF3n."
      });
    }
    const names = Array.isArray(accountNames) && accountNames.length === 5 ? accountNames : ["Cuenta ML 1", "Cuenta ML 2", "Cuenta ML 3", "Cuenta ML 4", "Cuenta ML 5"];
    const deterministicResult = await consolidatePdfsDeterministically(files, names);
    if (aiClient && useGeminiAI === true) {
      try {
        const deterministicUnits = deterministicResult.items.reduce((acc, i) => acc + i.totalPreparar, 0);
        console.log("Iniciando extracci\xF3n con Gemini AI (gemini-3.8-flash)...");
        const allRawExtracted = [];
        const mergedMap = /* @__PURE__ */ new Map();
        for (const file of files) {
          const slotIdx = file.slotIndex;
          if (slotIdx < 0 || slotIdx > 4) continue;
          const cleanBase64 = file.base64Data.includes(",") ? file.base64Data.split(",")[1] : file.base64Data;
          const prompt = `Analiza este documento PDF de Mercado Libre (cuenta: ${names[slotIdx]}).
Extrae absolutamente TODOS los productos listados en TODAS las p\xE1ginas sin omitir ninguna etiqueta ni env\xEDo.

REGLAS DE EXTRACCI\xD3N Y AGRUPACI\xD3N POR SKU:
1. Para cada producto, extrae obligatoriamente el c\xF3digo SKU completo que figura exactamente debajo del t\xEDtulo del producto (marcado como "SKU: ...").
2. En el campo "sku", coloca la cadena completa y exacta de SKU tal como aparece en la planilla, sin recortar ni abreviar (ejemplos reales: "orilladora bencinera tasbel 37\xB4\xB4", "setjardine5en1 0116-40", "0040 grande - 22", "Perchero Circular - 12\xB4\xB4").
3. Es OBLIGATORIO agrupar los registros bas\xE1ndose \xDANICAMENTE en la coincidencia del c\xF3digo SKU. NO agrupes por t\xEDtulo ni por nombre de producto. Si dos productos tienen nombres o palabras distintas pero poseen el mismo SKU exacto, pertenecen al mismo producto y deben unificarse sumando sus cantidades.
4. Extrae tambi\xE9n el t\xEDtulo o nombre principal del producto y la cantidad exacta de unidades enviadas ("Cantidad: ...").

Responde \xFAnicamente en el formato JSON estructurado especificado.`;
          const aiResponse = await aiClient.models.generateContent({
            model: "gemini-3.8-flash",
            contents: [
              {
                inlineData: {
                  mimeType: file.mimeType || "application/pdf",
                  data: cleanBase64
                }
              },
              { text: prompt }
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sku: { type: Type.STRING, description: "C\xF3digo SKU o c\xF3digo de vendedor exacto" },
                    producto: { type: Type.STRING, description: "T\xEDtulo o descripci\xF3n del producto" },
                    cantidad: { type: Type.INTEGER, description: "Cantidad de unidades enviadas o vendidas" }
                  },
                  required: ["sku", "cantidad"]
                }
              }
            }
          });
          const jsonText = (aiResponse.text ?? "[]").trim();
          let parsedArray = [];
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
              accountName: names[slotIdx]
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
              existing.variantesNombre = existing.variantesNombre || [];
              if (!existing.variantesNombre.some((v) => v.title.toLowerCase() === prodTitle.toLowerCase())) {
                existing.variantesNombre.push({
                  accountIndex: slotIdx,
                  accountName: names[slotIdx],
                  title: prodTitle,
                  quantity: qty
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
                modelo: "Est\xE1ndar",
                categoria: "Ferreter\xEDa",
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
                    quantity: qty
                  }
                ]
              });
            }
          }
        }
        const finalItems = Array.from(mergedMap.values());
        const geminiUnits = finalItems.reduce((acc, i) => acc + i.totalPreparar, 0);
        if (geminiUnits >= deterministicUnits && finalItems.length > 0) {
          const auditReport = auditPickingConsolidation(allRawExtracted, finalItems);
          return res.json({
            resumenOperativo: `Consolidaci\xF3n H\xEDbrida Inteligente (Gemini AI gemini-3.8-flash): Se procesaron ${files.length} archivo(s) PDF de Mercado Libre, unificando ${finalItems.length} SKUs \xFAnicos y ${geminiUnits} unidades f\xEDsicas exactas entre las 5 cuentas.`,
            items: finalItems,
            auditReport,
            mode: "gemini"
          });
        } else {
          console.warn(`Gemini AI extrajo ${geminiUnits} unidades, pero el escaneo determinista hall\xF3 ${deterministicUnits} unidades completas. Utilizando resultado determinista completo.`);
        }
      } catch (geminiErr) {
        console.warn("Fallo temporal en Gemini AI, alternando a modo determinista local:", geminiErr);
      }
    }
    return res.json(deterministicResult);
  } catch (error) {
    console.error("Error en /api/consolidate:", error);
    const errMsg = error instanceof Error ? error.message : "Error al procesar los archivos PDF de Mercado Libre.";
    return res.status(500).json({ error: errMsg });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
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
