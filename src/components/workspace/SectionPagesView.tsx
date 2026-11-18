import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  FileBarChart,
  FileDown,
  FileSpreadsheet,
  Filter,
  FolderArchive,
  Layers,
  Printer,
  RotateCcw,
  Search,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useArchive } from '../../context/ArchiveContext';
import { LabelData } from '../../types';
import { ActiveTab } from '../navigation/TopNav';
import { MinutesArchiveViews } from './MinutesArchiveViews';
import { PalletHandoverViews, buildPalletMonthlyDossiers, safeMonthLabel } from './PalletHandoverViews';
import { LabelCanvasPreview, LabelVectorSvg } from '../labels/LabelCanvasPreview';
import {
  formatShortLabelDate,
  generateLabelsPDF,
  generateQRDataURL,
  getMonochromeLabelLogos,
  getQRCodeText,
} from '../../utils/labelGenerator';
import { exportCommentsReportToPDF } from '../../utils/reportExporter';
import { weekEndOf, weekStartOf } from '../../utils/minutesPlan';
import logoColor from '../../assets/logo.png';
import armsLogoLight from '../../assets/arms-logo.png';

interface SectionPagesViewProps {
  workspace: 'pallet-archive' | 'minutes-archive';
  activeTab: ActiveTab;
  selectedBoxId?: string;
  selectedDossierId?: string;
  projectsFilter?: string;
  labelInitialBoxCode?: string;
  onNavigate: (tab: ActiveTab, param?: string) => void;
  onSelectBox?: (boxId: string) => void;
  onSelectDossier?: (dossierId: string) => void;
}

export const SectionPagesView: React.FC<SectionPagesViewProps> = ({
  workspace,
  activeTab,
  selectedBoxId = 'C1',
  selectedDossierId = 'C1-1',
  projectsFilter = '',
  labelInitialBoxCode = 'C1',
  onNavigate,
  onSelectBox,
  onSelectDossier,
}) => {
  const { currentUser, language, palletArchive, palletReports, showToast } = useArchive();
  const isAr = language === 'ar';
  const DirectionalArrow = isAr ? ArrowLeft : ArrowRight;
  const canEdit = ['System Admin', 'Archive Manager', 'Data Entry'].includes(currentUser.role);

  const isPallet = workspace === 'pallet-archive';

  // Dashboard & shared archive date/status filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [palletDateFrom, setPalletDateFrom] = useState('');
  const [palletDateTo, setPalletDateTo] = useState('');
  const [palletStatusFilter, setPalletStatusFilter] = useState<'all' | 'normal' | 'over-capacity'>('all');

  // Reports state
  const [selectedReportTab, setSelectedReportTab] = useState<'summary' | 'records' | 'audit'>('summary');
  const [reportMonthFilter, setReportMonthFilter] = useState<string>('all');
  const [reportDateFrom, setReportDateFrom] = useState<string>('');
  const [reportDateTo, setReportDateTo] = useState<string>('');
  const [reportSearch, setReportSearch] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);

  // Labels state
  const [labelMode, setLabelMode] = useState<'dossier' | 'manual'>('dossier');
  const [selectedDossierCode, setSelectedDossierCode] = useState<string>('');
  const [manualLabelCode, setManualLabelCode] = useState<string>('P1');
  const [manualFromLabel, setManualFromLabel] = useState<string>('01/01/26');
  const [manualToLabel, setManualToLabel] = useState<string>('31/01/26');
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [logos, setLogos] = useState<{ intercomSrc: string; armsSrc: string }>({ intercomSrc: '', armsSrc: '' });
  const [generatingLabelPdf, setGeneratingLabelPdf] = useState(false);

  const palletDossiers = useMemo(() => buildPalletMonthlyDossiers(palletReports), [palletReports]);

  const palletMonths = useMemo(
    () =>
      palletDossiers
        .map(d => d.monthKey)
        .filter(Boolean)
        .reverse(),
    [palletDossiers]
  );

  const uniquePalletsCount = useMemo(
    () => new Set(palletReports.map(r => (r.palletCode || '').trim()).filter(Boolean)).size,
    [palletReports]
  );

  useEffect(() => {
    if (palletDossiers.length === 0) {
      setSelectedDossierCode('');
      return;
    }
    if (labelInitialBoxCode && palletDossiers.some(d => d.dossierCode === labelInitialBoxCode)) {
      setSelectedDossierCode(labelInitialBoxCode);
      setLabelMode('dossier');
      return;
    }
    setSelectedDossierCode(prev =>
      palletDossiers.some(d => d.dossierCode === prev) ? prev : palletDossiers[0].dossierCode
    );
  }, [palletDossiers, labelInitialBoxCode]);

  const activeLabelData: LabelData = useMemo(() => {
    if (labelMode === 'dossier' && palletDossiers.length > 0) {
      const d = palletDossiers.find(x => x.dossierCode === selectedDossierCode) || palletDossiers[0];
      return {
        type: 'box',
        boxCode: d.dossierCode,
        subtitle: 'PALLET DOSSIER',
        fromJobId: d.dossierNumber,
        toJobId: d.dossierNumber,
        fromLabel: d.minDate ? formatShortLabelDate(d.minDate) : '—',
        toLabel: d.maxDate ? formatShortLabelDate(d.maxDate) : '—',
      };
    }
    return {
      type: 'box',
      boxCode: manualLabelCode.trim() || 'P1',
      subtitle: 'PALLET DOSSIER',
      fromJobId: 1,
      toJobId: 1,
      fromLabel: manualFromLabel.trim() || '01/01/26',
      toLabel: manualToLabel.trim() || '31/01/26',
    };
  }, [labelMode, palletDossiers, selectedDossierCode, manualLabelCode, manualFromLabel, manualToLabel]);

  useEffect(() => {
    if (!isPallet || activeTab !== 'labels') return;
    let active = true;
    getMonochromeLabelLogos().then(res => {
      if (active) setLogos(res);
    });
    generateQRDataURL(getQRCodeText(activeLabelData)).then(url => {
      if (active) setQrDataUrl(url);
    });
    return () => {
      active = false;
    };
  }, [isPallet, activeTab, activeLabelData]);

  if (!isPallet) {
    return (
      <MinutesArchiveViews
        activeTab={activeTab}
        selectedBoxId={selectedBoxId}
        selectedDossierId={selectedDossierId}
        projectsFilter={projectsFilter}
        labelInitialBoxCode={labelInitialBoxCode}
        onNavigate={onNavigate}
        onSelectBox={id => onSelectBox?.(id)}
        onSelectDossier={id => onSelectDossier?.(id)}
      />
    );
  }

  if (activeTab === 'import') {
    return <PalletHandoverViews mode="import" onNavigate={onNavigate} />;
  }
  if (activeTab === 'archive') {
    return (
      <PalletHandoverViews
        mode="archive"
        onNavigate={onNavigate}
        dateFrom={palletDateFrom}
        dateTo={palletDateTo}
        statusFilter={palletStatusFilter}
        onDateFromChange={setPalletDateFrom}
        onDateToChange={setPalletDateTo}
        onStatusFilterChange={setPalletStatusFilter}
      />
    );
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const applyDashboardDatePreset = (preset: 'all' | 'today' | 'week' | 'month') => {
    if (preset === 'all') {
      setPalletDateFrom('');
      setPalletDateTo('');
    } else if (preset === 'today') {
      setPalletDateFrom(todayIso);
      setPalletDateTo(todayIso);
    } else if (preset === 'week') {
      const ws = weekStartOf(todayIso);
      setPalletDateFrom(ws);
      setPalletDateTo(weekEndOf(ws));
    } else {
      const [y, m] = todayIso.split('-').map(Number);
      const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
      const lastDate = new Date(Date.UTC(y, m, 0));
      const lastDay = `${y}-${String(m).padStart(2, '0')}-${String(lastDate.getUTCDate()).padStart(2, '0')}`;
      setPalletDateFrom(firstDay);
      setPalletDateTo(lastDay);
    }
  };

  const activeDashboardPreset: 'all' | 'today' | 'week' | 'month' | null = (() => {
    if (!palletDateFrom && !palletDateTo) return 'all';
    if (palletDateFrom === todayIso && palletDateTo === todayIso) return 'today';
    const ws = weekStartOf(todayIso);
    const we = weekEndOf(ws);
    if (palletDateFrom === ws && palletDateTo === we) return 'week';
    const [y, m] = todayIso.split('-').map(Number);
    const firstDay = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDate = new Date(Date.UTC(y, m, 0));
    const lastDay = `${y}-${String(m).padStart(2, '0')}-${String(lastDate.getUTCDate()).padStart(2, '0')}`;
    if (palletDateFrom === firstDay && palletDateTo === lastDay) return 'month';
    return null;
  })();

  const matchesDashboardDate = (isoDate?: string | null) => {
    if (!palletDateFrom && !palletDateTo) return true;
    const clean = (isoDate || '').slice(0, 10);
    if (!clean) return false;
    if (palletDateFrom && clean < palletDateFrom) return false;
    if (palletDateTo && clean > palletDateTo) return false;
    return true;
  };

  const dashboardFilteredRows = palletReports.filter(row => {
    const dt = row.deliveryDate || row.inspectionDate || '';
    if (!matchesDashboardDate(dt)) return false;
    if (palletStatusFilter !== 'all' && (row.capacityStatus || 'normal') !== palletStatusFilter) return false;
    return true;
  });

  const palletTotalBoxes = dashboardFilteredRows.reduce((sum, row) => sum + (row.boxesCount || row.boxCount || 0), 0);
  const palletOverCapacityGroups = new Set(
    dashboardFilteredRows
      .filter(row => row.capacityStatus === 'over-capacity')
      .map(row => `${row.palletCode}|${row.deliveryDate || row.inspectionDate}`)
  ).size;
  const palletOverCapacityRows = dashboardFilteredRows.filter(row => row.capacityStatus === 'over-capacity').length;
  const palletNormalRows = dashboardFilteredRows.length - palletOverCapacityRows;
  const normalPct = dashboardFilteredRows.length > 0 ? (palletNormalRows / dashboardFilteredRows.length) * 100 : 0;
  const filteredUniquePalletsCount = new Set(dashboardFilteredRows.map(r => (r.palletCode || '').trim()).filter(Boolean)).size;
  const filteredDossiersCount = buildPalletMonthlyDossiers(dashboardFilteredRows).length;

  const theme = {
    sectionTitle: isAr ? 'أرشفة تقارير تسليم الباليت' : 'Pallet Handover Reports',
    accentText: 'text-[#D97706] dark:text-amber-400',
    accentGroupHoverText: 'group-hover:text-[#D97706] dark:group-hover:text-amber-400',
    accentBg: 'bg-[#D97706] hover:bg-[#B45309]',
    accentBgSolid: 'bg-[#D97706]',
    accentTint: 'bg-amber-50 dark:bg-amber-950/50 text-[#B45309] dark:text-amber-400',
    accentBorderFocus: 'focus:border-[#D97706] focus:ring-[#D97706]',
    accentHex: '#D97706',
    reportsTitle: isAr ? 'مركز تقارير الباليت' : 'Pallet Reports Center',
    labelsTitle: isAr ? 'طباعة ليبلات الباليت' : 'Pallet Thermal Labels',
  };

  const quickActions = [
    {
      id: 'archive',
      label: isAr ? 'فتح الأرشيف' : 'Open Archive',
      icon: FolderArchive,
      onClick: () => onNavigate('archive'),
    },
    {
      id: 'labels',
      label: isAr ? 'طباعة الليبلات' : 'Print Labels',
      icon: Printer,
      onClick: () => onNavigate('labels'),
    },
    ...(canEdit
      ? [
          {
            id: 'import',
            label: isAr ? 'استيراد البيانات' : 'Import Data',
            icon: FileSpreadsheet,
            onClick: () => onNavigate('import'),
          },
        ]
      : []),
    {
      id: 'reports',
      label: isAr ? 'مركز التقارير' : 'Reports Center',
      icon: FileBarChart,
      onClick: () => onNavigate('reports'),
    },
  ];

  /* -------------------- 1. DASHBOARD VIEW -------------------- */
  if (activeTab === 'dashboard') {
    const q = searchTerm.trim().toLowerCase();
    const filteredRecords = dashboardFilteredRows.filter(r => {
      if (!q) return true;
      const text = `${r.palletCode} ${r.jobCode || r.linkedBoxes} ${r.deliveredBy || r.custodian} ${r.deliveryStatus || ''} ${r.deliveryDate || r.inspectionDate || ''}`.toLowerCase();
      return text.includes(q);
    });

    const recentUploads =
      palletArchive.uploadHistory.length > 0
        ? palletArchive.uploadHistory.slice(0, 6)
        : Array.from(
            palletReports
              .reduce((acc, r) => {
                const key = r.uploadId || r.sourceSheet || 'pallet-batch';
                const cur = acc.get(key);
                if (!cur) {
                  acc.set(key, {
                    id: key,
                    fileName: r.sourceSheet ? `Pallet Import (${r.sourceSheet})` : 'Pallet Import',
                    timestamp: r.createdAt || r.deliveryDate || '',
                    importedCount: 1,
                    status: 'Completed',
                  });
                } else {
                  cur.importedCount += 1;
                }
                return acc;
              }, new Map<string, { id: string; fileName: string; timestamp: string; importedCount: number; status: string }>())
              .values()
          ).slice(0, 6);

    const pieData =
      dashboardFilteredRows.length > 0
        ? [
            { name: isAr ? 'سعة طبيعية (≤36)' : 'Within Capacity', value: palletNormalRows, color: '#D97706' },
            { name: isAr ? 'تجاوز السعة (>36)' : 'Over Capacity', value: palletOverCapacityRows, color: '#E52225' },
          ].filter(item => item.value > 0)
        : [{ name: isAr ? 'فارغ' : 'Empty', value: 1, color: '#E2E8F0' }];

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <div className={`text-[11px] font-bold mb-0.5 ${theme.accentText}`}>{theme.sectionTitle}</div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {isAr ? 'لوحة المتابعة والتحكم' : 'Workspace Dashboard'}
            </h1>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() => onNavigate('import')}
              className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto ${theme.accentBg}`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{isAr ? 'استيراد البيانات' : 'Import Data'}</span>
            </button>
          )}
        </div>

        {/* Live Search */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={
              isAr
                ? 'بحث برقم الباليت أو كود المشروع أو سلم الباليت أو التاريخ...'
                : 'Search pallet, job code, delivered by or date...'
            }
            className={`w-full h-11 ps-10 pe-4 text-xs sm:text-sm bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:ring-1 ${theme.accentBorderFocus}`}
          />
        </div>

        {/* Date From / To & Status Filter Card (matching Comments section) */}
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
                    ? 'حدد الفترة الزمنية (من تاريخ / إلى تاريخ) والحالة لعرض النتائج.'
                    : 'Select a date range (From / To) and status to filter results.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {(palletDateFrom || palletDateTo) && (
                <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-50 dark:bg-amber-950/40 text-[#B45309] dark:text-amber-300 border border-amber-200/70 dark:border-amber-900 tabular-nums">
                  {palletDateFrom ? formatShortLabelDate(palletDateFrom) : '...'} →{' '}
                  {palletDateTo ? formatShortLabelDate(palletDateTo) : '...'}
                </span>
              )}
              <span className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400 tabular-nums">
                {isAr
                  ? `${filteredRecords.length.toLocaleString()} نتيجة`
                  : `${filteredRecords.length.toLocaleString()} results`}
              </span>
            </div>
          </div>

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
                  onClick={() => applyDashboardDatePreset(preset.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${
                    activeDashboardPreset === preset.id
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
              onClick={() => {
                setPalletDateFrom('');
                setPalletDateTo('');
                setPalletStatusFilter('all');
                setSearchTerm('');
              }}
              title={isAr ? 'إعادة ضبط الفلاتر' : 'Reset all filters'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 text-xs font-semibold text-slate-600 dark:text-neutral-300 hover:border-[#D97706] hover:text-[#D97706] transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{isAr ? 'إعادة ضبط' : 'Reset'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-4 space-y-1">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400">
                {isAr ? 'من تاريخ' : 'From Date'}
              </label>
              <input
                type="date"
                value={palletDateFrom}
                onChange={e => setPalletDateFrom(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl tabular-nums focus:outline-none focus:border-[#D97706]"
              />
            </div>

            <div className="lg:col-span-4 space-y-1">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400">
                {isAr ? 'إلى تاريخ' : 'To Date'}
              </label>
              <input
                type="date"
                value={palletDateTo}
                onChange={e => setPalletDateTo(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl tabular-nums focus:outline-none focus:border-[#D97706]"
              />
            </div>

            <div className="lg:col-span-4 space-y-1">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400">
                {isAr ? 'الحالة' : 'Status'}
              </label>
              <select
                value={palletStatusFilter}
                onChange={e => setPalletStatusFilter(e.target.value as 'all' | 'normal' | 'over-capacity')}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl font-semibold focus:outline-none focus:border-[#D97706]"
              >
                <option value="all">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
                <option value="normal">{isAr ? 'طبيعي (≤36)' : 'Within Capacity (≤36)'}</option>
                <option value="over-capacity">{isAr ? 'تجاوز 36 بوكس' : 'Over 36 Boxes'}</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('archive')}
            className="w-full py-2.5 px-4 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            <Search className="w-4 h-4" />
            <span>
              {isAr
                ? `عرض السجلات المطابقة في صفحة الأرشيف (${filteredRecords.length.toLocaleString()})`
                : `View Matching Records in Archive (${filteredRecords.length.toLocaleString()})`}
            </span>
          </button>
        </section>

        {/* Unified KPI Strip + Progress Bar */}
        <section
          aria-label={isAr ? 'ملخص مؤشرات الباليت' : 'Pallet Metrics Summary'}
          className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl overflow-hidden"
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => onNavigate('archive')}
              className="p-5 text-start bg-white dark:bg-[#111111] hover:bg-slate-50/80 dark:hover:bg-neutral-900/60 transition-colors group"
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-neutral-400">
                <span>{isAr ? 'إجمالي السجلات' : 'Total Records'}</span>
                <ArrowUpRight className={`w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity ${theme.accentText}`} />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                {dashboardFilteredRows.length.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                {palletTotalBoxes.toLocaleString()} {isAr ? 'بوكس' : 'boxes'} · {filteredUniquePalletsCount.toLocaleString()}{' '}
                {isAr ? 'باليت' : 'pallets'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('archive')}
              className="p-5 text-start bg-white dark:bg-[#111111] hover:bg-slate-50/80 dark:hover:bg-neutral-900/60 transition-colors group"
            >
              <div className={`flex items-center justify-between text-xs font-medium ${theme.accentText}`}>
                <span>{isAr ? 'سجلات مطابقة للسعة' : 'Within Capacity'}</span>
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <div className={`mt-2 text-2xl sm:text-3xl font-extrabold tabular-nums ${theme.accentText}`}>
                {palletNormalRows.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                {normalPct.toFixed(1)}% {isAr ? 'من الإجمالي' : 'of total'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('archive')}
              className="p-5 text-start bg-white dark:bg-[#111111] hover:bg-slate-50/80 dark:hover:bg-neutral-900/60 transition-colors group"
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-neutral-400">
                <span>{isAr ? 'تجاوز السعة (>36)' : 'Over Capacity (>36)'}</span>
                <Clock className="w-3.5 h-3.5 text-[#E52225]" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                {palletOverCapacityGroups.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                {palletOverCapacityRows.toLocaleString()} {isAr ? 'سجل متأثر' : 'affected rows'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('labels')}
              className="p-5 text-start bg-white dark:bg-[#111111] hover:bg-slate-50/80 dark:hover:bg-neutral-900/60 transition-colors group"
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-neutral-400">
                <span>{isAr ? 'الدوسيهات الشهرية' : 'Monthly Dossiers'}</span>
                <Printer className={`w-3.5 h-3.5 ${theme.accentText}`} />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                {filteredDossiersCount.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                {filteredDossiersCount > 0
                  ? `P1 → P${palletDossiers.length}`
                  : isAr
                  ? 'لا توجد دوسيهات'
                  : 'No dossiers'}
              </div>
            </button>
          </div>

          <div className="px-5 py-3 bg-slate-50/70 dark:bg-neutral-900/30 border-t border-slate-200 dark:border-neutral-800 flex items-center gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <Layers className="w-4 h-4 text-[#D97706]" />
              <span className="text-xs font-bold text-slate-700 dark:text-neutral-200">
                {isAr ? 'نسبة الالتزام بالسعة القياسية (≤36 بوكس)' : 'Standard Capacity Rate (≤36 boxes)'}
              </span>
            </div>

            <div className="flex-1 bg-slate-200 dark:bg-neutral-800/80 rounded-full h-2 overflow-hidden flex">
              <div
                className="bg-[#D97706] h-full transition-all"
                style={{ width: `${normalPct}%` }}
              />
              <div
                className="bg-[#E52225] h-full transition-all"
                style={{ width: `${100 - normalPct}%` }}
              />
            </div>

            <span className={`text-xs font-extrabold tabular-nums shrink-0 ${theme.accentText}`}>
              {normalPct.toFixed(1)}%
            </span>
          </div>
        </section>

        {/* Row 2: Active Records + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <section className="lg:col-span-8 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl flex flex-col justify-between overflow-hidden">
            <div>
              <div className="px-5 py-4 border-b border-slate-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isAr ? 'أحدث سجلات تسليم الباليت' : 'Recent Pallet Handover Records'}
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('archive')}
                  className={`text-xs font-semibold hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${theme.accentText}`}
                >
                  <span>{isAr ? 'عرض كل الأرشيف' : 'View full archive'}</span>
                  <DirectionalArrow className="w-3.5 h-3.5" />
                </button>
              </div>

              {filteredRecords.length === 0 ? (
                <div className="py-14 px-6 text-center space-y-2.5">
                  <div className={`w-10 h-10 rounded-xl mx-auto flex items-center justify-center ${theme.accentTint}`}>
                    <FolderArchive className="w-5 h-5" />
                  </div>
                  <div className="text-sm font-bold text-slate-800 dark:text-neutral-200">
                    {palletReports.length === 0
                      ? isAr
                        ? 'لا توجد سجلات تسليم باليت بعد'
                        : 'No pallet handover records yet'
                      : isAr
                      ? 'لا توجد نتائج مطابقة للبحث أو التاريخ المحدد'
                      : 'No records match your search or date filter'}
                  </div>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {palletReports.length === 0
                      ? isAr
                        ? 'قم باستيراد ملف Excel أو إضافة سجل يدوياً لبدء أرشفة الباليتات.'
                        : 'Import an Excel workbook or add a record manually to start archiving pallets.'
                      : isAr
                      ? 'جرّب تعديل كلمات البحث أو الفترة الزمنية.'
                      : 'Try adjusting your search keywords or date range.'}
                  </p>
                  {palletReports.length === 0 && canEdit && (
                    <button
                      type="button"
                      onClick={() => onNavigate('import')}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white rounded-lg ${theme.accentBg}`}
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>{isAr ? 'استيراد ملف Excel' : 'Import Excel File'}</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-start">
                    <thead className="bg-slate-50 dark:bg-neutral-900/70 text-slate-500 text-[11px] font-semibold border-b border-slate-100 dark:border-neutral-800">
                      <tr>
                        <th className="px-4 py-2.5 text-start">{isAr ? 'الباليت' : 'Pallet'}</th>
                        <th className="px-3 py-2.5 text-start">{isAr ? 'كود المشروع' : 'Job Code'}</th>
                        <th className="px-3 py-2.5 text-start">{isAr ? 'البوكسات' : 'Boxes'}</th>
                        <th className="px-3 py-2.5 text-start">{isAr ? 'تاريخ التسليم' : 'Date'}</th>
                        <th className="px-3 py-2.5 text-start">{isAr ? 'سلم الباليت' : 'Delivered By'}</th>
                        <th className="px-4 py-2.5 text-end">{isAr ? 'السعة' : 'Capacity'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.slice(0, 8).map(r => (
                        <tr key={r.id} className="border-b border-slate-50 dark:border-neutral-900">
                          <td className="px-4 py-2.5 font-bold text-slate-900 dark:text-white">{r.palletCode}</td>
                          <td className="px-3 py-2.5 font-mono">{r.jobCode || r.linkedBoxes}</td>
                          <td className="px-3 py-2.5 tabular-nums font-semibold">{r.boxesCount || r.boxCount}</td>
                          <td className="px-3 py-2.5 tabular-nums text-slate-500">{r.deliveryDate || r.inspectionDate}</td>
                          <td className="px-3 py-2.5 text-slate-600 dark:text-neutral-300 truncate max-w-[130px]">
                            {r.deliveredBy || r.custodian || '—'}
                          </td>
                          <td className="px-4 py-2.5 text-end">
                            {r.capacityStatus === 'over-capacity' ? (
                              <span className="inline-flex items-center gap-1 text-[#E52225] font-semibold">
                                <AlertTriangle className="w-3 h-3" />
                                {isAr ? 'تجاوز 36' : 'Over 36'}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold">
                                <CheckCircle2 className="w-3 h-3" />
                                {isAr ? 'طبيعي' : 'Normal'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between text-[11px] text-slate-500">
              <span>{theme.sectionTitle}</span>
              <span className="tabular-nums">
                {filteredRecords.length.toLocaleString()} {isAr ? 'سجل' : 'records'}
              </span>
            </div>
          </section>

          <section className="lg:col-span-4 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl flex flex-col justify-between overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-neutral-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? 'إجراءات سريعة' : 'Quick Actions'}
              </h2>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-neutral-800 flex-1 flex flex-col justify-center">
              {quickActions.map(action => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    type="button"
                    onClick={action.onClick}
                    className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-neutral-900/50 transition-colors text-start group flex-1"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${theme.accentTint}`}>
                        <Icon className="w-4 h-4" />
                      </span>
                      <span className={`text-xs font-bold text-slate-900 dark:text-white truncate transition-colors ${theme.accentGroupHoverText}`}>
                        {action.label}
                      </span>
                    </div>
                    <DirectionalArrow className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-colors ${theme.accentGroupHoverText}`} />
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Row 3: Status Donut + Recent Imports */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-4 p-5 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl flex flex-col justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'توزيع الحالات' : 'Status Distribution'}
            </h2>

            <div className="relative h-48 my-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={56} outerRadius={76} dataKey="value" stroke="none">
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  {dashboardFilteredRows.length > 0 && <Tooltip />}
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                  {normalPct.toFixed(1)}%
                </span>
                <span className="text-[10px] font-semibold text-slate-400">
                  {isAr ? 'سعة طبيعية' : 'Normal'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-neutral-800 text-center">
              {[
                { label: isAr ? 'طبيعي' : 'Normal', value: palletNormalRows, color: '#D97706' },
                { label: isAr ? 'تجاوز 36' : 'Over 36', value: palletOverCapacityRows, color: '#E52225' },
                { label: isAr ? 'الباليتات' : 'Pallets', value: filteredUniquePalletsCount, color: '#0B56A8' },
              ].map(item => (
                <div key={item.label} className="flex flex-col">
                  <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500 dark:text-neutral-400">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span className="truncate">{item.label}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                    {item.value.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl flex flex-col justify-between overflow-hidden">
            <div>
              <div className="px-5 py-4 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
                  <FileSpreadsheet className={`w-4 h-4 ${theme.accentText}`} />
                  <span>{isAr ? 'آخر عمليات الاستيراد' : 'Recent Imports'}</span>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onNavigate('import')}
                    className={`text-xs font-semibold hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${theme.accentText}`}
                  >
                    <span>{isAr ? 'رفع ملف جديد' : 'Upload File'}</span>
                    <DirectionalArrow className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-start">
                  <thead className="bg-slate-50 dark:bg-neutral-900/70 text-slate-500 text-[11px] font-semibold border-b border-slate-100 dark:border-neutral-800">
                    <tr>
                      <th className="px-5 py-2.5 text-start">{isAr ? 'الملف' : 'File Name'}</th>
                      <th className="px-3 py-2.5 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                      <th className="px-3 py-2.5 text-end">{isAr ? 'المستورد' : 'Imported'}</th>
                      <th className="px-5 py-2.5 text-end">{isAr ? 'الحالة' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentUploads.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate-400">
                          {isAr ? 'لم يتم رفع ملفات في هذا القسم بعد' : 'No uploads in this section yet'}
                        </td>
                      </tr>
                    ) : (
                      recentUploads.map(u => (
                        <tr key={u.id} className="border-b border-slate-50 dark:border-neutral-900">
                          <td className="px-5 py-2.5 font-semibold text-slate-900 dark:text-white">{u.fileName}</td>
                          <td className="px-3 py-2.5 text-slate-500 tabular-nums">
                            {u.timestamp ? new Date(u.timestamp).toLocaleDateString(isAr ? 'ar-EG' : 'en-US') : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-end font-bold tabular-nums">{u.importedCount}</td>
                          <td className="px-5 py-2.5 text-end text-emerald-600 font-semibold">{u.status}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- 2. REPORTS VIEW -------------------- */
  if (activeTab === 'reports') {
    const reportTemplates = [
      {
        id: 'summary' as const,
        label: isAr ? 'ملخص تسليم الباليتات' : 'Pallet Handover Summary',
        titleEn: 'Pallet Handover Summary Report',
      },
      {
        id: 'records' as const,
        label: isAr ? 'سجل تسليمات الباليت التفصيلي' : 'Detailed Pallet Records Log',
        titleEn: 'Pallet Handover Detailed Log',
      },
      {
        id: 'audit' as const,
        label: isAr ? 'تقرير تجاوز السعة (> 36 بوكس)' : 'Over-Capacity (>36 Boxes) Report',
        titleEn: 'Pallet Over-Capacity Audit Report',
      },
    ];

    const activeTemplate = reportTemplates.find(r => r.id === selectedReportTab) || reportTemplates[0];
    const reportQuery = reportSearch.trim().toLowerCase();

    const filteredRows = palletReports.filter(r => {
      const dt = (r.deliveryDate || r.inspectionDate || '').slice(0, 10);
      const month = r.archiveMonth || dt.slice(0, 7);
      if (reportMonthFilter !== 'all' && month !== reportMonthFilter) return false;
      if (reportDateFrom && (!dt || dt < reportDateFrom)) return false;
      if (reportDateTo && (!dt || dt > reportDateTo)) return false;
      if (selectedReportTab === 'audit' && r.capacityStatus !== 'over-capacity') return false;
      if (!reportQuery) return true;
      const text = `${r.palletCode} ${r.jobCode || r.linkedBoxes} ${r.deliveredBy || r.custodian} ${r.deliveryStatus || ''} ${dt}`.toLowerCase();
      return text.includes(reportQuery);
    });

    const summaryGroups = Array.from(
      filteredRows
        .reduce((map, r) => {
          const dt = r.deliveryDate || r.inspectionDate || '';
          const key = `${r.palletCode}|${dt}`;
          const prev = map.get(key);
          const boxes = r.boxesCount || r.boxCount || 0;
          if (!prev) {
            map.set(key, {
              palletCode: r.palletCode,
              deliveryDate: dt,
              jobs: [r.jobCode || r.linkedBoxes].filter(Boolean),
              totalBoxes: boxes,
              deliveredBy: r.deliveredBy || r.custodian || '—',
              capacityStatus: r.capacityStatus || 'normal',
            });
          } else {
            prev.totalBoxes += boxes;
            if (r.jobCode || r.linkedBoxes) prev.jobs.push(r.jobCode || r.linkedBoxes);
            const rowBy = (r.deliveredBy || r.custodian || '').trim();
            if (rowBy) {
              if (prev.deliveredBy === '—') {
                prev.deliveredBy = rowBy;
              } else if (!prev.deliveredBy.split(', ').includes(rowBy)) {
                prev.deliveredBy = `${prev.deliveredBy}, ${rowBy}`;
              }
            }
            if (prev.totalBoxes > 36) prev.capacityStatus = 'over-capacity';
          }
          return map;
        }, new Map<string, { palletCode: string; deliveryDate: string; jobs: string[]; totalBoxes: number; deliveredBy: string; capacityStatus: string }>())
        .values()
    ).sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate) || a.palletCode.localeCompare(b.palletCode));

    const totalBoxesFiltered = filteredRows.reduce((s, r) => s + (r.boxesCount || r.boxCount || 0), 0);
    const totalPalletsFiltered = new Set(filteredRows.map(r => r.palletCode).filter(Boolean)).size;

    const scopeLabel =
      reportMonthFilter === 'all'
        ? isAr
          ? 'All Months'
          : 'All Months'
        : `Month ${reportMonthFilter}`;
    const totalSummaryDisplay = `${filteredRows.length} Records · ${totalBoxesFiltered} Boxes · ${totalPalletsFiltered} Pallets`;
    const formattedPrintDate = new Date().toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const handleExportExcel = () => {
      const sheetRows =
        selectedReportTab === 'summary'
          ? summaryGroups.map((g, idx) => ({
              '#': idx + 1,
              Pallet: g.palletCode,
              'Delivery Date': g.deliveryDate || '—',
              'Job Codes': g.jobs.join(', '),
              'Total Boxes': g.totalBoxes,
              'Delivered By': g.deliveredBy,
              Capacity: g.capacityStatus === 'over-capacity' ? 'Over 36 Boxes' : 'Normal',
            }))
          : filteredRows.map((r, idx) => ({
              '#': idx + 1,
              Pallet: r.palletCode,
              'Job Code': r.jobCode || r.linkedBoxes,
              Boxes: r.boxesCount || r.boxCount || 0,
              'Delivery Date': r.deliveryDate || r.inspectionDate || '—',
              'Delivered By': r.deliveredBy || r.custodian || '—',
              'Delivery Status': r.deliveryStatus || '—',
              Capacity: r.capacityStatus === 'over-capacity' ? 'Over 36 Boxes' : 'Normal',
            }));
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Pallet Report');
      const fileName = `ARMS_Pallet_${selectedReportTab}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      XLSX.writeFile(wb, fileName);
      showToast(isAr ? 'تم تصدير تقرير Excel بنجاح.' : 'Excel report exported successfully.', 'success');
    };

    const handleExportPdf = async () => {
      if (exportingPdf) return;
      setExportingPdf(true);
      try {
        const columns =
          selectedReportTab === 'summary'
            ? [
                { key: 'pallet', label: 'Pallet', weight: 1 },
                { key: 'date', label: 'Date', weight: 1 },
                { key: 'jobs', label: 'Jobs', weight: 1.5 },
                { key: 'boxes', label: 'Boxes', weight: 0.7, align: 'center' as const },
                { key: 'by', label: 'Delivered By', weight: 1.2 },
                { key: 'status', label: 'Capacity', weight: 0.9 },
              ]
            : [
                { key: 'pallet', label: 'Pallet', weight: 1 },
                { key: 'job', label: 'Job Code', weight: 1.1 },
                { key: 'boxes', label: 'Boxes', weight: 0.7, align: 'center' as const },
                { key: 'date', label: 'Date', weight: 1 },
                { key: 'by', label: 'Delivered By', weight: 1.3 },
                { key: 'status', label: 'Capacity', weight: 1 },
              ];

        const pdfRows =
          selectedReportTab === 'summary'
            ? summaryGroups.map(g => ({
                pallet: g.palletCode,
                date: g.deliveryDate || '—',
                jobs: g.jobs.join(', ') || '—',
                boxes: g.totalBoxes,
                by: g.deliveredBy || '—',
                status: g.capacityStatus === 'over-capacity' ? 'Over 36' : 'Normal',
              }))
            : filteredRows.map(r => ({
                pallet: r.palletCode,
                job: r.jobCode || r.linkedBoxes || '—',
                boxes: r.boxesCount || r.boxCount || 0,
                date: r.deliveryDate || r.inspectionDate || '—',
                by: r.deliveredBy || r.custodian || '—',
                status: r.capacityStatus === 'over-capacity' ? 'Over 36' : 'Normal',
              }));

        const saved = await exportCommentsReportToPDF({
          reportId: selectedReportTab === 'records' ? 'branches' : selectedReportTab === 'audit' ? 'inprogress-boxes' : 'archive-summary',
          reportTitle: activeTemplate.titleEn,
          scopeLabel,
          totalSummary: totalSummaryDisplay,
          isAr: false,
          columns,
          rows: pdfRows,
          summaryItems: [
            { label: 'Records', value: String(filteredRows.length) },
            { label: 'Boxes', value: String(totalBoxesFiltered) },
            { label: 'Pallets', value: String(totalPalletsFiltered) },
          ],
          preparedBy: currentUser?.name || 'System Admin',
          printDate: formattedPrintDate,
          filePrefix: `ARMS_Pallet_${selectedReportTab}`,
        });
        showToast(isAr ? `تم حفظ التقرير: ${saved}` : `Saved PDF: ${saved}`, 'success');
      } catch {
        showToast(isAr ? 'تعذر تصدير ملف PDF.' : 'Failed exporting PDF.', 'error');
      } finally {
        setExportingPdf(false);
      }
    };

    const previewRowsCount = selectedReportTab === 'summary' ? summaryGroups.length : filteredRows.length;

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800 print:hidden">
          <div>
            <div className={`text-[11px] font-bold mb-0.5 ${theme.accentText}`}>{theme.sectionTitle}</div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <FileBarChart className={`w-6 h-6 ${theme.accentText}`} />
              <span>{theme.reportsTitle}</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={previewRowsCount === 0}
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isAr ? 'تصدير Excel' : 'Export Excel'}</span>
            </button>
            <button
              type="button"
              disabled={previewRowsCount === 0 || exportingPdf}
              onClick={() => void handleExportPdf()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap transition-colors"
            >
              <FileDown className={`w-3.5 h-3.5 ${theme.accentText}`} />
              <span>{exportingPdf ? (isAr ? 'جاري التجهيز...' : 'Exporting...') : isAr ? 'تصدير PDF (A4)' : 'Export PDF (A4)'}</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white rounded-lg transition-colors whitespace-nowrap ${theme.accentBg}`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isAr ? 'طباعة A4' : 'Print A4'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <aside className="lg:col-span-4 space-y-3 print:hidden">
            <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl p-3.5 space-y-2">
              <label
                htmlFor="pallet-report-select"
                className="block text-[11px] font-bold text-slate-500 dark:text-neutral-400"
              >
                {isAr ? 'اختيار التقرير' : 'Select Report'}
              </label>
              <select
                id="pallet-report-select"
                value={selectedReportTab}
                onChange={e => setSelectedReportTab(e.target.value as typeof selectedReportTab)}
                className={`w-full px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg text-slate-800 dark:text-neutral-100 focus:outline-none ${theme.accentBorderFocus}`}
              >
                {reportTemplates.map(tpl => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl p-3.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 dark:text-neutral-400 flex items-center gap-1.5">
                  <Filter className={`w-3.5 h-3.5 ${theme.accentText}`} />
                  <span>{isAr ? 'تصفية التقرير' : 'Filter Report'}</span>
                </span>
                {(reportMonthFilter !== 'all' || reportDateFrom || reportDateTo || reportSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setReportMonthFilter('all');
                      setReportDateFrom('');
                      setReportDateTo('');
                      setReportSearch('');
                    }}
                    className={`text-[11px] font-semibold hover:underline flex items-center gap-1 ${theme.accentText}`}
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{isAr ? 'إعادة ضبط' : 'Reset'}</span>
                  </button>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400 mb-1">
                  {isAr ? 'الشهر' : 'Month'}
                </label>
                <select
                  value={reportMonthFilter}
                  onChange={e => setReportMonthFilter(e.target.value)}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg text-slate-800 dark:text-neutral-200 focus:outline-none ${theme.accentBorderFocus}`}
                >
                  <option value="all">
                    {isAr ? `كل الشهور (${palletMonths.length})` : `All Months (${palletMonths.length})`}
                  </option>
                  {palletMonths.map(m => (
                    <option key={m} value={m}>
                      {safeMonthLabel(m, isAr)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400 mb-1">
                    {isAr ? 'من تاريخ' : 'From Date'}
                  </label>
                  <input
                    type="date"
                    value={reportDateFrom}
                    onChange={e => setReportDateFrom(e.target.value)}
                    className={`w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg tabular-nums text-slate-800 dark:text-neutral-200 focus:outline-none ${theme.accentBorderFocus}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400 mb-1">
                    {isAr ? 'إلى تاريخ' : 'To Date'}
                  </label>
                  <input
                    type="date"
                    value={reportDateTo}
                    onChange={e => setReportDateTo(e.target.value)}
                    className={`w-full px-2.5 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg tabular-nums text-slate-800 dark:text-neutral-200 focus:outline-none ${theme.accentBorderFocus}`}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400 mb-1">
                  {isAr ? 'بحث سريع' : 'Quick Search'}
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute top-1/2 -translate-y-1/2 start-3 pointer-events-none" />
                  <input
                    type="text"
                    value={reportSearch}
                    onChange={e => setReportSearch(e.target.value)}
                    placeholder={isAr ? 'باليت، كود مشروع، سلم الباليت...' : 'Pallet, job code, delivered by...'}
                    className={`w-full ps-8 pe-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg text-slate-800 dark:text-neutral-200 focus:outline-none ${theme.accentBorderFocus}`}
                  />
                </div>
              </div>
            </div>
          </aside>

          <div className="lg:col-span-8 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-neutral-800 print:hidden">
              <h2 className="text-sm font-bold text-slate-800 dark:text-white">{activeTemplate.label}</h2>
              <span className="text-xs text-slate-400 tabular-nums">
                {previewRowsCount} {isAr ? 'صف' : 'rows'}
              </span>
            </div>

            <div className="bg-slate-100/80 dark:bg-black border border-slate-200/80 dark:border-neutral-800 rounded-xl p-3 sm:p-5 print:border-0 print:p-0 print:bg-white">
              <div
                dir="ltr"
                className="bg-white text-slate-900 border border-slate-300 rounded-lg overflow-hidden shadow-md mx-auto max-w-[794px] p-5 sm:p-6 space-y-3.5 print:border-0 print:shadow-none"
              >
                <div className="flex items-center justify-between gap-4 pb-1">
                  <img src={logoColor} alt="Intercom" className="h-7 sm:h-8 w-auto object-contain" />
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight text-center min-w-0 leading-snug">
                    {activeTemplate.titleEn}
                  </h3>
                  <img src={armsLogoLight} alt="ARMS" className="h-7 sm:h-9 w-auto object-contain" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-[12px] bg-slate-50 border border-slate-200 rounded-md px-3.5 py-2.5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-600 shrink-0">Scope :</span>
                      <span className="font-semibold text-slate-900">{scopeLabel}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-600 shrink-0">Total :</span>
                      <span className="font-semibold text-slate-900 tabular-nums">{totalSummaryDisplay}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-600 shrink-0">Print Date :</span>
                      <span className="text-slate-900 tabular-nums">{formattedPrintDate}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-600 shrink-0">Prepared By :</span>
                      <span className="font-semibold text-slate-900 truncate">
                        {currentUser?.name || 'System Admin'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="border-b-2 border-slate-700" />

                {selectedReportTab === 'summary' ? (
                  <table className="w-full border-collapse text-[12px] text-left">
                    <thead>
                      <tr className="bg-[#D9D9D9] text-slate-900 font-bold">
                        <th className="border border-slate-400 px-2 py-1.5 w-9 text-center">#</th>
                        <th className="border border-slate-400 px-2.5 py-1.5">Pallet</th>
                        <th className="border border-slate-400 px-2.5 py-1.5">Delivery Date</th>
                        <th className="border border-slate-400 px-2.5 py-1.5">Jobs</th>
                        <th className="border border-slate-400 px-2.5 py-1.5 text-center">Boxes</th>
                        <th className="border border-slate-400 px-2.5 py-1.5">Delivered By</th>
                        <th className="border border-slate-400 px-2.5 py-1.5">Capacity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summaryGroups.length > 0 ? (
                        summaryGroups.slice(0, 60).map((g, idx) => (
                          <tr key={`${g.palletCode}-${g.deliveryDate}-${idx}`}>
                            <td className="border border-slate-300 px-2 py-1.5 text-center tabular-nums">{idx + 1}</td>
                            <td className="border border-slate-300 px-2.5 py-1.5 font-bold">{g.palletCode}</td>
                            <td className="border border-slate-300 px-2.5 py-1.5 tabular-nums">{g.deliveryDate || '—'}</td>
                            <td className="border border-slate-300 px-2.5 py-1.5 font-mono text-[11px]">{g.jobs.join(', ')}</td>
                            <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums font-semibold">
                              {g.totalBoxes}
                            </td>
                            <td className="border border-slate-300 px-2.5 py-1.5">{g.deliveredBy || '—'}</td>
                            <td className="border border-slate-300 px-2.5 py-1.5">
                              {g.capacityStatus === 'over-capacity' ? 'Over 36' : 'Normal'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="border border-slate-300 py-10 text-center text-slate-500">
                            No matching pallet records
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                ) : (
                  <table className="w-full border-collapse text-[12px] text-left">
                    <thead>
                      <tr className="bg-[#D9D9D9] text-slate-900 font-bold">
                        <th className="border border-slate-400 px-2 py-1.5 w-9 text-center">#</th>
                        <th className="border border-slate-400 px-2.5 py-1.5">Pallet</th>
                        <th className="border border-slate-400 px-2.5 py-1.5">Job Code</th>
                        <th className="border border-slate-400 px-2.5 py-1.5 text-center">Boxes</th>
                        <th className="border border-slate-400 px-2.5 py-1.5">Date</th>
                        <th className="border border-slate-400 px-2.5 py-1.5">Delivered By</th>
                        <th className="border border-slate-400 px-2.5 py-1.5">Capacity</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.length > 0 ? (
                        filteredRows.slice(0, 60).map((r, idx) => (
                          <tr key={r.id}>
                            <td className="border border-slate-300 px-2 py-1.5 text-center tabular-nums">{idx + 1}</td>
                            <td className="border border-slate-300 px-2.5 py-1.5 font-bold">{r.palletCode}</td>
                            <td className="border border-slate-300 px-2.5 py-1.5 font-mono">{r.jobCode || r.linkedBoxes}</td>
                            <td className="border border-slate-300 px-2.5 py-1.5 text-center tabular-nums font-semibold">
                              {r.boxesCount || r.boxCount}
                            </td>
                            <td className="border border-slate-300 px-2.5 py-1.5 tabular-nums">
                              {r.deliveryDate || r.inspectionDate || '—'}
                            </td>
                            <td className="border border-slate-300 px-2.5 py-1.5">{r.deliveredBy || r.custodian || '—'}</td>
                            <td className="border border-slate-300 px-2.5 py-1.5">
                              {r.capacityStatus === 'over-capacity' ? 'Over 36' : 'Normal'}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="border border-slate-300 py-10 text-center text-slate-500">
                            No matching pallet records
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}

                <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Intercom ARMS · Pallet Handover</span>
                  <span className="tabular-nums">
                    Showing {Math.min(60, previewRowsCount)} of {previewRowsCount}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- 3. LABELS VIEW -------------------- */
  const handleDownloadLabelPdf = async () => {
    if (generatingLabelPdf) return;
    setGeneratingLabelPdf(true);
    try {
      const pdf = await generateLabelsPDF([activeLabelData]);
      const savedName = `ARMS_Pallet_${activeLabelData.boxCode}_Label.pdf`;
      pdf.save(savedName);
      showToast(isAr ? `تم تحميل الليبل: ${savedName}` : `Downloaded label PDF: ${savedName}`, 'success');
    } catch {
      showToast(isAr ? 'تعذر إنشاء ملف PDF لليبل.' : 'Failed generating label PDF.', 'error');
    } finally {
      setGeneratingLabelPdf(false);
    }
  };

  const handleDownloadAllDossiersPdf = async () => {
    if (generatingLabelPdf || palletDossiers.length === 0) return;
    setGeneratingLabelPdf(true);
    try {
      const allLabels: LabelData[] = palletDossiers.map(d => ({
        type: 'box',
        boxCode: d.dossierCode,
        subtitle: 'PALLET DOSSIER',
        fromJobId: d.dossierNumber,
        toJobId: d.dossierNumber,
        fromLabel: d.minDate ? formatShortLabelDate(d.minDate) : '—',
        toLabel: d.maxDate ? formatShortLabelDate(d.maxDate) : '—',
      }));
      const pdf = await generateLabelsPDF(allLabels);
      const savedName = `ARMS_Pallet_Dossiers_P1_to_P${palletDossiers.length}.pdf`;
      pdf.save(savedName);
      showToast(
        isAr ? `تم تحميل ${allLabels.length} ليبل: ${savedName}` : `Downloaded ${allLabels.length} labels: ${savedName}`,
        'success'
      );
    } catch {
      showToast(isAr ? 'تعذر إنشاء ملف PDF لليبلات.' : 'Failed generating labels PDF.', 'error');
    } finally {
      setGeneratingLabelPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800 print:hidden">
        <div>
          <div className={`text-[11px] font-bold mb-0.5 ${theme.accentText}`}>{theme.sectionTitle}</div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Printer className={`w-6 h-6 ${theme.accentText}`} />
            <span>{theme.labelsTitle}</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {palletDossiers.length > 1 && (
            <button
              type="button"
              disabled={generatingLabelPdf}
              onClick={() => void handleDownloadAllDossiersPdf()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#B45309] dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/70 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>
                {isAr
                  ? `تحميل كل الدوسيهات (${palletDossiers.length})`
                  : `Export All Dossiers (${palletDossiers.length})`}
              </span>
            </button>
          )}
          <button
            type="button"
            disabled={generatingLabelPdf}
            onClick={() => void handleDownloadLabelPdf()}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-900 rounded-lg transition-colors whitespace-nowrap disabled:opacity-50"
          >
            <FileDown className={`w-3.5 h-3.5 ${theme.accentText}`} />
            <span>
              {generatingLabelPdf
                ? isAr
                  ? 'جاري الإنشاء...'
                  : 'Generating...'
                : isAr
                ? 'تحميل PDF (100×50mm)'
                : 'Export PDF (100×50mm)'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors whitespace-nowrap ${theme.accentBg}`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{isAr ? 'طباعة' : 'Print'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl p-4 space-y-4 print:hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'إعدادات ليبل الدوسيه' : 'Dossier Label Setup'}
            </h2>
            {palletDossiers.length > 0 && (
              <div className="flex rounded-lg bg-slate-100 dark:bg-neutral-900 p-0.5 text-[11px] font-semibold">
                <button
                  type="button"
                  onClick={() => setLabelMode('dossier')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    labelMode === 'dossier'
                      ? `${theme.accentBgSolid} text-white`
                      : 'text-slate-600 dark:text-neutral-400'
                  }`}
                >
                  {isAr ? 'الدوسيهات' : 'Dossiers'}
                </button>
                <button
                  type="button"
                  onClick={() => setLabelMode('manual')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    labelMode === 'manual'
                      ? `${theme.accentBgSolid} text-white`
                      : 'text-slate-600 dark:text-neutral-400'
                  }`}
                >
                  {isAr ? 'يدوي' : 'Manual'}
                </button>
              </div>
            )}
          </div>

          {labelMode === 'dossier' && palletDossiers.length > 0 ? (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-neutral-400 mb-1">
                  {isAr ? 'اختر الدوسيه الشهري' : 'Select Monthly Dossier'}
                </label>
                <select
                  value={selectedDossierCode}
                  onChange={e => setSelectedDossierCode(e.target.value)}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-1 ${theme.accentBorderFocus}`}
                >
                  {palletDossiers.map(d => (
                    <option key={d.dossierCode} value={d.dossierCode}>
                      {d.dossierCode} · {safeMonthLabel(d.monthKey, isAr)} (
                      {d.minDate ? formatShortLabelDate(d.minDate) : '—'} →{' '}
                      {d.maxDate ? formatShortLabelDate(d.maxDate) : '—'})
                    </option>
                  ))}
                </select>
              </div>
              {(() => {
                const chosen = palletDossiers.find(d => d.dossierCode === selectedDossierCode) || palletDossiers[0];
                return (
                  <div className="rounded-lg bg-slate-50 dark:bg-neutral-900/70 border border-slate-200 dark:border-neutral-800 p-3 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-500">{isAr ? 'رقم الدوسيه:' : 'Dossier Code:'}</span>
                      <span className="font-mono font-extrabold text-[#B45309] dark:text-amber-400">
                        {chosen.dossierCode}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{isAr ? 'الشهر:' : 'Month:'}</span>
                      <span className="font-bold">{safeMonthLabel(chosen.monthKey, isAr)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">FROM:</span>
                      <span className="font-mono font-semibold">
                        {chosen.minDate ? formatShortLabelDate(chosen.minDate) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">TO:</span>
                      <span className="font-mono font-semibold">
                        {chosen.maxDate ? formatShortLabelDate(chosen.maxDate) : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200/70 dark:border-neutral-800">
                      <span className="text-slate-500">{isAr ? 'السجلات / الباليتات:' : 'Records / Pallets:'}</span>
                      <span className="font-bold tabular-nums">
                        {chosen.rows.length.toLocaleString()} · {chosen.palletsCount.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">{isAr ? 'إجمالي البوكسات:' : 'Total Boxes:'}</span>
                      <span className="font-bold tabular-nums">{chosen.totalBoxes.toLocaleString()}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-neutral-400 mb-1">
                  {isAr ? 'رقم الدوسيه' : 'Dossier Code'}
                </label>
                <input
                  type="text"
                  value={manualLabelCode}
                  onChange={e => setManualLabelCode(e.target.value)}
                  placeholder="P1"
                  className={`w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-1 ${theme.accentBorderFocus}`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-neutral-400 mb-1">
                    FROM ({isAr ? 'من تاريخ' : 'Start Date'})
                  </label>
                  <input
                    type="text"
                    value={manualFromLabel}
                    onChange={e => setManualFromLabel(e.target.value)}
                    placeholder="01/01/26"
                    className={`w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-1 ${theme.accentBorderFocus}`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-neutral-400 mb-1">
                    TO ({isAr ? 'إلى تاريخ' : 'End Date'})
                  </label>
                  <input
                    type="text"
                    value={manualToLabel}
                    onChange={e => setManualToLabel(e.target.value)}
                    placeholder="31/01/26"
                    className={`w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-1 ${theme.accentBorderFocus}`}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-8 bg-slate-100/80 dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl p-6 sm:p-10 flex items-center justify-center">
          <LabelCanvasPreview data={activeLabelData} responsive />
        </div>
      </div>

      {typeof document !== 'undefined' &&
        createPortal(
          <div className="hidden print:block fixed inset-0 bg-white z-[9999]">
            <div className="w-[100mm] h-[50mm]">
              <LabelVectorSvg
                data={activeLabelData}
                qrSrc={qrDataUrl}
                intercomLogoSrc={logos.intercomSrc}
                armsLogoSrc={logos.armsSrc}
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
