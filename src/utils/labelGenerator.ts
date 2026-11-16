/**
 * ARMS - Archive Reports Management System
 * Approved 100 x 50 mm Thermal Label Engine (jsPDF + Vector Canvas)
 * Strictly conforms to approved archive label specification coordinate specifications.
 */

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { Dossier, LabelData } from '../types';
import logoDark from '../assets/logo-dark.png?inline';
import armsLogoDark from '../assets/arms-logo-dark.png?inline';

/** White-text Intercom logo placed on the left side of the black label header (source is 250 x 56 px). */
export const LABEL_LOGO = { src: logoDark, x: 6.4, y: 4.1, h: 6.4, w: 6.4 * (250 / 56) } as const;

/** White-text ARMS logo placed on the right side of the black label header (source is 600 x 166 px). */
const ARMS_H = 6.6;
const ARMS_W = ARMS_H * (600 / 166);
export const LABEL_ARMS_LOGO = { src: armsLogoDark, x: 94.0 - ARMS_W, y: 3.9, h: ARMS_H, w: ARMS_W } as const;

/** Format ISO date string (YYYY-MM-DD) as DD/MM/YY for thermal label FROM/TO fields. */
export function formatShortLabelDate(iso?: string | null): string {
  if (!iso) return '—';
  const clean = iso.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  return `${parts[2]}/${parts[1]}/${parts[0].slice(-2)}`;
}

/** Cache for pure-white monochrome thermal label logos (B&W print clarity) */
let monochromeLogosPromise: Promise<{ intercomSrc: string; armsSrc: string }> | null = null;

function convertToPureWhitePng(src: string): Promise<string> {
  return new Promise(resolve => {
    if (typeof document === 'undefined') {
      resolve(src);
      return;
    }
    const img = new Image();
    img.onload = () => {
      try {
        const w = Math.max(1, img.naturalWidth * 2);
        const h = Math.max(1, img.naturalHeight * 2);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(src);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const imgData = ctx.getImageData(0, 0, w, h);
        const px = imgData.data;
        for (let i = 0; i < px.length; i += 4) {
          const a = px[i + 3];
          if (a > 24) {
            px[i] = 255;
            px[i + 1] = 255;
            px[i + 2] = 255;
            px[i + 3] = a >= 110 ? 255 : a;
          } else {
            px[i + 3] = 0;
          }
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(src);
      }
    };
    img.onerror = () => resolve(src);
    img.src = src;
  });
}

export function getMonochromeLabelLogos(): Promise<{ intercomSrc: string; armsSrc: string }> {
  if (!monochromeLogosPromise) {
    monochromeLogosPromise = Promise.all([
      convertToPureWhitePng(LABEL_LOGO.src),
      convertToPureWhitePng(LABEL_ARMS_LOGO.src),
    ]).then(([intercomSrc, armsSrc]) => ({ intercomSrc, armsSrc }));
  }
  return monochromeLogosPromise;
}

/**
 * Generate standard QR code payload text matching the specification exactly
 */
export function getQRCodeText(data: LabelData): string {
  const fromVal = data.fromLabel || String(data.fromJobId);
  const toVal = data.toLabel || String(data.toJobId);
  if (data.type === 'box') {
    return `BOX: ${data.boxCode}\nFROM: ${fromVal}\nTO: ${toVal}`;
  } else {
    return `BOX: ${data.boxCode}\nDOSSIER: ${data.dossierNumber || 1}\nOF: ${data.totalDossiers || 6}\nFROM: ${fromVal}\nTO: ${toVal}`;
  }
}

/**
 * Generate a QR code as Data URL (PNG)
 */
export async function generateQRDataURL(text: string): Promise<string> {
  return await QRCode.toDataURL(text, {
    margin: 0,
    width: 256,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
}

/**
 * Draws the corner brackets around the QR code exactly as specified
 */
function drawCornerBrackets(pdf: jsPDF, x: number, y: number, w: number, h: number, len: number) {
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.6);

  // Top-left
  pdf.line(x, y + len, x, y);
  pdf.line(x, y, x + len, y);

  // Top-right
  pdf.line(x + w - len, y, x + w, y);
  pdf.line(x + w, y, x + w, y + len);

  // Bottom-left
  pdf.line(x, y + h - len, x, y + h);
  pdf.line(x, y + h, x + len, y + h);

  // Bottom-right
  pdf.line(x + w - len, y + h, x + w, y + h);
  pdf.line(x + w, y + h - len, x + w, y + h);
}

/**
 * Renders a single 100 x 50 mm label on a jsPDF page
 */
export async function renderLabelOnPDF(pdf: jsPDF, data: LabelData) {
  // Clean white background
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, 100, 50, 'F');

  // 1. Outer Border: rounded rectangle, X: 3.5 to 96.5, Y: 2.5 to 47.5
  const outerX = 3.5;
  const outerY = 2.5;
  const outerW = 93;
  const outerH = 45;
  const outerR = 2.6;

  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.65);
  pdf.roundedRect(outerX, outerY, outerW, outerH, outerR, outerR, 'S');

  // 2. Header: Solid black bar top of the frame, Y: 2.5 to 11.8
  const headerH = 9.3;
  pdf.setFillColor(0, 0, 0);

  // Clip to outer frame rounded top corners
  pdf.roundedRect(outerX, outerY, outerW, headerH, outerR, outerR, 'F');
  // Fill the bottom squared corner of header bar
  pdf.rect(outerX, outerY + outerR, outerW, headerH - outerR, 'F');

  // Pure B&W (solid white on solid black) Intercom logo (left) & ARMS logo (right)
  const { intercomSrc, armsSrc } = await getMonochromeLabelLogos();
  pdf.addImage(intercomSrc, 'PNG', LABEL_LOGO.x, LABEL_LOGO.y, LABEL_LOGO.w, LABEL_LOGO.h);
  pdf.addImage(
    armsSrc,
    'PNG',
    LABEL_ARMS_LOGO.x,
    LABEL_ARMS_LOGO.y,
    LABEL_ARMS_LOGO.w,
    LABEL_ARMS_LOGO.h
  );

  // 3. Left Box: rounded rectangle, X: 6.4 to 47.9, Y: 13.8 to 45.0
  const leftX = 6.4;
  const leftY = 13.8;
  const leftW = 41.5;
  const leftH = 31.2;
  const leftR = 2.0;

  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.6);
  pdf.setFillColor(255, 255, 255);
  pdf.roundedRect(leftX, leftY, leftW, leftH, leftR, leftR, 'S');

  // Horizontal divider inside left box at Y = 34.2
  const divY = 34.2;
  pdf.setLineWidth(0.55);
  pdf.line(leftX, divY, leftX + leftW, divY);

  // Contents of Left Box
  if (data.type === 'box') {
    // Upper section: Huge Box Code (e.g. "D42")
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(42);
    pdf.text(data.boxCode, leftX + leftW / 2, 28.8, { align: 'center' });

    // Lower section: "ARCHIVE BOX" bold
    pdf.setFontSize(9.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text('A R C H I V E   B O X', leftX + leftW / 2, 41.3, { align: 'center' });
  } else {
    // Dossier Label
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('Dossier', leftX + leftW / 2, 18.2, { align: 'center' });

    pdf.setFontSize(44);
    pdf.setFont('helvetica', 'bold');
    pdf.text(String(data.dossierNumber || 1), leftX + leftW / 2, 31.8, { align: 'center' });

    // Lower section: "Box" bold, and below it larger Box code bold
    pdf.setFontSize(8.5);
    pdf.text('Box', leftX + leftW / 2, 38.0, { align: 'center' });

    pdf.setFontSize(15.5);
    pdf.text(data.boxCode, leftX + leftW / 2, 43.5, { align: 'center' });
  }

  // 4. QR Code: centered directly over Range Box (center X = 72.45)
  const qrX = 63.45;
  const qrY = 14.4;
  const qrSize = 18.0;
  const qrBracketPad = 1.5;

  // Corner brackets around QR code
  drawCornerBrackets(
    pdf,
    qrX - qrBracketPad,
    qrY - qrBracketPad,
    qrSize + qrBracketPad * 2,
    qrSize + qrBracketPad * 2,
    3.2
  );

  const qrText = getQRCodeText(data);
  try {
    const qrDataUrl = await generateQRDataURL(qrText);
    pdf.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize);
  } catch (err) {
    console.error('Failed generating QR code for label:', err);
  }

  // 5. Range Box (FROM / TO): rounded rectangle, X: 50.5 to 94.4, Y: 35.0 to 45.0
  const rangeX = 50.5;
  const rangeY = 35.0;
  const rangeW = 43.9;
  const rangeH = 10.0;
  const rangeR = 1.8;
  const rangeMidX = 72.45;

  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.6);
  pdf.roundedRect(rangeX, rangeY, rangeW, rangeH, rangeR, rangeR, 'S');

  // Vertical dividing line at X = 72.45
  pdf.setLineWidth(0.55);
  pdf.line(rangeMidX, rangeY, rangeMidX, rangeY + rangeH);

  const fromText = data.fromLabel || String(data.fromJobId);
  const toText = data.toLabel || String(data.toJobId);
  const fromFontPt = fromText.length > 6 ? 11.2 : 16;
  const toFontPt = toText.length > 6 ? 11.2 : 16;
  const fromBaselineY = fromText.length > 6 ? 43.2 : 43.6;
  const toBaselineY = toText.length > 6 ? 43.2 : 43.6;

  // FROM Section
  pdf.setTextColor(0, 0, 0);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.0);
  const leftHalfCenter = rangeX + (rangeMidX - rangeX) / 2;
  pdf.text('FROM', leftHalfCenter, 38.2, { align: 'center' });

  pdf.setFontSize(fromFontPt);
  pdf.text(fromText, leftHalfCenter, fromBaselineY, { align: 'center' });

  // TO Section
  const rightHalfCenter = rangeMidX + (rangeX + rangeW - rangeMidX) / 2;
  pdf.setFontSize(8.0);
  pdf.text('TO', rightHalfCenter, 38.2, { align: 'center' });

  pdf.setFontSize(toFontPt);
  pdf.text(toText, rightHalfCenter, toBaselineY, { align: 'center' });
}

/**
 * Generate full 7-page PDF (1 Box Label + 6 Dossier Labels) or single label PDF
 */
export async function generateLabelsPDF(labels: LabelData[]): Promise<jsPDF> {
  // Page size 100 x 50 mm, landscape
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [50, 100], // height, width
  });

  for (let i = 0; i < labels.length; i++) {
    if (i > 0) {
      pdf.addPage([50, 100], 'landscape');
    }
    await renderLabelOnPDF(pdf, labels[i]);
  }

  return pdf;
}

/**
 * Helper to build the standard 7-label package for a box
 */
export function buildBoxLabelPackage(boxCode: string, firstJobId: number): LabelData[] {
  const labels: LabelData[] = [];

  // Page 1: Box Label (from firstJobId to firstJobId + 299)
  labels.push({
    type: 'box',
    boxCode,
    fromJobId: firstJobId,
    toJobId: firstJobId + 299,
  });

  // Pages 2-7: 6 Dossiers (50 projects each)
  for (let d = 1; d <= 6; d++) {
    const dFrom = firstJobId + (d - 1) * 50;
    const dTo = dFrom + 49;
    labels.push({
      type: 'dossier',
      boxCode,
      dossierNumber: d,
      totalDossiers: 6,
      fromJobId: dFrom,
      toJobId: dTo,
    });
  }

  return labels;
}

const addDaysIso = (isoDate: string, days: number): string => {
  const parts = isoDate.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return isoDate;
  const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]) + days * 86400000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
};

/**
 * Helper to build a 7-label package for a weekly box (C-series), formatting FROM/TO as DD/MM/YY.
 */
export function buildWeeklyBoxLabelPackage(
  boxCode: string,
  boxDossiers: Dossier[],
  fallbackWeek1Start?: string
): LabelData[] {
  const sorted = [...boxDossiers].sort((a, b) => a.dossierNumber - b.dossierNumber);
  const todayIso = new Date().toISOString().slice(0, 10);
  const firstKnownStart = sorted.find(d => d.weekStart)?.weekStart;
  const baseStart = fallbackWeek1Start || firstKnownStart || todayIso;

  const dossierLabels: LabelData[] = [];
  for (let d = 1; d <= 6; d++) {
    const existing = sorted.find(x => x.dossierNumber === d);
    const wStart = existing?.weekStart || addDaysIso(baseStart, (d - 1) * 7);
    const wEnd = existing?.weekEnd || addDaysIso(wStart, 4);
    dossierLabels.push({
      type: 'dossier',
      boxCode,
      dossierNumber: d,
      totalDossiers: 6,
      fromJobId: existing?.fromJobId || d,
      toJobId: existing?.toJobId || d,
      fromLabel: formatShortLabelDate(wStart),
      toLabel: formatShortLabelDate(wEnd),
    });
  }

  const boxFromIso = sorted[0]?.weekStart || baseStart;
  const lastWithDate = [...sorted].reverse().find(d => d.weekEnd || d.weekStart);
  const boxToIso =
    lastWithDate?.weekEnd ||
    (lastWithDate?.weekStart ? addDaysIso(lastWithDate.weekStart, 4) : addDaysIso(addDaysIso(baseStart, 5 * 7), 4));

  const boxLabel: LabelData = {
    type: 'box',
    boxCode,
    fromJobId: sorted[0]?.fromJobId || 1,
    toJobId: sorted[sorted.length - 1]?.toJobId || 1,
    fromLabel: formatShortLabelDate(boxFromIso),
    toLabel: formatShortLabelDate(boxToIso),
  };

  return [boxLabel, ...dossierLabels];
}
