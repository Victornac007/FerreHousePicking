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
    <div className="hidden print-only mb-4 pb-3 border-b-2 border-black text-black">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-extrabold uppercase tracking-tight">
            FERREHOUSE PICKING — ORDEN MAESTRA DE PREPARACIÓN DE BODEGA
          </h1>
          <p className="text-xs mt-0.5">
            Consolidado Multi-Cuenta Mercado Envíos / Colecta / Courier
          </p>
        </div>
        <div className="text-right font-mono-tabular text-xs">
          <div className="font-bold">ORDEN N°: {orderNumber}</div>
          <div>FECHA / HORA: {formattedDate}</div>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-black flex items-center justify-between text-xs font-mono-tabular">
        <div>
          <strong>UNIDADES FÍSICAS TOTALES:</strong> {kpis.totalUnits} uds.
        </div>
        <div>
          <strong>SKUs ÚNICOS A RETIRAR:</strong> {kpis.uniqueSkus} ítems
        </div>
        <div>
          <strong>CUENTAS CONSOLIDADAS:</strong> {kpis.accountsActive} / 5
        </div>
        <div>
          <strong>DESGLOSE POR CUENTA:</strong>{" "}
          {accountNames
            .map((name, i) => `C${i + 1} (${name.slice(0, 12)}): ${kpis.perAccountTotals[i]}`)
            .join(" | ")}
        </div>
      </div>
    </div>
  );
};

export const PrintSignaturesFooter: React.FC = () => {
  return (
    <div className="hidden print-only mt-10 pt-6 text-black">
      <div className="grid grid-cols-3 gap-8 text-xs">
        <div className="pt-8 border-t-[1.5pt] border-black text-center">
          <p className="font-bold uppercase">Firma Responsable de Bodega</p>
          <p className="text-[10px] mt-1">
            Nombre, RUT y Hora de Término de Picking
          </p>
        </div>

        <div className="pt-8 border-t-[1.5pt] border-black text-center">
          <p className="font-bold uppercase">Control de Calidad / Embalaje</p>
          <p className="text-[10px] mt-1">
            Verificación de Etiquetas por Cuenta (Cta 1 a Cta 5)
          </p>
        </div>

        <div className="pt-8 border-t-[1.5pt] border-black text-center">
          <p className="font-bold uppercase">Firma Recepción Courier / Colecta</p>
          <p className="text-[10px] mt-1">
            Transporte Mercado Envíos · Patente y Bultos Recibidos
          </p>
        </div>
      </div>

      <div className="mt-6 text-[9.5pt] flex items-center justify-between border-t border-black pt-2 font-mono-tabular">
        <span>
          Instrucción de Bodega: Marque con lápiz cada casilla [ ] tras verificar SKU, modelo y cantidad física total.
        </span>
        <span>FerreHousePicking — Documento de Control Interno</span>
      </div>
    </div>
  );
};
