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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-base font-black uppercase tracking-tight">
            FERREHOUSE PICKING — ORDEN MAESTRA DE PREPARACIÓN DE BODEGA
          </h1>
          <p className="text-[10px] mt-0.5 font-medium">
            Consolidado Multi-Cuenta Mercado Envíos / Colecta / Courier
          </p>
        </div>
        <div className="text-right font-mono-tabular text-[10px]">
          <div className="font-bold text-[#000]">ORDEN N°: {orderNumber}</div>
          <div>FECHA / HORA: {formattedDate}</div>
        </div>
      </div>

      <div className="mt-2 pt-1.5 border-t border-black flex items-center justify-between text-[10px] font-mono-tabular">
        <div>
          <strong>UNIDADES TOTALES:</strong> {kpis.totalUnits} uds.
        </div>
        <div>
          <strong>SKUs ÚNICOS:</strong> {kpis.uniqueSkus} ítems
        </div>
        <div>
          <strong>CUENTAS:</strong> {kpis.accountsActive} / 5
        </div>
        <div>
          <strong>DESGLOSE:</strong>{" "}
          {accountNames
            .map((name, i) => `C${i + 1}: ${kpis.perAccountTotals[i]}`)
            .join(" | ")}
        </div>
      </div>
    </div>
  );
};

export const PrintSignaturesFooter: React.FC = () => {
  return (
    <div className="hidden print-only mt-4 pt-3 border-t border-black text-black break-inside-avoid">
      <div className="grid grid-cols-3 gap-6 text-[10px]">
        <div className="pt-5 border-t border-black text-center">
          <p className="font-bold uppercase">Firma Responsable Bodega</p>
          <p className="text-[9px] mt-0.5">
            Nombre, RUT y Hora Término
          </p>
        </div>

        <div className="pt-5 border-t border-black text-center">
          <p className="font-bold uppercase">Control Calidad / Embalaje</p>
          <p className="text-[9px] mt-0.5">
            Verificación Etiquetas C1 - C5
          </p>
        </div>

        <div className="pt-5 border-t border-black text-center">
          <p className="font-bold uppercase">Firma Recepción Courier</p>
          <p className="text-[9px] mt-0.5">
            Mercado Envíos · Patente y Bultos
          </p>
        </div>
      </div>

      <div className="mt-3 text-[9px] flex items-center justify-between border-t border-slate-400 pt-1 font-mono-tabular">
        <span>
          Instrucción: Marque [ ] tras verificar SKU, modelo y cantidad física.
        </span>
        <span>FerreHousePicking — Control Interno</span>
      </div>
    </div>
  );
};

