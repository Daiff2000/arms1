import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Clock,
  FileSpreadsheet,
  Package,
  ShieldAlert,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { useArchive } from '../../context/ArchiveContext';
import {
  ArchiveScope,
  getUploadDeletionPreview,
  isImportedProject,
  UploadDeletionPreview,
} from '../../utils/uploadDeletion';

interface DeleteUploadModalProps {
  isOpen: boolean;
  scope: ArchiveScope;
  initialUploadId?: string | null;
  onClose: () => void;
  onCompleted?: () => void;
}

const formatTimestamp = (ts: string, isAr: boolean) => {
  if (!ts) return '—';
  const d = new Date(ts);
  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString(isAr ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  return ts;
};

export const DeleteUploadModal: React.FC<DeleteUploadModalProps> = ({
  isOpen,
  scope,
  initialUploadId = null,
  onClose,
  onCompleted,
}) => {
  const {
    currentUser,
    language,
    operationsArchive,
    palletArchive,
    minutesArchive,
    palletReports,
    minutesRecords,
    deleteArchiveUpload,
    clearModuleArchive,
  } = useArchive();

  const isAr = language === 'ar';
  const BackArrow = isAr ? ArrowRight : ArrowLeft;
  const [confirmTarget, setConfirmTarget] = useState<{ type: 'upload'; uploadId: string } | { type: 'all' } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setConfirmTarget(null);
      setBusy(false);
    } else if (initialUploadId) {
      setConfirmTarget({ type: 'upload', uploadId: initialUploadId });
    } else {
      setConfirmTarget(null);
    }
  }, [isOpen, initialUploadId]);

  const store =
    scope === 'operations' ? operationsArchive : scope === 'pallet' ? palletArchive : minutesArchive;

  const extraRecordsCount =
    scope === 'pallet' ? palletReports.length : scope === 'minutes' ? minutesRecords.length : 0;

  const importedCount = useMemo(() => {
    if (scope === 'pallet' && palletReports.length > 0) return palletReports.length;
    return store.projects.filter(isImportedProject).length;
  }, [scope, palletReports.length, store.projects]);

  const boxesSummaryCount = useMemo(() => {
    if (scope === 'pallet' && palletReports.length > 0) {
      return new Set(palletReports.map(r => r.palletCode).filter(Boolean)).size;
    }
    return store.boxes.length;
  }, [scope, palletReports, store.boxes.length]);

  const previews: UploadDeletionPreview[] = useMemo(() => {
    if (scope === 'pallet' && palletReports.length > 0) {
      const historyMap = new Map(store.uploadHistory.map(u => [u.id, u]));
      const grouped = new Map<string, typeof palletReports>();
      for (const r of palletReports) {
        const uid = r.uploadId || 'legacy-pallet-upload';
        grouped.set(uid, [...(grouped.get(uid) || []), r]);
      }

      const combinedUploads = [...store.uploadHistory];
      for (const [uid, rows] of grouped.entries()) {
        if (!historyMap.has(uid)) {
          combinedUploads.push({
            id: uid,
            fileName: rows[0]?.sourceSheet ? `Pallet Import (${rows[0].sourceSheet})` : 'Pallet Import Batch',
            userName: rows[0]?.createdBy || 'System',
            timestamp: rows[0]?.createdAt || '',
            totalRows: rows.length,
            importedCount: rows.length,
            duplicateCount: 0,
            rejectedCount: 0,
            errors: [],
            status: 'Completed',
          });
        }
      }

      return combinedUploads.map(u => {
        const matchedRows = grouped.get(u.id) || [];
        const matchedIds = new Set(matchedRows.map(r => r.id));
        const affectedPallets = Array.from(new Set(matchedRows.map(r => r.palletCode).filter(Boolean))).sort();
        const palletsToRemove = affectedPallets.filter(
          code => !palletReports.some(r => r.palletCode === code && !matchedIds.has(r.id))
        ).length;
        return {
          upload: u,
          matchedProjectsCount: matchedRows.length,
          affectedBoxCodes: affectedPallets,
          boxesToRemoveCount: palletsToRemove,
        };
      });
    }
    return store.uploadHistory.map(u => getUploadDeletionPreview(scope, store, u));
  }, [scope, store, palletReports]);

  const selectedPreview = useMemo(() => {
    if (!confirmTarget || confirmTarget.type !== 'upload') return null;
    return previews.find(p => p.upload.id === confirmTarget.uploadId) || null;
  }, [confirmTarget, previews]);

  if (!isOpen || currentUser.role !== 'System Admin') return null;

  const meta =
    scope === 'operations'
      ? {
          name: isAr ? 'أرشفة تقارير التشغيل' : 'Operations Reports Archive',
          accentText: 'text-[#0B56A8] dark:text-blue-400',
          accentTint: 'bg-[#EAF2FB] dark:bg-blue-950/40 text-[#0B56A8] dark:text-blue-300',
          otherSections: isAr
            ? 'قسم الباليت وأرشفة تعليقات الفروع والمستخدمين'
            : 'Pallet, Branch Comments, and User accounts',
        }
      : scope === 'pallet'
      ? {
          name: isAr ? 'أرشفة تقارير تسليم الباليت' : 'Pallet Handover Reports',
          accentText: 'text-[#D97706] dark:text-amber-400',
          accentTint: 'bg-amber-50 dark:bg-amber-950/40 text-[#D97706] dark:text-amber-300',
          otherSections: isAr
            ? 'تقارير التشغيل وأرشفة تعليقات الفروع والمستخدمين'
            : 'Operations, Branch Comments, and User accounts',
        }
      : {
          name: isAr ? 'أرشفة تعليقات الفروع' : 'Branch Comments Archive',
          accentText: 'text-[#E52225] dark:text-red-400',
          accentTint: 'bg-red-50 dark:bg-red-950/40 text-[#E52225] dark:text-red-300',
          otherSections: isAr
            ? 'تقارير التشغيل (D41+) والباليت والمستخدمين'
            : 'Operations Reports (D41+), Pallet, and User accounts',
        };

  const hasAnyData =
    store.boxes.length > 0 ||
    store.projects.length > 0 ||
    store.uploadHistory.length > 0 ||
    extraRecordsCount > 0;

  const handleConfirmExecute = async () => {
    if (!confirmTarget || busy) return;
    setBusy(true);
    try {
      const ok =
        confirmTarget.type === 'upload'
          ? await deleteArchiveUpload(scope, confirmTarget.uploadId)
          : await clearModuleArchive(scope);
      if (ok) {
        onCompleted?.();
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
      <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-neutral-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[88vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 dark:border-neutral-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-950/40 text-[#E52225] flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`text-[11px] font-bold ${meta.accentText}`}>{meta.name}</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-neutral-900 text-slate-600 dark:text-neutral-300">
                  <ShieldAlert className="w-3 h-3 text-[#E52225]" />
                  <span>System Admin</span>
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white mt-0.5">
                {confirmTarget
                  ? confirmTarget.type === 'upload'
                    ? isAr
                      ? 'تأكيد مسح الرفعة المحددة'
                      : 'Confirm Delete Upload Batch'
                    : isAr
                    ? 'تأكيد مسح جميع بيانات القسم'
                    : 'Confirm Clear Entire Section'
                  : isAr
                  ? 'اختر الرفعة التي تريد مسحها'
                  : 'Select Upload Batch to Delete'}
              </h2>
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-900"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {!confirmTarget ? (
            <>
              {/* Summary Strip */}
              <div className="grid grid-cols-3 gap-2.5 text-center bg-slate-50 dark:bg-neutral-900/60 border border-slate-200/80 dark:border-neutral-800 rounded-xl p-3">
                <div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums">
                    {previews.length}
                  </div>
                  <div className="text-[11px] text-slate-500">{isAr ? 'عمليات الرفع' : 'Uploads'}</div>
                </div>
                <div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums">
                    {boxesSummaryCount}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {scope === 'pallet' ? (isAr ? 'الباليتات الحالية' : 'Pallets') : isAr ? 'البوكسات الحالية' : 'Boxes'}
                  </div>
                </div>
                <div>
                  <div className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums">
                    {importedCount.toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-500">{isAr ? 'السجلات المستوردة' : 'Imported Rows'}</div>
                </div>
              </div>

              {/* Upload Batches List */}
              {previews.length > 0 ? (
                <div className="space-y-2.5">
                  <div className="text-xs font-bold text-slate-700 dark:text-neutral-300">
                    {isAr
                      ? 'اضغط "مسح الرفعة" بجانب الملف الذي تريد إزالته فقط دون التأثير على باقي الرفعات:'
                      : 'Select the specific upload batch to delete without affecting other uploads:'}
                  </div>

                  <div className="space-y-2">
                    {previews.map(preview => {
                      const u = preview.upload;
                      return (
                        <div
                          key={u.id}
                          className="p-3.5 bg-white dark:bg-neutral-900/50 border border-slate-200 dark:border-neutral-800 hover:border-red-300 dark:hover:border-red-900/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${meta.accentTint}`}>
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                              </span>
                              <span className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate" title={u.fileName}>
                                {u.fileName}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-neutral-400">
                              <span className="inline-flex items-center gap-1 tabular-nums">
                                <Clock className="w-3 h-3" />
                                {formatTimestamp(u.timestamp, isAr)}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <User className="w-3 h-3" />
                                {u.userName}
                              </span>
                              <span className="font-semibold text-slate-700 dark:text-neutral-200 tabular-nums">
                                {isAr
                                  ? `${preview.matchedProjectsCount} سجل فعلي (من أصل ${u.importedCount} مستورد)`
                                  : `${preview.matchedProjectsCount} active rows (${u.importedCount} imported)`}
                              </span>
                            </div>

                            {preview.affectedBoxCodes.length > 0 && (
                              <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                <Package className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{isAr ? 'البوكسات:' : 'Boxes:'}</span>
                                <span className="font-mono font-bold text-slate-800 dark:text-neutral-200">
                                  {preview.affectedBoxCodes.join('، ')}
                                </span>
                              </div>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => setConfirmTarget({ type: 'upload', uploadId: u.id })}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-bold text-[#E52225] bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 hover:bg-[#E52225] hover:text-white rounded-lg transition-colors shrink-0"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>{isAr ? 'مسح الرفعة' : 'Delete Upload'}</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center bg-slate-50 dark:bg-neutral-900/40 border border-slate-200 dark:border-neutral-800 rounded-xl space-y-1">
                  <div className="text-xs font-bold text-slate-700 dark:text-neutral-300">
                    {isAr ? 'لا توجد رفعات مسجلة في السجل' : 'No upload batches recorded'}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {hasAnyData
                      ? isAr
                        ? 'يمكنك مسح جميع البيانات الحالية لهذا القسم من الخيار بالأسفل.'
                        : 'You can clear all current section records using the full reset option below.'
                      : isAr
                      ? 'القسم فارغ تماماً حالياً.'
                      : 'This section has no stored records.'}
                  </p>
                </div>
              )}

              {/* Full Section Clear Option */}
              {hasAnyData && (
                <div className="pt-3 border-t border-slate-100 dark:border-neutral-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-red-50/60 dark:bg-red-950/20 border border-red-200/70 dark:border-red-900/50 rounded-xl p-3.5">
                  <div className="space-y-0.5">
                    <div className="text-xs font-bold text-[#E52225] dark:text-red-300">
                      {isAr ? 'مسح جميع بيانات القسم بالكامل (كل الرفعات)' : 'Clear Entire Section Data (All Uploads)'}
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-neutral-400">
                      {scope === 'pallet'
                        ? isAr
                          ? `يحذف كل الباليتات (${boxesSummaryCount}) والسجلات (${importedCount}) في ${meta.name} فقط.`
                          : `Deletes all ${boxesSummaryCount} pallets and ${importedCount} records in ${meta.name} only.`
                        : isAr
                        ? `يحذف كل البوكسات (${store.boxes.length}) والسجلات (${store.projects.length}) في ${meta.name} فقط.`
                        : `Deletes all ${store.boxes.length} boxes and ${store.projects.length} records in ${meta.name} only.`}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfirmTarget({ type: 'all' })}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-bold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{isAr ? 'مسح الكل' : 'Clear All'}</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            /* Confirmation Step */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-[#E52225] shrink-0 mt-0.5" />
                <div className="space-y-1.5 text-xs text-slate-700 dark:text-neutral-200">
                  {confirmTarget.type === 'upload' && selectedPreview ? (
                    <>
                      <div className="font-extrabold text-sm text-slate-900 dark:text-white">
                        {isAr ? `الرفعة: ${selectedPreview.upload.fileName}` : `Upload: ${selectedPreview.upload.fileName}`}
                      </div>
                      <p className="leading-relaxed">
                        {isAr
                          ? `سيتم مسح ${selectedPreview.matchedProjectsCount} سجل خاص بهذه الرفعة فقط من قاعدة البيانات${
                              selectedPreview.affectedBoxCodes.length
                                ? ` (البوكسات المتأثرة: ${selectedPreview.affectedBoxCodes.join('، ')})`
                                : ''
                            }${
                              selectedPreview.boxesToRemoveCount > 0
                                ? `، وإزالة ${selectedPreview.boxesToRemoveCount} بوكس فارغ.`
                                : '.'
                            }`
                          : `This will permanently remove ${selectedPreview.matchedProjectsCount} record(s) from this upload${
                              selectedPreview.affectedBoxCodes.length
                                ? ` (boxes: ${selectedPreview.affectedBoxCodes.join(', ')})`
                                : ''
                            }${
                              selectedPreview.boxesToRemoveCount > 0
                                ? ` and prune ${selectedPreview.boxesToRemoveCount} empty box(es).`
                                : '.'
                            }`}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                        {isAr
                          ? 'ستبقى باقي الرفعات الأخرى داخل هذا القسم وجميع الأقسام الأخرى دون أي تغيير.'
                          : 'Other upload batches in this section and all other departments will remain untouched.'}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="font-extrabold text-sm text-[#E52225] dark:text-red-300">
                        {isAr ? `تصفير قسم "${meta.name}" بالكامل` : `Wipe All Data in "${meta.name}"`}
                      </div>
                      <p className="leading-relaxed">
                        {scope === 'pallet'
                          ? isAr
                            ? `سيتم حذف جميع السجلات (${importedCount}) والباليتات (${boxesSummaryCount}) وسجل الرفعات (${previews.length}) من قاعدة بيانات هذا القسم نهائياً.`
                            : `This will permanently delete all ${importedCount} records, ${boxesSummaryCount} pallets, and ${previews.length} upload entries from this section.`
                          : isAr
                          ? `سيتم حذف جميع البوكسات (${store.boxes.length}) والدوسيهات (${store.dossiers.length}) والسجلات (${store.projects.length}) وسجل الرفعات (${store.uploadHistory.length}) من قاعدة بيانات هذا القسم نهائياً.`
                          : `This will permanently delete all ${store.boxes.length} boxes, ${store.dossiers.length} dossiers, ${store.projects.length} records, and ${store.uploadHistory.length} upload entries from this section.`}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-neutral-400">
                        {isAr
                          ? `لن يتأثر ${meta.otherSections}.`
                          : `${meta.otherSections} will NOT be affected.`}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmTarget(null)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 dark:text-neutral-300 dark:hover:text-white bg-slate-100 dark:bg-neutral-900 rounded-lg"
                >
                  <BackArrow className="w-3.5 h-3.5" />
                  <span>{isAr ? 'اختر رفعة أخرى' : 'Back to List'}</span>
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={handleConfirmExecute}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#E52225] hover:bg-[#C81D20] rounded-lg disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>
                    {busy
                      ? isAr
                        ? 'جاري المسح...'
                        : 'Deleting...'
                      : confirmTarget.type === 'upload'
                      ? isAr
                        ? 'تأكيد مسح هذه الرفعة'
                        : 'Confirm Delete Upload'
                      : isAr
                      ? 'نعم، امسح بيانات القسم بالكامل'
                      : 'Yes, Clear Entire Section'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
