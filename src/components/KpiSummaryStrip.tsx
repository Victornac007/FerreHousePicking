import React from "react";
import { PickingKPIs } from "../utils/pickingLogic";

interface KpiSummaryStripProps {
  kpis: PickingKPIs;
  accountNames: string[];
}

export const KpiSummaryStrip: React.FC<KpiSummaryStripProps> = ({
  kpis,
  accountNames,
}) => {
  return (
    <section
      id="resumen-kpis"
      aria-label="Indicadores clave de preparación de bodega"
      className="no-print grid grid-cols-1 md:grid-cols-3 gap-4"
    >
      {/* KPI 1: Total de unidades físicas a preparar hoy */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-semibold text-slate-700">
            Unidades Físicas a Preparar Hoy
          </span>
          <span>·</span>
          <span className="font-mono-tabular">
            {kpis.completedUnits} / {kpis.totalUnits} listas
          </span>
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-4">
          <p
            data-testid="kpi-total-units"
            className="text-3xl font-extrabold text-slate-900 font-mono-tabular tracking-tight"
          >
            {kpis.totalUnits}
          </p>
          <span className="text-xs text-slate-600">
            unidades consolidadas en bodega
          </span>
        </div>
      </div>

      {/* KPI 2: Total de productos únicos (SKUs) */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-semibold text-slate-700">
            Productos Únicos (SKUs Homologados)
          </span>
          <span>·</span>
          <span className="font-mono-tabular">
            {kpis.completionPercentage}% completado
          </span>
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-4">
          <p
            data-testid="kpi-unique-skus"
            className="text-3xl font-extrabold text-slate-900 font-mono-tabular tracking-tight"
          >
            {kpis.uniqueSkus}
          </p>
          <span className="text-xs text-slate-600">
            {kpis.completedSkus} de {kpis.uniqueSkus} SKUs verificados
          </span>
        </div>
      </div>

      {/* KPI 3: Cuentas procesadas y desglose rápido */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span className="font-semibold text-slate-700">
            Cuentas Mercado Libre Procesadas
          </span>
          <span>·</span>
          <span className="font-mono-tabular">Máx. 5 tiendas</span>
        </div>
        <div className="mt-3 flex items-baseline justify-between gap-4">
          <p
            data-testid="kpi-accounts-active"
            className="text-3xl font-extrabold text-slate-900 font-mono-tabular tracking-tight"
          >
            {kpis.accountsActive} / 5
          </p>
          <div className="text-xs text-slate-600 font-mono-tabular truncate">
            {accountNames
              .map((_, i) => `C${i + 1}:${kpis.perAccountTotals[i]}`)
              .join(" · ")}
          </div>
        </div>
      </div>
    </section>
  );
};
