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
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { useArchive } from '../../context/ArchiveContext';
import { ActiveTab } from '../navigation/TopNav';
import { GlobalSearch } from '../navigation/GlobalSearch';
import { MinutesPlanImport } from './MinutesPlanImport';
import { Box, Dossier, Project, ProjectStatus } from '../../types';
import { LabelsView } from '../labels/LabelsView';
import { weekEndOf, weekStartOf } from '../../utils/minutesPlan';
import { CommentsReportColumn, exportCommentsReportToPDF } from '../../utils/reportExporter';
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
    showToast,
  } = useArchive();

  const isAr = language === 'ar';
  const DirectionalArrow = isAr ? ArrowLeft : ArrowRight;
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

  // Shared UI & filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [boxFilter, setBoxFilter] = useState<string>('all');
  const [dossierFilter, setDossierFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ProjectStatus>('all');
  const [boxStatusFilter, setBoxStatusFilter] = useState<'all' | 'Inprogress' | 'Archived'>('all');
  const [dossierStatusFilter, setDossierStatusFilter] = useState<'all' | 'Pending' | 'Inprogress' | 'Archived'>('all');
  const [archiveSubTab, setArchiveSubTab] = useState<'boxes' | 'dossiers' | 'branches'>('boxes');

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
  const [selectedReportTab, setSelectedReportTab] = useState<'summary' | 'dossiers' | 'branches'>('branches');
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
      setStatusFilter('all');
      setDateFrom('');
      setDateTo('');
      setSearchTerm('');
      setCurrentPage(1);
    } else if (projectsFilter && ['Archived', 'Missing', 'Pending'].includes(projectsFilter)) {
      setStatusFilter(projectsFilter as ProjectStatus);
      setBoxFilter('all');
      setDossierFilter('all');
      setDateFrom('');
      setDateTo('');
      setSearchTerm('');
      setCurrentPage(1);
    } else if (projectsFilter) {
      setSearchTerm(projectsFilter);
      setStatusFilter('all');
      setBoxFilter('all');
      setDossierFilter('all');
      setDateFrom('');
      setDateTo('');
      setCurrentPage(1);
    }
  }, [projectsFilter]);

  useEffect(() => {
    setSelectedJobIds([]);
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
                        ? 'كود البوكس (C1)، اسم فرع، إرسالية...'
                        : 'Box (C1), branch, shipment...'
                      : mode === 'dossiers'
                      ? isAr
                        ? 'رقم الدوسيه (C1-1)، أسبوع، فرع...'
                        : 'Dossier (C1-1), week, branch...'
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
  const totalBranches = projects.length;
  const archivedCount = projects.filter(p => p.status === 'Archived').length;
  const missingCount = projects.filter(p => p.status === 'Missing').length;
  const pendingCount = projects.filter(p => p.status === 'Pending').length;
  const completedDossiersCount = dossiers.filter(d => d.status === 'Archived').length;
  const archivedPercent = totalBranches > 0 ? ((archivedCount / totalBranches) * 100).toFixed(1) : '0.0';

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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <div className="text-[11px] font-bold mb-0.5 text-[#E52225] dark:text-red-400">
              {isAr ? 'أرشفة التعليقات' : 'Comments Archive'}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {isAr ? 'لوحة المتابعة والتحكم' : 'Workspace Dashboard'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-neutral-400 mt-0.5">
              {isAr
                ? 'نظام البوكسات الأسبوعي: كل بوكس يحتوي على 6 دوسيهات، وكل دوسيه يمثل أسبوع تشغيل للفروع والإرساليات.'
                : 'Weekly box structure: 6 weekly dossiers per box tracking branch shipments and operational start dates.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => onNavigate('import')}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg transition-colors whitespace-nowrap"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{isAr ? 'استيراد شيت الفروع' : 'Import Plan Sheet'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Search Bar (same as Operations Reports) */}
        <GlobalSearch onNavigate={onNavigate} />

        {/* Date From / To & Status Filter Card */}
        {renderDateStatusFilterCard('dashboard', dashTotal)}

        {/* 4-KPI Strip */}
        <section className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl overflow-hidden">
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
                {dashBoxes.length} {isAr ? 'بوكس' : 'boxes'} · {dashDossiers.length} {isAr ? 'دوسيه أسبوعي' : 'weekly dossiers'}
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
                {isAr ? '6 دوسيهات (أسابيع) / بوكس' : '6 weekly dossiers / box'}
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
              <div className="bg-emerald-500 h-full transition-all" style={{ width: `${dashArchivedPercent}%` }} />
            </div>
            <span className="text-xs font-extrabold tabular-nums shrink-0 text-[#E52225]">{dashArchivedPercent}%</span>
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
                              {ds.length} / 6 {isAr ? 'دوسيهات (أسابيع)' : 'dossiers (weeks)'} · {b.totalProjects}{' '}
                              {isAr ? 'فرع' : 'branches'}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate">
                              {ds[0]?.weekStart ? `${fmtDate(ds[0].weekStart)} → ${fmtDate(ds[ds.length - 1]?.weekEnd)}` : '—'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-neutral-300">{pct}%</span>
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
                      <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-red-50 dark:bg-red-950/50 text-[#E52225] dark:text-red-400">
                        <Icon className="w-4 h-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-[#E52225]">{a.label}</div>
                        <div className="text-[10px] text-slate-400">{a.sub}</div>
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
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={54} outerRadius={76} dataKey="value" stroke="none">
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
                  <span className="text-[11px] text-slate-500 dark:text-neutral-400 flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: item.color }} />
                    <span>{item.label}</span>
                  </span>
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
                  <tbody>
                    {uploadHistory.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate-400">
                          {isAr ? 'لم يتم رفع ملفات في هذا القسم بعد' : 'No uploads in this section yet'}
                        </td>
                      </tr>
                    ) : (
                      uploadHistory.slice(0, 5).map(u => (
                        <tr key={u.id} className="border-b border-slate-50 dark:border-neutral-900">
                          <td className="px-5 py-2.5 font-semibold text-slate-900 dark:text-white">{u.fileName}</td>
                          <td className="px-3 py-2.5 text-slate-500 tabular-nums">{fmtDate(u.timestamp)}</td>
                          <td className="px-3 py-2.5 text-end font-bold tabular-nums">{u.importedCount}</td>
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

    return (
      <div className="space-y-6">
        {activeTab === 'archive' && renderArchiveSubTabs()}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <div className="text-[11px] font-bold mb-0.5 text-[#E52225] dark:text-red-400">
              {isAr ? 'أرشفة التعليقات' : 'Comments Archive'}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Archive className="w-6 h-6 text-[#E52225]" />
              <span>{isAr ? 'البوكسات' : 'Archive Boxes'}</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-neutral-400 mt-0.5">
              {isAr
                ? 'كل بوكس يحتوي على 6 دوسيهات، وكل دوسيه يضم أسبوع تشغيل كامل.'
                : 'Each box contains 6 weekly dossiers (Sun → Thu).'}
            </p>
          </div>

          <div className="flex items-center gap-2">
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

        {renderDateStatusFilterCard('boxes', filteredBoxes.length)}

        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 dark:bg-neutral-900/80 text-slate-500 text-[11px] font-semibold border-b border-slate-200 dark:border-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-start">{isAr ? 'كود البوكس' : 'Box Code'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'نطاق الأسابيع' : 'Weeks Range'}</th>
                  <th className="px-4 py-3 text-center">{isAr ? 'الدوسيهات (الأسابيع)' : 'Dossiers (Weeks)'}</th>
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
                  return (
                    <tr
                      key={box.id}
                      onClick={() => {
                        onSelectBox(box.boxCode);
                        onNavigate('box-detail', box.boxCode);
                      }}
                      className="hover:bg-slate-50/70 dark:hover:bg-neutral-900/40 cursor-pointer transition-colors group"
                    >
                      <td className="px-4 py-3 font-extrabold text-sm font-mono text-[#E52225] dark:text-red-400">
                        {box.boxCode}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-slate-600 dark:text-neutral-300 tabular-nums">
                        {firstWk ? `${fmtDate(firstWk)} → ${fmtDate(lastWk)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold tabular-nums">
                        {boxDossiers.length} / 6 <span className="text-[10px] text-slate-400">({box.completedDossiers} {isAr ? 'مكتمل' : 'done'})</span>
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
                    <td colSpan={9} className="py-12 text-center text-slate-400">
                      {isAr ? 'لا توجد بوكسات مطابقة حالياً — ارفع شيت الفروع أولاً.' : 'No boxes found yet — import a plan sheet first.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
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
                {isAr
                  ? `السعة: 6 دوسيهات (كل دوسيه = أسبوع تشغيل) · إجمالي ${box.totalProjects} فرع/إرسالية`
                  : `6 Weekly Dossiers capacity · ${box.totalProjects} branch shipments`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
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
            <span className="text-[11px] text-slate-500">{isAr ? 'الدوسيهات (الأسابيع)' : 'Dossiers (Weeks)'}</span>
            <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">{boxDossiers.length} / 6</div>
            <span className="text-[10px] text-slate-400">
              {box.completedDossiers} {isAr ? 'دوسيه مكتمل' : 'completed'}
            </span>
          </div>
        </div>

        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white mb-3">
            {isAr ? 'الدوسيهات الستة داخل البوكس (كل دوسيه = أسبوع)' : 'The 6 Weekly Dossiers of this Box'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(num => {
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
                    <div>{isAr ? `دوسيه ${num} / 6 — فارغ (بانتظار أسبوع جديد)` : `Dossier ${num} / 6 — Empty`}</div>
                  </div>
                );
              }
              const dPct = dossier.totalProjects > 0 ? Math.round((dossier.archivedCount / dossier.totalProjects) * 100) : 0;
              return (
                <div
                  key={dossier.id}
                  onClick={() => {
                    onSelectDossier(dossier.id);
                    onNavigate('dossier-detail', dossier.id);
                  }}
                  className="p-4 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl hover:border-[#E52225]/60 hover:shadow-xs cursor-pointer transition-all flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center font-bold text-[#E52225] dark:text-red-400 text-sm">
                          {dossier.dossierNumber}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-white group-hover:text-[#E52225] transition-colors">
                            {dossier.id} · {isAr ? `الأسبوع ${dossier.dossierNumber}` : `Week ${dossier.dossierNumber}`}
                          </h3>
                          <div className="text-[11px] text-slate-500 tabular-nums">
                            {fmtDate(dossier.weekStart)} → {fmtDate(dossier.weekEnd)}
                          </div>
                        </div>
                      </div>
                      {statusBadge(dossier.status)}
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

    return (
      <div className="space-y-6">
        {activeTab === 'archive' && renderArchiveSubTabs()}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <div className="text-[11px] font-bold mb-0.5 text-[#E52225] dark:text-red-400">
              {isAr ? 'أرشفة التعليقات' : 'Comments Archive'}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <FolderArchive className="w-6 h-6 text-[#E52225]" />
              <span>{isAr ? 'الدوسيهات الأسبوعية (Dossiers)' : 'Weekly Dossiers'}</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-neutral-400 mt-0.5">
              {isAr
                ? 'كل دوسيه يمثل أسبوع تشغيل (الأحد → الخميس) داخل البوكسات.'
                : 'Each dossier corresponds to one operational week (Sun → Thu) inside boxes.'}
            </p>
          </div>
        </div>

        {renderDateStatusFilterCard('dossiers', filteredDossiers.length)}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDossiers.map(dossier => {
            const pct = dossier.totalProjects > 0 ? Math.round((dossier.archivedCount / dossier.totalProjects) * 100) : 0;
            return (
              <div
                key={dossier.id}
                onClick={() => {
                  onSelectDossier(dossier.id);
                  onNavigate('dossier-detail', dossier.id);
                }}
                className="p-4 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl hover:border-[#E52225]/60 hover:shadow-xs cursor-pointer transition-all flex flex-col justify-between group"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center font-bold text-[#E52225] dark:text-red-400 text-sm">
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
                    {statusBadge(dossier.status)}
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

          <button
            type="button"
            onClick={() => onNavigate('labels', `${dossier.boxId}:${dossier.dossierNumber}`)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{isAr ? 'طباعة ليبل الدوسيه' : 'Print Dossier Label'}</span>
          </button>
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
                  <th className="px-3 py-3 w-12">#</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'اسم الفرع' : 'Branch Name'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'رقم الإرسالية' : 'Shipment No.'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'تاريخ بدء التشغيل' : 'Start Date'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'تفاصيل إضافية' : 'Details'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
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
                      <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedJobIds.includes(p.jobId)}
                          onChange={() => toggleSelectId(p.jobId)}
                          className="rounded border-slate-300 text-[#E52225] focus:ring-[#E52225]"
                        />
                      </td>
                    )}
                    <td className="px-3 py-3 text-slate-400 tabular-nums">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 dark:text-white">{p.branchName || '—'}</div>
                      {p.branchCode && <div className="text-[10px] text-slate-400 font-mono">{p.branchCode}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono font-bold px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-[#E52225] dark:text-red-300">
                        {p.shipmentNo ?? '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums font-medium text-slate-700 dark:text-neutral-300">
                      {fmtDate(p.startDate)}
                    </td>
                    <td className="px-4 py-3 text-[11px] text-slate-500">
                      {[p.region, p.folderCount ? `${p.folderCount} ${isAr ? 'منديل' : 'folders'}` : ''].filter(Boolean).join(' · ') || '—'}
                    </td>
                    <td className="px-4 py-3">{statusBadge(p.status)}</td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
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
                    <td colSpan={canEdit ? 8 : 7} className="py-10 text-center text-slate-400">
                      {isAr ? 'لا توجد فروع في هذا الدوسيه.' : 'No branches in this dossier.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

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
          (p.region || '').toLowerCase().includes(q);
        if (!matchSearch) return false;
        if (boxFilter !== 'all' && p.boxId !== boxFilter) return false;
        if (dossierFilter !== 'all' && `${p.boxId}-${p.dossierNumber}` !== dossierFilter) return false;
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
              {isAr ? 'أرشفة التعليقات' : 'Comments Archive'}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <CheckSquare className="w-6 h-6 text-[#E52225]" />
              <span>{isAr ? 'الفروع والإرساليات (Branches)' : 'Branches & Shipments'}</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-neutral-400 mt-0.5">
              {isAr
                ? 'اسم الفرع · رقم الإرسالية (المميز للفرع عند التكرار) · تاريخ بدء التشغيل · مع إمكانية التحديد وتغيير الحالات وعرض تفاصيل كل فرع.'
                : 'Branch name, unique shipment no., operational start date — select and update branch statuses or inspect full branch details.'}
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>
              {isAr ? 'إجمالي الفروع:' : 'Total:'}{' '}
              <strong className="text-[#E52225] dark:text-red-400 tabular-nums">{filteredBranches.length}</strong>
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

        {/* Branches Table */}
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
                  <th className="px-3 py-3 w-12">#</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'اسم الفرع' : 'Branch Name'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'رقم الإرسالية' : 'Shipment No.'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'تاريخ بدء التشغيل' : 'Start Date'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'البوكس / الدوسيه (الأسبوع)' : 'Box / Weekly Dossier'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'المنطقة / المناديل' : 'Region / Folders'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
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
                        <td className="px-3 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedJobIds.includes(p.jobId)}
                            onChange={() => toggleSelectId(p.jobId)}
                            className="rounded border-slate-300 text-[#E52225] focus:ring-[#E52225]"
                          />
                        </td>
                      )}
                      <td className="px-3 py-3 text-slate-400 tabular-nums">{(safePage - 1) * pageSize + idx + 1}</td>
                      <td className="px-4 py-3">
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
                        {p.branchCode && <div className="text-[10px] text-slate-400 font-mono">{p.branchCode}</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono font-extrabold px-2 py-0.5 rounded bg-red-50 dark:bg-red-950/40 text-[#E52225] dark:text-red-300">
                          {p.shipmentNo ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums font-medium text-slate-700 dark:text-neutral-300">
                        {fmtDate(p.startDate)}
                      </td>
                      <td className="px-4 py-3 text-[11px]" onClick={e => e.stopPropagation()}>
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
                      <td className="px-4 py-3 text-[11px] text-slate-500">
                        {[p.region, p.folderCount ? `${p.folderCount} ${isAr ? 'منديل' : 'folders'}` : ''].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-4 py-3">{statusBadge(p.status)}</td>
                      <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
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
                    <td colSpan={canEdit ? 9 : 8} className="py-12 text-center text-slate-400">
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
    const handleExportExcel = () => {
      const sheetRows = projects.map((p, idx) => ({
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
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Branches Archive');
      XLSX.writeFile(wb, `ARMS_Comments_Branches_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const reportTemplates = [
      { id: 'branches' as const, label: isAr ? '1. سجل الفروع والإرساليات' : '1. Branches & Shipments Log' },
      { id: 'dossiers' as const, label: isAr ? '2. ملخص الدوسيهات الأسبوعية' : '2. Weekly Dossiers Summary' },
      { id: 'summary' as const, label: isAr ? '3. ملخص البوكسات' : '3. Boxes Summary' },
    ];

    const handleExportPDF = async () => {
      if (exportingPdf) return;
      setExportingPdf(true);
      try {
        let columns: CommentsReportColumn[] = [];
        let rows: Record<string, string | number>[] = [];
        let title = isAr ? 'تقرير أرشفة التعليقات' : 'Comments Archive Report';

        if (selectedReportTab === 'branches') {
          title = isAr ? 'سجل الفروع والإرساليات' : 'Branches & Shipments Log';
          columns = [
            { key: 'branchName', label: isAr ? 'اسم الفرع' : 'Branch Name', weight: 1.8 },
            { key: 'shipmentNo', label: isAr ? 'رقم الإرسالية' : 'Shipment No.', weight: 1.1, align: 'center' },
            { key: 'startDate', label: isAr ? 'تاريخ بدء التشغيل' : 'Start Date', weight: 1.1, align: 'center' },
            { key: 'boxDossier', label: isAr ? 'البوكس / الدوسيه' : 'Box / Dossier', weight: 1.0, align: 'center' },
            { key: 'status', label: isAr ? 'الحالة' : 'Status', weight: 0.9, align: 'center' },
          ];
          rows = projects.map(p => ({
            branchName: p.branchName || `#${p.jobId}`,
            shipmentNo: p.shipmentNo ?? '—',
            startDate: fmtDate(p.startDate),
            boxDossier: `${p.boxId}-${p.dossierNumber}`,
            status: p.status,
          }));
        } else if (selectedReportTab === 'dossiers') {
          title = isAr ? 'ملخص الدوسيهات الأسبوعية' : 'Weekly Dossiers Summary';
          columns = [
            { key: 'id', label: isAr ? 'الدوسيه' : 'Dossier', weight: 0.9, align: 'center' },
            { key: 'week', label: isAr ? 'الأسبوع' : 'Week', weight: 1.7, align: 'center' },
            { key: 'total', label: isAr ? 'الفروع' : 'Branches', weight: 0.8, align: 'center' },
            { key: 'archived', label: isAr ? 'المؤرشف' : 'Archived', weight: 0.8, align: 'center' },
            { key: 'missing', label: isAr ? 'مفقود' : 'Missing', weight: 0.8, align: 'center' },
            { key: 'status', label: isAr ? 'الحالة' : 'Status', weight: 0.9, align: 'center' },
          ];
          rows = sortedDossiers.map(d => ({
            id: d.id,
            week: `${fmtDate(d.weekStart)} → ${fmtDate(d.weekEnd)}`,
            total: d.totalProjects,
            archived: d.archivedCount,
            missing: d.missingCount,
            status: d.status,
          }));
        } else {
          title = isAr ? 'ملخص البوكسات' : 'Boxes Summary';
          columns = [
            { key: 'boxCode', label: isAr ? 'البوكس' : 'Box', weight: 0.9, align: 'center' },
            { key: 'dossiersCount', label: isAr ? 'الدوسيهات' : 'Dossiers', weight: 0.9, align: 'center' },
            { key: 'total', label: isAr ? 'إجمالي الفروع' : 'Total Branches', weight: 1.0, align: 'center' },
            { key: 'archived', label: isAr ? 'المؤرشف' : 'Archived', weight: 0.9, align: 'center' },
            { key: 'missing', label: isAr ? 'مفقود' : 'Missing', weight: 0.8, align: 'center' },
            { key: 'status', label: isAr ? 'الحالة' : 'Status', weight: 1.0, align: 'center' },
          ];
          rows = sortedBoxes.map(b => ({
            boxCode: b.boxCode,
            dossiersCount: `${sortedDossiers.filter(d => d.boxId === b.boxCode).length} / 6`,
            total: b.totalProjects,
            archived: b.archivedProjects,
            missing: b.missingProjects,
            status: b.status,
          }));
        }

        const printDate = new Date().toLocaleString(isAr ? 'ar-EG' : 'en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        });

        const fileName = await exportCommentsReportToPDF({
          reportId: selectedReportTab,
          reportTitle: title,
          isAr,
          columns,
          rows,
          summaryItems: [
            { label: isAr ? 'البوكسات' : 'Boxes', value: String(sortedBoxes.length) },
            { label: isAr ? 'الدوسيهات' : 'Dossiers', value: String(sortedDossiers.length) },
            { label: isAr ? 'الفروع' : 'Branches', value: String(projects.length) },
            { label: isAr ? 'المؤرشف' : 'Archived', value: `${archivedCount} (${archivedPercent}%)` },
          ],
          preparedBy: currentUser?.name || (isAr ? 'مدير النظام' : 'System Admin'),
          printDate,
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <div className="text-[11px] font-bold mb-0.5 text-[#E52225] dark:text-red-400">
              {isAr ? 'أرشفة التعليقات' : 'Comments Archive'}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <FileBarChart className="w-6 h-6 text-[#E52225]" />
              <span>{isAr ? 'مركز تقارير الفروع والتعليقات' : 'Comments & Branches Reports Center'}</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={projects.length === 0}
              onClick={handleExportExcel}
              className="group inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 hover:bg-emerald-600 hover:border-emerald-600 hover:text-white rounded-lg transition-colors disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 group-hover:text-white transition-colors" />
              <span>{isAr ? 'تصدير Excel' : 'Export Excel'}</span>
            </button>
            <button
              type="button"
              disabled={projects.length === 0 || exportingPdf}
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
          <aside className="lg:col-span-4 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl p-3.5 space-y-1">
            {reportTemplates.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => setSelectedReportTab(tpl.id)}
                className={`w-full text-start px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                  selectedReportTab === tpl.id
                    ? 'bg-[#E52225] text-white font-bold'
                    : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-900'
                }`}
              >
                {tpl.label}
              </button>
            ))}
          </aside>

          <div className="lg:col-span-8 bg-slate-100/80 dark:bg-black border border-slate-200/80 dark:border-neutral-800 rounded-xl p-3 sm:p-5">
            <div dir="rtl" className="bg-white text-slate-900 border border-slate-300 rounded-lg overflow-hidden shadow-md mx-auto max-w-[794px] p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-4 pb-1" dir="ltr">
                <img src={logoColor} alt="Intercom" className="h-7 w-auto object-contain" />
                <h3 className="text-base font-bold text-slate-900 text-center">Comments Archive Report</h3>
                <img src={armsLogoLight} alt="ARMS" className="h-7 w-auto object-contain" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-50 border border-slate-200 rounded-md px-3 py-2">
                <div><span className="font-bold">البوكسات:</span> {sortedBoxes.length}</div>
                <div><span className="font-bold">الدوسيهات:</span> {sortedDossiers.length}</div>
                <div><span className="font-bold">الفروع:</span> {projects.length}</div>
                <div><span className="font-bold">المؤرشف:</span> {archivedCount} ({archivedPercent}%)</div>
              </div>

              <table className="w-full border-collapse text-[11px] text-start">
                <thead>
                  {selectedReportTab === 'branches' && (
                    <tr className="bg-[#D9D9D9] text-slate-900 font-bold">
                      <th className="border border-slate-400 px-2 py-1.5 text-center">#</th>
                      <th className="border border-slate-400 px-2 py-1.5">اسم الفرع</th>
                      <th className="border border-slate-400 px-2 py-1.5">رقم الإرسالية</th>
                      <th className="border border-slate-400 px-2 py-1.5">تاريخ بدء التشغيل</th>
                      <th className="border border-slate-400 px-2 py-1.5">البوكس / الدوسيه</th>
                      <th className="border border-slate-400 px-2 py-1.5">الحالة</th>
                    </tr>
                  )}
                  {selectedReportTab === 'dossiers' && (
                    <tr className="bg-[#D9D9D9] text-slate-900 font-bold">
                      <th className="border border-slate-400 px-2 py-1.5">الدوسيه</th>
                      <th className="border border-slate-400 px-2 py-1.5">الأسبوع</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-center">الفروع</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-center">المؤرشف</th>
                      <th className="border border-slate-400 px-2 py-1.5">الحالة</th>
                    </tr>
                  )}
                  {selectedReportTab === 'summary' && (
                    <tr className="bg-[#D9D9D9] text-slate-900 font-bold">
                      <th className="border border-slate-400 px-2 py-1.5">البوكس</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-center">الدوسيهات</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-center">إجمالي الفروع</th>
                      <th className="border border-slate-400 px-2 py-1.5 text-center">المؤرشف</th>
                      <th className="border border-slate-400 px-2 py-1.5">الحالة</th>
                    </tr>
                  )}
                </thead>
                <tbody>
                  {selectedReportTab === 'branches' &&
                    (projects.length ? (
                      projects.slice(0, 60).map((p, idx) => (
                        <tr key={p.jobId}>
                          <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{idx + 1}</td>
                          <td className="border border-slate-300 px-2 py-1 font-semibold">{p.branchName}</td>
                          <td className="border border-slate-300 px-2 py-1 font-mono">{p.shipmentNo}</td>
                          <td className="border border-slate-300 px-2 py-1 tabular-nums">{fmtDate(p.startDate)}</td>
                          <td className="border border-slate-300 px-2 py-1 font-mono">{p.boxId}-{p.dossierNumber}</td>
                          <td className="border border-slate-300 px-2 py-1">{p.status}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="border border-slate-300 py-8 text-center text-slate-500">
                          {isAr ? 'لا توجد بيانات بعد' : 'No records added yet'}
                        </td>
                      </tr>
                    ))}

                  {selectedReportTab === 'dossiers' &&
                    (sortedDossiers.length ? (
                      sortedDossiers.map(d => (
                        <tr key={d.id}>
                          <td className="border border-slate-300 px-2 py-1 font-mono font-bold">{d.id}</td>
                          <td className="border border-slate-300 px-2 py-1 tabular-nums">{fmtDate(d.weekStart)} → {fmtDate(d.weekEnd)}</td>
                          <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{d.totalProjects}</td>
                          <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{d.archivedCount}</td>
                          <td className="border border-slate-300 px-2 py-1">{d.status}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="border border-slate-300 py-8 text-center text-slate-500">
                          {isAr ? 'لا توجد بيانات بعد' : 'No records added yet'}
                        </td>
                      </tr>
                    ))}

                  {selectedReportTab === 'summary' &&
                    (sortedBoxes.length ? (
                      sortedBoxes.map(b => (
                        <tr key={b.id}>
                          <td className="border border-slate-300 px-2 py-1 font-mono font-bold">{b.boxCode}</td>
                          <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">
                            {sortedDossiers.filter(d => d.boxId === b.boxCode).length} / 6
                          </td>
                          <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{b.totalProjects}</td>
                          <td className="border border-slate-300 px-2 py-1 text-center tabular-nums">{b.archivedProjects}</td>
                          <td className="border border-slate-300 px-2 py-1">{b.status}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="border border-slate-300 py-8 text-center text-slate-500">
                          {isAr ? 'لا توجد بيانات بعد' : 'No records added yet'}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
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
            {isAr ? 'أرشفة التعليقات' : 'Comments Archive'}
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <FileSpreadsheet className="w-6 h-6 text-[#E52225]" />
            <span>{isAr ? 'استيراد شيت الفروع والإرساليات' : 'Import Branches Plan Sheet'}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-neutral-400 mt-0.5">
            {isAr
              ? 'رفع شيت الفروع (اسم الفرع · رقم الإرسالية · تاريخ بدء التشغيل) لتقسيمه على أسابيع داخل البوكسات (6 دوسيهات لكل بوكس).'
              : 'Upload branch sheets (Branch Name, Shipment No., Start Date) to organize into weekly dossiers and boxes.'}
          </p>
        </div>
      </div>

      <MinutesPlanImport />

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
