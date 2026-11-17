import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Globe,
  KeyRound,
  LogOut,
  MessageSquareText,
  Moon,
  ScrollText,
  Sun,
  User,
  Users,
} from 'lucide-react';
import { useArchive } from '../../context/ArchiveContext';
import { WorkspaceModule } from '../../types';
import { IntercomLogo } from '../common/IntercomLogo';
import { ArmsLogo } from '../common/ArmsLogo';
import { PalletBoxesIcon, ReportPaperIcon } from '../common/WorkspaceIcons';
import archiveReportsImg from '../../assets/images/portal_kraft_reports_archive_1794846311471.jpg';
import palletReportsImg from '../../assets/images/portal_pallet_reports_1794845235798.jpg';
import commentsArchiveImg from '../../assets/images/comments_branch_real_label_1794933915152.jpg';

interface WorkspacePortalViewProps {
  onOpenProfile: (tab?: 'profile' | 'password') => void;
}

interface WorkspaceMetric {
  label: string;
  value: string;
}

interface WorkspaceCardConfig {
  id: WorkspaceModule;
  index: string;
  code: string;
  title: string;
  metrics: [WorkspaceMetric, WorkspaceMetric, WorkspaceMetric];
  image: string;
  imageAlt: string;
  icon: React.ComponentType<{ className?: string }>;
  accentHex: string;
  accentGlow: string;
  softIconBg: string;
  hoverTextClass: string;
}

export const WorkspacePortalView: React.FC<WorkspacePortalViewProps> = ({ onOpenProfile }) => {
  const {
    currentUser,
    language,
    setLanguage,
    logout,
    setActiveWorkspace,
    operationsArchive,
    palletArchive,
    minutesArchive,
    archiveLoading,
  } = useArchive();

  const isAr = language === 'ar';
  const DirectionalArrow = isAr ? ArrowLeft : ArrowRight;

  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('arms_theme') === 'dark';
  });
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const [hoveredId, setHoveredId] = useState<WorkspaceModule | null>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
    try {
      localStorage.setItem('arms_theme', darkMode ? 'dark' : 'light');
    } catch {
      /* storage unavailable */
    }
  }, [darkMode]);

  const fmtCount = (n: number) => (archiveLoading ? '—' : n.toLocaleString('en-US'));

  const workspaces: WorkspaceCardConfig[] = [
    {
      id: 'reports-archive',
      index: '01',
      code: 'OPERATIONS',
      title: isAr ? 'أرشفة تقارير التشغيل' : 'Operations Reports Archive',
      metrics: [
        { label: isAr ? 'البوكسات' : 'Boxes', value: fmtCount(operationsArchive.boxes.length) },
        {
          label: isAr ? 'الدوسيهات' : 'Dossiers',
          value: fmtCount(operationsArchive.dossiers.length),
        },
        {
          label: isAr ? 'المشاريع' : 'Projects',
          value: fmtCount(operationsArchive.projects.length),
        },
      ],
      image: archiveReportsImg,
      imageAlt: isAr
        ? 'بوكسات أرشفة تقارير التشغيل D44 و D45'
        : 'Operations archive boxes D44 and D45 on steel shelving',
      icon: ReportPaperIcon,
      accentHex: '#0B56A8',
      accentGlow: 'rgba(11, 86, 168, 0.28)',
      softIconBg: 'bg-[#0B56A8]/10 text-[#0B56A8] dark:bg-blue-500/15 dark:text-blue-400',
      hoverTextClass: 'group-hover:text-[#0B56A8] dark:group-hover:text-blue-400',
    },
    {
      id: 'pallet-archive',
      index: '02',
      code: 'PALLET',
      title: isAr ? 'أرشفة تقارير تسليم الباليت' : 'Pallet Handover Archive',
      metrics: [
        { label: isAr ? 'البوكسات' : 'Boxes', value: fmtCount(palletArchive.boxes.length) },
        { label: isAr ? 'الدوسيهات' : 'Dossiers', value: fmtCount(palletArchive.dossiers.length) },
        { label: isAr ? 'السجلات' : 'Records', value: fmtCount(palletArchive.projects.length) },
      ],
      image: palletReportsImg,
      imageAlt: isAr
        ? 'باليتات الأرشفة المخزنية المحملة بالبوكسات'
        : 'Warehouse archive pallets loaded with boxed batches',
      icon: PalletBoxesIcon,
      accentHex: '#D97706',
      accentGlow: 'rgba(217, 119, 6, 0.28)',
      softIconBg: 'bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
      hoverTextClass: 'group-hover:text-amber-700 dark:group-hover:text-amber-400',
    },
    {
      id: 'minutes-archive',
      index: '03',
      code: 'BRANCHES',
      title: isAr ? 'أرشفة تعليقات الفروع' : 'Branch Comments Archive',
      metrics: [
        { label: isAr ? 'البوكسات' : 'Boxes', value: fmtCount(minutesArchive.boxes.length) },
        {
          label: isAr ? 'الدوسيهات' : 'Dossiers',
          value: fmtCount(minutesArchive.dossiers.length),
        },
        { label: isAr ? 'الفروع' : 'Branches', value: fmtCount(minutesArchive.projects.length) },
      ],
      image: commentsArchiveImg,
      imageAlt: isAr
        ? 'بوكسات أرشفة تعليقات الفروع C15 و C16 بالليبل الرسمي'
        : 'Branch comments archive boxes C15 and C16 with official Intercom ARMS labels',
      icon: MessageSquareText,
      accentHex: '#E52225',
      accentGlow: 'rgba(229, 34, 37, 0.28)',
      softIconBg: 'bg-[#E52225]/10 text-[#E52225] dark:bg-red-500/15 dark:text-red-400',
      hoverTextClass: 'group-hover:text-[#E52225] dark:group-hover:text-red-400',
    },
  ];

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[#F8FAFC] dark:bg-[#060709] text-slate-900 dark:text-neutral-100 flex flex-col transition-colors"
    >
      {/* Top Corporate Bar */}
      <header className="sticky top-0 z-20 bg-white/95 dark:bg-[#0B0C0F]/95 backdrop-blur-sm border-b border-slate-200/80 dark:border-neutral-800/90">
        <div className="h-[2px] w-full flex" aria-hidden="true">
          <div className="flex-1 bg-[#0B56A8]" />
          <div className="w-24 bg-[#F5A614]" />
          <div className="w-16 bg-[#E52225]" />
        </div>

        <div className="max-w-7xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div dir="ltr" className="flex items-center gap-3 shrink-0">
            <IntercomLogo size="md" className="[&_img]:h-5 sm:[&_img]:h-6 [&_img]:w-auto" />
            <span className="h-4 w-px bg-slate-200 dark:bg-neutral-800" aria-hidden="true" />
            <ArmsLogo size="md" className="[&_img]:h-6 sm:[&_img]:h-7 [&_img]:w-auto" />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {currentUser.role === 'System Admin' && (
              <div className="flex items-center gap-1 me-1">
                <button
                  type="button"
                  onClick={() => setActiveWorkspace('admin-audit')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-neutral-300 hover:text-[#0B56A8] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800/80 transition-colors whitespace-nowrap"
                >
                  <ScrollText className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{isAr ? 'سجل العمليات' : 'Audit Log'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveWorkspace('admin-users')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-neutral-300 hover:text-[#0B56A8] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800/80 transition-colors whitespace-nowrap"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{isAr ? 'المستخدمين' : 'Users'}</span>
                </button>

                <span
                  className="h-4 w-px bg-slate-200 dark:bg-neutral-800 mx-0.5"
                  aria-hidden="true"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => setLanguage(isAr ? 'en' : 'ar')}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800/80 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isAr ? 'EN' : 'عربي'}</span>
            </button>

            <button
              type="button"
              onClick={() => setDarkMode(v => !v)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800/80 transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <span
              className="h-4 w-px bg-slate-200 dark:bg-neutral-800 mx-0.5 hidden sm:block"
              aria-hidden="true"
            />

            <button
              type="button"
              onClick={() => onOpenProfile('profile')}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-800/80 transition-colors whitespace-nowrap"
            >
              <User className="w-3.5 h-3.5 text-[#0B56A8] dark:text-blue-400" />
              <span className="max-w-[130px] truncate">{currentUser.name}</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenProfile('password')}
              title={isAr ? 'تغيير كلمة المرور' : 'Change Password'}
              aria-label={isAr ? 'تغيير كلمة المرور' : 'Change Password'}
              className="p-2 rounded-lg text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-800/80 transition-colors"
            >
              <KeyRound className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => void logout()}
              title={isAr ? 'تسجيل الخروج' : 'Sign Out'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#E52225] dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isAr ? 'خروج' : 'Sign Out'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Portal Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-5 sm:px-8 py-8 sm:py-10 lg:py-12 flex flex-col justify-center">
        {/* Clean Header (Greeting with Bold Name + Title Only) */}
        <div className="pb-6 border-b border-slate-200/80 dark:border-neutral-800/80">
          <p className="text-sm text-slate-500 dark:text-neutral-400">
            {isAr ? 'أهلاً ' : 'Welcome, '}
            <strong className="font-extrabold text-slate-900 dark:text-white">
              {currentUser.name}
            </strong>
          </p>
          <h1 className="mt-1.5 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white text-balance">
            {isAr ? 'اختر القسم' : 'Select Workspace'}
          </h1>
        </div>

        {/* 3-Column Interactive Workspace Grid */}
        <section
          aria-label={isAr ? 'أقسام الأرشيف' : 'Archive Workspaces'}
          className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-7 items-stretch"
        >
          {workspaces.map((ws, idx) => {
            const Icon = ws.icon;
            const imgFailed = Boolean(failedImages[ws.id]);
            const isHovered = hoveredId === ws.id;
            const isDimmed = hoveredId !== null && hoveredId !== ws.id;

            return (
              <button
                key={ws.id}
                type="button"
                onMouseEnter={() => setHoveredId(ws.id)}
                onMouseLeave={() => setHoveredId(null)}
                onFocus={() => setHoveredId(ws.id)}
                onBlur={() => setHoveredId(null)}
                onClick={() => setActiveWorkspace(ws.id)}
                style={{
                  animationDelay: `${idx * 90}ms`,
                  borderColor: isHovered ? ws.accentHex : undefined,
                  boxShadow: isHovered
                    ? `0 24px 48px -18px ${ws.accentGlow}, 0 0 0 1px ${ws.accentHex}`
                    : undefined,
                }}
                className={`portal-card-enter group relative text-start flex flex-col rounded-2xl overflow-hidden bg-white dark:bg-[#0D0E11] border border-slate-200 dark:border-neutral-800 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none motion-reduce:transform-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B56A8] ${
                  isHovered ? '-translate-y-2.5 scale-[1.015]' : 'translate-y-0 scale-100'
                } ${isDimmed ? 'lg:opacity-70 lg:scale-[0.985]' : 'opacity-100'}`}
              >
                {/* Clean Full-Bleed Photograph with Light Sheen Sweep */}
                <div className="relative w-full aspect-[16/10] bg-slate-100 dark:bg-neutral-900 overflow-hidden">
                  {!imgFailed ? (
                    <img
                      src={ws.image}
                      alt={ws.imageAlt}
                      referrerPolicy="no-referrer"
                      onError={() => setFailedImages(prev => ({ ...prev, [ws.id]: true }))}
                      className="w-full h-full object-cover transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.07] motion-reduce:transform-none"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-white"
                      style={{
                        background: `linear-gradient(135deg, #0F172A 0%, ${ws.accentHex} 100%)`,
                      }}
                    >
                      <Icon className="w-10 h-10 opacity-90" />
                    </div>
                  )}

                  {/* Smooth Diagonal Sheen Sweep on Hover */}
                  <div
                    className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out bg-gradient-to-r from-transparent via-white/25 to-transparent -skew-x-12"
                    aria-hidden="true"
                  />

                  {/* Subtle Contrast Vignette on Hover */}
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    aria-hidden="true"
                  />

                  {/* Expanding Department Accent Line */}
                  <div
                    className="absolute inset-x-0 bottom-0 h-[3px] origin-start transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] scale-x-[0.25] group-hover:scale-x-100"
                    style={{ backgroundColor: ws.accentHex }}
                    aria-hidden="true"
                  />
                </div>

                {/* Minimal Card Content */}
                <div className="p-5 sm:p-6 flex-1 flex flex-col w-full">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      style={{
                        backgroundColor: isHovered ? ws.accentHex : undefined,
                        color: isHovered ? '#ffffff' : undefined,
                      }}
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-110 group-hover:rotate-3 ${ws.softIconBg}`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="font-mono text-[11px] font-bold tracking-wider text-slate-400 dark:text-neutral-500 truncate">
                      {ws.index} · {ws.code}
                    </span>
                  </div>

                  <h2
                    className={`mt-4 text-xl font-extrabold text-slate-900 dark:text-white tracking-tight transition-colors duration-300 ${ws.hoverTextClass}`}
                  >
                    {ws.title}
                  </h2>

                  {/* Grounded 3-Column Live Metrics */}
                  <div className="mt-5 py-3.5 border-y border-slate-100 dark:border-neutral-800/80 grid grid-cols-3 gap-2">
                    {ws.metrics.map(metric => (
                      <div key={metric.label} className="min-w-0">
                        <div className="text-[11px] font-medium text-slate-500 dark:text-neutral-400 truncate">
                          {metric.label}
                        </div>
                        <div className="mt-0.5 text-base font-extrabold text-slate-900 dark:text-white tabular-nums transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-0.5">
                          {metric.value}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Animated Action Footer */}
                  <div className="mt-auto pt-4 flex items-center justify-between">
                    <span
                      className={`text-sm font-bold text-slate-800 dark:text-neutral-200 transition-all duration-300 ${ws.hoverTextClass}`}
                    >
                      {isAr ? 'دخول' : 'Open'}
                    </span>
                    <span
                      style={{
                        backgroundColor: isHovered ? ws.accentHex : undefined,
                        borderColor: isHovered ? ws.accentHex : undefined,
                      }}
                      className={`inline-flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-900 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                        isHovered
                          ? 'text-white scale-110 shadow-sm'
                          : 'text-slate-500 dark:text-neutral-400'
                      }`}
                    >
                      <DirectionalArrow className="w-4 h-4 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </section>
      </main>
    </div>
  );
};
