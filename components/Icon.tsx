// Icônes dessinées d'un seul trait, à la place des emoji.

const PATHS = {
  home: <><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10v9h11v-9" /><path d="M10 19v-5h4v5" /></>,
  trophy: <><path d="M8 4h8v6a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" /><path d="M12 14v3M9 20h6M10 20l.5-3h3l.5 3" /></>,
  ball: <><circle cx="12" cy="12" r="8" /><path d="M4 12h16M12 4v16" /><path d="M6.4 6.4a8 8 0 0 1 0 11.2M17.6 6.4a8 8 0 0 0 0 11.2" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
} as const;

export type IconName = keyof typeof PATHS;

export default function Icon({ name, size = 24 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
