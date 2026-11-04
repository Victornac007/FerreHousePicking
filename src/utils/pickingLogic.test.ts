import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizePickingItems,
  calculatePickingKPIs,
  filterAndSortPickingItems,
  generatePickingCsvWithBom,
  getDemoPickingData,
} from "./pickingLogic";

test("getDemoPickingData includes the 25 DeWalt drills consolidated across 5 accounts (5+5+5+5+5)", () => {
  const demo = getDemoPickingData();
  assert.equal(demo.accountNames.length, 5);
  assert.ok(demo.items.length >= 6);

  const drill = demo.items.find((item) => item.sku === "DW-DCD7781-20V");
  assert.ok(drill, "DeWalt drill SKU DW-DCD7781-20V must exist in demo data");
  assert.equal(drill.cta1, 5);
  assert.equal(drill.cta2, 5);
  assert.equal(drill.cta3, 5);
  assert.equal(drill.cta4, 5);
  assert.equal(drill.cta5, 5);
  assert.equal(drill.totalPreparar, 25);
});

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
  const demo = getDemoPickingData();
  const kpis = calculatePickingKPIs(demo.items, 5);

  assert.equal(kpis.uniqueSkus, 8);
  assert.equal(kpis.accountsActive, 5);
  assert.equal(kpis.totalUnits, 124);
  assert.deepEqual(kpis.perAccountTotals, [26, 27, 22, 26, 23]);
  assert.equal(kpis.completedSkus, 2);
});

test("filterAndSortPickingItems filters by SKU, brand, product name, and status", () => {
  const demo = getDemoPickingData();

  const byBrand = filterAndSortPickingItems(demo.items, {
    searchQuery: "dewalt",
  });
  assert.equal(byBrand.length, 1);
  assert.equal(byBrand[0].sku, "DW-DCD7781-20V");

  const byPending = filterAndSortPickingItems(demo.items, {
    searchQuery: "",
    statusFilter: "pending",
  });
  assert.equal(byPending.length, 6);

  const byCompleted = filterAndSortPickingItems(demo.items, {
    searchQuery: "",
    statusFilter: "completed",
  });
  assert.equal(byCompleted.length, 2);
});

test("generatePickingCsvWithBom outputs UTF-8 BOM and semicolon-separated rows for Spanish Excel", () => {
  const demo = getDemoPickingData();
  const csv = generatePickingCsvWithBom(demo.items, demo.accountNames);

  assert.ok(csv.startsWith("\uFEFF"), "CSV must start with UTF-8 BOM");
  const lines = csv.slice(1).split("\r\n");
  // Header + 8 items + 1 totals row = 10 lines
  assert.equal(lines.length, 10);
  assert.ok(lines[0].includes(";"), "Header must be delimited by semicolons");
  assert.ok(lines[0].includes("TOTAL A PREPARAR"));
  assert.ok(lines[1].includes("DW-DCD7781-20V"));
  assert.ok(lines[9].startsWith("TOTALES BODEGA;"));
});
