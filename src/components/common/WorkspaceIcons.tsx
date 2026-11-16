import React from 'react';

interface IconProps {
  className?: string;
  strokeWidth?: number;
}

/** Crisp report paper sheet with folded corner and summary bars */
export const ReportPaperIcon: React.FC<IconProps> = ({ className = 'w-6 h-6', strokeWidth = 1.75 }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M14 2.5H6.5A2 2 0 0 0 4.5 4.5v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8l-5.5-5.5Z" />
    <path d="M14 2.5V8h5.5" />
    <path d="M8.5 11.5h7" />
    <path d="M8.5 14.75h4.5" />
    <path d="M8.5 18h7" />
  </svg>
);

/** Crisp warehouse pallet base with stacked archive boxes on top */
export const PalletBoxesIcon: React.FC<IconProps> = ({ className = 'w-6 h-6', strokeWidth = 1.75 }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    {/* Top stacked box */}
    <rect x="8.5" y="3" width="7" height="5.25" rx="0.8" />
    <path d="M11 3v2h2V3" />
    {/* Bottom row boxes sitting on pallet */}
    <rect x="4" y="8.25" width="8" height="6.25" rx="0.8" />
    <rect x="12" y="8.25" width="8" height="6.25" rx="0.8" />
    <path d="M7 8.25v2h2v-2" />
    <path d="M15 8.25v2h2v-2" />
    {/* Wooden pallet deck + support blocks + bottom runner */}
    <path d="M2.5 16.5h19" />
    <path d="M2.5 20.5h19" />
    <path d="M4.5 16.5v4" />
    <path d="M12 16.5v4" />
    <path d="M19.5 16.5v4" />
  </svg>
);
