import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { PickingItem, PickingKPIs } from "./pickingLogic";

/**
 * Generates and downloads a clean, vertical (Portrait A4) PDF document
 * with full SKU grouping and account distribution breakdown.
 */
export async function generateVerticalPdfReport(
  items: PickingItem[],
  accountNames: string[],
  kpis: PickingKPIs,
  orderNumber: string,
  formattedDate: string
): Promise<void> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const names =
    accountNames.length === 5
      ? accountNames
      : ["Cuenta ML 1", "Cuenta ML 2", "Cuenta ML 3", "Cuenta ML 4", "Cuenta ML 5"];

  // Header Banner
  doc.setFillColor(45, 50, 119); // #2d3277
  doc.rect(0, 0, 210, 24, "F");

  doc.setTextColor(255, 230, 0); // #ffe600
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("PICKING FERREHOUSE — CONSOLIDADO MULTI-CUENTA", 10, 12);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Orden N°: ${orderNumber}  |  Fecha: ${formattedDate}`, 10, 19);

  // Summary Metrics Box
  doc.setDrawColor(200, 200, 200);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(10, 28, 190, 18, 2, 2, "FD");

  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`Total SKUs Únicos: ${kpis.uniqueSkus}`, 15, 35);
  doc.text(`Total Unidades Físicas: ${kpis.totalUnits}`, 75, 35);
  doc.text(`Cuentas Procesadas: ${kpis.accountsActive} / 5`, 140, 35);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Cuentas: 1. ${names[0]} | 2. ${names[1]} | 3. ${names[2]} | 4. ${names[3]} | 5. ${names[4]}`,
    15,
    42
  );

  // Table Headers
  let y = 52;
  const colWidths = [12, 38, 70, 10, 10, 10, 10, 10, 20]; // Total 190mm
  const colPositions = [10, 22, 60, 130, 140, 150, 160, 170, 180];

  doc.setFillColor(226, 232, 240);
  doc.rect(10, y, 190, 7, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);

  doc.text("CHK", colPositions[0] + 2, y + 5);
  doc.text("SKU", colPositions[1], y + 5);
  doc.text("PRODUCTO Y VARIANTES", colPositions[2], y + 5);
  doc.text("C1", colPositions[3] + 2, y + 5);
  doc.text("C2", colPositions[4] + 2, y + 5);
  doc.text("C3", colPositions[5] + 2, y + 5);
  doc.text("C4", colPositions[6] + 2, y + 5);
  doc.text("C5", colPositions[7] + 2, y + 5);
  doc.text("TOTAL", colPositions[8] + 4, y + 5);

  y += 9;

  // Table Rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    // Check if new page is needed
    if (y > 270) {
      doc.addPage();
      y = 15;

      // Repeat Header on new page
      doc.setFillColor(226, 232, 240);
      doc.rect(10, y, 190, 7, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 41, 59);

      doc.text("CHK", colPositions[0] + 2, y + 5);
      doc.text("SKU", colPositions[1], y + 5);
      doc.text("PRODUCTO Y VARIANTES", colPositions[2], y + 5);
      doc.text("C1", colPositions[3] + 2, y + 5);
      doc.text("C2", colPositions[4] + 2, y + 5);
      doc.text("C3", colPositions[5] + 2, y + 5);
      doc.text("C4", colPositions[6] + 2, y + 5);
      doc.text("C5", colPositions[7] + 2, y + 5);
      doc.text("TOTAL", colPositions[8] + 4, y + 5);

      y += 9;
      doc.setFont("helvetica", "normal");
    }

    // Row Checkbox Box
    doc.setDrawColor(150, 150, 150);
    doc.rect(colPositions[0] + 2, y - 3.5, 4, 4);

    // SKU
    doc.setFont("courier", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(45, 50, 119);
    const skuText = doc.splitTextToSize(item.sku, 36);
    doc.text(skuText, colPositions[1], y);

    // Product title
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    const titleText = doc.splitTextToSize(item.producto, 66);
    doc.text(titleText[0] || item.producto, colPositions[2], y);

    // Amounts
    doc.setFont("courier", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(50, 50, 50);

    doc.text(String(item.cta1), colPositions[3] + 3, y);
    doc.text(String(item.cta2), colPositions[4] + 3, y);
    doc.text(String(item.cta3), colPositions[5] + 3, y);
    doc.text(String(item.cta4), colPositions[6] + 3, y);
    doc.text(String(item.cta5), colPositions[7] + 3, y);

    // Total Highlight
    doc.setFillColor(255, 249, 204);
    doc.rect(colPositions[8] - 1, y - 4, 21, 6, "F");
    doc.setFont("courier", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(45, 50, 119);
    doc.text(String(item.totalPreparar), colPositions[8] + 5, y);

    // Line height adjustment based on SKU/title length
    const maxLines = Math.max(skuText.length, titleText.length);
    y += Math.max(6, maxLines * 4.5);

    // Separator line
    doc.setDrawColor(240, 240, 240);
    doc.line(10, y - 2, 200, y - 2);
  }

  // Footer Signatures Box on final page
  if (y > 250) {
    doc.addPage();
    y = 20;
  } else {
    y += 10;
  }

  doc.setDrawColor(200, 200, 200);
  doc.line(20, y + 15, 80, y + 15);
  doc.line(130, y + 15, 190, y + 15);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text("Firma Responsable Bodega", 25, y + 20);
  doc.text("Firma Entrega Transportista / Courier", 130, y + 20);

  doc.save(`Orden_Picking_Vertical_${orderNumber}.pdf`);
}
