import React, { useState } from "react";
import { PlusCircle, X } from "lucide-react";
import { PickingItem } from "../utils/pickingLogic";

interface ManualItemModalProps {
  isOpen: boolean;
  accountNames: string[];
  onClose: () => void;
  onAddItem: (newItem: Partial<PickingItem>) => void;
}

export const ManualItemModal: React.FC<ManualItemModalProps> = ({
  isOpen,
  accountNames,
  onClose,
  onAddItem,
}) => {
  const [sku, setSku] = useState("");
  const [producto, setProducto] = useState("");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [ubicacionSugerida, setUbicacionSugerida] = useState("PAS-A1 · N1");
  const [cta1, setCta1] = useState(0);
  const [cta2, setCta2] = useState(0);
  const [cta3, setCta3] = useState(0);
  const [cta4, setCta4] = useState(0);
  const [cta5, setCta5] = useState(0);
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  const totalPreview =
    (Number(cta1) || 0) +
    (Number(cta2) || 0) +
    (Number(cta3) || 0) +
    (Number(cta4) || 0) +
    (Number(cta5) || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!sku.trim() || !producto.trim()) {
      setFormError("El código SKU y el nombre del producto son obligatorios.");
      return;
    }

    if (totalPreview <= 0) {
      setFormError("Debes ingresar al menos 1 unidad en alguna de las 5 cuentas.");
      return;
    }

    onAddItem({
      sku: sku.trim().toUpperCase(),
      producto: producto.trim(),
      marca: marca.trim() || "Genérico",
      modelo: modelo.trim() || "Estándar",
      categoria: "Ferretería Manual",
      ubicacionSugerida: ubicacionSugerida.trim() || "PAS-A1",
      cta1: Number(cta1) || 0,
      cta2: Number(cta2) || 0,
      cta3: Number(cta3) || 0,
      cta4: Number(cta4) || 0,
      cta5: Number(cta5) || 0,
      totalPreparar: totalPreview,
      preparado: false,
    });

    setSku("");
    setProducto("");
    setMarca("");
    setModelo("");
    setCta1(0);
    setCta2(0);
    setCta3(0);
    setCta4(0);
    setCta5(0);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-manual-item-title"
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"
    >
      <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200">
          <h3
            id="modal-manual-item-title"
            className="text-base font-bold text-slate-900"
          >
            Agregar o Sumar Producto Manualmente
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar ventana"
            className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {formError && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800"
            >
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                SKU / Código *
              </label>
              <input
                type="text"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="Ej. DW-DCD7781-20V"
                className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white focus:border-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Ubicación en Bodega
              </label>
              <input
                type="text"
                value={ubicacionSugerida}
                onChange={(e) => setUbicacionSugerida(e.target.value)}
                placeholder="Ej. PAS-A1 · N2"
                className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white focus:border-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Nombre del Producto *
            </label>
            <input
              type="text"
              value={producto}
              onChange={(e) => setProducto(e.target.value)}
              placeholder="Ej. Taladro Percutor Inalámbrico 20V"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white focus:border-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Marca
              </label>
              <input
                type="text"
                value={marca}
                onChange={(e) => setMarca(e.target.value)}
                placeholder="Ej. DeWalt"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white focus:border-slate-900"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Modelo
              </label>
              <input
                type="text"
                value={modelo}
                onChange={(e) => setModelo(e.target.value)}
                placeholder="Ej. DCD7781D2"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:bg-white focus:border-slate-900"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Unidades por Cuenta de Mercado Libre
            </label>
            <div className="grid grid-cols-5 gap-2">
              {[
                { val: cta1, setter: setCta1, label: accountNames[0] || "Cta 1" },
                { val: cta2, setter: setCta2, label: accountNames[1] || "Cta 2" },
                { val: cta3, setter: setCta3, label: accountNames[2] || "Cta 3" },
                { val: cta4, setter: setCta4, label: accountNames[3] || "Cta 4" },
                { val: cta5, setter: setCta5, label: accountNames[4] || "Cta 5" },
              ].map((c, idx) => (
                <div key={idx}>
                  <span
                    className="block text-[10px] text-slate-500 truncate mb-1"
                    title={c.label}
                  >
                    Cta {idx + 1}
                  </span>
                  <input
                    type="number"
                    min={0}
                    value={c.val}
                    onChange={(e) =>
                      c.setter(Math.max(0, parseInt(e.target.value, 10) || 0))
                    }
                    aria-label={`Unidades en Cuenta ${idx + 1}`}
                    className="w-full px-2 py-1.5 text-xs font-mono-tabular text-right bg-slate-50 border border-slate-300 rounded focus:outline-none focus:bg-white focus:border-slate-900"
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <div className="text-xs text-slate-600">
              Total a consolidar:{" "}
              <strong className="font-mono-tabular text-sm font-extrabold text-slate-900">
                {totalPreview} uds.
              </strong>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Guardar en Orden</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
