import { PalletReport } from '../types';

export const normalizePalletToken = (v: unknown): string =>
  String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();

export const normalizePalletDate = (r: Pick<PalletReport, 'deliveryDate' | 'inspectionDate'>): string =>
  String(r.deliveryDate || r.inspectionDate || '').trim().slice(0, 10);

export const palletRecordDedupKey = (
  r: Pick<
    PalletReport,
    'palletCode' | 'jobCode' | 'linkedBoxes' | 'deliveryDate' | 'inspectionDate' | 'boxesCount' | 'boxCount'
  >
): string =>
  `${normalizePalletToken(r.palletCode)}|${normalizePalletToken(r.jobCode || r.linkedBoxes)}|${normalizePalletDate(r)}|${Number(r.boxesCount || r.boxCount || 0)}`;

/** Restores full in-memory PalletReport properties from compact persisted storage objects. */
export function hydratePalletReport(raw: any): PalletReport {
  const jobCode = String(raw?.jobCode ?? raw?.linkedBoxes ?? '').trim();
  const deliveryDate = String(raw?.deliveryDate ?? raw?.inspectionDate ?? '').trim();
  const boxesCount = Number(raw?.boxesCount ?? raw?.boxCount ?? 0);
  const deliveredBy = String(raw?.deliveredBy ?? raw?.custodian ?? '').trim();
  const deliveryStatus = String(raw?.deliveryStatus ?? '').trim();

  return {
    id: String(raw?.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    palletCode: String(raw?.palletCode ?? '').trim(),
    warehouseZone: String(raw?.warehouseZone ?? ''),
    linkedBoxes: jobCode,
    boxCount: boxesCount,
    weightKg: Number(raw?.weightKg ?? 0),
    status: raw?.status || 'Dispatched',
    inspectionDate: deliveryDate,
    custodian: deliveredBy,
    notes: String(raw?.notes ?? ''),
    createdBy: String(raw?.createdBy ?? ''),
    createdAt: String(raw?.createdAt ?? ''),
    updatedAt: String(raw?.updatedAt ?? ''),
    jobCode,
    deliveryDate,
    boxesCount,
    deliveredBy,
    deliveryStatus,
    archiveMonth: String(raw?.archiveMonth || (deliveryDate.length >= 7 ? deliveryDate.slice(0, 7) : '')),
    capacityStatus: raw?.capacityStatus === 'over-capacity' ? 'over-capacity' : 'normal',
    palletTotalBoxes: raw?.palletTotalBoxes !== undefined ? Number(raw.palletTotalBoxes) : undefined,
    sourceSheet: raw?.sourceSheet ? String(raw.sourceSheet) : undefined,
    sourceRow: raw?.sourceRow !== undefined ? Number(raw.sourceRow) : undefined,
    uploadId: raw?.uploadId ? String(raw.uploadId) : undefined,
    archived: raw?.archived ?? true,
  };
}

/** Strips redundant/empty fields before network/database persistence to stay lean and avoid payload bloat. */
export function compactPalletReport(r: PalletReport): Record<string, unknown> {
  const jobCode = r.jobCode || r.linkedBoxes || '';
  const deliveryDate = r.deliveryDate || r.inspectionDate || '';
  const boxesCount = r.boxesCount || r.boxCount || 0;
  const deliveredBy = (r.deliveredBy || r.custodian || '').trim();
  const compact: Record<string, unknown> = {
    id: r.id,
    palletCode: r.palletCode,
    jobCode,
    deliveryDate,
    boxesCount,
  };
  if (deliveredBy) compact.deliveredBy = deliveredBy;
  if (r.deliveryStatus) compact.deliveryStatus = r.deliveryStatus;
  if (r.capacityStatus && r.capacityStatus !== 'normal') compact.capacityStatus = r.capacityStatus;
  if (r.palletTotalBoxes !== undefined) compact.palletTotalBoxes = r.palletTotalBoxes;
  if (r.sourceSheet) compact.sourceSheet = r.sourceSheet;
  if (r.sourceRow !== undefined) compact.sourceRow = r.sourceRow;
  if (r.uploadId) compact.uploadId = r.uploadId;
  if (r.createdAt) compact.createdAt = r.createdAt;
  return compact;
}

export function recomputePalletCapacities(rows: PalletReport[]): PalletReport[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const key = `${normalizePalletToken(r.palletCode)}|${normalizePalletDate(r)}`;
    totals.set(key, (totals.get(key) || 0) + Number(r.boxesCount || r.boxCount || 0));
  }
  return rows.map(r => {
    const key = `${normalizePalletToken(r.palletCode)}|${normalizePalletDate(r)}`;
    const total = totals.get(key) || 0;
    return {
      ...r,
      palletTotalBoxes: total,
      capacityStatus: (total > 36 ? 'over-capacity' : 'normal') as 'over-capacity' | 'normal',
    };
  });
}

export function deduplicatePalletReports(rows: any[]): {
  records: PalletReport[];
  removedCount: number;
} {
  const seen = new Set<string>();
  const unique: PalletReport[] = [];
  let removedCount = 0;

  for (const raw of rows) {
    const row = hydratePalletReport(raw);
    const key = palletRecordDedupKey(row);
    if (seen.has(key)) {
      removedCount++;
      continue;
    }
    seen.add(key);
    unique.push(row);
  }

  return {
    records: recomputePalletCapacities(unique),
    removedCount,
  };
}
