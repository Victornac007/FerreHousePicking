import React, { useState } from "react";
import { Download, Smartphone, X, Check, Laptop } from "lucide-react";
import { usePWAInstall } from "../hooks/usePWAInstall";

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // If already running as an installed standalone application, hide the install button
  if (isInstalled) {
    return null;
  }

  return (
    <>
      {/* Chromium / Android / Edge / Chrome Desktop direct install */}
      {isInstallable && (
        <button
          type="button"
          onClick={install}
          title="Instalar como aplicación en escritorio o celular"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#2d3277] bg-white hover:bg-slate-50 active:bg-slate-100 border border-[#2d3277]/25 rounded-lg shadow-2xs transition-all cursor-pointer whitespace-nowrap shrink-0"
        >
          <Download className="w-3.5 h-3.5 text-[#3483fa] shrink-0" />
          <span>Instalar App</span>
        </button>
      )}

      {/* iOS Safari Guided Install */}
      {!isInstallable && isIOS && (
        <button
          type="button"
          onClick={() => setShowIOSModal(true)}
          title="Instalar en iPhone o iPad"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#2d3277] bg-white hover:bg-slate-50 border border-[#2d3277]/25 rounded-lg shadow-2xs transition-all cursor-pointer whitespace-nowrap shrink-0"
        >
          <Smartphone className="w-3.5 h-3.5 text-[#3483fa] shrink-0" />
          <span>Instalar en iPhone</span>
        </button>
      )}

      {/* Fallback button for browsers that have ambient install or desktop instructions */}
      {!isInstallable && !isIOS && (
        <button
          type="button"
          onClick={() => setShowHelpModal(true)}
          title="Instrucciones para instalar en PC o Celular"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#2d3277]/80 hover:text-[#2d3277] bg-white/60 hover:bg-white rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Laptop className="w-3.5 h-3.5 text-[#2d3277] shrink-0" />
          <span className="hidden sm:inline">Instalar en Equipo</span>
        </button>
      )}

      {/* Modal Guía iOS Safari */}
      {showIOSModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl relative text-slate-800">
            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#2d3277] flex items-center justify-center text-[#ffe600]">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Instalar en iPhone / iPad
                </h3>
                <p className="text-xs text-slate-500">Acceso directo como App</p>
              </div>
            </div>

            <ol className="space-y-3 text-xs text-slate-600">
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-800 font-bold flex items-center justify-center shrink-0">
                  1
                </span>
                <span>
                  Presiona el botón <strong>Compartir</strong> (icono de cuadrado con flecha hacia arriba) en la barra inferior de Safari.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-800 font-bold flex items-center justify-center shrink-0">
                  2
                </span>
                <span>
                  Baja en el menú y selecciona <strong>"Agregar a pantalla de inicio"</strong>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-800 font-bold flex items-center justify-center shrink-0">
                  3
                </span>
                <span>
                  Pulsa <strong>"Agregar"</strong> arriba a la derecha. ¡Listo! Tendrás el icono en tu pantalla como una app nativa.
                </span>
              </li>
            </ol>

            <button
              type="button"
              onClick={() => setShowIOSModal(false)}
              className="mt-6 w-full py-2.5 rounded-xl bg-[#2d3277] text-white text-xs font-bold hover:bg-[#1f2358] transition-colors cursor-pointer"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Modal Guía Desktop / Android */}
      {showHelpModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl relative text-slate-800">
            <button
              type="button"
              onClick={() => setShowHelpModal(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#2d3277] flex items-center justify-center text-[#ffe600]">
                <Download className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Instalar Aplicación en PC o Celular
                </h3>
                <p className="text-xs text-slate-500">Funciona como App de escritorio o móvil</p>
              </div>
            </div>

            <div className="space-y-4 text-xs text-slate-600">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  <Laptop className="w-4 h-4 text-[#3483fa]" />
                  En Computador (Chrome / Edge):
                </p>
                <p>
                  Haz clic en el icono de <strong>Instalar</strong> que aparece al final de la barra de direcciones del navegador (o en el menú de los 3 puntos &gt; <em>"Instalar Picking FerreHouse"</em>).
                </p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <p className="font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-[#00a650]" />
                  En Celular Android:
                </p>
                <p>
                  Abre el menú de 3 puntos en Chrome y toca <strong>"Instalar aplicación"</strong> o <strong>"Agregar a la pantalla principal"</strong>.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowHelpModal(false)}
              className="mt-6 w-full py-2.5 rounded-xl bg-[#2d3277] text-white text-xs font-bold hover:bg-[#1f2358] transition-colors cursor-pointer"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  );
};
