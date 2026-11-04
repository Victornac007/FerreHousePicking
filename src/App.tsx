/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import { Printer, PlusCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  AccountSlot,
  PickingItem,
  FilterStatus,
  SortField,
  SortDirection,
  normalizePickingItems,
  calculatePickingKPIs,
  filterAndSortPickingItems,
  generatePickingCsvWithBom,
  getDemoPickingData,
} from "./utils/pickingLogic";
import { AccountUploadSection } from "./components/AccountUploadSection";
import { KpiSummaryStrip } from "./components/KpiSummaryStrip";
import { PickingTableSection } from "./components/PickingTableSection";
import { ManualItemModal } from "./components/ManualItemModal";
import {
  PrintWorkOrderHeader,
  PrintSignaturesFooter,
} from "./components/PrintSheetBlocks";

const INITIAL_SLOTS: AccountSlot[] = [
  {
    index: 0,
    name: "Cuenta ML 1",
    fileName: null,
    fileSize: null,
    base64Data: null,
    mimeType: null,
  },
  {
    index: 1,
    name: "Cuenta ML 2",
    fileName: null,
    fileSize: null,
    base64Data: null,
    mimeType: null,
  },
  {
    index: 2,
    name: "Cuenta ML 3",
    fileName: null,
    fileSize: null,
    base64Data: null,
    mimeType: null,
  },
  {
    index: 3,
    name: "Cuenta ML 4",
    fileName: null,
    fileSize: null,
    base64Data: null,
    mimeType: null,
  },
  {
    index: 4,
    name: "Cuenta ML 5",
    fileName: null,
    fileSize: null,
    base64Data: null,
    mimeType: null,
  },
];

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () =>
      reject(new Error(`No se pudo leer el archivo ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export default function App() {
  // Initialize with the 25 DeWalt drills demonstration dataset so the warehouse operator
  // can immediately inspect the consolidated table, search, CSV export, and print preview,
  // or clear/upload their own 5 daily PDFs.
  const initialDemo = useMemo(() => getDemoPickingData(), []);

  const [slots, setSlots] = useState<AccountSlot[]>(() =>
    INITIAL_SLOTS.map((slot, idx) => ({
      ...slot,
      name: initialDemo.accountNames[idx] || slot.name,
    }))
  );
  const [items, setItems] = useState<PickingItem[]>(initialDemo.items);
  const [resumenOperativo, setResumenOperativo] = useState<string>(
    initialDemo.resumenOperativo
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Table filter & sort states
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [accountFilter, setAccountFilter] = useState<number | null>(null);
  const [sortField, setSortField] = useState<SortField>("totalPreparar");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  const accountNames = useMemo(() => slots.map((s) => s.name), [slots]);
  const uploadedSlotsCount = useMemo(
    () => slots.filter((s) => s.base64Data !== null).length,
    [slots]
  );

  const kpis = useMemo(
    () => calculatePickingKPIs(items, uploadedSlotsCount),
    [items, uploadedSlotsCount]
  );

  const filteredItems = useMemo(
    () =>
      filterAndSortPickingItems(items, {
        searchQuery,
        statusFilter,
        accountFilter,
        sortField,
        sortDirection,
      }),
    [items, searchQuery, statusFilter, accountFilter, sortField, sortDirection]
  );

  const orderNumber = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `FHP-${y}${m}${d}-01`;
  }, []);

  const formattedDate = useMemo(() => {
    return new Intl.DateTimeFormat("es-CL", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
  }, []);

  const handleUpdateSlotName = (index: number, newName: string) => {
    setSlots((prev) =>
      prev.map((slot) =>
        slot.index === index ? { ...slot, name: newName } : slot
      )
    );
  };

  const handleUploadSingleFile = async (index: number, file: File) => {
    try {
      setErrorBanner(null);
      const base64Data = await readFileAsBase64(file);
      setSlots((prev) =>
        prev.map((slot) =>
          slot.index === index
            ? {
                ...slot,
                fileName: file.name,
                fileSize: file.size,
                base64Data,
                mimeType: file.type || "application/pdf",
              }
            : slot
        )
      );
      setStatusNotice(
        `Archivo "${file.name}" cargado en ${slots[index]?.name || `Cuenta ${index + 1}`}.`
      );
    } catch (err: unknown) {
      setErrorBanner(
        err instanceof Error ? err.message : "Error al leer el archivo PDF."
      );
    }
  };

  const handleUploadBatchFiles = async (fileList: FileList | File[]) => {
    try {
      setErrorBanner(null);
      const filesArray = Array.from(fileList).slice(0, 5);
      if (filesArray.length === 0) return;

      const encodedFiles = await Promise.all(
        filesArray.map(async (file) => ({
          name: file.name,
          size: file.size,
          mimeType: file.type || "application/pdf",
          base64Data: await readFileAsBase64(file),
        }))
      );

      setSlots((prev) => {
        const updated = [...prev];
        let fileCursor = 0;

        // First fill empty slots, or overwrite from slot 0 if all have files
        const emptyIndices = updated
          .filter((s) => !s.base64Data)
          .map((s) => s.index);

        if (emptyIndices.length >= encodedFiles.length) {
          for (const targetIdx of emptyIndices) {
            if (fileCursor >= encodedFiles.length) break;
            const f = encodedFiles[fileCursor++];
            updated[targetIdx] = {
              ...updated[targetIdx],
              fileName: f.name,
              fileSize: f.size,
              base64Data: f.base64Data,
              mimeType: f.mimeType,
            };
          }
        } else {
          for (let i = 0; i < encodedFiles.length && i < 5; i++) {
            const f = encodedFiles[i];
            updated[i] = {
              ...updated[i],
              fileName: f.name,
              fileSize: f.size,
              base64Data: f.base64Data,
              mimeType: f.mimeType,
            };
          }
        }
        return updated;
      });

      setStatusNotice(
        `Se cargaron ${encodedFiles.length} archivo(s) PDF en las ranuras de cuenta. Haz clic en "Consolidar PDF(s) con IA" para extraer las ventas.`
      );
    } catch (err: unknown) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : "Error al cargar múltiples archivos PDF."
      );
    }
  };

  const handleRemoveSlotFile = (index: number) => {
    setSlots((prev) =>
      prev.map((slot) =>
        slot.index === index
          ? {
              ...slot,
              fileName: null,
              fileSize: null,
              base64Data: null,
              mimeType: null,
            }
          : slot
      )
    );
  };

  const handleClearAllFiles = () => {
    setSlots((prev) =>
      prev.map((slot) => ({
        ...slot,
        fileName: null,
        fileSize: null,
        base64Data: null,
        mimeType: null,
      }))
    );
    setStatusNotice("Archivos PDF removidos de las 5 ranuras.");
  };

  const handleConsolidateWithGemini = async () => {
    const activeFiles = slots.filter((s) => s.base64Data !== null);
    if (activeFiles.length === 0) {
      setErrorBanner(
        "Debes subir al menos un archivo PDF en cualquiera de las 5 cuentas antes de consolidar."
      );
      return;
    }

    setIsProcessing(true);
    setErrorBanner(null);
    setStatusNotice(null);

    try {
      const response = await fetch("/api/consolidate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accountNames: slots.map((s) => s.name),
          files: activeFiles.map((s) => ({
            slotIndex: s.index,
            accountName: s.name,
            fileName: s.fileName || `Cuenta_${s.index + 1}.pdf`,
            base64Data: s.base64Data,
            mimeType: s.mimeType || "application/pdf",
          })),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error || "Error al procesar los PDFs en el servidor."
        );
      }

      const normalized = normalizePickingItems(data.items || []);
      setItems(normalized);
      setResumenOperativo(
        data.resumenOperativo ||
          `Consolidación completada a partir de ${activeFiles.length} cuenta(s) de Mercado Libre.`
      );
      setStatusNotice(
        `¡Consolidación exitosa! Se homologaron ${normalized.length} productos únicos (SKUs) de ${activeFiles.length} archivo(s) PDF.`
      );
    } catch (err: unknown) {
      setErrorBanner(
        err instanceof Error
          ? err.message
          : "No se pudo completar la consolidación de los archivos PDF."
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLoadDemoData = () => {
    setErrorBanner(null);
    const demo = getDemoPickingData();
    setSlots((prev) =>
      prev.map((slot, idx) => ({
        ...slot,
        name: demo.accountNames[idx] || slot.name,
      }))
    );
    setItems(demo.items);
    setResumenOperativo(demo.resumenOperativo);
    setSearchQuery("");
    setStatusFilter("all");
    setAccountFilter(null);
    setStatusNotice(
      "Datos de demostración cargados: Ejemplo de 25 Taladros DeWalt (5 por cada una de las 5 cuentas) + 7 SKUs ferreteros adicionales."
    );
  };

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection(field === "totalPreparar" ? "desc" : "asc");
    }
  };

  const handleToggleItemPrepared = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, preparado: !item.preparado } : item
      )
    );
  };

  const handleMarkAllPrepared = (prepared: boolean) => {
    const visibleIds = new Set(filteredItems.map((i) => i.id));
    setItems((prev) =>
      prev.map((item) =>
        visibleIds.has(item.id) ? { ...item, preparado } : item
      )
    );
  };

  const handleAddManualItem = (newItem: Partial<PickingItem>) => {
    const merged = normalizePickingItems([...items, newItem]);
    setItems(merged);
    setStatusNotice(
      `Producto ${newItem.sku} agregado y consolidado en la tabla de picking.`
    );
  };

  const handlePrintOrder = () => {
    window.print();
  };

  const handleExportCsv = () => {
    if (items.length === 0) return;
    const csvContent = generatePickingCsvWithBom(items, accountNames);
    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Orden_Picking_${orderNumber}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatusNotice(
      `Archivo Excel/CSV (${orderNumber}.csv) descargado con codificación UTF-8 BOM y separador (;).`
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#ebebeb] text-[#333333]">
      {/* Top Bar Mercado Libre Brand: Fondo Amarillo Oficial #ffe600 con texto y acentos azul marino #2d3277 */}
      <header className="no-print sticky top-0 z-30 bg-[#ffe600] border-b border-[#e6ce00] px-4 sm:px-6 py-3 shadow-xs">
        <div className="max-w-[1380px] mx-auto flex items-center justify-between gap-3 sm:gap-8">
          {/* Zona 1: Brand Title con look Mercado Libre */}
          <a
            href="#top"
            className="flex items-center gap-2 text-base sm:text-lg font-extrabold tracking-tight text-[#2d3277] whitespace-nowrap shrink-0 hover:opacity-90 transition-opacity"
          >
            <span className="w-2.5 h-2.5 rounded-full bg-[#2d3277] shrink-0" aria-hidden="true" />
            <span>FerreHousePicking</span>
            <span className="hidden sm:inline text-xs font-semibold px-2 py-0.5 rounded bg-[#2d3277]/10 text-[#2d3277]">
              Mercado Envíos
            </span>
          </a>

          {/* Zona 2: 4 enlaces de navegación limpios en una sola línea */}
          <nav
            aria-label="Navegación principal de bodega"
            className="hidden md:flex items-center gap-6 text-sm font-semibold text-[#2d3277]/90"
          >
            <a
              href="#carga-cuentas"
              className="hover:text-[#2d3277] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Cuentas PDF
            </a>
            <a
              href="#resumen-kpis"
              className="hover:text-[#2d3277] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Indicadores
            </a>
            <a
              href="#tabla-picking"
              className="hover:text-[#2d3277] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Tabla Consolidada
            </a>
            <button
              type="button"
              onClick={() => setIsManualModalOpen(true)}
              className="hover:text-[#2d3277] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ingreso Manual
            </button>
          </nav>

          {/* Zona 3: 1 Acción Primaria (Botón Azul Mercado Libre #3483fa) */}
          <div className="flex items-center shrink-0 min-w-0">
            <button
              type="button"
              onClick={handlePrintOrder}
              disabled={items.length === 0}
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2 text-xs font-bold text-white bg-[#2d3277] hover:bg-[#1f2358] active:bg-[#171a42] rounded-lg transition-colors cursor-pointer disabled:opacity-40 shadow-xs whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5 text-[#ffe600] shrink-0" />
              <span>Imprimir Orden de Picking</span>
            </button>
          </div>
        </div>
      </header>

      {/* Contenedor Principal (1380px en escritorio, 100% en impresión) */}
      <main
        id="top"
        className="flex-1 w-full max-w-[1380px] mx-auto px-4 sm:px-6 py-6 space-y-6 print-container"
      >
        {/* Encabezado Operativo de Contexto (Oculto en impresión) */}
        <div className="no-print flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 font-medium">
              <span>Centro de Distribución y Despacho</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">Orden {orderNumber}</span>
              <span aria-hidden="true">·</span>
              <span>{formattedDate}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
              Consolidador de Picking Multi-Cuenta Mercado Libre
            </h1>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsManualModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <PlusCircle className="w-3.5 h-3.5 text-slate-600" />
              <span>Agregar SKU Manual</span>
            </button>
          </div>
        </div>

        {/* Notificaciones de estado o error (Oculto en impresión) */}
        {errorBanner && (
          <div
            role="alert"
            className="no-print flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs font-medium"
          >
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorBanner}</span>
            </div>
            <button
              type="button"
              onClick={() => setErrorBanner(null)}
              className="text-xs font-bold underline cursor-pointer shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}

        {statusNotice && !errorBanner && (
          <div
            role="status"
            className="no-print flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 text-xs font-medium"
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>{statusNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="text-xs font-semibold text-emerald-800 hover:underline cursor-pointer shrink-0"
            >
              Ocultar
            </button>
          </div>
        )}

        {/* Bloque exclusivo para Impresión: Encabezado de Orden de Bodega en B/N */}
        <PrintWorkOrderHeader
          kpis={kpis}
          accountNames={accountNames}
          orderNumber={orderNumber}
          formattedDate={formattedDate}
        />

        {/* Sección 1: Carga de los 5 Archivos PDF */}
        <AccountUploadSection
          slots={slots}
          isProcessing={isProcessing}
          onUpdateSlotName={handleUpdateSlotName}
          onUploadSingleFile={handleUploadSingleFile}
          onUploadBatchFiles={handleUploadBatchFiles}
          onRemoveSlotFile={handleRemoveSlotFile}
          onClearAllFiles={handleClearAllFiles}
          onConsolidateWithGemini={handleConsolidateWithGemini}
          onLoadDemoData={handleLoadDemoData}
        />

        {/* Sección 2: Tarjetas de Resumen Superior (KPIs) */}
        <KpiSummaryStrip kpis={kpis} accountNames={accountNames} />

        {/* Sección 3: Tabla de Consolidación e Interfaz Operativa */}
        <PickingTableSection
          items={items}
          filteredItems={filteredItems}
          accountNames={accountNames}
          kpis={kpis}
          resumenOperativo={resumenOperativo}
          searchQuery={searchQuery}
          statusFilter={statusFilter}
          accountFilter={accountFilter}
          sortField={sortField}
          sortDirection={sortDirection}
          onSearchChange={setSearchQuery}
          onStatusFilterChange={setStatusFilter}
          onAccountFilterChange={setAccountFilter}
          onToggleSort={handleToggleSort}
          onToggleItemPrepared={handleToggleItemPrepared}
          onMarkAllPrepared={handleMarkAllPrepared}
          onPrintOrder={handlePrintOrder}
          onExportCsv={handleExportCsv}
          onLoadDemoData={handleLoadDemoData}
        />

        {/* Bloque exclusivo para Impresión: Firmas de Responsable de Bodega y Recepción Courier */}
        <PrintSignaturesFooter />
      </main>

      {/* Pie de página limpio (Oculto en impresión) */}
      <footer className="no-print border-t border-slate-200 bg-white py-4 px-6 mt-10">
        <div className="max-w-[1380px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>
            FerreHousePicking · Sistema de Consolidación de Pedidos y Despacho para Bodega
          </span>
          <span>
            Compatible con Impresión A4 Horizontal B/N y Exportación Microsoft Excel (UTF-8 BOM)
          </span>
        </div>
      </footer>

      {/* Modal para agregar o sumar un producto manualmente */}
      <ManualItemModal
        isOpen={isManualModalOpen}
        accountNames={accountNames}
        onClose={() => setIsManualModalOpen(false)}
        onAddItem={handleAddManualItem}
      />
    </div>
  );
}
