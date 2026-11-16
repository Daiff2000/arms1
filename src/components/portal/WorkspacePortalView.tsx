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
import stackedMinutesImg from '../../assets/images/portal_minutes_archive_desk_1794848247207.jpg';

interface WorkspacePortalViewProps {
  onOpenProfile: (tab?: 'profile' | 'password') => void;
}

export const WorkspacePortalView: React.FC<WorkspacePortalViewProps> = ({ onOpenProfile }) => {
  const {
    currentUser,
    language,
    setLanguage,
    logout,
    setActiveWorkspace,
    operationsArchive,
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

  const workspaces: Array<{
    id: WorkspaceModule;
    index: string;
    title: string;
    subtitle: string;
    stat: string;
    image: string;
    imageAlt: string;
    icon: React.ComponentType<{ className?: string }>;
    accentHex: string;
  }> = [
    {
      id: 'reports-archive',
      index: '01',
      title: isAr ? 'أرشفة تقارير التشغيل' : 'Operations Reports Archive',
      subtitle: isAr ? 'الصناديق والدوسيهات ومشاريع التشغيل والليبلات' : 'Boxes, dossiers, projects & thermal labels',
      stat: archiveLoading
        ? '—'
        : isAr
        ? `${operationsArchive.boxes.length} صندوق · ${operationsArchive.projects.length.toLocaleString()} مشروع`
        : `${operationsArchive.boxes.length} boxes · ${operationsArchive.projects.length.toLocaleString()} projects`,
      image: archiveReportsImg,
      imageAlt: 'Archive Boxes Shelving D44 D45',
      icon: ReportPaperIcon,
      accentHex: '#0B56A8',
    },
    {
      id: 'pallet-archive',
      index: '02',
      title: isAr ? 'أرشفة تقارير تسليم الباليت' : 'Pallet Handover Reports',
      subtitle: isAr ? 'أرشفة تقارير تسليم الباليتات ومتابعتها' : 'Pallet handover reports & tracking',
      stat: isAr ? '5 صفحات · جاهز للإعداد' : '5 pages · Ready',
      image: palletReportsImg,
      imageAlt: 'Warehouse Archive Pallets Loaded with Boxes',
      icon: PalletBoxesIcon,
      accentHex: '#D97706',
    },
    {
      id: 'minutes-archive',
      index: '03',
      title: isAr ? 'أرشفة التعليقات' : 'Comments Archive',
      subtitle: isAr ? 'أرشفة تعليقات الفروع والإرساليات والتقارير الخاصة بها' : 'Branch comments, shipments & related reports',
      stat: archiveLoading
        ? '—'
        : isAr
        ? `${minutesArchive.boxes.length} بوكس · ${minutesArchive.projects.length.toLocaleString()} فرع`
        : `${minutesArchive.boxes.length} boxes · ${minutesArchive.projects.length.toLocaleString()} branches`,
      image: stackedMinutesImg,
      imageAlt: 'Stacked Official Annotated Archive Reports',
      icon: MessageSquareText,
      accentHex: '#E52225',
    },
  ];

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="min-h-screen bg-white dark:bg-[#050505] text-slate-900 dark:text-neutral-100 flex flex-col transition-colors"
    >
      {/* Minimal Top Bar */}
      <header className="border-b border-slate-100 dark:border-neutral-900">
        <div className="h-[2px] w-full flex" aria-hidden="true">
          <div className="flex-1 bg-[#0B56A8]" />
          <div className="w-24 bg-[#F5A614]" />
          <div className="w-16 bg-[#E52225]" />
        </div>

        <div className="max-w-6xl mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
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
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-neutral-300 hover:text-[#0B56A8] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors whitespace-nowrap"
                >
                  <ScrollText className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{isAr ? 'سجل العمليات' : 'Audit Log'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveWorkspace('admin-users')}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-neutral-300 hover:text-[#0B56A8] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors whitespace-nowrap"
                >
                  <Users className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">{isAr ? 'المستخدمين' : 'Users'}</span>
                </button>

                <span className="h-4 w-px bg-slate-200 dark:bg-neutral-800 mx-0.5" aria-hidden="true" />
              </div>
            )}

            <button
              type="button"
              onClick={() => setLanguage(isAr ? 'en' : 'ar')}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isAr ? 'EN' : 'عربي'}</span>
            </button>

            <button
              type="button"
              onClick={() => setDarkMode(v => !v)}
              aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="p-2 rounded-lg text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <span className="h-4 w-px bg-slate-200 dark:bg-neutral-800 mx-0.5 hidden sm:block" aria-hidden="true" />

            <button
              type="button"
              onClick={() => onOpenProfile('profile')}
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-700 dark:text-neutral-200 hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors whitespace-nowrap"
            >
              <User className="w-3.5 h-3.5 text-[#0B56A8] dark:text-blue-400" />
              <span className="max-w-[130px] truncate">{currentUser.name}</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenProfile('password')}
              title={isAr ? 'تغيير كلمة المرور' : 'Change Password'}
              className="p-2 rounded-lg text-slate-500 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors"
            >
              <KeyRound className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => void logout()}
              title={isAr ? 'تسجيل الخروج' : 'Sign Out'}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#E52225] dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{isAr ? 'خروج' : 'Sign Out'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Sleek Centered Photo Gateway */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-5 sm:px-8 py-10 lg:py-16 flex flex-col justify-center">
        <div className="mb-10 lg:mb-12">
          <div className="text-xs font-semibold text-slate-500 dark:text-neutral-400">
            {isAr ? `أهلاً ${currentUser.name}` : `Welcome, ${currentUser.name}`}
            <span className="mx-2 text-slate-300 dark:text-neutral-700">·</span>
            <span>{currentUser.role}</span>
          </div>
          <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white text-balance">
            {isAr ? 'اختر القسم' : 'Select Workspace'}
          </h1>
        </div>

        <section
          aria-label={isAr ? 'أقسام الأرشيف' : 'Archive Workspaces'}
          className="grid grid-cols-1 md:grid-cols-3 gap-7 lg:gap-9 items-start"
        >
          {workspaces.map(ws => {
            const Icon = ws.icon;
            const imgFailed = Boolean(failedImages[ws.id]);
            const isMuted = hoveredId !== null && hoveredId !== ws.id;

            return (
              <button
                key={ws.id}
                type="button"
                onMouseEnter={() => setHoveredId(ws.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => setActiveWorkspace(ws.id)}
                className={`group text-start flex flex-col focus:outline-none transition-opacity duration-200 ${
                  isMuted ? 'md:opacity-55' : 'opacity-100'
                }`}
              >
                {/* Clean Unobstructed Image Frame */}
                <div className="relative w-full aspect-[16/10] rounded-2xl overflow-hidden bg-slate-100 dark:bg-neutral-900 border border-slate-200/80 dark:border-neutral-800/80 transition-transform duration-300 group-hover:-translate-y-1">
                  {!imgFailed ? (
                    <img
                      src={ws.image}
                      alt={ws.imageAlt}
                      referrerPolicy="no-referrer"
                      onError={() => setFailedImages(prev => ({ ...prev, [ws.id]: true }))}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
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

                  {/* Subtle bottom accent line revealed smoothly on hover */}
                  <div
                    className="absolute inset-x-0 bottom-0 h-1 origin-start scale-x-0 group-hover:scale-x-100 transition-transform duration-300"
                    style={{ backgroundColor: ws.accentHex }}
                    aria-hidden="true"
                  />
                </div>

                {/* Clean Typography Below Frame */}
                <div className="mt-4 w-full">
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="font-mono text-xs font-bold tabular-nums"
                      style={{ color: ws.accentHex }}
                    >
                      {ws.index}
                    </span>
                    <span className="text-xs font-medium text-slate-400 dark:text-neutral-500 tabular-nums">
                      {ws.stat}
                    </span>
                  </div>

                  <h2 className="mt-1.5 text-xl font-extrabold text-slate-900 dark:text-white tracking-tight group-hover:text-[#0B56A8] dark:group-hover:text-blue-400 transition-colors">
                    {ws.title}
                  </h2>

                  <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400 leading-relaxed">
                    {ws.subtitle}
                  </p>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-neutral-900 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-neutral-300 group-hover:text-slate-950 dark:group-hover:text-white transition-colors">
                      {isAr ? 'دخول' : 'Open'}
                    </span>
                    <DirectionalArrow
                      className="w-4 h-4 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-transform duration-200 group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5"
                    />
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
