import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  Edit2,
  Eye,
  FileBarChart,
  FileDown,
  FileSpreadsheet,
  Filter,
  FolderArchive,
  Hash,
  History,
  Layers,
  MapPin,
  Package,
  Printer,
  RotateCcw,
  Search,
  AlertTriangle,
  X,
  CheckSquare,
  Trash2,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useArchive } from '../../context/ArchiveContext';
import { ActiveTab } from '../navigation/TopNav';
import { GlobalSearch } from '../navigation/GlobalSearch';
import { MinutesPlanImport } from './MinutesPlanImport';
import { Box, Dossier, Project, ProjectStatus } from '../../types';
import { LabelsView } from '../labels/LabelsView';
import { weekEndOf, weekStartOf } from '../../utils/minutesPlan';
import {
  CommentsBoxDistributionItem,
  CommentsReportColumn,
  exportCommentsReportToPDF,
} from '../../utils/reportExporter';
import { DeleteUploadModal } from '../common/DeleteUploadModal';
import logoColor from '../../assets/logo.png';
import armsLogoLight from '../../assets/arms-logo.png';

interface MinutesArchiveViewsProps {
  activeTab: ActiveTab;
  selectedBoxId: string;
  selectedDossierId: string;
  projectsFilter: string;
  labelInitialBoxCode: string;
  onNavigate: (tab: ActiveTab, param?: string) => void;
  onSelectBox: (boxId: string) => void;
  onSelectDossier: (dossierId: string) => void;
}

const fmtDate = (iso?: string | null) => {
  if (!iso) return '—';
  const clean = iso.slice(0, 10);
  const parts = clean.split('-');
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : clean;
};

export const MinutesArchiveViews: React.FC<MinutesArchiveViewsProps> = ({
  activeTab,
  selectedBoxId,
  selectedDossierId,
  projectsFilter,
  labelInitialBoxCode,
  onNavigate,
  onSelectBox,
  onSelectDossier,
}) => {
  const {
    minutesArchive,
    currentUser,
    language,
    updateProjectStatus,
    bulkUpdateProjectStatus,
    updateBoxesStatus,
    updateDossiersStatus,
    showToast,
  } = useArchive();

  const isAr = language === 'ar';
  const DirectionalArrow = isAr ? ArrowLeft : ArrowRight;
  const isSystemAdmin = currentUser.role === 'System Admin';
  const canEdit = ['System Admin', 'Archive Manager', 'Data Entry'].includes(currentUser.role);

  const { boxes, dossiers, projects, uploadHistory } = minutesArchive;

  const boxNumberOf = (code: string) => parseInt(code.replace(/\D+/g, ''), 10) || 0;
  const sortedBoxes = useMemo(
    () => [...boxes].sort((a, b) => boxNumberOf(a.boxCode) - boxNumberOf(b.boxCode) || a.boxCode.localeCompare(b.boxCode)),
    [boxes]
  );
  const sortedDossiers = useMemo(
    () =>
      [...dossiers].sort(
        (a, b) =>
          boxNumberOf(a.boxId) - boxNumberOf(b.boxId) ||
          a.dossierNumber - b.dossierNumber ||
          (a.weekStart || '').localeCompare(b.weekStart || '')
      ),
    [dossiers]
  );

  // Count shipments per normalized branch name so repeating branch names are clearly badged
  const branchRepeatCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of projects) {
      const key = (p.branchName || '').trim();
      if (!key) continue;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }, [projects]);

  const uniqueRegions = useMemo(() => {
    const set = new Set<string>();
    for (const p of projects) {
      const r = (p.region || '').trim();
      if (r) set.add(r);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ar'));
  }, [projects]);

  // Shared UI & filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [boxFilter, setBoxFilter] = useState<string>('all');
  const [dossierFilter, setDossierFilter] = useState<string>('all');
  const [regionFilter, setRegionFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [boxStatusFilter, setBoxStatusFilter] = useState<'all' | 'Inprogress' | 'Archived'>('all');
  const [dossierStatusFilter, setDossierStatusFilter] = useState<'all' | 'Pending' | 'Inprogress' | 'Archived'>('all');
  const [archiveSubTab, setArchiveSubTab] = useState<'boxes' | 'dossiers' | 'branches'>('boxes');

  // Boxes page selection & modal
  const [selectedBoxCodes, setSelectedBoxCodes] = useState<string[]>([]);
  const [boxBulkNote, setBoxBulkNote] = useState('');
  const [editingBox, setEditingBox] = useState<Box | null>(null);
  const [editBoxStatus, setEditBoxStatus] = useState<ProjectStatus>('Archived');
  const [editBoxNote, setEditBoxNote] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [targetUploadId, setTargetUploadId] = useState<string | null>(null);

  // Dossiers selection & modal
  const [selectedDossierIds, setSelectedDossierIds] = useState<string[]>([]);
  const [dossierBulkNote, setDossierBulkNote] = useState('');
  const [editingDossier, setEditingDossier] = useState<Dossier | null>(null);
  const [editDossierStatus, setEditDossierStatus] = useState<ProjectStatus>('Archived');
  const [editDossierNote, setEditDossierNote] = useState('');

  // Branches page selection & modals
  const [selectedJobIds, setSelectedJobIds] = useState<number[]>([]);
  const [bulkNote, setBulkNote] = useState('');
  const [detailBranch, setDetailBranch] = useState<Project | null>(null);
  const [detailStatus, setDetailStatus] = useState<ProjectStatus>('Archived');
  const [detailNote, setDetailNote] = useState('');
  const [editingBranch, setEditingBranch] = useState<Project | null>(null);
  const [editStatus, setEditStatus] = useState<ProjectStatus>('Archived');
  const [editNote, setEditNote] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  // Reports state
  const [selectedReportTab, setSelectedReportTab] = useState<
    | 'branches'
    | 'archived-boxes'
    | 'inprogress-boxes'
    | 'dossiers'
    | 'box-details'
    | 'distribution'
    | 'archive-summary'
  >('branches');
  const [reportBoxFilter, setReportBoxFilter] = useState<string>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);

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
    setCurrentPage(1);
  };

  const resetAllFilters = () => {
    setSearchTerm('');
    setDateFrom('');
    setDateTo('');
    setBoxFilter('all');
    setDossierFilter('all');
    setRegionFilter('all');
    setStatusFilter('all');
    setBoxStatusFilter('all');
    setDossierStatusFilter('all');
    setCurrentPage(1);
  };

  const matchesDateRange = (isoDate?: string | null) => {
    if (!dateFrom && !dateTo) return true;
    const clean = (isoDate || '').slice(0, 10);
    if (!clean) return false;
    if (dateFrom && clean < dateFrom) return false;
    if (dateTo && clean > dateTo) return false;
    return true;
  };

  const dossierOverlapsDateRange = (d: Dossier) => {
    if (!dateFrom && !dateTo) return true;
    const start = (d.weekStart || '').slice(0, 10);
    const end = (d.weekEnd || start).slice(0, 10);
    if (!start) return false;
    if (dateFrom && end < dateFrom) return false;
    if (dateTo && start > dateTo) return false;
    return true;
  };

  useEffect(() => {
    if (projectsFilter && projectsFilter.startsWith('box:')) {
      setBoxFilter(projectsFilter.slice(4));
      setDossierFilter('all');
      setRegionFilter('all');
      setStatusFilter('all');
      setDateFrom('');
      setDateTo('');
      setSearchTerm('');
      setCurrentPage(1);
    } else if (projectsFilter && ['Archived', 'Missing', 'Pending'].includes(projectsFilter)) {
      setStatusFilter(projectsFilter as ProjectStatus);
      setBoxFilter('all');
      setDossierFilter('all');
      setRegionFilter('all');
      setDateFrom('');
      setDateTo('');
      setSearchTerm('');
      setCurrentPage(1);
    } else if (projectsFilter) {
      setSearchTerm(projectsFilter);
      setStatusFilter('all');
      setBoxFilter('all');
      setDossierFilter('all');
      setRegionFilter('all');
      setDateFrom('');
      setDateTo('');
      setCurrentPage(1);
    }
  }, [projectsFilter]);

  useEffect(() => {
    setSelectedJobIds([]);
    setSelectedBoxCodes([]);
    setSelectedDossierIds([]);
    setCurrentPage(1);
  }, [activeTab, selectedBoxId, selectedDossierId]);

  // Keep detail modal synced with latest project status after updates
  const activeDetailBranch = useMemo(
    () => (detailBranch ? projects.find(p => p.jobId === detailBranch.jobId) || detailBranch : null),
    [detailBranch, projects]
  );

  const openBranchDetail = (p: Project) => {
    setDetailBranch(p);
    setDetailStatus(p.status);
    setDetailNote('');
  };

  const statusBadge = (status: string) => {
    if (status === 'Archived') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-900">
          <CheckCircle2 className="w-3 h-3" />
          <span>{isAr ? 'مؤرشف' : 'Archived'}</span>
        </span>
      );
    }
    if (status === 'Missing') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-red-50 text-[#E52225] dark:bg-red-950/50 dark:text-red-300 border border-red-200/70 dark:border-red-900">
          <AlertTriangle className="w-3 h-3" />
          <span>{isAr ? 'مفقود' : 'Missing'}</span>
        </span>
      );
    }
    if (status === 'Inprogress') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-[#B45309] dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200/70 dark:border-amber-900">
          <Clock className="w-3 h-3" />
          <span>{isAr ? 'جاري الأرشفة' : 'In Progress'}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600 dark:bg-neutral-800 dark:text-neutral-300 border border-slate-200 dark:border-neutral-700">
        <Clock className="w-3 h-3" />
        <span>{isAr ? 'قيد الانتظار' : 'Pending'}</span>
      </span>
    );
  };

  // Date & status filter card matching the clean reference layout
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

  const renderDateStatusFilterCard = (
    mode: 'dashboard' | 'boxes' | 'dossiers' | 'branches',
    matchedCount: number
  ) => {
    const hasActiveDate = Boolean(dateFrom || dateTo);
    const activeBoxChoices = sortedBoxes;
    const activeDossierChoices = sortedDossiers.filter(d => boxFilter === 'all' || d.boxId === boxFilter);

    return (
      <section className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs">
        {/* Card Header + Active Range Pill */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#E52225] dark:text-red-400 flex items-center justify-center shrink-0">
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
            {hasActiveDate && (
              <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-red-50 dark:bg-red-950/40 text-[#E52225] dark:text-red-300 border border-red-200/70 dark:border-red-900 tabular-nums">
                {dateFrom ? fmtDate(dateFrom) : '...'} → {dateTo ? fmtDate(dateTo) : '...'}
              </span>
            )}
            <span className="text-[11px] font-semibold text-slate-500 dark:text-neutral-400 tabular-nums">
              {isAr ? `${matchedCount.toLocaleString()} نتيجة` : `${matchedCount.toLocaleString()} results`}
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
                    ? 'bg-[#E52225] border-[#E52225] text-white shadow-xs'
                    : 'bg-slate-50 dark:bg-neutral-900 border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-300 hover:border-[#E52225]/50'
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
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-neutral-800 text-xs font-semibold text-slate-600 dark:text-neutral-300 hover:border-[#E52225] hover:text-[#E52225] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>{isAr ? 'إعادة ضبط' : 'Reset'}</span>
          </button>
        </div>

        {/* Inputs Row: Search (when list view) + Date From + Date To + Status */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end">
          {mode !== 'dashboard' && (
            <div className="lg:col-span-4 space-y-1">
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400">
                {isAr ? 'بحث نصي' : 'Keyword Search'}
              </label>
              <div className="relative">
                <Search className="absolute start-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder={
                    mode === 'boxes'
                      ? isAr
                        ? 'كود البوكس (C13)، اسم فرع، إرسالية...'
                        : 'Box (C13), branch, shipment...'
                      : mode === 'dossiers'
                      ? isAr
                        ? 'رقم الدوسيه (C13-1)، أسبوع، شهر، فرع...'
                        : 'Dossier (C13-1), period, branch...'
                      : isAr
                      ? 'اسم الفرع، رقم الإرسالية، كود...'
                      : 'Branch name, shipment no., code...'
                  }
                  value={searchTerm}
                  onChange={e => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full ps-9 pe-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:border-[#E52225]"
                />
              </div>
            </div>
          )}

          <div className={`${mode === 'dashboard' ? 'lg:col-span-4' : 'lg:col-span-3'} space-y-1`}>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400">
              {isAr ? 'من تاريخ' : 'From Date'}
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => {
                setDateFrom(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl tabular-nums focus:outline-none focus:border-[#E52225]"
            />
          </div>

          <div className={`${mode === 'dashboard' ? 'lg:col-span-4' : 'lg:col-span-3'} space-y-1`}>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400">
              {isAr ? 'إلى تاريخ' : 'To Date'}
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={e => {
                setDateTo(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl tabular-nums focus:outline-none focus:border-[#E52225]"
            />
          </div>

          <div className={`${mode === 'dashboard' ? 'lg:col-span-4' : 'lg:col-span-2'} space-y-1`}>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400">
              {isAr ? 'الحالة' : 'Status'}
            </label>
            {mode === 'boxes' ? (
              <select
                value={boxStatusFilter}
                onChange={e => setBoxStatusFilter(e.target.value as 'all' | 'Inprogress' | 'Archived')}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl font-semibold focus:outline-none focus:border-[#E52225]"
              >
                <option value="all">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
                <option value="Inprogress">{isAr ? 'جاري الأرشفة' : 'In Progress'}</option>
                <option value="Archived">{isAr ? 'مكتمل (مؤرشف)' : 'Archived'}</option>
              </select>
            ) : mode === 'dossiers' ? (
              <select
                value={dossierStatusFilter}
                onChange={e =>
                  setDossierStatusFilter(e.target.value as 'all' | 'Pending' | 'Inprogress' | 'Archived')
                }
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl font-semibold focus:outline-none focus:border-[#E52225]"
              >
                <option value="all">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
                <option value="Inprogress">{isAr ? 'جاري الأرشفة' : 'In Progress'}</option>
                <option value="Archived">{isAr ? 'مكتمل' : 'Archived'}</option>
                <option value="Pending">{isAr ? 'قيد الانتظار' : 'Pending'}</option>
              </select>
            ) : (
              <select
                value={statusFilter}
                onChange={e => {
                  setStatusFilter(e.target.value as 'all' | ProjectStatus);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-xl font-semibold focus:outline-none focus:border-[#E52225]"
              >
                <option value="all">{isAr ? 'كل الحالات' : 'All Statuses'}</option>
                <option value="Archived">{isAr ? 'مؤرشف (Archived)' : 'Archived'}</option>
                <option value="Pending">{isAr ? 'قيد الانتظار (Pending)' : 'Pending'}</option>
                <option value="Missing">{isAr ? 'مفقود (Missing)' : 'Missing'}</option>
              </select>
            )}
          </div>
        </div>

        {/* Optional Box / Dossier selectors for Dossiers & Branches views */}
        {(mode === 'dossiers' || mode === 'branches') && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <select
              value={boxFilter}
              onChange={e => {
                setBoxFilter(e.target.value);
                setDossierFilter('all');
                setCurrentPage(1);
              }}
              className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#E52225]"
            >
              <option value="all">{isAr ? 'كل البوكسات' : 'All Boxes'}</option>
              {activeBoxChoices.map(b => (
                <option key={b.id} value={b.boxCode}>
                  {isAr ? `بوكس ${b.boxCode}` : `Box ${b.boxCode}`}
                </option>
              ))}
            </select>

            {mode === 'branches' && (
              <>
                <select
                  value={dossierFilter}
                  onChange={e => {
                    setDossierFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#E52225]"
                >
                  <option value="all">{isAr ? 'كل الدوسيهات' : 'All Dossiers'}</option>
                  {activeDossierChoices.map(d => (
                    <option key={d.id} value={d.id}>
                      {d.id} ({fmtDate(d.weekStart)})
                    </option>
                  ))}
                </select>

                {uniqueRegions.length > 0 && (
                  <select
                    value={regionFilter}
                    onChange={e => {
                      setRegionFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-3 py-1.5 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#E52225]"
                  >
                    <option value="all">{isAr ? 'كل المناطق' : 'All Regions'}</option>
                    {uniqueRegions.map(reg => (
                      <option key={reg} value={reg}>
                        {reg}
                      </option>
                    ))}
                  </select>
                )}
              </>
            )}
          </div>
        )}

        {/* Full-width Search/Apply Button on Dashboard (matching reference screenshot) */}
        {mode === 'dashboard' && (
          <button
            type="button"
            onClick={() => onNavigate('projects')}
            className="w-full py-2.5 px-4 rounded-xl bg-[#E52225] hover:bg-[#C81D20] text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-xs"
          >
            <Search className="w-4 h-4" />
            <span>
              {isAr
                ? `عرض الفروع المطابقة في صفحة الأرشيف (${matchedCount.toLocaleString()})`
                : `View Matching Branches (${matchedCount.toLocaleString()})`}
            </span>
          </button>
        )}
      </section>
    );
  };

  // Totals (unfiltered for global summary)

  const toggleSelectId = (jobId: number) => {
    setSelectedJobIds(prev => (prev.includes(jobId) ? prev.filter(id => id !== jobId) : [...prev, jobId]));
  };

  const handleBulkStatus = (status: ProjectStatus) => {
    if (!canEdit || selectedJobIds.length === 0) return;
    bulkUpdateProjectStatus(selectedJobIds, status, bulkNote.trim() || undefined);
    setSelectedJobIds([]);
    setBulkNote('');
  };

  const handleSaveSingleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBranch || !canEdit) return;
    updateProjectStatus(editingBranch.jobId, editStatus, editNote.trim() || undefined);
    setEditingBranch(null);
    setEditNote('');
  };

  const handleSaveDetailStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDetailBranch || !canEdit) return;
    updateProjectStatus(activeDetailBranch.jobId, detailStatus, detailNote.trim() || undefined);
    setDetailNote('');
  };

  const toggleSelectBox = (boxCode: string) => {
    setSelectedBoxCodes(prev => (prev.includes(boxCode) ? prev.filter(c => c !== boxCode) : [...prev, boxCode]));
  };

  const handleBulkBoxesStatus = (status: ProjectStatus) => {
    if (!canEdit || selectedBoxCodes.length === 0) return;
    updateBoxesStatus(selectedBoxCodes, status, boxBulkNote.trim() || undefined);
    setSelectedBoxCodes([]);
    setBoxBulkNote('');
  };

  const openBoxStatusModal = (b: Box) => {
    setEditingBox(b);
    setEditBoxStatus(
      b.status === 'Archived'
        ? 'Archived'
        : b.missingProjects > 0 && b.archivedProjects === 0
        ? 'Missing'
        : b.pendingProjects === b.totalProjects && b.totalProjects > 0
        ? 'Pending'
        : 'Archived'
    );
    setEditBoxNote('');
  };

  const handleSaveSingleBoxStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBox || !canEdit) return;
    updateBoxesStatus([editingBox.boxCode], editBoxStatus, editBoxNote.trim() || undefined);
    setEditingBox(null);
    setEditBoxNote('');
  };

  const renderBoxStatusModal = () =>
    editingBox ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Archive className="w-4 h-4 text-[#E52225]" />
              <span>{isAr ? `تحديث حالة البوكس ${editingBox.boxCode}` : `Update Box ${editingBox.boxCode} Status`}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {isAr
                ? `سيتم تطبيق الحالة الجديدة على البوكس بالكامل (${editingBox.totalProjects} فرع / إرسالية).`
                : `Applies to the entire box (${editingBox.totalProjects} branch shipments).`}
            </p>
          </div>

          <form onSubmit={handleSaveSingleBoxStatus} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                {isAr ? 'اختر الحالة الجديدة للبوكس' : 'Select New Box Status'}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['Archived', 'Pending', 'Missing'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEditBoxStatus(s)}
                    className={`py-2 px-1.5 text-xs font-bold rounded-lg border transition-colors ${
                      editBoxStatus === s
                        ? s === 'Archived'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : s === 'Pending'
                          ? 'border-slate-700 bg-slate-700 text-white'
                          : 'border-[#E52225] bg-[#E52225] text-white'
                        : 'border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-900'
                    }`}
                  >
                    {s === 'Archived'
                      ? isAr
                        ? 'مؤرشف'
                        : 'Archived'
                      : s === 'Pending'
                      ? isAr
                        ? 'انتظار'
                        : 'Pending'
                      : isAr
                      ? 'مفقود'
                      : 'Missing'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                {isAr ? 'ملاحظة التحديث (اختياري)' : 'Update Note (optional)'}
              </label>
              <input
                type="text"
                placeholder={isAr ? 'مثال: تم أرشفة البوكس بالكامل...' : 'Optional update note...'}
                value={editBoxNote}
                onChange={e => setEditBoxNote(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#E52225]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingBox(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white rounded-lg"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg">
                {isAr ? 'تطبيق على البوكس' : 'Apply to Box'}
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null;

  const toggleSelectDossier = (dossierId: string) => {
    setSelectedDossierIds(prev => (prev.includes(dossierId) ? prev.filter(id => id !== dossierId) : [...prev, dossierId]));
  };

  const handleBulkDossiersStatus = (status: ProjectStatus) => {
    if (!canEdit || selectedDossierIds.length === 0) return;
    updateDossiersStatus(selectedDossierIds, status, dossierBulkNote.trim() || undefined);
    setSelectedDossierIds([]);
    setDossierBulkNote('');
  };

  const openDossierStatusModal = (d: Dossier) => {
    setEditingDossier(d);
    setEditDossierStatus(
      d.status === 'Archived'
        ? 'Archived'
        : d.missingCount > 0 && d.archivedCount === 0
        ? 'Missing'
        : d.pendingCount === d.totalProjects && d.totalProjects > 0
        ? 'Pending'
        : 'Archived'
    );
    setEditDossierNote('');
  };

  const handleSaveSingleDossierStatus = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDossier || !canEdit) return;
    updateDossiersStatus([editingDossier.id], editDossierStatus, editDossierNote.trim() || undefined);
    setEditingDossier(null);
    setEditDossierNote('');
  };

  const renderDossierBulkBar = (visibleDossiers: Dossier[]) => {
    if (!canEdit || selectedDossierIds.length === 0) return null;
    const visibleIds = new Set(visibleDossiers.map(d => d.id));
    const selectedVisibleCount = visibleDossiers.filter(d => selectedDossierIds.includes(d.id)).length;
    const selectedBranchTotal = dossiers
      .filter(d => selectedDossierIds.includes(d.id))
      .reduce((sum, d) => sum + d.totalProjects, 0);

    return (
      <div className="bg-red-50/90 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-extrabold text-[#E52225] dark:text-red-300">
            {isAr
              ? `تم تحديد ${selectedDossierIds.length} دوسيه (${selectedBranchTotal} فرع)`
              : `${selectedDossierIds.length} dossier(s) selected (${selectedBranchTotal} branches)`}
          </span>
          {visibleDossiers.length > 0 && selectedVisibleCount < visibleDossiers.length && (
            <button
              type="button"
              onClick={() => setSelectedDossierIds(prev => Array.from(new Set([...prev, ...visibleIds])))}
              className="text-[11px] font-semibold underline text-slate-700 dark:text-neutral-200 hover:text-[#E52225]"
            >
              {isAr ? `تحديد الكل (${visibleDossiers.length})` : `Select all (${visibleDossiers.length})`}
            </button>
          )}
          <button
            type="button"
            onClick={() => setSelectedDossierIds([])}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
          >
            {isAr ? 'إلغاء التحديد' : 'Clear'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={dossierBulkNote}
            onChange={e => setDossierBulkNote(e.target.value)}
            placeholder={isAr ? 'ملاحظة على تحديث الدوسيه (اختياري)...' : 'Dossier status note (optional)...'}
            className="px-2.5 py-1.5 text-xs bg-white dark:bg-[#111111] border border-red-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#E52225] w-52"
          />
          <button
            type="button"
            onClick={() => handleBulkDossiersStatus('Archived')}
            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
          >
            {isAr ? 'تعيين كمؤرشف بالكامل' : 'Mark Archived'}
          </button>
          <button
            type="button"
            onClick={() => handleBulkDossiersStatus('Pending')}
            className="px-3 py-1.5 text-xs font-bold text-white bg-slate-600 hover:bg-slate-700 rounded-lg transition-colors"
          >
            {isAr ? 'قيد الانتظار' : 'Mark Pending'}
          </button>
          <button
            type="button"
            onClick={() => handleBulkDossiersStatus('Missing')}
            className="px-3 py-1.5 text-xs font-bold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg transition-colors"
          >
            {isAr ? 'تعيين كمفقود' : 'Mark Missing'}
          </button>
        </div>
      </div>
    );
  };

  const renderDossierStatusModal = () =>
    editingDossier ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderArchive className="w-4 h-4 text-[#E52225]" />
              <span>{isAr ? `تحديث حالة الدوسيه ${editingDossier.id}` : `Update Dossier ${editingDossier.id} Status`}</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {isAr
                ? `سيتم تطبيق الحالة الجديدة على الدوسيه بالكامل (${editingDossier.totalProjects} فرع / إرسالية).`
                : `Applies to the entire dossier (${editingDossier.totalProjects} branch shipments).`}
            </p>
          </div>

          <form onSubmit={handleSaveSingleDossierStatus} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                {isAr ? 'اختر الحالة الجديدة للدوسيه' : 'Select New Dossier Status'}
              </label>
              <div className="grid grid-cols-3 gap-1.5">
                {(['Archived', 'Pending', 'Missing'] as const).map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setEditDossierStatus(s)}
                    className={`py-2 px-1.5 text-xs font-bold rounded-lg border transition-colors ${
                      editDossierStatus === s
                        ? s === 'Archived'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : s === 'Pending'
                          ? 'border-slate-700 bg-slate-700 text-white'
                          : 'border-[#E52225] bg-[#E52225] text-white'
                        : 'border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-900'
                    }`}
                  >
                    {s === 'Archived'
                      ? isAr
                        ? 'مؤرشف'
                        : 'Archived'
                      : s === 'Pending'
                      ? isAr
                        ? 'انتظار'
                        : 'Pending'
                      : isAr
                      ? 'مفقود'
                      : 'Missing'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                {isAr ? 'ملاحظة التحديث (اختياري)' : 'Update Note (optional)'}
              </label>
              <input
                type="text"
                placeholder={isAr ? 'مثال: تم أرشفة الدوسيه بالكامل...' : 'Optional update note...'}
                value={editDossierNote}
                onChange={e => setEditDossierNote(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#E52225]"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingDossier(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white rounded-lg"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg">
                {isAr ? 'تطبيق على الدوسيه' : 'Apply to Dossier'}
              </button>
            </div>
          </form>
        </div>
      </div>
    ) : null;

  const renderDeleteUploadModal = () => (
    <DeleteUploadModal
      isOpen={deleteModalOpen}
      scope="minutes"
      initialUploadId={targetUploadId}
      onClose={() => {
        setDeleteModalOpen(false);
        setTargetUploadId(null);
      }}
      onCompleted={() => {
        setSelectedBoxCodes([]);
        setSelectedJobIds([]);
      }}
    />
  );

  // Shared Modals (Branch Details + Quick Edit)
  const renderBranchModals = () => {
    const siblingShipments = activeDetailBranch
      ? projects.filter(
          p =>
            p.branchName &&
            activeDetailBranch.branchName &&
            p.branchName.trim() === activeDetailBranch.branchName.trim() &&
            p.jobId !== activeDetailBranch.jobId
        )
      : [];

    const parentDossier = activeDetailBranch
      ? dossiers.find(d => d.boxId === activeDetailBranch.boxId && d.dossierNumber === activeDetailBranch.dossierNumber)
      : null;

    return (
      <>
        {activeDetailBranch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 dark:border-neutral-800 pb-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-[#E52225] dark:text-red-400">
                      {isAr ? 'تفاصيل الفرع والإرسالية' : 'Branch & Shipment Details'}
                    </span>
                    {statusBadge(activeDetailBranch.status)}
                  </div>
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white truncate">
                    {activeDetailBranch.branchName || `#${activeDetailBranch.jobId}`}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-neutral-400">
                    <span className="inline-flex items-center gap-1 font-mono font-bold px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-[#E52225] dark:text-red-300">
                      <Hash className="w-3 h-3" />
                      {isAr ? `إرسالية ${activeDetailBranch.shipmentNo ?? '—'}` : `Shipment ${activeDetailBranch.shipmentNo ?? '—'}`}
                    </span>
                    {activeDetailBranch.branchCode && (
                      <span className="font-mono text-[11px] bg-slate-100 dark:bg-neutral-900 px-2 py-0.5 rounded">
                        {isAr ? 'كود:' : 'Code:'} {activeDetailBranch.branchCode}
                      </span>
                    )}
                    <span className="text-[11px]">
                      {activeDetailBranch.boxId} · {isAr ? `دوسيه ${activeDetailBranch.dossierNumber}` : `Dossier ${activeDetailBranch.dossierNumber}`}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailBranch(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-900"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Structured Branch Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
                <div className="p-3 bg-slate-50 dark:bg-neutral-900/70 rounded-xl border border-slate-100 dark:border-neutral-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">{isAr ? 'اسم الفرع' : 'Branch Name'}</span>
                  <span className="font-bold text-slate-900 dark:text-white">{activeDetailBranch.branchName || '—'}</span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-neutral-900/70 rounded-xl border border-slate-100 dark:border-neutral-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">
                    {isAr ? 'رقم الإرسالية (المعرّف المميز)' : 'Shipment No. (Unique Key)'}
                  </span>
                  <span className="font-mono font-extrabold text-sm text-[#E52225] dark:text-red-400">
                    {activeDetailBranch.shipmentNo ?? '—'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-neutral-900/70 rounded-xl border border-slate-100 dark:border-neutral-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">{isAr ? 'تاريخ بدء التشغيل' : 'Operational Start Date'}</span>
                  <span className="font-bold text-slate-900 dark:text-white inline-flex items-center gap-1.5 tabular-nums">
                    <Calendar className="w-3.5 h-3.5 text-[#E52225]" />
                    {fmtDate(activeDetailBranch.startDate)}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-neutral-900/70 rounded-xl border border-slate-100 dark:border-neutral-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">{isAr ? 'البوكس والدوسيه' : 'Box & Weekly Dossier'}</span>
                  <div className="flex items-center gap-2 font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setDetailBranch(null);
                        onSelectBox(activeDetailBranch.boxId);
                        onNavigate('box-detail', activeDetailBranch.boxId);
                      }}
                      className="text-[#E52225] dark:text-red-400 hover:underline font-mono"
                    >
                      {activeDetailBranch.boxId}
                    </button>
                    <span className="text-slate-400">/</span>
                    <button
                      type="button"
                      onClick={() => {
                        const dId = `${activeDetailBranch.boxId}-${activeDetailBranch.dossierNumber}`;
                        setDetailBranch(null);
                        onSelectDossier(dId);
                        onNavigate('dossier-detail', dId);
                      }}
                      className="text-slate-900 dark:text-white hover:underline"
                    >
                      {isAr ? `دوسيه ${activeDetailBranch.dossierNumber}` : `Dossier ${activeDetailBranch.dossierNumber}`}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-neutral-900/70 rounded-xl border border-slate-100 dark:border-neutral-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">{isAr ? 'أسبوع الدوسيه (أحد ← خميس)' : 'Dossier Week (Sun → Thu)'}</span>
                  <span className="font-semibold text-slate-800 dark:text-neutral-200 tabular-nums">
                    {parentDossier ? `${fmtDate(parentDossier.weekStart)} → ${fmtDate(parentDossier.weekEnd)}` : fmtDate(activeDetailBranch.weekStart)}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-neutral-900/70 rounded-xl border border-slate-100 dark:border-neutral-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">{isAr ? 'تاريخ نهاية التشغيل' : 'End Date'}</span>
                  <span className="font-semibold text-slate-800 dark:text-neutral-200 tabular-nums">
                    {fmtDate(activeDetailBranch.endDate)}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-neutral-900/70 rounded-xl border border-slate-100 dark:border-neutral-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">{isAr ? 'المنطقة / الجناح' : 'Region / Wing'}</span>
                  <span className="font-semibold text-slate-800 dark:text-neutral-200 inline-flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    {[activeDetailBranch.region, activeDetailBranch.wing].filter(Boolean).join(' · ') || '—'}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-neutral-900/70 rounded-xl border border-slate-100 dark:border-neutral-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">{isAr ? 'عدد المناديل / المرفقات' : 'Folder / Bundle Count'}</span>
                  <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                    {activeDetailBranch.folderCount ?? 0}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-neutral-900/70 rounded-xl border border-slate-100 dark:border-neutral-800">
                  <span className="text-[10px] text-slate-400 block mb-0.5">{isAr ? 'ملف الاستيراد' : 'Source Sheet'}</span>
                  <span className="font-medium text-slate-700 dark:text-neutral-300 truncate block" title={activeDetailBranch.sourceUpload}>
                    {activeDetailBranch.sourceUpload || '—'}
                  </span>
                </div>
              </div>

              {/* Other Shipments for the same repeating branch */}
              {siblingShipments.length > 0 && (
                <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/50 rounded-xl space-y-2">
                  <div className="text-xs font-bold text-amber-900 dark:text-amber-300">
                    {isAr
                      ? `إرساليات أخرى لنفس الفرع (${siblingShipments.length})`
                      : `Other Shipments for this Branch (${siblingShipments.length})`}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {siblingShipments.map(s => (
                      <button
                        key={s.jobId}
                        type="button"
                        onClick={() => openBranchDetail(s)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white dark:bg-[#111111] border border-amber-200 dark:border-amber-800/70 text-slate-800 dark:text-neutral-200 hover:border-[#E52225] transition-colors"
                      >
                        <span className="font-mono font-bold text-[#E52225]">#{s.shipmentNo}</span>
                        <span>· {fmtDate(s.startDate)}</span>
                        <span className="text-slate-400">({s.boxId}-{s.dossierNumber})</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Direct Status Update Form */}
              {canEdit && (
                <form
                  onSubmit={handleSaveDetailStatus}
                  className="p-4 bg-slate-50 dark:bg-neutral-900/60 border border-slate-200 dark:border-neutral-800 rounded-xl space-y-3"
                >
                  <div className="text-xs font-bold text-slate-800 dark:text-white">
                    {isAr ? 'تحديث حالة الفرع' : 'Update Branch Status'}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {(['Archived', 'Pending', 'Missing'] as const).map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setDetailStatus(st)}
                        className={`py-2 px-2 text-xs font-bold rounded-lg border transition-colors ${
                          detailStatus === st
                            ? st === 'Archived'
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : st === 'Missing'
                              ? 'bg-[#E52225] border-[#E52225] text-white'
                              : 'bg-slate-700 border-slate-700 text-white'
                            : 'bg-white dark:bg-[#111111] border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-900'
                        }`}
                      >
                        {st === 'Archived' && (isAr ? 'مؤرشف (Archived)' : 'Archived')}
                        {st === 'Pending' && (isAr ? 'قيد الانتظار (Pending)' : 'Pending')}
                        {st === 'Missing' && (isAr ? 'مفقود (Missing)' : 'Missing')}
                      </button>
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={detailNote}
                      onChange={e => setDetailNote(e.target.value)}
                      placeholder={isAr ? 'ملاحظة على حالة الفرع (اختياري)...' : 'Status update note (optional)...'}
                      className="flex-1 px-3 py-2 text-xs bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#E52225]"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-bold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg whitespace-nowrap"
                    >
                      {isAr ? 'حفظ الحالة' : 'Save Status'}
                    </button>
                  </div>
                </form>
              )}

              {/* Status History */}
              <div>
                <h3 className="text-xs font-bold text-slate-700 dark:text-neutral-300 mb-2 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[#E52225]" />
                  <span>{isAr ? 'سجل تغير الحالة والملاحظات' : 'Status History'}</span>
                </h3>
                <div className="max-h-36 overflow-y-auto space-y-1.5 border border-slate-100 dark:border-neutral-800 rounded-xl p-3">
                  {(activeDetailBranch.statusHistory || []).map((h, i) => (
                    <div
                      key={i}
                      className="text-[11px] flex flex-wrap items-center justify-between gap-2 py-1 border-b border-slate-50 dark:border-neutral-800/60 last:border-none"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 dark:text-white">{h.status}</span>
                        {h.user && <span className="text-slate-500">({h.user})</span>}
                        {h.note && <span className="text-slate-400">· {h.note}</span>}
                      </div>
                      <span className="text-slate-400 text-[10px] tabular-nums">{String(h.timestamp).slice(0, 19).replace('T', ' ')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {editingBranch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  {editingBranch.branchName || `#${editingBranch.jobId}`}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isAr ? `إرسالية #${editingBranch.shipmentNo ?? '—'} · ${fmtDate(editingBranch.startDate)}` : `Shipment #${editingBranch.shipmentNo ?? '—'} · ${fmtDate(editingBranch.startDate)}`}
                </p>
              </div>

              <form onSubmit={handleSaveSingleEdit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                    {isAr ? 'الحالة الجديدة' : 'New Status'}
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['Archived', 'Pending', 'Missing'] as const).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setEditStatus(s)}
                        className={`py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                          editStatus === s
                            ? 'border-[#E52225] bg-[#E52225] text-white'
                            : 'border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-900'
                        }`}
                      >
                        {s === 'Archived' ? (isAr ? 'مؤرشف' : 'Archived') : s === 'Pending' ? (isAr ? 'انتظار' : 'Pending') : isAr ? 'مفقود' : 'Missing'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-neutral-300 mb-1">
                    {isAr ? 'ملاحظة التعديل' : 'Update Note'}
                  </label>
                  <input
                    type="text"
                    placeholder={isAr ? 'مثال: تم استلام وأرشفة أصل التعليق...' : 'Optional update note...'}
                    value={editNote}
                    onChange={e => setEditNote(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#E52225]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingBranch(null)}
                    className="px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-neutral-400 dark:hover:text-white rounded-lg"
                  >
                    {isAr ? 'إلغاء' : 'Cancel'}
                  </button>
                  <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg">
                    {isAr ? 'حفظ' : 'Save'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
    );
  };

  /* -------------------- 1. DASHBOARD -------------------- */
  if (activeTab === 'dashboard') {
    const dashboardBranches = projects.filter(p => {
      if (!matchesDateRange(p.startDate || p.weekStart)) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      return true;
    });

    const dashTotal = dashboardBranches.length;
    const dashArchived = dashboardBranches.filter(p => p.status === 'Archived').length;
    const dashMissing = dashboardBranches.filter(p => p.status === 'Missing').length;
    const dashPending = dashboardBranches.filter(p => p.status === 'Pending').length;
    const dashArchivedPercent = dashTotal > 0 ? ((dashArchived / dashTotal) * 100).toFixed(1) : '0.0';

    const dashDossiers = sortedDossiers.filter(d => {
      if (!dossierOverlapsDateRange(d)) return false;
      if (
        statusFilter !== 'all' &&
        !projects.some(p => p.boxId === d.boxId && p.dossierNumber === d.dossierNumber && p.status === statusFilter)
      ) {
        return false;
      }
      return true;
    });
    const dashCompletedDossiers = dashDossiers.filter(d => d.status === 'Archived').length;

    const dashBoxes = sortedBoxes.filter(b => {
      const ds = sortedDossiers.filter(d => d.boxId === b.boxCode);
      const bps = projects.filter(p => p.boxId === b.boxCode);
      const dateOk =
        !dateFrom && !dateTo
          ? true
          : ds.some(dossierOverlapsDateRange) || bps.some(p => matchesDateRange(p.startDate || p.weekStart));
      const statusOk = statusFilter === 'all' || bps.some(p => p.status === statusFilter);
      return dateOk && statusOk;
    });

    const pieData = dashTotal
      ? [
          { name: isAr ? 'مؤرشف' : 'Archived', value: dashArchived, color: '#10B981' },
          { name: isAr ? 'قيد الانتظار' : 'Pending', value: dashPending, color: '#CBD5E1' },
          { name: isAr ? 'مفقود' : 'Missing', value: dashMissing, color: '#E52225' },
        ].filter(d => d.value > 0)
      : [{ name: isAr ? 'فارغ' : 'Empty', value: 1, color: '#E2E8F0' }];

    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <div className="text-[11px] font-bold text-[#E52225] dark:text-red-400 mb-0.5">
              {isAr ? 'أرشفة تعليقات الفروع' : 'Branch Comments Archive'}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {isAr ? 'لوحة متابعة أرشفة الفروع' : 'Branch Comments Dashboard'}
            </h1>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={() => onNavigate('import')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#E52225] hover:bg-[#C41C1F] rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{isAr ? 'استيراد شيت الفروع' : 'Import Plan Sheet'}</span>
            </button>
          )}
        </div>

        {/* Global Search Bar */}
        <GlobalSearch onNavigate={onNavigate} />

        {/* Date From / To & Status Filter Card */}
        {renderDateStatusFilterCard('dashboard', dashTotal)}

        {/* Unified KPI Strip + Progress Bar */}
        <section
          aria-label={isAr ? 'ملخص مؤشرات الفروع' : 'Branch Comments Metrics Summary'}
          className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl overflow-hidden"
        >
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-slate-200 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => onNavigate('projects')}
              className="p-5 text-start bg-white dark:bg-[#111111] hover:bg-slate-50/80 dark:hover:bg-neutral-900/60 transition-colors group"
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-neutral-400">
                <span>{isAr ? 'إجمالي الفروع (الإرساليات)' : 'Total Branches (Shipments)'}</span>
                <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity text-[#E52225]" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                {dashTotal.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                {dashBoxes.length} {isAr ? 'بوكس' : 'boxes'} · {dashDossiers.length} {isAr ? 'دوسيه' : 'dossiers'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('projects', 'Archived')}
              className="p-5 text-start bg-white dark:bg-[#111111] hover:bg-slate-50/80 dark:hover:bg-neutral-900/60 transition-colors group"
            >
              <div className="flex items-center justify-between text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span>{isAr ? 'فروع مؤرشفة' : 'Archived Branches'}</span>
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
                {dashArchived.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                {dashArchivedPercent}% {isAr ? 'من الإجمالي' : 'completed'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('projects', 'Pending')}
              className="p-5 text-start bg-white dark:bg-[#111111] hover:bg-slate-50/80 dark:hover:bg-neutral-900/60 transition-colors group"
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-neutral-400">
                <span>{isAr ? 'قيد الانتظار / مفقود' : 'Pending / Missing'}</span>
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                {dashPending.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] text-[#E52225] font-semibold tabular-nums">
                {dashMissing} {isAr ? 'مفقود' : 'missing'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('dossiers')}
              className="p-5 text-start bg-white dark:bg-[#111111] hover:bg-slate-50/80 dark:hover:bg-neutral-900/60 transition-colors group"
            >
              <div className="flex items-center justify-between text-xs font-medium text-[#E52225] dark:text-red-400">
                <span>{isAr ? 'الدوسيهات المكتملة' : 'Completed Dossiers'}</span>
                <FolderArchive className="w-3.5 h-3.5" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                {dashCompletedDossiers} / {dashDossiers.length}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                {isAr ? 'شهري (C13-C14) · أسبوعي 6/بوكس (C15+)' : 'Monthly (C13-C14) · 6 weekly/box (C15+)'}
              </div>
            </button>
          </div>

          <div className="px-5 py-3 bg-slate-50/70 dark:bg-neutral-900/30 border-t border-slate-200 dark:border-neutral-800 flex items-center gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <Layers className="w-4 h-4 text-[#E52225]" />
              <span className="text-xs font-bold text-slate-700 dark:text-neutral-200">
                {isAr ? 'نسبة أرشفة الفروع' : 'Branch Archive Progress'}
              </span>
            </div>
            <div className="flex-1 bg-slate-200 dark:bg-neutral-800/80 rounded-full h-2 overflow-hidden flex">
              <div
                className="bg-emerald-500 h-full transition-all"
                style={{ width: `${dashTotal > 0 ? (dashArchived / dashTotal) * 100 : 0}%` }}
              />
              <div
                className="bg-[#E52225] h-full transition-all"
                style={{ width: `${dashTotal > 0 ? (dashMissing / dashTotal) * 100 : 0}%` }}
              />
            </div>
            <span className="text-xs font-extrabold text-[#E52225] dark:text-red-400 tabular-nums shrink-0">
              {dashArchivedPercent}%
            </span>
          </div>
        </section>

        {/* Boxes overview + Quick actions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <section className="lg:col-span-8 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl flex flex-col justify-between overflow-hidden">
            <div>
              <div className="px-5 py-4 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isAr ? 'البوكسات الحالية' : 'Active Boxes'}
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('boxes')}
                  className="text-xs font-semibold text-[#E52225] hover:underline inline-flex items-center gap-1"
                >
                  <span>{isAr ? 'عرض كل البوكسات' : 'All boxes'}</span>
                  <DirectionalArrow className="w-3.5 h-3.5" />
                </button>
              </div>

              {dashBoxes.length === 0 ? (
                <div className="py-14 px-6 text-center space-y-2">
                  <div className="w-10 h-10 rounded-xl mx-auto flex items-center justify-center bg-red-50 dark:bg-red-950/50 text-[#E52225]">
                    <Package className="w-5 h-5" />
                  </div>
                  <div className="text-sm font-bold text-slate-800 dark:text-neutral-200">
                    {sortedBoxes.length === 0
                      ? isAr
                        ? 'لا توجد بوكسات مستوردة بعد'
                        : 'No Boxes Imported Yet'
                      : isAr
                      ? 'لا توجد بوكسات مطابقة للتصفية الحالية'
                      : 'No Boxes Match Current Filter'}
                  </div>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">
                    {isAr
                      ? 'ارفع شيت الفروع والإرساليات لتقسيمها تلقائياً على أسابيع داخل دوسيهات وبوكسات.'
                      : 'Upload the branch operational sheet to automatically organize weeks into dossiers and boxes.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-neutral-800">
                  {dashBoxes.slice(0, 6).map(b => {
                    const ds = sortedDossiers.filter(d => d.boxId === b.boxCode);
                    const pct = b.totalProjects > 0 ? Math.round((b.archivedProjects / b.totalProjects) * 100) : 0;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          onSelectBox(b.boxCode);
                          onNavigate('box-detail', b.boxCode);
                        }}
                        className="w-full px-5 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-neutral-900/50 text-start transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950/40 text-[#E52225] dark:text-red-300 font-mono font-extrabold text-xs">
                            {b.boxCode}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-900 dark:text-white">
                              {ds.length} / {b.totalDossiers || 6}{' '}
                              {b.totalDossiers === 2
                                ? isAr
                                  ? 'دوسيهات (شهور)'
                                  : 'dossiers (months)'
                                : isAr
                                ? 'دوسيهات (أسابيع)'
                                : 'dossiers (weeks)'}{' '}
                              · {b.totalProjects} {isAr ? 'فرع' : 'branches'}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {ds[0]?.weekStart ? `${fmtDate(ds[0].weekStart)} → ${fmtDate(ds[ds.length - 1]?.weekEnd)}` : '—'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="font-mono text-xs font-bold tabular-nums text-slate-700 dark:text-neutral-300">{pct}%</span>
                          {statusBadge(b.status)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="lg:col-span-4 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl flex flex-col justify-between overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-neutral-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">{isAr ? 'أقسام الأرشيف وإجراءات سريعة' : 'Archive Sections & Actions'}</h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-neutral-800 flex-1 flex flex-col justify-center">
              {[
                { label: isAr ? 'البوكسات' : 'Boxes', sub: `${dashBoxes.length} ${isAr ? 'بوكس' : 'boxes'}`, icon: Archive, tab: 'boxes' as ActiveTab },
                { label: isAr ? 'الدوسيهات (الأسابيع)' : 'Weekly Dossiers', sub: `${dashDossiers.length} ${isAr ? 'دوسيه' : 'dossiers'}`, icon: FolderArchive, tab: 'dossiers' as ActiveTab },
                { label: isAr ? 'الفروع وتعديل الحالات' : 'Branches & Statuses', sub: `${dashTotal} ${isAr ? 'فرع / إرسالية' : 'branches'}`, icon: CheckSquare, tab: 'projects' as ActiveTab },
                { label: isAr ? 'طباعة الليبلات' : 'Print Labels', sub: '100 × 50 mm', icon: Printer, tab: 'labels' as ActiveTab },
                { label: isAr ? 'التقارير' : 'Reports', sub: 'A4 · Excel', icon: FileBarChart, tab: 'reports' as ActiveTab },
              ].map(a => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.tab}
                    type="button"
                    onClick={() => onNavigate(a.tab)}
                    className="w-full px-5 py-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-neutral-900/50 transition-colors text-start group flex-1"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-red-50 dark:bg-red-950/50 text-[#E52225] dark:text-red-400">
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-[#E52225]">{a.label}</div>
                        <div className="text-[11px] text-slate-400">{a.sub}</div>
                      </div>
                    </div>
                    <DirectionalArrow className="w-3.5 h-3.5 text-slate-400 shrink-0 group-hover:text-[#E52225]" />
                  </button>
                );
              })}
            </div>
          </section>
        </div>

        {/* Distribution Chart + Recent Imports */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-4 p-5 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl flex flex-col justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">{isAr ? 'توزيع حالات الفروع' : 'Branch Status Distribution'}</h2>
            <div className="relative h-48 my-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={56} outerRadius={76} dataKey="value" stroke="none">
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">{dashArchivedPercent}%</span>
                <span className="text-[10px] font-semibold text-slate-400">{isAr ? 'مؤرشف' : 'Archived'}</span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-neutral-800 text-center">
              {[
                { label: isAr ? 'مؤرشف' : 'Archived', count: dashArchived, color: '#10B981' },
                { label: isAr ? 'انتظار' : 'Pending', count: dashPending, color: '#94A3B8' },
                { label: isAr ? 'مفقود' : 'Missing', count: dashMissing, color: '#E52225' },
              ].map(item => (
                <div key={item.label} className="flex flex-col">
                  <div className="flex items-center justify-center gap-1 text-[11px] text-slate-500 dark:text-neutral-400">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: item.color }} />
                    <span>{item.label}</span>
                  </div>
                  <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{item.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-8 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl flex flex-col justify-between overflow-hidden">
            <div>
              <div className="px-5 py-4 border-b border-slate-100 dark:border-neutral-800 flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-sm">
                  <FileSpreadsheet className="w-4 h-4 text-[#E52225]" />
                  <span>{isAr ? 'آخر عمليات استيراد الخطة' : 'Recent Plan Imports'}</span>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onNavigate('import')}
                    className="text-xs font-semibold text-[#E52225] hover:underline inline-flex items-center gap-1"
                  >
                    <span>{isAr ? 'رفع شيت جديد' : 'Upload Sheet'}</span>
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
                  <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                    {uploadHistory.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate-400">
                          {isAr ? 'لم يتم رفع ملفات في هذا القسم بعد' : 'No uploads in this section yet'}
                        </td>
                      </tr>
                    ) : (
                      uploadHistory.slice(0, 5).map(u => (
                        <tr key={u.id}>
                          <td className="px-5 py-2.5 font-semibold text-slate-900 dark:text-white">{u.fileName}</td>
                          <td className="px-3 py-2.5 text-slate-500 tabular-nums">{fmtDate(u.timestamp)}</td>
                          <td className="px-3 py-2.5 text-end font-mono font-bold tabular-nums">{u.importedCount}</td>
                          <td className="px-5 py-2.5 text-end text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            {u.status}
                          </td>
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

  /* -------------------- 2. BOXES VIEW -------------------- */
  if (activeTab === 'boxes' || (activeTab === 'archive' && archiveSubTab === 'boxes')) {
    const filteredBoxes = sortedBoxes.filter(b => {
      const q = searchTerm.trim().toLowerCase();
      const boxProjects = projects.filter(p => p.boxId === b.boxCode);
      const boxDossiers = sortedDossiers.filter(d => d.boxId === b.boxCode);
      const matchSearch =
        !q ||
        b.boxCode.toLowerCase().includes(q) ||
        boxProjects.some(
          p =>
            (p.branchName || '').toLowerCase().includes(q) ||
            String(p.shipmentNo || '').includes(q) ||
            (p.startDate || '').includes(q)
        );
      if (!matchSearch) return false;
      const matchDate =
        !dateFrom && !dateTo
          ? true
          : boxDossiers.some(dossierOverlapsDateRange) ||
            boxProjects.some(p => matchesDateRange(p.startDate || p.weekStart));
      if (!matchDate) return false;
      if (boxStatusFilter !== 'all' && b.status !== boxStatusFilter) return false;
      return true;
    });

    const allBoxesSelected =
      filteredBoxes.length > 0 && filteredBoxes.every(b => selectedBoxCodes.includes(b.boxCode));
    const selectedBoxesBranchTotal = filteredBoxes
      .filter(b => selectedBoxCodes.includes(b.boxCode))
      .reduce((sum, b) => sum + b.totalProjects, 0);

    return (
      <div className="space-y-6">
        {activeTab === 'archive' && renderArchiveSubTabs()}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <div className="text-[11px] font-bold mb-0.5 text-[#E52225] dark:text-red-400">
              {isAr ? 'أرشفة تعليقات الفروع' : 'Branch Comments Archive'}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Archive className="w-6 h-6 text-[#E52225]" />
              <span>{isAr ? 'البوكسات' : 'Archive Boxes'}</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isSystemAdmin && (boxes.length > 0 || projects.length > 0 || uploadHistory.length > 0) && (
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
            {canEdit && (
              <button
                type="button"
                onClick={() => onNavigate('import')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{isAr ? 'استيراد شيت الفروع' : 'Import Plan'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('labels')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 hover:border-[#E52225] rounded-lg transition-colors"
            >
              <Printer className="w-3.5 h-3.5 text-[#E52225]" />
              <span>{isAr ? 'طباعة الليبلات' : 'Print Labels'}</span>
            </button>
          </div>
        </div>

        {renderDeleteUploadModal()}

        {renderDateStatusFilterCard('boxes', filteredBoxes.length)}

        {/* Bulk Box Selection & Status Update Bar */}
        {canEdit && selectedBoxCodes.length > 0 && (
          <div className="bg-red-50/90 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-extrabold text-[#E52225] dark:text-red-300">
                {isAr
                  ? `تم تحديد ${selectedBoxCodes.length} بوكس (${selectedBoxesBranchTotal} فرع)`
                  : `${selectedBoxCodes.length} box(es) selected (${selectedBoxesBranchTotal} branches)`}
              </span>
              {selectedBoxCodes.length < filteredBoxes.length && (
                <button
                  type="button"
                  onClick={() => setSelectedBoxCodes(filteredBoxes.map(b => b.boxCode))}
                  className="text-[11px] font-semibold underline text-slate-700 dark:text-neutral-200 hover:text-[#E52225]"
                >
                  {isAr ? `تحديد الكل (${filteredBoxes.length})` : `Select all (${filteredBoxes.length})`}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedBoxCodes([])}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
              >
                {isAr ? 'إلغاء التحديد' : 'Clear'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={boxBulkNote}
                onChange={e => setBoxBulkNote(e.target.value)}
                placeholder={isAr ? 'ملاحظة على تحديث البوكس (اختياري)...' : 'Box status note (optional)...'}
                className="px-2.5 py-1.5 text-xs bg-white dark:bg-[#111111] border border-red-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#E52225] w-52"
              />
              <button
                type="button"
                onClick={() => handleBulkBoxesStatus('Archived')}
                className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                {isAr ? 'تعيين كمؤرشف بالكامل' : 'Mark Archived'}
              </button>
              <button
                type="button"
                onClick={() => handleBulkBoxesStatus('Pending')}
                className="px-3 py-1.5 text-xs font-bold text-white bg-slate-600 hover:bg-slate-700 rounded-lg transition-colors"
              >
                {isAr ? 'قيد الانتظار' : 'Mark Pending'}
              </button>
              <button
                type="button"
                onClick={() => handleBulkBoxesStatus('Missing')}
                className="px-3 py-1.5 text-xs font-bold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg transition-colors"
              >
                {isAr ? 'تعيين كمفقود' : 'Mark Missing'}
              </button>
            </div>
          </div>
        )}

        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 dark:bg-neutral-900/80 text-slate-500 text-[11px] font-semibold border-b border-slate-200 dark:border-neutral-800">
                <tr>
                  {canEdit && (
                    <th className="px-3 py-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allBoxesSelected}
                        onChange={e =>
                          setSelectedBoxCodes(e.target.checked ? filteredBoxes.map(b => b.boxCode) : [])
                        }
                        title={isAr ? 'تحديد كل البوكسات' : 'Select all boxes'}
                        className="rounded border-slate-300 text-[#E52225] focus:ring-[#E52225]"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-start">{isAr ? 'كود البوكس' : 'Box Code'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'نطاق الفترة' : 'Period Range'}</th>
                  <th className="px-4 py-3 text-center">{isAr ? 'الدوسيهات' : 'Dossiers'}</th>
                  <th className="px-4 py-3 text-end">{isAr ? 'الفروع المؤرشفة' : 'Archived Branches'}</th>
                  <th className="px-4 py-3 text-end text-[#E52225]">{isAr ? 'مفقود' : 'Missing'}</th>
                  <th className="px-4 py-3 text-end text-slate-400">{isAr ? 'انتظار' : 'Pending'}</th>
                  <th className="px-4 py-3">{isAr ? 'الإنجاز' : 'Progress'}</th>
                  <th className="px-4 py-3">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {filteredBoxes.map(box => {
                  const boxDossiers = sortedDossiers.filter(d => d.boxId === box.boxCode);
                  const firstWk = boxDossiers[0]?.weekStart;
                  const lastWk = boxDossiers[boxDossiers.length - 1]?.weekEnd;
                  const pct = box.totalProjects > 0 ? Math.round((box.archivedProjects / box.totalProjects) * 100) : 0;
                  const isSelected = selectedBoxCodes.includes(box.boxCode);
                  return (
                    <tr
                      key={box.id}
                      onClick={() => {
                        onSelectBox(box.boxCode);
                        onNavigate('box-detail', box.boxCode);
                      }}
                      className={`cursor-pointer transition-colors group ${
                        isSelected
                          ? 'bg-red-50/60 dark:bg-red-950/20'
                          : 'hover:bg-slate-50/70 dark:hover:bg-neutral-900/40'
                      }`}
                    >
                      {canEdit && (
                        <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectBox(box.boxCode)}
                            className="rounded border-slate-300 text-[#E52225] focus:ring-[#E52225]"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 font-extrabold text-sm font-mono text-[#E52225] dark:text-red-400">
                        {box.boxCode}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-600 dark:text-neutral-300 tabular-nums">
                        {firstWk ? `${fmtDate(firstWk)} → ${fmtDate(lastWk)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold tabular-nums">
                        {boxDossiers.length} / {box.totalDossiers || 6}{' '}
                        <span className="text-[10px] text-slate-400">
                          ({box.completedDossiers} {isAr ? 'مكتمل' : 'done'})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-end font-bold tabular-nums">
                        {box.archivedProjects} / {box.totalProjects}
                      </td>
                      <td className="px-4 py-3 text-end font-bold text-[#E52225] tabular-nums">
                        {box.missingProjects > 0 ? box.missingProjects : '-'}
                      </td>
                      <td className="px-4 py-3 text-end text-slate-400 tabular-nums">{box.pendingProjects}</td>
                      <td className="px-4 py-3 min-w-[130px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-slate-100 dark:bg-neutral-900 rounded-full h-2 overflow-hidden flex">
                            <div className="bg-emerald-500 h-full" style={{ width: `${pct}%` }} />
                            <div
                              className="bg-[#E52225] h-full"
                              style={{ width: `${box.totalProjects ? (box.missingProjects / box.totalProjects) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold tabular-nums w-8 text-end">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">{statusBadge(box.status)}</td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => openBoxStatusModal(box)}
                              title={isAr ? 'تحديد حالة البوكس بالكامل' : 'Change Box Status'}
                              className="p-1.5 text-slate-500 hover:text-[#E52225] rounded hover:bg-red-50 dark:hover:bg-neutral-900"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onNavigate('labels', box.boxCode)}
                            title={isAr ? 'طباعة ليبل البوكس' : 'Print Box Labels'}
                            className="p-1.5 text-slate-500 hover:text-[#E52225] rounded hover:bg-slate-100 dark:hover:bg-neutral-900"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onSelectBox(box.boxCode);
                              onNavigate('box-detail', box.boxCode);
                            }}
                            className="p-1.5 text-slate-400 group-hover:text-[#E52225]"
                          >
                            <DirectionalArrow className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredBoxes.length === 0 && (
                  <tr>
                    <td colSpan={canEdit ? 10 : 9} className="py-12 text-center text-slate-400">
                      {isAr ? 'لا توجد بوكسات مطابقة حالياً — ارفع شيت الفروع أولاً.' : 'No boxes found yet — import a plan sheet first.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {renderBoxStatusModal()}
      </div>
    );
  }

  /* -------------------- 3. BOX DETAIL (6 WEEKLY DOSSIERS) -------------------- */
  if (activeTab === 'box-detail') {
    const box: Box | undefined = sortedBoxes.find(b => b.boxCode === selectedBoxId || b.id === selectedBoxId) || sortedBoxes[0];
    if (!box) {
      return (
        <div className="p-8 text-center bg-white dark:bg-[#111111] rounded-xl border border-slate-200 dark:border-neutral-800 space-y-3">
          <p className="text-sm text-slate-500">{isAr ? 'البوكس غير موجود.' : 'Box not found.'}</p>
          <button type="button" onClick={() => onNavigate('boxes')} className="text-xs font-semibold text-[#E52225] underline">
            {isAr ? 'العودة للبوكسات' : 'Back to Boxes'}
          </button>
        </div>
      );
    }

    const boxDossiers = sortedDossiers.filter(d => d.boxId === box.boxCode);
    const boxCap = box.totalDossiers || 6;
    const isMonthlyBox = boxCap === 2;
    const pct = box.totalProjects > 0 ? ((box.archivedProjects / box.totalProjects) * 100).toFixed(1) : '0.0';

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('boxes')}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-neutral-800 hover:border-[#E52225] hover:text-[#E52225] transition-colors text-slate-600 dark:text-neutral-300"
            >
              <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {isAr ? `تفاصيل البوكس ${box.boxCode}` : `Box ${box.boxCode} Details`}
                </h1>
                {statusBadge(box.status)}
              </div>
              <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5">
                {isMonthlyBox
                  ? isAr
                    ? `السعة: دوسيهان (كل دوسيه = شهر كامل) · إجمالي ${box.totalProjects} فرع/إرسالية`
                    : `2 Monthly Dossiers capacity · ${box.totalProjects} branch shipments`
                  : isAr
                  ? `السعة: 6 دوسيهات (كل دوسيه = أسبوع تشغيل) · إجمالي ${box.totalProjects} فرع/إرسالية`
                  : `6 Weekly Dossiers capacity · ${box.totalProjects} branch shipments`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => openBoxStatusModal(box)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 hover:border-[#E52225] hover:text-[#E52225] rounded-lg transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5 text-[#E52225]" />
                <span>{isAr ? 'تحديد حالة البوكس' : 'Change Box Status'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('projects', `box:${box.boxCode}`)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 hover:border-[#E52225] rounded-lg transition-colors"
            >
              <CheckSquare className="w-3.5 h-3.5 text-[#E52225]" />
              <span>{isAr ? 'عرض فروع هذا البوكس' : 'View Box Branches'}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('labels', box.boxCode)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isAr ? 'طباعة ليبلات البوكس' : 'Print Box Labels'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white dark:bg-[#111111] p-4 rounded-xl border border-slate-200 dark:border-neutral-800">
          <div>
            <span className="text-[11px] text-slate-500">{isAr ? 'الفروع المؤرشفة' : 'Archived Branches'}</span>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {box.archivedProjects} / {box.totalProjects}
            </div>
            <span className="text-[10px] text-slate-400">{pct}% {isAr ? 'مكتمل' : 'completed'}</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500">{isAr ? 'مفقود' : 'Missing'}</span>
            <div className="text-xl font-bold text-[#E52225] tabular-nums">{box.missingProjects}</div>
            <span className="text-[10px] text-slate-400">{isAr ? 'فروع مفقودة' : 'missing shipments'}</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500">{isAr ? 'قيد الانتظار' : 'Pending'}</span>
            <div className="text-xl font-bold text-slate-700 dark:text-neutral-300 tabular-nums">{box.pendingProjects}</div>
            <span className="text-[10px] text-slate-400">{isAr ? 'بانتظار الأرشفة' : 'awaiting archive'}</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500">
              {isMonthlyBox ? (isAr ? 'الدوسيهات (الشهور)' : 'Dossiers (Months)') : isAr ? 'الدوسيهات (الأسابيع)' : 'Dossiers (Weeks)'}
            </span>
            <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
              {boxDossiers.length} / {boxCap}
            </div>
            <span className="text-[10px] text-slate-400">
              {box.completedDossiers} {isAr ? 'دوسيه مكتمل' : 'completed'}
            </span>
          </div>
        </div>

        {renderBoxStatusModal()}
        {renderDossierStatusModal()}

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {isMonthlyBox
                ? isAr
                  ? 'الدوسيهات الشهرية داخل البوكس (كل دوسيه = شهر)'
                  : 'The 2 Monthly Dossiers of this Box'
                : isAr
                ? 'الدوسيهات الستة داخل البوكس (كل دوسيه = أسبوع)'
                : 'The 6 Weekly Dossiers of this Box'}
            </h2>
            {canEdit && boxDossiers.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const allChecked = boxDossiers.every(d => selectedDossierIds.includes(d.id));
                  if (allChecked) {
                    const boxDossierSet = new Set(boxDossiers.map(d => d.id));
                    setSelectedDossierIds(prev => prev.filter(id => !boxDossierSet.has(id)));
                  } else {
                    setSelectedDossierIds(prev => Array.from(new Set([...prev, ...boxDossiers.map(d => d.id)])));
                  }
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-neutral-800 text-slate-700 dark:text-neutral-200 hover:border-[#E52225] hover:text-[#E52225] transition-colors"
              >
                {boxDossiers.every(d => selectedDossierIds.includes(d.id))
                  ? isAr
                    ? 'إلغاء تحديد دوسيهات البوكس'
                    : 'Deselect All Dossiers'
                  : isAr
                  ? `تحديد كل دوسيهات البوكس (${boxDossiers.length})`
                  : `Select All Dossiers (${boxDossiers.length})`}
              </button>
            )}
          </div>

          {renderDossierBulkBar(boxDossiers)}

          <div className={`grid grid-cols-1 ${isMonthlyBox ? 'md:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'} gap-4`}>
            {Array.from({ length: boxCap }, (_, i) => i + 1).map(num => {
              const dossier = boxDossiers.find(d => d.dossierNumber === num);
              if (!dossier) {
                return (
                  <div
                    key={num}
                    className="p-4 bg-slate-50/70 dark:bg-[#111111]/60 border border-dashed border-slate-200 dark:border-neutral-800 rounded-xl flex flex-col items-center justify-center text-center py-8 text-xs text-slate-400"
                  >
                    <div className="font-mono font-bold text-slate-500 mb-1">
                      {box.boxCode}-{num}
                    </div>
                    <div>
                      {isAr
                        ? `دوسيه ${num} / ${boxCap} — فارغ (بانتظار بيانات)`
                        : `Dossier ${num} / ${boxCap} — Empty`}
                    </div>
                  </div>
                );
              }
              const dPct = dossier.totalProjects > 0 ? Math.round((dossier.archivedCount / dossier.totalProjects) * 100) : 0;
              const monthNumLabel = dossier.weekStart ? Number(dossier.weekStart.slice(5, 7)) : null;
              const isSelected = selectedDossierIds.includes(dossier.id);
              return (
                <div
                  key={dossier.id}
                  onClick={() => {
                    onSelectDossier(dossier.id);
                    onNavigate('dossier-detail', dossier.id);
                  }}
                  className={`p-4 border rounded-xl hover:shadow-xs cursor-pointer transition-all flex flex-col justify-between group ${
                    isSelected
                      ? 'bg-red-50/50 dark:bg-red-950/20 border-[#E52225] ring-1 ring-[#E52225]/30'
                      : 'bg-white dark:bg-[#111111] border-slate-200 dark:border-neutral-800 hover:border-[#E52225]/60'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        {canEdit && (
                          <div onClick={e => e.stopPropagation()} className="pt-0.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectDossier(dossier.id)}
                              title={isAr ? 'تحديد الدوسيه' : 'Select dossier'}
                              className="rounded border-slate-300 text-[#E52225] focus:ring-[#E52225] cursor-pointer"
                            />
                          </div>
                        )}
                        <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center font-bold text-[#E52225] dark:text-red-400 text-sm shrink-0">
                          {dossier.dossierNumber}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-[#E52225] transition-colors">
                            {dossier.id} ·{' '}
                            {isMonthlyBox
                              ? isAr
                                ? `شهر ${monthNumLabel ?? dossier.dossierNumber}`
                                : `Month ${monthNumLabel ?? dossier.dossierNumber}`
                              : isAr
                              ? `الأسبوع ${dossier.dossierNumber}`
                              : `Week ${dossier.dossierNumber}`}
                          </h3>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {fmtDate(dossier.weekStart)} → {fmtDate(dossier.weekEnd)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        {statusBadge(dossier.status)}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => openDossierStatusModal(dossier)}
                            title={isAr ? 'تحديد حالة الدوسيه بالكامل' : 'Change Dossier Status'}
                            className="p-1 text-slate-400 hover:text-[#E52225] rounded hover:bg-red-50 dark:hover:bg-neutral-900"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-neutral-800 text-center">
                      <div>
                        <div className="text-[10px] text-slate-400">{isAr ? 'مؤرشف' : 'Archived'}</div>
                        <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {dossier.archivedCount} / {dossier.totalProjects}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">{isAr ? 'مفقود' : 'Missing'}</div>
                        <div className="text-xs font-bold text-[#E52225] tabular-nums">
                          {dossier.missingCount > 0 ? dossier.missingCount : '-'}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-400">{isAr ? 'انتظار' : 'Pending'}</div>
                        <div className="text-xs font-bold text-slate-400 tabular-nums">{dossier.pendingCount}</div>
                      </div>
                    </div>

                    <div className="mt-3">
                      <div className="w-full bg-slate-100 dark:bg-neutral-900 rounded-full h-1.5 overflow-hidden flex">
                        <div className="bg-emerald-500 h-full" style={{ width: `${dPct}%` }} />
                        <div
                          className="bg-[#E52225] h-full"
                          style={{ width: `${dossier.totalProjects ? (dossier.missingCount / dossier.totalProjects) * 100 : 0}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 pt-2 flex items-center justify-between text-xs text-slate-500 group-hover:text-[#E52225] transition-colors">
                    <span className="text-[11px] font-semibold">{dPct}% {isAr ? 'مكتمل' : 'complete'}</span>
                    <div className="flex items-center gap-1 text-[11px] font-medium">
                      <span>{isAr ? `عرض الفروع (${dossier.totalProjects})` : `View branches (${dossier.totalProjects})`}</span>
                      <DirectionalArrow className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- 4. DOSSIERS VIEW -------------------- */
  if (activeTab === 'dossiers' || (activeTab === 'archive' && archiveSubTab === 'dossiers')) {
    const filteredDossiers = sortedDossiers.filter(d => {
      const q = searchTerm.trim().toLowerCase();
      const dProjects = projects.filter(p => p.boxId === d.boxId && p.dossierNumber === d.dossierNumber);
      const matchSearch =
        !q ||
        d.id.toLowerCase().includes(q) ||
        (d.weekStart || '').includes(q) ||
        (d.weekEnd || '').includes(q) ||
        dProjects.some(
          p =>
            (p.branchName || '').toLowerCase().includes(q) ||
            String(p.shipmentNo || '').includes(q)
        );
      if (!matchSearch) return false;
      if (boxFilter !== 'all' && d.boxId !== boxFilter) return false;
      if (dossierStatusFilter !== 'all' && d.status !== dossierStatusFilter) return false;
      if (!dossierOverlapsDateRange(d)) return false;
      return true;
    });

    const allFilteredDossiersSelected =
      filteredDossiers.length > 0 && filteredDossiers.every(d => selectedDossierIds.includes(d.id));

    return (
      <div className="space-y-6">
        {activeTab === 'archive' && renderArchiveSubTabs()}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <div className="text-[11px] font-bold mb-0.5 text-[#E52225] dark:text-red-400">
              {isAr ? 'أرشفة تعليقات الفروع' : 'Branch Comments Archive'}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <FolderArchive className="w-6 h-6 text-[#E52225]" />
              <span>{isAr ? 'الدوسيهات' : 'Dossiers'}</span>
            </h1>
          </div>

          {canEdit && filteredDossiers.length > 0 && (
            <button
              type="button"
              onClick={() =>
                setSelectedDossierIds(allFilteredDossiersSelected ? [] : filteredDossiers.map(d => d.id))
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 hover:border-[#E52225] hover:text-[#E52225] rounded-lg transition-colors shrink-0"
            >
              <CheckSquare className="w-3.5 h-3.5 text-[#E52225]" />
              <span>
                {allFilteredDossiersSelected
                  ? isAr
                    ? 'إلغاء تحديد الكل'
                    : 'Deselect All'
                  : isAr
                  ? `تحديد كل الدوسيهات (${filteredDossiers.length})`
                  : `Select All (${filteredDossiers.length})`}
              </span>
            </button>
          )}
        </div>

        {renderDateStatusFilterCard('dossiers', filteredDossiers.length)}

        {renderDossierBulkBar(filteredDossiers)}
        {renderDossierStatusModal()}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDossiers.map(dossier => {
            const pct = dossier.totalProjects > 0 ? Math.round((dossier.archivedCount / dossier.totalProjects) * 100) : 0;
            const isSelected = selectedDossierIds.includes(dossier.id);
            return (
              <div
                key={dossier.id}
                onClick={() => {
                  onSelectDossier(dossier.id);
                  onNavigate('dossier-detail', dossier.id);
                }}
                className={`p-4 border rounded-xl hover:shadow-xs cursor-pointer transition-all flex flex-col justify-between group ${
                  isSelected
                    ? 'bg-red-50/50 dark:bg-red-950/20 border-[#E52225] ring-1 ring-[#E52225]/30'
                    : 'bg-white dark:bg-[#111111] border-slate-200 dark:border-neutral-800 hover:border-[#E52225]/60'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {canEdit && (
                        <div onClick={e => e.stopPropagation()} className="pt-0.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectDossier(dossier.id)}
                            title={isAr ? 'تحديد الدوسيه' : 'Select dossier'}
                            className="rounded border-slate-300 text-[#E52225] focus:ring-[#E52225] cursor-pointer"
                          />
                        </div>
                      )}
                      <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center font-bold text-[#E52225] dark:text-red-400 text-sm shrink-0">
                        {dossier.dossierNumber}
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-[#E52225] transition-colors">
                          {dossier.boxId} · {isAr ? `دوسيه ${dossier.dossierNumber}` : `Dossier ${dossier.dossierNumber}`}
                        </div>
                        <div className="text-[11px] text-slate-500 tabular-nums">
                          {fmtDate(dossier.weekStart)} → {fmtDate(dossier.weekEnd)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                      {statusBadge(dossier.status)}
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => openDossierStatusModal(dossier)}
                          title={isAr ? 'تحديد حالة الدوسيه بالكامل' : 'Change Dossier Status'}
                          className="p-1 text-slate-400 hover:text-[#E52225] rounded hover:bg-red-50 dark:hover:bg-neutral-900"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-neutral-800 text-center">
                    <div>
                      <div className="text-[10px] text-slate-400">{isAr ? 'مؤرشف' : 'Archived'}</div>
                      <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {dossier.archivedCount} / {dossier.totalProjects}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">{isAr ? 'مفقود' : 'Missing'}</div>
                      <div className="text-xs font-bold text-[#E52225] tabular-nums">
                        {dossier.missingCount > 0 ? dossier.missingCount : '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-400">{isAr ? 'انتظار' : 'Pending'}</div>
                      <div className="text-xs font-bold text-slate-400 tabular-nums">{dossier.pendingCount}</div>
                    </div>
                  </div>

                  <div className="mt-3">
                    <div className="w-full bg-slate-100 dark:bg-neutral-900 rounded-full h-1.5 overflow-hidden flex">
                      <div className="bg-emerald-500 h-full" style={{ width: `${pct}%` }} />
                      <div
                        className="bg-[#E52225] h-full"
                        style={{ width: `${dossier.totalProjects ? (dossier.missingCount / dossier.totalProjects) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 pt-2 flex items-center justify-between text-xs text-slate-500 group-hover:text-[#E52225] transition-colors">
                  <span className="text-[11px] font-semibold">{pct}% {isAr ? 'مكتمل' : 'complete'}</span>
                  <div className="flex items-center gap-1 text-[11px] font-medium">
                    <span>{isAr ? `عرض الفروع (${dossier.totalProjects})` : `View branches (${dossier.totalProjects})`}</span>
                    <DirectionalArrow className="w-3.5 h-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {filteredDossiers.length === 0 && (
          <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl py-12 px-4 text-center text-xs text-slate-400">
            {isAr ? 'لا توجد دوسيهات مطابقة حالياً.' : 'No matching dossiers found.'}
          </div>
        )}
      </div>
    );
  }

  /* -------------------- 5. DOSSIER DETAIL (BRANCHES OF THE WEEK) -------------------- */
  if (activeTab === 'dossier-detail') {
    const dossier: Dossier | undefined = sortedDossiers.find(d => d.id === selectedDossierId) || sortedDossiers[0];
    if (!dossier) {
      return (
        <div className="p-8 text-center bg-white dark:bg-[#111111] rounded-xl border border-slate-200 dark:border-neutral-800 space-y-3">
          <p className="text-sm text-slate-500">{isAr ? 'الدوسيه غير موجود.' : 'Dossier not found.'}</p>
          <button type="button" onClick={() => onNavigate('dossiers')} className="text-xs font-semibold text-[#E52225] underline">
            {isAr ? 'العودة للدوسيهات' : 'Back to Dossiers'}
          </button>
        </div>
      );
    }

    const dossierBranches = projects
      .filter(p => p.boxId === dossier.boxId && p.dossierNumber === dossier.dossierNumber)
      .filter(p => statusFilter === 'all' || p.status === statusFilter)
      .sort((a, b) => (a.startDate || '').localeCompare(b.startDate || '') || (a.shipmentNo ?? 0) - (b.shipmentNo ?? 0));

    const allSelectedInDossier =
      dossierBranches.length > 0 && dossierBranches.every(b => selectedJobIds.includes(b.jobId));

    const pct = dossier.totalProjects > 0 ? Math.round((dossier.archivedCount / dossier.totalProjects) * 100) : 0;

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('box-detail', dossier.boxId)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-neutral-800 hover:border-[#E52225] hover:text-[#E52225] transition-colors text-slate-600 dark:text-neutral-300"
            >
              <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                  {isAr
                    ? `دوسيه ${dossier.dossierNumber} (بوكس ${dossier.boxId})`
                    : `Dossier ${dossier.dossierNumber} (Box ${dossier.boxId})`}
                </h1>
                {statusBadge(dossier.status)}
              </div>
              <p className="text-xs text-slate-500 dark:text-neutral-400 mt-0.5 tabular-nums">
                {isAr ? 'أسبوع التشغيل:' : 'Operational Week:'} {fmtDate(dossier.weekStart)} → {fmtDate(dossier.weekEnd)} ({dossier.totalProjects}{' '}
                {isAr ? 'فرع / إرسالية' : 'branches'})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => openDossierStatusModal(dossier)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 hover:border-[#E52225] hover:text-[#E52225] rounded-lg transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5 text-[#E52225]" />
                <span>{isAr ? 'تحديد حالة الدوسيه' : 'Change Dossier Status'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('labels', `${dossier.boxId}:${dossier.dossierNumber}`)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{isAr ? 'طباعة ليبل الدوسيه' : 'Print Dossier Label'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white dark:bg-[#111111] p-4 rounded-xl border border-slate-200 dark:border-neutral-800">
          <div>
            <span className="text-[11px] text-slate-500">{isAr ? 'مؤرشف' : 'Archived'}</span>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {dossier.archivedCount} / {dossier.totalProjects}
            </div>
            <span className="text-[10px] text-slate-400">{pct}% {isAr ? 'مكتمل' : 'completed'}</span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500">{isAr ? 'مفقود' : 'Missing'}</span>
            <div className="text-xl font-bold text-[#E52225] tabular-nums">{dossier.missingCount}</div>
          </div>
          <div>
            <span className="text-[11px] text-slate-500">{isAr ? 'قيد الانتظار' : 'Pending'}</span>
            <div className="text-xl font-bold text-slate-700 dark:text-neutral-300 tabular-nums">{dossier.pendingCount}</div>
          </div>
          <div>
            <span className="text-[11px] text-slate-500">{isAr ? 'إجمالي الإرساليات' : 'Total Shipments'}</span>
            <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{dossier.totalProjects}</div>
          </div>
        </div>

        {/* Status filter + Bulk action bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#111111] p-3 rounded-xl border border-slate-200 dark:border-neutral-800">
          <div className="flex items-center gap-1 flex-wrap">
            {(['all', 'Archived', 'Pending', 'Missing'] as const).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  statusFilter === s
                    ? 'bg-[#E52225] text-white font-semibold'
                    : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900'
                }`}
              >
                {s === 'all' ? (isAr ? `الكل (${dossier.totalProjects})` : `All (${dossier.totalProjects})`) : s === 'Archived' ? (isAr ? `مؤرشف (${dossier.archivedCount})` : `Archived (${dossier.archivedCount})`) : s === 'Pending' ? (isAr ? `انتظار (${dossier.pendingCount})` : `Pending (${dossier.pendingCount})`) : isAr ? `مفقود (${dossier.missingCount})` : `Missing (${dossier.missingCount})`}
              </button>
            ))}
          </div>

          {canEdit && selectedJobIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-[#E52225]">
                {isAr ? `محدد: ${selectedJobIds.length}` : `Selected: ${selectedJobIds.length}`}
              </span>
              <button
                type="button"
                onClick={() => handleBulkStatus('Archived')}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {isAr ? 'تعيين مؤرشف' : 'Set Archived'}
              </button>
              <button
                type="button"
                onClick={() => handleBulkStatus('Pending')}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-slate-600 text-white hover:bg-slate-700"
              >
                {isAr ? 'قيد الانتظار' : 'Set Pending'}
              </button>
              <button
                type="button"
                onClick={() => handleBulkStatus('Missing')}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-[#E52225] text-white hover:bg-[#C81D20]"
              >
                {isAr ? 'مفقود' : 'Set Missing'}
              </button>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 dark:bg-neutral-900/80 text-slate-500 text-[11px] font-semibold border-b border-slate-200 dark:border-neutral-800">
                <tr>
                  {canEdit && (
                    <th className="px-3 py-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allSelectedInDossier}
                        onChange={e =>
                          setSelectedJobIds(e.target.checked ? dossierBranches.map(b => b.jobId) : [])
                        }
                        className="rounded border-slate-300 text-[#E52225] focus:ring-[#E52225]"
                      />
                    </th>
                  )}
                  <th className="px-3 py-3 w-10 text-center">#</th>
                  <th className="px-3 py-3 text-start min-w-[165px]">{isAr ? 'اسم الفرع' : 'Branch Name'}</th>
                  <th className="px-3 py-3 text-start whitespace-nowrap">{isAr ? 'رقم الإرسالية' : 'Shipment No.'}</th>
                  <th className="px-3 py-3 text-start min-w-[120px]">{isAr ? 'المنطقة / الجناح' : 'Region / Wing'}</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">{isAr ? 'عدد المناديل' : 'Folders'}</th>
                  <th className="px-3 py-3 text-start whitespace-nowrap">{isAr ? 'تاريخ التشغيل' : 'Operational Date'}</th>
                  <th className="px-3 py-3 text-start whitespace-nowrap">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {dossierBranches.map((p, idx) => (
                  <tr
                    key={p.jobId}
                    onClick={() => openBranchDetail(p)}
                    className="hover:bg-slate-50/70 dark:hover:bg-neutral-900/40 cursor-pointer transition-colors"
                  >
                    {canEdit && (
                      <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedJobIds.includes(p.jobId)}
                          onChange={() => toggleSelectId(p.jobId)}
                          className="rounded border-slate-300 text-[#E52225] focus:ring-[#E52225]"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2.5 text-center text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-slate-900 dark:text-white">{p.branchName || '—'}</div>
                      {p.branchCode && <div className="text-[10px] text-slate-400 font-mono">{p.branchCode}</div>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="font-mono font-bold px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-[#E52225] dark:text-red-300">
                        {p.shipmentNo ?? '—'}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {p.region ? (
                        <div className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-neutral-200">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{p.region}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                      {p.wing && (
                        <div className="text-[10px] text-slate-400 mt-0.5">{p.wing}</div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold tabular-nums bg-slate-100 dark:bg-neutral-900 text-slate-800 dark:text-neutral-200">
                        {p.folderCount ?? 0}
                        <span className="text-[10px] font-normal text-slate-500">{isAr ? 'منديل' : 'f'}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                      <div className="font-medium text-slate-700 dark:text-neutral-300">{fmtDate(p.startDate)}</div>
                      {p.endDate && (
                        <div className="text-[10px] text-slate-400">
                          {isAr ? 'إلى' : 'to'} {fmtDate(p.endDate)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{statusBadge(p.status)}</td>
                    <td className="px-3 py-2.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => openBranchDetail(p)}
                          title={isAr ? 'تفاصيل الفرع' : 'Branch Details'}
                          className="p-1.5 text-slate-500 hover:text-[#E52225] rounded hover:bg-slate-100 dark:hover:bg-neutral-900"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBranch(p);
                              setEditStatus(p.status);
                              setEditNote('');
                            }}
                            title={isAr ? 'تغيير الحالة' : 'Change Status'}
                            className="p-1.5 text-slate-500 hover:text-[#E52225] rounded hover:bg-red-50 dark:hover:bg-neutral-900"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {dossierBranches.length === 0 && (
                  <tr>
                    <td colSpan={canEdit ? 9 : 8} className="py-10 text-center text-slate-400">
                      {isAr ? 'لا توجد فروع في هذا الدوسيه.' : 'No branches in this dossier.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {renderDossierStatusModal()}
        {renderBranchModals()}
      </div>
    );
  }

  /* -------------------- 6. BRANCHES DIRECTORY ("صفحة الفروع") -------------------- */
  if (activeTab === 'projects' || (activeTab === 'archive' && archiveSubTab === 'branches')) {
    const filteredBranches = projects
      .filter(p => {
        const q = searchTerm.trim().toLowerCase();
        const matchSearch =
          !q ||
          (p.branchName || '').toLowerCase().includes(q) ||
          (p.branchCode || '').toLowerCase().includes(q) ||
          String(p.shipmentNo ?? '').includes(q) ||
          String(p.jobId) === q ||
          (p.startDate || '').includes(q) ||
          fmtDate(p.startDate).includes(q) ||
          p.boxId.toLowerCase().includes(q) ||
          `${p.boxId}-${p.dossierNumber}`.toLowerCase().includes(q) ||
          (p.region || '').toLowerCase().includes(q) ||
          (p.wing || '').toLowerCase().includes(q) ||
          String(p.folderCount ?? '').includes(q);
        if (!matchSearch) return false;
        if (boxFilter !== 'all' && p.boxId !== boxFilter) return false;
        if (dossierFilter !== 'all' && `${p.boxId}-${p.dossierNumber}` !== dossierFilter) return false;
        if (regionFilter !== 'all' && (p.region || '').trim() !== regionFilter) return false;
        if (statusFilter !== 'all' && p.status !== statusFilter) return false;
        if (!matchesDateRange(p.startDate || p.weekStart)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          (a.startDate || '').localeCompare(b.startDate || '') ||
          (a.branchName || '').localeCompare(b.branchName || '') ||
          (a.shipmentNo ?? 0) - (b.shipmentNo ?? 0)
      );

    const totalFilteredFolders = filteredBranches.reduce((sum, p) => sum + (p.folderCount || 0), 0);
    const totalPages = Math.ceil(filteredBranches.length / pageSize) || 1;
    const safePage = Math.min(currentPage, totalPages);
    const paginated = filteredBranches.slice((safePage - 1) * pageSize, safePage * pageSize);
    const allPageSelected = paginated.length > 0 && paginated.every(b => selectedJobIds.includes(b.jobId));

    return (
      <div className="space-y-5">
        {activeTab === 'archive' && renderArchiveSubTabs()}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <div className="text-[11px] font-bold mb-0.5 text-[#E52225] dark:text-red-400">
              {isAr ? 'أرشفة تعليقات الفروع' : 'Branch Comments Archive'}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <CheckSquare className="w-6 h-6 text-[#E52225]" />
              <span>{isAr ? 'الفروع والإرساليات' : 'Branches & Shipments'}</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800">
              {isAr ? 'إجمالي الفروع:' : 'Branches:'}{' '}
              <strong className="text-[#E52225] dark:text-red-400 tabular-nums">{filteredBranches.length.toLocaleString()}</strong>
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800">
              {isAr ? 'إجمالي المناديل:' : 'Total Folders:'}{' '}
              <strong className="text-slate-900 dark:text-white tabular-nums">{totalFilteredFolders.toLocaleString()}</strong>
            </span>
          </div>
        </div>

        {/* Date From / Date To + Status + Search Filter Card */}
        {renderDateStatusFilterCard('branches', filteredBranches.length)}

        {/* Bulk Selection & Status Action Bar */}
        {canEdit && selectedJobIds.length > 0 && (
          <div className="bg-red-50/90 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-extrabold text-[#E52225] dark:text-red-300">
                {isAr ? `تم تحديد ${selectedJobIds.length} فرع` : `${selectedJobIds.length} branches selected`}
              </span>
              {filteredBranches.length > paginated.length && selectedJobIds.length < filteredBranches.length && (
                <button
                  type="button"
                  onClick={() => setSelectedJobIds(filteredBranches.map(b => b.jobId))}
                  className="text-[11px] font-semibold underline text-slate-700 dark:text-neutral-200 hover:text-[#E52225]"
                >
                  {isAr ? `تحديد كل النتائج (${filteredBranches.length})` : `Select all ${filteredBranches.length} matching`}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedJobIds([])}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-white"
              >
                {isAr ? 'إلغاء التحديد' : 'Clear'}
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={bulkNote}
                onChange={e => setBulkNote(e.target.value)}
                placeholder={isAr ? 'ملاحظة للتحديث الجماعي (اختياري)...' : 'Bulk update note (optional)...'}
                className="px-2.5 py-1.5 text-xs bg-white dark:bg-[#111111] border border-red-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#E52225] w-52"
              />
              <button
                type="button"
                onClick={() => handleBulkStatus('Archived')}
                className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
              >
                {isAr ? 'تعيين كمؤرشف' : 'Mark Archived'}
              </button>
              <button
                type="button"
                onClick={() => handleBulkStatus('Pending')}
                className="px-3 py-1.5 text-xs font-bold text-white bg-slate-600 hover:bg-slate-700 rounded-lg"
              >
                {isAr ? 'قيد الانتظار' : 'Mark Pending'}
              </button>
              <button
                type="button"
                onClick={() => handleBulkStatus('Missing')}
                className="px-3 py-1.5 text-xs font-bold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg"
              >
                {isAr ? 'تعيين كمفقود' : 'Mark Missing'}
              </button>
            </div>
          </div>
        )}

        {/* Branches Table — cleanly balanced columns for Name, Shipment, Region/Wing, Folders (المناديل), Dates, Dossier, Status */}
        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 dark:bg-neutral-900/80 text-slate-500 text-[11px] font-semibold border-b border-slate-200 dark:border-neutral-800">
                <tr>
                  {canEdit && (
                    <th className="px-3 py-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={allPageSelected}
                        onChange={e => {
                          const pageIds = paginated.map(b => b.jobId);
                          if (e.target.checked) {
                            setSelectedJobIds(prev => Array.from(new Set([...prev, ...pageIds])));
                          } else {
                            setSelectedJobIds(prev => prev.filter(id => !pageIds.includes(id)));
                          }
                        }}
                        className="rounded border-slate-300 text-[#E52225] focus:ring-[#E52225]"
                      />
                    </th>
                  )}
                  <th className="px-2.5 py-3 w-10 text-center">#</th>
                  <th className="px-3 py-3 text-start min-w-[175px]">{isAr ? 'اسم الفرع' : 'Branch Name'}</th>
                  <th className="px-3 py-3 text-start whitespace-nowrap">{isAr ? 'رقم الإرسالية' : 'Shipment No.'}</th>
                  <th className="px-3 py-3 text-start min-w-[125px]">{isAr ? 'المنطقة / الجناح' : 'Region / Wing'}</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">{isAr ? 'عدد المناديل' : 'Folders'}</th>
                  <th className="px-3 py-3 text-start whitespace-nowrap">{isAr ? 'تاريخ التشغيل' : 'Operational Date'}</th>
                  <th className="px-3 py-3 text-start min-w-[145px]">{isAr ? 'البوكس / الدوسيه' : 'Box / Dossier'}</th>
                  <th className="px-3 py-3 text-start whitespace-nowrap">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-3 py-3 text-center whitespace-nowrap">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                {paginated.map((p, idx) => {
                  const repeatCount = p.branchName ? branchRepeatCount.get(p.branchName.trim()) || 1 : 1;
                  const dossier = dossiers.find(d => d.boxId === p.boxId && d.dossierNumber === p.dossierNumber);
                  return (
                    <tr
                      key={p.jobId}
                      onClick={() => openBranchDetail(p)}
                      className="hover:bg-slate-50/70 dark:hover:bg-neutral-900/40 cursor-pointer transition-colors"
                    >
                      {canEdit && (
                        <td className="px-3 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedJobIds.includes(p.jobId)}
                            onChange={() => toggleSelectId(p.jobId)}
                            className="rounded border-slate-300 text-[#E52225] focus:ring-[#E52225]"
                          />
                        </td>
                      )}
                      <td className="px-2.5 py-2.5 text-center text-slate-400 tabular-nums">
                        {(safePage - 1) * pageSize + idx + 1}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-bold text-slate-900 dark:text-white">{p.branchName || '—'}</span>
                          {repeatCount > 1 && (
                            <span
                              title={isAr ? `الفرع متكرر (${repeatCount} إرساليات)` : `Branch has ${repeatCount} shipments`}
                              className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-[#B45309] dark:text-amber-300"
                            >
                              {repeatCount}×
                            </span>
                          )}
                        </div>
                        {p.branchCode && (
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            {isAr ? 'كود:' : 'Code:'} {p.branchCode}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="font-mono font-extrabold px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-[#E52225] dark:text-red-300">
                          {p.shipmentNo ?? '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {p.region ? (
                          <div className="inline-flex items-center gap-1 font-medium text-slate-700 dark:text-neutral-200">
                            <MapPin className="w-3 h-3 text-[#E52225]/70 shrink-0" />
                            <span>{p.region}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                        {p.wing && (
                          <div className="text-[10px] text-slate-500 dark:text-neutral-400 mt-0.5">{p.wing}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold tabular-nums bg-slate-100 dark:bg-neutral-900 text-slate-800 dark:text-neutral-200">
                          {p.folderCount ?? 0}
                          <span className="text-[10px] font-normal text-slate-500">{isAr ? 'منديل' : 'f'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                        <div className="font-medium text-slate-700 dark:text-neutral-300">{fmtDate(p.startDate)}</div>
                        {p.endDate && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            {isAr ? 'إلى' : 'to'} {fmtDate(p.endDate)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-[11px] whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => {
                            const dId = `${p.boxId}-${p.dossierNumber}`;
                            onSelectDossier(dId);
                            onNavigate('dossier-detail', dId);
                          }}
                          className="text-start hover:underline"
                        >
                          <div className="font-bold text-slate-800 dark:text-neutral-200 font-mono">
                            {p.boxId} · {isAr ? `دوسيه ${p.dossierNumber}` : `Dossier ${p.dossierNumber}`}
                          </div>
                          <div className="text-[10px] text-slate-400 tabular-nums">
                            {dossier ? `${fmtDate(dossier.weekStart)} → ${fmtDate(dossier.weekEnd)}` : fmtDate(p.weekStart)}
                          </div>
                        </button>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{statusBadge(p.status)}</td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => openBranchDetail(p)}
                            title={isAr ? 'تفاصيل الفرع' : 'Branch Details'}
                            className="p-1.5 text-slate-500 hover:text-[#E52225] rounded hover:bg-slate-100 dark:hover:bg-neutral-900"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canEdit && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingBranch(p);
                                setEditStatus(p.status);
                                setEditNote('');
                              }}
                              title={isAr ? 'تعديل الحالة' : 'Change Status'}
                              className="p-1.5 text-slate-500 hover:text-[#E52225] rounded hover:bg-red-50 dark:hover:bg-neutral-900"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {paginated.length === 0 && (
                  <tr>
                    <td colSpan={canEdit ? 10 : 9} className="py-12 text-center text-slate-400">
                      {isAr ? 'لا توجد فروع مطابقة حالياً.' : 'No matching branches found.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="p-3 bg-slate-50/60 dark:bg-neutral-900/40 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between text-xs text-slate-500">
            <div>
              {isAr
                ? `عرض ${filteredBranches.length ? (safePage - 1) * pageSize + 1 : 0} إلى ${Math.min(safePage * pageSize, filteredBranches.length)} من ${filteredBranches.length}`
                : `Showing ${filteredBranches.length ? (safePage - 1) * pageSize + 1 : 0} to ${Math.min(safePage * pageSize, filteredBranches.length)} of ${filteredBranches.length}`}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage === 1}
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-neutral-800 disabled:opacity-30 hover:bg-white dark:hover:bg-neutral-900"
              >
                {isAr ? 'السابق' : 'Previous'}
              </button>
              <span className="px-2 font-bold tabular-nums">
                {safePage} / {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage === totalPages}
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1 rounded border border-slate-200 dark:border-neutral-800 disabled:opacity-30 hover:bg-white dark:hover:bg-neutral-900"
              >
                {isAr ? 'التالي' : 'Next'}
              </button>
            </div>
          </div>
        </div>

        {renderBranchModals()}
      </div>
    );
  }

  function renderArchiveSubTabs() {
    return (
      <div className="flex items-center gap-2 bg-white dark:bg-[#111111] p-2 rounded-xl border border-slate-200 dark:border-neutral-800 w-fit">
        {(
          [
            { id: 'boxes', label: isAr ? `البوكسات (${sortedBoxes.length})` : `Boxes (${sortedBoxes.length})` },
            { id: 'dossiers', label: isAr ? `الدوسيهات (${sortedDossiers.length})` : `Dossiers (${sortedDossiers.length})` },
            { id: 'branches', label: isAr ? `الفروع (${projects.length})` : `Branches (${projects.length})` },
          ] as const
        ).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setArchiveSubTab(tab.id)}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-colors ${
              archiveSubTab === tab.id
                ? 'bg-[#E52225] text-white'
                : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );
  }

  /* -------------------- 7. REPORTS VIEW -------------------- */
  if (activeTab === 'reports') {
    const reportQuery = reportSearch.trim().toLowerCase();

    const dossiersByBox = new Map<string, Dossier[]>();
    for (const d of sortedDossiers) {
      const list = dossiersByBox.get(d.boxId) || [];
      list.push(d);
      dossiersByBox.set(d.boxId, list);
    }

    const projectsByBox = new Map<string, Project[]>();
    const dossierFoldersMap = new Map<string, number>();
    for (const p of projects) {
      const list = projectsByBox.get(p.boxId) || [];
      list.push(p);
      projectsByBox.set(p.boxId, list);
      const dKey = `${p.boxId}-${p.dossierNumber}`;
      dossierFoldersMap.set(dKey, (dossierFoldersMap.get(dKey) || 0) + (p.folderCount ?? 0));
    }

    const boxMetaMap = new Map<
      string,
      {
        periodLabel: string;
        foldersCount: number;
        isMonthly: boolean;
        completedDossiers: number;
        filledDossiers: number;
        totalDossiers: number;
      }
    >();

    const allDistributionItems: CommentsBoxDistributionItem[] = sortedBoxes.map(b => {
      const boxDossiers = dossiersByBox.get(b.boxCode) || [];
      const boxProjects = projectsByBox.get(b.boxCode) || [];
      const totalDossiers = b.totalDossiers || 6;
      const isMonthly = totalDossiers === 2;
      const foldersCount = boxProjects.reduce((sum, p) => sum + (p.folderCount ?? 0), 0);

      const startDates = [
        ...boxDossiers.map(d => d.weekStart).filter(Boolean),
        ...boxProjects.map(p => p.startDate).filter(Boolean),
      ].sort();
      const endDates = [
        ...boxDossiers.map(d => d.weekEnd || d.weekStart).filter(Boolean),
        ...boxProjects.map(p => p.startDate).filter(Boolean),
      ].sort();

      const minStart = startDates[0];
      const maxEnd = endDates[endDates.length - 1];
      const periodLabel =
        minStart && maxEnd && minStart !== maxEnd
          ? `${fmtDate(minStart)} → ${fmtDate(maxEnd)}`
          : minStart
          ? fmtDate(minStart)
          : '—';

      const completedDossiers = boxDossiers.filter(d => d.status === 'Archived').length;
      boxMetaMap.set(b.boxCode, {
        periodLabel,
        foldersCount,
        isMonthly,
        completedDossiers,
        filledDossiers: boxDossiers.length,
        totalDossiers,
      });

      return {
        boxCode: b.boxCode,
        totalDossiers,
        isMonthly,
        periodLabel,
        totalProjects: b.totalProjects,
        archivedProjects: b.archivedProjects,
        missingProjects: b.missingProjects,
        pendingProjects: b.pendingProjects,
        foldersCount,
        status: b.status,
        dossiers: boxDossiers.map(d => {
          const dFolders = dossierFoldersMap.get(d.id) ?? dossierFoldersMap.get(`${d.boxId}-${d.dossierNumber}`) ?? 0;
          const dPeriod =
            d.weekStart && d.weekEnd && d.weekStart !== d.weekEnd
              ? `${fmtDate(d.weekStart)} → ${fmtDate(d.weekEnd)}`
              : fmtDate(d.weekStart || d.weekEnd);
          return {
            id: d.id,
            dossierNumber: d.dossierNumber,
            periodLabel: dPeriod,
            totalProjects: d.totalProjects,
            archivedCount: d.archivedCount,
            missingCount: d.missingCount,
            pendingCount: d.pendingCount,
            foldersCount: dFolders,
            status: d.status,
          };
        }),
      };
    });

    const filteredDistributionItems = allDistributionItems.filter(item => {
      if (reportBoxFilter !== 'all' && item.boxCode !== reportBoxFilter) return false;
      if (!reportQuery) return true;
      if (
        item.boxCode.toLowerCase().includes(reportQuery) ||
        item.periodLabel.toLowerCase().includes(reportQuery) ||
        item.status.toLowerCase().includes(reportQuery)
      ) {
        return true;
      }
      if (
        item.dossiers.some(
          d =>
            d.id.toLowerCase().includes(reportQuery) ||
            d.periodLabel.toLowerCase().includes(reportQuery) ||
            d.status.toLowerCase().includes(reportQuery)
        )
      ) {
        return true;
      }
      const boxProjects = projectsByBox.get(item.boxCode) || [];
      return boxProjects.some(
        p =>
          (p.branchName || '').toLowerCase().includes(reportQuery) ||
          (p.branchCode || '').toLowerCase().includes(reportQuery) ||
          (p.region || '').toLowerCase().includes(reportQuery) ||
          String(p.shipmentNo || '').toLowerCase().includes(reportQuery)
      );
    });

    const reportProjects = projects.filter(p => {
      if (reportBoxFilter !== 'all' && p.boxId !== reportBoxFilter) return false;
      if (!reportQuery) return true;
      return (
        (p.branchName || '').toLowerCase().includes(reportQuery) ||
        (p.branchCode || '').toLowerCase().includes(reportQuery) ||
        (p.region || '').toLowerCase().includes(reportQuery) ||
        String(p.shipmentNo || '').toLowerCase().includes(reportQuery) ||
        p.boxId.toLowerCase().includes(reportQuery) ||
        `${p.boxId}-${p.dossierNumber}`.toLowerCase().includes(reportQuery)
      );
    });

    const reportDossiers = sortedDossiers.filter(d => {
      if (reportBoxFilter !== 'all' && d.boxId !== reportBoxFilter) return false;
      if (!reportQuery) return true;
      return (
        d.id.toLowerCase().includes(reportQuery) ||
        d.boxId.toLowerCase().includes(reportQuery) ||
        (d.weekStart || '').toLowerCase().includes(reportQuery) ||
        (d.weekEnd || '').toLowerCase().includes(reportQuery) ||
        d.status.toLowerCase().includes(reportQuery)
      );
    });

    const reportBoxes = sortedBoxes.filter(b => {
      if (reportBoxFilter !== 'all' && b.boxCode !== reportBoxFilter) return false;
      if (!reportQuery) return true;
      const meta = boxMetaMap.get(b.boxCode);
      return (
        b.boxCode.toLowerCase().includes(reportQuery) ||
        b.status.toLowerCase().includes(reportQuery) ||
        (meta?.periodLabel || '').toLowerCase().includes(reportQuery)
      );
    });

    const completedBoxes = reportBoxes.filter(b => b.status === 'Archived');
    const inprogressBoxes = reportBoxes.filter(b => b.status !== 'Archived');

    const distDossiersCount = filteredDistributionItems.reduce((sum, b) => sum + b.dossiers.length, 0);
    const distBranchesCount = filteredDistributionItems.reduce((sum, b) => sum + b.totalProjects, 0);
    const distArchivedCount = filteredDistributionItems.reduce((sum, b) => sum + b.archivedProjects, 0);
    const distFoldersCount = filteredDistributionItems.reduce((sum, b) => sum + b.foldersCount, 0);
    const reportArchivedCount = reportProjects.filter(p => p.status === 'Archived').length;
    const reportMissingCount = reportProjects.filter(p => p.status === 'Missing').length;
    const reportPendingCount = reportProjects.filter(p => p.status === 'Pending').length;
    const reportTotalFolders = reportProjects.reduce((sum, p) => sum + (p.folderCount ?? 0), 0);
    const reportRegionsCount = new Set(reportProjects.map(p => (p.region || '').trim()).filter(Boolean)).size;
    const reportArchivedPct =
      reportProjects.length > 0 ? ((reportArchivedCount / reportProjects.length) * 100).toFixed(1) : '0.0';

    const archiveSummaryRows: { metric: string; value: string | number; notes: string }[] = [
      {
        metric: isAr ? 'إجمالي البوكسات' : 'Total Boxes',
        value: reportBoxes.length,
        notes: isAr
          ? `شهري: ${reportBoxes.filter(b => (b.totalDossiers || 6) === 2).length} · أسبوعي: ${reportBoxes.filter(b => (b.totalDossiers || 6) !== 2).length}`
          : `Monthly: ${reportBoxes.filter(b => (b.totalDossiers || 6) === 2).length} · Weekly: ${reportBoxes.filter(b => (b.totalDossiers || 6) !== 2).length}`,
      },
      {
        metric: isAr ? 'البوكسات المكتملة' : 'Archived Boxes',
        value: completedBoxes.length,
        notes: isAr ? 'بوكسات مكتملة ومغلقة بالكامل' : '100% completed boxes',
      },
      {
        metric: isAr ? 'البوكسات الجارية' : 'In-Progress Boxes',
        value: inprogressBoxes.length,
        notes: isAr ? 'قيد الاستلام أو الاستكمال' : 'Active in-progress boxes',
      },
      {
        metric: isAr ? 'إجمالي الدوسيهات' : 'Total Dossiers',
        value: reportDossiers.length,
        notes: isAr
          ? `مكتمل: ${reportDossiers.filter(d => d.status === 'Archived').length} · جاري: ${reportDossiers.filter(d => d.status !== 'Archived').length}`
          : `Archived: ${reportDossiers.filter(d => d.status === 'Archived').length} · Active: ${reportDossiers.filter(d => d.status !== 'Archived').length}`,
      },
      {
        metric: isAr ? 'إجمالي الفروع والإرساليات' : 'Total Branches & Shipments',
        value: reportProjects.length,
        notes: isAr ? 'إجمالي السجلات المدرجة ضمن النطاق' : 'Total branch shipment records',
      },
      {
        metric: isAr ? 'الفروع المؤرشفة' : 'Archived Branches',
        value: `${reportArchivedCount} (${reportArchivedPct}%)`,
        notes: isAr ? 'تم استلامها وأرشفتها فعلياً' : 'Physically archived',
      },
      {
        metric: isAr ? 'الفروع المفقودة' : 'Missing Branches',
        value: reportMissingCount,
        notes: isAr ? 'سجلات مسجلة كمفقودة' : 'Marked as missing',
      },
      {
        metric: isAr ? 'الفروع قيد الانتظار' : 'Pending Branches',
        value: reportPendingCount,
        notes: isAr ? 'بانتظار الاستلام الفعلي' : 'Awaiting physical delivery',
      },
      {
        metric: isAr ? 'إجمالي المناديل / المجلدات' : 'Total Folders',
        value: reportTotalFolders,
        notes: isAr ? 'مجموع خانات المناديل للفروع' : 'Sum of branch folder counts',
      },
      {
        metric: isAr ? 'المناطق / الأجنحة المغطاة' : 'Covered Regions',
        value: reportRegionsCount,
        notes: isAr ? 'عدد المناطق الفريدة في النطاق' : 'Distinct branch regions',
      },
      {
        metric: isAr ? 'عمليات الرفع المسجلة' : 'Upload Batches',
        value: uploadHistory.length,
        notes: isAr ? 'ملفات خطط التشغيل المرفوعة' : 'Imported plan workbooks',
      },
    ];

    const hasExportableData =
      selectedReportTab === 'distribution'
        ? filteredDistributionItems.length > 0
        : selectedReportTab === 'archived-boxes'
        ? completedBoxes.length > 0
        : selectedReportTab === 'inprogress-boxes'
        ? inprogressBoxes.length > 0
        : selectedReportTab === 'box-details'
        ? reportBoxes.length > 0
        : selectedReportTab === 'dossiers'
        ? reportDossiers.length > 0
        : selectedReportTab === 'archive-summary'
        ? sortedBoxes.length > 0 || projects.length > 0
        : reportProjects.length > 0;

    const handleExportExcel = () => {
      const dateStr = new Date().toISOString().slice(0, 10);
      let sheetRows: Record<string, unknown>[] = [];
      let sheetName = 'Branches Archive';
      let fileName = `ARMS_Comments_Branches_${dateStr}.xlsx`;

      if (selectedReportTab === 'distribution') {
        sheetName = 'Boxes Dossiers Dist';
        fileName = `ARMS_Comments_Distribution_${dateStr}.xlsx`;
        let rowNum = 0;
        sheetRows = filteredDistributionItems.flatMap(box => {
          const slotCount = Math.max(box.dossiers.length, box.isMonthly ? 2 : 6);
          return Array.from({ length: slotCount }, (_, idx) => {
            rowNum += 1;
            const dossier = box.dossiers.find(d => d.dossierNumber === idx + 1) || box.dossiers[idx];
            return {
              '#': rowNum,
              'البوكس': box.boxCode,
              'نظام التوزيع': box.isMonthly ? 'شهري (2 دوسيه)' : 'أسبوعي (6 دوسيهات)',
              'فترة البوكس': box.periodLabel,
              'حالة البوكس': box.status,
              'رقم الدوسيه': idx + 1,
              'كود الدوسيه': dossier ? dossier.id : `${box.boxCode}-${idx + 1}`,
              'فترة الدوسيه': dossier ? dossier.periodLabel : 'فارغ',
              'إجمالي الفروع': dossier ? dossier.totalProjects : 0,
              'المؤرشف': dossier ? dossier.archivedCount : 0,
              'مفقود': dossier ? dossier.missingCount : 0,
              'قيد الانتظار': dossier ? dossier.pendingCount : 0,
              'عدد المناديل': dossier ? dossier.foldersCount : 0,
              'حالة الدوسيه': dossier ? dossier.status : 'Empty',
            };
          });
        });
      } else if (selectedReportTab === 'archived-boxes') {
        sheetName = 'Archived Boxes';
        fileName = `ARMS_Comments_Archived_Boxes_${dateStr}.xlsx`;
        sheetRows = completedBoxes.map((b, idx) => {
          const meta = boxMetaMap.get(b.boxCode);
          return {
            '#': idx + 1,
            'البوكس': b.boxCode,
            'النظام': meta?.isMonthly ? 'شهري (2)' : 'أسبوعي (6)',
            'الفترة': meta?.periodLabel || '—',
            'الدوسيهات': `${meta?.filledDossiers ?? 0} / ${meta?.totalDossiers ?? 6}`,
            'إجمالي الفروع': b.totalProjects,
            'المؤرشف': b.archivedProjects,
            'عدد المناديل': meta?.foldersCount ?? 0,
            'الحالة': b.status,
          };
        });
      } else if (selectedReportTab === 'inprogress-boxes') {
        sheetName = 'Inprogress Boxes';
        fileName = `ARMS_Comments_Inprogress_Boxes_${dateStr}.xlsx`;
        sheetRows = inprogressBoxes.map((b, idx) => {
          const meta = boxMetaMap.get(b.boxCode);
          const pct = b.totalProjects > 0 ? Math.round((b.archivedProjects / b.totalProjects) * 100) : 0;
          return {
            '#': idx + 1,
            'البوكس': b.boxCode,
            'النظام': meta?.isMonthly ? 'شهري (2)' : 'أسبوعي (6)',
            'الفترة': meta?.periodLabel || '—',
            'الدوسيهات': `${meta?.filledDossiers ?? 0} / ${meta?.totalDossiers ?? 6}`,
            'إجمالي الفروع': b.totalProjects,
            'المؤرشف': b.archivedProjects,
            'مفقود': b.missingProjects,
            'قيد الانتظار': b.pendingProjects,
            'نسبة الإنجاز': `${pct}%`,
            'عدد المناديل': meta?.foldersCount ?? 0,
            'الحالة': b.status,
          };
        });
      } else if (selectedReportTab === 'dossiers') {
        sheetName = 'Dossiers Overview';
        fileName = `ARMS_Comments_Dossiers_${dateStr}.xlsx`;
        sheetRows = reportDossiers.map((d, idx) => ({
          '#': idx + 1,
          'الدوسيه': d.id,
          'البوكس': d.boxId,
          'رقم الدوسيه': d.dossierNumber,
          'بداية الفترة': fmtDate(d.weekStart),
          'نهاية الفترة': fmtDate(d.weekEnd),
          'إجمالي الفروع': d.totalProjects,
          'المؤرشف': d.archivedCount,
          'مفقود': d.missingCount,
          'قيد الانتظار': d.pendingCount,
          'عدد المناديل': dossierFoldersMap.get(d.id) ?? dossierFoldersMap.get(`${d.boxId}-${d.dossierNumber}`) ?? 0,
          'الحالة': d.status,
        }));
      } else if (selectedReportTab === 'box-details') {
        sheetName = 'Box Dossier Details';
        fileName = `ARMS_Comments_Box_Details_${dateStr}.xlsx`;
        sheetRows = reportBoxes.map((b, idx) => {
          const meta = boxMetaMap.get(b.boxCode);
          const pct = b.totalProjects > 0 ? Math.round((b.archivedProjects / b.totalProjects) * 100) : 0;
          return {
            '#': idx + 1,
            'البوكس': b.boxCode,
            'النظام': meta?.isMonthly ? 'شهري (2)' : 'أسبوعي (6)',
            'فترة البوكس': meta?.periodLabel || '—',
            'الدوسيهات المفعلة': `${meta?.filledDossiers ?? 0} / ${meta?.totalDossiers ?? 6}`,
            'الدوسيهات المكتملة': meta?.completedDossiers ?? 0,
            'إجمالي الفروع': b.totalProjects,
            'المؤرشف': b.archivedProjects,
            'مفقود': b.missingProjects,
            'قيد الانتظار': b.pendingProjects,
            'عدد المناديل': meta?.foldersCount ?? 0,
            'نسبة الإنجاز': `${pct}%`,
            'الحالة': b.status,
          };
        });
      } else if (selectedReportTab === 'archive-summary') {
        sheetName = 'Archive Summary';
        fileName = `ARMS_Comments_Archive_Summary_${dateStr}.xlsx`;
        sheetRows = archiveSummaryRows.map((r, idx) => ({
          '#': idx + 1,
          'البند': r.metric,
          'العدد / القيمة': r.value,
          'ملاحظات': r.notes,
        }));
      } else {
        sheetRows = reportProjects.map((p, idx) => ({
          '#': idx + 1,
          'اسم الفرع': p.branchName || '',
          'كود الفرع': p.branchCode || '',
          'رقم الإرسالية': p.shipmentNo ?? '',
          'تاريخ بدء التشغيل': p.startDate || '',
          'البوكس': p.boxId,
          'الدوسيه': `${p.boxId}-${p.dossierNumber}`,
          'الأسبوع': p.weekStart || '',
          'المنطقة': p.region || '',
          'عدد المناديل': p.folderCount ?? 0,
          'الحالة': p.status,
        }));
      }

      const ws = XLSX.utils.json_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, fileName);
      showToast(
        isAr ? `تم تحميل التقرير بصيغة Excel: ${fileName}` : `Excel report downloaded: ${fileName}`,
        'success'
      );
    };

    const reportTemplates = [
      { id: 'branches' as const, label: isAr ? 'سجل الفروع والإرساليات' : 'Branches & Shipments Log' },
      { id: 'archived-boxes' as const, label: isAr ? 'تقرير البوكسات المكتملة' : 'Archived Boxes Report' },
      { id: 'inprogress-boxes' as const, label: isAr ? 'تقرير البوكسات الجارية' : 'Inprogress Boxes Report' },
      { id: 'dossiers' as const, label: isAr ? 'تقرير الدوسيهات الشامل' : 'Comprehensive Dossiers Report' },
      { id: 'box-details' as const, label: isAr ? 'تقرير تفاصيل البوكسات والدوسيهات' : 'Box & Dossier Details Report' },
      { id: 'distribution' as const, label: isAr ? 'توزيعة البوكسات والدوسيهات' : 'Boxes & Dossiers Distribution' },
      { id: 'archive-summary' as const, label: isAr ? 'الملخص العام للأرشفة' : 'General Archive Summary' },
    ];

    const cleanTitleEn =
      selectedReportTab === 'distribution'
        ? 'Boxes & Dossiers Distribution'
        : selectedReportTab === 'archived-boxes'
        ? 'Archived Boxes Report'
        : selectedReportTab === 'inprogress-boxes'
        ? 'Inprogress Boxes Report'
        : selectedReportTab === 'dossiers'
        ? 'Comprehensive Dossiers Report'
        : selectedReportTab === 'box-details'
        ? 'Box & Dossier Details Report'
        : selectedReportTab === 'archive-summary'
        ? 'General Archive Summary'
        : 'Branches & Shipments Log';

    const scopeLabel = reportBoxFilter === 'all' ? 'All Boxes' : `Box ${reportBoxFilter}`;

    const totalSummaryDisplay =
      selectedReportTab === 'distribution'
        ? `${filteredDistributionItems.length} Boxes · ${distDossiersCount} Dossiers · ${distFoldersCount} Folders`
        : selectedReportTab === 'archived-boxes'
        ? `${completedBoxes.length} Boxes · ${completedBoxes.reduce((s, b) => s + b.totalProjects, 0)} Branches`
        : selectedReportTab === 'inprogress-boxes'
        ? `${inprogressBoxes.length} Boxes · ${inprogressBoxes.reduce((s, b) => s + b.totalProjects, 0)} Branches`
        : selectedReportTab === 'dossiers'
        ? `${reportDossiers.length} Dossiers · ${reportBoxes.length} Boxes`
        : selectedReportTab === 'box-details'
        ? `${reportBoxes.length} Boxes · ${reportDossiers.length} Dossiers`
        : selectedReportTab === 'archive-summary'
        ? `${reportBoxes.length} Boxes · ${reportProjects.length} Branches · ${reportTotalFolders} Folders`
        : `${reportProjects.length} Records · ${reportBoxes.length} Boxes`;

    const formattedPrintDate = new Date().toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

    const handleExportPDF = async () => {
      if (exportingPdf) return;
      setExportingPdf(true);
      try {
        let columns: CommentsReportColumn[] = [];
        let rows: Record<string, string | number>[] = [];
        const title = cleanTitleEn;
        let summaryItems = [
          { label: isAr ? 'البوكسات' : 'Boxes', value: String(reportBoxes.length) },
          { label: isAr ? 'الدوسيهات' : 'Dossiers', value: String(reportDossiers.length) },
          { label: isAr ? 'الفروع' : 'Branches', value: String(reportProjects.length) },
          { label: isAr ? 'المؤرشف' : 'Archived', value: `${reportArchivedCount} (${reportArchivedPct}%)` },
        ];

        if (selectedReportTab === 'distribution') {
          summaryItems = [
            { label: isAr ? 'البوكسات' : 'Boxes', value: String(filteredDistributionItems.length) },
            { label: isAr ? 'الدوسيهات' : 'Dossiers', value: String(distDossiersCount) },
            { label: isAr ? 'الفروع' : 'Branches', value: String(distBranchesCount) },
            {
              label: isAr ? 'المناديل / المؤرشف' : 'Folders / Arch',
              value: `${distFoldersCount} / ${distArchivedCount}`,
            },
          ];
        } else if (selectedReportTab === 'archived-boxes') {
          summaryItems = [
            { label: isAr ? 'البوكسات المكتملة' : 'Archived Boxes', value: String(completedBoxes.length) },
            {
              label: isAr ? 'إجمالي الفروع' : 'Total Branches',
              value: String(completedBoxes.reduce((s, b) => s + b.totalProjects, 0)),
            },
            {
              label: isAr ? 'المؤرشف' : 'Archived',
              value: String(completedBoxes.reduce((s, b) => s + b.archivedProjects, 0)),
            },
            {
              label: isAr ? 'إجمالي المناديل' : 'Folders',
              value: String(completedBoxes.reduce((s, b) => s + (boxMetaMap.get(b.boxCode)?.foldersCount ?? 0), 0)),
            },
          ];
          columns = [
            { key: 'boxCode', label: isAr ? 'البوكس' : 'Box', weight: 0.75, align: 'center' },
            { key: 'system', label: isAr ? 'النظام' : 'System', weight: 0.85, align: 'center' },
            { key: 'period', label: isAr ? 'الفترة' : 'Period', weight: 1.5, align: 'center' },
            { key: 'dossiers', label: isAr ? 'الدوسيهات' : 'Dossiers', weight: 0.8, align: 'center' },
            { key: 'archived', label: isAr ? 'المؤرشف' : 'Archived', weight: 0.85, align: 'center' },
            { key: 'folders', label: isAr ? 'المناديل' : 'Folders', weight: 0.75, align: 'center' },
            { key: 'status', label: isAr ? 'الحالة' : 'Status', weight: 0.85, align: 'center' },
          ];
          rows = completedBoxes.map(b => {
            const meta = boxMetaMap.get(b.boxCode);
            return {
              boxCode: b.boxCode,
              system: meta?.isMonthly ? (isAr ? 'شهري' : 'Monthly') : isAr ? 'أسبوعي' : 'Weekly',
              period: meta?.periodLabel || '—',
              dossiers: `${meta?.filledDossiers ?? 0} / ${meta?.totalDossiers ?? 6}`,
              archived: `${b.archivedProjects} / ${b.totalProjects}`,
              folders: meta?.foldersCount ?? 0,
              status: b.status,
            };
          });
        } else if (selectedReportTab === 'inprogress-boxes') {
          summaryItems = [
            { label: isAr ? 'البوكسات الجارية' : 'Active Boxes', value: String(inprogressBoxes.length) },
            {
              label: isAr ? 'الفروع المؤرشفة' : 'Archived',
              value: String(inprogressBoxes.reduce((s, b) => s + b.archivedProjects, 0)),
            },
            {
              label: isAr ? 'مفقود' : 'Missing',
              value: String(inprogressBoxes.reduce((s, b) => s + b.missingProjects, 0)),
            },
            {
              label: isAr ? 'انتظار' : 'Pending',
              value: String(inprogressBoxes.reduce((s, b) => s + b.pendingProjects, 0)),
            },
          ];
          columns = [
            { key: 'boxCode', label: isAr ? 'البوكس' : 'Box', weight: 0.75, align: 'center' },
            { key: 'period', label: isAr ? 'الفترة' : 'Period', weight: 1.45, align: 'center' },
            { key: 'dossiers', label: isAr ? 'الدوسيهات' : 'Dossiers', weight: 0.75, align: 'center' },
            { key: 'archived', label: isAr ? 'المؤرشف' : 'Archived', weight: 0.85, align: 'center' },
            { key: 'missing', label: isAr ? 'مفقود' : 'Missing', weight: 0.65, align: 'center' },
            { key: 'pending', label: isAr ? 'انتظار' : 'Pending', weight: 0.65, align: 'center' },
            { key: 'pct', label: isAr ? 'الإنجاز' : 'Rate', weight: 0.65, align: 'center' },
            { key: 'status', label: isAr ? 'الحالة' : 'Status', weight: 0.85, align: 'center' },
          ];
          rows = inprogressBoxes.map(b => {
            const meta = boxMetaMap.get(b.boxCode);
            const pct = b.totalProjects > 0 ? Math.round((b.archivedProjects / b.totalProjects) * 100) : 0;
            return {
              boxCode: b.boxCode,
              period: meta?.periodLabel || '—',
              dossiers: `${meta?.filledDossiers ?? 0} / ${meta?.totalDossiers ?? 6}`,
              archived: `${b.archivedProjects} / ${b.totalProjects}`,
              missing: b.missingProjects,
              pending: b.pendingProjects,
              pct: `${pct}%`,
              status: b.status,
            };
          });
        } else if (selectedReportTab === 'branches') {
          columns = [
            { key: 'branchName', label: isAr ? 'اسم الفرع' : 'Branch Name', weight: 1.6 },
            { key: 'shipmentNo', label: isAr ? 'الإرسالية' : 'Shipment No.', weight: 0.9, align: 'center' },
            { key: 'region', label: isAr ? 'المنطقة' : 'Region', weight: 1.0, align: 'center' },
            { key: 'folderCount', label: isAr ? 'المناديل' : 'Folders', weight: 0.7, align: 'center' },
            { key: 'startDate', label: isAr ? 'تاريخ التشغيل' : 'Start Date', weight: 1.0, align: 'center' },
            { key: 'boxDossier', label: isAr ? 'البوكس / الدوسيه' : 'Box / Dossier', weight: 0.9, align: 'center' },
            { key: 'status', label: isAr ? 'الحالة' : 'Status', weight: 0.8, align: 'center' },
          ];
          rows = reportProjects.map(p => ({
            branchName: p.branchName || `#${p.jobId}`,
            shipmentNo: p.shipmentNo ?? '—',
            region: p.region || '—',
            folderCount: p.folderCount ?? 0,
            startDate: fmtDate(p.startDate),
            boxDossier: `${p.boxId}-${p.dossierNumber}`,
            status: p.status,
          }));
        } else if (selectedReportTab === 'dossiers') {
          columns = [
            { key: 'id', label: isAr ? 'الدوسيه' : 'Dossier', weight: 0.85, align: 'center' },
            { key: 'week', label: isAr ? 'الفترة' : 'Period', weight: 1.55, align: 'center' },
            { key: 'total', label: isAr ? 'الفروع' : 'Branches', weight: 0.65, align: 'center' },
            { key: 'archived', label: isAr ? 'مؤرشف' : 'Arch', weight: 0.65, align: 'center' },
            { key: 'missing', label: isAr ? 'مفقود' : 'Miss', weight: 0.65, align: 'center' },
            { key: 'pending', label: isAr ? 'انتظار' : 'Pend', weight: 0.65, align: 'center' },
            { key: 'folders', label: isAr ? 'المناديل' : 'Folders', weight: 0.7, align: 'center' },
            { key: 'status', label: isAr ? 'الحالة' : 'Status', weight: 0.85, align: 'center' },
          ];
          rows = reportDossiers.map(d => ({
            id: d.id,
            week: `${fmtDate(d.weekStart)} → ${fmtDate(d.weekEnd)}`,
            total: d.totalProjects,
            archived: d.archivedCount,
            missing: d.missingCount,
            pending: d.pendingCount,
            folders: dossierFoldersMap.get(d.id) ?? dossierFoldersMap.get(`${d.boxId}-${d.dossierNumber}`) ?? 0,
            status: d.status,
          }));
        } else if (selectedReportTab === 'box-details') {
          columns = [
            { key: 'boxCode', label: isAr ? 'البوكس' : 'Box', weight: 0.75, align: 'center' },
            { key: 'system', label: isAr ? 'النظام' : 'System', weight: 0.8, align: 'center' },
            { key: 'dossiersCount', label: isAr ? 'الدوسيهات' : 'Dossiers', weight: 0.95, align: 'center' },
            { key: 'total', label: isAr ? 'الفروع' : 'Branches', weight: 0.7, align: 'center' },
            { key: 'archived', label: isAr ? 'مؤرشف' : 'Arch', weight: 0.7, align: 'center' },
            { key: 'missing', label: isAr ? 'مفقود' : 'Miss', weight: 0.65, align: 'center' },
            { key: 'pending', label: isAr ? 'انتظار' : 'Pend', weight: 0.65, align: 'center' },
            { key: 'folders', label: isAr ? 'المناديل' : 'Folders', weight: 0.7, align: 'center' },
            { key: 'status', label: isAr ? 'الحالة' : 'Status', weight: 0.85, align: 'center' },
          ];
          rows = reportBoxes.map(b => {
            const meta = boxMetaMap.get(b.boxCode);
            return {
              boxCode: b.boxCode,
              system: meta?.isMonthly ? (isAr ? 'شهري' : 'Monthly') : isAr ? 'أسبوعي' : 'Weekly',
              dossiersCount: `${meta?.completedDossiers ?? 0}/${meta?.filledDossiers ?? 0}/${meta?.totalDossiers ?? 6}`,
              total: b.totalProjects,
              archived: b.archivedProjects,
              missing: b.missingProjects,
              pending: b.pendingProjects,
              folders: meta?.foldersCount ?? 0,
              status: b.status,
            };
          });
        } else {
          // archive-summary
          columns = [
            { key: 'metric', label: isAr ? 'البند' : 'Metric', weight: 1.5 },
            { key: 'value', label: isAr ? 'العدد / القيمة' : 'Count / Value', weight: 1.0, align: 'center' },
            { key: 'notes', label: isAr ? 'ملاحظات' : 'Notes', weight: 1.8 },
          ];
          rows = archiveSummaryRows.map(r => ({
            metric: r.metric,
            value: String(r.value),
            notes: r.notes,
          }));
        }

        const fileName = await exportCommentsReportToPDF({
          reportId: selectedReportTab,
          reportTitle: title,
          scopeLabel,
          totalSummary: totalSummaryDisplay,
          isAr,
          columns,
          rows,
          distributionItems: selectedReportTab === 'distribution' ? filteredDistributionItems : undefined,
          summaryItems,
          preparedBy: currentUser?.name || 'System Admin',
          printDate: formattedPrintDate,
        });

        showToast(
          isAr ? `تم تحميل التقرير بصيغة PDF: ${fileName}` : `PDF report downloaded: ${fileName}`,
          'success'
        );
      } catch (err) {
        console.error('Failed to export PDF report:', err);
        showToast(isAr ? 'تعذر إنشاء ملف PDF للتقرير.' : 'Failed generating PDF report.', 'error');
      } finally {
        setExportingPdf(false);
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800 print:hidden">
          <div>
            <div className="text-[11px] font-bold mb-0.5 text-[#E52225] dark:text-red-400">
              {isAr ? 'أرشفة تعليقات الفروع' : 'Branch Comments Archive'}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <FileBarChart className="w-6 h-6 text-[#E52225]" />
              <span>{isAr ? 'مركز تقارير الفروع والتعليقات' : 'Branch Comments Reports Center'}</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!hasExportableData}
              onClick={handleExportExcel}
              className="group inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 hover:bg-emerald-600 hover:border-emerald-600 hover:text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 group-hover:text-white transition-colors" />
              <span>{isAr ? 'تصدير Excel' : 'Export Excel'}</span>
            </button>
            <button
              type="button"
              disabled={!hasExportableData || exportingPdf}
              onClick={handleExportPDF}
              className="group inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 hover:bg-[#E52225] hover:border-[#E52225] hover:text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <FileDown className="w-3.5 h-3.5 text-[#E52225] group-hover:text-white transition-colors" />
              <span>
                {exportingPdf
                  ? isAr
                    ? 'جاري تجهيز PDF...'
                    : 'Generating PDF...'
                  : isAr
                  ? 'تحميل PDF (A4)'
                  : 'Download PDF (A4)'}
              </span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg transition-colors"
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
                htmlFor="comments-report-select"
                className="block text-[11px] font-bold text-slate-500 dark:text-neutral-400"
              >
                {isAr ? 'اختيار التقرير' : 'Select Report'}
              </label>
              <select
                id="comments-report-select"
                value={selectedReportTab}
                onChange={e => setSelectedReportTab(e.target.value as typeof selectedReportTab)}
                className="w-full px-3 py-2 text-xs font-semibold bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg text-slate-800 dark:text-neutral-100 focus:outline-none focus:border-[#E52225]"
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
                  <Filter className="w-3.5 h-3.5 text-[#E52225]" />
                  <span>{isAr ? 'تصفية التقرير' : 'Filter Report'}</span>
                </span>
                {(reportBoxFilter !== 'all' || reportSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setReportBoxFilter('all');
                      setReportSearch('');
                    }}
                    className="text-[11px] font-semibold text-[#E52225] hover:underline flex items-center gap-1"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>{isAr ? 'إعادة ضبط' : 'Reset'}</span>
                  </button>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-neutral-400 mb-1">
                  {isAr ? 'البوكس' : 'Box'}
                </label>
                <select
                  value={reportBoxFilter}
                  onChange={e => setReportBoxFilter(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg text-slate-800 dark:text-neutral-200 focus:outline-none focus:border-[#E52225]"
                >
                  <option value="all">{isAr ? `كل البوكسات (${sortedBoxes.length})` : `All Boxes (${sortedBoxes.length})`}</option>
                  {sortedBoxes.map(b => (
                    <option key={b.id} value={b.boxCode}>
                      {b.boxCode} ({(b.totalDossiers || 6) === 2 ? (isAr ? 'شهري · 2' : 'Monthly · 2') : (isAr ? 'أسبوعي · 6' : 'Weekly · 6')})
                    </option>
                  ))}
                </select>
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
                    placeholder={isAr ? 'بوكس، دوسيه، فرع، منطقة...' : 'Box, dossier, branch, region...'}
                    className="w-full ps-8 pe-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg text-slate-800 dark:text-neutral-200 focus:outline-none focus:border-[#E52225]"
                  />
                </div>
              </div>
            </div>
          </aside>

          <div className="lg:col-span-8 bg-slate-100/80 dark:bg-black border border-slate-200/80 dark:border-neutral-800 rounded-xl p-3 sm:p-5 print:p-0 print:border-0 print:bg-white">
            <div dir={isAr ? 'rtl' : 'ltr'} className="bg-white text-slate-900 border border-slate-300 rounded-lg overflow-hidden shadow-md mx-auto max-w-[794px] p-5 sm:p-6 space-y-3.5 print:shadow-none print:border-0">
              {/* 1. Clean Corporate Header (English, matching Operations Reports) */}
              <div className="flex items-center justify-between gap-4 pb-1" dir="ltr">
                <div className="shrink-0">
                  <img src={logoColor} alt="Intercom" className="h-7 sm:h-8 w-auto object-contain" />
                </div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight text-center min-w-0 leading-snug">
                  {cleanTitleEn}
                </h3>
                <div className="shrink-0">
                  <img src={armsLogoLight} alt="ARMS Archive Report Management System" className="h-7 sm:h-9 w-auto object-contain" />
                </div>
              </div>

              {/* 2. Clear 2-Column English Metadata Box */}
              <div
                dir="ltr"
                className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1.5 text-[12px] bg-slate-50 border border-slate-200 rounded-md px-3.5 py-2.5"
              >
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

              {selectedReportTab === 'distribution' ? (
                <div className="space-y-3">
                  {filteredDistributionItems.length > 0 ? (
                    filteredDistributionItems.map(box => {
                      const slotCount = Math.max(box.dossiers.length, box.isMonthly ? 2 : 6);
                      const slots = Array.from({ length: slotCount }, (_, i) => i + 1);
                      return (
                        <div
                          key={box.boxCode}
                          className="border border-slate-400 rounded-sm overflow-hidden bg-white break-inside-avoid"
                        >
                          <div className="bg-[#D9D9D9] border-b border-slate-400 px-3 py-1.5 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2.5">
                              <span className="text-[12.5px] font-extrabold text-slate-900">
                                {isAr ? `بوكس ${box.boxCode}` : `Box ${box.boxCode}`}
                              </span>
                              <span className="text-[10.5px] font-bold text-slate-800 bg-white/70 border border-slate-400/70 px-1.5 py-0.5 rounded">
                                {box.isMonthly
                                  ? isAr
                                    ? 'شهري · 2 دوسيه'
                                    : 'Monthly · 2'
                                  : isAr
                                  ? 'أسبوعي · 6 دوسيهات'
                                  : 'Weekly · 6'}
                              </span>
                              <span className="text-[11px] font-bold text-slate-800 tabular-nums">
                                {box.periodLabel}
                              </span>
                            </div>

                            <div className="text-[10.5px] font-semibold text-slate-800 tabular-nums">
                              {box.archivedProjects}/{box.totalProjects} {isAr ? 'مؤرشف' : 'Arch'} ·{' '}
                              {box.foldersCount} {isAr ? 'منديل' : 'folders'} ·{' '}
                              <span className="font-bold text-slate-900">{box.status}</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2">
                            {slots.map((slotNum, sIdx) => {
                              const dossier =
                                box.dossiers.find(d => d.dossierNumber === slotNum) || box.dossiers[sIdx];
                              const isSecondRowOrLater = sIdx >= 2;
                              const isSecondCol = sIdx % 2 === 1;
                              const cellClasses = `px-3 py-2 bg-white border-slate-300 ${
                                sIdx > 0 ? 'border-t sm:border-t-0' : ''
                              } ${isSecondRowOrLater ? 'sm:border-t' : ''} ${
                                isSecondCol ? 'sm:border-s' : ''
                              }`;

                              if (!dossier) {
                                return (
                                  <div
                                    key={`${box.boxCode}-empty-${slotNum}`}
                                    className={`${cellClasses} flex items-center justify-center text-[11px] text-slate-400 font-medium`}
                                  >
                                    {box.boxCode}-{slotNum} ({isAr ? 'فارغ' : 'Empty'})
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={dossier.id}
                                  className={`${cellClasses} flex flex-col justify-between gap-0.5`}
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11.5px] font-bold text-slate-900">
                                      {isAr
                                        ? `دوسيه ${dossier.dossierNumber} (${dossier.id})`
                                        : `Dossier ${dossier.dossierNumber} (${dossier.id})`}
                                    </span>
                                    <span className="text-[11px] font-semibold text-slate-700 tabular-nums">
                                      {dossier.periodLabel}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between gap-2 text-[10px]">
                                    <span className="text-slate-600 tabular-nums">
                                      {dossier.archivedCount}/{dossier.totalProjects}{' '}
                                      {isAr ? 'مؤرشف' : 'Arch'} · {dossier.missingCount}{' '}
                                      {isAr ? 'مفقود' : 'Miss'} · {dossier.foldersCount}{' '}
                                      {isAr ? 'منديل' : 'folders'}
                                    </span>
                                    <span className="font-bold text-slate-900">{dossier.status}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="border border-slate-300 rounded-md py-10 text-center text-xs text-slate-500">
                      {isAr ? 'لا توجد بوكسات مطابقة للتصفية الحالية' : 'No boxes match current filter'}
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-[11px] text-start">
                    <thead>
                      {selectedReportTab === 'branches' && (
                        <tr className="bg-[#D9D9D9] text-slate-900 font-bold">
                          <th className="border border-slate-400 px-2 py-1.5 text-center">#</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'اسم الفرع' : 'Branch Name'}</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'رقم الإرسالية' : 'Shipment'}</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'المنطقة' : 'Region'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'المناديل' : 'Folders'}</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'تاريخ التشغيل' : 'Start Date'}</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'البوكس / الدوسيه' : 'Box / Dossier'}</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'الحالة' : 'Status'}</th>
                        </tr>
                      )}
                      {selectedReportTab === 'archived-boxes' && (
                        <tr className="bg-[#D9D9D9] text-slate-900 font-bold">
                          <th className="border border-slate-400 px-2 py-1.5 text-center">#</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'البوكس' : 'Box'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'النظام' : 'System'}</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'الفترة' : 'Period'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'الدوسيهات' : 'Dossiers'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'المؤرشف' : 'Archived'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'المناديل' : 'Folders'}</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'الحالة' : 'Status'}</th>
                        </tr>
                      )}
                      {selectedReportTab === 'inprogress-boxes' && (
                        <tr className="bg-[#D9D9D9] text-slate-900 font-bold">
                          <th className="border border-slate-400 px-2 py-1.5 text-center">#</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'البوكس' : 'Box'}</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'الفترة' : 'Period'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'الدوسيهات' : 'Dossiers'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'المؤرشف' : 'Archived'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'مفقود' : 'Missing'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'انتظار' : 'Pending'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'الإنجاز' : 'Rate'}</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'الحالة' : 'Status'}</th>
                        </tr>
                      )}
                      {selectedReportTab === 'dossiers' && (
                        <tr className="bg-[#D9D9D9] text-slate-900 font-bold">
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'الدوسيه' : 'Dossier'}</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'الفترة' : 'Period'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'الفروع' : 'Branches'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'مؤرشف' : 'Arch'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'مفقود' : 'Miss'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'انتظار' : 'Pend'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'المناديل' : 'Folders'}</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'الحالة' : 'Status'}</th>
                        </tr>
                      )}
                      {selectedReportTab === 'box-details' && (
                        <tr className="bg-[#D9D9D9] text-slate-900 font-bold">
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'البوكس' : 'Box'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'النظام' : 'System'}</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'الفترة' : 'Period'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'الدوسيهات' : 'Dossiers'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'الفروع' : 'Branches'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'مؤرشف' : 'Arch'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'مفقود' : 'Miss'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'انتظار' : 'Pend'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'المناديل' : 'Folders'}</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'الحالة' : 'Status'}</th>
                        </tr>
                      )}
                      {selectedReportTab === 'archive-summary' && (
                        <tr className="bg-[#D9D9D9] text-slate-900 font-bold">
                          <th className="border border-slate-400 px-2 py-1.5 text-center">#</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'البند' : 'Metric'}</th>
                          <th className="border border-slate-400 px-2 py-1.5 text-center">{isAr ? 'العدد / القيمة' : 'Count / Value'}</th>
                          <th className="border border-slate-400 px-2 py-1.5">{isAr ? 'ملاحظات' : 'Notes'}</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {selectedReportTab === 'branches' &&
                        (reportProjects.length ? (
                          reportProjects.slice(0, 60).map((p, idx) => (
                            <tr key={p.jobId}>
                              <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{idx + 1}</td>
                              <td className="border border-slate-300 px-2 py-1 font-semibold">{p.branchName}</td>
                              <td className="border border-slate-300 px-2 py-1 font-mono">{p.shipmentNo}</td>
                              <td className="border border-slate-300 px-2 py-1">{p.region || '—'}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{p.folderCount ?? 0}</td>
                              <td className="border border-slate-300 px-2 py-1 tabular-nums">{fmtDate(p.startDate)}</td>
                              <td className="border border-slate-300 px-2 py-1 font-mono">{p.boxId}-{p.dossierNumber}</td>
                              <td className="border border-slate-300 px-2 py-1">{p.status}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className="border border-slate-300 py-8 text-center text-slate-500">
                              {isAr ? 'لا توجد بيانات مطابقة' : 'No matching records'}
                            </td>
                          </tr>
                        ))}

                      {selectedReportTab === 'archived-boxes' &&
                        (completedBoxes.length ? (
                          completedBoxes.map((b, idx) => {
                            const meta = boxMetaMap.get(b.boxCode);
                            return (
                              <tr key={b.id}>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{idx + 1}</td>
                                <td className="border border-slate-300 px-2 py-1 font-mono font-bold">{b.boxCode}</td>
                                <td className="border border-slate-300 px-2 py-1 text-center">
                                  {meta?.isMonthly ? (isAr ? 'شهري (2)' : 'Monthly (2)') : isAr ? 'أسبوعي (6)' : 'Weekly (6)'}
                                </td>
                                <td className="border border-slate-300 px-2 py-1 tabular-nums">{meta?.periodLabel || '—'}</td>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                                  {meta?.filledDossiers ?? 0} / {meta?.totalDossiers ?? 6}
                                </td>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums font-semibold">
                                  {b.archivedProjects} / {b.totalProjects}
                                </td>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{meta?.foldersCount ?? 0}</td>
                                <td className="border border-slate-300 px-2 py-1 font-semibold">{b.status}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={8} className="border border-slate-300 py-8 text-center text-slate-500">
                              {isAr ? 'لا توجد بوكسات مكتملة مطابقة' : 'No completed boxes found'}
                            </td>
                          </tr>
                        ))}

                      {selectedReportTab === 'inprogress-boxes' &&
                        (inprogressBoxes.length ? (
                          inprogressBoxes.map((b, idx) => {
                            const meta = boxMetaMap.get(b.boxCode);
                            const pct = b.totalProjects > 0 ? Math.round((b.archivedProjects / b.totalProjects) * 100) : 0;
                            return (
                              <tr key={b.id}>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{idx + 1}</td>
                                <td className="border border-slate-300 px-2 py-1 font-mono font-bold">{b.boxCode}</td>
                                <td className="border border-slate-300 px-2 py-1 tabular-nums">{meta?.periodLabel || '—'}</td>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                                  {meta?.filledDossiers ?? 0} / {meta?.totalDossiers ?? 6}
                                </td>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                                  {b.archivedProjects} / {b.totalProjects}
                                </td>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{b.missingProjects}</td>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{b.pendingProjects}</td>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums font-bold">{pct}%</td>
                                <td className="border border-slate-300 px-2 py-1">{b.status}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={9} className="border border-slate-300 py-8 text-center text-slate-500">
                              {isAr ? 'لا توجد بوكسات جارية مطابقة' : 'No in-progress boxes found'}
                            </td>
                          </tr>
                        ))}

                      {selectedReportTab === 'dossiers' &&
                        (reportDossiers.length ? (
                          reportDossiers.map(d => (
                            <tr key={d.id}>
                              <td className="border border-slate-300 px-2 py-1 font-mono font-bold">{d.id}</td>
                              <td className="border border-slate-300 px-2 py-1 tabular-nums">{fmtDate(d.weekStart)} → {fmtDate(d.weekEnd)}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{d.totalProjects}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{d.archivedCount}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{d.missingCount}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{d.pendingCount}</td>
                              <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                                {dossierFoldersMap.get(d.id) ?? dossierFoldersMap.get(`${d.boxId}-${d.dossierNumber}`) ?? 0}
                              </td>
                              <td className="border border-slate-300 px-2 py-1">{d.status}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className="border border-slate-300 py-8 text-center text-slate-500">
                              {isAr ? 'لا توجد بيانات مطابقة' : 'No matching records'}
                            </td>
                          </tr>
                        ))}

                      {selectedReportTab === 'box-details' &&
                        (reportBoxes.length ? (
                          reportBoxes.map(b => {
                            const meta = boxMetaMap.get(b.boxCode);
                            return (
                              <tr key={b.id}>
                                <td className="border border-slate-300 px-2 py-1 font-mono font-bold">{b.boxCode}</td>
                                <td className="border border-slate-300 px-2 py-1 text-center">
                                  {meta?.isMonthly ? (isAr ? 'شهري' : 'Monthly') : isAr ? 'أسبوعي' : 'Weekly'}
                                </td>
                                <td className="border border-slate-300 px-2 py-1 tabular-nums">{meta?.periodLabel || '—'}</td>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                                  {meta?.completedDossiers ?? 0} / {meta?.filledDossiers ?? 0} / {meta?.totalDossiers ?? 6}
                                </td>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{b.totalProjects}</td>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{b.archivedProjects}</td>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{b.missingProjects}</td>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{b.pendingProjects}</td>
                                <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{meta?.foldersCount ?? 0}</td>
                                <td className="border border-slate-300 px-2 py-1">{b.status}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={10} className="border border-slate-300 py-8 text-center text-slate-500">
                              {isAr ? 'لا توجد بيانات مطابقة' : 'No matching records'}
                            </td>
                          </tr>
                        ))}

                      {selectedReportTab === 'archive-summary' &&
                        archiveSummaryRows.map((row, idx) => (
                          <tr key={row.metric}>
                            <td className="border border-slate-300 px-2 py-1.5 text-center tabular-nums">{idx + 1}</td>
                            <td className="border border-slate-300 px-2 py-1.5 font-bold">{row.metric}</td>
                            <td className="border border-slate-300 px-2 py-1.5 text-center font-bold tabular-nums">{row.value}</td>
                            <td className="border border-slate-300 px-2 py-1.5 text-slate-600">{row.notes}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- 8. LABELS VIEW -------------------- */
  if (activeTab === 'labels') {
    return <LabelsView initialBoxCode={labelInitialBoxCode} />;
  }

  /* -------------------- 9. IMPORT VIEW -------------------- */
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
        <div>
          <div className="text-[11px] font-bold mb-0.5 text-[#E52225] dark:text-red-400">
            {isAr ? 'أرشفة تعليقات الفروع' : 'Branch Comments Archive'}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-[#E52225]" />
            <span>{isAr ? 'استيراد شيت الفروع والإرساليات' : 'Import Branches Sheet'}</span>
          </h1>
        </div>
      </div>

      <MinutesPlanImport />
      {renderDeleteUploadModal()}

      <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-neutral-800 text-sm font-bold text-slate-900 dark:text-white">
          {isAr ? 'سجل عمليات الرفع' : 'Upload History'}
        </div>
        {uploadHistory.length === 0 ? (
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
                  <th className="px-3 py-2.5 text-end">{isAr ? 'مكرر' : 'Duplicates'}</th>
                  <th className="px-5 py-2.5 text-end">{isAr ? 'الحالة' : 'Status'}</th>
                  {isSystemAdmin && (
                    <th className="px-3 py-2.5 text-center">{isAr ? 'إجراء' : 'Action'}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {uploadHistory.map(u => (
                  <tr key={u.id} className="border-b border-slate-50 dark:border-neutral-900">
                    <td className="px-5 py-2.5 font-semibold text-slate-900 dark:text-white">{u.fileName}</td>
                    <td className="px-3 py-2.5 text-slate-500">{u.userName}</td>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">{fmtDate(u.timestamp)}</td>
                    <td className="px-3 py-2.5 text-end font-bold tabular-nums">{u.importedCount}</td>
                    <td className="px-3 py-2.5 text-end text-amber-600 tabular-nums">{u.duplicateCount}</td>
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
      </div>
    </div>
  );
};
