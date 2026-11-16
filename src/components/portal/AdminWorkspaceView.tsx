import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Globe,
  KeyRound,
  Grip,
  LogOut,
  Moon,
  ScrollText,
  Sun,
  User,
  Users,
} from 'lucide-react';
import { useArchive } from '../../context/ArchiveContext';
import { IntercomLogo } from '../common/IntercomLogo';
import { ArmsLogo } from '../common/ArmsLogo';
import { AuditLogView } from '../audit/AuditLogView';
import { UsersManagementView } from '../users/UsersManagementView';

interface AdminWorkspaceViewProps {
  mode: 'audit' | 'users';
  onOpenProfile: (tab?: 'profile' | 'password') => void;
}

export const AdminWorkspaceView: React.FC<AdminWorkspaceViewProps> = ({ mode, onOpenProfile }) => {
  const { currentUser, language, setLanguage, logout, setActiveWorkspace } = useArchive();
  const isAr = language === 'ar';
  const BackArrow = isAr ? ArrowRight : ArrowLeft;

  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('arms_theme') === 'dark';
  });

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    document.documentElement.style.colorScheme = darkMode ? 'dark' : 'light';
    try {
      localStorage.setItem('arms_theme', darkMode ? 'dark' : 'light');
    } catch {
      /* storage unavailable */
    }
  }, [darkMode]);

  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className="min-h-screen bg-[#F8FAFC] dark:bg-black text-slate-900 dark:text-neutral-100 flex flex-col transition-colors"
    >
      <header className="sticky top-0 z-40 bg-white dark:bg-[#111111] border-b border-slate-200 dark:border-neutral-800">
        <div className="h-[2px] w-full flex" aria-hidden="true">
          <div className="flex-1 bg-[#0B56A8]" />
          <div className="w-24 bg-[#F5A614]" />
          <div className="w-16 bg-[#E52225]" />
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div dir="ltr" className="hidden sm:flex items-center gap-2.5 shrink-0">
              <IntercomLogo size="md" className="[&_img]:h-5 [&_img]:w-auto" />
              <span className="h-4 w-px bg-slate-200 dark:bg-neutral-800" />
              <ArmsLogo size="md" className="[&_img]:h-6 [&_img]:w-auto" />
            </div>

            <button
              type="button"
              onClick={() => setActiveWorkspace(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#EAF2FB] dark:bg-[#0B56A8]/20 text-[#0B56A8] dark:text-blue-300 border border-[#0B56A8]/25 hover:bg-[#DCE9F8] dark:hover:bg-[#0B56A8]/30 text-xs font-bold transition-colors whitespace-nowrap shrink-0"
            >
              <Grip className="w-3.5 h-3.5 shrink-0" />
              <span>{isAr ? 'الأقسام' : 'Sections'}</span>
            </button>

            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-neutral-900 border border-slate-200/70 dark:border-neutral-800 shrink-0">
              <button
                type="button"
                onClick={() => setActiveWorkspace('admin-audit')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  mode === 'audit'
                    ? 'bg-white dark:bg-neutral-800 text-[#0B56A8] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ScrollText className="w-3.5 h-3.5" />
                <span>{isAr ? 'سجل العمليات' : 'Audit Log'}</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveWorkspace('admin-users')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                  mode === 'users'
                    ? 'bg-white dark:bg-neutral-800 text-[#0B56A8] dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>{isAr ? 'المستخدمين' : 'Users'}</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLanguage(isAr ? 'en' : 'ar')}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-neutral-800 text-xs font-semibold text-slate-600 dark:text-neutral-300 hover:text-[#0B56A8] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>{isAr ? 'EN' : 'عربي'}</span>
            </button>

            <button
              type="button"
              onClick={() => setDarkMode(v => !v)}
              aria-label={darkMode ? 'Light mode' : 'Dark mode'}
              className="p-2 rounded-lg border border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-300 hover:text-[#0B56A8] transition-colors"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => onOpenProfile('profile')}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-neutral-800 text-xs font-semibold text-slate-700 dark:text-neutral-200 hover:border-[#0B56A8] transition-colors whitespace-nowrap"
            >
              <User className="w-3.5 h-3.5 text-[#0B56A8]" />
              <span className="max-w-[120px] truncate">{currentUser.name}</span>
            </button>

            <button
              type="button"
              onClick={() => onOpenProfile('password')}
              title={isAr ? 'تغيير كلمة المرور' : 'Change Password'}
              className="p-2 rounded-lg border border-slate-200 dark:border-neutral-800 text-slate-600 dark:text-neutral-300 hover:text-[#0B56A8] transition-colors"
            >
              <KeyRound className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-[#E52225] hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{isAr ? 'خروج' : 'Sign Out'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div>
          <button
            type="button"
            onClick={() => setActiveWorkspace(null)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-neutral-400 hover:text-[#0B56A8] transition-colors"
          >
            <BackArrow className="w-3.5 h-3.5" />
            <span>{isAr ? 'العودة إلى الأقسام' : 'Back to Sections'}</span>
          </button>
        </div>

        {mode === 'audit' && <AuditLogView />}
        {mode === 'users' && <UsersManagementView onNavigate={() => setActiveWorkspace(null)} />}
      </main>
    </div>
  );
};
