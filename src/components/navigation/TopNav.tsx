/**
 * ARMS - Horizontal Top Navigation
 * Brand-aligned top navigation with Archive & Profile dropdowns.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  Home,
  FolderArchive,
  Archive,
  FileText,
  FileBarChart,
  Printer,
  FileSpreadsheet,
  Bell,
  User,
  ChevronDown,
  LogOut,
  KeyRound,
  Globe,
  Sun,
  Moon,
  LayoutGrid,
  MessageSquareText,
  Check,
} from 'lucide-react';
import { useArchive } from '../../context/ArchiveContext';
import { WorkspaceModule } from '../../types';
import { IntercomLogo } from '../common/IntercomLogo';
import { ArmsLogo } from '../common/ArmsLogo';
import { PalletBoxesIcon, ReportPaperIcon } from '../common/WorkspaceIcons';

export type ActiveTab =
  | 'dashboard'
  | 'archive'
  | 'boxes'
  | 'box-detail'
  | 'dossiers'
  | 'dossier-detail'
  | 'projects'
  | 'reports'
  | 'labels'
  | 'import'
  | 'audit'
  | 'users'
  | 'settings';

interface TopNavProps {
  activeTab: ActiveTab;
  onNavigate: (tab: ActiveTab, param?: string) => void;
  onOpenNotifications: () => void;
  onOpenProfile: (tab?: 'profile' | 'password') => void;
  breadcrumbs?: { label: string; tab?: ActiveTab; param?: string }[];
}

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onNavigate,
  onOpenNotifications,
  onOpenProfile,
  breadcrumbs = [],
}) => {
  const {
    currentUser,
    notifications,
    language,
    setLanguage,
    logout,
    activeWorkspace,
    setActiveWorkspace,
    operationsArchive,
    palletArchive,
    palletReports,
    minutesArchive,
  } = useArchive();

  const isAr = language === 'ar';

  const [archiveDropdownOpen, setArchiveDropdownOpen] = useState(false);
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('arms_theme') === 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
    localStorage.setItem('arms_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const archiveRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const mobileWorkspaceRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter(n => !n.isRead).length;

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (archiveRef.current && !archiveRef.current.contains(target)) {
        setArchiveDropdownOpen(false);
      }
      if (
        (!workspaceRef.current || !workspaceRef.current.contains(target)) &&
        (!mobileWorkspaceRef.current || !mobileWorkspaceRef.current.contains(target))
      ) {
        setWorkspaceDropdownOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(target)) {
        setProfileDropdownOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setArchiveDropdownOpen(false);
        setWorkspaceDropdownOpen(false);
        setProfileDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const isOperations = activeWorkspace !== 'pallet-archive' && activeWorkspace !== 'minutes-archive';
  const isPallet = activeWorkspace === 'pallet-archive';
  const isMinutes = activeWorkspace === 'minutes-archive';
  const hasArchiveHierarchy = isOperations || isMinutes;

  const isArchiveActive =
    activeTab === 'archive' ||
    activeTab === 'boxes' ||
    activeTab === 'box-detail' ||
    activeTab === 'dossiers' ||
    activeTab === 'dossier-detail' ||
    activeTab === 'projects';

  const activeNavClass = isPallet
    ? 'text-[#B45309] dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 font-bold'
    : !isOperations
    ? 'text-[#E52225] dark:text-red-300 bg-red-50 dark:bg-red-950/40 font-bold'
    : 'text-[#0B56A8] dark:text-blue-300 bg-[#EAF2FB] dark:bg-[#0B56A8]/20 font-bold';

  const inactiveNavClass = isPallet
    ? 'text-slate-600 dark:text-neutral-300 hover:text-[#B45309] dark:hover:text-white hover:bg-slate-50 dark:hover:bg-neutral-900/60'
    : !isOperations
    ? 'text-slate-600 dark:text-neutral-300 hover:text-[#E52225] dark:hover:text-white hover:bg-slate-50 dark:hover:bg-neutral-900/60'
    : 'text-slate-600 dark:text-neutral-300 hover:text-[#0B56A8] dark:hover:text-white hover:bg-slate-50 dark:hover:bg-neutral-900/60';

  const mobileActiveBtnClass = isPallet
    ? 'bg-[#D97706] text-white'
    : !isOperations
    ? 'bg-[#E52225] text-white'
    : 'bg-[#0B56A8] text-white';

  const avatarBgClass = isPallet
    ? 'bg-[#D97706]'
    : !isOperations
    ? 'bg-[#E52225]'
    : 'bg-[#0B56A8]';

  const breadcrumbActiveClass = isPallet
    ? 'text-[#B45309] dark:text-amber-400 font-bold whitespace-nowrap'
    : !isOperations
    ? 'text-[#E52225] dark:text-red-400 font-bold whitespace-nowrap'
    : 'text-[#0B56A8] dark:text-blue-400 font-bold whitespace-nowrap';

  const workspaceDockItems: Array<{
    id: WorkspaceModule;
    shortLabel: string;
    fullLabel: string;
    boxCount: number;
    icon: React.ComponentType<{ className?: string }>;
    iconColorClass: string;
    tintBadgeClass: string;
    activeRowClass: string;
    triggerAccentClass: string;
  }> = [
    {
      id: 'reports-archive',
      shortLabel: isAr ? 'التشغيل' : 'Operations',
      fullLabel: isAr ? 'أرشفة تقارير التشغيل' : 'Operations Reports Archive',
      boxCount: operationsArchive.boxes.length,
      icon: ReportPaperIcon,
      iconColorClass: 'text-[#0B56A8] dark:text-blue-400',
      tintBadgeClass: 'bg-[#EAF2FB] text-[#0B56A8] dark:bg-[#0B56A8]/25 dark:text-blue-400',
      activeRowClass: 'bg-[#EAF2FB]/70 dark:bg-[#0B56A8]/20 text-[#0B56A8] dark:text-blue-300 font-bold',
      triggerAccentClass: 'border-slate-200 dark:border-neutral-800 hover:border-[#0B56A8]/50 dark:hover:border-blue-500/40',
    },
    {
      id: 'pallet-archive',
      shortLabel: isAr ? 'الباليت' : 'Pallet',
      fullLabel: isAr ? 'أرشفة تقارير تسليم الباليت' : 'Pallet Handover Archive',
      boxCount:
        palletReports.length > 0
          ? new Set(palletReports.map(r => r.palletCode).filter(Boolean)).size
          : palletArchive.boxes.length,
      icon: PalletBoxesIcon,
      iconColorClass: 'text-[#D97706] dark:text-amber-400',
      tintBadgeClass: 'bg-amber-50 text-[#B45309] dark:bg-amber-950/50 dark:text-amber-400',
      activeRowClass: 'bg-amber-50/90 dark:bg-amber-950/35 text-[#B45309] dark:text-amber-300 font-bold',
      triggerAccentClass: 'border-slate-200 dark:border-neutral-800 hover:border-[#D97706]/50 dark:hover:border-amber-500/40',
    },
    {
      id: 'minutes-archive',
      shortLabel: isAr ? 'التعليقات' : 'Branches',
      fullLabel: isAr ? 'أرشفة تعليقات الفروع' : 'Branch Comments Archive',
      boxCount: minutesArchive.boxes.length,
      icon: MessageSquareText,
      iconColorClass: 'text-[#E52225] dark:text-red-400',
      tintBadgeClass: 'bg-red-50 text-[#E52225] dark:bg-red-950/50 dark:text-red-400',
      activeRowClass: 'bg-red-50/90 dark:bg-red-950/35 text-[#E52225] dark:text-red-300 font-bold',
      triggerAccentClass: 'border-slate-200 dark:border-neutral-800 hover:border-[#E52225]/50 dark:hover:border-red-500/40',
    },
  ];

  const currentDockId: WorkspaceModule = isPallet
    ? 'pallet-archive'
    : isMinutes
    ? 'minutes-archive'
    : 'reports-archive';
  const currentDockItem = workspaceDockItems.find(w => w.id === currentDockId) || workspaceDockItems[0];
  const CurrentDockIcon = currentDockItem.icon;

  return (
    <header className="sticky top-0 z-40 bg-white dark:bg-[#111111] border-b border-slate-200 dark:border-neutral-800">
      {/* Intercom Brand Tri-Color Top Hairline */}
      {isPallet ? (
        <div className="h-[2px] w-full flex" aria-hidden="true">
          <div className="flex-1 bg-[#F5A614]" />
          <div className="w-28 bg-[#0B56A8]" />
          <div className="w-20 bg-[#E52225]" />
        </div>
      ) : !isOperations ? (
        <div className="h-[2px] w-full flex" aria-hidden="true">
          <div className="flex-1 bg-[#E52225]" />
          <div className="w-28 bg-[#0B56A8]" />
          <div className="w-20 bg-[#F5A614]" />
        </div>
      ) : (
        <div className="h-[2px] w-full flex" aria-hidden="true">
          <div className="flex-1 bg-[#0B56A8]" />
          <div className="w-28 bg-[#F5A614]" />
          <div className="w-20 bg-[#E52225]" />
        </div>
      )}

      <div className="max-w-[1640px] mx-auto px-3 sm:px-6 lg:px-10">
        <div dir="ltr" className="flex items-center justify-between h-[68px] gap-2 sm:gap-4 lg:gap-6">
          {/* Physical Left Zone: Intercom Logo + Locale & Theme Preferences */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="flex items-center focus:outline-none hover:opacity-90 transition-opacity"
              aria-label="Intercom ARMS Home"
            >
              <IntercomLogo size="md" className="[&_img]:h-5 sm:[&_img]:h-6 lg:[&_img]:h-7 [&_img]:w-auto" />
            </button>

            <div className="h-5 w-px bg-slate-200 dark:bg-neutral-800 hidden sm:block mx-0.5" />

            <div className="flex items-center gap-0.5 sm:gap-1">
              <button
                type="button"
                onClick={() => setLanguage(language === 'ar' ? 'en' : 'ar')}
                title={language === 'ar' ? 'Switch to English' : 'التبديل للعربية'}
                className="px-2 py-1.5 text-xs font-semibold text-slate-600 dark:text-neutral-300 hover:text-[#0B56A8] dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors flex items-center gap-1.5"
              >
                <Globe className="w-4 h-4 shrink-0" />
                <span className="text-[11px] font-bold hidden sm:inline">
                  {language === 'ar' ? 'EN' : 'عربي'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setDarkMode(value => !value)}
                title={
                  language === 'ar'
                    ? darkMode
                      ? 'الوضع الفاتح'
                      : 'الوضع الداكن'
                    : darkMode
                    ? 'Light mode'
                    : 'Dark mode'
                }
                aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                className="p-1.5 sm:p-2 text-slate-600 dark:text-neutral-300 hover:text-[#0B56A8] dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Center Zone: Balanced Single-Line Navigation */}
          <nav
            dir={language === 'ar' ? 'rtl' : 'ltr'}
            className="hidden lg:flex items-center justify-center gap-0.5 xl:gap-1.5 flex-1 min-w-0 px-2"
          >
            {/* Simple Unified Workspace Dropdown Selector */}
            <div className="relative flex items-center shrink-0" ref={workspaceRef}>
              <button
                type="button"
                onClick={() => {
                  setWorkspaceDropdownOpen(v => !v);
                  setArchiveDropdownOpen(false);
                }}
                aria-expanded={workspaceDropdownOpen}
                aria-haspopup="menu"
                title={currentDockItem.fullLabel}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-slate-50/80 dark:bg-neutral-900 text-xs font-bold text-slate-800 dark:text-white transition-colors whitespace-nowrap shrink-0 ${currentDockItem.triggerAccentClass}`}
              >
                <CurrentDockIcon className={`w-4 h-4 shrink-0 ${currentDockItem.iconColorClass}`} />
                <span>{currentDockItem.shortLabel}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                    workspaceDropdownOpen ? 'rotate-180 text-slate-700 dark:text-white' : ''
                  }`}
                />
              </button>

              {workspaceDropdownOpen && (
                <div
                  role="menu"
                  className="absolute top-full start-0 mt-1.5 w-72 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl shadow-xl py-1.5 z-50"
                >
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 dark:text-neutral-500">
                    {isAr ? 'اختر القسم' : 'Select Workspace'}
                  </div>

                  {workspaceDockItems.map(ws => {
                    const WsIcon = ws.icon;
                    const isActive = currentDockId === ws.id;
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setActiveWorkspace(ws.id);
                          setWorkspaceDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 text-xs text-start transition-colors ${
                          isActive
                            ? ws.activeRowClass
                            : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-900'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${ws.tintBadgeClass}`}>
                            <WsIcon className="w-4 h-4" />
                          </span>
                          <span className="truncate">{ws.fullLabel}</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[11px] font-mono text-slate-400 tabular-nums">{ws.boxCount}</span>
                          {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </div>
                      </button>
                    );
                  })}

                  <div className="my-1.5 border-t border-slate-100 dark:border-neutral-800" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveWorkspace(null);
                      setWorkspaceDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-900 hover:text-slate-900 dark:hover:text-white text-start transition-colors"
                  >
                    <LayoutGrid className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{isAr ? 'عرض جميع الأقسام' : 'All Workspaces Portal'}</span>
                  </button>
                </div>
              )}
            </div>

            <span className="h-5 w-px bg-slate-200 dark:bg-neutral-800 mx-1 shrink-0" aria-hidden="true" />

            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'dashboard' ? activeNavClass : inactiveNavClass
              }`}
            >
              <Home className="w-4 h-4 shrink-0" />
              <span>{language === 'ar' ? 'الرئيسية' : 'Dashboard'}</span>
            </button>

            {hasArchiveHierarchy ? (
              <div className="relative" ref={archiveRef}>
                <button
                  type="button"
                  onClick={() => setArchiveDropdownOpen(!archiveDropdownOpen)}
                  className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    isArchiveActive || archiveDropdownOpen ? activeNavClass : inactiveNavClass
                  }`}
                >
                  <FolderArchive className="w-4 h-4 shrink-0" />
                  <span>{language === 'ar' ? 'الأرشيف' : 'Archive'}</span>
                  <ChevronDown
                    className={`w-3.5 h-3.5 transition-transform duration-200 ${archiveDropdownOpen ? 'rotate-180' : ''}`}
                  />
                </button>

              {archiveDropdownOpen && (
                <div className="absolute top-full start-0 mt-1.5 w-64 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl shadow-xl py-2 z-50">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400">
                    {language === 'ar' ? 'أقسام الأرشيف' : 'Archive Sections'}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('boxes');
                      setArchiveDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs text-start transition-colors ${
                      activeTab === 'boxes' || activeTab === 'box-detail'
                        ? isMinutes
                          ? 'bg-red-50 dark:bg-red-950/40 text-[#E52225] dark:text-red-300 font-bold'
                          : 'bg-[#EAF2FB] dark:bg-[#0B56A8]/20 text-[#0B56A8] dark:text-blue-300 font-bold'
                        : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-900'
                    }`}
                  >
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        isMinutes
                          ? 'bg-red-50 dark:bg-red-950/50 text-[#E52225] dark:text-red-400'
                          : 'bg-[#EAF2FB] dark:bg-[#0B56A8]/25 text-[#0B56A8] dark:text-blue-400'
                      }`}
                    >
                      <Archive className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold">{language === 'ar' ? 'البوكسات' : 'Boxes'}</div>
                      <div className="text-[10px] text-slate-400">
                        {isMinutes
                          ? language === 'ar'
                            ? '6 دوسيهات (أسابيع)'
                            : '6 Dossiers (Weeks)'
                          : language === 'ar'
                          ? '6 دوسيهات · 300 مشروع'
                          : '6 Dossiers · 300 Projects'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('dossiers');
                      setArchiveDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs text-start transition-colors ${
                      activeTab === 'dossiers' || activeTab === 'dossier-detail'
                        ? isMinutes
                          ? 'bg-red-50 dark:bg-red-950/40 text-[#E52225] dark:text-red-300 font-bold'
                          : 'bg-[#EAF2FB] dark:bg-[#0B56A8]/20 text-[#0B56A8] dark:text-blue-300 font-bold'
                        : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-900'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-[#B45309] dark:text-amber-400 flex items-center justify-center shrink-0">
                      <FolderArchive className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold">{language === 'ar' ? 'الدوسيهات' : 'Dossiers'}</div>
                      <div className="text-[10px] text-slate-400">
                        {isMinutes
                          ? language === 'ar'
                            ? 'دوسيه واحد لكل أسبوع'
                            : 'One Week per Dossier'
                          : language === 'ar'
                          ? '50 مشروع لكل دوسيه'
                          : '50 Projects per Dossier'}
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onNavigate('projects');
                      setArchiveDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs text-start transition-colors ${
                      activeTab === 'projects'
                        ? isMinutes
                          ? 'bg-red-50 dark:bg-red-950/40 text-[#E52225] dark:text-red-300 font-bold'
                          : 'bg-[#EAF2FB] dark:bg-[#0B56A8]/20 text-[#0B56A8] dark:text-blue-300 font-bold'
                        : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-900'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-neutral-900 text-[#3F4144] dark:text-neutral-300 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold">
                        {isMinutes
                          ? language === 'ar'
                            ? 'الفروع'
                            : 'Branches'
                          : language === 'ar'
                          ? 'المشاريع'
                          : 'Projects'}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {isMinutes
                          ? language === 'ar'
                            ? 'اسم الفرع · الإرسالية · تاريخ التشغيل'
                            : 'Branch · Shipment · Start Date'
                          : 'Job ID & Date Approved'}
                      </div>
                    </div>
                  </button>
                </div>
              )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate('archive')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'archive' ? activeNavClass : inactiveNavClass
                }`}
              >
                <FolderArchive className="w-4 h-4 shrink-0" />
                <span>{language === 'ar' ? 'الأرشيف' : 'Archive'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'reports' ? activeNavClass : inactiveNavClass
              }`}
            >
              <FileBarChart className="w-4 h-4 shrink-0" />
              <span>{language === 'ar' ? 'التقارير' : 'Reports'}</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('labels')}
              className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'labels' ? activeNavClass : inactiveNavClass
              }`}
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>{language === 'ar' ? 'طباعة الليبلات' : 'Labels'}</span>
            </button>

            {(['System Admin', 'Archive Manager'].includes(currentUser.role) ||
              ((isMinutes || isPallet) && currentUser.role === 'Data Entry')) && (
              <button
                type="button"
                onClick={() => onNavigate('import')}
                className={`flex items-center gap-1.5 px-2.5 xl:px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'import' ? activeNavClass : inactiveNavClass
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 shrink-0" />
                <span>{language === 'ar' ? 'استيراد البيانات' : 'Import Data'}</span>
              </button>
            )}
          </nav>

          {/* Physical Right Zone: Notifications + User Account + ARMS PNG Logo */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <div className="flex items-center gap-1 sm:gap-1.5">
              <button
                type="button"
                onClick={onOpenNotifications}
                className="relative p-1.5 sm:p-2 text-slate-600 dark:text-neutral-300 hover:text-[#0B56A8] dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors"
                title={language === 'ar' ? 'الإشعارات' : 'Notifications'}
                aria-label={language === 'ar' ? 'الإشعارات' : 'Notifications'}
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#E52225] text-white text-[10px] font-bold rounded-full flex items-center justify-center tabular-nums">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              <div className="relative" ref={profileRef}>
                <button
                  type="button"
                  onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                  className={`flex items-center gap-2 px-1.5 sm:px-2 py-1 rounded-lg border transition-colors ${
                    profileDropdownOpen
                      ? 'border-[#0B56A8] bg-[#EAF2FB]/50 dark:bg-neutral-900'
                      : 'border-slate-200 dark:border-neutral-800 hover:bg-slate-50 dark:hover:bg-neutral-900'
                  }`}
                >
                  <div className={`w-7 h-7 rounded-full ${avatarBgClass} text-white flex items-center justify-center text-xs font-bold shrink-0`}>
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-start hidden 2xl:block" dir={language === 'ar' ? 'rtl' : 'ltr'}>
                    <div className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{currentUser.name}</div>
                    <div className="text-[10px] text-slate-500 dark:text-neutral-400 leading-tight">{currentUser.role}</div>
                  </div>
                  <ChevronDown
                    className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 hidden sm:block ${
                      profileDropdownOpen ? 'rotate-180 text-[#0B56A8]' : ''
                    }`}
                  />
                </button>

                {profileDropdownOpen && (
                  <div
                    dir={language === 'ar' ? 'rtl' : 'ltr'}
                    className="absolute right-0 top-full mt-1.5 w-64 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl shadow-xl py-2 z-50"
                  >
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-neutral-800">
                      <div className="text-xs font-bold text-slate-900 dark:text-white">{currentUser.name}</div>
                      <div className="text-[11px] text-slate-500 dark:text-neutral-400" dir="ltr">
                        @{currentUser.username} {currentUser.email ? `· ${currentUser.email}` : ''}
                      </div>
                      <div className="mt-1 text-[11px] font-semibold text-[#0B56A8] dark:text-blue-400">{currentUser.role}</div>
                    </div>

                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          onOpenProfile('profile');
                          setProfileDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-900 text-start font-medium"
                      >
                        <User className="w-4 h-4 text-slate-500" />
                        <span>{language === 'ar' ? 'الملف الشخصي' : 'My Profile'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          onOpenProfile('password');
                          setProfileDropdownOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-900 text-start font-medium"
                      >
                        <KeyRound className="w-4 h-4 text-slate-500" />
                        <span>{language === 'ar' ? 'تغيير كلمة المرور' : 'Change Password'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          setProfileDropdownOpen(false);
                          await logout();
                        }}
                        className="w-full flex items-center gap-2.5 px-3.5 py-2 text-xs text-[#E52225] dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-start font-medium"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>{language === 'ar' ? 'تسجيل الخروج' : 'Sign out'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="h-5 w-px bg-slate-200 dark:bg-neutral-800 hidden sm:block mx-0.5" />

            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="flex items-center focus:outline-none hover:opacity-90 transition-opacity"
              aria-label="ARMS Archive Report Management System"
            >
              <ArmsLogo size="md" className="[&_img]:h-6 sm:[&_img]:h-7 lg:[&_img]:h-8 [&_img]:w-auto" />
            </button>
          </div>
        </div>

        {/* Tablet & Mobile Navigation Strip */}
        <div className="lg:hidden border-t border-slate-100 dark:border-neutral-800 py-2">
          <div className="flex items-center gap-1.5">
            <div className="relative shrink-0" ref={mobileWorkspaceRef}>
              <button
                type="button"
                onClick={() => setWorkspaceDropdownOpen(v => !v)}
                aria-expanded={workspaceDropdownOpen}
                aria-haspopup="menu"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border bg-slate-50/80 dark:bg-neutral-900 text-xs font-bold text-slate-800 dark:text-white whitespace-nowrap shrink-0 transition-colors ${currentDockItem.triggerAccentClass}`}
              >
                <CurrentDockIcon className={`w-3.5 h-3.5 shrink-0 ${currentDockItem.iconColorClass}`} />
                <span>{currentDockItem.shortLabel}</span>
                <ChevronDown
                  className={`w-3 h-3 text-slate-400 transition-transform duration-200 ${
                    workspaceDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {workspaceDropdownOpen && (
                <div
                  role="menu"
                  className="absolute top-full start-0 mt-1.5 w-64 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl shadow-xl py-1.5 z-50"
                >
                  <div className="px-3 py-1 text-[11px] font-semibold text-slate-400 dark:text-neutral-500">
                    {isAr ? 'اختر القسم' : 'Select Workspace'}
                  </div>
                  {workspaceDockItems.map(ws => {
                    const WsIcon = ws.icon;
                    const isActive = currentDockId === ws.id;
                    return (
                      <button
                        key={ws.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setActiveWorkspace(ws.id);
                          setWorkspaceDropdownOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs text-start transition-colors ${
                          isActive
                            ? ws.activeRowClass
                            : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-900'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${ws.tintBadgeClass}`}>
                            <WsIcon className="w-3.5 h-3.5" />
                          </span>
                          <span className="truncate">{ws.fullLabel}</span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[11px] font-mono text-slate-400 tabular-nums">{ws.boxCount}</span>
                          {isActive && <Check className="w-3.5 h-3.5 shrink-0" />}
                        </div>
                      </button>
                    );
                  })}

                  <div className="my-1 border-t border-slate-100 dark:border-neutral-800" />

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setActiveWorkspace(null);
                      setWorkspaceDropdownOpen(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-900 text-start transition-colors"
                  >
                    <LayoutGrid className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{isAr ? 'عرض جميع الأقسام' : 'All Workspaces Portal'}</span>
                  </button>
                </div>
              )}
            </div>

            <span className="h-4 w-px bg-slate-200 dark:bg-neutral-800 shrink-0" aria-hidden="true" />

            <div className="flex items-center gap-1 overflow-x-auto pb-0.5 flex-1 min-w-0">

            <button
              onClick={() => onNavigate('dashboard')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition-colors ${
                activeTab === 'dashboard'
                  ? mobileActiveBtnClass
                  : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-900'
              }`}
            >
              <Home className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'الرئيسية' : 'Dashboard'}</span>
            </button>

            {hasArchiveHierarchy ? (
              <>
                <button
                  onClick={() => onNavigate('boxes')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition-colors ${
                    activeTab === 'boxes' || activeTab === 'box-detail'
                      ? mobileActiveBtnClass
                      : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-900'
                  }`}
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'البوكسات' : 'Boxes'}</span>
                </button>

                <button
                  onClick={() => onNavigate('dossiers')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition-colors ${
                    activeTab === 'dossiers' || activeTab === 'dossier-detail'
                      ? mobileActiveBtnClass
                      : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-900'
                  }`}
                >
                  <FolderArchive className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'الدوسيهات' : 'Dossiers'}</span>
                </button>

                <button
                  onClick={() => onNavigate('projects')}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition-colors ${
                    activeTab === 'projects'
                      ? mobileActiveBtnClass
                      : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>
                    {isMinutes
                      ? language === 'ar'
                        ? 'الفروع'
                        : 'Branches'
                      : language === 'ar'
                      ? 'المشاريع'
                      : 'Projects'}
                  </span>
                </button>
              </>
            ) : (
              <button
                onClick={() => onNavigate('archive')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition-colors ${
                  activeTab === 'archive'
                    ? mobileActiveBtnClass
                    : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-900'
                }`}
              >
                <FolderArchive className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'الأرشيف' : 'Archive'}</span>
              </button>
            )}

            <button
              onClick={() => onNavigate('reports')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition-colors ${
                activeTab === 'reports'
                  ? mobileActiveBtnClass
                  : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-900'
              }`}
            >
              <FileBarChart className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'التقارير' : 'Reports'}</span>
            </button>

            <button
              onClick={() => onNavigate('labels')}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition-colors ${
                activeTab === 'labels'
                  ? mobileActiveBtnClass
                  : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-900'
              }`}
            >
              <Printer className="w-3.5 h-3.5" />
              <span>{language === 'ar' ? 'الليبلات' : 'Labels'}</span>
            </button>

            {(['System Admin', 'Archive Manager'].includes(currentUser.role) ||
              ((isMinutes || isPallet) && currentUser.role === 'Data Entry')) && (
              <button
                onClick={() => onNavigate('import')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg shrink-0 transition-colors ${
                  activeTab === 'import'
                    ? mobileActiveBtnClass
                    : 'text-slate-700 dark:text-neutral-300 hover:bg-slate-100 dark:hover:bg-neutral-900'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>{language === 'ar' ? 'استيراد' : 'Import'}</span>
              </button>
            )}
            </div>
          </div>
        </div>
      </div>

      {/* Contextual Breadcrumbs Bar */}
      {breadcrumbs.length > 0 && (
        <div className="bg-slate-50 dark:bg-black border-t border-slate-200 dark:border-neutral-800">
          <div className="max-w-[1640px] mx-auto px-4 sm:px-8 lg:px-12 py-2 text-xs text-slate-500 dark:text-neutral-400 flex items-center gap-2 overflow-x-auto">
            {breadcrumbs.map((crumb, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="text-slate-400 dark:text-neutral-600 font-bold">/</span>}
                {crumb.tab ? (
                  <button
                    onClick={() => onNavigate(crumb.tab!, crumb.param)}
                    className="hover:text-slate-900 dark:hover:text-white font-medium hover:underline transition-colors whitespace-nowrap"
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span className={breadcrumbActiveClass}>{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};
