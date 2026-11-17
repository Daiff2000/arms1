/**
 * ARMS - Dossiers List View
 * Displays all dossiers across all boxes with filters and quick access to the 50 slots.
 */

import React, { useState } from 'react';
import { FolderArchive, Search, ArrowRight, Edit2, CheckSquare } from 'lucide-react';
import { useArchive } from '../../context/ArchiveContext';
import { Dossier, ProjectStatus } from '../../types';
import { ActiveTab } from '../navigation/TopNav';

interface DossiersViewProps {
  onNavigate: (tab: ActiveTab, param?: string) => void;
  onSelectDossier: (dossierId: string) => void;
}

export const DossiersView: React.FC<DossiersViewProps> = ({ onNavigate, onSelectDossier }) => {
  const { dossiers, boxes, currentUser, updateDossiersStatus, language } = useArchive();
  const isAr = language === 'ar';
  const canEdit = ['System Admin', 'Archive Manager', 'Data Entry'].includes(currentUser.role);

  const [searchTerm, setSearchTerm] = useState('');
  const [boxFilter, setBoxFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'Archived' | 'Inprogress' | 'Pending'>('all');

  const [selectedDossierIds, setSelectedDossierIds] = useState<string[]>([]);
  const [dossierBulkNote, setDossierBulkNote] = useState('');
  const [editingDossier, setEditingDossier] = useState<Dossier | null>(null);
  const [editDossierStatus, setEditDossierStatus] = useState<ProjectStatus>('Archived');
  const [editDossierNote, setEditDossierNote] = useState('');

  const sortedBoxes = [...boxes].sort((a, b) => a.firstJobId - b.firstJobId);

  const filtered = dossiers
    .filter(d => {
      const matchSearch =
        d.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.boxId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(d.fromJobId).includes(searchTerm) ||
        String(d.toJobId).includes(searchTerm);

      if (!matchSearch) return false;
      if (boxFilter !== 'all' && d.boxId !== boxFilter) return false;
      if (statusFilter !== 'all' && d.status !== statusFilter) return false;
      return true;
    })
    .sort((a, b) => a.fromJobId - b.fromJobId);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every(d => selectedDossierIds.includes(d.id));

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-neutral-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <FolderArchive className="w-6 h-6 text-[#0B56A8] dark:text-blue-400" />
            <span>{isAr ? 'إدارة الدوسيهات' : 'Dossiers Management'}</span>
          </h1>
        </div>

        {canEdit && filtered.length > 0 && (
          <button
            type="button"
            onClick={() => setSelectedDossierIds(allFilteredSelected ? [] : filtered.map(d => d.id))}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-200 bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 hover:border-[#0B56A8] hover:text-[#0B56A8] rounded-lg transition-colors shrink-0"
          >
            <CheckSquare className="w-3.5 h-3.5 text-[#0B56A8] dark:text-blue-400" />
            <span>
              {allFilteredSelected
                ? isAr
                  ? 'إلغاء تحديد الكل'
                  : 'Deselect All'
                : isAr
                ? `تحديد كل الدوسيهات (${filtered.length})`
                : `Select All (${filtered.length})`}
            </span>
          </button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-[#111111] p-3 rounded-xl border border-slate-200 dark:border-neutral-800">
        <div className="relative w-full sm:w-72">
          <Search className="absolute start-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder={isAr ? 'بحث بالدوسيه أو النطاق...' : 'Search dossier or range...'}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full ps-9 pe-3 py-1.5 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#0B56A8]"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <select
            value={boxFilter}
            onChange={e => setBoxFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#0B56A8]"
          >
            <option value="all">{isAr ? 'كافة البوكسات' : 'All Boxes'}</option>
            {sortedBoxes.map(b => (
              <option key={b.id} value={b.boxCode}>
                Box {b.boxCode}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1">
            {(['all', 'Inprogress', 'Archived', 'Pending'] as const).map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                  statusFilter === s
                    ? 'bg-[#0B56A8] text-white font-semibold'
                    : 'text-slate-600 dark:text-neutral-400 hover:bg-slate-100 dark:hover:bg-neutral-900'
                }`}
              >
                {s === 'all' && (isAr ? 'الكل' : 'All')}
                {s === 'Inprogress' && (isAr ? 'جاري' : 'Inprogress')}
                {s === 'Archived' && (isAr ? 'مكتمل (50)' : 'Archived')}
                {s === 'Pending' && (isAr ? 'فارغ' : 'Pending')}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bulk Selection Bar */}
      {canEdit && selectedDossierIds.length > 0 && (
        <div className="bg-blue-50/90 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-xl p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-extrabold text-[#0B56A8] dark:text-blue-300">
              {isAr
                ? `تم تحديد ${selectedDossierIds.length} دوسيه`
                : `${selectedDossierIds.length} dossier(s) selected`}
            </span>
            {!allFilteredSelected && filtered.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedDossierIds(filtered.map(d => d.id))}
                className="text-[11px] font-semibold underline text-slate-700 dark:text-neutral-200 hover:text-[#0B56A8]"
              >
                {isAr ? `تحديد الكل (${filtered.length})` : `Select all (${filtered.length})`}
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
              className="px-2.5 py-1.5 text-xs bg-white dark:bg-[#111111] border border-blue-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#0B56A8] w-52"
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
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(dossier => {
          const percent = ((dossier.archivedCount / 50) * 100).toFixed(0);
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
                  ? 'bg-blue-50/50 dark:bg-blue-950/20 border-[#0B56A8] ring-1 ring-[#0B56A8]/30'
                  : 'bg-white dark:bg-[#111111] border-slate-200 dark:border-neutral-800 hover:border-[#0B56A8]/60'
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
                          className="rounded border-slate-300 text-[#0B56A8] focus:ring-[#0B56A8] cursor-pointer"
                        />
                      </div>
                    )}
                    <div className="w-8 h-8 rounded-lg bg-[#EAF2FB] dark:bg-[#0B56A8]/25 flex items-center justify-center font-bold text-[#0B56A8] dark:text-blue-400 text-sm shrink-0">
                      {dossier.dossierNumber}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white group-hover:text-[#0B56A8] dark:group-hover:text-blue-400 transition-colors">
                        Box {dossier.boxId} · {isAr ? `دوسيه ${dossier.dossierNumber}` : `Dossier ${dossier.dossierNumber}`}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        #{dossier.fromJobId} → #{dossier.toJobId}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                    <span
                      className={`text-[11px] font-semibold ${
                        dossier.status === 'Archived'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : dossier.status === 'Inprogress'
                          ? 'text-[#B45309] dark:text-amber-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {dossier.status}
                    </span>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => openDossierStatusModal(dossier)}
                        title={isAr ? 'تحديد حالة الدوسيه بالكامل' : 'Change Dossier Status'}
                        className="p-1 text-slate-400 hover:text-[#0B56A8] rounded hover:bg-blue-50 dark:hover:bg-neutral-900"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-neutral-800 text-center">
                  <div>
                    <div className="text-[10px] text-slate-400">{isAr ? 'مؤرشف' : 'Archived'}</div>
                    <div className="text-xs font-bold text-[#0B56A8] dark:text-blue-400 tabular-nums">
                      {dossier.archivedCount} / 50
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">{isAr ? 'مفقود' : 'Missing'}</div>
                    <div className="text-xs font-bold text-[#E52225] tabular-nums">
                      {dossier.missingCount > 0 ? dossier.missingCount : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">{isAr ? 'قيد الانتظار' : 'Pending'}</div>
                    <div className="text-xs font-bold text-slate-400 tabular-nums">{dossier.pendingCount}</div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="w-full bg-slate-100 dark:bg-neutral-900 rounded-full h-1.5 overflow-hidden flex">
                    <div className="bg-[#0B56A8] h-full" style={{ width: `${(dossier.archivedCount / 50) * 100}%` }} />
                    <div className="bg-[#E52225] h-full" style={{ width: `${(dossier.missingCount / 50) * 100}%` }} />
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-2 flex items-center justify-between text-xs text-slate-500 group-hover:text-[#0B56A8] dark:group-hover:text-blue-400 transition-colors">
                <span className="text-[11px] font-semibold">{percent}% {isAr ? 'مكتمل' : 'complete'}</span>
                <div className="flex items-center gap-1 text-[11px] font-medium">
                  <span>{isAr ? 'عرض الـ 50 مشروع' : 'View 50 slots'}</span>
                  <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl py-12 px-4 text-center space-y-2.5">
          <p className="text-xs text-slate-500 dark:text-neutral-400">
            {isAr ? 'لا توجد دوسيهات مطابقة لمعايير البحث' : 'No matching dossiers found'}
          </p>
          {(searchTerm || boxFilter !== 'all' || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setBoxFilter('all');
                setStatusFilter('all');
              }}
              className="px-3 py-1.5 text-xs font-semibold text-[#0B56A8] dark:text-blue-400 hover:underline"
            >
              {isAr ? 'إعادة ضبط الفلاتر' : 'Reset filters'}
            </button>
          )}
        </div>
      )}

      {/* Single Dossier Status Modal */}
      {editingDossier && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-xl shadow-2xl max-w-sm w-full p-5 space-y-4">
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FolderArchive className="w-4 h-4 text-[#0B56A8]" />
                <span>{isAr ? `تحديث حالة الدوسيه ${editingDossier.id}` : `Update Dossier ${editingDossier.id} Status`}</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                {isAr
                  ? `سيتم تطبيق الحالة الجديدة على الدوسيه بالكامل (${editingDossier.totalProjects} خانة).`
                  : `Applies to all ${editingDossier.totalProjects} slots in this dossier.`}
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
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:border-[#0B56A8]"
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
                <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0B56A8] hover:bg-[#094488] rounded-lg">
                  {isAr ? 'تطبيق على الدوسيه' : 'Apply to Dossier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
