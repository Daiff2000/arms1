import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertTriangle, CheckCircle2, FileSpreadsheet, FolderArchive, Search, Upload } from 'lucide-react';
import { useArchive } from '../../context/ArchiveContext';
import { PalletReport } from '../../types';
import { ActiveTab } from '../navigation/TopNav';

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[._\s-]+/g, '');
const findColumn = (headers: unknown[], aliases: string[]) => headers.findIndex(h => aliases.includes(normalize(h)));
const excelDate = (value: unknown): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number' && value > 20000) {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  return m ? `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}` : '';
};
const monthLabel = (key: string) => {
  if (!key) return 'بدون تاريخ';
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
};

interface Props { mode: 'import' | 'archive'; onNavigate: (tab: ActiveTab, param?: string) => void; }
export const PalletHandoverViews: React.FC<Props> = ({ mode, onNavigate }) => {
  const { palletReports, savePalletReports, currentUser, language, showToast } = useArchive();
  const isAr = language === 'ar';
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PalletReport[]>([]);
  const [search, setSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const handleFile = async (file?: File) => {
    if (!file) return;
    setBusy(true); setFileName(file.name);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
      const parsed: PalletReport[] = [];
      const uploadId = `${file.name}-${Date.now()}`;
      let scannedSheets = 0;
      wb.SheetNames.forEach(sheetName => {
        const sheet = wb.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
        const headerIndex = matrix.findIndex(row => {
          const h = row.map(normalize);
          return h.includes('pallet') && h.includes('data') && (h.includes('jobcode') || h.includes('jopcode')) && h.includes('noboxes');
        });
        if (headerIndex < 0) return;
        const headers = matrix[headerIndex] || [];
        const palletCol = findColumn(headers, ['pallet']);
        const dateCol = findColumn(headers, ['data']);
        const jobCol = findColumn(headers, ['jobcode', 'jopcode']);
        const boxesCol = findColumn(headers, ['noboxes']);
        const userCol = findColumn(headers, ['usernamefiletrail']);
        const statusCol = findColumn(headers, ['filetrail']);
        scannedSheets++;
        matrix.slice(headerIndex + 1).forEach((row, rowIndex) => {
          const palletCode = String(row[palletCol] ?? '').trim();
          const jobCode = String(row[jobCol] ?? '').trim();
          const deliveryDate = excelDate(row[dateCol]);
          const boxesCount = Number(String(row[boxesCol] ?? '').replace(/,/g, ''));
          if (!palletCode || !jobCode || !deliveryDate || !Number.isFinite(boxesCount) || boxesCount <= 0) return;
          const id = `${Date.now()}-${sheetName}-${rowIndex}-${Math.random().toString(36).slice(2, 8)}`;
          parsed.push({
            id, palletCode, warehouseZone: '', linkedBoxes: jobCode, boxCount: boxesCount, weightKg: 0,
            status: 'Dispatched', inspectionDate: deliveryDate,
            custodian: String(row[userCol] ?? '').trim(), notes: '', createdBy: currentUser.name,
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
            jobCode, deliveryDate, boxesCount, deliveredBy: String(row[userCol] ?? '').trim(),
            deliveryStatus: String(row[statusCol] ?? '').trim(), archiveMonth: deliveryDate.slice(0, 7),
            capacityStatus: 'normal', sourceSheet: sheetName, sourceRow: headerIndex + rowIndex + 2,
            uploadId, archived: true,
          } as PalletReport);
        });
      });
      if (!scannedSheets || !parsed.length) throw new Error('لم يتم العثور على شيت يحتوي الأعمدة المطلوبة وبيانات صالحة.');
      // Capacity is evaluated for the same pallet on the same delivery date; projects sharing a pallet remain separate records.
      const totals = new Map<string, number>();
      parsed.forEach(r => { const k = `${r.palletCode}|${r.deliveryDate}`; totals.set(k, (totals.get(k) || 0) + (r.boxesCount || 0)); });
      parsed.forEach(r => { const total = totals.get(`${r.palletCode}|${r.deliveryDate}`) || 0; r.capacityStatus = total > 36 ? 'over-capacity' : 'normal'; r.palletTotalBoxes = total; });
      setPreview(parsed);
      showToast(isAr ? `تم العثور على ${parsed.length} سجل في ${scannedSheets} شيت` : `Found ${parsed.length} records across ${scannedSheets} sheets`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذر قراءة الملف', 'error');
      setPreview([]);
    } finally { setBusy(false); }
  };

  const commit = async () => {
    if (!preview.length) return;
    setBusy(true);
    try {
      const existingKeys = new Set(palletReports.map(r => `${r.uploadId}|${r.sourceSheet}|${r.sourceRow}`));
      const fresh = preview.filter(r => !existingKeys.has(`${r.uploadId}|${r.sourceSheet}|${r.sourceRow}`));
      await savePalletReports([...palletReports, ...fresh]);
      showToast(isAr ? `تمت أرشفة ${fresh.length} سجل بنجاح في الدوسيهات الشهرية` : `Archived ${fresh.length} records into monthly folders`, 'success');
      setPreview([]); setFileName('');
      onNavigate('archive');
    } catch { /* savePalletReports displays the error */ }
    finally { setBusy(false); }
  };

  const months = useMemo(() => Array.from(new Set(palletReports.map(r => r.archiveMonth || r.inspectionDate?.slice(0, 7)).filter(Boolean) as string[])).sort().reverse(), [palletReports]);
  const filtered = useMemo(() => palletReports.filter(r => {
    const month = r.archiveMonth || r.inspectionDate?.slice(0, 7) || '';
    const text = `${r.palletCode} ${r.jobCode || r.linkedBoxes} ${r.deliveredBy || r.custodian} ${r.deliveryStatus || ''} ${r.sourceSheet || ''}`.toLowerCase();
    return (monthFilter === 'all' || month === monthFilter) && (statusFilter === 'all' || (r.capacityStatus || 'normal') === statusFilter) && (!search || text.includes(search.toLowerCase()));
  }), [palletReports, monthFilter, statusFilter, search]);
  const grouped = useMemo(() => {
    const map = new Map<string, PalletReport[]>();
    filtered.forEach(r => { const key = r.archiveMonth || r.inspectionDate?.slice(0, 7) || ''; map.set(key, [...(map.get(key) || []), r]); });
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtered]);

  if (mode === 'import') return <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-neutral-800 pb-4"><div><h1 className="text-xl font-bold">{isAr ? 'استيراد تسليم الباليت' : 'Import Pallet Deliveries'}</h1><p className="text-xs text-slate-500 mt-1">{isAr ? 'قراءة جميع الشيتات التي تحتوي على أعمدة الباليت والتاريخ وكود المشروع وعدد البوكسات.' : 'Reads every worksheet containing the required pallet delivery columns.'}</p></div><button onClick={() => onNavigate('archive')} className="px-3 py-2 rounded-lg border text-xs">{isAr ? 'فتح الأرشيف' : 'Open archive'}</button></header>
    <label className="block border-2 border-dashed rounded-2xl bg-white dark:bg-[#111] border-slate-300 dark:border-neutral-700 p-10 text-center cursor-pointer"><input type="file" accept=".xlsx,.xls,.xlsm" className="hidden" onChange={e => handleFile(e.target.files?.[0])}/><Upload className="w-8 h-8 mx-auto mb-3 text-[#D97706]"/><div className="font-bold text-sm">{busy ? (isAr ? 'جاري المعالجة...' : 'Processing...') : (isAr ? 'اختر ملف Excel أو اسحبه هنا' : 'Choose or drop an Excel file')}</div><p className="text-xs text-slate-500 mt-2">{isAr ? 'كل Tabs المطابقة سيتم قراءتها تلقائيًا، والشيتات الأخرى سيتم تجاهلها.' : 'All matching tabs are imported; unrelated sheets are skipped.'}</p></label>
    {preview.length > 0 && <section className="bg-white dark:bg-[#111] border rounded-xl overflow-hidden"><div className="p-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-sm">{isAr ? 'معاينة الاستيراد' : 'Import preview'}</h2><p className="text-xs text-slate-500">{fileName} · {preview.length.toLocaleString()} {isAr ? 'سجل' : 'records'}</p></div><button disabled={busy} onClick={commit} className="px-4 py-2 bg-[#D97706] text-white rounded-lg text-xs font-bold disabled:opacity-50">{isAr ? 'اعتماد وأرشفة البيانات' : 'Confirm & archive'}</button></div><div className="overflow-x-auto"><table className="w-full text-xs text-start"><thead className="bg-slate-50 dark:bg-neutral-900"><tr>{['PALLET','JOB CODE',isAr?'عدد البوكسات':'BOXES',isAr?'تاريخ التسليم':'DELIVERY DATE',isAr?'تم التسليم بواسطة':'DELIVERED BY',isAr?'الحالة':'STATUS',isAr?'الشيت':'SHEET'].map(h=><th key={h} className="p-3 text-start">{h}</th>)}</tr></thead><tbody>{preview.slice(0,100).map(r=><tr key={r.id} className="border-t"><td className="p-3 font-semibold">{r.palletCode}</td><td className="p-3">{r.jobCode}</td><td className="p-3">{r.boxesCount}</td><td className="p-3">{r.deliveryDate}</td><td className="p-3">{r.deliveredBy || '—'}</td><td className="p-3">{r.deliveryStatus || '—'}</td><td className="p-3">{r.sourceSheet}</td></tr>)}</tbody></table></div>{preview.length>100&&<p className="p-3 text-xs text-slate-500">{isAr?'يتم عرض أول 100 سجل للمعاينة فقط.':'Showing first 100 records.'}</p>}</section>}
  </div>;

  return <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-neutral-800 pb-4"><div><h1 className="text-xl font-bold">{isAr ? 'أرشيف تسليم الباليت' : 'Pallet Delivery Archive'}</h1><p className="text-xs text-slate-500 mt-1">{isAr ? 'كل شهر محفوظ في دوسيه مستقل حسب تاريخ التسليم.' : 'Each delivery month is stored in its own folder.'}</p></div><button onClick={() => onNavigate('import')} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#D97706] text-white text-xs font-bold"><FileSpreadsheet className="w-4 h-4"/>{isAr?'استيراد ملف':'Import file'}</button></header>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">{[{label:isAr?'إجمالي السجلات':'Records',value:palletReports.length},{label:isAr?'إجمالي البوكسات':'Total boxes',value:palletReports.reduce((s,r)=>s+(r.boxesCount||r.boxCount||0),0)},{label:isAr?'عدد الباليتات':'Pallets',value:new Set(palletReports.map(r=>r.palletCode)).size},{label:isAr?'تجاوز السعة':'Over capacity',value:new Set(palletReports.filter(r=>r.capacityStatus==='over-capacity').map(r=>`${r.palletCode}|${r.deliveryDate}`)).size}].map(k=><div key={k.label} className="bg-white dark:bg-[#111] border rounded-xl p-4"><div className="text-xs text-slate-500">{k.label}</div><div className="text-2xl font-extrabold mt-2 tabular-nums">{k.value.toLocaleString()}</div></div>)}</div>
    <div className="flex flex-wrap gap-2 bg-white dark:bg-[#111] border rounded-xl p-3"><div className="relative flex-1 min-w-48"><Search className="absolute start-3 top-2.5 w-4 h-4 text-slate-400"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={isAr?'بحث برقم الباليت أو كود المشروع أو المستلم':'Search pallet, job code or recipient'} className="w-full border rounded-lg py-2 ps-9 pe-3 text-xs bg-transparent"/></div><select value={monthFilter} onChange={e=>setMonthFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-xs bg-transparent"><option value="all">{isAr?'كل الشهور':'All months'}</option>{months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}</select><select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="border rounded-lg px-3 py-2 text-xs bg-transparent"><option value="all">{isAr?'كل الحالات':'All capacity statuses'}</option><option value="normal">{isAr?'طبيعي':'Within capacity'}</option><option value="over-capacity">{isAr?'تجاوز 36 بوكس':'Over 36 boxes'}</option></select></div>
    {grouped.length===0?<div className="bg-white dark:bg-[#111] border rounded-xl p-12 text-center text-sm text-slate-500"><FolderArchive className="w-8 h-8 mx-auto mb-3 opacity-40"/>{isAr?'لا توجد سجلات مؤرشفة حتى الآن':'No archived records yet'}</div>:grouped.map(([month,rows])=><section key={month} className="bg-white dark:bg-[#111] border rounded-xl overflow-hidden"><div className="p-4 border-b flex items-center justify-between"><div className="flex items-center gap-2 font-bold text-sm"><FolderArchive className="w-4 h-4 text-[#D97706]"/>{monthLabel(month)}</div><span className="text-xs text-slate-500">{rows.length} {isAr?'سجل':'records'}</span></div><div className="overflow-x-auto"><table className="w-full text-xs text-start"><thead className="bg-slate-50 dark:bg-neutral-900"><tr>{[isAr?'رقم الباليت':'PALLET',isAr?'كود المشروع':'JOB CODE',isAr?'عدد البوكسات':'BOXES',isAr?'تاريخ التسليم':'DELIVERY DATE',isAr?'تم التسليم بواسطة':'DELIVERED BY',isAr?'حالة التسليم':'DELIVERY STATUS',isAr?'حالة السعة':'CAPACITY'].map(h=><th key={h} className="p-3 text-start">{h}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id} className="border-t"><td className="p-3 font-bold">{r.palletCode}</td><td className="p-3">{r.jobCode||r.linkedBoxes}</td><td className="p-3 tabular-nums">{r.boxesCount||r.boxCount}</td><td className="p-3">{r.deliveryDate||r.inspectionDate}</td><td className="p-3">{r.deliveredBy||r.custodian||'—'}</td><td className="p-3">{r.deliveryStatus||'—'}</td><td className="p-3">{r.capacityStatus==='over-capacity'?<span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle className="w-3.5 h-3.5"/>{isAr?'مكرر / تجاوز 36':'Duplicate / Over 36'}</span>:<span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3.5 h-3.5"/>{isAr?'طبيعي':'Normal'}</span>}</td></tr>)}</tbody></table></div></section>)}
  </div>;
};
