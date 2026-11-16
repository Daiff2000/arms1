import * as XLSX from 'xlsx';
import type { Box, Dossier, Project, UploadRecord, WorkspaceArchiveStore } from '../types';

/** Rules: 1 dossier = 1 working week (Sunday → Thursday). 1 box = 6 dossiers (6 weeks). */
export const DOSSIERS_PER_BOX = 6;

export interface PlanRow {
  sourceRow: number;
  branchName: string;
  branchCode: string;
  shipmentNo: number;
  folderCount: number;
  region: string;
  wing: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD or ''
  status?: 'Archived' | 'Missing' | 'Pending';
}

export interface ParseResult {
  sheetName: string;
  rows: PlanRow[];
  rejected: { sourceRow: number; reason: string }[];
  totalRows: number;
}

const norm = (v: unknown) =>
  String(v ?? '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

/** Accepts Date, Excel serial, "d/m/yyyy" or "yyyy-mm-dd"; returns YYYY-MM-DD or null. */
export function toIsoDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const d = new Date(v.getTime() + 12 * 3600 * 1000); // absorb SheetJS timezone drift
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  if (typeof v === 'number' && v > 30000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  if (typeof v === 'string') {
    const t = v.trim();
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return iso(+m[3], +m[2], +m[1]);
  }
  return null;
}

const utc = (isoDate: string) => {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms: number) => {
  const d = new Date(ms);
  return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
};

/** Sunday that starts the week containing the date (weeks run Sun→Thu). */
export function weekStartOf(isoDate: string): string {
  const dow = new Date(utc(isoDate)).getUTCDay(); // 0 = Sunday
  return fromUtc(utc(isoDate) - dow * 86400000);
}
export const weekEndOf = (weekStart: string) => fromUtc(utc(weekStart) + 4 * 86400000); // Thursday
export const isWeekend = (isoDate: string) => {
  const dow = new Date(utc(isoDate)).getUTCDay();
  return dow === 5 || dow === 6;
};

function parseRowStatus(raw: unknown): 'Archived' | 'Missing' | 'Pending' {
  const v = norm(raw).toLowerCase();
  if (!v) return 'Pending';
  if (v.includes('archiv') || v.includes('مؤرشف') || v.includes('مكتمل') || v === 'تم' || v === 'yes') return 'Archived';
  if (v.includes('miss') || v.includes('مفقود') || v.includes('ناقص')) return 'Missing';
  return 'Pending';
}

/** Finds the plan sheet by its header names (not by sheet name) and extracts rows. */
export function parsePlanWorkbook(wb: XLSX.WorkBook): ParseResult {
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    for (let h = 0; h < Math.min(matrix.length, 10); h++) {
      const header = (matrix[h] || []).map(norm);
      const find = (pred: (t: string) => boolean) => header.findIndex(t => t && pred(t));
      const cName = find(t => t.includes('اسم الفرع') || t === 'الفرع' || t.toLowerCase() === 'branch name');
      const cShip = find(t => t.includes('رقم الارسالية') || t.includes('الارسالية') || t.toLowerCase().includes('shipment'));
      const cStart = find(
        t =>
          t.includes('تاريخ بدء') ||
          t.includes('تاريخ التشغيل') ||
          t.includes('بداية التشغيل') ||
          t.toLowerCase().includes('start date')
      );
      if ([cName, cShip, cStart].some(c => c < 0)) continue;
      const cFold = find(t => t.includes('عدد المناديل') || t.includes('المناديل'));
      const cCode = find(t => t.includes('كود الفرع'));
      const cRegion = find(t => t === 'المنطقة' || t.includes('المنطقة'));
      const cWing = find(t => t === 'الجناح' || t.includes('الجناح'));
      const cEnd = find(t => t.includes('تاريخ نهاية') || t.includes('تاريخ الانتهاء'));
      const cStatus = find(t => t === 'الحالة' || t.includes('حالة الارشفة') || t.toLowerCase() === 'status');

      const rows: PlanRow[] = [];
      const rejected: ParseResult['rejected'] = [];
      let total = 0;
      for (let r = h + 1; r < matrix.length; r++) {
        const line = matrix[r] || [];
        const name = norm(line[cName]);
        if (!name && line[cShip] == null && line[cStart] == null) continue; // blank row
        total++;
        const start = toIsoDate(line[cStart]);
        const ship = parseInt(String(line[cShip] ?? '').trim(), 10);
        const folders = cFold >= 0 ? parseInt(String(line[cFold] ?? '').trim(), 10) : 0;
        if (!name) { rejected.push({ sourceRow: r + 1, reason: 'اسم الفرع فارغ' }); continue; }
        if (!Number.isFinite(ship)) { rejected.push({ sourceRow: r + 1, reason: 'رقم الارسالية غير صالح' }); continue; }
        if (!start) { rejected.push({ sourceRow: r + 1, reason: 'تاريخ البدء غير صالح' }); continue; }
        rows.push({
          sourceRow: r + 1,
          branchName: name,
          branchCode: cCode >= 0 ? String(line[cCode] ?? '').trim() : '',
          shipmentNo: ship,
          folderCount: Number.isFinite(folders) ? folders : 0,
          region: cRegion >= 0 ? norm(line[cRegion]) : '',
          wing: cWing >= 0 ? norm(line[cWing]) : '',
          startDate: start,
          endDate: (cEnd >= 0 && toIsoDate(line[cEnd])) || '',
          status: cStatus >= 0 ? parseRowStatus(line[cStatus]) : 'Pending',
        });
      }
      return { sheetName, rows, rejected, totalRows: total };
    }
  }
  throw new Error('لم يتم العثور على شيت الخطة (الأعمدة المطلوبة: اسم الفرع / رقم الإرسالية / تاريخ بدء التشغيل).');
}

export interface PlanWeekPreview {
  weekStart: string;
  weekEnd: string;
  boxCode: string;
  dossierNumber: number;
  isNew: boolean;
  records: number;
  folders: number;
}

export interface PlanBuild {
  store: WorkspaceArchiveStore;
  weeks: PlanWeekPreview[];
  importedCount: number;
  duplicateCount: number;
  weekendCount: number;
  warnings: string[];
}

// A branch name can repeat across rows; shipmentNo distinguishes each branch dispatch.
const dupKey = (name: string, ship: number, start: string) => `${norm(name)}|${ship}|${start}`;

/**
 * Groups rows into Sun→Thu weeks, one dossier per week, 6 dossiers per box.
 * Weeks that already exist in the store are reused; new weeks continue after the last dossier.
 * Weeks with no rows consume no dossier.
 */
export function buildMinutesPlan(
  rows: PlanRow[],
  existing: WorkspaceArchiveStore,
  opts: { boxPrefix: string; startBoxNumber: number; fileName: string; userName: string; rejectedCount: number }
): PlanBuild {
  const now = new Date().toISOString();
  const boxes: Box[] = existing.boxes.map(b => ({ ...b }));
  const dossiers: Dossier[] = existing.dossiers.map(d => ({ ...d }));
  const projects: Project[] = [...existing.projects];
  const warnings: string[] = [];

  const seen = new Set(projects.map(p => dupKey(p.branchName || p.branchCode || '', p.shipmentNo ?? 0, p.startDate || '')));
  let nextJobId = projects.reduce((m, p) => Math.max(m, p.jobId), 0) + 1;

  // 1) dedupe + bucket by week
  const buckets = new Map<string, PlanRow[]>();
  let duplicateCount = 0;
  let weekendCount = 0;
  const sorted = [...rows].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.sourceRow - b.sourceRow);
  for (const r of sorted) {
    const k = dupKey(r.branchName, r.shipmentNo, r.startDate);
    if (seen.has(k)) { duplicateCount++; continue; }
    seen.add(k);
    if (isWeekend(r.startDate)) weekendCount++;
    const wk = weekStartOf(r.startDate);
    if (!buckets.has(wk)) buckets.set(wk, []);
    buckets.get(wk)!.push(r);
  }

  // 2) locate / allocate dossier per week
  const dossierByWeek = new Map<string, Dossier>();
  dossiers.forEach(d => d.weekStart && dossierByWeek.set(d.weekStart, d));
  const lastExistingWeek = [...dossierByWeek.keys()].sort().pop();

  const boxNum = (code: string) => parseInt(code.replace(/\D+/g, ''), 10) || 0;
  const orderedBoxes = () => [...boxes].sort((a, b) => boxNum(a.boxCode) - boxNum(b.boxCode));
  const newWeeks = [...buckets.keys()].filter(w => !dossierByWeek.has(w)).sort();
  if (lastExistingWeek && newWeeks.length && newWeeks[0] < lastExistingWeek) {
    warnings.push(`أسابيع جديدة أقدم من آخر أسبوع مؤرشف (${lastExistingWeek}) — تم وضعها في آخر الدوسيهات المتاحة.`);
  }

  const previews: PlanWeekPreview[] = [];
  const touchedBoxes = new Set<string>();
  for (const wk of newWeeks) {
    const lastBox = orderedBoxes().pop();
    const used = lastBox ? dossiers.filter(d => d.boxId === lastBox.boxCode).length : DOSSIERS_PER_BOX;
    let boxCode: string;
    let dnum: number;
    if (lastBox && used < DOSSIERS_PER_BOX) {
      boxCode = lastBox.boxCode;
      dnum = used + 1;
    } else {
      const n = lastBox ? boxNum(lastBox.boxCode) + 1 : opts.startBoxNumber;
      boxCode = `${opts.boxPrefix}${n}`;
      dnum = 1;
      boxes.push({
        id: boxCode, boxCode, firstJobId: 0, lastJobId: 0, totalDossiers: DOSSIERS_PER_BOX, completedDossiers: 0,
        totalProjects: 0, archivedProjects: 0, missingProjects: 0, pendingProjects: 0,
        status: 'Inprogress', isForceClosed: false, createdAt: now, updatedAt: now,
      });
    }
    const d: Dossier = {
      id: `${boxCode}-${dnum}`, boxId: boxCode, dossierNumber: dnum, fromJobId: 0, toJobId: 0, totalProjects: 0,
      archivedCount: 0, missingCount: 0, pendingCount: 0, status: 'Pending', weekStart: wk, weekEnd: weekEndOf(wk),
    };
    dossiers.push(d);
    dossierByWeek.set(wk, d);
  }

  // 3) create records inside their week's dossier
  for (const wk of [...buckets.keys()].sort()) {
    const d = dossierByWeek.get(wk)!;
    let slot = projects.filter(p => p.boxId === d.boxId && p.dossierNumber === d.dossierNumber).length;
    let folders = 0;
    const list = buckets.get(wk)!;
    for (const r of list) {
      const rowStatus = r.status || 'Pending';
      projects.push({
        jobId: nextJobId++, dateApproved: r.startDate, status: rowStatus, boxId: d.boxId, dossierNumber: d.dossierNumber,
        slotIndex: slot++, firstImportDate: now, lastUpdateDate: now, sourceUpload: opts.fileName,
        statusHistory: [{ status: rowStatus, timestamp: now, note: 'Imported from plan', user: opts.userName }],
        branchName: r.branchName, branchCode: r.branchCode, shipmentNo: r.shipmentNo, folderCount: r.folderCount,
        region: r.region, wing: r.wing, startDate: r.startDate, endDate: r.endDate, weekStart: wk,
      });
      folders += r.folderCount;
    }
    touchedBoxes.add(d.boxId);
    previews.push({
      weekStart: wk, weekEnd: weekEndOf(wk), boxCode: d.boxId, dossierNumber: d.dossierNumber,
      isNew: newWeeks.includes(wk), records: list.length, folders,
    });
  }

  // 4) recompute counters / job ranges for every dossier + box
  for (const d of dossiers) {
    const ps = projects.filter(p => p.boxId === d.boxId && p.dossierNumber === d.dossierNumber);
    d.totalProjects = ps.length;
    d.archivedCount = ps.filter(p => p.status === 'Archived').length;
    d.missingCount = ps.filter(p => p.status === 'Missing').length;
    d.pendingCount = ps.filter(p => p.status === 'Pending').length;
    d.fromJobId = ps.length ? Math.min(...ps.map(p => p.jobId)) : 0;
    d.toJobId = ps.length ? Math.max(...ps.map(p => p.jobId)) : 0;
    d.status = ps.length && d.archivedCount === ps.length ? 'Archived' : d.archivedCount + d.missingCount > 0 ? 'Inprogress' : 'Pending';
  }
  for (const b of boxes) {
    const ds = dossiers.filter(d => d.boxId === b.boxCode);
    const ps = projects.filter(p => p.boxId === b.boxCode);
    b.totalProjects = ps.length;
    b.archivedProjects = ps.filter(p => p.status === 'Archived').length;
    b.missingProjects = ps.filter(p => p.status === 'Missing').length;
    b.pendingProjects = ps.filter(p => p.status === 'Pending').length;
    b.completedDossiers = ds.filter(d => d.status === 'Archived').length;
    b.status = ps.length > 0 && b.archivedProjects === ps.length ? 'Archived' : 'Inprogress';
    b.firstJobId = ps.length ? Math.min(...ps.map(p => p.jobId)) : 0;
    b.lastJobId = ps.length ? Math.max(...ps.map(p => p.jobId)) : 0;
    if (touchedBoxes.has(b.boxCode)) b.updatedAt = now;
  }

  const importedCount = rows.length - duplicateCount;
  const upload: UploadRecord = {
    id: `upl-${Date.now()}`, fileName: opts.fileName, userName: opts.userName, timestamp: now,
    totalRows: rows.length + opts.rejectedCount, importedCount, duplicateCount, rejectedCount: opts.rejectedCount,
    errors: warnings, status: duplicateCount || opts.rejectedCount || warnings.length ? 'Completed with warnings' : 'Completed',
  };

  return {
    store: { ...existing, boxes, dossiers, projects, uploadHistory: [upload, ...existing.uploadHistory] },
    weeks: previews, importedCount, duplicateCount, weekendCount, warnings,
  };
}
