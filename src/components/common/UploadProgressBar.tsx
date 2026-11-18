import React from 'react';
import { Loader2 } from 'lucide-react';

export interface UploadProgressState {
  percent: number;
  label: string;
  detail?: string;
}

interface UploadProgressBarProps {
  progress: UploadProgressState | null;
  accent?: 'amber' | 'blue' | 'red';
  isAr?: boolean;
  className?: string;
}

const ACCENT_CLASSES: Record<'amber' | 'blue' | 'red', { border: string; bg: string; text: string; fill: string }> = {
  amber: {
    border: 'border-amber-200 dark:border-amber-900/60',
    bg: 'bg-amber-50/70 dark:bg-amber-950/20',
    text: 'text-[#B45309] dark:text-amber-300',
    fill: 'bg-[#D97706]',
  },
  blue: {
    border: 'border-blue-200 dark:border-blue-900/60',
    bg: 'bg-[#EAF2FB]/70 dark:bg-blue-950/20',
    text: 'text-[#0B56A8] dark:text-blue-300',
    fill: 'bg-[#0B56A8]',
  },
  red: {
    border: 'border-red-200 dark:border-red-900/60',
    bg: 'bg-red-50/70 dark:bg-red-950/20',
    text: 'text-[#E52225] dark:text-red-300',
    fill: 'bg-[#E52225]',
  },
};

export const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const readFileWithProgress = (
  file: File,
  onReadProgress?: (ratio: number) => void
): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = evt => {
      if (evt.lengthComputable && evt.total > 0) {
        onReadProgress?.(Math.min(1, evt.loaded / evt.total));
      }
    };
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        onReadProgress?.(1);
        resolve(reader.result);
      } else {
        reject(new Error('Failed reading file buffer'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Failed reading file'));
    reader.readAsArrayBuffer(file);
  });

export const nextUiFrame = (): Promise<void> =>
  new Promise(resolve => {
    window.setTimeout(resolve, 16);
  });

export const UploadProgressBar: React.FC<UploadProgressBarProps> = ({
  progress,
  accent = 'amber',
  isAr = true,
  className = '',
}) => {
  if (!progress) return null;
  const pct = Math.max(0, Math.min(100, Math.round(progress.percent)));
  const theme = ACCENT_CLASSES[accent];

  return (
    <div
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      dir={isAr ? 'rtl' : 'ltr'}
      className={`rounded-xl border ${theme.border} ${theme.bg} p-4 space-y-2.5 shadow-xs ${className}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Loader2 className={`w-4 h-4 animate-spin shrink-0 ${theme.text}`} />
          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
            {progress.label}
          </span>
        </div>
        <span className={`text-xs font-black tabular-nums shrink-0 ${theme.text}`}>
          {pct}%
        </span>
      </div>

      <div className="w-full h-2.5 rounded-full bg-white/90 dark:bg-neutral-900 overflow-hidden border border-slate-200/70 dark:border-neutral-800">
        <div
          className={`h-full rounded-full ${theme.fill} transition-all duration-300 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {progress.detail && (
        <div className="text-[11px] text-slate-500 dark:text-neutral-400 tabular-nums truncate">
          {progress.detail}
        </div>
      )}
    </div>
  );
};
