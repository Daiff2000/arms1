import type { Box, Dossier, Project, ProjectStatus, UploadRecord, WorkspaceArchiveStore } from '../types';
import { buildBoxStructure } from './archiveCalculations';

export type ArchiveScope = 'operations' | 'pallet' | 'minutes';

export const isImportedProject = (p: Project): boolean =>
  Boolean(p.sourceUpload) && p.sourceUpload !== 'Reserved Slot' && p.sourceUpload !== 'System Slot';

const boxNumberOf = (code: string): number => parseInt(code.replace(/\D+/g, ''), 10) || 0;

/**
 * Matches all Project jobIds belonging to a specific UploadRecord.
 * Uses exact `project.uploadId` when present, with safe chronological fallback for legacy rows
 * imported before `uploadId` was introduced.
 */
export function matchProjectsForUpload(
  projects: Project[],
  targetUpload: UploadRecord,
  allUploads: UploadRecord[]
): Set<number> {
  const matched = new Set<number>();

  // 1) Exact match via uploadId
  for (const p of projects) {
    if (p.uploadId && p.uploadId === targetUpload.id) {
      matched.add(p.jobId);
    }
  }

  // 2) Legacy match via sourceUpload === fileName for projects without uploadId
  const targetName = targetUpload.fileName.trim();
  if (!targetName) return matched;

  const taggedUploadIds = new Set(projects.filter(p => p.uploadId).map(p => p.uploadId!));
  const legacyProjectsForName = projects.filter(
    p => !p.uploadId && isImportedProject(p) && (p.sourceUpload || '').trim() === targetName
  );
  if (legacyProjectsForName.length === 0) return matched;

  // If this upload already has explicit uploadId tags on projects, don't let it steal legacy rows
  if (taggedUploadIds.has(targetUpload.id)) return matched;

  const legacySameNameUploads = allUploads.filter(
    u => u.fileName.trim() === targetName && !taggedUploadIds.has(u.id)
  );

  if (legacySameNameUploads.length <= 1) {
    for (const p of legacyProjectsForName) matched.add(p.jobId);
    return matched;
  }

  // Disambiguate multiple legacy uploads sharing the exact same filename
  const parsedUploadTimes = legacySameNameUploads.map(u => Date.parse(u.timestamp));
  const allTimesValid = parsedUploadTimes.every(t => Number.isFinite(t));

  if (allTimesValid) {
    for (const p of legacyProjectsForName) {
      const pTime = Date.parse(p.firstImportDate || '');
      if (!Number.isFinite(pTime)) continue;
      let bestUpload = legacySameNameUploads[0];
      let bestDiff = Infinity;
      legacySameNameUploads.forEach((u, idx) => {
        const diff = Math.abs(pTime - parsedUploadTimes[idx]);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestUpload = u;
        }
      });
      if (bestUpload.id === targetUpload.id) {
        matched.add(p.jobId);
      }
    }
    return matched;
  }

  // Fallback chronological slicing by importedCount (uploadHistory is stored newest-first)
  const oldestFirst = [...legacySameNameUploads].reverse();
  const sortedLegacyProjects = [...legacyProjectsForName].sort(
    (a, b) => (a.firstImportDate || '').localeCompare(b.firstImportDate || '') || a.jobId - b.jobId
  );

  let cursor = 0;
  for (let i = 0; i < oldestFirst.length; i++) {
    const u = oldestFirst[i];
    const count =
      i === oldestFirst.length - 1
        ? sortedLegacyProjects.length - cursor
        : Math.max(0, u.importedCount || 0);
    const slice = sortedLegacyProjects.slice(cursor, cursor + count);
    cursor += count;
    if (u.id === targetUpload.id) {
      for (const p of slice) matched.add(p.jobId);
      break;
    }
  }

  return matched;
}

export interface UploadDeletionPreview {
  upload: UploadRecord;
  matchedProjectsCount: number;
  affectedBoxCodes: string[];
  boxesToRemoveCount: number;
}

export function getUploadDeletionPreview(
  scope: ArchiveScope,
  store: WorkspaceArchiveStore,
  upload: UploadRecord
): UploadDeletionPreview {
  const matchedIds = matchProjectsForUpload(store.projects, upload, store.uploadHistory);
  const matchedProjects = store.projects.filter(p => matchedIds.has(p.jobId));
  const affectedBoxCodes = Array.from(new Set(matchedProjects.map(p => p.boxId))).sort(
    (a, b) => boxNumberOf(a) - boxNumberOf(b) || a.localeCompare(b)
  );

  let boxesToRemoveCount = 0;
  if (scope === 'operations') {
    const sorted = [...store.boxes].sort((a, b) => a.firstJobId - b.firstJobId);
    for (let i = sorted.length - 1; i >= 0; i--) {
      const box = sorted[i];
      if (box.isForceClosed) break;
      const remainingImported = store.projects.some(
        p => p.boxId === box.boxCode && isImportedProject(p) && !matchedIds.has(p.jobId)
      );
      if (!remainingImported) {
        boxesToRemoveCount++;
      } else {
        break;
      }
    }
  } else {
    for (const code of affectedBoxCodes) {
      const remainingInBox = store.projects.some(p => p.boxId === code && !matchedIds.has(p.jobId));
      if (!remainingInBox) boxesToRemoveCount++;
    }
  }

  return {
    upload,
    matchedProjectsCount: matchedProjects.length,
    affectedBoxCodes,
    boxesToRemoveCount,
  };
}

export interface UploadDeletionResult {
  nextStore: WorkspaceArchiveStore;
  deletedProjectsCount: number;
  removedDossiersCount: number;
  removedBoxesCount: number;
  upload: UploadRecord;
}

export function deleteUploadInWorkspaceStore(
  store: WorkspaceArchiveStore,
  uploadId: string
): UploadDeletionResult | null {
  const upload = store.uploadHistory.find(u => u.id === uploadId);
  if (!upload) return null;

  const matchedIds = matchProjectsForUpload(store.projects, upload, store.uploadHistory);
  const remainingProjects = store.projects.filter(p => !matchedIds.has(p.jobId));
  const now = new Date().toISOString();

  const remainingDossiers: Dossier[] = [];
  for (const d of store.dossiers) {
    const ps = remainingProjects.filter(p => p.boxId === d.boxId && p.dossierNumber === d.dossierNumber);
    if (ps.length === 0) continue;
    const archivedCount = ps.filter(p => p.status === 'Archived').length;
    const missingCount = ps.filter(p => p.status === 'Missing').length;
    const pendingCount = ps.filter(p => p.status === 'Pending').length;
    remainingDossiers.push({
      ...d,
      totalProjects: ps.length,
      archivedCount,
      missingCount,
      pendingCount,
      fromJobId: Math.min(...ps.map(p => p.jobId)),
      toJobId: Math.max(...ps.map(p => p.jobId)),
      status: archivedCount === ps.length ? 'Archived' : archivedCount + missingCount > 0 ? 'Inprogress' : 'Pending',
    });
  }

  const remainingBoxes: Box[] = [];
  for (const b of store.boxes) {
    const ds = remainingDossiers.filter(d => d.boxId === b.boxCode);
    if (ds.length === 0) continue;
    const ps = remainingProjects.filter(p => p.boxId === b.boxCode);
    const archivedProjects = ps.filter(p => p.status === 'Archived').length;
    const missingProjects = ps.filter(p => p.status === 'Missing').length;
    const pendingProjects = ps.filter(p => p.status === 'Pending').length;
    remainingBoxes.push({
      ...b,
      totalProjects: ps.length,
      archivedProjects,
      missingProjects,
      pendingProjects,
      completedDossiers: ds.filter(d => d.status === 'Archived').length,
      status: ps.length > 0 && archivedProjects === ps.length ? 'Archived' : 'Inprogress',
      firstJobId: ps.length ? Math.min(...ps.map(p => p.jobId)) : 0,
      lastJobId: ps.length ? Math.max(...ps.map(p => p.jobId)) : 0,
      updatedAt: now,
    });
  }

  return {
    nextStore: {
      ...store,
      boxes: remainingBoxes,
      dossiers: remainingDossiers,
      projects: remainingProjects,
      uploadHistory: store.uploadHistory.filter(u => u.id !== uploadId),
    },
    deletedProjectsCount: matchedIds.size,
    removedDossiersCount: store.dossiers.length - remainingDossiers.length,
    removedBoxesCount: store.boxes.length - remainingBoxes.length,
    upload,
  };
}

export function deleteUploadInOperationsStore(
  store: WorkspaceArchiveStore,
  uploadId: string
): UploadDeletionResult | null {
  const upload = store.uploadHistory.find(u => u.id === uploadId);
  if (!upload) return null;

  const matchedIds = matchProjectsForUpload(store.projects, upload, store.uploadHistory);

  // Rebuild every box that held any deleted projects so slot statuses (Missing vs Pending) stay exact
  const affectedBoxes = new Set(
    store.projects.filter(p => matchedIds.has(p.jobId)).map(p => p.boxId)
  );

  let updatedBoxes = store.boxes.map(b => ({ ...b }));
  let updatedDossiers = store.dossiers.map(d => ({ ...d }));
  let updatedProjects = store.projects.map(p => ({ ...p }));

  for (const boxCode of affectedBoxes) {
    const existingBox = updatedBoxes.find(b => b.boxCode === boxCode);
    if (!existingBox) continue;

    const remainingImportedMap = new Map<
      number,
      { dateApproved: string | null; sourceUpload?: string; uploadId?: string; status?: ProjectStatus }
    >();

    updatedProjects
      .filter(p => p.boxId === boxCode && isImportedProject(p) && !matchedIds.has(p.jobId))
      .forEach(p => {
        remainingImportedMap.set(p.jobId, {
          dateApproved: p.dateApproved,
          sourceUpload: p.sourceUpload,
          uploadId: p.uploadId,
          status: p.status,
        });
      });

    const rebuilt = buildBoxStructure(boxCode, existingBox.firstJobId, remainingImportedMap, existingBox);
    updatedBoxes = updatedBoxes.map(b => (b.boxCode === boxCode ? rebuilt.box : b));
    updatedDossiers = [...updatedDossiers.filter(d => d.boxId !== boxCode), ...rebuilt.dossiers];
    updatedProjects = [...updatedProjects.filter(p => p.boxId !== boxCode), ...rebuilt.projects];
  }

  // Prune trailing empty boxes from the tail downward so D41..DN stays contiguous
  const sortedAsc = [...updatedBoxes].sort((a, b) => a.firstJobId - b.firstJobId);
  const prunedCodes = new Set<string>();
  for (let i = sortedAsc.length - 1; i >= 0; i--) {
    const b = sortedAsc[i];
    if (b.isForceClosed) break;
    const hasRemainingImported = updatedProjects.some(p => p.boxId === b.boxCode && isImportedProject(p));
    if (!hasRemainingImported) {
      prunedCodes.add(b.boxCode);
    } else {
      break;
    }
  }

  const finalBoxes = updatedBoxes.filter(b => !prunedCodes.has(b.boxCode));
  const finalDossiers = updatedDossiers.filter(d => !prunedCodes.has(d.boxId));
  const finalProjects = updatedProjects.filter(p => !prunedCodes.has(p.boxId));

  return {
    nextStore: {
      ...store,
      boxes: finalBoxes,
      dossiers: finalDossiers,
      projects: finalProjects,
      uploadHistory: store.uploadHistory.filter(u => u.id !== uploadId),
    },
    deletedProjectsCount: matchedIds.size,
    removedDossiersCount: store.dossiers.length - finalDossiers.length,
    removedBoxesCount: store.boxes.length - finalBoxes.length,
    upload,
  };
}
