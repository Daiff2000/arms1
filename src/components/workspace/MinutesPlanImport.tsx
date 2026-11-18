import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Trash2, Upload } from 'lucide-react';
import { useArchive } from '../../context/ArchiveContext';
import { buildMinutesPlan, parsePlanWorkbook, ParseResult, PlanBuild } from '../../utils/minutesPlan';
import { DeleteUploadModal } from '../common/DeleteUploadModal';
import {
  formatBytes,
  nextUiFrame,
  readFileWithProgress,
  UploadProgressBar,
  UploadProgressState,
} from '../common/UploadProgressBar';

const fmt = (iso: string) => iso.split('-').reverse().join('/');

export const MinutesPlanImport: React.FC = () => {
  const { minutesArchive, currentUser, language, commitMinutesPlan } = useArchive();
  const isAr = language === 'ar';
  const isSystemAdmin = currentUser.role === 'System Admin';
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [error, setError] = useState('');
  const [prefix, setPrefix] = useState('C');
  const [startBox, setStartBox] = useState(13);
  const [dragging, setDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);

  const hasExistingData =
    minutesArchive.boxes.length > 0 ||
    minutesArchive.dossiers.length > 0 ||
    minutesArchive.projects.length > 0 ||
    minutesArchive.uploadHistory.length > 0;

  const build: PlanBuild | null = useMemo(() => {
    if (!parsed) return null;
    return buildMinutesPlan(parsed.rows, minutesArchive, {
      boxPrefix: prefix.trim().toUpperCase() || 'C',
      startBoxNumber: Math.max(1, startBox || 13),
      fileName,
      userName: currentUser.name,
      rejectedCount: parsed.rejected.length,
    });
  }, [parsed, minutesArchive, prefix, startBox, fileName, currentUser.name]);

  const readFile = async (file: File) => {
    setError('');
    setParsed(null);
    setUploadProgress({
      percent: 10,
      label: isAr ? 'جاري قراءة ملف الخطة...' : 'Reading plan file...',
      detail: `${file.name} · ${formatBytes(file.size)}`,
    });
    try {
      const buffer = await readFileWithProgress(file, ratio => {
        setUploadProgress({
          percent: Math.round(10 + ratio * 35),
          label: isAr ? 'جاري تحميل الملف...' : 'Loading file...',
          detail: `${file.name} · ${formatBytes(file.size)}`,
        });
      });
      setUploadProgress({
        percent: 55,
        label: isAr ? 'جاري تحليل شيت خطة التعليقات...' : 'Parsing comments plan sheets...',
        detail: file.name,
      });
      await nextUiFrame();
      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      setUploadProgress({
        percent: 85,
        label: isAr ? 'جاري تجهيز الجدول وتوزيع الأسابيع...' : 'Building weekly plan...',
        detail: file.name,
      });
      await nextUiFrame();
      setParsed(parsePlanWorkbook(wb));
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'تعذر قراءة الملف.');
    } finally {
      setUploadProgress(null);
    }
  };

  const grouped = useMemo(() => {
    const m = new Map<string, NonNullable<typeof build>['weeks']>();
    build?.weeks.forEach(w => m.set(w.boxCode, [...(m.get(w.boxCode) || []), w]));
    return [...m.entries()];
  }, [build]);

  const confirm = () => {
    if (!build || !parsed) return;
    const summary = `${fileName}: ${build.importedCount} سجل، ${build.weeks.length} دوسيه، تكرار ${build.duplicateCount}`;
    if (commitMinutesPlan(build.store, summary)) {
      setParsed(null);
      setFileName('');
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const cell = 'px-3 py-2 text-start';
  return (
    <div className="space-y-5">
      {isSystemAdmin && hasExistingData && (
        <div className="bg-amber-50/90 dark:bg-amber-950/25 border border-amber-200 dark:border-amber-900/60 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-xs font-bold text-amber-900 dark:text-amber-200">
            {isAr
              ? `البيانات الحالية: ${minutesArchive.boxes.length} بوكس · ${minutesArchive.projects.length} فرع · ${minutesArchive.uploadHistory.length} رفعة`
              : `Current data: ${minutesArchive.boxes.length} boxes · ${minutesArchive.projects.length} branches · ${minutesArchive.uploadHistory.length} uploads`}
          </div>
          <button
            type="button"
            onClick={() => setDeleteModalOpen(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg transition-colors shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isAr ? 'مسح رفعة / بيانات قديمة' : 'Delete Upload / Data'}</span>
          </button>
        </div>
      )}

      <DeleteUploadModal
        isOpen={deleteModalOpen}
        scope="minutes"
        onClose={() => setDeleteModalOpen(false)}
      />

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) readFile(f); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer bg-white dark:bg-[#111111] border-2 border-dashed rounded-xl p-8 text-center space-y-2 transition-colors ${dragging ? 'border-[#E52225]' : 'border-slate-300 dark:border-neutral-800 hover:border-[#E52225]/50'}`}
      >
        <input ref={inputRef} type="file" accept=".xlsx,.xlsm,.xls" className="hidden" onChange={e => e.target.files?.[0] && readFile(e.target.files[0])} />
        <div className="w-12 h-12 rounded-xl mx-auto flex items-center justify-center bg-red-50 dark:bg-red-950/40 text-[#E52225]"><Upload className="w-6 h-6" /></div>
        <div className="text-sm font-bold text-slate-900 dark:text-white">{fileName || (isAr ? 'اسحب شيت الخطة هنا أو اضغط للاختيار' : 'Drop the plan sheet here or click to choose')}</div>
        <p className="text-xs text-slate-400">.xlsx · .xlsm · .xls</p>
      </div>

      <UploadProgressBar progress={uploadProgress} accent="red" isAr={isAr} />

      {error && <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg px-4 py-3"><AlertTriangle className="w-4 h-4" />{error}</div>}

      {parsed && build && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            {[
              [isAr ? 'سجلات جديدة' : 'New records', build.importedCount],
              [isAr ? 'الدوسيهات' : 'Dossiers', build.weeks.length],
              [isAr ? 'مكرر (تم تخطيه)' : 'Duplicates', build.duplicateCount],
              [isAr ? 'مرفوض / مستبعد' : 'Rejected / Skipped', parsed.rejected.length + build.skippedBeforeStartCount],
            ].map(([l, v]) => (
              <div key={String(l)} className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl py-3">
                <div className="text-xl font-black text-slate-900 dark:text-white">{v}</div>
                <div className="text-[11px] text-slate-500">{l}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3 text-xs">
            <label className="space-y-1"><span className="block text-slate-500">{isAr ? 'بادئة كود البوكس' : 'Box prefix'}</span>
              <input value={prefix} onChange={e => setPrefix(e.target.value)} className="w-20 px-2 py-1.5 border border-slate-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900" /></label>
            <label className="space-y-1"><span className="block text-slate-500">{isAr ? 'رقم أول بوكس (لو القسم فاضي)' : 'First box no. (if empty)'}</span>
              <input type="number" min={1} value={startBox} onChange={e => setStartBox(parseInt(e.target.value, 10) || 13)} disabled={minutesArchive.boxes.length > 0} className="w-24 px-2 py-1.5 border border-slate-200 dark:border-neutral-800 rounded-lg bg-white dark:bg-neutral-900 disabled:opacity-50" /></label>
          </div>

          {[...build.warnings, ...(build.weekendCount ? [isAr ? `${build.weekendCount} سجل تاريخ بدئه جمعة/سبت — اتحسب على أسبوعه (أحد–خميس).` : `${build.weekendCount} rows start on Fri/Sat.`] : []), ...parsed.rejected.slice(0, 5).map(r => `${isAr ? 'صف' : 'Row'} ${r.sourceRow}: ${r.reason}`)].map((w, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-4 py-2"><AlertTriangle className="w-4 h-4 shrink-0" />{w}</div>
          ))}

          <div className="space-y-4">
            {grouped.map(([box, weeks]) => {
              const boxCap = weeks[0]?.totalDossiers || 6;
              const isMonthlyBox = Boolean(weeks[0]?.isMonthly);
              return (
                <div key={box} className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-slate-50 dark:bg-neutral-900/80 text-sm font-bold flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-[#E52225]" />
                    <span>{isAr ? 'بوكس' : 'Box'} {box}</span>
                    <span className="text-[11px] font-normal text-slate-500">
                      {weeks.length}/{boxCap} {isAr ? 'دوسيهات' : 'dossiers'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${isMonthlyBox ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300' : 'bg-red-50 text-[#E52225] dark:bg-red-950/40 dark:text-red-300'}`}>
                      {isMonthlyBox ? (isAr ? 'شهري (شهران)' : 'Monthly (2 Months)') : (isAr ? 'أسبوعي (6 أسابيع)' : 'Weekly (6 Weeks)')}
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <thead className="text-slate-500 text-[11px] border-b border-slate-100 dark:border-neutral-800"><tr>
                      <th className={cell}>{isAr ? 'الدوسيه' : 'Dossier'}</th><th className={cell}>{isMonthlyBox ? (isAr ? 'الشهر' : 'Month') : (isAr ? 'الأسبوع (أحد → خميس)' : 'Week (Sun → Thu)')}</th>
                      <th className={cell}>{isAr ? 'عدد الإرساليات' : 'Records'}</th><th className={cell}>{isAr ? 'إجمالي المناديل' : 'Folders'}</th></tr></thead>
                    <tbody>{weeks.map(w => (
                      <tr key={`${w.boxCode}-${w.dossierNumber}-${w.weekStart}`} className="border-b border-slate-50 dark:border-neutral-900">
                        <td className={`${cell} font-mono font-bold`}>{box}-{w.dossierNumber}</td>
                        <td className={`${cell} tabular-nums`}>{fmt(w.weekStart)} → {fmt(w.weekEnd)}</td>
                        <td className={cell}>{w.records}</td><td className={cell}>{w.folders.toLocaleString()}</td>
                      </tr>))}</tbody>
                  </table>
                </div>
              );
            })}
          </div>

          <button type="button" onClick={confirm} disabled={!build.importedCount}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg disabled:opacity-40">
            <CheckCircle2 className="w-4 h-4" />{isAr ? `تأكيد الاستيراد (${build.importedCount} سجل)` : `Confirm import (${build.importedCount})`}
          </button>
        </>
      )}
    </div>
  );
};
