import React from "react";
import { PickingKPIs } from "../utils/pickingLogic";

interface PrintSheetBlocksProps {
  kpis: PickingKPIs;
  accountNames: string[];
  orderNumber: string;
  formattedDate: string;
}

export const PrintWorkOrderHeader: React.FC<PrintSheetBlocksProps> = ({
  kpis,
  accountNames,
  orderNumber,
  formattedDate,
}) => {
  return (
    <div className="hidden print-only mb-2 pb-2 border-b-2 border-black text-black">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <img
            src="/logo-ferrehouse.png"
            alt="Logo FerreHouse"
            className="w-7 h-7 rounded object-contain border border-black bg-slate-900"
          />
          <div>
            <h1 className="text-sm font-black uppercase tracking-tight">
              FERREHOUSE PICKING — ORDEN MAESTRA DE BODEGA
            </h1>
            <p className="text-[8.5pt] font-medium text-slate-700">
              Consolidado Multi-Cuenta Mercado Envíos / Colecta / Courier
            </p>
          </div>
        </div>
        <div className="text-right font-mono-tabular text-[8pt] shrink-0">
          <div className="font-bold text-[#000]">ORDEN: {orderNumber}</div>
          <div>{formattedDate}</div>
        </div>
      </div>

      <div className="mt-1.5 pt-1 border-t border-black grid grid-cols-4 gap-1 text-[7.5pt] font-mono-tabular">
        <div>
          <strong>UNIDADES:</strong> {kpis.totalUnits} uds.
        </div>
        <div>
          <strong>SKUs ÚNICOS:</strong> {kpis.uniqueSkus} ítems
        </div>
        <div>
          <strong>CUENTAS:</strong> {kpis.accountsActive} / 5
        </div>
        <div className="text-right truncate" title={accountNames.join(", ")}>
          <strong>DESGLOSE:</strong>{" "}
          {accountNames
            .map((name, i) => `C${i + 1}:${kpis.perAccountTotals[i]}`)
            .join(" | ")}
        </div>
      </div>
    </div>
  );
};

export const PrintSignaturesFooter: React.FC = () => {
  return (
    <div className="hidden print-only mt-3 pt-2 border-t border-black text-black break-inside-avoid">
      <div className="grid grid-cols-3 gap-4 text-[8.5pt]">
        <div className="pt-4 border-t border-black text-center">
          <p className="font-bold uppercase text-[8pt]">Responsable Bodega</p>
          <p className="text-[7pt] text-slate-600 mt-0.5">
            Nombre, RUT y Hora Término
          </p>
        </div>

        <div className="pt-4 border-t border-black text-center">
          <p className="font-bold uppercase text-[8pt]">Control Calidad / Pack</p>
          <p className="text-[7pt] text-slate-600 mt-0.5">
            Etiquetas Cuentas C1 a C5
          </p>
        </div>

        <div className="pt-4 border-t border-black text-center">
          <p className="font-bold uppercase text-[8pt]">Recepción Courier</p>
          <p className="text-[7pt] text-slate-600 mt-0.5">
            Mercado Envíos · Patente y Bultos
          </p>
        </div>
      </div>

      <div className="mt-2 text-[7.5pt] flex items-center justify-between border-t border-slate-300 pt-1 font-mono-tabular text-slate-700">
        <span>
          Instrucción: Marque [ ] tras verificar SKU, modelo y cantidad física en pasillo.
        </span>
        <span>FerreHouse — Control Interno</span>
      </div>
    </div>
  );
};

