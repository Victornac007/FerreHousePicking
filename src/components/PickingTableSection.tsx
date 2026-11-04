import React from "react";
import {
  Search,
  Printer,
  Download,
  CheckSquare,
  Square,
  ArrowUpDown,
  PackageOpen,
  PlayCircle,
  X,
} from "lucide-react";
import {
  PickingItem,
  FilterStatus,
  SortField,
  SortDirection,
  PickingKPIs,
} from "../utils/pickingLogic";

interface PickingTableSectionProps {
  items: PickingItem[];
  filteredItems: PickingItem[];
  accountNames: string[];
  kpis: PickingKPIs;
  resumenOperativo: string;
  searchQuery: string;
  statusFilter: FilterStatus;
  accountFilter: number | null;
  sortField: SortField;
  sortDirection: SortDirection;
  onSearchChange: (q: string) => void;
  onStatusFilterChange: (status: FilterStatus) => void;
  onAccountFilterChange: (accountIndex: number | null) => void;
  onToggleSort: (field: SortField) => void;
  onToggleItemPrepared: (id: string) => void;
  onMarkAllPrepared: (prepared: boolean) => void;
  onPrintOrder: () => void;
  onExportCsv: () => void;
  onLoadDemoData: () => void;
}

export const PickingTableSection: React.FC<PickingTableSectionProps> = ({
  items,
  filteredItems,
  accountNames,
  kpis,
  resumenOperativo,
  searchQuery,
  statusFilter,
  accountFilter,
  sortField,
  sortDirection,
  onSearchChange,
  onStatusFilterChange,
  onAccountFilterChange,
  onToggleSort,
  onToggleItemPrepared,
  onMarkAllPrepared,
  onPrintOrder,
  onExportCsv,
  onLoadDemoData,
}) => {
  const allFilteredPrepared =
    filteredItems.length > 0 && filteredItems.every((item) => item.preparado);

  // Sum totals for the currently visible filtered items
  const filteredTotals = filteredItems.reduce(
    (acc, item) => {
      acc.cta1 += item.cta1;
      acc.cta2 += item.cta2;
      acc.cta3 += item.cta3;
      acc.cta4 += item.cta4;
      acc.cta5 += item.cta5;
      acc.total += item.totalPreparar;
      return acc;
    },
    { cta1: 0, cta2: 0, cta3: 0, cta4: 0, cta5: 0, total: 0 }
  );

  return (
    <section
      id="tabla-picking"
      aria-label="Tabla consolidada de órdenes de picking"
      className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs print-container"
    >
      {/* Cabecera Operativa y Botones de Exportación / Impresión (Oculto en papel) */}
      <div className="no-print flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            2. Planilla Maestra de Consolidación y Picking
          </h2>
          {resumenOperativo ? (
            <p className="text-xs text-slate-600 mt-1 max-w-3xl">
              {resumenOperativo}
            </p>
          ) : (
            <p className="text-xs text-slate-500 mt-1">
              Lista unificada por SKU, marca y modelo lista para retiro en pasillos y entrega a Mercado Envíos / Courier.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onExportCsv}
            disabled={items.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0 shadow-2xs"
          >
            <Download className="w-4 h-4 text-[#00a650] shrink-0" />
            <span>Descargar Excel / CSV</span>
          </button>

          <button
            type="button"
            onClick={onPrintOrder}
            disabled={items.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#2d3277] hover:bg-[#1f2358] active:bg-[#171a42] rounded-lg transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0 shadow-xs"
          >
            <Printer className="w-4 h-4 text-[#ffe600] shrink-0" />
            <span>Imprimir Orden de Picking</span>
          </button>
        </div>
      </div>

      {/* Barra de Búsqueda en Tiempo Real y Filtros Operativos (Oculto en papel) */}
      <div className="no-print mt-5 flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
        {/* Buscador por SKU, marca o producto */}
        <div className="relative flex-1 max-w-xl">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar en tiempo real por SKU, marca, modelo, pasillo o nombre de producto..."
            aria-label="Buscar por SKU, marca o nombre de producto"
            className="w-full pl-10 pr-9 py-2 text-sm text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white focus:border-slate-900 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Controles segmentados de Estado y Cuenta */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Filtro por estado de preparación */}
          <div
            role="group"
            aria-label="Filtrar por estado de preparación"
            className="inline-flex items-center p-1 bg-slate-100 rounded-lg border border-slate-200"
          >
            <button
              type="button"
              onClick={() => onStatusFilterChange("all")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                statusFilter === "all"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Todos ({items.length})
            </button>
            <button
              type="button"
              onClick={() => onStatusFilterChange("pending")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                statusFilter === "pending"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Pendientes ({items.length - kpis.completedSkus})
            </button>
            <button
              type="button"
              onClick={() => onStatusFilterChange("completed")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                statusFilter === "completed"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Preparados ({kpis.completedSkus})
            </button>
          </div>

          {/* Filtro por cuenta específica */}
          <select
            aria-label="Filtrar productos por cuenta de Mercado Libre"
            value={accountFilter === null ? "" : String(accountFilter)}
            onChange={(e) =>
              onAccountFilterChange(
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-900 cursor-pointer"
          >
            <option value="">Todas las cuentas (1 a 5)</option>
            {accountNames.map((name, idx) => (
              <option key={idx} value={idx + 1}>
                Con ventas en: {name}
              </option>
            ))}
          </select>

          {items.length > 0 && (
            <button
              type="button"
              onClick={() => onMarkAllPrepared(!allFilteredPrepared)}
              className="px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {allFilteredPrepared
                ? "Desmarcar visibles"
                : "Marcar visibles como preparados"}
            </button>
          )}
        </div>
      </div>

      {/* Estado Vacío si no hay ítems */}
      {items.length === 0 ? (
        <div className="no-print mt-6 py-14 px-4 border border-dashed border-slate-200 rounded-xl text-center max-w-xl mx-auto">
          <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto mb-3">
            <PackageOpen className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-slate-900">
            Aún no hay productos consolidados en la lista de picking
          </h3>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            Sube hasta 5 archivos PDF de tus cuentas de Mercado Libre y presiona{" "}
            <strong>Consolidar con IA</strong>, o carga inmediatamente el caso de prueba de{" "}
            <strong>25 Taladros DeWalt (5 por cuenta)</strong> para explorar la tabla y probar la impresión de bodega.
          </p>
          <div className="mt-5">
            <button
              type="button"
              onClick={onLoadDemoData}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-bold text-amber-950 bg-amber-400 hover:bg-amber-500 rounded-lg transition-colors cursor-pointer"
            >
              <PlayCircle className="w-4 h-4" />
              <span>Cargar Datos de Demostración (Ejemplo 25 Taladros)</span>
            </button>
          </div>
        </div>
      ) : (
        /* Tabla Interactiva y de Impresión */
        <div className="mt-5 overflow-x-auto border border-slate-200 rounded-lg print-table-wrapper">
          <table className="w-full text-left border-collapse print-table">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-200 text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                <th className="py-3 px-3 text-center w-14">Check</th>
                <th className="py-3 px-3">
                  <button
                    type="button"
                    onClick={() => onToggleSort("sku")}
                    className="inline-flex items-center gap-1 hover:text-slate-950 cursor-pointer uppercase font-bold"
                  >
                    <span>SKU / Ubicación</span>
                    <ArrowUpDown className="w-3 h-3 no-print" />
                  </button>
                </th>
                <th className="py-3 px-3 min-w-[250px]">
                  <button
                    type="button"
                    onClick={() => onToggleSort("producto")}
                    className="inline-flex items-center gap-1 hover:text-slate-950 cursor-pointer uppercase font-bold"
                  >
                    <span>Producto y Marca</span>
                    <ArrowUpDown className="w-3 h-3 no-print" />
                  </button>
                </th>
                {accountNames.map((name, idx) => (
                  <th
                    key={idx}
                    className="py-3 px-2.5 text-right font-mono-tabular min-w-[78px]"
                    title={name}
                  >
                    <div className="truncate max-w-[105px] ml-auto">
                      Cta {idx + 1}
                    </div>
                    <div className="text-[10px] font-normal text-slate-500 truncate max-w-[105px] ml-auto normal-case">
                      {name}
                    </div>
                  </th>
                ))}
                <th className="py-3 px-4 text-right bg-[#fff9cc] border-l-2 border-[#ffe600] text-[#2d3277] print-total-col min-w-[125px]">
                  <button
                    type="button"
                    onClick={() => onToggleSort("totalPreparar")}
                    className="inline-flex items-center justify-end gap-1 w-full hover:text-[#1f2358] cursor-pointer uppercase font-extrabold"
                  >
                    <span>TOTAL A PREPARAR</span>
                    <ArrowUpDown className="w-3.5 h-3.5 no-print" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-sm">
              {filteredItems.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="py-10 px-4 text-center text-xs text-slate-500"
                  >
                    No se encontraron productos que coincidan con el filtro{" "}
                    <strong>"{searchQuery}"</strong>.
                  </td>
                </tr>
              ) : (
                filteredItems.map((item) => {
                  return (
                    <tr
                      key={item.id}
                      onClick={() => onToggleItemPrepared(item.id)}
                      className={`transition-colors cursor-pointer ${
                        item.preparado
                          ? "bg-emerald-50/50 text-slate-500"
                          : "hover:bg-slate-50 text-slate-900"
                      }`}
                    >
                      {/* Columna 1: Checkbox interactivo en pantalla + Casilla física en impresión */}
                      <td
                        className="py-3 px-3 text-center align-middle"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={item.preparado}
                          aria-label={`Marcar ${item.sku} como preparado`}
                          onClick={() => onToggleItemPrepared(item.id)}
                          className="no-print inline-flex items-center justify-center p-1 rounded hover:bg-slate-200/70 transition-colors cursor-pointer"
                        >
                          {item.preparado ? (
                            <CheckSquare className="w-5 h-5 text-[#00a650]" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-400" />
                          )}
                        </button>
                        {/* Casilla física exclusiva para marcar con lápiz al imprimir */}
                        <span
                          className="hidden print-checkbox-box"
                          aria-hidden="true"
                        />
                      </td>

                      {/* Columna 2: SKU y Ubicación de Bodega */}
                      <td className="py-3 px-3 align-middle whitespace-nowrap">
                        <div
                          className={`font-mono-tabular font-bold text-xs ${
                            item.preparado
                              ? "line-through text-slate-500"
                              : "text-slate-900"
                          }`}
                        >
                          {item.sku}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-tabular mt-0.5">
                          {item.ubicacionSugerida}
                        </div>
                      </td>

                      {/* Columna 3: Producto, Marca y Modelo (Zero-Pill: metadatos limpios con separador ·) */}
                      <td className="py-3 px-3 align-middle">
                        <div
                          className={`font-semibold text-sm leading-snug ${
                            item.preparado
                              ? "line-through text-slate-500"
                              : "text-slate-900"
                          }`}
                        >
                          {item.producto}
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 mt-0.5">
                          <span className="font-semibold text-slate-700">
                            {item.marca}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>Mod: {item.modelo}</span>
                          <span aria-hidden="true">·</span>
                          <span>{item.categoria}</span>
                        </div>
                      </td>

                      {/* Columnas 4 a 8: Cta 1 a Cta 5 */}
                      {[item.cta1, item.cta2, item.cta3, item.cta4, item.cta5].map(
                        (qty, idx) => (
                          <td
                            key={idx}
                            className={`py-3 px-2.5 text-right align-middle font-mono-tabular text-sm ${
                              qty > 0
                                ? "font-bold text-slate-900"
                                : "text-slate-400"
                            }`}
                          >
                            {qty}
                          </td>
                        )
                      )}

                      {/* Columna 9: TOTAL A PREPARAR destacado con Mercado Libre Yellow */}
                      <td
                        data-testid={`row-total-${item.sku}`}
                        className="py-3 px-4 text-right align-middle font-mono-tabular text-base font-extrabold bg-[#fff9cc] border-l-2 border-[#ffe600] text-[#2d3277] print-total-col"
                      >
                        {item.totalPreparar}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>

            {/* Pie de tabla con sumatoria total por cuenta y total general */}
            {filteredItems.length > 0 && (
              <tfoot>
                <tr className="bg-[#2d3277] text-white font-mono-tabular text-xs font-bold">
                  <td colSpan={3} className="py-3 px-3 text-right uppercase">
                    Totales Consolidados ({filteredItems.length} SKUs listados):
                  </td>
                  <td className="py-3 px-2.5 text-right">{filteredTotals.cta1}</td>
                  <td className="py-3 px-2.5 text-right">{filteredTotals.cta2}</td>
                  <td className="py-3 px-2.5 text-right">{filteredTotals.cta3}</td>
                  <td className="py-3 px-2.5 text-right">{filteredTotals.cta4}</td>
                  <td className="py-3 px-2.5 text-right">{filteredTotals.cta5}</td>
                  <td
                    data-testid="table-grand-total"
                    className="py-3 px-4 text-right text-sm font-extrabold text-[#ffe600] border-l border-white/20 print-total-col"
                  >
                    {filteredTotals.total} uds.
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  );
};
