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
    const cleanSku = (raw.sku || `SKU-${String(i + 1).padStart(3, "0")}`)
      .trim()
      .toUpperCase();

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

/**
 * Deterministic demonstration dataset featuring the iconic "25 Taladros (5 + 5 + 5 + 5 + 5)"
 * plus realistic hardware warehouse items across the 5 Mercado Libre accounts.
 */
export function getDemoPickingData(): {
  resumenOperativo: string;
  items: PickingItem[];
  accountNames: string[];
  fileNames: string[];
} {
  const accountNames = [
    "FerreHouse Oficial (Cta 1)",
    "ProTools Chile ML (Cta 2)",
    "Maquinaria Express (Cta 3)",
    "Outlet Constructor (Cta 4)",
    "Bodega Industrial Sur (Cta 5)",
  ];

  const fileNames = [
    "ML_Envios_Cta1_FerreHouse_Hoy.pdf",
    "ML_Envios_Cta2_ProTools_Hoy.pdf",
    "ML_Envios_Cta3_Maquinaria_Hoy.pdf",
    "ML_Envios_Cta4_Outlet_Hoy.pdf",
    "ML_Envios_Cta5_BodegaSur_Hoy.pdf",
  ];

  const rawItems: Array<Partial<PickingItem>> = [
    {
      id: "demo-1",
      sku: "DW-DCD7781-20V",
      producto: "Taladro Percutor Inalámbrico Brushless 1/2\" 20V Max con 2 Baterías y Maletín",
      marca: "DeWalt",
      modelo: "DCD7781D2-B2",
      categoria: "Herramientas Eléctricas",
      cta1: 5,
      cta2: 5,
      cta3: 5,
      cta4: 5,
      cta5: 5,
      totalPreparar: 25,
      preparado: false,
    },
    {
      id: "demo-2",
      sku: "BOS-GWS850-45",
      producto: "Esmeril Angular Profesional 4-1/2\" 850W 11.000 RPM Engranajes Helicoidales",
      marca: "Bosch",
      modelo: "GWS 850 Professional",
      categoria: "Herramientas Eléctricas",
      cta1: 4,
      cta2: 3,
      cta3: 6,
      cta4: 2,
      cta5: 3,
      totalPreparar: 18,
      preparado: false,
    },
    {
      id: "demo-3",
      sku: "MAK-HR2470-780W",
      producto: "Rotomartillo Cincelador SDS-Plus 24mm 780W 2.7 Joules 3 Modos",
      marca: "Makita",
      modelo: "HR2470",
      categoria: "Herramientas Eléctricas",
      cta1: 2,
      cta2: 4,
      cta3: 2,
      cta4: 3,
      cta5: 1,
      totalPreparar: 12,
      preparado: true,
    },
    {
      id: "demo-4",
      sku: "STN-STMT74393-110",
      producto: "Juego de Dados y Llaves Chicharra Cromo Vanadio 110 Piezas Maletín Rígido",
      marca: "Stanley",
      modelo: "STMT74393-840",
      categoria: "Herramientas Manuales",
      cta1: 3,
      cta2: 2,
      cta3: 1,
      cta4: 4,
      cta5: 5,
      totalPreparar: 15,
      preparado: false,
    },
    {
      id: "demo-5",
      sku: "MIL-48894630-19P",
      producto: "Set de Brocas Cobalto RedHelix para Acero Inoxidable y Metal (19 Piezas)",
      marca: "Milwaukee",
      modelo: "48-89-4630",
      categoria: "Accesorios y Consumibles",
      cta1: 6,
      cta2: 8,
      cta3: 4,
      cta4: 7,
      cta5: 5,
      totalPreparar: 30,
      preparado: false,
    },
    {
      id: "demo-6",
      sku: "FLU-117-TRMS",
      producto: "Multímetro Digital True-RMS con Detección de Voltaje Sin Contacto VoltAlert",
      marca: "Fluke",
      modelo: "Fluke 117",
      categoria: "Instrumentos de Medición",
      cta1: 1,
      cta2: 2,
      cta3: 1,
      cta4: 0,
      cta5: 2,
      totalPreparar: 6,
      preparado: true,
    },
    {
      id: "demo-7",
      sku: "TRU-CAR-SOL-EL4",
      producto: "Careta Electrónica Fotosensible para Soldar Sombra Variable DIN 9-13",
      marca: "Truper",
      modelo: "CAREL-913",
      categoria: "Seguridad Industrial",
      cta1: 3,
      cta2: 1,
      cta3: 3,
      cta4: 2,
      cta5: 0,
      totalPreparar: 9,
      preparado: false,
    },
    {
      id: "demo-8",
      sku: "BOS-GLM500-LAS",
      producto: "Distanciómetro Medidor Láser Digital 50 Metros Pantalla Color Inclinómetro",
      marca: "Bosch",
      modelo: "GLM 500",
      categoria: "Instrumentos de Medición",
      cta1: 2,
      cta2: 2,
      cta3: 0,
      cta4: 3,
      cta5: 2,
      totalPreparar: 9,
      preparado: false,
    },
  ];

  return {
    resumenOperativo:
      "Demostración operativa cargada: Se homologaron 5 archivos PDF de Mercado Envíos. El SKU estrella DW-DCD7781-20V (Taladro Percutor DeWalt 20V) registró 5 unidades vendidas en cada una de las 5 cuentas, consolidando 25 unidades totales para despacho.",
    items: normalizePickingItems(rawItems),
    accountNames,
    fileNames,
  };
}
