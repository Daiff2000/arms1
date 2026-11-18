import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Filter,
  FolderArchive,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useArchive } from '../../context/ArchiveContext';
import { PalletReport, UploadRecord } from '../../types';
import { ActiveTab } from '../navigation/TopNav';
import { DeleteUploadModal } from '../common/DeleteUploadModal';
import {
  formatBytes,
  nextUiFrame,
  readFileWithProgress,
  UploadProgressBar,
  UploadProgressState,
} from '../common/UploadProgressBar';
import { formatShortLabelDate } from '../../utils/labelGenerator';
import { weekEndOf, weekStartOf } from '../../utils/minutesPlan';
import { palletRecordDedupKey, recomputePalletCapacities } from '../../utils/palletUtils';

const normalize = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]+/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');

/** Finds the highest-priority matching column index based on alias order. */
const findColumn = (headers: unknown[], aliases: string[]) => {
  const normalized = headers.map(normalize);
  for (const alias of aliases) {
    const idx = normalized.findIndex(h => h === alias);
    if (idx !== -1) return idx;
  }
  return -1;
};

/** Detects the USER NAME FILE TRAIL column even across split 2-row merged headers or minor typos. */
const findDeliveredByColumn = (matrix: unknown[][], headerIndex: number): number => {
  const headers = matrix[headerIndex] || [];
  const direct = findColumn(headers, USER_ALIASES);
  const directNorm = direct >= 0 ? normalize(headers[direct]) : '';

  // If a weaker fallback like 'user' matched, still check whether another column is specifically USER NAME FILE TRAIL
  const strongSet = new Set([
    'usernamefiletrail',
    'usernamefiletrial',
    'filetrailusername',
    'userfiletrail',
    'namefiletrail',
  ]);
  if (direct >= 0 && strongSet.has(directNorm)) return direct;

  const isFileTrailUser = (norm: string) =>
    strongSet.has(norm) || (norm.includes('user') && (norm.includes('filetrail') || norm.includes('filetrial')));

  // Check single-row partial/contains match first
  const singleIdx = headers.findIndex(h => isFileTrailUser(normalize(h)));
  if (singleIdx !== -1) return singleIdx;

  // Check adjacent row merged/split headers (e.g. "FILE TRAIL" above/below "USER NAME")
  const prevRow = headerIndex > 0 ? matrix[headerIndex - 1] || [] : [];
  const nextRow = headerIndex + 1 < matrix.length ? matrix[headerIndex + 1] || [] : [];
  for (let col = 0; col < Math.max(headers.length, prevRow.length, nextRow.length); col++) {
    const mergedPrev = normalize(`${prevRow[col] ?? ''} ${headers[col] ?? ''}`);
    const mergedNext = normalize(`${headers[col] ?? ''} ${nextRow[col] ?? ''}`);
    if (isFileTrailUser(mergedPrev) || isFileTrailUser(mergedNext)) return col;
  }

  return direct;
};

const PALLET_ALIASES = ['pallet', 'palletno', 'palletcode', 'palletid', 'الباليت', 'رقمالباليت'];
const DATE_ALIASES = ['data', 'date', 'deliverydate', 'handoverdate', 'التاريخ', 'تاريخالتسليم'];
const JOB_ALIASES = ['jobcode', 'jopcode', 'jobid', 'jobno', 'job', 'projectcode', 'project', 'كودالمشروع', 'المشروع'];
const BOXES_ALIASES = ['noboxes', 'boxes', 'boxescount', 'boxcount', 'qty', 'count', 'عددالبوكسات', 'البوكسات'];
const USER_ALIASES = [
  'usernamefiletrail',
  'usernamefiletrial',
  'filetrailusername',
  'userfiletrail',
  'namefiletrail',
  'deliveredby',
  'سلمالباليت',
  'الليسلمالباليت',
  'مسلمالباليت',
  'تمالتسليمبواسطة',
  'المسلم',
  'المستلم',
  'username',
  'user',
  'custodian',
  'الموظف',
];
const STATUS_ALIASES = ['filetrail', 'deliverystatus', 'status', 'الحالة', 'حالةالتسليم'];

export const excelDate = (value: unknown): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'number' && value > 20000 && value < 80000) {
    const d = XLSX.SSF.parse_date_code(value);
    if (d && d.y && d.m && d.d) {
      return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
    }
  }
  const raw = String(value ?? '').trim();
  if (!raw) return '';

  const isoMatch = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(raw);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  const dmy4 = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(raw);
  if (dmy4) {
    const [, a, b, y] = dmy4;
    const first = Number(a);
    const second = Number(b);
    const day = second > 12 ? second : first;
    const month = second > 12 ? first : second;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const dmy2 = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/.exec(raw);
  if (dmy2) {
    const [, a, b, yy] = dmy2;
    const first = Number(a);
    const second = Number(b);
    const day = second > 12 ? second : first;
    const month = second > 12 ? first : second;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return `20${yy}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return '';
};

export const safeMonthLabel = (key: string, isAr = true): string => {
  if (!key) return isAr ? 'بدون تاريخ' : 'No Date';
  const match = /^(\d{4})-(\d{1,2})$/.exec(key.trim());
  if (!match) return key;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return key;
  const dt = new Date(y, m - 1, 1);
  if (Number.isNaN(dt.getTime())) return key;
  try {
    return new Intl.DateTimeFormat(isAr ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' }).format(dt);
  } catch {
    return key;
  }
};

export interface PalletMonthlyDossier {
  dossierNumber: number;
  dossierCode: string; // P1, P2, P3... starting chronologically from oldest/first month
  monthKey: string; // e.g. 2026-01
  minDate: string; // YYYY-MM-DD
  maxDate: string; // YYYY-MM-DD
  rows: PalletReport[];
  totalBoxes: number;
  palletsCount: number;
  overCapacityCount: number;
}

/**
 * Groups pallet handover records into chronological monthly dossiers (P1, P2, P3...)
 * ordered ascending from the earliest month (e.g., Month 1 -> P1, Month 2 -> P2).
 */
export function buildPalletMonthlyDossiers(reports: PalletReport[]): PalletMonthlyDossier[] {
  const monthMap = new Map<string, PalletReport[]>();
  for (const r of reports) {
    const dt = r.deliveryDate || r.inspectionDate || '';
    const mKey = r.archiveMonth || (dt.length >= 7 ? dt.slice(0, 7) : '');
    monthMap.set(mKey, [...(monthMap.get(mKey) || []), r]);
  }

  // Sort chronologically ascending (oldest month first: P1, P2, P3...; empty month key last)
  const sortedKeys = Array.from(monthMap.keys()).sort((a, b) => {
    if (!a && !b) return 0;
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b);
  });

  return sortedKeys.map((monthKey, idx) => {
    const rows = [...(monthMap.get(monthKey) || [])].sort((a, b) => {
      const da = a.deliveryDate || a.inspectionDate || '';
      const db = b.deliveryDate || b.inspectionDate || '';
      return da.localeCompare(db) || a.palletCode.localeCompare(b.palletCode);
    });
    let minDate = '';
    let maxDate = '';
    let totalBoxes = 0;
    const palletSet = new Set<string>();
    const overSet = new Set<string>();

    for (const r of rows) {
      const dt = (r.deliveryDate || r.inspectionDate || '').slice(0, 10);
      if (dt) {
        if (!minDate || dt < minDate) minDate = dt;
        if (!maxDate || dt > maxDate) maxDate = dt;
      }
      totalBoxes += r.boxesCount || r.boxCount || 0;
      if (r.palletCode) palletSet.add(r.palletCode);
      if (r.capacityStatus === 'over-capacity') {
        overSet.add(`${r.palletCode}|${dt}`);
      }
    }

    const num = idx + 1;
    return {
      dossierNumber: num,
      dossierCode: `P${num}`,
      monthKey,
      minDate,
      maxDate,
      rows,
      totalBoxes,
      palletsCount: palletSet.size,
      overCapacityCount: overSet.size,
    };
  });
}

const recomputeCapacities = recomputePalletCapacities;
const recordDedupKey = palletRecordDedupKey;

const PAGE_SIZE = 50;

interface Props {
  mode: 'import' | 'archive';
  onNavigate: (tab: ActiveTab, param?: string) => void;
  dateFrom?: string;
  dateTo?: string;
  statusFilter?: 'all' | 'normal' | 'over-capacity';
  onDateFromChange?: (value: string) => void;
  onDateToChange?: (value: string) => void;
  onStatusFilterChange?: (value: 'all' | 'normal' | 'over-capacity') => void;
}

export const PalletHandoverViews: React.FC<Props> = ({
  mode,
  onNavigate,
  dateFrom: controlledDateFrom,
  dateTo: controlledDateTo,
  statusFilter: controlledStatusFilter,
  onDateFromChange,
  onDateToChange,
  onStatusFilterChange,
}) => {
  const { palletReports, palletArchive, savePalletReports, currentUser, language, showToast } = useArchive();
  const isAr = language === 'ar';
  const isSystemAdmin = currentUser.role === 'System Admin';
  const canEdit = ['System Admin', 'Archive Manager', 'Data Entry'].includes(currentUser.role);
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgressState | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PalletReport[]>([]);
  const [enrichUpdates, setEnrichUpdates] = useState<
    Record<string, { deliveredBy?: string; deliveryStatus?: string }>
  >({});
  const [enrichPreview, setEnrichPreview] = useState<PalletReport[]>([]);
  const [duplicatePreviewCount, setDuplicatePreviewCount] = useState(0);
  const [scannedSheetNames, setScannedSheetNames] = useState<string[]>([]);

  // Archive navigation & pagination state
  const [selectedMonthKey, setSelectedMonthKey] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [localDateFrom, setLocalDateFrom] = useState('');
  const [localDateTo, setLocalDateTo] = useState('');
  const [localStatusFilter, setLocalStatusFilter] = useState<'all' | 'normal' | 'over-capacity'>('all');
  const [page, setPage] = useState(1);

  const dateFrom = controlledDateFrom !== undefined ? controlledDateFrom : localDateFrom;
  const dateTo = controlledDateTo !== undefined ? controlledDateTo : localDateTo;
  const statusFilter = controlledStatusFilter !== undefined ? controlledStatusFilter : localStatusFilter;

  const setDateFrom = (val: string) => {
    if (onDateFromChange) onDateFromChange(val);
    else setLocalDateFrom(val);
  };
  const setDateTo = (val: string) => {
    if (onDateToChange) onDateToChange(val);
    else setLocalDateTo(val);
  };
  const setStatusFilter = (val: 'all' | 'normal' | 'over-capacity') => {
    if (onStatusFilterChange) onStatusFilterChange(val);
    else setLocalStatusFilter(val);
  };

  const todayIso = new Date().toISOString().slice(0, 10);
  const applyDatePreset = (preset: 'all' | 'today' | 'week' | 'month') => {
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (preset === 'today') {
      setDateFrom(todayIso);
      setDateTo(todayIso);
    } else if (preset === 'week') {
      const ws = weekStartOf(todayIso);
      setDateFrom(ws);
      setDateTo(weekEndOf(ws));
    } else {
      const [y, m] = todayIso.split('-').map(Number);
      const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDate = new Date(Date.UTC(y, m, 0));
      const lastDay = `${y}-${String(m).padStart(2, '0')}-${String(lastDate.getUTCDate()).padStart(2, '0')}`;
      setDateFrom(firstDay);
      setDateTo(lastDay);
    }
    setPage(1);
  };

  const activePreset: 'all' | 'today' | 'week' | 'month' | null = useMemo(() => {
    if (!dateFrom && !dateTo) return 'all';
    if (dateFrom === todayIso && dateTo === todayIso) return 'today';
    const ws = weekStartOf(todayIso);
    const we = weekEndOf(ws);
    if (dateFrom === ws && dateTo === we) return 'week';
    const [y, m] = todayIso.split('-').map(Number);
    const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDate = new Date(Date.UTC(y, m, 0));
    const lastDay = `${y}-${String(m).padStart(2, '0')}-${String(lastDate.getUTCDate()).padStart(2, '0')}`;
    if (dateFrom === firstDay && dateTo === lastDay) return 'month';
    return null;
  }, [dateFrom, dateTo, todayIso]);

  const resetAllFilters = () => {
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setStatusFilter('all');
    setSelectedMonthKey(null);
    setPage(1);
  };

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [targetUploadId, setTargetUploadId] = useState<string | null>(null);

  // Manual entry modal state
  const [manualOpen, setManualOpen] = useState(false);
  const [manualPalletCode, setManualPalletCode] = useState('');
  const [manualJobCode, setManualJobCode] = useState('');
  const [manualBoxesCount, setManualBoxesCount] = useState('1');
  const [manualDate, setManualDate] = useState(new Date().toISOString().slice(0, 10));
  const [manualDeliveredBy, setManualDeliveredBy] = useState('');
  const [manualStatus, setManualStatus] = useState('');

  const dossiers = useMemo(() => buildPalletMonthlyDossiers(palletReports), [palletReports]);

  const dossierByMonth = useMemo(() => {
    const map = new Map<string, PalletMonthlyDossier>();
    for (const d of dossiers) map.set(d.monthKey, d);
    return map;
  }, [dossiers]);

  // Reset pagination whenever view filters change
  useEffect(() => {
    setPage(1);
  }, [selectedMonthKey, search, statusFilter, dateFrom, dateTo]);

  // Clear selectedMonthKey if that month no longer exists after deletion
  useEffect(() => {
    if (selectedMonthKey !== null && !dossierByMonth.has(selectedMonthKey)) {
      setSelectedMonthKey(null);
    }
  }, [selectedMonthKey, dossierByMonth]);

  const handleFile = async (file?: File) => {
    if (!file || busy) return;
    setBusy(true);
    setFileName(file.name);
    setDuplicatePreviewCount(0);
    setEnrichUpdates({});
    setEnrichPreview([]);
    setScannedSheetNames([]);
    setUploadProgress({
      percent: 5,
      label: isAr ? 'جاري قراءة ملف Excel...' : 'Reading Excel file...',
      detail: `${file.name} · ${formatBytes(file.size)}`,
    });
    try {
      const buffer = await readFileWithProgress(file, ratio => {
        setUploadProgress({
          percent: Math.round(5 + ratio * 20),
          label: isAr ? 'جاري تحميل محتوى الملف...' : 'Loading file buffer...',
          detail: `${file.name} · ${formatBytes(file.size)}`,
        });
      });

      setUploadProgress({
        percent: 30,
        label: isAr ? 'جاري فك ضغط وتحليل هيكل الشيتات...' : 'Parsing workbook sheets...',
        detail: file.name,
      });
      await nextUiFrame();

      const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
      const parsed: PalletReport[] = [];
      const matchedSheets: string[] = [];
      const totalSheets = Math.max(1, wb.SheetNames.length);

      for (let sIdx = 0; sIdx < wb.SheetNames.length; sIdx++) {
        const sheetName = wb.SheetNames[sIdx];
        setUploadProgress({
          percent: Math.round(35 + ((sIdx + 1) / totalSheets) * 50),
          label: isAr
            ? `جاري قراءة الشيت (${sIdx + 1} من ${totalSheets}): ${sheetName}`
            : `Reading sheet (${sIdx + 1}/${totalSheets}): ${sheetName}`,
          detail: isAr
            ? `${parsed.length.toLocaleString()} سجل مقروء حتى الآن`
            : `${parsed.length.toLocaleString()} rows read so far`,
        });
        await nextUiFrame();

        const sheet = wb.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true });
        const headerIndex = matrix.findIndex(row => {
          if (!Array.isArray(row)) return false;
          const h = row.map(normalize);
          return (
            h.some(c => PALLET_ALIASES.includes(c)) &&
            h.some(c => DATE_ALIASES.includes(c)) &&
            h.some(c => JOB_ALIASES.includes(c)) &&
            h.some(c => BOXES_ALIASES.includes(c))
          );
        });
        if (headerIndex < 0) continue;

        const headers = matrix[headerIndex] || [];
        const palletCol = findColumn(headers, PALLET_ALIASES);
        const dateCol = findColumn(headers, DATE_ALIASES);
        const jobCol = findColumn(headers, JOB_ALIASES);
        const boxesCol = findColumn(headers, BOXES_ALIASES);
        const userCol = findDeliveredByColumn(matrix, headerIndex);
        const statusCol = findColumn(headers, STATUS_ALIASES);

        matchedSheets.push(sheetName);
        matrix.slice(headerIndex + 1).forEach((row, rowIndex) => {
          if (!Array.isArray(row)) return;
          const palletCode = String(row[palletCol] ?? '').trim();
          const jobCode = String(row[jobCol] ?? '').trim();
          const deliveryDate = excelDate(row[dateCol]);
          const boxesCount = Number(String(row[boxesCol] ?? '').replace(/,/g, '').trim());
          if (!palletCode || !jobCode || !deliveryDate || !Number.isFinite(boxesCount) || boxesCount <= 0) return;

          const deliveredBy = userCol >= 0 ? String(row[userCol] ?? '').trim().replace(/\s+/g, ' ') : '';
          const deliveryStatus = statusCol >= 0 ? String(row[statusCol] ?? '').trim().replace(/\s+/g, ' ') : '';
          const id = `${Date.now()}-${sheetName}-${rowIndex}-${Math.random().toString(36).slice(2, 8)}`;
          parsed.push({
            id,
            palletCode,
            warehouseZone: '',
            linkedBoxes: jobCode,
            boxCount: boxesCount,
            weightKg: 0,
            status: 'Dispatched',
            inspectionDate: deliveryDate,
            custodian: deliveredBy,
            notes: '',
            createdBy: currentUser.name,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            jobCode,
            deliveryDate,
            boxesCount,
            deliveredBy,
            deliveryStatus,
            archiveMonth: deliveryDate.slice(0, 7),
            capacityStatus: 'normal',
            sourceSheet: sheetName,
            sourceRow: headerIndex + rowIndex + 2,
            archived: true,
          });
        });
      }

      if (!matchedSheets.length || !parsed.length) {
        throw new Error(
          isAr
            ? 'لم يتم العثور على شيت يحتوي الأعمدة المطلوبة (Pallet, Date/Data, Job Code, No Boxes) وبيانات صالحة.'
            : 'No worksheet found with the required columns (Pallet, Date/Data, Job Code, No Boxes) and valid rows.'
        );
      }

      setUploadProgress({
        percent: 90,
        label: isAr ? 'جاري فحص التكرار وحساب سعة الباليتات...' : 'Deduplicating rows & computing capacities...',
        detail: `${parsed.length.toLocaleString()} ${isAr ? 'صف' : 'rows'}`,
      });
      await nextUiFrame();

      const existingMap = new Map<string, PalletReport>();
      for (const existing of palletReports) {
        existingMap.set(recordDedupKey(existing), existing);
      }

      let dupes = 0;
      const seenInPreview = new Set<string>();
      const uniqueParsed: PalletReport[] = [];
      const pendingUpdates: Record<string, { deliveredBy?: string; deliveryStatus?: string }> = {};
      const pendingUpdateRows: PalletReport[] = [];

      for (const row of parsed) {
        const k = recordDedupKey(row);
        if (seenInPreview.has(k)) {
          dupes++;
          continue;
        }
        seenInPreview.add(k);

        const existing = existingMap.get(k);
        if (existing) {
          const nextBy = row.deliveredBy?.trim();
          const curBy = (existing.deliveredBy || existing.custodian || '').trim();
          const nextStatus = row.deliveryStatus?.trim();
          const curStatus = (existing.deliveryStatus || '').trim();
          const patch: { deliveredBy?: string; deliveryStatus?: string } = {};
          if (nextBy && nextBy !== curBy) patch.deliveredBy = nextBy;
          if (nextStatus && nextStatus !== curStatus) patch.deliveryStatus = nextStatus;

          if (patch.deliveredBy || patch.deliveryStatus) {
            pendingUpdates[k] = patch;
            pendingUpdateRows.push({
              ...row,
              deliveredBy: patch.deliveredBy ?? curBy,
              custodian: patch.deliveredBy ?? curBy,
              deliveryStatus: patch.deliveryStatus ?? curStatus,
            });
          } else {
            dupes++;
          }
          continue;
        }

        uniqueParsed.push(row);
      }

      const withCapacities = recomputeCapacities(uniqueParsed);
      setUploadProgress({
        percent: 100,
        label: isAr ? 'اكتملت قراءة الملف' : 'File ready for review',
        detail: `${withCapacities.length.toLocaleString()} ${isAr ? 'سجل جاهز' : 'records ready'}`,
      });
      setScannedSheetNames(matchedSheets);
      setDuplicatePreviewCount(dupes);
      setEnrichUpdates(pendingUpdates);
      setEnrichPreview(pendingUpdateRows);
      setPreview(withCapacities);

      const updatesCount = Object.keys(pendingUpdates).length;
      showToast(
        isAr
          ? `تم العثور على ${withCapacities.length} سجل جديد${updatesCount > 0 ? ` · وتحديث سلم الباليت لـ ${updatesCount} سجل موجود` : ''}${dupes > 0 ? ` (استبعاد ${dupes} مكرر)` : ''} في ${matchedSheets.length} شيت`
          : `Found ${withCapacities.length} new records${updatesCount > 0 ? ` · ${updatesCount} existing record updates` : ''}${dupes > 0 ? ` (${dupes} duplicates removed)` : ''} across ${matchedSheets.length} sheets`,
        'success'
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : isAr ? 'تعذر قراءة الملف' : 'Failed to read file', 'error');
      setPreview([]);
      setEnrichUpdates({});
      setEnrichPreview([]);
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  const commit = async () => {
    const updatesCount = Object.keys(enrichUpdates).length;
    if ((!preview.length && updatesCount === 0) || busy) return;
    if (!canEdit) {
      showToast(isAr ? 'ليس لديك صلاحية استيراد بيانات الباليت.' : 'You do not have permission to import pallet data.', 'error');
      return;
    }
    setBusy(true);
    setUploadProgress({
      percent: 6,
      label: isAr ? 'جاري تجهيز السجلات للحفظ...' : 'Preparing records for upload...',
      detail: `${(preview.length + updatesCount).toLocaleString()} ${isAr ? 'سجل' : 'records'}`,
    });
    await nextUiFrame();
    try {
      const uploadId = `pallet-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const updatedExisting = palletReports.map(existing => {
        const patch = enrichUpdates[recordDedupKey(existing)];
        if (!patch) return existing;
        const nextBy = patch.deliveredBy ?? existing.deliveredBy ?? existing.custodian ?? '';
        const nextStatus = patch.deliveryStatus ?? existing.deliveryStatus ?? '';
        return {
          ...existing,
          deliveredBy: nextBy,
          custodian: nextBy,
          deliveryStatus: nextStatus,
          updatedAt: new Date().toISOString(),
        };
      });

      const existingKeys = new Set(updatedExisting.map(recordDedupKey));
      const fresh: PalletReport[] = [];
      let skippedDupes = 0;

      for (const r of preview) {
        const key = recordDedupKey(r);
        if (existingKeys.has(key)) {
          skippedDupes++;
          continue;
        }
        existingKeys.add(key);
        fresh.push({ ...r, uploadId });
      }

      if (fresh.length === 0 && updatesCount === 0) {
        showToast(
          isAr
            ? 'جميع السجلات في هذا الملف موجودة مسبقاً في الأرشيف.'
            : 'All records in this file already exist in the archive.',
          'warning'
        );
        return;
      }

      const combined = recomputeCapacities([...updatedExisting, ...fresh]);
      const newUploadEntry: UploadRecord = {
        id: uploadId,
        fileName: fileName || 'pallet-import.xlsx',
        userName: currentUser.name,
        timestamp: new Date().toISOString(),
        totalRows: preview.length + updatesCount,
        importedCount: fresh.length + updatesCount,
        duplicateCount: skippedDupes,
        rejectedCount: 0,
        errors: [],
        status: skippedDupes > 0 ? 'Completed with warnings' : 'Completed',
      };
      const nextHistory = [newUploadEntry, ...palletArchive.uploadHistory];

      await savePalletReports(combined, nextHistory, progress => {
        const batchLabel =
          progress.totalChunks > 1
            ? isAr
              ? ` (دفعة ${Math.max(1, progress.currentChunk)} من ${progress.totalChunks})`
              : ` (batch ${Math.max(1, progress.currentChunk)}/${progress.totalChunks})`
            : '';
        const label =
          progress.phase === 'preparing'
            ? isAr
              ? 'جاري ضغط وتقسيم البيانات للرفع...'
              : 'Compressing & chunking payload...'
            : progress.phase === 'finalizing' && progress.percent >= 95
            ? isAr
              ? 'جاري اعتماد البيانات في قاعدة البيانات...'
              : 'Finalizing archive save...'
            : isAr
            ? `جاري رفع البيانات إلى الخادم${batchLabel}...`
            : `Uploading records to server${batchLabel}...`;
        const detail =
          progress.totalBytes > 10
            ? `${combined.length.toLocaleString()} ${isAr ? 'إجمالي السجلات' : 'total records'} · ${formatBytes(progress.uploadedBytes)} / ${formatBytes(progress.totalBytes)}`
            : `${combined.length.toLocaleString()} ${isAr ? 'إجمالي السجلات' : 'total records'}`;
        setUploadProgress({
          percent: progress.percent,
          label,
          detail,
        });
      });
      showToast(
        isAr
          ? `تم الحفظ بنجاح${fresh.length > 0 ? `: ${fresh.length} سجل جديد` : ''}${updatesCount > 0 ? ` · تحديث ${updatesCount} سجل موجود` : ''}${skippedDupes > 0 ? ` (تخطي ${skippedDupes} مكرر)` : ''}`
          : `Saved${fresh.length > 0 ? `: ${fresh.length} new records` : ''}${updatesCount > 0 ? ` · updated ${updatesCount} existing records` : ''}`,
        'success'
      );
      setPreview([]);
      setEnrichUpdates({});
      setEnrichPreview([]);
      setFileName('');
      setDuplicatePreviewCount(0);
      setScannedSheetNames([]);
      onNavigate('archive');
    } catch {
      /* savePalletReports displays the error toast */
    } finally {
      setBusy(false);
      setUploadProgress(null);
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || busy) return;
    const palletCode = manualPalletCode.trim();
    const jobCode = manualJobCode.trim();
    const boxesCount = Number(manualBoxesCount);
    const deliveryDate = manualDate.trim();
    if (!palletCode || !jobCode || !deliveryDate || !Number.isFinite(boxesCount) || boxesCount <= 0) {
      showToast(
        isAr
          ? 'يرجى إدخال رقم الباليت وكود المشروع والتاريخ وعدد بوكسات صحيح.'
          : 'Please enter valid pallet code, job code, date, and box count.',
        'error'
      );
      return;
    }

    setBusy(true);
    try {
      const now = new Date().toISOString();
      const newRecord: PalletReport = {
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        palletCode,
        warehouseZone: '',
        linkedBoxes: jobCode,
        boxCount: boxesCount,
        weightKg: 0,
        status: 'Dispatched',
        inspectionDate: deliveryDate,
        custodian: manualDeliveredBy.trim() || currentUser.name,
        notes: '',
        createdBy: currentUser.name,
        createdAt: now,
        updatedAt: now,
        jobCode,
        deliveryDate,
        boxesCount,
        deliveredBy: manualDeliveredBy.trim() || currentUser.name,
        deliveryStatus: manualStatus.trim() || (isAr ? 'تم التسليم' : 'Delivered'),
        archiveMonth: deliveryDate.slice(0, 7),
        capacityStatus: 'normal',
        sourceSheet: 'Manual Entry',
        archived: true,
      };
      const newKey = recordDedupKey(newRecord);
      if (palletReports.some(r => recordDedupKey(r) === newKey)) {
        showToast(
          isAr ? 'هذا السجل موجود بالفعل في الأرشيف (تم منع التكرار).' : 'This record already exists in the archive.',
          'warning'
        );
        setBusy(false);
        return;
      }
      const combined = recomputeCapacities([newRecord, ...palletReports]);
      await savePalletReports(combined);
      showToast(isAr ? 'تمت إضافة سجل الباليت بنجاح.' : 'Pallet record added successfully.', 'success');
      setManualOpen(false);
      setManualPalletCode('');
      setManualJobCode('');
      setManualBoxesCount('1');
      setManualDeliveredBy('');
      setManualStatus('');
    } catch {
      /* handled in savePalletReports */
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteRow = async (recordId: string) => {
    if (!isSystemAdmin || busy) return;
    setBusy(true);
    try {
      const remaining = recomputeCapacities(palletReports.filter(r => r.id !== recordId));
      await savePalletReports(remaining);
      showToast(isAr ? 'تم حذف السجل بنجاح.' : 'Record deleted.', 'success');
    } catch {
      /* handled in savePalletReports */
    } finally {
      setBusy(false);
    }
  };

  const matchesDateRange = (isoDate?: string | null) => {
    if (!dateFrom && !dateTo) return true;
    const clean = (isoDate || '').slice(0, 10);
    if (!clean) return false;
    if (dateFrom && clean < dateFrom) return false;
    if (dateTo && clean > dateTo) return false;
    return true;
  };

  const activeDossier = selectedMonthKey !== null ? dossierByMonth.get(selectedMonthKey) || null : null;
  const searchActive =
    search.trim().length > 0 || statusFilter !== 'all' || Boolean(dateFrom) || Boolean(dateTo);
  const showTableMode = activeDossier !== null || searchActive;

  const activeRows = useMemo(() => {
    const base = activeDossier ? activeDossier.rows : palletReports;
    const q = search.trim().toLowerCase();
    return base.filter(r => {
      const dt = r.deliveryDate || r.inspectionDate || '';
      if (!matchesDateRange(dt)) return false;
      if (statusFilter !== 'all' && (r.capacityStatus || 'normal') !== statusFilter) return false;
      if (!q) return true;
      const monthKey = r.archiveMonth || (dt.length >= 7 ? dt.slice(0, 7) : '');
      const dCode = dossierByMonth.get(monthKey)?.dossierCode || '';
      const text = `${dCode} ${r.palletCode} ${r.jobCode || r.linkedBoxes} ${r.deliveredBy || r.custodian} ${r.deliveryStatus || ''} ${r.sourceSheet || ''} ${dt}`.toLowerCase();
      return text.includes(q);
    });
  }, [activeDossier, palletReports, search, statusFilter, dateFrom, dateTo, dossierByMonth]);

  const totalPages = Math.max(1, Math.ceil(activeRows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRows = useMemo(
    () => activeRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [activeRows, safePage]
  );

  const handleExportFilteredExcel = () => {
    const sourceRows = showTableMode ? activeRows : palletReports;
    if (!sourceRows.length) return;
    const rows = sourceRows.map((r, idx) => {
      const dt = r.deliveryDate || r.inspectionDate || '';
      const mKey = r.archiveMonth || (dt.length >= 7 ? dt.slice(0, 7) : '');
      const dCode = dossierByMonth.get(mKey)?.dossierCode || '—';
      return {
        '#': idx + 1,
        Dossier: dCode,
        Pallet: r.palletCode,
        'Job Code': r.jobCode || r.linkedBoxes,
        Boxes: r.boxesCount || r.boxCount || 0,
        'Delivery Date': dt,
        'Delivered By': r.deliveredBy || r.custodian || '—',
        'Delivery Status': r.deliveryStatus || '—',
        Capacity: r.capacityStatus === 'over-capacity' ? 'Over 36 Boxes' : 'Normal',
        Month: mKey,
        Sheet: r.sourceSheet || '—',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Pallet Archive');
    const suffix = activeDossier ? activeDossier.dossierCode : 'All';
    XLSX.writeFile(wb, `ARMS_Pallet_${suffix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showToast(isAr ? 'تم تصدير ملف Excel بنجاح.' : 'Excel exported successfully.', 'success');
  };

  if (mode === 'import') {
    return (
      <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-neutral-800 pb-4">
          <div>
            <div className="text-[11px] font-bold text-[#D97706] dark:text-amber-400 mb-0.5">
              {isAr ? 'أرشفة تقارير تسليم الباليت' : 'Pallet Handover Reports'}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              {isAr ? 'استيراد تسليم الباليت' : 'Import Pallet Deliveries'}
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              {isAr
                ? 'قراءة جميع الشيتات التي تحتوي على أعمدة الباليت والتاريخ وكود المشروع وعدد البوكسات.'
                : 'Reads every worksheet containing the required pallet delivery columns.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isSystemAdmin && (palletReports.length > 0 || palletArchive.uploadHistory.length > 0) && (
              <button
                type="button"
                onClick={() => {
                  setTargetUploadId(null);
                  setDeleteModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#E52225] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 hover:bg-[#E52225] hover:text-white rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isAr ? 'مسح رفعة / بيانات' : 'Delete Upload / Data'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('archive')}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-[#111111] text-xs font-semibold hover:bg-slate-50 dark:hover:bg-neutral-900 transition-colors"
            >
              {isAr ? 'فتح الأرشيف' : 'Open archive'}
            </button>
          </div>
        </header>

        <DeleteUploadModal
          isOpen={deleteModalOpen}
          scope="pallet"
          initialUploadId={targetUploadId}
          onClose={() => {
            setDeleteModalOpen(false);
            setTargetUploadId(null);
          }}
        />

        <label
          onDragOver={e => {
            e.preventDefault();
            e.stopPropagation();
            setDragging(true);
          }}
          onDragLeave={e => {
            e.preventDefault();
            e.stopPropagation();
            setDragging(false);
          }}
          onDrop={e => {
            e.preventDefault();
            e.stopPropagation();
            setDragging(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) void handleFile(dropped);
          }}
          className={`block border-2 border-dashed rounded-2xl bg-white dark:bg-[#111111] p-10 text-center cursor-pointer transition-colors ${
            dragging
              ? 'border-[#D97706] bg-amber-50/50 dark:bg-amber-950/20'
              : 'border-slate-300 dark:border-neutral-700 hover:border-[#D97706]/60'
          }`}
        >
          <input
            type="file"
            accept=".xlsx,.xls,.xlsm,.csv"
            className="hidden"
            onChange={e => {
              const chosen = e.target.files?.[0];
              e.target.value = '';
              if (chosen) void handleFile(chosen);
            }}
          />
          <Upload className="w-8 h-8 mx-auto mb-3 text-[#D97706]" />
          <div className="font-bold text-sm text-slate-900 dark:text-white">
            {busy
              ? isAr
                ? 'جاري المعالجة...'
                : 'Processing...'
              : isAr
              ? 'اختر ملف Excel أو اسحبه هنا'
              : 'Choose or drop an Excel file'}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {isAr
              ? 'الأعمدة المدعومة: Pallet · Date / Data · Job Code · No Boxes · USER NAME FILE TRAIL (سلم الباليت) · FILE TRAIL.'
              : 'Supported columns: Pallet · Date / Data · Job Code · No Boxes · USER NAME FILE TRAIL · FILE TRAIL.'}
          </p>
        </label>

        {uploadProgress && preview.length === 0 && enrichPreview.length === 0 && (
          <UploadProgressBar progress={uploadProgress} accent="amber" isAr={isAr} />
        )}

        {(preview.length > 0 || enrichPreview.length > 0) && (() => {
          const previewRowsToDisplay = preview.length > 0 ? preview : enrichPreview;
          const updatesCount = enrichPreview.length;
          return (
            <section className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-xs">
              {uploadProgress && (
                <div className="p-4 border-b border-slate-100 dark:border-neutral-800">
                  <UploadProgressBar progress={uploadProgress} accent="amber" isAr={isAr} />
                </div>
              )}
              <div className="p-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-neutral-800">
                <div>
                  <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                    {isAr ? 'معاينة الاستيراد' : 'Import preview'}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {fileName}
                    {preview.length > 0 ? ` · ${preview.length.toLocaleString()} ${isAr ? 'سجل جديد' : 'new records'}` : ''}
                    {updatesCount > 0
                      ? isAr
                        ? ` · تحديث سلم الباليت لـ ${updatesCount.toLocaleString()} سجل موجود`
                        : ` · update Delivered By on ${updatesCount.toLocaleString()} existing records`
                      : ''}
                    {scannedSheetNames.length > 0 ? ` · ${scannedSheetNames.join(', ')}` : ''}
                    {duplicatePreviewCount > 0
                      ? isAr
                        ? ` · ${duplicatePreviewCount} مكرر سيتم تخطيه`
                        : ` · ${duplicatePreviewCount} duplicates will be skipped`
                      : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPreview([]);
                      setEnrichUpdates({});
                      setEnrichPreview([]);
                      setFileName('');
                    }}
                    className="px-3 py-2 border border-slate-200 dark:border-neutral-800 rounded-lg text-xs font-semibold text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-900"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={commit}
                    className="px-4 py-2 bg-[#D97706] hover:bg-[#B45309] text-white rounded-lg text-xs font-bold disabled:opacity-50 transition-colors"
                  >
                    {busy
                      ? isAr
                        ? 'جاري الحفظ...'
                        : 'Saving...'
                      : preview.length === 0 && updatesCount > 0
                      ? isAr
                        ? `تحديث سلم الباليت (${updatesCount})`
                        : `Update Delivered By (${updatesCount})`
                      : isAr
                      ? 'اعتماد وأرشفة البيانات'
                      : 'Confirm & archive'}
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead className="bg-slate-50 dark:bg-neutral-900 text-slate-500">
                    <tr>
                      {[
                        'PALLET',
                        'JOB CODE',
                        isAr ? 'عدد البوكسات' : 'BOXES',
                        isAr ? 'تاريخ التسليم' : 'DELIVERY DATE',
                        isAr ? 'سلم الباليت' : 'DELIVERED BY',
                        isAr ? 'الحالة' : 'STATUS',
                        isAr ? 'السعة' : 'CAPACITY',
                        isAr ? 'الشيت' : 'SHEET',
                      ].map(h => (
                        <th key={h} className="p-3 text-start font-semibold">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRowsToDisplay.slice(0, 100).map(r => (
                      <tr key={r.id} className="border-t border-slate-100 dark:border-neutral-800">
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{r.palletCode}</td>
                        <td className="p-3 font-mono">{r.jobCode}</td>
                        <td className="p-3 tabular-nums font-semibold">{r.boxesCount}</td>
                        <td className="p-3 tabular-nums">{r.deliveryDate}</td>
                        <td className="p-3 font-medium text-slate-800 dark:text-neutral-200">{r.deliveredBy || '—'}</td>
                        <td className="p-3">{r.deliveryStatus || '—'}</td>
                        <td className="p-3">
                          {r.capacityStatus === 'over-capacity' ? (
                            <span className="inline-flex items-center gap-1 text-[#E52225] font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {isAr ? 'تجاوز 36' : 'Over 36'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {isAr ? 'طبيعي' : 'Normal'}
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-slate-500">{r.sourceSheet}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {previewRowsToDisplay.length > 100 && (
                <p className="p-3 text-xs text-slate-500 border-t border-slate-100 dark:border-neutral-800">
                  {isAr
                    ? `يتم عرض أول 100 سجل للمعاينة فقط من إجمالي ${previewRowsToDisplay.length.toLocaleString()} سجل.`
                    : `Showing first 100 of ${previewRowsToDisplay.length.toLocaleString()} records.`}
                </p>
              )}
            </section>
          );
        })()}

        {/* Upload History */}
        <section className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-neutral-800 text-sm font-bold text-slate-900 dark:text-white">
            {isAr ? 'سجل عمليات الرفع' : 'Upload History'}
          </div>
          {palletArchive.uploadHistory.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              {isAr ? 'لا توجد عمليات رفع مسجلة حتى الآن' : 'No uploads recorded yet'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-50 dark:bg-neutral-900/70 text-slate-500 text-[11px] font-semibold border-b border-slate-100 dark:border-neutral-800">
                  <tr>
                    <th className="px-5 py-2.5 text-start">{isAr ? 'الملف' : 'File Name'}</th>
                    <th className="px-3 py-2.5 text-start">{isAr ? 'المستخدم' : 'User'}</th>
                    <th className="px-3 py-2.5 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                    <th className="px-3 py-2.5 text-end">{isAr ? 'المستورد' : 'Imported'}</th>
                    <th className="px-5 py-2.5 text-end">{isAr ? 'الحالة' : 'Status'}</th>
                    {isSystemAdmin && <th className="px-3 py-2.5 text-center">{isAr ? 'إجراء' : 'Action'}</th>}
                  </tr>
                </thead>
                <tbody>
                  {palletArchive.uploadHistory.map(u => (
                    <tr key={u.id} className="border-b border-slate-50 dark:border-neutral-900">
                      <td className="px-5 py-2.5 font-semibold text-slate-900 dark:text-white">{u.fileName}</td>
                      <td className="px-3 py-2.5 text-slate-500">{u.userName}</td>
                      <td className="px-3 py-2.5 text-slate-500 tabular-nums">
                        {u.timestamp ? new Date(u.timestamp).toLocaleString(isAr ? 'ar-EG' : 'en-US') : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-end font-bold tabular-nums">{u.importedCount}</td>
                      <td className="px-5 py-2.5 text-end text-emerald-600 font-semibold">{u.status}</td>
                      {isSystemAdmin && (
                        <td className="px-3 py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setTargetUploadId(u.id);
                              setDeleteModalOpen(true);
                            }}
                            title={isAr ? 'مسح هذه الرفعة' : 'Delete this upload'}
                            className="p-1.5 text-[#E52225] hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5" dir={isAr ? 'rtl' : 'ltr'}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-neutral-800 pb-4">
        <div>
          <div className="text-[11px] font-bold text-[#D97706] dark:text-amber-400 mb-0.5">
            {isAr ? 'أرشفة تقارير تسليم الباليت' : 'Pallet Handover Reports'}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {activeDossier
              ? `${activeDossier.dossierCode} · ${safeMonthLabel(activeDossier.monthKey, isAr)}`
              : isAr
              ? 'أرشيف تسليم الباليت (الدوسيهات الشهرية)'
              : 'Pallet Delivery Archive (Monthly Dossiers)'}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {activeDossier
              ? isAr
                ? `من ${formatShortLabelDate(activeDossier.minDate)} إلى ${formatShortLabelDate(activeDossier.maxDate)} · ${activeDossier.rows.length.toLocaleString()} سجل`
                : `From ${formatShortLabelDate(activeDossier.minDate)} to ${formatShortLabelDate(activeDossier.maxDate)} · ${activeDossier.rows.length.toLocaleString()} records`
              : isAr
              ? 'كل شهر محفوظ في دوسيه مستقل (P1, P2...) مرتبة من أقدم شهر — اضغط على أي دوسيه لعرض سجلاته.'
              : 'Each month is stored in a chronological dossier (P1, P2...) — click any dossier to open its records.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeDossier && (
            <>
              <button
                type="button"
                onClick={() => setSelectedMonthKey(null)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-[#111111] hover:bg-slate-50 dark:hover:bg-neutral-900 transition-colors"
              >
                <BackArrow className="w-3.5 h-3.5" />
                <span>{isAr ? 'كل الدوسيهات' : 'All Dossiers'}</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigate('labels', activeDossier.dossierCode)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-[#B45309] dark:text-amber-300 hover:bg-amber-100 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>
                  {isAr ? `طباعة ليبل ${activeDossier.dossierCode}` : `Print ${activeDossier.dossierCode} Label`}
                </span>
              </button>
            </>
          )}
          {isSystemAdmin && (palletReports.length > 0 || palletArchive.uploadHistory.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setTargetUploadId(null);
                setDeleteModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#E52225] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 hover:bg-[#E52225] hover:text-white rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isAr ? 'مسح رفعة / بيانات' : 'Delete Upload / Data'}</span>
            </button>
          )}
          {palletReports.length > 0 && (
            <button
              type="button"
              onClick={handleExportFilteredExcel}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-neutral-800 bg-white dark:bg-[#111111] text-xs font-semibold text-slate-700 dark:text-neutral-200 hover:bg-slate-50 dark:hover:bg-neutral-900 transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isAr ? 'تصدير Excel' : 'Export Excel'}</span>
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => setManualOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-[#B45309] dark:text-amber-300 text-xs font-bold hover:bg-amber-100 dark:hover:bg-amber-950/70 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAr ? 'إضافة سجل' : 'Add Record'}</span>
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => onNavigate('import')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold transition-colors"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{isAr ? 'استيراد ملف' : 'Import file'}</span>
            </button>
          )}
        </div>
      </header>

      <DeleteUploadModal
        isOpen={deleteModalOpen}
        scope="pallet"
        initialUploadId={targetUploadId}
        onClose={() => {
          setDeleteModalOpen(false);
          setTargetUploadId(null);
        }}
      />

      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <form
            onSubmit={handleManualAdd}
            className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-neutral-800">
              <h2 className="font-bold text-sm text-slate-900 dark:text-white">
                {isAr ? 'إضافة سجل تسليم باليت يدوياً' : 'Add Pallet Handover Record'}
              </h2>
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">{isAr ? 'رقم الباليت' : 'Pallet Code'}</label>
                <input
                  required
                  value={manualPalletCode}
                  onChange={e => setManualPalletCode(e.target.value)}
                  placeholder="PLT-001"
                  className="w-full border border-slate-200 dark:border-neutral-800 rounded-lg px-3 py-2 bg-transparent"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{isAr ? 'كود المشروع' : 'Job Code'}</label>
                <input
                  required
                  value={manualJobCode}
                  onChange={e => setManualJobCode(e.target.value)}
                  placeholder="35200"
                  className="w-full border border-slate-200 dark:border-neutral-800 rounded-lg px-3 py-2 bg-transparent"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{isAr ? 'عدد البوكسات' : 'Boxes Count'}</label>
                <input
                  required
                  type="number"
                  min={1}
                  value={manualBoxesCount}
                  onChange={e => setManualBoxesCount(e.target.value)}
                  className="w-full border border-slate-200 dark:border-neutral-800 rounded-lg px-3 py-2 bg-transparent"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{isAr ? 'تاريخ التسليم' : 'Delivery Date'}</label>
                <input
                  required
                  type="date"
                  value={manualDate}
                  onChange={e => setManualDate(e.target.value)}
                  className="w-full border border-slate-200 dark:border-neutral-800 rounded-lg px-3 py-2 bg-transparent"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{isAr ? 'سلم الباليت' : 'Delivered By'}</label>
                <input
                  value={manualDeliveredBy}
                  onChange={e => setManualDeliveredBy(e.target.value)}
                  placeholder={currentUser.name}
                  className="w-full border border-slate-200 dark:border-neutral-800 rounded-lg px-3 py-2 bg-transparent"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">{isAr ? 'حالة التسليم' : 'Delivery Status'}</label>
                <input
                  value={manualStatus}
                  onChange={e => setManualStatus(e.target.value)}
                  placeholder={isAr ? 'تم التسليم' : 'Delivered'}
                  className="w-full border border-slate-200 dark:border-neutral-800 rounded-lg px-3 py-2 bg-transparent"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setManualOpen(false)}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-neutral-800 text-xs font-semibold"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold disabled:opacity-50"
              >
                {busy ? (isAr ? 'جاري الحفظ...' : 'Saving...') : isAr ? 'حفظ السجل' : 'Save Record'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: isAr ? 'الدوسيهات الشهرية' : 'Monthly Dossiers', value: dossiers.length },
          { label: isAr ? 'إجمالي السجلات' : 'Records', value: palletReports.length },
          {
            label: isAr ? 'إجمالي البوكسات' : 'Total boxes',
            value: palletReports.reduce((s, r) => s + (r.boxesCount || r.boxCount || 0), 0),
          },
          {
            label: isAr ? 'تجاوز السعة' : 'Over capacity',
            value: new Set(
              palletReports
                .filter(r => r.capacityStatus === 'over-capacity')
                .map(r => `${r.palletCode}|${r.deliveryDate || r.inspectionDate}`)
            ).size,
          },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl p-4">
            <div className="text-xs text-slate-500">{k.label}</div>
            <div className="text-2xl font-extrabold mt-2 tabular-nums text-slate-900 dark:text-white">
              {k.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>

      {/* Comments-Style Date Range, Status & Search Filter Card */}
      <section className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-[#D97706] dark:text-amber-400 flex items-center justify-center shrink-0">
              <Filter className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
                {isAr ? 'تصفية البيانات' : 'Filter Archive Data'}
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                {isAr
                  ? 'حدد الفترة الزمنية (من تاريخ / إلى تاريخ) وحالة السعة لعرض النتائج.'
                  : 'Select a date range (From / To) and capacity status to filter results.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(dateFrom || dateTo) && (
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-[#B45309] dark:text-amber-300 border border-amber-200/70 dark:border-amber-900 tabular-nums">
                {dateFrom ? formatShortLabelDate(dateFrom) : '...'} → {dateTo ? formatShortLabelDate(dateTo) : '...'}
              </span>
            )}
            <span className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400 tabular-nums">
              {isAr ? `${activeRows.length.toLocaleString()} نتيجة` : `${activeRows.length.toLocaleString()} results`}
            </span>
          </div>
        </div>

        {/* Quick Period Presets + Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400 me-1">
              {isAr ? 'فترات سريعة:' : 'Quick periods:'}
            </span>
            {(
              [
                { id: 'today', label: isAr ? 'اليوم' : 'Today' },
                { id: 'week', label: isAr ? 'هذا الأسبوع' : 'This Week' },
                { id: 'month', label: isAr ? 'هذا الشهر' : 'This Month' },
                { id: 'all', label: isAr ? 'كل البيانات' : 'All Data' },
              ] as const
            ).map(preset => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyDatePreset(preset.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${
                  activePreset === preset.id
                    ? 'bg-[#D97706] border-[#D97706] text-white shadow-xs'
                    : 'bg-slate-50 dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-300 hover:border-[#D97706]/50'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={resetAllFilters}
            title={isAr ? 'إعادة ضبط الفلاتر' : 'Reset all filters'}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 text-xs font-semibold text-slate-600 dark:text-neutral-300 hover:border-[#D97706] hover:text-[#D97706] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isAr ? 'إعادة ضبط' : 'Reset'}</span>
          </button>
        </div>

        {/* Inputs Row: Search + Date From + Date To + Dossier + Capacity Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          <div className="lg:col-span-4 space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400">
              {isAr ? 'بحث نصي' : 'Keyword Search'}
            </label>
            <div className="relative">
              <Search className="absolute start-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={
                  isAr
                    ? 'رقم الدوسيه (P1) أو الباليت أو المشروع أو سلم الباليت...'
                    : 'Dossier (P1), pallet, job code or delivered by...'
                }
                className="w-full ps-9 pe-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:border-[#D97706]"
              />
            </div>
          </div>

          <div className="lg:col-span-2 space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400">
              {isAr ? 'من تاريخ' : 'From Date'}
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl tabular-nums focus:outline-none focus:border-[#D97706]"
            />
          </div>

          <div className="lg:col-span-2 space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400">
              {isAr ? 'إلى تاريخ' : 'To Date'}
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl tabular-nums focus:outline-none focus:border-[#D97706]"
            />
          </div>

          <div className="lg:col-span-2 space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400">
              {isAr ? 'الدوسيه الشهري' : 'Monthly Dossier'}
            </label>
            <select
              value={selectedMonthKey ?? 'all'}
              onChange={e => setSelectedMonthKey(e.target.value === 'all' ? null : e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl font-semibold focus:outline-none focus:border-[#D97706]"
            >
              <option value="all">{isAr ? `كل الدوسيهات (${dossiers.length})` : `All dossiers (${dossiers.length})`}</option>
              {dossiers.map(d => (
                <option key={d.monthKey || d.dossierCode} value={d.monthKey}>
                  {d.dossierCode} · {safeMonthLabel(d.monthKey, isAr)} ({d.rows.length})
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2 space-y-1">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400">
              {isAr ? 'حالة السعة' : 'Capacity'}
            </label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | 'normal' | 'over-capacity')}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl font-semibold focus:outline-none focus:border-[#D97706]"
            >
              <option value="all">{isAr ? 'كل الحالات' : 'All statuses'}</option>
              <option value="normal">{isAr ? 'طبيعي (≤36)' : 'Normal (≤36)'}</option>
              <option value="over-capacity">{isAr ? 'تجاوز 36 بوكس' : 'Over 36 boxes'}</option>
            </select>
          </div>
        </div>
      </section>

      {/* Body: Fast Dossier Cards Grid OR Single-Dossier / Filtered Paginated Table */}
      {palletReports.length === 0 ? (
        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl p-12 text-center text-sm text-slate-500 space-y-3">
          <FolderArchive className="w-8 h-8 mx-auto opacity-40 text-[#D97706]" />
          <div>{isAr ? 'لا توجد سجلات مؤرشفة حتى الآن' : 'No archived records yet'}</div>
          {canEdit && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('import')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{isAr ? 'استيراد ملف Excel' : 'Import Excel'}</span>
              </button>
            </div>
          )}
        </div>
      ) : !showTableMode ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {dossiers.map(d => (
            <div
              key={d.monthKey || d.dossierCode}
              className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 hover:border-[#D97706]/60 rounded-xl p-4 flex flex-col justify-between gap-4 transition-colors shadow-2xs"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-900/60 text-[#B45309] dark:text-amber-400 flex items-center justify-center font-mono font-extrabold text-base shrink-0">
                      {d.dossierCode}
                    </div>
                    <div>
                      <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                        {safeMonthLabel(d.monthKey, isAr)}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5 tabular-nums">
                        <Calendar className="w-3 h-3 text-[#D97706]" />
                        <span>
                          {d.minDate ? formatShortLabelDate(d.minDate) : '—'} →{' '}
                          {d.maxDate ? formatShortLabelDate(d.maxDate) : '—'}
                        </span>
                      </div>
                    </div>
                  </div>
                  {d.overCapacityCount > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-50 dark:bg-red-950/40 text-[#E52225] text-[10px] font-bold">
                      <AlertTriangle className="w-3 h-3" />
                      {d.overCapacityCount}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold">
                      <CheckCircle2 className="w-3 h-3" />
                      {isAr ? 'سليم' : 'OK'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 py-2.5 border-y border-slate-100 dark:border-neutral-800 text-center">
                  <div>
                    <div className="text-[10px] text-slate-400">{isAr ? 'السجلات' : 'Records'}</div>
                    <div className="text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
                      {d.rows.length.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">{isAr ? 'الباليتات' : 'Pallets'}</div>
                    <div className="text-sm font-extrabold tabular-nums text-slate-900 dark:text-white">
                      {d.palletsCount.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">{isAr ? 'البوكسات' : 'Boxes'}</div>
                    <div className="text-sm font-extrabold tabular-nums text-[#D97706] dark:text-amber-400">
                      {d.totalBoxes.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedMonthKey(d.monthKey)}
                  className="flex-1 py-2 px-3 rounded-lg bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold transition-colors"
                >
                  {isAr ? `فتح الدوسيه ${d.dossierCode}` : `Open ${d.dossierCode}`}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('labels', d.dossierCode)}
                  title={isAr ? `طباعة ليبل ${d.dossierCode}` : `Print ${d.dossierCode} label`}
                  className="p-2 rounded-lg border border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-300 hover:border-[#D97706] hover:text-[#D97706] transition-colors"
                >
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <section className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/50 dark:bg-neutral-900/40">
            <div className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white">
              <FolderArchive className="w-4 h-4 text-[#D97706]" />
              <span>
                {activeDossier
                  ? `${activeDossier.dossierCode} · ${safeMonthLabel(activeDossier.monthKey, isAr)}`
                  : isAr
                  ? 'نتائج البحث والتصفية'
                  : 'Filtered Results'}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs text-slate-500 tabular-nums">
              <span>
                {activeRows.length.toLocaleString()} {isAr ? 'سجل' : 'records'}
              </span>
              <span>·</span>
              <span>
                {activeRows.reduce((s, r) => s + (r.boxesCount || r.boxCount || 0), 0).toLocaleString()}{' '}
                {isAr ? 'بوكس' : 'boxes'}
              </span>
            </div>
          </div>

          {pagedRows.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              {isAr ? 'لا توجد سجلات مطابقة للبحث' : 'No matching records'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-50 dark:bg-neutral-900 text-slate-500">
                  <tr>
                    {!activeDossier && <th className="p-3 text-start font-semibold">{isAr ? 'الدوسيه' : 'DOSSIER'}</th>}
                    {[
                      isAr ? 'رقم الباليت' : 'PALLET',
                      isAr ? 'كود المشروع' : 'JOB CODE',
                      isAr ? 'عدد البوكسات' : 'BOXES',
                      isAr ? 'تاريخ التسليم' : 'DELIVERY DATE',
                      isAr ? 'سلم الباليت' : 'DELIVERED BY',
                      isAr ? 'حالة التسليم' : 'DELIVERY STATUS',
                      isAr ? 'حالة السعة' : 'CAPACITY',
                    ].map(h => (
                      <th key={h} className="p-3 text-start font-semibold">
                        {h}
                      </th>
                    ))}
                    {isSystemAdmin && <th className="p-3 text-center font-semibold">{isAr ? 'حذف' : 'Delete'}</th>}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map(r => {
                    const dt = r.deliveryDate || r.inspectionDate || '';
                    const mKey = r.archiveMonth || (dt.length >= 7 ? dt.slice(0, 7) : '');
                    const dCode = dossierByMonth.get(mKey)?.dossierCode || '—';
                    return (
                      <tr
                        key={r.id}
                        className="border-t border-slate-100 dark:border-neutral-800 hover:bg-slate-50/50 dark:hover:bg-neutral-900/40"
                      >
                        {!activeDossier && (
                          <td className="p-3 font-mono font-bold text-[#B45309] dark:text-amber-400">{dCode}</td>
                        )}
                        <td className="p-3 font-bold text-slate-900 dark:text-white">{r.palletCode}</td>
                        <td className="p-3 font-mono">{r.jobCode || r.linkedBoxes}</td>
                        <td className="p-3 tabular-nums font-semibold">{r.boxesCount || r.boxCount}</td>
                        <td className="p-3 tabular-nums">{dt}</td>
                        <td className="p-3">{r.deliveredBy || r.custodian || '—'}</td>
                        <td className="p-3">{r.deliveryStatus || '—'}</td>
                        <td className="p-3">
                          {r.capacityStatus === 'over-capacity' ? (
                            <span className="inline-flex items-center gap-1 text-[#E52225] font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {isAr ? 'تجاوز 36' : 'Over 36'}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {isAr ? 'طبيعي' : 'Normal'}
                            </span>
                          )}
                        </td>
                        {isSystemAdmin && (
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleDeleteRow(r.id)}
                              title={isAr ? 'حذف السجل' : 'Delete record'}
                              className="p-1 text-slate-400 hover:text-[#E52225] rounded transition-colors disabled:opacity-40"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <div className="tabular-nums">
                {isAr
                  ? `عرض ${(safePage - 1) * PAGE_SIZE + 1} - ${Math.min(safePage * PAGE_SIZE, activeRows.length)} من ${activeRows.length.toLocaleString()}`
                  : `Showing ${(safePage - 1) * PAGE_SIZE + 1}-${Math.min(safePage * PAGE_SIZE, activeRows.length)} of ${activeRows.length.toLocaleString()}`}
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-neutral-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-neutral-900"
                >
                  {isAr ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
                <span className="px-2 font-bold tabular-nums text-slate-800 dark:text-neutral-200">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 dark:border-neutral-800 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-neutral-900"
                >
                  {isAr ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
