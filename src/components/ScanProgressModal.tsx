import React, { useEffect, useState } from "react";
import { Loader2, Sparkles, CheckCircle2, FileText, Cpu } from "lucide-react";
import { AccountSlot } from "../utils/pickingLogic";

interface ScanProgressModalProps {
  isProcessing: boolean;
  slots: AccountSlot[];
}

const SCAN_STEPS = [
  { id: 1, label: "Decodificando archivos PDF de Mercado Libre..." },
  { id: 2, label: "Poniendo a trabajar al personal de Mercado Libre..." },
  { id: 3, label: "Homologando marcas, SKUs y modelos entre cuentas..." },
  { id: 4, label: "Consolidando cantidades e indicando totales por cuenta..." },
];

export const ScanProgressModal: React.FC<ScanProgressModalProps> = ({
  isProcessing,
  slots,
}) => {
  const [progress, setProgress] = useState(10);
  const [currentStep, setCurrentStep] = useState(1);

  const activeSlots = slots.filter((s) => s.base64Data !== null);

  useEffect(() => {
    if (!isProcessing) {
      setProgress(10);
      setCurrentStep(1);
      return;
    }

    // Smoothly simulate multi-stage progress while waiting for backend response
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 30) {
          setCurrentStep(1);
          return prev + 5;
        } else if (prev < 65) {
          setCurrentStep(2);
          return prev + 4;
        } else if (prev < 88) {
          setCurrentStep(3);
          return prev + 2;
        } else if (prev < 98) {
          setCurrentStep(4);
          return prev + 1;
        }
        return prev;
      });
    }, 280);

    return () => clearInterval(interval);
  }, [isProcessing]);

  if (!isProcessing) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Progreso del escaneo de PDFs con Inteligencia Artificial"
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#2d3277]/60 backdrop-blur-xs p-4"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden">
        {/* Barra superior de acento estilo Mercado Libre */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#ffe600]" />

        {/* Encabezado del modal de escaneo */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2d3277] text-[#ffe600] flex items-center justify-center shrink-0 shadow-xs">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-[#2d3277] tracking-tight">
                Escaneando con Gemini 3.6 Flash
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Procesando {activeSlots.length} resumen(es) de ventas en PDF
              </p>
            </div>
          </div>
          <span className="text-sm font-mono-tabular font-extrabold text-[#3483fa] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100">
            {progress}%
          </span>
        </div>

        {/* Visualización de la Barra de Progreso Dinámica */}
        <div className="mt-5">
          <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200">
            <div
              className="h-full bg-gradient-to-r from-[#3483fa] to-[#00a650] rounded-full transition-all duration-300 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Pasos secuenciales del estado del escaneo */}
        <div className="mt-5 space-y-2.5">
          {SCAN_STEPS.map((step) => {
            const isDone = currentStep > step.id;
            const isCurrent = currentStep === step.id;

            return (
              <div
                key={step.id}
                className={`flex items-start gap-3 p-2.5 rounded-xl border text-xs transition-colors ${
                  isCurrent
                    ? "bg-blue-50/80 border-[#3483fa]/40 text-[#2d3277] font-semibold"
                    : isDone
                    ? "bg-emerald-50/50 border-emerald-200 text-slate-700"
                    : "bg-slate-50/60 border-slate-100 text-slate-400"
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-[#00a650]" />
                  ) : isCurrent ? (
                    <Loader2 className="w-4 h-4 text-[#3483fa] animate-spin" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex items-center justify-center text-[10px] text-slate-400 font-mono-tabular">
                      {step.id}
                    </div>
                  )}
                </div>
                <div className="flex-1 leading-snug">
                  <p>{step.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Badges de Cuentas activas en escaneo */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <p className="text-[11px] font-semibold text-slate-500 mb-2 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-[#2d3277]" />
            <span>Documentos en procesamiento activo:</span>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {activeSlots.map((slot) => (
              <span
                key={slot.index}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium bg-slate-100 text-slate-800 rounded-md border border-slate-200 truncate max-w-[200px]"
                title={slot.fileName || slot.name}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#3483fa] animate-ping" />
                <strong className="font-semibold text-[#2d3277]">
                  Cta {slot.index + 1}:
                </strong>
                <span className="truncate">{slot.name}</span>
              </span>
            ))}
          </div>
        </div>

        {/* Pie de mensaje técnico */}
        <div className="mt-4 text-[11px] text-slate-500 text-center flex items-center justify-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-slate-400" />
          <span>Servidor procesando con @google/genai y Gemini 3.6 Flash</span>
        </div>
      </div>
    </div>
  );
};
