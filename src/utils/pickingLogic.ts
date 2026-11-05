export interface SkuTitleVariant {
  accountIndex: number;
  accountName: string;
  title: string;
  quantity: number;
}

export interface PickingItem {
  id: string;
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
  preparado: boolean;
  variantesNombre?: SkuTitleVariant[];
}

export interface AccountSlot {
  index: number; // 0 to 4
  name: string;
  fileName: string | null;
  fileSize: number | null;
  base64Data: string | null;
  mimeType: string | null;
}

export interface PickingKPIs {
  totalUnits: number;
  uniqueSkus: number;
  accountsActive: number;
  completedSkus: number;
  completedUnits: number;
  completionPercentage: number;
  perAccountTotals: [number, number, number, number, number];
}

export type FilterStatus = "all" | "pending" | "completed";
export type SortField = "totalPreparar" | "sku" | "producto" | "marca";
export type SortDirection = "asc" | "desc";

/**
 * Normalizes and validates raw items extracted locally or from manual entry,
 * guaranteeing that totalPreparar always equals cta1 + cta2 + cta3 + cta4 + cta5.
 */
export function normalizePickingItems(rawItems: Array<Partial<PickingItem>>): PickingItem[] {
  const mergedBySku = new Map<string, PickingItem>();

  for (let i = 0; i < rawItems.length; i++) {
    const raw = rawItems[i];
    const cleanSku = (raw.sku || `SKU-${String(i + 1).padStart(3, "0")}`).trim().toUpperCase();

    const c1 = Math.max(0, Math.round(Number(raw.cta1) || 0));
    const c2 = Math.max(0, Math.round(Number(raw.cta2) || 0));
    const c3 = Math.max(0, Math.round(Number(raw.cta3) || 0));
    const c4 = Math.max(0, Math.round(Number(raw.cta4) || 0));
    const c5 = Math.max(0, Math.round(Number(raw.cta5) || 0));
    const computedTotal = c1 + c2 + c3 + c4 + c5;

    if (computedTotal === 0) continue;

    const existing = mergedBySku.get(cleanSku);
    if (existing) {
      existing.cta1 += c1;
      existing.cta2 += c2;
      existing.cta3 += c3;
      existing.cta4 += c4;
      existing.cta5 += c5;
      existing.totalPreparar =
        existing.cta1 +
        existing.cta2 +
        existing.cta3 +
        existing.cta4 +
        existing.cta5;
    } else {
      mergedBySku.set(cleanSku, {
        id: raw.id || `item-${cleanSku}-${i}`,
        sku: cleanSku,
        producto: (raw.producto || "Producto sin nombre").trim(),
        marca: (raw.marca || "Genérico").trim(),
        modelo: (raw.modelo || "Estándar").trim(),
        categoria: (raw.categoria || "Ferretería General").trim(),
        cta1: c1,
        cta2: c2,
        cta3: c3,
        cta4: c4,
        cta5: c5,
        totalPreparar: computedTotal,
        preparado: Boolean(raw.preparado),
      });
    }
  }

  return Array.from(mergedBySku.values());
}

/**
 * Calculates warehouse KPIs from the current consolidated item list and uploaded slots.
 */
export function calculatePickingKPIs(
  items: PickingItem[],
  uploadedSlotsCount?: number
): PickingKPIs {
  let totalUnits = 0;
  let completedSkus = 0;
  let completedUnits = 0;
  const perAccountTotals: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  for (const item of items) {
    const rowSum = item.cta1 + item.cta2 + item.cta3 + item.cta4 + item.cta5;
    totalUnits += rowSum;
    perAccountTotals[0] += item.cta1;
    perAccountTotals[1] += item.cta2;
    perAccountTotals[2] += item.cta3;
    perAccountTotals[3] += item.cta4;
    perAccountTotals[4] += item.cta5;

    if (item.preparado) {
      completedSkus += 1;
      completedUnits += rowSum;
    }
  }

  const activeFromData = perAccountTotals.filter((total) => total > 0).length;
  const accountsActive =
    typeof uploadedSlotsCount === "number" && uploadedSlotsCount > 0
      ? Math.max(uploadedSlotsCount, activeFromData)
      : activeFromData;

  const uniqueSkus = items.length;
  const completionPercentage =
    uniqueSkus > 0 ? Math.round((completedSkus / uniqueSkus) * 100) : 0;

  return {
    totalUnits,
    uniqueSkus,
    accountsActive,
    completedSkus,
    completedUnits,
    completionPercentage,
    perAccountTotals,
  };
}

/**
 * Filters and sorts picking items in real time by search query (SKU, brand, product, model, location),
 * preparation status, and active account index.
 */
export function filterAndSortPickingItems(
  items: PickingItem[],
  options: {
    searchQuery: string;
    statusFilter?: FilterStatus;
    accountFilter?: number | null; // 1 to 5 or null
    sortField?: SortField;
    sortDirection?: SortDirection;
  }
): PickingItem[] {
  const query = (options.searchQuery || "").trim().toLowerCase();
  const statusFilter = options.statusFilter || "all";
  const accountFilter = options.accountFilter ?? null;
  const sortField = options.sortField || "totalPreparar";
  const sortDirection = options.sortDirection || "desc";

  const filtered = items.filter((item) => {
    if (statusFilter === "pending" && item.preparado) return false;
    if (statusFilter === "completed" && !item.preparado) return false;

    if (accountFilter !== null && accountFilter >= 1 && accountFilter <= 5) {
      const key = `cta${accountFilter}` as "cta1" | "cta2" | "cta3" | "cta4" | "cta5";
      if (item[key] <= 0) return false;
    }

    if (!query) return true;

    const searchable = [
      item.sku,
      item.producto,
      item.marca,
      item.modelo,
      item.categoria,
    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(query);
  });

  return filtered.sort((a, b) => {
    let comparison = 0;
    if (sortField === "totalPreparar") {
      comparison = a.totalPreparar - b.totalPreparar;
    } else {
      comparison = String(a[sortField]).localeCompare(String(b[sortField]), "es", {
        numeric: true,
        sensitivity: "base",
      });
    }
    return sortDirection === "asc" ? comparison : -comparison;
  });
}

/**
 * Escapes a single CSV cell for semicolon-delimited Spanish Excel compatibility.
 */
function escapeCsvCell(value: string | number): string {
  const str = String(value ?? "");
  if (str.includes(";") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates a UTF-8 BOM CSV string separated by semicolons (;) so Microsoft Excel in Spanish
 * opens columns and accented characters cleanly without manual import wizards.
 */
export function generatePickingCsvWithBom(
  items: PickingItem[],
  accountNames: string[]
): string {
  const BOM = "\uFEFF";
  const names =
    accountNames.length === 5
      ? accountNames
      : ["Cuenta ML 1", "Cuenta ML 2", "Cuenta ML 3", "Cuenta ML 4", "Cuenta ML 5"];

  const headers = [
    "Estado Picking",
    "SKU / Código",
    "Producto",
    "Marca",
    "Modelo",
    "Categoría",
    names[0],
    names[1],
    names[2],
    names[3],
    names[4],
    "TOTAL A PREPARAR",
  ];

  const rows: string[] = [headers.map(escapeCsvCell).join(";")];

  let sumC1 = 0;
  let sumC2 = 0;
  let sumC3 = 0;
  let sumC4 = 0;
  let sumC5 = 0;
  let sumTotal = 0;

  for (const item of items) {
    sumC1 += item.cta1;
    sumC2 += item.cta2;
    sumC3 += item.cta3;
    sumC4 += item.cta4;
    sumC5 += item.cta5;
    sumTotal += item.totalPreparar;

    const row = [
      item.preparado ? "PREPARADO" : "PENDIENTE",
      item.sku,
      item.producto,
      item.marca,
      item.modelo,
      item.categoria,
      item.cta1,
      item.cta2,
      item.cta3,
      item.cta4,
      item.cta5,
      item.totalPreparar,
    ];
    rows.push(row.map(escapeCsvCell).join(";"));
  }

  // Summary row at the bottom for warehouse verification
  const totalsRow = [
    "TOTALES BODEGA",
    `${items.length} SKUs`,
    "",
    "",
    "",
    "",
    sumC1,
    sumC2,
    sumC3,
    sumC4,
    sumC5,
    sumTotal,
  ];
  rows.push(totalsRow.map(escapeCsvCell).join(";"));

  return BOM + rows.join("\r\n");
}

export interface RawExtractedProduct {
  sku: string;
  producto?: string;
  cantidad: number;
  slotIndex?: number; // 0 to 4
  accountName?: string;
}

export interface SkuDiscrepancy {
  sku: string;
  expectedUnits: number;
  consolidatedUnits: number;
  diff: number;
}

export interface PickingAuditReport {
  isValid: boolean;
  totalOriginalUnits: number;
  totalConsolidatedUnits: number;
  totalOriginalUniqueSkus: number;
  totalConsolidatedUniqueSkus: number;
  discrepancies: SkuDiscrepancy[];
  alertMessage: string | null;
}

/**
 * Compares the total product units and SKU occurrences between the raw items
 * extracted from original incoming documents and the final consolidated items list.
 * Alerts if any discrepancy exists in total units or individual SKU sums.
 */
export function auditPickingConsolidation(
  originalRawItems: RawExtractedProduct[],
  consolidatedItems: PickingItem[]
): PickingAuditReport {
  const originalMap = new Map<string, number>();
  let totalOriginalUnits = 0;

  for (const raw of originalRawItems) {
    const rawSku = (raw.sku || "").trim();
    if (!rawSku) continue;
    const normKey = rawSku.toUpperCase();
    const qty = Math.max(0, Math.round(Number(raw.cantidad) || 0));
    if (qty <= 0) continue;

    totalOriginalUnits += qty;
    originalMap.set(normKey, (originalMap.get(normKey) || 0) + qty);
  }

  const consolidatedMap = new Map<string, number>();
  let totalConsolidatedUnits = 0;

  for (const item of consolidatedItems) {
    const rawSku = (item.sku || "").trim();
    if (!rawSku) continue;
    const normKey = rawSku.toUpperCase();
    const qty = Math.max(0, Math.round(Number(item.totalPreparar) || 0));

    totalConsolidatedUnits += qty;
    consolidatedMap.set(normKey, (consolidatedMap.get(normKey) || 0) + qty);
  }

  const discrepancies: SkuDiscrepancy[] = [];
  const allSkus = new Set([...originalMap.keys(), ...consolidatedMap.keys()]);

  for (const skuKey of allSkus) {
    const expected = originalMap.get(skuKey) || 0;
    const consolidated = consolidatedMap.get(skuKey) || 0;
    if (expected !== consolidated) {
      discrepancies.push({
        sku: skuKey,
        expectedUnits: expected,
        consolidatedUnits: consolidated,
        diff: consolidated - expected,
      });
    }
  }

  const isValid = discrepancies.length === 0 && totalOriginalUnits === totalConsolidatedUnits;
  let alertMessage: string | null = null;

  if (!isValid) {
    const diffTotal = totalConsolidatedUnits - totalOriginalUnits;
    const affectedSkus = discrepancies.map((d) => `${d.sku} (Esperado: ${d.expectedUnits}, Obtenido: ${d.consolidatedUnits})`).join(", ");
    alertMessage = `¡Alerta de discrepancia en auditoría! Se detectó una diferencia de ${Math.abs(diffTotal)} unidades en la suma total (Original: ${totalOriginalUnits} vs Consolidado: ${totalConsolidatedUnits}). SKUs con diferencias: ${affectedSkus}.`;
  }

  return {
    isValid,
    totalOriginalUnits,
    totalConsolidatedUnits,
    totalOriginalUniqueSkus: originalMap.size,
    totalConsolidatedUniqueSkus: consolidatedMap.size,
    discrepancies,
    alertMessage,
  };
}

import * as pdfjsLib from "pdfjs-dist";
import { cleanSku, extractProductsFromText, detectBrand } from "./deterministicConsolidator";

// Configure workerSrc for pdfjs-dist in browser context using jsdelivr npm CDN
if (typeof window !== "undefined" && pdfjsLib) {
  try {
    const version = pdfjsLib.version || "3.11.174";
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
  } catch (e) {
    console.warn("No se pudo establecer workerSrc de pdfjs-dist:", e);
  }
}

export interface LocalPdfParseResult {
  resumenOperativo: string;
  items: PickingItem[];
  auditReport: PickingAuditReport;
  rawExtractedItems: RawExtractedProduct[];
}

/**
 * Parses uploaded PDF files locally using `pdfjs-dist` without relying on external APIs or network calls.
 * Extracts text page-by-page, consolidates SKUs across accounts, and audits sums for 100% exact picking lists.
 */
export async function parsePdfLocally(
  slots: AccountSlot[],
  accountNames?: string[]
): Promise<LocalPdfParseResult> {
  const mergedMap = new Map<string, PickingItem>();
  const allRawExtracted: RawExtractedProduct[] = [];
  const activeSlots = slots.filter((s) => Boolean(s.base64Data));

  const names = Array.isArray(accountNames) && accountNames.length === 5
    ? accountNames
    : slots.map((s, idx) => s.name || `Cuenta ${idx + 1}`);

  for (const slot of activeSlots) {
    const slotIdx = slot.index;
    if (slotIdx < 0 || slotIdx > 4 || !slot.base64Data) continue;

    const cleanBase64 = slot.base64Data.includes(",")
      ? slot.base64Data.split(",")[1]
      : slot.base64Data;

    let binaryString = "";
    if (typeof atob === "function") {
      binaryString = atob(cleanBase64);
    } else {
      binaryString = Buffer.from(cleanBase64, "base64").toString("binary");
    }

    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const slotExtracted: Array<{ sku: string; producto: string; cantidad: number }> = [];

    try {
      const loadingTask = pdfjsLib.getDocument({
        data: bytes.buffer,
        disableFontFace: true,
      });
      const pdfDoc = await loadingTask.promise;
      const numPages = pdfDoc.numPages;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const page = await pdfDoc.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageStrings = textContent.items
          .map((item: any) => ("str" in item ? item.str : ""))
          .filter(Boolean);

        const pageCombinedText = pageStrings.join("\n");
        const pageItems = extractProductsFromText(pageCombinedText);

        if (pageItems.length > 0) {
          slotExtracted.push(...pageItems);
        } else {
          // Fallback: try joined with spaces
          const spaceJoined = pageStrings.join(" ");
          const fallbackItems = extractProductsFromText(spaceJoined);
          slotExtracted.push(...fallbackItems);
        }
      }
    } catch (parseErr) {
      console.warn(`Error procesando PDF localmente en ranura ${slotIdx + 1}:`, parseErr);
    }

    for (const item of slotExtracted) {
      allRawExtracted.push({
        sku: item.sku,
        producto: item.producto,
        cantidad: item.cantidad,
        slotIndex: slotIdx,
        accountName: names[slotIdx] || `Cuenta ${slotIdx + 1}`,
      });

      // Strict SKU extraction & normalization for 100% unique grouping
      const rawSku = cleanSku(item.sku);
      if (!rawSku) continue;
      const normalizedKey = rawSku.toUpperCase();
      const qtyToAdd = Math.max(0, Math.round(Number(item.cantidad) || 1));

      const existing = mergedMap.get(normalizedKey);
      if (existing) {
        // Acumular la cantidad detectada en la columna de la cuenta correspondiente
        if (slotIdx === 0) existing.cta1 += qtyToAdd;
        else if (slotIdx === 1) existing.cta2 += qtyToAdd;
        else if (slotIdx === 2) existing.cta3 += qtyToAdd;
        else if (slotIdx === 3) existing.cta4 += qtyToAdd;
        else if (slotIdx === 4) existing.cta5 += qtyToAdd;

        // Sumar acumulativamente en totalPreparar el total de todas las cuentas
        existing.totalPreparar =
          existing.cta1 + existing.cta2 + existing.cta3 + existing.cta4 + existing.cta5;

        const prodTitle = item.producto || rawSku;
        existing.variantesNombre = existing.variantesNombre || [];
        if (!existing.variantesNombre.some((v) => v.title.toLowerCase() === prodTitle.toLowerCase())) {
          existing.variantesNombre.push({
            accountIndex: slotIdx,
            accountName: names[slotIdx] || `Cuenta ${slotIdx + 1}`,
            title: prodTitle,
            quantity: qtyToAdd,
          });
        }

        // Mejorar la descripción del producto si la nueva cadena es más descriptiva
        if (item.producto && item.producto.length > existing.producto.length && !item.producto.startsWith("Publicacion")) {
          existing.producto = item.producto;
          existing.marca = detectBrand(item.producto);
        }
      } else {
        const prodTitle = item.producto || rawSku;
        const c1 = slotIdx === 0 ? qtyToAdd : 0;
        const c2 = slotIdx === 1 ? qtyToAdd : 0;
        const c3 = slotIdx === 2 ? qtyToAdd : 0;
        const c4 = slotIdx === 3 ? qtyToAdd : 0;
        const c5 = slotIdx === 4 ? qtyToAdd : 0;
        const computedTotal = c1 + c2 + c3 + c4 + c5;

        const newItem: PickingItem = {
          id: `item-${normalizedKey}`,
          sku: rawSku,
          producto: prodTitle,
          marca: detectBrand(prodTitle),
          modelo: "Estándar",
          categoria: "Ferretería General",
          cta1: c1,
          cta2: c2,
          cta3: c3,
          cta4: c4,
          cta5: c5,
          totalPreparar: computedTotal,
          preparado: false,
          variantesNombre: [
            {
              accountIndex: slotIdx,
              accountName: names[slotIdx] || `Cuenta ${slotIdx + 1}`,
              title: prodTitle,
              quantity: qtyToAdd,
            },
          ],
        };
        mergedMap.set(normalizedKey, newItem);
      }
    }
  }

  const items = Array.from(mergedMap.values());
  const auditReport = auditPickingConsolidation(allRawExtracted, items);
  const totalPhysicalUnits = items.reduce((acc, i) => acc + i.totalPreparar, 0);

  const resumenOperativo = auditReport.isValid
    ? `Consolidación por SKU (Regex Estricto + pdfjs-dist): se procesaron ${activeSlots.length} archivo(s) PDF de Mercado Libre, clasificando de forma independiente ${items.length} SKUs únicos y ${totalPhysicalUnits} unidades físicas totales con auditoría 100% exacta.`
    : `Aviso de auditoría: se detectó discrepancia entre unidades originales (${auditReport.totalOriginalUnits}) y consolidadas (${auditReport.totalConsolidatedUnits}). ${auditReport.alertMessage}`;

  return {
    resumenOperativo,
    items,
    auditReport,
    rawExtractedItems: allRawExtracted,
  };
}


