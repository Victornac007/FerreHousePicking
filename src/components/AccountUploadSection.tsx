import React, { useRef, useState } from "react";
import {
  FileText,
  Upload,
  Trash2,
  Edit3,
  Check,
  Sparkles,
  FolderUp,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { AccountSlot } from "../utils/pickingLogic";

interface AccountUploadSectionProps {
  slots: AccountSlot[];
  isProcessing: boolean;
  onUpdateSlotName: (index: number, newName: string) => void;
  onUploadSingleFile: (index: number, file: File) => Promise<void>;
  onUploadBatchFiles: (files: FileList | File[]) => Promise<void>;
  onRemoveSlotFile: (index: number) => void;
  onClearAllFiles: () => void;
  onConsolidateWithGemini: () => Promise<void>;
}

export const AccountUploadSection: React.FC<AccountUploadSectionProps> = ({
  slots,
  isProcessing,
  onUpdateSlotName,
  onUploadSingleFile,
  onUploadBatchFiles,
  onRemoveSlotFile,
  onClearAllFiles,
  onConsolidateWithGemini,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [isDraggingBatch, setIsDraggingBatch] = useState(false);
  const [draggingSlot, setDraggingSlot] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const batchInputRef = useRef<HTMLInputElement | null>(null);
  const slotInputRefs = useRef<Array<HTMLInputElement | null>>([
    null,
    null,
    null,
    null,
    null,
  ]);

  const uploadedCount = slots.filter((s) => s.base64Data !== null).length;

  const startEditingName = (slot: AccountSlot) => {
    setEditingIndex(slot.index);
    setEditingValue(slot.name);
  };

  const saveEditedName = (index: number) => {
    const trimmed = editingValue.trim();
    if (trimmed) {
      onUpdateSlotName(index, trimmed);
    }
    setEditingIndex(null);
  };

  const handleBatchDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingBatch(false);
    setLocalError(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const pdfFiles = Array.from(e.dataTransfer.files).filter(
        (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
      );
      if (pdfFiles.length === 0) {
        setLocalError("Por favor selecciona únicamente archivos en formato PDF.");
        return;
      }
      await onUploadBatchFiles(pdfFiles);
    }
  };

  const handleSlotDrop = async (
    index: number,
    e: React.DragEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    setDraggingSlot(null);
    setLocalError(null);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
      ) {
        setLocalError(`El archivo "${file.name}" no es un documento PDF válido.`);
        return;
      }
      await onUploadSingleFile(index, file);
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(2)} MB`;
  };

  return (
    <section
      id="carga-cuentas"
      aria-label="Carga de archivos PDF de las 5 cuentas de Mercado Libre"
      className="no-print bg-white border border-slate-200 rounded-xl p-6 shadow-xs"
    >
      {/* Cabecera de sección y acciones rápidas */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">
            1. Recepción de Órdenes por Cuenta (Mercado Libre)
          </h2>
          <p className="text-sm text-slate-600 mt-0.5">
            Sube hasta 5 resúmenes de ventas o planillas de colecta en PDF. Las 5 cuentas y la tabla de picking se vacían automáticamente cada nuevo día para iniciar tu jornada limpia.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => batchInputRef.current?.click()}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-[#3483fa] bg-blue-50/70 hover:bg-blue-100/80 border border-blue-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <FolderUp className="w-4 h-4 shrink-0 text-[#3483fa]" />
            <span>Subir hasta 5 PDFs de una vez</span>
          </button>

          {uploadedCount > 0 && (
            <button
              type="button"
              onClick={onClearAllFiles}
              disabled={isProcessing}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5 shrink-0" />
              <span>Limpiar PDFs</span>
            </button>
          )}

          <input
            ref={batchInputRef}
            type="file"
            accept="application/pdf,.pdf"
            multiple
            className="hidden"
            aria-label="Selector múltiple de hasta 5 archivos PDF"
            onChange={async (e) => {
              setLocalError(null);
              if (e.target.files && e.target.files.length > 0) {
                await onUploadBatchFiles(e.target.files);
                e.target.value = "";
              }
            }}
          />
        </div>
      </div>

      {localError && (
        <div
          role="alert"
          className="mt-4 flex items-center gap-2.5 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-xs font-medium"
        >
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{localError}</span>
        </div>
      )}

      {/* Zona Drag & Drop Múltiple Rápida */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingBatch(true);
        }}
        onDragLeave={() => setIsDraggingBatch(false)}
        onDrop={handleBatchDrop}
        onClick={() => batchInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            batchInputRef.current?.click();
          }
        }}
        aria-label="Zona para arrastrar y soltar hasta 5 archivos PDF simultáneamente"
        className={`mt-5 border border-dashed rounded-lg px-4 py-3.5 transition-colors cursor-pointer flex flex-col sm:flex-row items-center justify-between gap-3 ${
          isDraggingBatch
            ? "border-[#3483fa] bg-blue-50/70"
            : "border-slate-300 bg-slate-50/70 hover:border-[#3483fa] hover:bg-blue-50/30"
        }`}
      >
        <div className="flex items-center gap-3 text-left">
          <div className="w-9 h-9 rounded-lg bg-[#2d3277] text-[#ffe600] flex items-center justify-center shrink-0">
            <Upload className="w-4 h-4" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-900">
              Carga Masiva Rápida: Arrastra aquí tus 5 archivos PDF juntos o haz clic para seleccionarlos
            </p>
            <p className="text-xs text-slate-500">
              Se asignarán automáticamente en orden de Cuenta ML 1 a Cuenta ML 5
            </p>
          </div>
        </div>
        <span className="text-xs font-mono-tabular font-bold text-[#2d3277] bg-white px-2.5 py-1 rounded border border-slate-200 whitespace-nowrap shrink-0">
          {uploadedCount} / 5 cuentas con archivo PDF
        </span>
      </div>

      {/* Grilla de los 5 Espacios de Cuenta ML */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {slots.map((slot) => {
          const hasFile = Boolean(slot.base64Data);
          const isEditing = editingIndex === slot.index;
          const isSlotDragging = draggingSlot === slot.index;

          return (
            <div
              key={slot.index}
              onDragOver={(e) => {
                e.preventDefault();
                setDraggingSlot(slot.index);
              }}
              onDragLeave={() => setDraggingSlot(null)}
              onDrop={(e) => handleSlotDrop(slot.index, e)}
              className={`flex flex-col justify-between rounded-lg border p-3.5 transition-colors ${
                isSlotDragging
                  ? "border-amber-500 bg-amber-50/60"
                  : hasFile
                  ? "border-emerald-300 bg-emerald-50/30"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              {/* Encabezado de la tarjeta con edición de nombre */}
              <div>
                <div className="flex items-center justify-between gap-1.5 text-xs text-slate-500 mb-1.5">
                  <span className="font-mono-tabular font-semibold text-slate-700">
                    CTA {slot.index + 1}
                  </span>
                  <span>·</span>
                  <span
                    className={
                      hasFile
                        ? "text-emerald-700 font-semibold"
                        : "text-slate-500"
                    }
                  >
                    {hasFile ? "PDF Listo" : "Sin archivo"}
                  </span>
                </div>

                {isEditing ? (
                  <div className="flex items-center gap-1 mb-2">
                    <input
                      type="text"
                      value={editingValue}
                      onChange={(e) => setEditingValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEditedName(slot.index);
                        if (e.key === "Escape") setEditingIndex(null);
                      }}
                      aria-label={`Editar nombre de Cuenta ML ${slot.index + 1}`}
                      autoFocus
                      className="w-full px-2 py-1 text-xs font-semibold text-slate-900 bg-white border border-amber-500 rounded focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => saveEditedName(slot.index)}
                      aria-label={`Guardar nombre de Cuenta ML ${slot.index + 1}`}
                      className="p-1.5 bg-slate-900 text-white rounded hover:bg-slate-800 cursor-pointer shrink-0"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-1.5 mb-2.5">
                    <h3
                      className="text-sm font-bold text-slate-900 truncate"
                      title={slot.name}
                    >
                      {slot.name}
                    </h3>
                    <button
                      type="button"
                      onClick={() => startEditingName(slot)}
                      aria-label={`Cambiar nombre de ${slot.name}`}
                      title="Editar nombre de cuenta"
                      className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer shrink-0"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Cuerpo de carga o detalle del archivo cargado */}
              {hasFile ? (
                <div className="mt-1 pt-2.5 border-t border-emerald-200/80 flex flex-col gap-2">
                  <div className="flex items-start gap-2">
                    <FileText className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-xs font-semibold text-slate-800 truncate"
                        title={slot.fileName || "Documento.pdf"}
                      >
                        {slot.fileName}
                      </p>
                      <p className="text-[11px] font-mono-tabular text-slate-500">
                        {formatFileSize(slot.fileSize)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => slotInputRefs.current[slot.index]?.click()}
                      className="text-xs font-medium text-slate-700 hover:text-slate-900 underline cursor-pointer"
                    >
                      Reemplazar
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveSlotFile(slot.index)}
                      aria-label={`Quitar archivo PDF de ${slot.name}`}
                      className="text-xs font-medium text-red-600 hover:text-red-800 cursor-pointer"
                    >
                      Quitar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-1 pt-2.5 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => slotInputRefs.current[slot.index]?.click()}
                    className="w-full py-2.5 px-3 rounded-md border border-dashed border-slate-300 hover:border-slate-400 bg-slate-50/60 hover:bg-slate-100/80 text-xs font-medium text-slate-700 flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Subir PDF Cta {slot.index + 1}</span>
                  </button>
                </div>
              )}

              <input
                ref={(el) => {
                  slotInputRefs.current[slot.index] = el;
                }}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                aria-label={`Subir archivo PDF para ${slot.name}`}
                onChange={async (e) => {
                  setLocalError(null);
                  if (e.target.files && e.target.files[0]) {
                    await onUploadSingleFile(slot.index, e.target.files[0]);
                    e.target.value = "";
                  }
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Barra de Acción Principal para Procesar con Gemini */}
      <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="text-xs text-slate-600">
          <span>Motor de homologación: </span>
          <strong className="font-semibold text-slate-900">
            Unificación automática por SKU, Marca y Modelo
          </strong>
          <span className="mx-1.5">·</span>
          <span>Suma exacta de unidades entre cuentas</span>
        </div>

        <button
          type="button"
          onClick={onConsolidateWithGemini}
          disabled={isProcessing || uploadedCount === 0}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-[#3483fa] hover:bg-[#2968c8] active:bg-[#1f5099] disabled:bg-slate-300 disabled:text-slate-500 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
        >
          {isProcessing ? (
            <Loader2 className="w-4 h-4 text-[#ffe600] animate-spin shrink-0" />
          ) : (
            <Sparkles className="w-4 h-4 text-[#ffe600] shrink-0" />
          )}
          <span>{isProcessing ? "Escaneando PDFs..." : "Escanear"}</span>
        </button>
      </div>
    </section>
  );
};
