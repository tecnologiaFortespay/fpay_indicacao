const paths: Record<string, React.ReactNode> = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
      <path d="M9 21v-8h6v8" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5v2" />
    </>
  ),
  commercial: <path d="M4 20V10m8 10V4m8 16v-7M2 20h20" />,
  calculation: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 12h1m6 0h1m-8 5h1m6 0h1" />
    </>
  ),
  finance: (
    <>
      <rect x="3" y="5" width="18" height="15" rx="2" />
      <path d="M3 9h18m-6 4h6v4h-6zM6 5V3h12v2" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16M8 4v6m8 4v6" />
      <circle cx="8" cy="7" r="2" />
      <circle cx="16" cy="17" r="2" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  theme: <path d="M20.4 13a8.5 8.5 0 0 1-9.4-9.4A8.5 8.5 0 1 0 20.4 13Z" />,
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
};

export function OrbitaIcon({ name, className = "" }: { name: string; className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.home}
    </svg>
  );
}
