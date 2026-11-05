import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePickingItems,
  calculatePickingKPIs,
  filterAndSortPickingItems,
  generatePickingCsvWithBom,
  PickingItem,
} from "./pickingLogic";

const SAMPLE_ITEMS: PickingItem[] = normalizePickingItems([
  {
    id: "test-1",
    sku: "DW-DCD7781-20V",
    producto: "Taladro DeWalt 20V",
    marca: "DeWalt",
    modelo: "DCD7781",
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
    id: "test-2",
    sku: "BOS-GWS850-45",
    producto: "Esmeril Angular Bosch 850W",
    marca: "Bosch",
    modelo: "GWS 850",
    categoria: "Herramientas Eléctricas",
    cta1: 2,
    cta2: 3,
    cta3: 1,
    cta4: 0,
    cta5: 4,
    totalPreparar: 10,
    preparado: true,
  },
]);

test("normalizePickingItems merges duplicate SKUs across rows and computes exact totalPreparar", () => {
  const raw = [
    {
      sku: " dw-dcd7781-20v ",
      producto: "Taladro DeWalt 20V",
      marca: "DeWalt",
      modelo: "DCD7781",
      cta1: 5,
      cta2: 5,
      cta3: 0,
      cta4: 0,
      cta5: 0,
    },
    {
      sku: "DW-DCD7781-20V",
      producto: "TALADRO DEWALT 20V",
      marca: "DeWalt",
      modelo: "DCD7781",
      cta1: 0,
      cta2: 0,
      cta3: 5,
      cta4: 5,
      cta5: 5,
    },
  ];

  const normalized = normalizePickingItems(raw);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].sku, "DW-DCD7781-20V");
  assert.equal(normalized[0].totalPreparar, 25);
});

test("calculatePickingKPIs accurately computes total physical units, unique SKUs, and per-account sums", () => {
  const kpis = calculatePickingKPIs(SAMPLE_ITEMS, 5);

  assert.equal(kpis.uniqueSkus, 2);
  assert.equal(kpis.accountsActive, 5);
  assert.equal(kpis.totalUnits, 35);
  assert.deepEqual(kpis.perAccountTotals, [7, 8, 6, 5, 9]);
  assert.equal(kpis.completedSkus, 1);
});

test("filterAndSortPickingItems filters by SKU, brand, product name, and status", () => {
  const byBrand = filterAndSortPickingItems(SAMPLE_ITEMS, {
    searchQuery: "dewalt",
  });
  assert.equal(byBrand.length, 1);
  assert.equal(byBrand[0].sku, "DW-DCD7781-20V");

  const byPending = filterAndSortPickingItems(SAMPLE_ITEMS, {
    searchQuery: "",
    statusFilter: "pending",
  });
  assert.equal(byPending.length, 1);
  assert.equal(byPending[0].sku, "DW-DCD7781-20V");

  const byCompleted = filterAndSortPickingItems(SAMPLE_ITEMS, {
    searchQuery: "",
    statusFilter: "completed",
  });
  assert.equal(byCompleted.length, 1);
  assert.equal(byCompleted[0].sku, "BOS-GWS850-45");
});

test("generatePickingCsvWithBom outputs UTF-8 BOM and semicolon-separated rows for Spanish Excel", () => {
  const accountNames = ["Cta 1", "Cta 2", "Cta 3", "Cta 4", "Cta 5"];
  const csv = generatePickingCsvWithBom(SAMPLE_ITEMS, accountNames);

  assert.ok(csv.startsWith("\uFEFF"), "CSV must start with UTF-8 BOM");
  const lines = csv.slice(1).split("\r\n");
  // Header + 2 items + 1 totals row = 4 lines
  assert.equal(lines.length, 4);
  assert.ok(lines[0].includes(";"), "Header must be delimited by semicolons");
  assert.ok(lines[0].includes("TOTAL A PREPARAR"));
  assert.ok(lines[1].includes("DW-DCD7781-20V"));
  assert.ok(lines[3].startsWith("TOTALES BODEGA;"));
});

test("extractProductsFromText extracts exact SKUs and quantities from Mercado Libre patterns", async () => {
  const { extractProductsFromText } = await import("./deterministicConsolidator");

  const sampleMLReport = `
ORDEN DE PREPARACIÓN DE ENVÍO MERCADO ENVÍOS
FECHA: 2026-11-04
1  DW-DCD7781-20V    Taladro Percutor Inalámbrico DeWalt 20V    3
2  BOS-GWS850-45     Esmeril Angular Bosch 850W 4.5 pulg        5
SKU: MAK-HR2470 | Cantidad: 2 | Rotomartillo SDS Plus Makita
Cant: 4 | SKU: STA-STHT7088 | Juego Destornilladores Stanley
3 u. Truper Martillo Galponero 16oz
`;

  const extracted = extractProductsFromText(sampleMLReport);
  assert.equal(extracted.length, 5);

  const dewalt = extracted.find((i) => i.sku === "DW-DCD7781-20V");
  assert.ok(dewalt);
  assert.equal(dewalt.cantidad, 3);

  const bosch = extracted.find((i) => i.sku === "BOS-GWS850-45");
  assert.ok(bosch);
  assert.equal(bosch.cantidad, 5);

  const makita = extracted.find((i) => i.sku === "MAK-HR2470");
  assert.ok(makita);
  assert.equal(makita.cantidad, 2);

  const stanley = extracted.find((i) => i.sku === "STA-STHT7088");
  assert.ok(stanley);
  assert.equal(stanley.cantidad, 4);

  const truper = extracted.find((i) => i.cantidad === 3);
  assert.ok(truper);
});

test("auditPickingConsolidation compares original vs consolidated units and alerts on discrepancies", async () => {
  const { auditPickingConsolidation } = await import("./pickingLogic");

  const rawOriginals = [
    { sku: "SKU-A", cantidad: 36, slotIndex: 0 },
    { sku: "SKU-A", cantidad: 6, slotIndex: 1 },
    { sku: "SKU-B", cantidad: 10, slotIndex: 0 },
  ];

  // Case 1: Perfect match (36 + 6 = 42 for SKU-A, 10 for SKU-B)
  const validConsolidated: PickingItem[] = [
    {
      id: "1",
      sku: "SKU-A",
      producto: "Prod A",
      marca: "M",
      modelo: "M",
      categoria: "C",
      cta1: 36,
      cta2: 6,
      cta3: 0,
      cta4: 0,
      cta5: 0,
      totalPreparar: 42,
      preparado: false,
    },
    {
      id: "2",
      sku: "SKU-B",
      producto: "Prod B",
      marca: "M",
      modelo: "M",
      categoria: "C",
      cta1: 10,
      cta2: 0,
      cta3: 0,
      cta4: 0,
      cta5: 0,
      totalPreparar: 10,
      preparado: false,
    },
  ];

  const reportValid = auditPickingConsolidation(rawOriginals, validConsolidated);
  assert.equal(reportValid.isValid, true);
  assert.equal(reportValid.totalOriginalUnits, 52);
  assert.equal(reportValid.totalConsolidatedUnits, 52);
  assert.equal(reportValid.discrepancies.length, 0);
  assert.equal(reportValid.alertMessage, null);

  // Case 2: Discrepancy (e.g. only 30 counted for SKU-A instead of 42)
  const flawedConsolidated: PickingItem[] = [
    {
      id: "1",
      sku: "SKU-A",
      producto: "Prod A",
      marca: "M",
      modelo: "M",
      categoria: "C",
      cta1: 30,
      cta2: 0,
      cta3: 0,
      cta4: 0,
      cta5: 0,
      totalPreparar: 30,
      preparado: false,
    },
    {
      id: "2",
      sku: "SKU-B",
      producto: "Prod B",
      marca: "M",
      modelo: "M",
      categoria: "C",
      cta1: 10,
      cta2: 0,
      cta3: 0,
      cta4: 0,
      cta5: 0,
      totalPreparar: 10,
      preparado: false,
    },
  ];

  const reportFlawed = auditPickingConsolidation(rawOriginals, flawedConsolidated);
  assert.equal(reportFlawed.isValid, false);
  assert.equal(reportFlawed.totalOriginalUnits, 52);
  assert.equal(reportFlawed.totalConsolidatedUnits, 40);
  assert.equal(reportFlawed.discrepancies.length, 1);
  assert.equal(reportFlawed.discrepancies[0].sku, "SKU-A");
  assert.equal(reportFlawed.discrepancies[0].expectedUnits, 42);
  assert.equal(reportFlawed.discrepancies[0].consolidatedUnits, 30);
  assert.ok(reportFlawed.alertMessage?.includes("Alerta de discrepancia"));
});
