import { PalletReport } from '../types';
import { normalizePalletDate, normalizePalletToken } from './palletUtils';

/**
 * Pallet Archive Hierarchy Rules:
 * - Boxes start at P10 (boxNumber = 10 -> P10, P11, P12, ...).
 * - Each Box contains strictly 6 Monthly Dossiers (1..6).
 * - Box P10 starts at Month 8 (August):
 *   - Dossier 1 (P10-1) = Month 8 (August)
 *   - Dossier 2 (P10-2) = Month 9 (September)
 *   - Dossier 3 (P10-3) = Month 10 (October)
 *   - Dossier 4 (P10-4) = Month 11 (November)
 *   - Dossier 5 (P10-5) = Month 12 (December)
 *   - Dossier 6 (P10-6) = Month 1 of next year (January)
 *   - P11 covers Feb..Jul, P12 covers Aug..Jan, etc.
 */
export const PALLET_START_BOX_NUMBER = 10;
export const PALLET_DOSSIERS_PER_BOX = 6;
export const PALLET_START_MONTH = 8; // August

const pad2 = (n: number) => String(n).padStart(2, '0');

export function monthBoundsIso(year: number, month1to12: number): {
  year: number;
  month: number;
  monthKey: string;
  start: string;
  end: string;
} {
  const norm = new Date(Date.UTC(year, month1to12 - 1, 1));
  const y = norm.getUTCFullYear();
  const m = norm.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    year: y,
    month: m,
    monthKey: `${y}-${pad2(m)}`,
    start: `${y}-${pad2(m)}-01`,
    end: `${y}-${pad2(m)}-${pad2(lastDay)}`,
  };
}

export function safeMonthLabel(key: string, isAr = true): string {
  if (!key) return isAr ? 'بدون تاريخ' : 'No Date';
  const match = /^(\d{4})-(\d{1,2})$/.exec(key.trim());
  if (!match) return key;
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return key;
  const dt = new Date(y, m - 1, 1);
  if (Number.isNaN(dt.getTime())) return key;
  try {
    return new Intl.DateTimeFormat(isAr ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' }).format(dt);
  } catch {
    return key;
  }
}

export function parsePalletMonthKey(r: Pick<PalletReport, 'archiveMonth' | 'deliveryDate' | 'inspectionDate'>): string {
  const raw = String(r.archiveMonth || '').trim();
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const dt = normalizePalletDate(r);
  if (dt.length >= 7 && /^\d{4}-\d{2}/.test(dt)) return dt.slice(0, 7);
  return '';
}

export interface PalletGroupItem {
  id: string;
  palletCode: string;
  deliveryDate: string;
  boxCode: string;
  dossierId: string;
  dossierNumber: number;
  monthKey: string;
  jobCodes: string[];
  jobsCount: number;
  totalBoxes: number;
  recordsCount: number;
  deliveredBy: string;
  deliveryStatus: string;
  capacityStatus: 'normal' | 'over-capacity';
  rows: PalletReport[];
}

export interface PalletDossierItem {
  id: string; // e.g. P10-1
  dossierNumber: number; // 1..6
  dossierCode: string; // e.g. P10-1
  boxCode: string; // e.g. P10
  boxNumber: number; // e.g. 10
  monthKey: string; // e.g. 2025-08
  periodStart: string; // YYYY-MM-01
  periodEnd: string; // YYYY-MM-lastDay
  minDate: string; // Actual earliest record date or periodStart
  maxDate: string; // Actual latest record date or periodEnd
  rows: PalletReport[];
  pallets: PalletGroupItem[];
  palletsCount: number;
  uniquePalletCodesCount: number;
  totalBoxes: number;
  overCapacityCount: number;
  status: 'Archived' | 'Over Capacity' | 'Empty';
}

export interface PalletBoxItem {
  id: string; // P10
  boxCode: string; // P10
  boxNumber: number; // 10
  periodStart: string;
  periodEnd: string;
  minDate: string;
  maxDate: string;
  totalDossiers: number; // 6
  filledDossiers: number;
  dossiers: PalletDossierItem[];
  palletsCount: number;
  uniquePalletCodesCount: number;
  totalBoxes: number;
  recordsCount: number;
  overCapacityCount: number;
  status: 'Archived' | 'Inprogress';
}

export interface PalletRowMeta {
  boxCode: string;
  boxNumber: number;
  dossierId: string;
  dossierNumber: number;
  monthKey: string;
}

export interface PalletBoxPlan {
  boxes: PalletBoxItem[];
  dossiers: PalletDossierItem[];
  filledDossiers: PalletDossierItem[];
  pallets: PalletGroupItem[];
  undatedRows: PalletReport[];
  rowMetaById: Map<string, PalletRowMeta>;
  anchorYear: number;
}

function buildPalletGroupsForRows(
  rows: PalletReport[],
  boxCode: string,
  dossierId: string,
  dossierNumber: number,
  monthKey: string
): PalletGroupItem[] {
  const map = new Map<string, PalletReport[]>();
  for (const r of rows) {
    const dt = normalizePalletDate(r);
    const key = `${normalizePalletToken(r.palletCode)}|${dt}`;
    const list = map.get(key);
    if (list) list.push(r);
    else map.set(key, [r]);
  }

  const groups: PalletGroupItem[] = [];
  for (const [key, grpRows] of map.entries()) {
    const sortedRows = [...grpRows].sort((a, b) =>
      String(a.jobCode || a.linkedBoxes || '').localeCompare(String(b.jobCode || b.linkedBoxes || ''))
    );
    const palletCode = (sortedRows[0]?.palletCode || '').trim() || '—';
    const deliveryDate = normalizePalletDate(sortedRows[0]);
    const totalBoxes = sortedRows.reduce((s, r) => s + Number(r.boxesCount || r.boxCount || 0), 0);

    const jobSet = new Set<string>();
    const deliveredSet = new Set<string>();
    const statusSet = new Set<string>();
    for (const r of sortedRows) {
      const jc = String(r.jobCode || r.linkedBoxes || '').trim();
      if (jc) jobSet.add(jc);
      const db = String(r.deliveredBy || r.custodian || '').trim();
      if (db) deliveredSet.add(db);
      const st = String(r.deliveryStatus || '').trim();
      if (st) statusSet.add(st);
    }

    groups.push({
      id: `${dossierId}|${key}`,
      palletCode,
      deliveryDate,
      boxCode,
      dossierId,
      dossierNumber,
      monthKey,
      jobCodes: Array.from(jobSet),
      jobsCount: jobSet.size || sortedRows.length,
      totalBoxes,
      recordsCount: sortedRows.length,
      deliveredBy: Array.from(deliveredSet).join(', ') || '—',
      deliveryStatus: Array.from(statusSet).join(', ') || '—',
      capacityStatus: totalBoxes > 36 ? 'over-capacity' : 'normal',
      rows: sortedRows,
    });
  }

  return groups.sort(
    (a, b) => a.deliveryDate.localeCompare(b.deliveryDate) || a.palletCode.localeCompare(b.palletCode)
  );
}

/**
 * Builds the complete 4-level Pallet Handover Archive Plan:
 * Boxes (P10, P11, ...) -> 6 Monthly Dossiers per Box (starting Month 8 = August at P10-1) -> Pallets -> Records.
 */
export function buildPalletBoxPlan(
  reports: PalletReport[],
  explicitAnchorYear?: number
): PalletBoxPlan {
  const fallbackYear = new Date().getFullYear();
  if (!reports || reports.length === 0) {
    return {
      boxes: [],
      dossiers: [],
      filledDossiers: [],
      pallets: [],
      undatedRows: [],
      rowMetaById: new Map(),
      anchorYear: explicitAnchorYear || fallbackYear,
    };
  }

  const rowsByMonth = new Map<string, PalletReport[]>();
  const undatedRows: PalletReport[] = [];
  const validYearMonths: { year: number; month: number; idx: number; key: string }[] = [];
  const seenMonthKeys = new Set<string>();

  for (const r of reports) {
    const mKey = parsePalletMonthKey(r);
    if (!mKey) {
      undatedRows.push(r);
      continue;
    }
    const existing = rowsByMonth.get(mKey);
    if (existing) existing.push(r);
    else rowsByMonth.set(mKey, [r]);

    if (!seenMonthKeys.has(mKey)) {
      seenMonthKeys.add(mKey);
      const year = Number(mKey.slice(0, 4));
      const month = Number(mKey.slice(5, 7));
      if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
        validYearMonths.push({
          year,
          month,
          idx: year * 12 + (month - 1),
          key: mKey,
        });
      }
    }
  }

  if (validYearMonths.length === 0) {
    return {
      boxes: [],
      dossiers: [],
      filledDossiers: [],
      pallets: [],
      undatedRows,
      rowMetaById: new Map(),
      anchorYear: explicitAnchorYear || fallbackYear,
    };
  }

  validYearMonths.sort((a, b) => a.idx - b.idx);
  const earliest = validYearMonths[0];
  const hasAugOrLaterInEarliestYear = validYearMonths.some(
    ym => ym.year === earliest.year && ym.month >= PALLET_START_MONTH
  );
  const anchorYear =
    explicitAnchorYear ??
    (earliest.month >= PALLET_START_MONTH || hasAugOrLaterInEarliestYear
      ? earliest.year
      : earliest.year - 1);

  // P10-1 starts at August (month 8 -> zero-based month 7) of anchorYear
  const anchorMonthIdx = anchorYear * 12 + (PALLET_START_MONTH - 1);

  const boxNumbersNeeded = new Set<number>();
  for (const ym of validYearMonths) {
    const diff = ym.idx - anchorMonthIdx;
    const boxNum = PALLET_START_BOX_NUMBER + Math.floor(diff / PALLET_DOSSIERS_PER_BOX);
    boxNumbersNeeded.add(boxNum);
  }

  const sortedBoxNumbers = Array.from(boxNumbersNeeded).sort((a, b) => a - b);
  const boxes: PalletBoxItem[] = [];
  const allDossiers: PalletDossierItem[] = [];
  const filledDossiers: PalletDossierItem[] = [];
  const allPallets: PalletGroupItem[] = [];
  const rowMetaById = new Map<string, PalletRowMeta>();

  for (const boxNumber of sortedBoxNumbers) {
    const boxCode = `P${boxNumber}`;
    const boxOffset = boxNumber - PALLET_START_BOX_NUMBER;
    const boxDossiers: PalletDossierItem[] = [];

    let boxRecordsCount = 0;
    let boxTotalBoxes = 0;
    let boxMinDate = '';
    let boxMaxDate = '';
    let boxOverCapacityCount = 0;
    let boxFilledDossiers = 0;
    const boxPalletHandoverKeys = new Set<string>();
    const boxUniquePalletTokens = new Set<string>();

    for (let dNum = 1; dNum <= PALLET_DOSSIERS_PER_BOX; dNum++) {
      const slotMonthIdx = anchorMonthIdx + boxOffset * PALLET_DOSSIERS_PER_BOX + (dNum - 1);
      const slotYear = Math.floor(slotMonthIdx / 12);
      const slotMonth = ((slotMonthIdx % 12) + 12) % 12 + 1;
      const bounds = monthBoundsIso(slotYear, slotMonth);
      const dossierId = `${boxCode}-${dNum}`;

      const rawRows = rowsByMonth.get(bounds.monthKey) || [];
      const rows = [...rawRows].sort((a, b) => {
        const da = normalizePalletDate(a);
        const db = normalizePalletDate(b);
        return da.localeCompare(db) || a.palletCode.localeCompare(b.palletCode);
      });

      const pallets = buildPalletGroupsForRows(rows, boxCode, dossierId, dNum, bounds.monthKey);
      const uniqueTokens = new Set<string>();
      const overSet = new Set<string>();
      let minDt = '';
      let maxDt = '';
      let dossierTotalBoxes = 0;

      for (const r of rows) {
        const dt = normalizePalletDate(r);
        if (dt) {
          if (!minDt || dt < minDt) minDt = dt;
          if (!maxDt || dt > maxDt) maxDt = dt;
          if (!boxMinDate || dt < boxMinDate) boxMinDate = dt;
          if (!boxMaxDate || dt > boxMaxDate) boxMaxDate = dt;
        }
        dossierTotalBoxes += Number(r.boxesCount || r.boxCount || 0);
        const pTok = normalizePalletToken(r.palletCode);
        if (pTok) {
          uniqueTokens.add(pTok);
          boxUniquePalletTokens.add(pTok);
          boxPalletHandoverKeys.add(`${pTok}|${dt}`);
        }
        if (r.capacityStatus === 'over-capacity') {
          overSet.add(`${pTok}|${dt}`);
        }
        rowMetaById.set(r.id, {
          boxCode,
          boxNumber,
          dossierId,
          dossierNumber: dNum,
          monthKey: bounds.monthKey,
        });
      }

      const dossierStatus: PalletDossierItem['status'] =
        rows.length === 0 ? 'Empty' : overSet.size > 0 ? 'Over Capacity' : 'Archived';

      const dossierItem: PalletDossierItem = {
        id: dossierId,
        dossierNumber: dNum,
        dossierCode: dossierId,
        boxCode,
        boxNumber,
        monthKey: bounds.monthKey,
        periodStart: bounds.start,
        periodEnd: bounds.end,
        minDate: minDt || bounds.start,
        maxDate: maxDt || bounds.end,
        rows,
        pallets,
        palletsCount: pallets.length,
        uniquePalletCodesCount: uniqueTokens.size,
        totalBoxes: dossierTotalBoxes,
        overCapacityCount: overSet.size,
        status: dossierStatus,
      };

      boxDossiers.push(dossierItem);
      allDossiers.push(dossierItem);
      if (rows.length > 0) {
        filledDossiers.push(dossierItem);
        boxFilledDossiers += 1;
      }
      allPallets.push(...pallets);

      boxRecordsCount += rows.length;
      boxTotalBoxes += dossierTotalBoxes;
      boxOverCapacityCount += overSet.size;
    }

    const boxPeriodStart = boxDossiers[0]?.periodStart || '';
    const boxPeriodEnd = boxDossiers[boxDossiers.length - 1]?.periodEnd || '';

    boxes.push({
      id: boxCode,
      boxCode,
      boxNumber,
      periodStart: boxPeriodStart,
      periodEnd: boxPeriodEnd,
      minDate: boxMinDate || boxPeriodStart,
      maxDate: boxMaxDate || boxPeriodEnd,
      totalDossiers: PALLET_DOSSIERS_PER_BOX,
      filledDossiers: boxFilledDossiers,
      dossiers: boxDossiers,
      palletsCount: boxPalletHandoverKeys.size,
      uniquePalletCodesCount: boxUniquePalletTokens.size,
      totalBoxes: boxTotalBoxes,
      recordsCount: boxRecordsCount,
      overCapacityCount: boxOverCapacityCount,
      status: boxFilledDossiers === PALLET_DOSSIERS_PER_BOX ? 'Archived' : 'Inprogress',
    });
  }

  return {
    boxes,
    dossiers: allDossiers,
    filledDossiers,
    pallets: allPallets,
    undatedRows,
    rowMetaById,
    anchorYear,
  };
}
