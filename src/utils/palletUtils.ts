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

export function deduplicatePalletReports(rows: PalletReport[]): {
  records: PalletReport[];
  removedCount: number;
} {
  const seen = new Set<string>();
  const unique: PalletReport[] = [];
  let removedCount = 0;

  for (const row of rows) {
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
