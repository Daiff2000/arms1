import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import logoColor from '../../assets/logo.png';
import armsLogoLight from '../../assets/arms-logo.png';
import {
  paginateUnifiedDistributionBoxes,
  UnifiedDistributionBox,
} from '../../utils/reportExporter';

interface UnifiedDistributionSheetProps {
  titleAr: string;
  titleEn: string;
  scopeLabel: string;
  totalSummary: string;
  items: UnifiedDistributionBox[];
  preparedBy: string;
  printDate: string;
  language: 'ar' | 'en';
  accentFocusBorderClass?: string;
  accentTextHoverClass?: string;
  printing?: boolean;
  onPrintComplete?: () => void;
}

export const UnifiedDistributionSheet: React.FC<UnifiedDistributionSheetProps> = ({
  titleAr,
  titleEn,
  scopeLabel,
  totalSummary,
  items,
  preparedBy,
  printDate,
  language,
  accentFocusBorderClass = 'focus:border-[#0B56A8]',
  accentTextHoverClass = 'hover:border-[#0B56A8] hover:text-[#0B56A8]',
  printing = false,
  onPrintComplete,
}) => {
  const isAr = language === 'ar';
  const [previewPage, setPreviewPage] = useState(1);

  const pages = paginateUnifiedDistributionBoxes(items);
  const totalPages = pages.length;
  const safePage = Math.min(Math.max(1, previewPage), totalPages);

  useEffect(() => {
    setPreviewPage(1);
  }, [items.length, scopeLabel]);

  useEffect(() => {
    if (!printing) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'arms-unified-dist-print-style';
    styleEl.textContent = `
      @media print {
        @page { size: A4 portrait; margin: 10mm; }
        html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
        body > *:not(#arms-report-print-portal) { display: none !important; }
        #arms-report-print-portal { display: block !important; position: static !important; margin: 0 !important; padding: 0 !important; }
      }
    `;
    document.head.appendChild(styleEl);

    const cleanup = () => {
      styleEl.remove();
      onPrintComplete?.();
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);

    let timerId = 0;
    const rafId = window.requestAnimationFrame(() => {
      timerId = window.setTimeout(() => {
        window.print();
      }, 90);
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timerId);
      window.removeEventListener('afterprint', cleanup);
      styleEl.remove();
    };
  }, [printing, onPrintComplete]);

  const totalDossiersCount = items.reduce((s, b) => s + (b.totalSlots || b.dossiers.length), 0);

  const renderSheetPage = (
    pageIdx: number,
    isPrintMode: boolean,
    isLastPrintPage = true
  ) => {
    const pageBoxes = pages[pageIdx] || [];
    const pageNum = pageIdx + 1;

    return (
      <div
        key={isPrintMode ? `print-dist-${pageNum}` : `preview-dist-${pageNum}`}
        dir="ltr"
        className={
          isPrintMode
            ? `bg-white text-slate-900 w-full flex flex-col justify-between ${
                !isLastPrintPage ? 'break-after-page' : ''
              }`
            : 'bg-white text-slate-900 border border-slate-300 rounded-lg overflow-hidden shadow-md mx-auto max-w-[794px]'
        }
        style={{
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
          ...(isPrintMode && !isLastPrintPage ? { pageBreakAfter: 'always' } : {}),
        }}
      >
        <div className={isPrintMode ? 'flex-1 flex flex-col justify-between' : 'p-5 sm:p-6 space-y-4'}>
          <div className="space-y-3.5">
            {/* 1. Unified Corporate Header */}
            <div className="flex items-center justify-between gap-4 pb-1">
              <div className="shrink-0">
                <img src={logoColor} alt="Intercom" className="h-7 sm:h-8 w-auto object-contain" />
              </div>

              <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight text-center min-w-0 leading-snug">
                {titleEn}
              </h3>

              <div className="shrink-0">
                <img
                  src={armsLogoLight}
                  alt="ARMS Archive Report Management System"
                  className="h-7 sm:h-9 w-auto object-contain"
                />
              </div>
            </div>

            {/* 2. Unified 2-Column Metadata Box */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-[12px] bg-slate-50 border border-slate-200 rounded-md px-3.5 py-2.5">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-600 shrink-0">Scope :</span>
                  <span className="font-semibold text-slate-900">{scopeLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-600 shrink-0">Total :</span>
                  <span className="font-semibold text-slate-900 tabular-nums">{totalSummary}</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-600 shrink-0">Print Date :</span>
                  <span className="text-slate-900 tabular-nums">{printDate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-600 shrink-0">Prepared By :</span>
                  <span className="font-semibold text-slate-900 truncate">{preparedBy || 'System Admin'}</span>
                </div>
              </div>
            </div>

            <div className="border-b-2 border-slate-700" />

            {/* 3. Unified Box + Dossiers Distribution Cards */}
            <div className="space-y-3 mt-2">
              {pageBoxes.length > 0 ? (
                pageBoxes.map(box => {
                  const slotCount = Math.max(box.totalSlots || 6, box.dossiers.length);
                  const slots = Array.from({ length: slotCount }, (_, i) => i + 1);

                  return (
                    <div
                      key={box.boxCode}
                      className="border border-slate-400 rounded-md overflow-hidden bg-white break-inside-avoid"
                    >
                      {/* Box Header Band */}
                      <div className="bg-[#D9D9D9] border-b border-slate-400 px-3 py-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-[13px] font-extrabold text-slate-900">Box {box.boxCode}</span>
                          <span className="text-[12px] font-bold text-slate-900 tabular-nums">{box.spanLabel}</span>
                          {box.tagLabel && (
                            <span className="text-[10.5px] font-bold text-slate-800 bg-white/75 border border-slate-400/70 px-1.5 py-0.5 rounded">
                              {box.tagLabel}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] font-semibold text-slate-800 tabular-nums">
                          {box.metricsLabel} · <span className="text-slate-900 font-bold">{box.status}</span>
                        </div>
                      </div>

                      {/* 2-Column Dossiers Grid */}
                      <div className={`grid ${isPrintMode ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
                        {slots.map((slotNum, sIdx) => {
                          const dossier =
                            box.dossiers.find(d => d.dossierNumber === slotNum) || box.dossiers[sIdx];
                          const isSecondRowOrLater = sIdx >= 2;
                          const isRightCol = sIdx % 2 === 1;
                          const cellClasses = `px-3 py-2 bg-white border-slate-300 ${
                            sIdx > 0 ? 'border-t sm:border-t-0' : ''
                          } ${isSecondRowOrLater ? 'sm:border-t' : ''} ${
                            isRightCol ? 'sm:border-s' : ''
                          }`;

                          if (!dossier) {
                            return (
                              <div
                                key={`${box.boxCode}-empty-${slotNum}`}
                                className={`${cellClasses} flex items-center justify-center text-[11px] text-slate-400 font-medium`}
                              >
                                Dossier {slotNum} ({box.boxCode}-{slotNum}) · Empty
                              </div>
                            );
                          }

                          return (
                            <div key={dossier.id} className={`${cellClasses} flex flex-col justify-between gap-0.5`}>
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[12px] font-bold text-slate-900">
                                  Dossier {dossier.dossierNumber} ({dossier.id})
                                </span>
                                <span className="text-[11.5px] font-bold text-slate-900 tabular-nums">
                                  {dossier.subtitleTag
                                    ? `${dossier.subtitleTag} · ${dossier.spanLabel}`
                                    : dossier.spanLabel}
                                </span>
                              </div>
                              <div className="flex items-center justify-between gap-2 text-[10.5px]">
                                <span className="text-slate-600 tabular-nums">{dossier.metricsLabel}</span>
                                <span
                                  className={`font-bold ${
                                    dossier.status === 'Over Capacity' ? 'text-[#E52225]' : 'text-slate-900'
                                  }`}
                                >
                                  {dossier.status}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="border border-slate-300 rounded-md py-10 text-center text-[12px] text-slate-500">
                  No boxes match current filter
                </div>
              )}
            </div>
          </div>

          {/* 4. Unified Page Footer */}
          <div className="pt-2.5 mt-4 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
            <span className="font-medium">Intercom ARMS</span>
            <span className="font-semibold tabular-nums">
              Page {pageNum} of {totalPages}
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-neutral-800 print:hidden">
        <div>
          <h2 className="text-sm font-bold text-[#3F4144] dark:text-white">{isAr ? titleAr : titleEn}</h2>
          <p className="text-xs text-slate-500 tabular-nums">
            {isAr
              ? `معاينة التقرير (${items.length} بوكس · ${totalDossiersCount} دوسيه · ${totalPages} صفحة)`
              : `Report preview (${items.length} boxes · ${totalDossiersCount} dossiers · ${totalPages} pages)`}
          </p>
        </div>
      </div>

      {/* Unified Page Flipper Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 dark:bg-neutral-900/60 border border-slate-200 dark:border-neutral-800 rounded-lg px-3 py-2 text-xs print:hidden">
        <div className="text-slate-600 dark:text-neutral-300 font-medium tabular-nums">
          {isAr ? `الصفحة ${safePage} من ${totalPages}` : `Page ${safePage} of ${totalPages}`}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-700 dark:text-neutral-200 disabled:opacity-40 disabled:pointer-events-none transition-colors font-semibold ${accentTextHoverClass}`}
          >
            {isAr ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            <span>{isAr ? 'السابقة' : 'Prev'}</span>
          </button>

          {totalPages > 1 && (
            <select
              aria-label={isAr ? 'اختيار الصفحة' : 'Select page'}
              value={safePage}
              onChange={e => setPreviewPage(Number(e.target.value))}
              className={`px-2 py-1 rounded-md border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-800 dark:text-neutral-100 font-semibold tabular-nums focus:outline-none ${accentFocusBorderClass}`}
            >
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pNum => (
                <option key={pNum} value={pNum}>
                  {pNum} / {totalPages}
                </option>
              ))}
            </select>
          )}

          <button
            type="button"
            onClick={() => setPreviewPage(p => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-slate-700 dark:text-neutral-200 disabled:opacity-40 disabled:pointer-events-none transition-colors font-semibold ${accentTextHoverClass}`}
          >
            <span>{isAr ? 'التالية' : 'Next'}</span>
            {isAr ? <ChevronLeft className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Preview Desk */}
      <div className="bg-slate-100/80 dark:bg-black border border-slate-200/80 dark:border-neutral-800 rounded-xl p-3 sm:p-5 print:p-0 print:border-0 print:bg-white">
        {renderSheetPage(safePage - 1, false)}
      </div>

      {/* Isolated A4 Portrait Print Portal */}
      {printing &&
        typeof document !== 'undefined' &&
        createPortal(
          <div id="arms-report-print-portal" className="hidden print:block">
            {pages.map((_, idx) => renderSheetPage(idx, true, idx === pages.length - 1))}
          </div>,
          document.body
        )}
    </div>
  );
};
