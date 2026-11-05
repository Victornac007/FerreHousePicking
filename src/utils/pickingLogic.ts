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
 * Normalizes and validates raw items returned from the Gemini API or manual entry,
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


