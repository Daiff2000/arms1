/**
 * ARMS - Profile & Authentication Modal
 * Allows any signed-in user to edit their full name, username, and email,
 * view session metadata, and change their password.
 */

import React, { useEffect, useState } from 'react';
import { User, X, Eye, EyeOff, Check, Save, RotateCcw } from 'lucide-react';
import { useArchive } from '../../context/ArchiveContext';

interface ProfileModalProps {
  isOpen: boolean;
  initialTab?: 'profile' | 'password';
  onClose: () => void;
}

export const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, initialTab = 'profile', onClose }) => {
  const { currentUser, language, changePassword, updateProfile, showToast } = useArchive();
  const isAr = language === 'ar';

  const [activeTab, setActiveTab] = useState<'profile' | 'password'>(initialTab);

  // Editable Profile fields
  const [editName, setEditName] = useState(currentUser.name);
  const [editUsername, setEditUsername] = useState(currentUser.username);
  const [editEmail, setEditEmail] = useState(currentUser.email || '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Change Password fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const [errorNotice, setErrorNotice] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setEditName(currentUser.name);
      setEditUsername(currentUser.username);
      setEditEmail(currentUser.email || '');
      setErrorNotice(null);
      setSuccessNotice(null);
    }
  }, [isOpen, initialTab, currentUser.name, currentUser.username, currentUser.email]);

  if (!isOpen) return null;

  const trimmedName = editName.trim();
  const normalizedUsername = editUsername.trim().toLowerCase();
  const trimmedEmail = editEmail.trim();

  const hasProfileChanges =
    trimmedName !== currentUser.name ||
    normalizedUsername !== currentUser.username ||
    trimmedEmail !== (currentUser.email || '');

  const handleResetProfile = () => {
    setEditName(currentUser.name);
    setEditUsername(currentUser.username);
    setEditEmail(currentUser.email || '');
    setErrorNotice(null);
    setSuccessNotice(null);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);
    setSuccessNotice(null);

    if (!trimmedName || trimmedName.length > 120) {
      setErrorNotice(isAr ? 'يرجى إدخال الاسم الكامل (بحد أقصى 120 حرفاً).' : 'Please enter a valid full name.');
      return;
    }
    if (!normalizedUsername || normalizedUsername.length > 80 || /\s/.test(normalizedUsername)) {
      setErrorNotice(
        isAr ? 'يرجى إدخال اسم مستخدم صالح بدون مسافات.' : 'Please enter a valid username without spaces.'
      );
      return;
    }

    setSavingProfile(true);
    try {
      await updateProfile({
        name: trimmedName,
        username: normalizedUsername,
        email: trimmedEmail,
      });
      const msg = isAr ? 'تم حفظ بيانات الملف الشخصي بنجاح!' : 'Profile details updated successfully!';
      setSuccessNotice(msg);
      showToast(msg, 'success');
      window.setTimeout(() => setSuccessNotice(null), 3500);
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : isAr
          ? 'تعذر حفظ بيانات الملف الشخصي.'
          : 'Failed to update profile details.';
      setErrorNotice(msg);
      showToast(msg, 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorNotice(null);
    setSuccessNotice(null);

    if (!newPassword.trim()) {
      setErrorNotice(isAr ? 'يرجى إدخال كلمة المرور الجديدة.' : 'Please enter a new password.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorNotice(isAr ? 'كلمتا المرور غير متطابقتين.' : 'New passwords do not match.');
      return;
    }

    setSavingPassword(true);
    try {
      await changePassword(currentPassword, newPassword);
      const msg = isAr ? 'تم تحديث كلمة المرور بنجاح!' : 'Password updated successfully!';
      setSuccessNotice(msg);
      showToast(msg, 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      window.setTimeout(() => setSuccessNotice(null), 3000);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : isAr ? 'تعذر تحديث كلمة المرور.' : 'Password update failed.';
      setErrorNotice(msg);
      showToast(msg, 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <User className="w-5 h-5 text-[#0B56A8] dark:text-blue-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {isAr ? 'الملف الشخصي والحساب' : 'Account & Security'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isAr ? 'إغلاق' : 'Close'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-[#3F4144] dark:hover:text-white hover:bg-slate-100 dark:hover:bg-neutral-900 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-neutral-900 rounded-lg text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('profile');
              setErrorNotice(null);
              setSuccessNotice(null);
            }}
            className={`py-1.5 rounded-md transition-colors ${
              activeTab === 'profile'
                ? 'bg-white dark:bg-[#111111] text-[#0B56A8] dark:text-blue-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {isAr ? 'تعديل البيانات' : 'Edit Profile'}
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('password');
              setErrorNotice(null);
              setSuccessNotice(null);
            }}
            className={`py-1.5 rounded-md transition-colors ${
              activeTab === 'password'
                ? 'bg-white dark:bg-[#111111] text-[#0B56A8] dark:text-blue-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {isAr ? 'تغيير كلمة المرور' : 'Change Password'}
          </button>
        </div>

        {errorNotice && (
          <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-[#E52225] dark:text-red-300 rounded-lg text-xs font-semibold">
            {errorNotice}
          </div>
        )}

        {successNotice && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 rounded-lg text-xs font-semibold flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{successNotice}</span>
          </div>
        )}

        {/* Tab 1: Editable Profile View */}
        {activeTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="space-y-4 text-xs">
            {/* Live Preview Identity Banner */}
            <div className="p-4 bg-[#EAF2FB]/70 dark:bg-neutral-900/60 border border-[#0B56A8]/15 dark:border-neutral-800 rounded-xl flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#0B56A8] text-white flex items-center justify-center text-lg font-bold shrink-0">
                {(trimmedName || currentUser.name || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-[#3F4144] dark:text-white truncate">
                  {trimmedName || currentUser.name}
                </div>
                <div className="text-slate-500 dark:text-neutral-400 text-[11px] truncate" dir="ltr">
                  @{normalizedUsername || currentUser.username}
                  {trimmedEmail ? ` · ${trimmedEmail}` : ''}
                </div>
                <div className="mt-1 text-[11px] font-semibold text-[#0B56A8] dark:text-blue-400">
                  {currentUser.role}
                </div>
              </div>
            </div>

            {/* Editable Fields */}
            <div className="space-y-3">
              <div>
                <label className="block text-slate-700 dark:text-neutral-300 font-semibold mb-1">
                  {isAr ? 'الاسم الكامل' : 'Full Name'}
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder={isAr ? 'أدخل الاسم الكامل' : 'Enter your full name'}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-[#0B56A8]"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-neutral-300 font-semibold mb-1">
                  {isAr ? 'اسم المستخدم' : 'Username'}
                </label>
                <div className="relative" dir="ltr">
                  <span className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold select-none">
                    @
                  </span>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={editUsername}
                    onChange={e => setEditUsername(e.target.value)}
                    placeholder="username"
                    className="w-full ps-7 pe-3 py-2 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-[#0B56A8]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-neutral-300 font-semibold mb-1">
                  {isAr ? 'البريد الإلكتروني' : 'Email Address'}
                </label>
                <input
                  type="email"
                  maxLength={160}
                  dir="ltr"
                  value={editEmail}
                  onChange={e => setEditEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:border-[#0B56A8]"
                />
              </div>
            </div>

            {/* Account Metadata Summary */}
            <div className="pt-1 border-t border-slate-100 dark:border-neutral-800 space-y-1.5 text-[11px]">
              <div className="flex justify-between py-1">
                <span className="text-slate-500 dark:text-neutral-400">
                  {isAr ? 'الصلاحية في النظام:' : 'System Permission:'}
                </span>
                <span className="font-semibold text-[#3F4144] dark:text-white">{currentUser.role}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 dark:text-neutral-400">
                  {isAr ? 'آخر نشاط / تسجيل دخول:' : 'Last Login:'}
                </span>
                <span className="text-slate-600 dark:text-neutral-400 tabular-nums" dir="ltr">
                  {currentUser.lastLogin}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-500 dark:text-neutral-400">
                  {isAr ? 'حالة الحساب:' : 'Account Status:'}
                </span>
                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                  {currentUser.active
                    ? isAr
                      ? 'نشط ومفعل'
                      : 'Active & Verified'
                    : isAr
                    ? 'معطل'
                    : 'Inactive'}
                </span>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-neutral-800">
              <button
                type="button"
                onClick={handleResetProfile}
                disabled={!hasProfileChanges || savingProfile}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white rounded-lg disabled:opacity-40 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isAr ? 'تراجع' : 'Reset'}</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-1.5 text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white rounded-lg"
                >
                  {isAr ? 'إغلاق' : 'Close'}
                </button>
                <button
                  type="submit"
                  disabled={!hasProfileChanges || savingProfile}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-[#0B56A8] hover:bg-[#094488] rounded-lg transition-colors disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {savingProfile
                      ? isAr
                        ? 'جاري الحفظ...'
                        : 'Saving...'
                      : isAr
                      ? 'حفظ التعديلات'
                      : 'Save Changes'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Tab 2: Change Password */}
        {activeTab === 'password' && (
          <form onSubmit={handleChangePassword} className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-700 dark:text-neutral-300 font-semibold mb-1">
                {isAr ? 'كلمة المرور الحالية' : 'Current Password'}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg pe-9 focus:outline-none focus:border-[#0B56A8]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute end-2.5 top-2.5 text-slate-400 hover:text-[#0B56A8]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-slate-700 dark:text-neutral-300 font-semibold mb-1">
                {isAr ? 'كلمة المرور الجديدة' : 'New Password'}
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={1}
                maxLength={256}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder={isAr ? 'أي أرقام أو أحرف (مثال: 1234)' : 'Any numbers or characters'}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#0B56A8]"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-neutral-300 font-semibold mb-1">
                {isAr ? 'تأكيد كلمة المرور الجديدة' : 'Confirm New Password'}
              </label>
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={1}
                maxLength={256}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#0B56A8]"
              />
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-slate-600 dark:text-neutral-400 hover:text-slate-900 dark:hover:text-white rounded-lg"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={savingPassword}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-[#0B56A8] hover:bg-[#094488] rounded-lg transition-colors disabled:opacity-60"
              >
                {savingPassword
                  ? isAr
                    ? 'جاري الحفظ...'
                    : 'Saving...'
                  : isAr
                  ? 'حفظ كلمة المرور'
                  : 'Update Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
