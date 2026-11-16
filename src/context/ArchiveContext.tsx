/**
 * ARMS - Archive State Context & Database Engine
 * Handles persistent state, permissions, recalculations, audit trails, notifications, and in-app toasts.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Box,
  Dossier,
  Project,
  User,
  UploadRecord,
  NotificationItem,
  AuditLogEntry,
  ProjectStatus,
  ArchiveSearchItem,
  SearchEntityType,
  WorkspaceModule,
  WorkspaceArchiveStore,
  PalletReport,
  MinutesRecord,
} from '../types';
import { buildBoxStructure } from '../utils/archiveCalculations';
import { apiFetch, errorFrom, loadArchiveSnapshot, setSessionToken } from '../utils/archiveApi';

const createEmptyWorkspaceStore = (): WorkspaceArchiveStore => ({
  boxes: [],
  dossiers: [],
  projects: [],
  uploadHistory: [],
  notifications: [],
});

const normalizeWorkspaceStore = (raw: any): WorkspaceArchiveStore => ({
  boxes: Array.isArray(raw?.boxes) ? raw.boxes : [],
  dossiers: Array.isArray(raw?.dossiers) ? raw.dossiers : [],
  projects: Array.isArray(raw?.projects) ? raw.projects : [],
  uploadHistory: Array.isArray(raw?.uploadHistory) ? raw.uploadHistory : [],
  notifications: Array.isArray(raw?.notifications) ? raw.notifications : [],
});

const normalizeMinutesArchiveStore = (raw: any): WorkspaceArchiveStore => {
  const base = normalizeWorkspaceStore(raw);
  const existingCodes = new Set(base.boxes.map(b => b.boxCode.toUpperCase()));
  const renameMap = new Map<string, string>();
  for (const b of base.boxes) {
    const m = /^M(\d+)$/i.exec(b.boxCode.trim());
    if (m) {
      const target = `C${m[1]}`;
      if (!existingCodes.has(target)) {
        renameMap.set(b.boxCode, target);
        existingCodes.add(target);
      }
    }
  }
  if (renameMap.size === 0) return base;
  return {
    ...base,
    boxes: base.boxes.map(b => {
      const nextCode = renameMap.get(b.boxCode);
      return nextCode ? { ...b, id: nextCode, boxCode: nextCode } : b;
    }),
    dossiers: base.dossiers.map(d => {
      const nextBox = renameMap.get(d.boxId);
      return nextBox ? { ...d, boxId: nextBox, id: `${nextBox}-${d.dossierNumber}` } : d;
    }),
    projects: base.projects.map(p => {
      const nextBox = renameMap.get(p.boxId);
      return nextBox ? { ...p, boxId: nextBox } : p;
    }),
  };
};

export interface ToastMessage {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
}

interface ArchiveContextType {
  currentUser: User;
  authenticated: boolean;
  authLoading: boolean;
  setupRequired: boolean;
  storageMode: 'local' | 'postgres';
  authError: string;
  archiveLoading: boolean;
  archiveLoadError: string;
  toasts: ToastMessage[];
  dismissToast: (id: string) => void;
  showToast: (message: string, type?: ToastMessage['type']) => void;
  retryArchiveLoad: () => Promise<void>;
  login: (payload: {
    action: 'login' | 'setup';
    username: string;
    password: string;
    name?: string;
    email?: string;
    setupSecret?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  users: User[];
  boxes: Box[];
  dossiers: Dossier[];
  projects: Project[];
  uploadHistory: UploadRecord[];
  notifications: NotificationItem[];
  auditLogs: AuditLogEntry[];
  palletReports: PalletReport[];
  minutesRecords: MinutesRecord[];
  palletArchive: WorkspaceArchiveStore;
  minutesArchive: WorkspaceArchiveStore;
  operationsArchive: WorkspaceArchiveStore;
  activeWorkspace: WorkspaceModule | null;
  setActiveWorkspace: (workspace: WorkspaceModule | null) => void;
  savePalletReports: (next: PalletReport[]) => Promise<void>;
  saveMinutesRecords: (next: MinutesRecord[]) => Promise<void>;
  language: 'ar' | 'en';
  setLanguage: (lang: 'ar' | 'en') => void;
  setCurrentUser: (user: User) => void;
  importExcelProjects: (
    importedRows: { jobId: number; dateApproved: string | null; archiveStatus?: ProjectStatus }[],
    fileName: string,
    targetBoxCode?: string
  ) => { importedCount: number; duplicateCount: number; newBoxesCreated: number; rejectedCount: number };
  commitMinutesPlan: (store: WorkspaceArchiveStore, summary: string) => boolean;
  createBox: (boxCode: string, firstJobId: number) => Box;
  forceCloseBox: (boxId: string, reason: string) => boolean;
  reopenBox: (boxId: string) => boolean;
  updateProjectStatus: (jobId: number, newStatus: ProjectStatus, note?: string) => void;
  bulkUpdateProjectStatus: (jobIds: number[], newStatus: ProjectStatus, note?: string) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  addUser: (user: Omit<User, 'id' | 'lastLogin'>, password: string) => Promise<void>;
  updateUser: (
    id: string,
    updates: Partial<User> & { password?: string; resetPassword?: boolean }
  ) => Promise<void>;
  toggleUserStatus: (id: string) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  searchIndex: ArchiveSearchItem[];
  searchArchive: (
    query: string,
    options?: { type?: SearchEntityType | 'all'; limit?: number }
  ) => {
    results: ArchiveSearchItem[];
    totalMatches: number;
    countsByType: Record<SearchEntityType, number>;
  };
}

const ArchiveContext = createContext<ArchiveContextType | undefined>(undefined);

export const ArchiveProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const guestUser: User = { id: 'guest', username: '', email: '', name: '', role: 'Viewer', active: false, lastLogin: 'Never' };
  const [currentUser, setCurrentUser] = useState<User>(guestUser);
  const [authenticated, setAuthenticated] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [setupRequired, setSetupRequired] = useState(false);
  const [storageMode, setStorageMode] = useState<'local' | 'postgres'>('postgres');
  const [authError, setAuthError] = useState('');
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveLoadError, setArchiveLoadError] = useState('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [opBoxes, setOpBoxes] = useState<Box[]>([]);
  const [opDossiers, setOpDossiers] = useState<Dossier[]>([]);
  const [opProjects, setOpProjects] = useState<Project[]>([]);
  const [opUploadHistory, setOpUploadHistory] = useState<UploadRecord[]>([]);
  const [opNotifications, setOpNotifications] = useState<NotificationItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [palletReports, setPalletReports] = useState<PalletReport[]>([]);
  const [minutesRecords, setMinutesRecords] = useState<MinutesRecord[]>([]);
  const [palletArchive, setPalletArchive] = useState<WorkspaceArchiveStore>(createEmptyWorkspaceStore);
  const [minutesArchive, setMinutesArchive] = useState<WorkspaceArchiveStore>(createEmptyWorkspaceStore);
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceModule | null>(null);
  const [language, setLanguage] = useState<'ar' | 'en'>('ar');
  const [hydrated, setHydrated] = useState(false);
  const revisionRef = useRef(0);
  const skipNextSaveRef = useRef(false);
  const dirtyModulesRef = useRef<{ palletArchive: boolean; minutesArchive: boolean }>({
    palletArchive: false,
    minutesArchive: false,
  });

  const scopedMode: 'operations' | 'pallet' | 'minutes' =
    activeWorkspace === 'pallet-archive'
      ? 'pallet'
      : activeWorkspace === 'minutes-archive'
      ? 'minutes'
      : 'operations';

  const activeStore: WorkspaceArchiveStore =
    scopedMode === 'pallet'
      ? palletArchive
      : scopedMode === 'minutes'
      ? minutesArchive
      : {
          boxes: opBoxes,
          dossiers: opDossiers,
          projects: opProjects,
          uploadHistory: opUploadHistory,
          notifications: opNotifications,
        };

  const boxes = activeStore.boxes;
  const dossiers = activeStore.dossiers;
  const projects = activeStore.projects;
  const uploadHistory = activeStore.uploadHistory;
  const notifications = activeStore.notifications;

  const updateScopedField = <K extends keyof WorkspaceArchiveStore>(
    key: K,
    updater: WorkspaceArchiveStore[K] | ((prev: WorkspaceArchiveStore[K]) => WorkspaceArchiveStore[K]),
    opSetter: React.Dispatch<React.SetStateAction<WorkspaceArchiveStore[K]>>
  ) => {
    const apply = (prevVal: WorkspaceArchiveStore[K]) =>
      typeof updater === 'function' ? (updater as (p: WorkspaceArchiveStore[K]) => WorkspaceArchiveStore[K])(prevVal) : updater;

    if (scopedMode === 'pallet') {
      dirtyModulesRef.current.palletArchive = true;
      setPalletArchive(prev => ({ ...prev, [key]: apply(prev[key]) }));
    } else if (scopedMode === 'minutes') {
      dirtyModulesRef.current.minutesArchive = true;
      setMinutesArchive(prev => ({ ...prev, [key]: apply(prev[key]) }));
    } else {
      opSetter(updater);
    }
  };

  const setBoxes = (u: React.SetStateAction<Box[]>) => updateScopedField('boxes', u, setOpBoxes);
  const setDossiers = (u: React.SetStateAction<Dossier[]>) => updateScopedField('dossiers', u, setOpDossiers);
  const setProjects = (u: React.SetStateAction<Project[]>) => updateScopedField('projects', u, setOpProjects);
  const setUploadHistory = (u: React.SetStateAction<UploadRecord[]>) =>
    updateScopedField('uploadHistory', u, setOpUploadHistory);
  const setNotifications = (u: React.SetStateAction<NotificationItem[]>) =>
    updateScopedField('notifications', u, setOpNotifications);

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const showToast = (message: string, type: ToastMessage['type'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts(prev => [...prev.slice(-3), { id, message, type }]);
    window.setTimeout(() => dismissToast(id), 4500);
  };

  const loadArchiveState = async () => {
    setArchiveLoading(true);
    setArchiveLoadError('');
    try {
      const [parsed, modulesResult] = await Promise.all([
        loadArchiveSnapshot(),
        apiFetch<{
          palletReports?: PalletReport[];
          minutesRecords?: MinutesRecord[];
          palletArchive?: WorkspaceArchiveStore;
          minutesArchive?: WorkspaceArchiveStore;
        }>('/api/modules', {}, 15000).catch(() => null),
      ]);
      skipNextSaveRef.current = true;
      dirtyModulesRef.current = { palletArchive: false, minutesArchive: false };
      setOpBoxes(parsed.boxes || []);
      setOpDossiers(parsed.dossiers || []);
      setOpProjects(parsed.projects || []);
      setOpUploadHistory(parsed.uploadHistory || []);
      setOpNotifications(parsed.notifications || []);
      setAuditLogs(parsed.auditLogs || []);
      if (modulesResult?.ok && modulesResult.body) {
        setPalletReports(Array.isArray(modulesResult.body.palletReports) ? modulesResult.body.palletReports : []);
        setMinutesRecords(Array.isArray(modulesResult.body.minutesRecords) ? modulesResult.body.minutesRecords : []);
        setPalletArchive(normalizeWorkspaceStore(modulesResult.body.palletArchive));
        setMinutesArchive(normalizeMinutesArchiveStore(modulesResult.body.minutesArchive));
      }
      setCurrentUser(parsed.currentUser || guestUser);
      setUsers(parsed.users || (parsed.currentUser ? [parsed.currentUser] : []));
      revisionRef.current = Number(parsed._revision || 0);
      setAuthenticated(Boolean(parsed.currentUser));
      setHydrated(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'تعذر تحميل بيانات الأرشيف.';
      setArchiveLoadError(message);
      throw error;
    } finally {
      setArchiveLoading(false);
    }
  };

  const retryArchiveLoad = async () => {
    await loadArchiveState();
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await apiFetch('/api/auth', {}, 15000);
        if (cancelled) return;
        if (!r.ok || !r.body) throw new Error(errorFrom(r, 'خدمة تسجيل الدخول غير متاحة'));
        setSetupRequired(Boolean(r.body.setupRequired));
        if (r.body.storageMode === 'local' || r.body.storageMode === 'postgres') {
          setStorageMode(r.body.storageMode);
        }
        if (r.body.user) {
          await loadArchiveState();
        } else {
          setSessionToken(null);
        }
      } catch (error) {
        console.error('ARMS initialization error:', error);
        if (!cancelled) setAuthError(error instanceof Error ? error.message : 'تعذر بدء التطبيق.');
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = async (payload: {
    action: 'login' | 'setup';
    username: string;
    password: string;
    name?: string;
    email?: string;
    setupSecret?: string;
  }) => {
    const r = await apiFetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!r.ok || !r.body) throw new Error(errorFrom(r, 'تعذر تسجيل الدخول'));
    if (!r.body.user) throw new Error('تعذر تسجيل الدخول.');
    if (typeof r.body.sessionToken === 'string' && r.body.sessionToken) {
      setSessionToken(r.body.sessionToken);
    }
    setAuthError('');
    setSetupRequired(false);
    if (r.body.storageMode === 'local' || r.body.storageMode === 'postgres') {
      setStorageMode(r.body.storageMode);
    }
    setCurrentUser(r.body.user);
    setActiveWorkspace(null);
    setAuthenticated(true);
    setHydrated(false);
    void loadArchiveState().catch(error => {
      console.error('ARMS archive hydration error:', error);
    });
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    const r = await apiFetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'change-password', currentPassword, newPassword }),
    });
    if (!r.ok) throw new Error(errorFrom(r, 'تعذر تغيير كلمة المرور'));
  };

  const logout = async () => {
    try {
      await apiFetch(
        '/api/auth',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'logout' }) },
        8000
      );
    } catch {
      /* clear local state anyway */
    }
    setSessionToken(null);
    setAuthenticated(false);
    setCurrentUser(guestUser);
    setUsers([]);
    setOpBoxes([]);
    setOpDossiers([]);
    setOpProjects([]);
    setOpUploadHistory([]);
    setOpNotifications([]);
    setAuditLogs([]);
    setPalletReports([]);
    setMinutesRecords([]);
    setPalletArchive(createEmptyWorkspaceStore());
    setMinutesArchive(createEmptyWorkspaceStore());
    dirtyModulesRef.current = { palletArchive: false, minutesArchive: false };
    setActiveWorkspace(null);
    setHydrated(false);
  };

  const savePalletReports = async (next: PalletReport[]) => {
    const previous = palletReports;
    setPalletReports(next);
    const r = await apiFetch('/api/modules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ palletReports: next }),
    });
    if (!r.ok) {
      setPalletReports(previous);
      const msg = errorFrom(r, language === 'ar' ? 'تعذر حفظ تقارير الباليت' : 'Failed saving pallet reports');
      showToast(msg, 'error');
      throw new Error(msg);
    }
  };

  const saveMinutesRecords = async (next: MinutesRecord[]) => {
    const previous = minutesRecords;
    setMinutesRecords(next);
    const r = await apiFetch('/api/modules', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutesRecords: next }),
    });
    if (!r.ok) {
      setMinutesRecords(previous);
      const msg = errorFrom(r, language === 'ar' ? 'تعذر حفظ سجلات التعليقات' : 'Failed saving comments records');
      showToast(msg, 'error');
      throw new Error(msg);
    }
  };

  const canWrite = currentUser.role === 'System Admin' || currentUser.role === 'Archive Manager';
  const canWriteModules = ['System Admin', 'Archive Manager', 'Data Entry'].includes(currentUser.role);

  useEffect(() => {
    if (!hydrated || !authenticated || !canWrite) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const r = await apiFetch(
          '/api/state',
          {
            method: 'PUT',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              boxes: opBoxes,
              dossiers: opDossiers,
              projects: opProjects,
              uploadHistory: opUploadHistory,
              notifications: opNotifications,
              auditLogs,
              _revision: revisionRef.current,
            }),
          },
          60000
        );
        if (r.status === 401) {
          setSessionToken(null);
          window.location.reload();
          return;
        }
        if (r.status === 409) {
          showToast('تم تعديل البيانات من جلسة أخرى. أعد تحميل الصفحة لحماية البيانات.', 'warning');
          return;
        }
        if (!r.ok || !r.body) throw new Error(errorFrom(r, 'فشل حفظ البيانات'));
        revisionRef.current = Number(r.body.revision);
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('ARMS database save error:', error);
          showToast(error instanceof Error ? error.message : 'تعذر حفظ التعديلات.', 'error');
        }
      }
    }, 650);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [hydrated, authenticated, canWrite, opBoxes, opDossiers, opProjects, opUploadHistory, opNotifications, auditLogs]);

  useEffect(() => {
    if (!hydrated || !authenticated || !canWriteModules) return;
    const sendPallet = dirtyModulesRef.current.palletArchive;
    const sendMinutes = dirtyModulesRef.current.minutesArchive;
    if (!sendPallet && !sendMinutes) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const body: Record<string, WorkspaceArchiveStore> = {};
        if (sendPallet) body.palletArchive = palletArchive;
        if (sendMinutes) body.minutesArchive = minutesArchive;

        const r = await apiFetch(
          '/api/modules',
          {
            method: 'PUT',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          },
          60000
        );
        if (!r.ok) throw new Error(errorFrom(r, 'فشل حفظ بيانات القسم'));
        if (sendPallet) dirtyModulesRef.current.palletArchive = false;
        if (sendMinutes) dirtyModulesRef.current.minutesArchive = false;
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error('ARMS module archive save error:', error);
          showToast(error instanceof Error ? error.message : 'تعذر حفظ بيانات القسم.', 'error');
        }
      }
    }, 650);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [hydrated, authenticated, canWriteModules, palletArchive, minutesArchive]);

  const commitMinutesPlan = (store: WorkspaceArchiveStore, summary: string): boolean => {
    if (!['System Admin', 'Archive Manager', 'Data Entry'].includes(currentUser.role)) {
      showToast(language === 'ar' ? 'ليس لديك صلاحية استيراد الخطة.' : 'You do not have permission to import plans.', 'error');
      return false;
    }
    dirtyModulesRef.current.minutesArchive = true;
    setMinutesArchive(normalizeMinutesArchiveStore(store));
    addAuditLog('Import Plan', 'Import', 'minutes-plan', summary);
    showToast(language === 'ar' ? 'تم استيراد الخطة وتوزيعها على الدوسيهات.' : 'Plan imported and distributed into dossiers.', 'success');
    return true;
  };

  const addAuditLog = (
    action: string,
    recordType: AuditLogEntry['recordType'],
    recordId: string,
    details: string,
    beforeState?: string,
    afterState?: string
  ) => {
    const entry: AuditLogEntry = {
      id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      userId: currentUser.id,
      userName: currentUser.name,
      action,
      recordType,
      recordId,
      timestamp: new Date().toLocaleString(),
      details,
      beforeState,
      afterState,
    };
    setAuditLogs(prev => [entry, ...prev]);
  };

  const addNotification = (
    title: string,
    message: string,
    type: NotificationItem['type'],
    severity: NotificationItem['severity'],
    targetRoute: NotificationItem['targetRoute'],
    targetParam?: string
  ) => {
    const notif: NotificationItem = {
      id: `notif-${Date.now()}-${Math.random()}`,
      title,
      message,
      type,
      severity,
      targetRoute,
      targetParam,
      timestamp: new Date().toLocaleString(),
      isRead: false,
    };
    setNotifications(prev => [notif, ...prev]);
  };

  const createBox = (boxCode: string, firstJobId: number): Box => {
    const match = /^D(\d+)$/.exec(boxCode);
    const expectedNumber = 41 + Math.floor((firstJobId - 35200) / 300);
    if (
      !match ||
      firstJobId < 35200 ||
      (firstJobId - 35200) % 300 !== 0 ||
      Number(match[1]) !== expectedNumber ||
      boxes.some(b => b.boxCode === boxCode) ||
      (expectedNumber > 42 && !boxes.some(b => b.boxCode === `D${expectedNumber - 1}`))
    ) {
      throw new Error('Box must follow fixed sequence: D41 starts at 35200, D42 starts at 35500, and each next box advances exactly 300 Job IDs.');
    }
    const emptyMap = new Map<number, { dateApproved: string | null; sourceUpload?: string; status?: ProjectStatus }>();
    const { box: newBox, dossiers: newDossiers, projects: newProjects } = buildBoxStructure(boxCode, firstJobId, emptyMap);

    setBoxes(prev => [...prev, newBox]);
    setDossiers(prev => [...prev, ...newDossiers]);
    setProjects(prev => [...prev, ...newProjects]);

    addAuditLog('Create Box', 'Box', boxCode, `Created new Box ${boxCode} starting at #${firstJobId}`);
    showToast(language === 'ar' ? `تم إنشاء البوكس ${boxCode} بنجاح.` : `Box ${boxCode} created.`, 'success');
    return newBox;
  };

  const importExcelProjects = (
    importedRows: { jobId: number; dateApproved: string | null; archiveStatus?: ProjectStatus }[],
    fileName: string,
    targetBoxCode?: string
  ) => {
    const FIRST_BOX_ID = 35200;
    const FIRST_BOX_NUMBER = 41;
    const BOX_SIZE = 300;
    let importedCount = 0;
    let duplicateCount = 0;
    let newBoxesCreated = 0;
    let rejectedCount = 0;

    const groups = new Map<number, typeof importedRows>();
    importedRows.forEach(item => {
      if (!Number.isInteger(item.jobId) || item.jobId < FIRST_BOX_ID) {
        rejectedCount++;
        return;
      }
      const boxIndex = Math.floor((item.jobId - FIRST_BOX_ID) / BOX_SIZE);
      const expectedCode = `D${FIRST_BOX_NUMBER + boxIndex}`;
      if (targetBoxCode && targetBoxCode !== 'auto' && targetBoxCode !== expectedCode) {
        rejectedCount++;
        return;
      }
      const group = groups.get(boxIndex) || [];
      group.push(item);
      groups.set(boxIndex, group);
    });

    let updatedBoxes = [...boxes];
    let updatedDossiers = [...dossiers];
    let updatedProjects = [...projects];

    for (const [boxIndex, rows] of [...groups.entries()].sort((a, b) => a[0] - b[0])) {
      const expectedPrevious = `D${FIRST_BOX_NUMBER + boxIndex - 1}`;
      if (boxIndex > 1 && !updatedBoxes.some(b => b.boxCode === expectedPrevious)) {
        rejectedCount += rows.length;
        continue;
      }
      const firstJobId = FIRST_BOX_ID + boxIndex * BOX_SIZE;
      const lastJobId = firstJobId + BOX_SIZE - 1;
      const boxCode = `D${FIRST_BOX_NUMBER + boxIndex}`;
      let box = updatedBoxes.find(b => b.boxCode === boxCode);
      if (!box) {
        const blank = buildBoxStructure(boxCode, firstJobId, new Map());
        box = blank.box;
        updatedBoxes.push(box);
        updatedDossiers.push(...blank.dossiers);
        updatedProjects.push(...blank.projects);
        newBoxesCreated++;
      }

      const currentById = new Map<number, Project>();
      updatedProjects.filter(p => p.boxId === boxCode).forEach(p => currentById.set(p.jobId, p));
      const archivedMap = new Map<number, { dateApproved: string | null; sourceUpload?: string; status?: ProjectStatus }>();

      currentById.forEach((project, jobId) => {
        if (project.sourceUpload !== 'Reserved Slot' && project.sourceUpload !== 'System Slot') {
          archivedMap.set(jobId, { dateApproved: project.dateApproved, sourceUpload: project.sourceUpload, status: project.status });
        }
      });

      rows.forEach(item => {
        if (item.jobId < firstJobId || item.jobId > lastJobId) {
          rejectedCount++;
          return;
        }
        const existing = currentById.get(item.jobId);
        const alreadyImported = existing && existing.sourceUpload !== 'Reserved Slot' && existing.sourceUpload !== 'System Slot';
        if (alreadyImported) {
          duplicateCount++;
          return;
        }
        importedCount++;
        archivedMap.set(item.jobId, {
          dateApproved: item.dateApproved,
          sourceUpload: fileName,
          status: item.archiveStatus || 'Archived',
        });
      });

      const recalculated = buildBoxStructure(boxCode, firstJobId, archivedMap, box);
      updatedBoxes = updatedBoxes.map(b => (b.boxCode === boxCode ? recalculated.box : b));
      updatedDossiers = [...updatedDossiers.filter(d => d.boxId !== boxCode), ...recalculated.dossiers];
      updatedProjects = [...updatedProjects.filter(p => p.boxId !== boxCode), ...recalculated.projects];

      if (recalculated.box.missingProjects > 0) {
        addNotification(
          'Missing Projects Found',
          `Box ${boxCode} has ${recalculated.box.missingProjects} reserved gaps before the highest imported Job ID.`,
          'missing',
          'warning',
          'boxes',
          boxCode
        );
      }
    }

    const uploadRec: UploadRecord = {
      id: `upl-${Date.now()}`,
      fileName,
      userName: currentUser.name,
      timestamp: new Date().toLocaleString(),
      totalRows: importedRows.length,
      importedCount,
      duplicateCount,
      rejectedCount,
      errors: [
        ...(duplicateCount ? [`${duplicateCount} duplicate records skipped; existing status preserved`] : []),
        ...(rejectedCount ? [`${rejectedCount} records rejected: outside D41+ (35200+) fixed ranges or invalid Job ID`] : []),
      ],
      status: duplicateCount || rejectedCount ? 'Completed with warnings' : 'Completed',
    };
    setUploadHistory(prev => [uploadRec, ...prev]);
    setBoxes(updatedBoxes);
    setDossiers(updatedDossiers);
    setProjects(updatedProjects);
    addAuditLog(
      'Import Excel',
      'Import',
      uploadRec.id,
      `Imported ${importedCount} projects from ${fileName}. Duplicates: ${duplicateCount}. Rejected: ${rejectedCount}.`
    );
    addNotification('Import Processed', `Imported ${importedCount} projects from ${fileName}.`, 'import', 'success', 'import');
    return { importedCount, duplicateCount, newBoxesCreated, rejectedCount };
  };

  const forceCloseBox = (boxId: string, reason: string): boolean => {
    if (currentUser.role !== 'System Admin') {
      showToast(language === 'ar' ? 'الإغلاق الإداري متاح لمدير النظام فقط.' : 'Only System Admin can execute Force Close.', 'error');
      return false;
    }

    const box = boxes.find(b => b.id === boxId);
    if (!box) return false;

    const beforeState = `isForceClosed: ${box.isForceClosed}`;
    const afterState = `isForceClosed: true, Reason: ${reason}`;

    setBoxes(prev =>
      prev.map(b =>
        b.id === boxId
          ? {
              ...b,
              isForceClosed: true,
              forceCloseReason: reason,
              forceClosedBy: `${currentUser.name} (${currentUser.role})`,
              forceClosedAt: new Date().toLocaleString(),
              updatedAt: new Date().toISOString(),
            }
          : b
      )
    );

    addAuditLog('Force Close Box', 'Force Close', boxId, `Force closed box ${boxId}. Reason: ${reason}`, beforeState, afterState);
    addNotification('Box Force Closed', `Box ${boxId} was administratively force-closed. Reason: ${reason}`, 'force_close', 'info', 'boxes', boxId);
    showToast(language === 'ar' ? `تم إغلاق البوكس ${boxId} إدارياً.` : `Box ${boxId} force-closed.`, 'info');
    return true;
  };

  const reopenBox = (boxId: string): boolean => {
    if (currentUser.role !== 'System Admin') return false;

    setBoxes(prev =>
      prev.map(b =>
        b.id === boxId
          ? {
              ...b,
              isForceClosed: false,
              forceCloseReason: undefined,
              forceClosedBy: undefined,
              forceClosedAt: undefined,
              updatedAt: new Date().toISOString(),
            }
          : b
      )
    );

    addAuditLog('Reopen Box', 'Box', boxId, `Reopened force-closed box ${boxId}`);
    showToast(language === 'ar' ? `تم إعادة فتح البوكس ${boxId}.` : `Box ${boxId} reopened.`, 'success');
    return true;
  };

  const applyStatusUpdates = (targets: number[], newStatus: ProjectStatus, note?: string) => {
    const targetSet = new Set(targets);
    const affectedProjects = projects.filter(p => targetSet.has(p.jobId));
    if (affectedProjects.length === 0) return;

    const now = new Date().toISOString();
    const displayTimestamp = new Date().toLocaleString();
    const isFixedSlots = scopedMode === 'operations';

    const updatedProjects = projects.map(p => {
      if (!targetSet.has(p.jobId)) return p;
      const historyEntry = {
        status: newStatus,
        timestamp: displayTimestamp,
        note: note || `Manual status update by ${currentUser.name}`,
        user: currentUser.name,
      };
      return {
        ...p,
        status: newStatus,
        lastUpdateDate: now,
        statusHistory: [historyEntry, ...(p.statusHistory || [])],
      };
    });

    const affectedBoxCodes = new Set(affectedProjects.map(p => p.boxId));

    const updatedDossiers = dossiers.map(d => {
      if (!affectedBoxCodes.has(d.boxId)) return d;
      const dProjects = updatedProjects.filter(p => p.boxId === d.boxId && p.dossierNumber === d.dossierNumber);
      const dArch = dProjects.filter(p => p.status === 'Archived').length;
      const dMiss = dProjects.filter(p => p.status === 'Missing').length;
      const dPend = dProjects.filter(p => p.status === 'Pending').length;
      const expectedTotal = isFixedSlots ? 50 : dProjects.length;
      const nextStatus: Dossier['status'] =
        dProjects.length > 0 && dArch === expectedTotal
          ? 'Archived'
          : isFixedSlots
          ? dArch > 0
            ? 'Inprogress'
            : 'Pending'
          : dArch + dMiss > 0
          ? 'Inprogress'
          : 'Pending';
      return {
        ...d,
        totalProjects: isFixedSlots ? d.totalProjects : dProjects.length,
        archivedCount: dArch,
        missingCount: dMiss,
        pendingCount: dPend,
        status: nextStatus,
      };
    });

    const updatedBoxes = boxes.map(b => {
      if (!affectedBoxCodes.has(b.boxCode)) return b;
      const boxProjects = updatedProjects.filter(p => p.boxId === b.boxCode);
      const boxDossiers = updatedDossiers.filter(d => d.boxId === b.boxCode);
      const boxArchived = boxProjects.filter(p => p.status === 'Archived').length;
      const boxMissing = boxProjects.filter(p => p.status === 'Missing').length;
      const boxPending = boxProjects.filter(p => p.status === 'Pending').length;
      const expectedTotal = isFixedSlots ? 300 : boxProjects.length;
      return {
        ...b,
        totalProjects: isFixedSlots ? b.totalProjects : boxProjects.length,
        archivedProjects: boxArchived,
        missingProjects: boxMissing,
        pendingProjects: boxPending,
        completedDossiers: boxDossiers.filter(d => d.status === 'Archived').length,
        status: boxProjects.length > 0 && boxArchived === expectedTotal ? ('Archived' as const) : ('Inprogress' as const),
        updatedAt: now,
      };
    });

    setProjects(updatedProjects);
    setDossiers(updatedDossiers);
    setBoxes(updatedBoxes);

    if (affectedProjects.length === 1) {
      const single = affectedProjects[0];
      const label = single.branchName
        ? `${single.branchName} (${language === 'ar' ? 'إرسالية' : 'Shipment'} #${single.shipmentNo ?? single.jobId})`
        : `#${single.jobId}`;
      addAuditLog(
        'Update Project Status',
        'Project',
        String(single.jobId),
        `Updated ${label} status from ${single.status} to ${newStatus}. Note: ${note || 'None'}`
      );
      showToast(
        language === 'ar' ? `تم تحديث حالة ${label}.` : `Updated ${label}.`,
        'success'
      );
    } else {
      addAuditLog(
        'Bulk Update Status',
        'Project',
        `${affectedProjects.length} items`,
        `Updated ${affectedProjects.length} records to ${newStatus}. Note: ${note || 'None'}`
      );
      showToast(
        language === 'ar'
          ? `تم تحديث حالة ${affectedProjects.length} سجل إلى ${newStatus}.`
          : `Updated ${affectedProjects.length} records to ${newStatus}.`,
        'success'
      );
    }
  };

  const updateProjectStatus = (jobId: number, newStatus: ProjectStatus, note?: string) => {
    applyStatusUpdates([jobId], newStatus, note);
  };

  const bulkUpdateProjectStatus = (jobIds: number[], newStatus: ProjectStatus, note?: string) => {
    applyStatusUpdates(jobIds, newStatus, note);
  };

  const markNotificationAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, isRead: true } : n)));
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const addUser = async (userData: Omit<User, 'id' | 'lastLogin'>, password: string) => {
    const r = await apiFetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...userData, password }),
    });
    if (!r.ok || !r.body?.user) throw new Error(errorFrom(r, 'تعذر إنشاء المستخدم'));
    setUsers(prev => [...prev, r.body.user]);
    addAuditLog('Add User', 'User', r.body.user.id, `Created user account for ${r.body.user.name} (${r.body.user.role})`);
  };

  const updateUser = async (
    id: string,
    updates: Partial<User> & { password?: string; resetPassword?: boolean }
  ) => {
    const r = await apiFetch('/api/users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
    if (!r.ok || !r.body?.user) throw new Error(errorFrom(r, 'تعذر تحديث المستخدم'));
    const updatedUser: User = r.body.user;
    setUsers(prev => prev.map(u => (u.id === id ? updatedUser : u)));
    if (id === currentUser.id) {
      setCurrentUser(updatedUser);
    }
    const changedFields: string[] = [];
    if (updates.name !== undefined) changedFields.push(`name="${updatedUser.name}"`);
    if (updates.email !== undefined) changedFields.push(`email="${updatedUser.email}"`);
    if (updates.role !== undefined) changedFields.push(`role=${updatedUser.role}`);
    if (updates.active !== undefined) changedFields.push(`active=${updatedUser.active}`);
    if (updates.resetPassword) changedFields.push('password reset to default');
    else if (updates.password) changedFields.push('password changed');
    addAuditLog(
      'Update User',
      'User',
      id,
      `Updated user ${updatedUser.name} (@${updatedUser.username}): ${changedFields.join(', ') || 'account updated'}`
    );
  };

  const toggleUserStatus = async (id: string) => {
    const target = users.find(u => u.id === id);
    if (!target) return;
    await updateUser(id, { active: !target.active });
  };

  const deleteUser = async (id: string) => {
    const target = users.find(u => u.id === id);
    const r = await apiFetch('/api/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!r.ok) throw new Error(errorFrom(r, 'تعذر حذف المستخدم'));
    setUsers(prev => prev.filter(u => u.id !== id));
    addAuditLog(
      'Delete User',
      'User',
      id,
      `Deleted user account ${target ? `${target.name} (@${target.username})` : id}`
    );
  };

  const searchIndex = useMemo<ArchiveSearchItem[]>(() => {
    const statusKeywords = (status: string): string => {
      switch (status) {
        case 'Archived':
          return 'archived مؤرشف مكتمل';
        case 'Missing':
          return 'missing مفقود فجوة gap';
        case 'Pending':
          return 'pending قيد الانتظار معلق';
        case 'Inprogress':
          return 'inprogress in progress قيد التنفيذ جاري';
        default:
          return status.toLowerCase();
      }
    };

    const formatDateVariants = (isoStr?: string | null): string => {
      if (!isoStr) return '';
      const clean = isoStr.slice(0, 10);
      const parts = clean.split('-');
      if (parts.length !== 3) return clean;
      return `${clean} ${parts[2]}/${parts[1]}/${parts[0]} ${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
    };

    const items: ArchiveSearchItem[] = [];

    for (const box of boxes) {
      const boxDossiers = dossiers.filter(d => d.boxId === box.boxCode);
      const weekDates = boxDossiers
        .flatMap(d => [formatDateVariants(d.weekStart), formatDateVariants(d.weekEnd)])
        .filter(Boolean)
        .join(' ');
      const searchText = [
        box.boxCode,
        box.id,
        `box ${box.boxCode}`,
        `بوكس ${box.boxCode}`,
        `صندوق ${box.boxCode}`,
        String(box.firstJobId),
        String(box.lastJobId),
        `${box.firstJobId}-${box.lastJobId}`,
        weekDates,
        statusKeywords(box.status),
        box.isForceClosed ? 'force close force closed مغلق إدارياً إغلاق إداري' : '',
        box.forceCloseReason || '',
        box.forceClosedBy || '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      items.push({
        uid: `box:${box.boxCode}`,
        type: 'box',
        primaryId: box.boxCode,
        boxId: box.boxCode,
        status: box.isForceClosed ? 'Force Closed' : box.status,
        searchText,
        secondaryIds: [String(box.firstJobId), String(box.lastJobId)],
        box,
      });
    }

    for (const dossier of dossiers) {
      const weekTokens = [formatDateVariants(dossier.weekStart), formatDateVariants(dossier.weekEnd)]
        .filter(Boolean)
        .join(' ');
      const searchText = [
        dossier.id,
        dossier.boxId,
        `box ${dossier.boxId}`,
        `dossier ${dossier.dossierNumber}`,
        `دوسيه ${dossier.dossierNumber}`,
        `ملف ${dossier.dossierNumber}`,
        `week ${dossier.dossierNumber}`,
        `أسبوع ${dossier.dossierNumber}`,
        `${dossier.boxId} ${dossier.dossierNumber}`,
        String(dossier.fromJobId),
        String(dossier.toJobId),
        `${dossier.fromJobId}-${dossier.toJobId}`,
        weekTokens,
        statusKeywords(dossier.status),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      items.push({
        uid: `dossier:${dossier.id}`,
        type: 'dossier',
        primaryId: dossier.id,
        boxId: dossier.boxId,
        dossierNumber: dossier.dossierNumber,
        status: dossier.status,
        searchText,
        secondaryIds: [
          dossier.boxId,
          String(dossier.fromJobId),
          String(dossier.toJobId),
          dossier.weekStart || '',
          dossier.weekEnd || '',
        ].filter(Boolean),
        dossier,
      });
    }

    for (const project of projects) {
      const dossierId = `${project.boxId}-${project.dossierNumber}`;
      const historyKeywords = (project.statusHistory || [])
        .map(h => `${h.status} ${h.note || ''} ${h.user || ''}`)
        .join(' ');
      const shipmentToken = project.shipmentNo !== undefined ? String(project.shipmentNo) : '';
      const searchText = [
        String(project.jobId),
        `#${project.jobId}`,
        `job ${project.jobId}`,
        `project ${project.jobId}`,
        `مشروع ${project.jobId}`,
        project.branchName || '',
        project.branchCode || '',
        shipmentToken,
        shipmentToken ? `#${shipmentToken}` : '',
        shipmentToken ? `إرسالية ${shipmentToken}` : '',
        shipmentToken ? `shipment ${shipmentToken}` : '',
        project.branchName ? 'فرع branch' : '',
        project.region || '',
        project.wing || '',
        formatDateVariants(project.startDate),
        formatDateVariants(project.endDate),
        formatDateVariants(project.weekStart),
        project.boxId,
        dossierId,
        `box ${project.boxId}`,
        `dossier ${project.dossierNumber}`,
        `دوسيه ${project.dossierNumber}`,
        `slot ${project.slotIndex + 1}`,
        project.dateApproved || '',
        project.sourceUpload || '',
        statusKeywords(project.status),
        historyKeywords,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      items.push({
        uid: `project:${project.jobId}`,
        type: 'project',
        primaryId: String(project.jobId),
        boxId: project.boxId,
        dossierNumber: project.dossierNumber,
        jobId: project.jobId,
        status: project.status,
        searchText,
        secondaryIds: [
          project.boxId,
          dossierId,
          project.dateApproved || '',
          project.branchName || '',
          project.branchCode || '',
          shipmentToken,
          project.startDate || '',
        ].filter(Boolean),
        project,
      });
    }

    return items;
  }, [boxes, dossiers, projects]);

  const searchArchive = useCallback(
    (query: string, options?: { type?: SearchEntityType | 'all'; limit?: number }) => {
      const normalizedQuery = query.trim().toLowerCase().replace(/^#(?=\d)/, '');
      const filterType = options?.type ?? 'all';
      const limit = options?.limit ?? 24;

      if (!normalizedQuery) {
        return {
          results: [],
          totalMatches: 0,
          countsByType: { box: 0, dossier: 0, project: 0 },
        };
      }

      const rawTokens = normalizedQuery.split(/\s+/).filter(Boolean);
      const tokens = rawTokens.map(t => t.replace(/^#(?=\d)/, ''));
      const numericLookup = tokens.length === 1 && /^\d{4,}$/.test(tokens[0]) ? Number(tokens[0]) : null;

      const scored: { item: ArchiveSearchItem; score: number }[] = [];
      const countsByType: Record<SearchEntityType, number> = { box: 0, dossier: 0, project: 0 };

      for (const item of searchIndex) {
        const matchesAllTokens = tokens.every(token => item.searchText.includes(token));
        const inRange =
          numericLookup !== null &&
          ((item.type === 'box' &&
            item.box &&
            numericLookup >= item.box.firstJobId &&
            numericLookup <= item.box.lastJobId) ||
            (item.type === 'dossier' &&
              item.dossier &&
              numericLookup >= item.dossier.fromJobId &&
              numericLookup <= item.dossier.toJobId));

        if (!matchesAllTokens && !inRange) continue;

        countsByType[item.type] += 1;

        if (filterType !== 'all' && item.type !== filterType) continue;

        const primaryLower = item.primaryId.toLowerCase();
        let score = 0;

        if (primaryLower === normalizedQuery) {
          score += 1000;
        } else if (primaryLower.startsWith(normalizedQuery)) {
          score += 500;
        } else if (primaryLower.includes(normalizedQuery)) {
          score += 250;
        }

        if (item.secondaryIds.some(sec => sec.toLowerCase() === normalizedQuery)) {
          score += 180;
        } else if (matchesAllTokens) {
          score += 100;
        } else if (inRange) {
          score += 60;
        }

        if (item.type === 'box') score += 12;
        else if (item.type === 'dossier') score += 8;

        scored.push({ item, score });
      }

      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.item.type !== b.item.type) {
          const order: Record<SearchEntityType, number> = { box: 0, dossier: 1, project: 2 };
          return order[a.item.type] - order[b.item.type];
        }
        return a.item.primaryId.localeCompare(b.item.primaryId, undefined, { numeric: true });
      });

      const totalMatches = filterType === 'all' ? scored.length : countsByType[filterType];
      return {
        results: scored.slice(0, limit).map(entry => entry.item),
        totalMatches,
        countsByType,
      };
    },
    [searchIndex]
  );

  return (
    <ArchiveContext.Provider
      value={{
        currentUser,
        authenticated,
        authLoading,
        setupRequired,
        storageMode,
        authError,
        archiveLoading,
        archiveLoadError,
        toasts,
        dismissToast,
        showToast,
        retryArchiveLoad,
        login,
        logout,
        changePassword,
        users,
        boxes,
        dossiers,
        projects,
        uploadHistory,
        notifications,
        auditLogs,
        palletReports,
        minutesRecords,
        palletArchive,
        minutesArchive,
        operationsArchive: {
          boxes: opBoxes,
          dossiers: opDossiers,
          projects: opProjects,
          uploadHistory: opUploadHistory,
          notifications: opNotifications,
        },
        activeWorkspace,
        setActiveWorkspace,
        savePalletReports,
        saveMinutesRecords,
        language,
        setLanguage,
        setCurrentUser,
        importExcelProjects,
        createBox,
        commitMinutesPlan,
        forceCloseBox,
        reopenBox,
        updateProjectStatus,
        bulkUpdateProjectStatus,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        addUser,
        updateUser,
        toggleUserStatus,
        deleteUser,
        searchIndex,
        searchArchive,
      }}
    >
      {children}
    </ArchiveContext.Provider>
  );
};

export const useArchive = () => {
  const context = useContext(ArchiveContext);
  if (!context) {
    throw new Error('useArchive must be used within an ArchiveProvider');
  }
  return context;
};
