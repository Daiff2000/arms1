import * as XLSX from 'xlsx';
import type { Box, Dossier, Project, UploadRecord, WorkspaceArchiveStore } from '../types';

/** Rules:
 * - Starts from Month 6 (June) at Box C13 (default startBoxNumber = 13).
 * - First 2 boxes (C13, C14): 2 monthly dossiers per box (C13: Jun & Jul; C14: Aug & Sep).
 * - From Box C15 onwards (Month 10+): 1 dossier = 1 working week (Sunday → Thursday), 6 dossiers per box.
 */
export const DOSSIERS_PER_BOX = 6;
export const MONTHLY_DOSSIERS_PER_BOX = 2;
export const START_MONTH = 6; // June

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

export const monthStartOf = (year: number, month: number) => iso(year, month, 1);
export const monthEndOf = (year: number, month: number) => {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return iso(year, month, lastDay);
};

function parseRowStatus(raw: unknown): 'Archived' | 'Missing' | 'Pending' {
  const v = norm(raw).toLowerCase();
  if (!v) return 'Pending';
  if (v.includes('archiv') || v.includes('مؤرشف') || v.includes('مكتمل') || v === 'تم' || v === 'yes') return 'Archived';
  if (v.includes('miss') || v.includes('مفقود') || v.includes('ناقص')) return 'Missing';
  return 'Pending';
}

const normHeader = (v: unknown) =>
  norm(v)
    .replace(/ة/g, 'ه')
    .toLowerCase();

/** Finds the plan sheet by its header names (not by sheet name) and extracts rows. */
export function parsePlanWorkbook(wb: XLSX.WorkBook): ParseResult {
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null });
    for (let h = 0; h < Math.min(matrix.length, 10); h++) {
      const header = (matrix[h] || []).map(normHeader);
      const find = (pred: (t: string) => boolean) => header.findIndex(t => t && pred(t));
      const cName = find(t => t.includes('اسم الفرع') || t === 'الفرع' || t === 'branch name' || t === 'branch');
      const cShip = find(t => t.includes('رقم الارساليه') || t.includes('الارساليه') || t.includes('shipment'));
      const cStart = find(
        t =>
          t.includes('تاريخ بدء') ||
          t.includes('تاريخ التشغيل') ||
          t.includes('بدايه التشغيل') ||
          t.includes('تاريخ البدء') ||
          t.includes('start date')
      );
      if ([cName, cShip, cStart].some(c => c < 0)) continue;
      const cFold = find(
        t =>
          t.includes('عدد المناديل') ||
          t.includes('المناديل') ||
          t.includes('عدد المنديل') ||
          t.includes('المنديل') ||
          t.includes('folders')
      );
      const cCode = find(t => t.includes('كود الفرع') || t.includes('branch code'));
      const cRegion = find(t => t === 'المنطقه' || t.includes('المنطقه') || t === 'منطقه' || t === 'region' || t === 'area');
      const cWing = find(t => t === 'الجناح' || t.includes('الجناح') || t === 'wing' || t.includes('القطاع'));
      const cEnd = find(t => t.includes('تاريخ نهايه') || t.includes('تاريخ الانتهاء') || t.includes('end date'));
      const cStatus = find(t => t === 'الحاله' || t.includes('حاله الارشفه') || t === 'status');

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
  totalDossiers: number;
  isMonthly: boolean;
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
  skippedBeforeStartCount: number;
  warnings: string[];
}

// A branch name can repeat across rows; shipmentNo distinguishes each branch dispatch.
const dupKey = (name: string, ship: number, start: string) => `${norm(name)}|${ship}|${start}`;

/**
 * Allocates rows starting from Month 6 at Box C13:
 * - First 2 boxes (startBoxNumber = 13 -> C13, startBoxNumber + 1 = 14 -> C14):
 *   - C13: Dossier 1 = Month 6 (June), Dossier 2 = Month 7 (July)
 *   - C14: Dossier 1 = Month 8 (August), Dossier 2 = Month 9 (September)
 * - From Box C15 onwards (Month 10+):
 *   - Standard weekly allocation (Sun→Thu), 1 dossier per week, 6 dossiers per box.
 */
export function buildMinutesPlan(
  rows: PlanRow[],
  existing: WorkspaceArchiveStore,
  opts: { boxPrefix: string; startBoxNumber: number; fileName: string; userName: string; rejectedCount: number; uploadId?: string }
): PlanBuild {
  const now = new Date().toISOString();
  const uploadId = opts.uploadId || `upl-${Date.now()}`;
  const boxes: Box[] = existing.boxes.map(b => ({ ...b }));
  const dossiers: Dossier[] = existing.dossiers.map(d => ({ ...d }));
  const projects: Project[] = [...existing.projects];
  const warnings: string[] = [];

  const prefix = (opts.boxPrefix || 'C').trim().toUpperCase() || 'C';
  const startNum = Math.max(1, opts.startBoxNumber || 13);
  const m1BoxCode = `${prefix}${startNum}`;     // e.g. C13 (Months 6 & 7)
  const m2BoxCode = `${prefix}${startNum + 1}`; // e.g. C14 (Months 8 & 9)
  const weeklyMinBoxNum = startNum + 2;         // e.g. 15 -> C15+ (Month 10+)

  const boxNum = (code: string) => parseInt(code.replace(/\D+/g, ''), 10) || 0;

  // Determine the base year (prioritize existing dossiers, then earliest imported row in months 6+, then earliest row)
  const sortedRows = [...rows].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.sourceRow - b.sourceRow);
  const existingYears = dossiers
    .map(d => Number((d.weekStart || '').slice(0, 4)))
    .filter(y => Number.isFinite(y) && y > 1990);
  const rowYearsFromJune = sortedRows
    .filter(r => Number(r.startDate.slice(5, 7)) >= START_MONTH)
    .map(r => Number(r.startDate.slice(0, 4)));
  const allRowYears = sortedRows.map(r => Number(r.startDate.slice(0, 4))).filter(y => Number.isFinite(y) && y > 1990);
  const baseYear =
    (existingYears.length ? Math.min(...existingYears) : 0) ||
    rowYearsFromJune[0] ||
    allRowYears[0] ||
    new Date().getFullYear();

  const juneStartIso = monthStartOf(baseYear, START_MONTH); // YYYY-06-01
  const octStartIso = monthStartOf(baseYear, 10);           // YYYY-10-01

  const ensureBox = (code: string, totalDossiers: number): Box => {
    let b = boxes.find(x => x.boxCode === code);
    if (!b) {
      b = {
        id: code,
        boxCode: code,
        firstJobId: 0,
        lastJobId: 0,
        totalDossiers,
        completedDossiers: 0,
        totalProjects: 0,
        archivedProjects: 0,
        missingProjects: 0,
        pendingProjects: 0,
        status: 'Inprogress',
        isForceClosed: false,
        createdAt: now,
        updatedAt: now,
      };
      boxes.push(b);
    } else if (totalDossiers === MONTHLY_DOSSIERS_PER_BOX) {
      b.totalDossiers = MONTHLY_DOSSIERS_PER_BOX;
    }
    return b;
  };

  const seen = new Set(projects.map(p => dupKey(p.branchName || p.branchCode || '', p.shipmentNo ?? 0, p.startDate || '')));
  let nextJobId = projects.reduce((m, p) => Math.max(m, p.jobId), 0) + 1;

  // 1) Dedupe, filter strictly >= Month 6 of baseYear, and partition into monthly (months 6..9) vs weekly (Oct+)
  const monthlySlotMap: Record<number, { boxCode: string; dossierNumber: number; periodStart: string; periodEnd: string }> = {
    6: { boxCode: m1BoxCode, dossierNumber: 1, periodStart: monthStartOf(baseYear, 6), periodEnd: monthEndOf(baseYear, 6) },
    7: { boxCode: m1BoxCode, dossierNumber: 2, periodStart: monthStartOf(baseYear, 7), periodEnd: monthEndOf(baseYear, 7) },
    8: { boxCode: m2BoxCode, dossierNumber: 1, periodStart: monthStartOf(baseYear, 8), periodEnd: monthEndOf(baseYear, 8) },
    9: { boxCode: m2BoxCode, dossierNumber: 2, periodStart: monthStartOf(baseYear, 9), periodEnd: monthEndOf(baseYear, 9) },
  };

  const monthlyBuckets = new Map<number, PlanRow[]>(); // month 6|7|8|9 -> rows
  const weeklyBuckets = new Map<string, { weekStart: string; weekEnd: string; rows: PlanRow[] }>();
  let duplicateCount = 0;
  let skippedBeforeStartCount = 0;
  let weekendCount = 0;
  let importedCount = 0;

  for (const r of sortedRows) {
    if (r.startDate < juneStartIso) {
      skippedBeforeStartCount++;
      continue;
    }
    const k = dupKey(r.branchName, r.shipmentNo, r.startDate);
    if (seen.has(k)) {
      duplicateCount++;
      continue;
    }
    seen.add(k);
    importedCount++;

    const rYear = Number(r.startDate.slice(0, 4));
    const rMonth = Number(r.startDate.slice(5, 7));

    if (rYear === baseYear && rMonth >= 6 && rMonth <= 9) {
      if (!monthlyBuckets.has(rMonth)) monthlyBuckets.set(rMonth, []);
      monthlyBuckets.get(rMonth)!.push(r);
    } else {
      // Month 10+ (or subsequent years): weekly logic starting from Box C15+
      if (isWeekend(r.startDate)) weekendCount++;
      const rawWs = weekStartOf(r.startDate);
      const rawWe = weekEndOf(rawWs);
      // Keep Oct 1..3 partial week from crossing backward into September's monthly dossier
      const wkStart = rawWs < octStartIso && r.startDate >= octStartIso ? octStartIso : rawWs;
      const wkEnd = rawWe < wkStart ? wkStart : rawWe;
      if (!weeklyBuckets.has(wkStart)) {
        weeklyBuckets.set(wkStart, { weekStart: wkStart, weekEnd: wkEnd, rows: [] });
      }
      weeklyBuckets.get(wkStart)!.rows.push(r);
    }
  }

  if (skippedBeforeStartCount > 0) {
    warnings.push(
      `تم تجاهل ${skippedBeforeStartCount} سجل بتاريخ قبل شهر 6 (${juneStartIso}) لأن الترقيم يبدأ من شهر 6 في بوكس ${m1BoxCode}.`
    );
  }

  const previews: PlanWeekPreview[] = [];
  const touchedBoxes = new Set<string>();

  // 2A) Allocate & populate monthly dossiers for C13 (months 6,7) and C14 (months 8,9)
  for (const monthNum of [6, 7, 8, 9]) {
    const list = monthlyBuckets.get(monthNum);
    if (!list || list.length === 0) continue;

    const spec = monthlySlotMap[monthNum];
    ensureBox(spec.boxCode, MONTHLY_DOSSIERS_PER_BOX);

    let dossier = dossiers.find(d => d.boxId === spec.boxCode && d.dossierNumber === spec.dossierNumber);
    const isNew = !dossier;
    if (!dossier) {
      dossier = {
        id: `${spec.boxCode}-${spec.dossierNumber}`,
        boxId: spec.boxCode,
        dossierNumber: spec.dossierNumber,
        fromJobId: 0,
        toJobId: 0,
        totalProjects: 0,
        archivedCount: 0,
        missingCount: 0,
        pendingCount: 0,
        status: 'Pending',
        weekStart: spec.periodStart,
        weekEnd: spec.periodEnd,
      };
      dossiers.push(dossier);
    }

    let slot = projects.filter(p => p.boxId === dossier!.boxId && p.dossierNumber === dossier!.dossierNumber).length;
    let folders = 0;
    for (const r of list) {
      const rowStatus = r.status || 'Pending';
      projects.push({
        jobId: nextJobId++,
        dateApproved: r.startDate,
        status: rowStatus,
        boxId: dossier.boxId,
        dossierNumber: dossier.dossierNumber,
        slotIndex: slot++,
        firstImportDate: now,
        lastUpdateDate: now,
        sourceUpload: opts.fileName,
        uploadId,
        statusHistory: [{ status: rowStatus, timestamp: now, note: 'Imported from plan', user: opts.userName }],
        branchName: r.branchName,
        branchCode: r.branchCode,
        shipmentNo: r.shipmentNo,
        folderCount: r.folderCount,
        region: r.region,
        wing: r.wing,
        startDate: r.startDate,
        endDate: r.endDate,
        weekStart: spec.periodStart,
      });
      folders += r.folderCount;
    }

    touchedBoxes.add(dossier.boxId);
    previews.push({
      weekStart: spec.periodStart,
      weekEnd: spec.periodEnd,
      boxCode: dossier.boxId,
      dossierNumber: dossier.dossierNumber,
      totalDossiers: MONTHLY_DOSSIERS_PER_BOX,
      isMonthly: true,
      isNew,
      records: list.length,
      folders,
    });
  }

  // 2B) Locate / allocate weekly dossiers strictly inside boxes >= weeklyMinBoxNum (C15+)
  const dossierByWeek = new Map<string, Dossier>();
  dossiers
    .filter(d => boxNum(d.boxId) >= weeklyMinBoxNum && d.weekStart)
    .forEach(d => dossierByWeek.set(d.weekStart!, d));

  const lastExistingWeek = [...dossierByWeek.keys()].sort().pop();
  const orderedWeeklyBoxes = () =>
    boxes.filter(b => boxNum(b.boxCode) >= weeklyMinBoxNum).sort((a, b) => boxNum(a.boxCode) - boxNum(b.boxCode));

  const newWeeks = [...weeklyBuckets.keys()].filter(w => !dossierByWeek.has(w)).sort();
  if (lastExistingWeek && newWeeks.length && newWeeks[0] < lastExistingWeek) {
    warnings.push(`أسابيع جديدة أقدم من آخر أسبوع مؤرشف (${lastExistingWeek}) — تم وضعها في آخر الدوسيهات المتاحة.`);
  }

  for (const wk of newWeeks) {
    const bucket = weeklyBuckets.get(wk)!;
    const lastWeeklyBox = orderedWeeklyBoxes().pop();
    const used = lastWeeklyBox ? dossiers.filter(d => d.boxId === lastWeeklyBox.boxCode).length : DOSSIERS_PER_BOX;
    let boxCode: string;
    let dnum: number;

    if (lastWeeklyBox && used < DOSSIERS_PER_BOX) {
      boxCode = lastWeeklyBox.boxCode;
      dnum = used + 1;
    } else {
      const nextNum = lastWeeklyBox ? boxNum(lastWeeklyBox.boxCode) + 1 : weeklyMinBoxNum;
      boxCode = `${prefix}${nextNum}`;
      dnum = 1;
      ensureBox(boxCode, DOSSIERS_PER_BOX);
    }

    const d: Dossier = {
      id: `${boxCode}-${dnum}`,
      boxId: boxCode,
      dossierNumber: dnum,
      fromJobId: 0,
      toJobId: 0,
      totalProjects: 0,
      archivedCount: 0,
      missingCount: 0,
      pendingCount: 0,
      status: 'Pending',
      weekStart: bucket.weekStart,
      weekEnd: bucket.weekEnd,
    };
    dossiers.push(d);
    dossierByWeek.set(wk, d);
  }

  // 3) Populate weekly dossiers
  for (const wk of [...weeklyBuckets.keys()].sort()) {
    const bucket = weeklyBuckets.get(wk)!;
    const d = dossierByWeek.get(wk)!;
    let slot = projects.filter(p => p.boxId === d.boxId && p.dossierNumber === d.dossierNumber).length;
    let folders = 0;

    for (const r of bucket.rows) {
      const rowStatus = r.status || 'Pending';
      projects.push({
        jobId: nextJobId++,
        dateApproved: r.startDate,
        status: rowStatus,
        boxId: d.boxId,
        dossierNumber: d.dossierNumber,
        slotIndex: slot++,
        firstImportDate: now,
        lastUpdateDate: now,
        sourceUpload: opts.fileName,
        uploadId,
        statusHistory: [{ status: rowStatus, timestamp: now, note: 'Imported from plan', user: opts.userName }],
        branchName: r.branchName,
        branchCode: r.branchCode,
        shipmentNo: r.shipmentNo,
        folderCount: r.folderCount,
        region: r.region,
        wing: r.wing,
        startDate: r.startDate,
        endDate: r.endDate,
        weekStart: wk,
      });
      folders += r.folderCount;
    }

    touchedBoxes.add(d.boxId);
    previews.push({
      weekStart: bucket.weekStart,
      weekEnd: bucket.weekEnd,
      boxCode: d.boxId,
      dossierNumber: d.dossierNumber,
      totalDossiers: DOSSIERS_PER_BOX,
      isMonthly: false,
      isNew: newWeeks.includes(wk),
      records: bucket.rows.length,
      folders,
    });
  }

  // Sort previews cleanly by box number then dossier number
  previews.sort((a, b) => boxNum(a.boxCode) - boxNum(b.boxCode) || a.dossierNumber - b.dossierNumber);

  // 4) Recompute counters / job ranges for every dossier + box
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

  const upload: UploadRecord = {
    id: uploadId,
    fileName: opts.fileName,
    userName: opts.userName,
    timestamp: now,
    totalRows: rows.length + opts.rejectedCount,
    importedCount,
    duplicateCount,
    rejectedCount: opts.rejectedCount + skippedBeforeStartCount,
    errors: warnings,
    status:
      duplicateCount || opts.rejectedCount || skippedBeforeStartCount || warnings.length
        ? 'Completed with warnings'
        : 'Completed',
  };

  return {
    store: { ...existing, boxes, dossiers, projects, uploadHistory: [upload, ...existing.uploadHistory] },
    weeks: previews,
    importedCount,
    duplicateCount,
    weekendCount,
    skippedBeforeStartCount,
    warnings,
  };
}

