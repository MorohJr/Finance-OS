/** Small inline stroke icon set (no icon library needed, works offline). */
const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  list: 'M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01',
  plus: 'M12 5v14M5 12h14',
  calendar: 'M4 7a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2zM16 3v4M8 3v4M4 11h16',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  chevron: 'M15 6l-6 6 6 6',
  back: 'M9 6l6 6-6 6',
  download: 'M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 11l5 5 5-5M12 4v12',
  upload: 'M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 9l5-5 5 5M12 4v12',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  wallet: 'M4 7a2 2 0 012-2h11v4M4 7v10a2 2 0 002 2h13V9H6a2 2 0 01-2-2zM16 14h.01',
  card: 'M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 10h18M7 15h3',
  loan: 'M12 3v18M17 7H9.5a3 3 0 000 6h5a3 3 0 010 6H6',
  check: 'M4 7h16v10H4zM7 11h6M7 14h3',
  chart: 'M4 19V5M4 19h16M8 15l3-4 3 2 5-6',
  pension: 'M12 3a4 4 0 014 4v1H8V7a4 4 0 014-4zM5 8h14l-1 12H6z',
  salary: 'M4 7h16v12H4zM9 7V5h6v2',
  business: 'M3 21h18M5 21V7l7-4 7 4v14M9 10h1M14 10h1M9 14h1M14 14h1',
  percent: 'M19 5L5 19M7 7h.01M17 17h.01',
  report: 'M6 3h9l5 5v13H6zM14 3v5h5M9 13h6M9 17h4',
  import: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  settings: 'M12 9a3 3 0 100 6 3 3 0 000-6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  target: 'M12 12m-8 0a8 8 0 1016 0 8 8 0 10-16 0M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0',
  repeat: 'M4 12V9a3 3 0 013-3h13l-3-3M20 12v3a3 3 0 01-3 3H4l3 3',
  gift: 'M4 8h16v4H4zM6 12v9h12v-9M12 8v13M12 8S10 3 7.5 4.5 9 8 12 8zm0 0s2-5 4.5-3.5S15 8 12 8z',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  x: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 9v4M12 17h.01M10.3 3.9L2.4 18a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  share: 'M12 3v12M8 7l4-4 4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  search: 'M10 17a7 7 0 100-14 7 7 0 000 14zM21 21l-6-6',
  filter: 'M4 5h16l-6 8v5l-4 2v-7z',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 118 0v4',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3',
  tag: 'M3 12V4h8l10 10-8 8zM7.5 7.5h.01',
  folder: 'M4 6h5l2 2h9v11H4z',
  done: 'M5 12l5 5L20 7',
  rule: 'M4 6h10M4 12h16M4 18h7M17 4l3 3-3 3',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
