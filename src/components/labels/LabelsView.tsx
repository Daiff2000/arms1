/**
 * ARMS - Thermal Label Printing System (Section 8)
 * Conforms 100% to approved archive label specification.
 * 100 x 50 mm Landscape, monochrome black & white, jsPDF 7-page export, live 1:1 preview.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Printer, FileDown, ZoomIn, ZoomOut } from 'lucide-react';
import { useArchive } from '../../context/ArchiveContext';
import { LabelData } from '../../types';
import { LabelCanvasPreview, LabelVectorSvg } from './LabelCanvasPreview';
import {
  buildBoxLabelPackage,
  buildWeeklyBoxLabelPackage,
  formatShortLabelDate,
  generateLabelsPDF,
  generateQRDataURL,
  getMonochromeLabelLogos,
  getQRCodeText,
} from '../../utils/labelGenerator';
import { weekEndOf, weekStartOf } from '../../utils/minutesPlan';

interface LabelsViewProps {
  initialBoxCode?: string;
}

interface PrintableLabelItem {
  label: LabelData;
  qrSrc: string;
  intercomLogoSrc?: string;
  armsLogoSrc?: string;
}

const boxNumberOf = (code: string) => parseInt(code.replace(/\D+/g, ''), 10) || 0;

export const LabelsView: React.FC<LabelsViewProps> = ({ initialBoxCode }) => {
  const { boxes, dossiers, activeWorkspace, language, showToast } = useArchive();
  const isMinutes = activeWorkspace === 'minutes-archive';
  const isAr = language === 'ar';

  const sortedBoxes = useMemo(
    () =>
      isMinutes
        ? [...boxes].sort((a, b) => boxNumberOf(a.boxCode) - boxNumberOf(b.boxCode) || a.boxCode.localeCompare(b.boxCode))
        : [...boxes].sort((a, b) => a.firstJobId - b.firstJobId),
    [boxes, isMinutes]
  );

  // Mode: automatic (from existing box), manual, or single-dossier
  const [mode, setMode] = useState<'automatic' | 'manual' | 'single-dossier'>(
    initialBoxCode?.includes(':') ? 'single-dossier' : 'automatic'
  );

  const normalizedInitialBox =
    initialBoxCode && !(isMinutes && initialBoxCode === 'D41') ? initialBoxCode.split(':')[0] : undefined;

  const defaultBox =
    (normalizedInitialBox && sortedBoxes.find(b => b.boxCode === normalizedInitialBox)) || sortedBoxes[0];

  // Automatic mode state
  const [selectedBoxCode, setSelectedBoxCode] = useState<string>(
    defaultBox?.boxCode || normalizedInitialBox || (isMinutes ? 'C1' : 'D41')
  );

  // Manual mode state (Operations uses First Job ID; Comments uses Week 1 Start Date)
  const [manualBoxCode, setManualBoxCode] = useState(
    normalizedInitialBox || (isMinutes ? 'C1' : 'D41')
  );
  const [manualFirstJobId, setManualFirstJobId] = useState(35200);
  const todayWeekStart = weekStartOf(new Date().toISOString().slice(0, 10));
  const [manualWeek1Start, setManualWeek1Start] = useState(todayWeekStart);

  // Single dossier mode state
  const [singleDossierNumber, setSingleDossierNumber] = useState<number>(
    initialBoxCode?.includes(':') ? Number(initialBoxCode.split(':')[1]) || 1 : 1
  );
  const [singleDossierFirstJobId, setSingleDossierFirstJobId] = useState(35200);
  const [singleFromDate, setSingleFromDate] = useState(todayWeekStart);
  const [singleToDate, setSingleToDate] = useState(weekEndOf(todayWeekStart));

  // Sync defaults when workspace or initialBoxCode changes
  useEffect(() => {
    const cleanBox =
      initialBoxCode && !(isMinutes && initialBoxCode === 'D41') ? initialBoxCode.split(':')[0] : '';
    const dPart = initialBoxCode?.includes(':') ? Number(initialBoxCode.split(':')[1]) : 0;

    if (cleanBox) {
      setSelectedBoxCode(cleanBox);
      setManualBoxCode(cleanBox);
    } else if (sortedBoxes[0]) {
      setSelectedBoxCode(prev =>
        sortedBoxes.some(b => b.boxCode === prev) ? prev : sortedBoxes[0].boxCode
      );
      setManualBoxCode(sortedBoxes[0].boxCode);
    } else {
      const fallback = isMinutes ? 'C1' : 'D41';
      setSelectedBoxCode(fallback);
      setManualBoxCode(fallback);
    }

    if (dPart >= 1 && dPart <= 6) {
      setMode('single-dossier');
      setSingleDossierNumber(dPart);
      if (isMinutes) {
        const targetDossier = dossiers.find(d => d.boxId === cleanBox && d.dossierNumber === dPart);
        if (targetDossier?.weekStart) {
          setSingleFromDate(targetDossier.weekStart);
          setSingleToDate(targetDossier.weekEnd || weekEndOf(targetDossier.weekStart));
        }
      }
    }
  }, [initialBoxCode, isMinutes, sortedBoxes, dossiers]);

  // Current active label in preview carousel (0 = Box Label, 1..6 = Dossiers 1..6)
  const [activePreviewIndex, setActivePreviewIndex] = useState(0);
  const [previewScale, setPreviewScale] = useState(1.0);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [preparingPrint, setPreparingPrint] = useState(false);
  const [printItems, setPrintItems] = useState<PrintableLabelItem[] | null>(null);

  const currentBox = sortedBoxes.find(b => b.boxCode === selectedBoxCode);
  const currentBoxDossiers = useMemo(
    () => dossiers.filter(d => d.boxId === (currentBox?.boxCode || selectedBoxCode)),
    [dossiers, currentBox, selectedBoxCode]
  );

  // Compute label package based on mode & workspace
  let activeLabels: LabelData[] = [];

  if (isMinutes) {
    if (mode === 'automatic') {
      const boxCode = currentBox ? currentBox.boxCode : selectedBoxCode || 'C1';
      activeLabels = buildWeeklyBoxLabelPackage(boxCode, currentBoxDossiers);
    } else if (mode === 'manual') {
      const boxCode = manualBoxCode.trim().toUpperCase() || 'C1';
      activeLabels = buildWeeklyBoxLabelPackage(boxCode, [], weekStartOf(manualWeek1Start || todayWeekStart));
    } else {
      const boxCode = manualBoxCode.trim().toUpperCase() || 'C1';
      activeLabels = [
        {
          type: 'dossier',
          boxCode,
          dossierNumber: singleDossierNumber,
          totalDossiers: 6,
          fromJobId: singleDossierNumber,
          toJobId: singleDossierNumber,
          fromLabel: formatShortLabelDate(singleFromDate),
          toLabel: formatShortLabelDate(singleToDate),
        },
      ];
    }
  } else {
    if (mode === 'automatic') {
      const boxCode = currentBox ? currentBox.boxCode : selectedBoxCode;
      const firstId = currentBox ? currentBox.firstJobId : 35200;
      activeLabels = buildBoxLabelPackage(boxCode, firstId);
    } else if (mode === 'manual') {
      activeLabels = buildBoxLabelPackage(manualBoxCode.toUpperCase(), Number(manualFirstJobId));
    } else {
      const fromId = Number(singleDossierFirstJobId);
      activeLabels = [
        {
          type: 'dossier',
          boxCode: manualBoxCode.toUpperCase(),
          dossierNumber: singleDossierNumber,
          totalDossiers: 6,
          fromJobId: fromId,
          toJobId: fromId + 49,
        },
      ];
    }
  }

  // Keep active preview index within bounds
  useEffect(() => {
    if (activePreviewIndex >= activeLabels.length) {
      setActivePreviewIndex(0);
    }
  }, [activeLabels.length, activePreviewIndex]);

  // Inject isolated 100x50 mm thermal print CSS only while printing labels
  useEffect(() => {
    if (!printItems || printItems.length === 0) return;

    const styleEl = document.createElement('style');
    styleEl.id = 'arms-thermal-label-print-style';
    styleEl.textContent = `
      @media print {
        @page { size: 100mm 50mm; margin: 0; }
        html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
        body > *:not(#arms-label-print-portal) { display: none !important; }
        #arms-label-print-portal { display: block !important; position: static !important; margin: 0 !important; padding: 0 !important; }
        #arms-label-print-portal * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `;
    document.head.appendChild(styleEl);

    const cleanup = () => {
      styleEl.remove();
      setPrintItems(null);
      setPreparingPrint(false);
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
  }, [printItems]);

  const currentPreviewLabel = activeLabels[activePreviewIndex] || activeLabels[0];

  // Download PDF matching the exact 100 x 50 mm specification
  const handleDownloadPDF = async () => {
    setGeneratingPdf(true);
    try {
      const pdf = await generateLabelsPDF(activeLabels);
      const filename =
        mode === 'single-dossier'
          ? `Label_${manualBoxCode}_Dossier_${singleDossierNumber}.pdf`
          : `Labels_${activeLabels[0].boxCode}_7Pages.pdf`;
      pdf.save(filename);
      showToast(isAr ? `تم تجهيز ملف الليبلات: ${filename}` : `Downloaded ${filename}`, 'success');
    } catch (err) {
      console.error('Failed to generate PDF:', err);
      showToast(isAr ? 'تعذر إنشاء ملف PDF لليبلات.' : 'Failed generating PDF labels.', 'error');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Direct thermal printing (prints 1 or all 7 pages directly via native print dialog)
  const handleDirectPrint = async (labelsToPrint: LabelData[]) => {
    if (preparingPrint || labelsToPrint.length === 0) return;
    setPreparingPrint(true);
    try {
      const [qrUrls, monoLogos] = await Promise.all([
        Promise.all(labelsToPrint.map(l => generateQRDataURL(getQRCodeText(l)))),
        getMonochromeLabelLogos(),
      ]);
      setPrintItems(
        labelsToPrint.map((label, idx) => ({
          label,
          qrSrc: qrUrls[idx],
          intercomLogoSrc: monoLogos.intercomSrc,
          armsLogoSrc: monoLogos.armsSrc,
        }))
      );
    } catch (err) {
      console.error('Failed preparing labels for print:', err);
      showToast(isAr ? 'تعذر تجهيز الليبلات للطباعة.' : 'Failed preparing labels for print.', 'error');
      setPreparingPrint(false);
    }
  };

  const accentText = isMinutes ? 'text-[#E52225] dark:text-red-400' : 'text-[#0B56A8] dark:text-blue-400';
  const accentFocus = isMinutes ? 'focus:border-[#E52225]' : 'focus:border-[#0B56A8]';
  const accentSelectedTab = isMinutes
    ? 'bg-white dark:bg-[#111111] text-[#E52225] dark:text-red-400 shadow-xs font-bold'
    : 'bg-white dark:bg-[#111111] text-[#0B56A8] dark:text-blue-400 shadow-xs font-bold';
  const accentCarouselActive = isMinutes
    ? 'border-[#E52225] bg-[#E52225] text-white font-bold shadow-xs'
    : 'border-[#0B56A8] bg-[#0B56A8] text-white font-bold shadow-xs';
  const accentSoftBox = isMinutes
    ? 'bg-red-50/70 dark:bg-neutral-900 border-[#E52225]/15 dark:border-neutral-800'
    : 'bg-[#EAF2FB]/60 dark:bg-neutral-900 border-[#0B56A8]/15 dark:border-neutral-800';
  const accentPrintBtn = isMinutes
    ? 'text-[#E52225] dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-[#E52225] hover:text-white'
    : 'text-[#0B56A8] dark:text-blue-400 bg-[#EAF2FB] dark:bg-blue-950/40 hover:bg-[#0B56A8] hover:text-white';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
        <div>
          {isMinutes && (
            <div className="text-[11px] font-bold mb-0.5 text-[#E52225] dark:text-red-400">
              {isAr ? 'أرشفة التعليقات' : 'Comments Archive'}
            </div>
          )}
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Printer className={`w-6 h-6 ${accentText}`} />
            <span>{isAr ? 'نظام طباعة الليبلات الحرارية (100×50 مم)' : 'Thermal Label Generator (100×50 mm)'}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-neutral-400 mt-0.5">
            {isMinutes
              ? isAr
                ? 'معاينة وطباعة ليبلات البوكسات والدوسيهات بنطاق التواريخ (FROM / TO) بمقاس 100×50 مم مع رمز QR.'
                : 'Preview and print 100×50 mm monochrome box and weekly dossier labels with FROM / TO dates and QR codes.'
              : isAr
              ? 'معاينة وطباعة ليبلات البوكسات والدوسيهات بمقاس 100×50 مم مع رمز QR.'
              : 'Preview and print 100×50 mm monochrome archive box and dossier labels with QR codes.'}
          </p>
        </div>

        {/* Direct Print & Download PDF buttons side-by-side */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleDirectPrint(activeLabels)}
            disabled={preparingPrint}
            className={`group inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 dark:text-neutral-200 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 ${
              isMinutes
                ? 'hover:bg-[#E52225] hover:border-[#E52225]'
                : 'hover:bg-[#0B56A8] hover:border-[#0B56A8]'
            } hover:text-white rounded-lg transition-colors shadow-xs disabled:opacity-50 whitespace-nowrap`}
          >
            <Printer className={`w-3.5 h-3.5 ${accentText} group-hover:text-white transition-colors`} />
            <span>
              {preparingPrint
                ? isAr
                  ? 'جاري التجهيز للطباعة...'
                  : 'Preparing Print...'
                : mode === 'single-dossier'
                ? isAr
                  ? 'طباعة مباشرة (صفحة 1)'
                  : 'Print Label (1 Page)'
                : isAr
                ? 'طباعة مباشرة (7 صفحات)'
                : 'Print All (7 Pages)'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleDownloadPDF}
            disabled={generatingPdf}
            className="group inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-700 dark:text-neutral-200 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 hover:bg-[#E52225] hover:border-[#E52225] hover:text-white dark:hover:bg-red-600 dark:hover:border-red-600 dark:hover:text-white rounded-lg transition-colors shadow-xs disabled:opacity-50 whitespace-nowrap"
          >
            <FileDown className="w-3.5 h-3.5 text-[#E52225] dark:text-red-400 group-hover:text-white transition-colors" />
            <span>
              {generatingPdf
                ? isAr
                  ? 'جاري تجهيز PDF...'
                  : 'Generating PDF...'
                : mode === 'single-dossier'
                ? isAr
                  ? 'تحميل PDF (صفحة 1)'
                  : 'Download 1-Page PDF'
                : isAr
                ? 'تحميل PDF (7 صفحات)'
                : 'Download 7-Page PDF'}
            </span>
          </button>
        </div>
      </div>

      {/* Main Two-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Controls */}
        <div className="lg:col-span-5 space-y-4">
          {/* Mode Selector */}
          <div className="bg-white dark:bg-[#111111] p-4 rounded-xl border border-slate-200 dark:border-neutral-800 space-y-3">
            <label className="block text-xs font-bold text-slate-900 dark:text-white">
              {isAr ? 'طريقة تحديد الليبل' : 'Generation Mode'}
            </label>

            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-neutral-900 rounded-lg">
              <button
                type="button"
                onClick={() => setMode('automatic')}
                className={`py-1.5 px-2 text-xs font-semibold rounded-md transition-colors text-center ${
                  mode === 'automatic'
                    ? accentSelectedTab
                    : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isAr ? 'آلي (من بوكس)' : 'Automatic'}
              </button>

              <button
                type="button"
                onClick={() => setMode('manual')}
                className={`py-1.5 px-2 text-xs font-semibold rounded-md transition-colors text-center ${
                  mode === 'manual'
                    ? accentSelectedTab
                    : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isAr ? 'يدوي' : 'Manual'}
              </button>

              <button
                type="button"
                onClick={() => setMode('single-dossier')}
                className={`py-1.5 px-2 text-xs font-semibold rounded-md transition-colors text-center ${
                  mode === 'single-dossier'
                    ? accentSelectedTab
                    : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isAr ? 'دوسيه منفرد' : 'Single Dossier'}
              </button>
            </div>

            {/* Mode 1: Automatic */}
            {mode === 'automatic' && (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-neutral-400 mb-1">
                    {isAr ? 'اختر البوكس المطلوب' : 'Select Box from System'}
                  </label>
                  <select
                    value={selectedBoxCode}
                    onChange={e => setSelectedBoxCode(e.target.value)}
                    className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg font-bold focus:outline-none ${accentFocus}`}
                  >
                    {sortedBoxes.length === 0 ? (
                      <option value={isMinutes ? 'C1' : 'D41'}>
                        {isMinutes ? 'Box C1' : 'Box D41'}
                      </option>
                    ) : (
                      sortedBoxes.map(b => {
                        if (isMinutes) {
                          const ds = dossiers
                            .filter(d => d.boxId === b.boxCode)
                            .sort((x, y) => x.dossierNumber - y.dossierNumber);
                          const fromStr = ds[0]?.weekStart ? formatShortLabelDate(ds[0].weekStart) : '—';
                          const toStr = ds[ds.length - 1]?.weekEnd
                            ? formatShortLabelDate(ds[ds.length - 1].weekEnd)
                            : '—';
                          return (
                            <option key={b.id} value={b.boxCode}>
                              Box {b.boxCode} ({fromStr} → {toStr})
                            </option>
                          );
                        }
                        return (
                          <option key={b.id} value={b.boxCode}>
                            Box {b.boxCode} (#{b.firstJobId} → #{b.lastJobId})
                          </option>
                        );
                      })
                    )}
                  </select>
                </div>

                <div className={`p-3 rounded-lg text-xs space-y-1 border ${accentSoftBox}`}>
                  <div className={`font-bold ${accentText}`}>
                    {isAr ? 'حزمة الليبلات الناتجة (7 صفحات):' : 'Output Package (7 Pages):'}
                  </div>
                  {isMinutes ? (
                    <div className="text-[11px] text-slate-600 dark:text-neutral-300 tabular-nums" dir="ltr">
                      · Page 1: Box {activeLabels[0]?.boxCode} ({activeLabels[0]?.fromLabel} → {activeLabels[0]?.toLabel})
                      <br />
                      · Pages 2-7: Dossiers 1 to 6 ({isAr ? 'أسبوع تشغيل لكل دوسيه' : '1 week per dossier'})
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-600 dark:text-neutral-300 tabular-nums" dir="ltr">
                      · Page 1: Box {currentBox?.boxCode || selectedBoxCode} (#{currentBox?.firstJobId} → #{currentBox?.lastJobId})
                      <br />
                      · Pages 2-7: Dossiers 1 to 6 (50 projects each)
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mode 2: Manual */}
            {mode === 'manual' && (
              <div className="space-y-3 pt-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-neutral-400 mb-1">
                    {isAr ? 'كود البوكس (Box Code)' : 'Box Code'}
                  </label>
                  <input
                    type="text"
                    value={manualBoxCode}
                    onChange={e => setManualBoxCode(e.target.value)}
                    className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg uppercase font-bold focus:outline-none ${accentFocus}`}
                  />
                </div>

                {isMinutes ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-neutral-400 mb-1">
                        {isAr ? 'تاريخ بداية الأسبوع الأول (الأحد)' : 'Week 1 Start Date (Sunday)'}
                      </label>
                      <input
                        type="date"
                        value={manualWeek1Start}
                        onChange={e => e.target.value && setManualWeek1Start(weekStartOf(e.target.value))}
                        className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg tabular-nums font-bold focus:outline-none ${accentFocus}`}
                      />
                    </div>
                    <div className="text-[11px] text-slate-500 bg-slate-50 dark:bg-neutral-900 p-2.5 rounded-lg tabular-nums">
                      {isAr
                        ? `النظام يحسب تلقائياً 6 أسابيع (أحد → خميس): من ${activeLabels[0]?.fromLabel} إلى ${activeLabels[0]?.toLabel}`
                        : `Auto-calculates 6 weeks (Sun → Thu): ${activeLabels[0]?.fromLabel} → ${activeLabels[0]?.toLabel}`}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 dark:text-neutral-400 mb-1">
                        {isAr ? 'رقم أول مشروع في البوكس (First Job ID)' : 'First Project Number'}
                      </label>
                      <input
                        type="number"
                        value={manualFirstJobId}
                        onChange={e => setManualFirstJobId(Number(e.target.value))}
                        className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg tabular-nums font-bold focus:outline-none ${accentFocus}`}
                      />
                    </div>
                    <div className="text-[11px] text-slate-500 bg-slate-50 dark:bg-neutral-900 p-2.5 rounded-lg tabular-nums">
                      {isAr
                        ? `النظام يحسب تلقائيًا آخر رقم (+299): #${Number(manualFirstJobId) + 299} ونطاقات الـ 6 دوسيهات (+49 لكل دوسيه).`
                        : `System auto-calculates last ID (+299): #${Number(manualFirstJobId) + 299} and all 6 dossier spans (+49 each).`}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Mode 3: Single Dossier */}
            {mode === 'single-dossier' && (
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-neutral-400 mb-1">
                      {isAr ? 'كود البوكس' : 'Box Code'}
                    </label>
                    <input
                      type="text"
                      value={manualBoxCode}
                      onChange={e => setManualBoxCode(e.target.value)}
                      className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg uppercase font-bold focus:outline-none ${accentFocus}`}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-neutral-400 mb-1">
                      {isAr ? 'رقم الدوسيه (1-6)' : 'Dossier # (1-6)'}
                    </label>
                    <select
                      value={singleDossierNumber}
                      onChange={e => {
                        const dNum = Number(e.target.value);
                        setSingleDossierNumber(dNum);
                        if (isMinutes) {
                          const d = dossiers.find(
                            x => x.boxId === manualBoxCode.trim().toUpperCase() && x.dossierNumber === dNum
                          );
                          if (d?.weekStart) {
                            setSingleFromDate(d.weekStart);
                            setSingleToDate(d.weekEnd || weekEndOf(d.weekStart));
                          }
                        } else {
                          const match = /^D(\d+)$/i.exec(manualBoxCode.trim());
                          const base = match ? 35200 + (Number(match[1]) - 41) * 300 : 35200;
                          setSingleDossierFirstJobId(base + (dNum - 1) * 50);
                        }
                      }}
                      className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg font-bold focus:outline-none ${accentFocus}`}
                    >
                      {[1, 2, 3, 4, 5, 6].map(num => (
                        <option key={num} value={num}>
                          Dossier {num}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {isMinutes ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-neutral-400 mb-1">
                          {isAr ? 'من تاريخ (FROM)' : 'From Date'}
                        </label>
                        <input
                          type="date"
                          value={singleFromDate}
                          onChange={e => {
                            const val = e.target.value;
                            if (!val) return;
                            setSingleFromDate(val);
                            setSingleToDate(weekEndOf(weekStartOf(val)));
                          }}
                          className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg tabular-nums font-bold focus:outline-none ${accentFocus}`}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600 dark:text-neutral-400 mb-1">
                          {isAr ? 'إلى تاريخ (TO)' : 'To Date'}
                        </label>
                        <input
                          type="date"
                          value={singleToDate}
                          onChange={e => e.target.value && setSingleToDate(e.target.value)}
                          className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg tabular-nums font-bold focus:outline-none ${accentFocus}`}
                        />
                      </div>
                    </div>
                    <div className="text-[11px] text-slate-400 tabular-nums" dir="ltr">
                      FROM {formatShortLabelDate(singleFromDate)} → TO {formatShortLabelDate(singleToDate)}
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-neutral-400 mb-1">
                      {isAr ? 'رقم أول مشروع في الدوسيه' : 'First Project in Dossier'}
                    </label>
                    <input
                      type="number"
                      value={singleDossierFirstJobId}
                      onChange={e => setSingleDossierFirstJobId(Number(e.target.value))}
                      className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg tabular-nums font-bold focus:outline-none ${accentFocus}`}
                    />
                    <div className="text-[11px] text-slate-400 mt-1 tabular-nums">
                      {isAr
                        ? `النطاق المحسوب: من #${singleDossierFirstJobId} إلى #${Number(singleDossierFirstJobId) + 49}`
                        : `Calculated range: #${singleDossierFirstJobId} → #${Number(singleDossierFirstJobId) + 49}`}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Live 1:1 Vector Preview & Carousel Switcher */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-[#111111] p-5 rounded-xl border border-slate-200 dark:border-neutral-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-neutral-800">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isAr ? 'المعاينة المباشرة (مطابقة 1:1 للطباعة)' : 'Live 1:1 Print Preview'}
                </h2>
                <div className="text-[11px] text-slate-500">
                  {currentPreviewLabel.type === 'box'
                    ? `Box Label · ${currentPreviewLabel.boxCode}`
                    : `Dossier ${currentPreviewLabel.dossierNumber} Label · Box ${currentPreviewLabel.boxCode}`}
                </div>
              </div>

              {/* Print Current + Zoom Controls */}
              <div className="flex items-center gap-2">
                {activeLabels.length > 1 && currentPreviewLabel && (
                  <button
                    type="button"
                    onClick={() => handleDirectPrint([currentPreviewLabel])}
                    disabled={preparingPrint}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg transition-colors disabled:opacity-50 ${accentPrintBtn}`}
                  >
                    <Printer className="w-3 h-3" />
                    <span>{isAr ? 'طباعة هذا الليبل' : 'Print This Label'}</span>
                  </button>
                )}

                <div className="flex items-center gap-1 bg-slate-100 dark:bg-neutral-900 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setPreviewScale(prev => Math.max(0.7, prev - 0.1))}
                    className="p-1 text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white rounded"
                    title="Zoom Out"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-bold px-1.5 tabular-nums">
                    {Math.round(previewScale * 100)}%
                  </span>
                  <button
                    type="button"
                    onClick={() => setPreviewScale(prev => Math.min(1.4, prev + 0.1))}
                    className="p-1 text-slate-600 dark:text-neutral-300 hover:text-slate-900 dark:hover:text-white rounded"
                    title="Zoom In"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Canvas Preview Center */}
            <div className="p-6 bg-slate-100 dark:bg-black rounded-xl flex items-center justify-center overflow-auto min-h-[260px]">
              {currentPreviewLabel && (
                <LabelCanvasPreview data={currentPreviewLabel} scale={previewScale} />
              )}
            </div>

            {/* Carousel Tabs for the 7 pages */}
            {activeLabels.length > 1 && (
              <div>
                <div className="text-xs font-bold text-slate-700 dark:text-neutral-300 mb-2">
                  {isAr ? 'صفحات الملف السبعة (اختر للمعاينة):' : 'Package Pages (Click to inspect):'}
                </div>
                <div className="grid grid-cols-7 gap-1.5">
                  {activeLabels.map((l, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => setActivePreviewIndex(idx)}
                      className={`p-2 rounded-lg border text-center transition-all ${
                        activePreviewIndex === idx
                          ? accentCarouselActive
                          : 'border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900 text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-800'
                      }`}
                    >
                      <div className="text-[10px]">
                        {l.type === 'box' ? 'Box' : `D${l.dossierNumber}`}
                      </div>
                      <div className="text-[9px] opacity-80 truncate tabular-nums">
                        {l.fromLabel ? l.fromLabel : `#${l.fromJobId}`}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dedicated 100x50 mm print sheet portal (visible only during print) */}
      {printItems &&
        createPortal(
          <div
            id="arms-label-print-portal"
            dir="ltr"
            className="hidden print:block"
            style={{
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
            }}
          >
            {printItems.map((item, idx) => (
              <div
                key={`${item.label.boxCode}-${item.label.type}-${item.label.dossierNumber || 0}-${idx}`}
                style={{
                  width: '100mm',
                  height: '50mm',
                  overflow: 'hidden',
                  backgroundColor: '#ffffff',
                  pageBreakAfter: idx < printItems.length - 1 ? 'always' : 'auto',
                  breakAfter: idx < printItems.length - 1 ? 'page' : 'auto',
                }}
              >
                <LabelVectorSvg
                  data={item.label}
                  qrSrc={item.qrSrc}
                  intercomLogoSrc={item.intercomLogoSrc}
                  armsLogoSrc={item.armsLogoSrc}
                />
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
};
