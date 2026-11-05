import React, { useEffect, useState } from "react";
import { Loader2, Sparkles, CheckCircle2, FileText, Cpu, Check } from "lucide-react";
import { AccountSlot } from "../utils/pickingLogic";

interface ScanProgressModalProps {
  isProcessing: boolean;
  slots: AccountSlot[];
}

const SCAN_STEPS = [
  { id: 1, label: "Leyendo texto digital de cada archivo PDF...", range: "0% - 25%" },
  { id: 2, label: "Extrayendo SKUs y cantidades exactas por cuenta...", range: "26% - 60%" },
  { id: 3, label: "Verificando códigos de producto y unidades vendidas...", range: "61% - 85%" },
  { id: 4, label: "Consolidando totales matemáticos por cuenta (100% exacto)...", range: "86% - 100%" },
];

function formatBytes(bytes: number | null): string {
  if (!bytes) return "PDF";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ScanProgressModal: React.FC<ScanProgressModalProps> = ({
  isProcessing,
  slots,
}) => {
  const [progress, setProgress] = useState(10);
  const [currentStep, setCurrentStep] = useState(1);

  const activeSlots = slots.filter((s) => s.base64Data !== null);
  const totalActive = activeSlots.length || 1;

  useEffect(() => {
    if (!isProcessing) {
      setProgress(10);
      setCurrentStep(1);
      return;
    }

    // Progression loop to smoothly advance percentages while awaiting local PDF extraction
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev < 28) {
          setCurrentStep(1);
          return prev + 4;
        } else if (prev < 62) {
          setCurrentStep(2);
          return prev + 3;
        } else if (prev < 86) {
          setCurrentStep(3);
          return prev + 2;
        } else if (prev < 98) {
          setCurrentStep(4);
          return prev + 1;
        }
        return prev;
      });
    }, 250);

    return () => clearInterval(interval);
  }, [isProcessing]);

  if (!isProcessing) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Progreso del escaneo de PDFs con Inteligencia Artificial"
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#2d3277]/65 backdrop-blur-xs p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative overflow-hidden">
        {/* Superior ML yellow accent border */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#ffe600]" />

        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <img
              src="/assets/aistudio/1793621644265_3_b373221c.jpeg"
              alt="FerreHouse"
              className="w-10 h-10 rounded-xl object-cover shadow-xs border border-slate-200"
            />
            <div>
              <h3 className="text-base font-extrabold text-[#2d3277] tracking-tight">
                Escaneando con SI360°
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Consolidando {activeSlots.length} archivo(s) PDF de Mercado Libre
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="inline-block text-lg font-mono-tabular font-black text-[#3483fa] bg-blue-50 px-3 py-1 rounded-xl border border-blue-200 shadow-2xs">
              {progress}%
            </span>
          </div>
        </div>

        {/* Main Interactive Progress Bar Section */}
        <div className="mt-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
            <span className="flex items-center gap-1.5 text-[#2d3277]">
              <Loader2 className="w-3.5 h-3.5 text-[#3483fa] animate-spin" />
              <span>Procesando solicitud ({progress}% completado)</span>
            </span>
            <span className="text-slate-500 font-mono-tabular">
              Paso {currentStep} de 4
            </span>
          </div>

          {/* Progress Bar Container with Gradient & Shimmer */}
          <div className="relative w-full h-4 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200 shadow-inner">
            <div
              className="h-full bg-gradient-to-r from-[#3483fa] via-[#00a650] to-[#3483fa] rounded-full transition-all duration-300 ease-out relative overflow-hidden"
              style={{ width: `${progress}%` }}
            >
              {/* Shimmer effect overlay */}
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </div>
          </div>

          {/* Percentage ticks */}
          <div className="flex justify-between text-[10px] text-slate-400 font-mono-tabular px-0.5">
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
            <span>75%</span>
            <span>100%</span>
          </div>
        </div>

        {/* Sequential Step Progress List */}
        <div className="mt-4 space-y-2">
          {SCAN_STEPS.map((step) => {
            const isDone = currentStep > step.id;
            const isCurrent = currentStep === step.id;

            return (
              <div
                key={step.id}
                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                  isCurrent
                    ? "bg-blue-50/90 border-[#3483fa]/50 text-[#2d3277] font-semibold shadow-2xs ring-1 ring-blue-200"
                    : isDone
                    ? "bg-emerald-50/60 border-emerald-200 text-slate-700"
                    : "bg-slate-50/60 border-slate-100 text-slate-400"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div className="shrink-0">
                    {isDone ? (
                      <div className="w-4 h-4 rounded-full bg-[#00a650] text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-[#3483fa] animate-spin" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex items-center justify-center text-[10px] text-slate-400 font-mono-tabular font-bold">
                        {step.id}
                      </div>
                    )}
                  </div>
                  <span className="truncate leading-snug">{step.label}</span>
                </div>
                <span
                  className={`text-[10px] font-mono-tabular font-semibold shrink-0 px-1.5 py-0.5 rounded ${
                    isDone
                      ? "text-emerald-700 bg-emerald-100/70"
                      : isCurrent
                      ? "text-[#3483fa] bg-blue-100/80"
                      : "text-slate-400 bg-slate-100"
                  }`}
                >
                  {isDone ? "Completado" : isCurrent ? `${progress}%` : step.range}
                </span>
              </div>
            );
          })}
        </div>

        {/* Per-file Progress Status List */}
        <div className="mt-4 pt-3.5 border-t border-slate-100">
          <p className="text-[11px] font-semibold text-slate-600 mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-[#2d3277]" />
              <span>Avance por archivo PDF ({activeSlots.length}):</span>
            </span>
            <span className="text-[10px] text-slate-400 font-mono-tabular">
              {Math.min(
                activeSlots.length,
                Math.max(1, Math.ceil((progress / 100) * totalActive))
              )}{" "}
              / {totalActive} procesando
            </span>
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-32 overflow-y-auto pr-1">
            {activeSlots.map((slot, idx) => {
              // Calculate estimated per-file progress status based on overall percentage
              const fileThreshold = ((idx + 1) / totalActive) * 100;
              const isFileDone = progress >= fileThreshold;
              const isFileActive =
                progress >= (idx / totalActive) * 100 && !isFileDone;

              return (
                <div
                  key={slot.index}
                  className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-[11px] ${
                    isFileDone
                      ? "bg-emerald-50/50 border-emerald-200 text-slate-800"
                      : isFileActive
                      ? "bg-blue-50/70 border-blue-200 text-[#2d3277] font-semibold"
                      : "bg-slate-50 border-slate-100 text-slate-500"
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="shrink-0 font-bold text-[#2d3277]">
                      Cta {slot.index + 1}:
                    </span>
                    <span className="truncate max-w-[110px]" title={slot.fileName || slot.name}>
                      {slot.fileName || slot.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[10px] text-slate-400 font-mono-tabular">
                      {formatBytes(slot.fileSize)}
                    </span>
                    {isFileDone ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#00a650]" />
                    ) : isFileActive ? (
                      <Loader2 className="w-3.5 h-3.5 text-[#3483fa] animate-spin" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-300" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-4 text-[11px] text-slate-500 text-center flex items-center justify-center gap-1.5 pt-2 border-t border-slate-100">
          <Cpu className="w-3.5 h-3.5 text-slate-400" />
          <span>Procesamiento 100% Local (pdfjs-dist + Auditoría de Integridad)</span>
        </div>
      </div>
    </div>
  );
};

