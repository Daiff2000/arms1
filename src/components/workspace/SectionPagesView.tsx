import React, { useState } from 'react';
import {
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
  Plus,
  Printer,
  RotateCcw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { useArchive } from '../../context/ArchiveContext';
import { ActiveTab } from '../navigation/TopNav';
import { MinutesPlanImport } from './MinutesPlanImport';
import { MinutesArchiveViews } from './MinutesArchiveViews';
import { PalletHandoverViews } from './PalletHandoverViews';
import { DeleteUploadModal } from '../common/DeleteUploadModal';
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
  const { currentUser, language, minutesArchive, palletArchive, palletReports } = useArchive();
  const isAr = language === 'ar';
  const DirectionalArrow = isAr ? ArrowLeft : ArrowRight;
  const isSystemAdmin = currentUser.role === 'System Admin';
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [targetUploadId, setTargetUploadId] = useState<string | null>(null);

  const isPallet = workspace === 'pallet-archive';
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived' | 'pending'>('all');
  const [selectedReportTab, setSelectedReportTab] = useState<'summary' | 'records' | 'audit'>('summary');
  const [reportBoxFilter, setReportBoxFilter] = useState<string>('all');
  const [reportSearch, setReportSearch] = useState('');
  const [labelPreviewCode, setLabelPreviewCode] = useState(isPallet ? 'PLT-001' : 'MIN-001');

  const hasPalletData =
    palletArchive.boxes.length > 0 ||
    palletArchive.projects.length > 0 ||
    palletArchive.uploadHistory.length > 0 ||
    palletReports.length > 0;
  const palletTotalBoxes = palletReports.reduce((sum, row) => sum + (row.boxesCount || row.boxCount || 0), 0);
  const palletOverCapacity = new Set(palletReports.filter(row => row.capacityStatus === 'over-capacity').map(row => `${row.palletCode}|${row.deliveryDate || row.inspectionDate}`)).size;
  const palletMonths = new Set(palletReports.map(row => row.archiveMonth || row.deliveryDate?.slice(0, 7) || row.inspectionDate?.slice(0, 7)).filter(Boolean)).size;

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

  if (isPallet && activeTab === 'import') {
    return <PalletHandoverViews mode="import" onNavigate={onNavigate} />;
  }
  if (isPallet && activeTab === 'archive') {
    return <PalletHandoverViews mode="archive" onNavigate={onNavigate} />;
  }

  const theme = isPallet
    ? {
        sectionTitle: isAr ? 'أرشفة تقارير تسليم الباليت' : 'Pallet Handover Reports',
        sectionSubtitle: isAr
          ? 'نظرة شاملة على أرشفة تقارير تسليم الباليتات وحالة السجلات.'
          : 'Overview of pallet handover reports and archived records.',
        accentText: 'text-[#D97706] dark:text-amber-400',
        accentHoverText: 'hover:text-[#B45309] dark:hover:text-amber-300',
        accentGroupHoverText: 'group-hover:text-[#D97706] dark:group-hover:text-amber-400',
        accentBg: 'bg-[#D97706] hover:bg-[#B45309]',
        accentBgSolid: 'bg-[#D97706]',
        accentTint: 'bg-amber-50 dark:bg-amber-950/50 text-[#B45309] dark:text-amber-400',
        accentBorderFocus: 'focus:border-[#D97706] focus:ring-[#D97706]',
        accentBorderHover: 'hover:border-[#D97706]/50',
        accentHex: '#D97706',
        archiveTitle: isAr ? 'أرشيف تقارير تسليم الباليت' : 'Pallet Reports Archive',
        archiveSubtitle: isAr
          ? 'قائمة السجلات والملفات الخاصة بتقارير تسليم الباليت.'
          : 'Structured archive directory for pallet handover reports.',
        reportsTitle: isAr ? 'مركز تقارير الباليت' : 'Pallet Reports Center',
        labelsTitle: isAr ? 'طباعة ليبلات الباليت' : 'Pallet Thermal Labels',
        importTitle: isAr ? 'استيراد بيانات الباليت' : 'Import Pallet Data',
      }
    : {
        sectionTitle: isAr ? 'أرشفة التعليقات' : 'Comments Archive',
        sectionSubtitle: isAr
          ? 'نظرة شاملة على أرشفة التعليقات وحالة السجلات.'
          : 'Overview of archived comments and record statuses.',
        accentText: 'text-[#E52225] dark:text-red-400',
        accentHoverText: 'hover:text-[#C81B1E] dark:hover:text-red-300',
        accentGroupHoverText: 'group-hover:text-[#E52225] dark:group-hover:text-red-400',
        accentBg: 'bg-[#E52225] hover:bg-[#C81B1E]',
        accentBgSolid: 'bg-[#E52225]',
        accentTint: 'bg-red-50 dark:bg-red-950/50 text-[#E52225] dark:text-red-400',
        accentBorderFocus: 'focus:border-[#E52225] focus:ring-[#E52225]',
        accentBorderHover: 'hover:border-[#E52225]/50',
        accentHex: '#E52225',
        archiveTitle: isAr ? 'أرشيف التعليقات' : 'Comments Directory',
        archiveSubtitle: isAr
          ? 'قائمة السجلات والتعليقات المؤرشفة.'
          : 'Structured archive directory for comments.',
        reportsTitle: isAr ? 'مركز تقارير التعليقات' : 'Comments Reports Center',
        labelsTitle: isAr ? 'طباعة ليبلات التعليقات' : 'Archive Thermal Labels',
        importTitle: isAr ? 'استيراد بيانات التعليقات' : 'Import Archive Data',
      };

  const emptyPieData = [{ name: isAr ? 'فارغ' : 'Empty', value: 1, color: '#E2E8F0' }];

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
    {
      id: 'import',
      label: isAr ? 'استيراد البيانات' : 'Import Data',
      icon: FileSpreadsheet,
      onClick: () => onNavigate('import'),
    },
    {
      id: 'reports',
      label: isAr ? 'مركز التقارير' : 'Reports Center',
      icon: FileBarChart,
      onClick: () => onNavigate('reports'),
    },
  ];

  /* -------------------- 1. DASHBOARD VIEW -------------------- */
  if (activeTab === 'dashboard') {
    return (
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <div className={`text-[11px] font-bold mb-0.5 ${theme.accentText}`}>
              {theme.sectionTitle}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
              {isAr ? 'لوحة المتابعة والتحكم' : 'Workspace Dashboard'}
            </h1>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('import')}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors whitespace-nowrap shrink-0 self-start sm:self-auto ${theme.accentBg}`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>{isAr ? 'استيراد البيانات' : 'Import Data'}</span>
          </button>
        </div>

        {/* Search Input Shell */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder={isAr ? `بحث في ${theme.sectionTitle}...` : `Search ${theme.sectionTitle}...`}
            className={`w-full h-11 ps-10 pe-4 text-xs sm:text-sm bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl focus:outline-none focus:ring-1 ${theme.accentBorderFocus}`}
          />
        </div>

        {/* Unified 4-KPI Strip + Progress Bar */}
        <section
          aria-label={isAr ? 'ملخص مؤشرات القسم' : 'Section Metrics Summary'}
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
                {isPallet ? palletReports.length.toLocaleString() : 0}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">
                {isPallet ? `${palletTotalBoxes.toLocaleString()} ${isAr ? 'بوكس' : 'boxes'}` : (isAr ? 'جاهز لاستقبال البيانات' : 'Ready for records')}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('archive')}
              className="p-5 text-start bg-white dark:bg-[#111111] hover:bg-slate-50/80 dark:hover:bg-neutral-900/60 transition-colors group"
            >
              <div className={`flex items-center justify-between text-xs font-medium ${theme.accentText}`}>
                <span>{isAr ? 'المؤرشف' : 'Archived'}</span>
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
              <div className={`mt-2 text-2xl sm:text-3xl font-extrabold tabular-nums ${theme.accentText}`}>
                {isPallet ? palletReports.filter(row => row.archived !== false).length.toLocaleString() : 0}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                {isPallet && palletReports.length ? '100%' : '0.0%'} {isAr ? 'من الإجمالي' : 'completed'}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('archive')}
              className="p-5 text-start bg-white dark:bg-[#111111] hover:bg-slate-50/80 dark:hover:bg-neutral-900/60 transition-colors group"
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-neutral-400">
                <span>{isAr ? 'قيد المتابعة' : 'In Review'}</span>
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                {isPallet ? palletOverCapacity.toLocaleString() : 0}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                {isPallet ? (isAr ? 'باليت تجاوزت 36 بوكس' : 'pallets over 36 boxes') : (isAr ? 'بانتظار الاعتماد' : 'pending')}
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="p-5 text-start bg-white dark:bg-[#111111] hover:bg-slate-50/80 dark:hover:bg-neutral-900/60 transition-colors group"
            >
              <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-neutral-400">
                <span>{isAr ? 'التقارير الجاهزة' : 'Reports'}</span>
                <FileBarChart className={`w-3.5 h-3.5 ${theme.accentText}`} />
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tabular-nums">
                {isPallet ? palletMonths.toLocaleString() : 0}
              </div>
              <div className="mt-1 text-[11px] text-slate-400 tabular-nums">
                {isAr ? 'دوسيهات شهرية' : 'Monthly folders'}
              </div>
            </button>
          </div>

          <div className="px-5 py-3 bg-slate-50/70 dark:bg-neutral-900/30 border-t border-slate-200 dark:border-neutral-800 flex items-center gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <Layers className={`w-4 h-4 ${theme.accentText}`} />
              <span className="text-xs font-bold text-slate-700 dark:text-neutral-200">
                {isAr ? 'التقدم الإجمالي' : 'Overall Progress'}
              </span>
            </div>

            <div className="flex-1 bg-slate-200 dark:bg-neutral-800/80 rounded-full h-2 overflow-hidden flex">
              <div className={`${theme.accentBgSolid} h-full`} style={{ width: isPallet && palletReports.length ? '100%' : '0%' }} />
            </div>

            <span className={`text-xs font-extrabold tabular-nums shrink-0 ${theme.accentText}`}>
              {isPallet && palletReports.length ? '100.0%' : '0.0%'}
            </span>
          </div>
        </section>

        {/* Row 2: 8/4 Split — Overview Panel + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <section className="lg:col-span-8 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl flex flex-col justify-between overflow-hidden">
            <div>
              <div className="px-5 py-4 border-b border-slate-100 dark:border-neutral-800 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  {isAr ? 'السجلات النشطة' : 'Active Records'}
                </h2>
                <button
                  type="button"
                  onClick={() => onNavigate('archive')}
                  className={`text-xs font-semibold hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${theme.accentText}`}
                >
                  <span>{isAr ? 'عرض الأرشيف' : 'View archive'}</span>
                  <DirectionalArrow className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="py-16 px-6 text-center space-y-2">
                <div className={`w-10 h-10 rounded-xl mx-auto flex items-center justify-center ${theme.accentTint}`}>
                  <FolderArchive className="w-5 h-5" />
                </div>
                <div className="text-sm font-bold text-slate-800 dark:text-neutral-200">
                  {isAr ? 'هيكل القسم جاهز للإعداد' : 'Section Foundation Ready'}
                </div>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  {isAr
                    ? 'لم يتم إضافة حقول أو سجلات لهذا القسم بعد.'
                    : 'No fields or records configured for this section yet.'}
                </p>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between text-[11px] text-slate-500">
              <span>{theme.sectionTitle}</span>
              <span className="tabular-nums">0 {isAr ? 'سجل' : 'records'}</span>
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
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${theme.accentTint}`}>
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

        {/* Row 3: 4/8 Split — Status Donut + Recent Imports Shell */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-4 p-5 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl flex flex-col justify-between">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'توزيع الحالات' : 'Status Distribution'}
            </h2>

            <div className="relative h-48 my-2">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={emptyPieData} cx="50%" cy="50%" innerRadius={54} outerRadius={76} dataKey="value" stroke="none">
                    {emptyPieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">0.0%</span>
                <span className="text-[10px] font-semibold text-slate-400">
                  {isAr ? 'مؤرشف' : 'Archived'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100 dark:border-neutral-800 text-center">
              {[
                { label: isAr ? 'مؤرشف' : 'Archived', color: theme.accentHex },
                { label: isAr ? 'مراجعة' : 'Review', color: '#64748B' },
                { label: isAr ? 'انتظار' : 'Pending', color: '#CBD5E1' },
              ].map(item => (
                <div key={item.label} className="flex flex-col">
                  <span className="text-[11px] text-slate-500 dark:text-neutral-400 truncate flex items-center justify-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ backgroundColor: item.color }} />
                    <span>{item.label}</span>
                  </span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">0</span>
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
                <button
                  type="button"
                  onClick={() => onNavigate('import')}
                  className={`text-xs font-semibold hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${theme.accentText}`}
                >
                  <span>{isAr ? 'رفع ملف جديد' : 'Upload File'}</span>
                  <DirectionalArrow className="w-3.5 h-3.5" />
                </button>
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
                    <tr>
                      <td colSpan={4} className="py-12 text-center text-slate-400">
                        {isAr ? 'لم يتم رفع ملفات في هذا القسم بعد' : 'No uploads in this section yet'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- 2. ARCHIVE DIRECTORY VIEW -------------------- */
  if (activeTab === 'archive') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <div className={`text-[11px] font-bold mb-0.5 ${theme.accentText}`}>{theme.sectionTitle}</div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <FolderArchive className={`w-6 h-6 ${theme.accentText}`} />
              <span>{theme.archiveTitle}</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isSystemAdmin && hasPalletData && (
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
              onClick={() => onNavigate('import')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white rounded-lg transition-colors shadow-xs ${theme.accentBg}`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isAr ? 'إضافة / استيراد' : 'Add / Import'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('labels')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-900 rounded-lg transition-colors"
            >
              <Printer className={`w-3.5 h-3.5 ${theme.accentText}`} />
              <span>{isAr ? 'طباعة الليبلات' : 'Print Labels'}</span>
            </button>
          </div>
        </div>

        <DeleteUploadModal
          isOpen={deleteModalOpen}
          scope="pallet"
          initialUploadId={targetUploadId}
          onClose={() => {
            setDeleteModalOpen(false);
            setTargetUploadId(null);
          }}
        />

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-[#111111] p-3 rounded-xl border border-slate-200 dark:border-neutral-800">
          <div className="relative w-full sm:w-72">
            <Search className="absolute start-3 top-2.5 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder={isAr ? 'بحث في السجلات...' : 'Search records...'}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`w-full ps-9 pe-3 py-1.5 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-1 ${theme.accentBorderFocus}`}
            />
          </div>

          <div className="flex items-center gap-1 w-full sm:w-auto overflow-x-auto">
            {(['all', 'active', 'archived', 'pending'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  statusFilter === f
                    ? `${theme.accentBgSolid} text-white font-semibold shadow-xs`
                    : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900'
                }`}
              >
                {f === 'all' && (isAr ? 'الكل' : 'All')}
                {f === 'active' && (isAr ? 'نشط' : 'Active')}
                {f === 'archived' && (isAr ? 'مؤرشف' : 'Archived')}
                {f === 'pending' && (isAr ? 'قيد الانتظار' : 'Pending')}
              </button>
            ))}
          </div>
        </div>

        {/* Empty Table Shell */}
        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 dark:bg-neutral-900/80 text-slate-500 text-[11px] font-semibold border-b border-slate-200 dark:border-neutral-800">
                <tr>
                  <th className="px-4 py-3 text-start">{isAr ? 'المرجع' : 'Reference'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'العنوان / البيان' : 'Description'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'التاريخ' : 'Date'}</th>
                  <th className="px-4 py-3 text-start">{isAr ? 'الحالة' : 'Status'}</th>
                  <th className="px-4 py-3 text-center">{isAr ? 'الإجراءات' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {!isPallet && minutesArchive.dossiers.length > 0 ? (
                  [...minutesArchive.dossiers]
                    .sort((a, b) => (a.weekStart || '').localeCompare(b.weekStart || ''))
                    .filter(d => !searchTerm || `${d.id} ${d.weekStart}`.toLowerCase().includes(searchTerm.toLowerCase()) || minutesArchive.projects.some(p => p.boxId === d.boxId && p.dossierNumber === d.dossierNumber && `${p.branchName} ${p.branchCode} ${p.region}`.toLowerCase().includes(searchTerm.toLowerCase())))
                    .map(d => {
                      const folders = minutesArchive.projects.filter(p => p.boxId === d.boxId && p.dossierNumber === d.dossierNumber).reduce((n, p) => n + (p.folderCount || 0), 0);
                      return (
                        <tr key={d.id} className="border-b border-slate-50 dark:border-neutral-900">
                          <td className="px-4 py-2.5 font-mono font-bold">{d.id}</td>
                          <td className="px-4 py-2.5">{isAr ? `${d.totalProjects} إرسالية · ${folders.toLocaleString()} منديل` : `${d.totalProjects} shipments · ${folders.toLocaleString()} folders`}</td>
                          <td className="px-4 py-2.5">{d.weekStart?.split('-').reverse().join('/')} → {d.weekEnd?.split('-').reverse().join('/')}</td>
                          <td className="px-4 py-2.5">{d.status}</td>
                          <td className="px-4 py-2.5 text-center">—</td>
                        </tr>
                      );
                    })
                ) : (
                <tr>
                  <td colSpan={5} className="py-16 px-4 text-center text-slate-400">
                    {isAr
                      ? 'لا توجد سجلات بعد — هذه الصفحة جاهزة لإضافة الحقول والأعمدة الخاصة بالقسم.'
                      : 'No records yet — archive structure is ready for custom fields.'}
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

  /* -------------------- 3. REPORTS VIEW -------------------- */
  if (activeTab === 'reports') {
    const reportTemplates = [
      { id: 'summary' as const, label: isAr ? 'الملخص العام للقسم' : 'Section Summary', titleEn: 'Pallet Section Summary' },
      { id: 'records' as const, label: isAr ? 'سجل البيانات المؤرشفة' : 'Archived Records Log', titleEn: 'Pallet Archived Records Log' },
      { id: 'audit' as const, label: isAr ? 'تقرير المراجعة والاعتماد' : 'Review & Approval Report', titleEn: 'Pallet Review & Approval Report' },
    ];

    const activeTemplate = reportTemplates.find(r => r.id === selectedReportTab) || reportTemplates[0];
    const palletBoxes = [...palletArchive.boxes].sort((a, b) => a.boxCode.localeCompare(b.boxCode));
    const reportQuery = reportSearch.trim().toLowerCase();

    const filteredPalletProjects = palletArchive.projects.filter(p => {
      if (reportBoxFilter !== 'all' && p.boxId !== reportBoxFilter) return false;
      if (!reportQuery) return true;
      return (
        String(p.jobId).toLowerCase().includes(reportQuery) ||
        (p.boxId || '').toLowerCase().includes(reportQuery) ||
        (p.branchName || '').toLowerCase().includes(reportQuery) ||
        (p.status || '').toLowerCase().includes(reportQuery)
      );
    });

    const filteredPalletBoxes = palletBoxes.filter(b => {
      if (reportBoxFilter !== 'all' && b.boxCode !== reportBoxFilter) return false;
      if (!reportQuery) return true;
      return (
        b.boxCode.toLowerCase().includes(reportQuery) ||
        b.status.toLowerCase().includes(reportQuery)
      );
    });

    const scopeLabel = reportBoxFilter === 'all' ? 'All Boxes' : `Box ${reportBoxFilter}`;
    const totalSummaryDisplay = `${filteredPalletProjects.length} Records · ${filteredPalletBoxes.length} Boxes`;
    const formattedPrintDate = new Date().toLocaleString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });

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
              disabled
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-500 dark:text-neutral-400 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg opacity-60 cursor-not-allowed whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isAr ? 'تصدير Excel' : 'Export Excel'}</span>
            </button>
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-500 dark:text-neutral-400 bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg opacity-60 cursor-not-allowed whitespace-nowrap"
            >
              <FileDown className={`w-3.5 h-3.5 ${theme.accentText}`} />
              <span>{isAr ? 'تصدير PDF (A4)' : 'Export PDF (A4)'}</span>
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
                {(reportBoxFilter !== 'all' || reportSearch) && (
                  <button
                    type="button"
                    onClick={() => {
                      setReportBoxFilter('all');
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
                  {isAr ? 'البوكس' : 'Box'}
                </label>
                <select
                  value={reportBoxFilter}
                  onChange={e => setReportBoxFilter(e.target.value)}
                  className={`w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg text-slate-800 dark:text-neutral-200 focus:outline-none ${theme.accentBorderFocus}`}
                >
                  <option value="all">
                    {isAr ? `كل البوكسات (${palletBoxes.length})` : `All Boxes (${palletBoxes.length})`}
                  </option>
                  {palletBoxes.map(b => (
                    <option key={b.id} value={b.boxCode}>
                      {b.boxCode}
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
                    placeholder={isAr ? 'بوكس، باليت، مرجع، حالة...' : 'Box, pallet, reference, status...'}
                    className={`w-full ps-8 pe-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg text-slate-800 dark:text-neutral-200 focus:outline-none ${theme.accentBorderFocus}`}
                  />
                </div>
              </div>
            </div>
          </aside>

          <div className="lg:col-span-8 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-neutral-800">
              <h2 className="text-sm font-bold text-slate-800 dark:text-white">{activeTemplate.label}</h2>
              <span className="text-xs text-slate-400 tabular-nums">
                {filteredPalletProjects.length} {isAr ? 'سجل' : 'records'}
              </span>
            </div>

            <div className="bg-slate-100/80 dark:bg-black border border-slate-200/80 dark:border-neutral-800 rounded-xl p-3 sm:p-5">
              <div dir="ltr" className="bg-white text-slate-900 border border-slate-300 rounded-lg overflow-hidden shadow-md mx-auto max-w-[794px] p-5 sm:p-6 space-y-3.5">
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

                <table className="w-full border-collapse text-[12px] text-left">
                  <thead>
                    <tr className="bg-[#D9D9D9] text-slate-900 font-bold">
                      <th className="border border-slate-400 px-2 py-1.5 w-9 text-center">#</th>
                      <th className="border border-slate-400 px-2.5 py-1.5">Reference</th>
                      <th className="border border-slate-400 px-2.5 py-1.5">Box</th>
                      <th className="border border-slate-400 px-2.5 py-1.5">Date</th>
                      <th className="border border-slate-400 px-2.5 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPalletProjects.length > 0 ? (
                      filteredPalletProjects.slice(0, 50).map((p, idx) => (
                        <tr key={p.jobId}>
                          <td className="border border-slate-300 px-2 py-1.5 text-center tabular-nums">{idx + 1}</td>
                          <td className="border border-slate-300 px-2.5 py-1.5 font-semibold">{p.branchName || `#${p.jobId}`}</td>
                          <td className="border border-slate-300 px-2.5 py-1.5 font-mono">{p.boxId}</td>
                          <td className="border border-slate-300 px-2.5 py-1.5 tabular-nums">{p.dateApproved || p.startDate || '—'}</td>
                          <td className="border border-slate-300 px-2.5 py-1.5">{p.status}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={5} className="border border-slate-300 py-10 text-center text-slate-500">
                          No records added yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="pt-2.5 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
                  <span>Intercom ARMS</span>
                  <span className="tabular-nums">Page 1 of 1</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- 4. LABELS VIEW -------------------- */
  if (activeTab === 'labels') {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <div className={`text-[11px] font-bold mb-0.5 ${theme.accentText}`}>{theme.sectionTitle}</div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
              <Printer className={`w-6 h-6 ${theme.accentText}`} />
              <span>{theme.labelsTitle}</span>
            </h1>
          </div>

          <button
            type="button"
            onClick={() => window.print()}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors whitespace-nowrap ${theme.accentBg}`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>{isAr ? 'طباعة' : 'Print'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl p-4 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              {isAr ? 'إعدادات الليبل' : 'Label Setup'}
            </h2>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-neutral-400 mb-1">
                {isAr ? 'كود المرجع' : 'Reference Code'}
              </label>
              <input
                type="text"
                value={labelPreviewCode}
                onChange={e => setLabelPreviewCode(e.target.value)}
                className={`w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-1 ${theme.accentBorderFocus}`}
              />
            </div>
          </div>

          <div className="lg:col-span-8 bg-slate-100/80 dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl p-6 sm:p-10 flex items-center justify-center">
            <div
              dir="ltr"
              className="w-full max-w-[440px] aspect-[2/1] bg-white text-black border-2 border-black rounded-sm p-4 flex flex-col justify-between shadow-md"
            >
              <div className="flex items-center justify-between border-b border-black pb-2">
                <span className="text-xs font-extrabold tracking-wide uppercase">INTERCOM · ARMS</span>
                <span className="text-[11px] font-bold">
                  {isPallet ? 'PALLET ARCHIVE' : 'COMMENTS ARCHIVE'}
                </span>
              </div>
              <div className="text-center my-auto">
                <div className="text-2xl font-black font-mono tracking-wider">
                  {labelPreviewCode || (isPallet ? 'PLT-001' : 'C1')}
                </div>
                <div className="text-[11px] text-neutral-600 mt-1">100 × 50 mm Thermal Template</div>
              </div>
              <div className="border-t border-black pt-1.5 flex items-center justify-between text-[10px] font-mono">
                <span>SECTION: {isPallet ? '02 PALLET' : '03 COMMENTS'}</span>
                <span>READY</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* -------------------- 5. IMPORT DATA VIEW -------------------- */
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
        <div>
          <div className={`text-[11px] font-bold mb-0.5 ${theme.accentText}`}>{theme.sectionTitle}</div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <FileSpreadsheet className={`w-6 h-6 ${theme.accentText}`} />
            <span>{theme.importTitle}</span>
          </h1>
        </div>

        {isSystemAdmin && hasPalletData && (
          <button
            type="button"
            onClick={() => {
              setTargetUploadId(null);
              setDeleteModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#E52225] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 hover:bg-[#E52225] hover:text-white rounded-lg transition-colors shrink-0 self-start sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isAr ? 'مسح رفعة / بيانات' : 'Delete Upload / Data'}</span>
          </button>
        )}
      </div>

      <DeleteUploadModal
        isOpen={deleteModalOpen}
        scope="pallet"
        initialUploadId={targetUploadId}
        onClose={() => {
          setDeleteModalOpen(false);
          setTargetUploadId(null);
        }}
      />

      {!isPallet ? <MinutesPlanImport /> : (
      <div className={`bg-white dark:bg-[#111111] border-2 border-dashed border-slate-300 dark:border-neutral-800 rounded-xl p-10 text-center space-y-3 transition-colors ${theme.accentBorderHover}`}>
        <div className={`w-12 h-12 rounded-xl mx-auto flex items-center justify-center ${theme.accentTint}`}>
          <Upload className="w-6 h-6" />
        </div>
        <div className="text-sm font-bold text-slate-900 dark:text-white">
          {isAr ? 'اسحب ملف Excel هنا أو اختر ملفاً للرفع' : 'Drop Excel file here or choose a file'}
        </div>
        <p className="text-xs text-slate-400 max-w-md mx-auto">
          {isAr
            ? 'منطقة استيراد البيانات جاهزة لربط أعمدة الإكسيل الخاصة بالقسم.'
            : 'Import engine shell ready to map columns for this section.'}
        </p>
      </div>
      )}

      <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl overflow-hidden">
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
                  {isSystemAdmin && (
                    <th className="px-3 py-2.5 text-center">{isAr ? 'إجراء' : 'Action'}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {palletArchive.uploadHistory.map(u => (
                  <tr key={u.id} className="border-b border-slate-50 dark:border-neutral-900">
                    <td className="px-5 py-2.5 font-semibold text-slate-900 dark:text-white">{u.fileName}</td>
                    <td className="px-3 py-2.5 text-slate-500">{u.userName}</td>
                    <td className="px-3 py-2.5 text-slate-500 tabular-nums">{u.timestamp}</td>
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
      </div>
    </div>
  );
};
