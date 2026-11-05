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
