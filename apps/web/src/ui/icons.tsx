import type { SVGProps } from "react";

/** Minimal stroke icons drawn for Appart3D (24×24 grid, currentColor). */
type P = SVGProps<SVGSVGElement>;
const base = (props: P) => ({
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...props,
});

export const IconUndo = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);
export const IconRedo = (p: P) => (
  <svg {...base(p)}>
    <path d="m15 14 5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </svg>
);
export const IconHome = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 11 12 4l8 7" />
    <path d="M6 10v9h12v-9" />
  </svg>
);
export const IconWalls = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20V8l8-4 8 4v12" />
    <path d="M4 14h16" strokeDasharray="2 2.5" />
  </svg>
);
export const IconUpload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 15V4" />
    <path d="m7 9 5-5 5 5" />
    <path d="M5 15v4h14v-4" />
  </svg>
);
export const IconDownload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 4v11" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 15v4h14v-4" />
  </svg>
);
export const IconReset = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 12a8 8 0 1 0 2.5-5.8" />
    <path d="M4 4v4h4" />
  </svg>
);
export const IconCamera = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 8h3l2-2.5h6L17 8h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
export const IconRotateLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12a7 7 0 1 0 2-5" />
    <path d="M5 4v4h4" />
  </svg>
);
export const IconRotateRight = (p: P) => (
  <svg {...base(p)}>
    <path d="M19 12a7 7 0 1 1-2-5" />
    <path d="M19 4v4h-4" />
  </svg>
);
export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 7h14" />
    <path d="M10 7V5h4v2" />
    <path d="M7 7l1 12h8l1-12" />
  </svg>
);
export const IconCopy = (p: P) => (
  <svg {...base(p)}>
    <rect x="8" y="8" width="11" height="11" rx="2" />
    <path d="M16 8V5H5v11h3" />
  </svg>
);
export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
);
export const IconTarget = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="7" />
    <circle cx="12" cy="12" r="2" />
  </svg>
);
export const IconEye = (p: P) => (
  <svg {...base(p)}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </svg>
);
export const IconOrbit = (p: P) => (
  <svg {...base(p)}>
    <ellipse cx="12" cy="12" rx="9" ry="4" />
    <path d="M12 6v12" />
  </svg>
);
export const IconHand = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5a1.5 1.5 0 0 1 3 0V11m0-4a1.5 1.5 0 0 1 3 0v6.5c0 3.5-2.5 6.5-6 6.5s-4.5-1.5-6.5-4.5L3.4 13a1.5 1.5 0 0 1 2.4-1.8L8 13.5" />
  </svg>
);
export const IconSofa = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3" />
    <path d="M3 12a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3z" />
    <path d="M5 17v2M19 17v2" />
  </svg>
);
export const IconRooms = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
    <path d="M12 4v9M12 13h8" />
  </svg>
);
export const IconScan = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3" />
    <path d="M8 15V10l4-2.5 4 2.5v5z" />
  </svg>
);
export const IconFolder = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </svg>
);
export const IconHelp = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M9.6 9.5a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6" />
    <path d="M12 17h.01" strokeWidth={2.4} />
  </svg>
);
export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="6" />
    <path d="m20 20-4.5-4.5" />
  </svg>
);
export const IconChevronDown = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const IconList = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 6h11M9 12h11M9 18h11" />
    <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" strokeWidth={2.6} />
  </svg>
);
export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const IconAlert = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 4.5 21 19.5H3z" />
    <path d="M12 10v4" />
    <path d="M12 16.8h.01" strokeWidth={2.4} />
  </svg>
);
export const IconPencil = (p: P) => (
  <svg {...base(p)}>
    <path d="M14.5 5.5 18.5 9.5" />
    <path d="M5 19l1-4L16 5a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L9 18z" />
  </svg>
);
export const IconKeyboard = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="6.5" width="18" height="11" rx="2" />
    <path d="M7 10.5h.01M10.3 10.5h.01M13.6 10.5h.01M17 10.5h.01" strokeWidth={2.4} />
    <path d="M8 14.2h8" />
  </svg>
);
export const IconPhone = (p: P) => (
  <svg {...base(p)}>
    <rect x="7" y="3" width="10" height="18" rx="2.5" />
    <path d="M11 17.5h2" />
  </svg>
);
export const IconBox = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5 20 8v8l-8 4.5L4 16V8z" />
    <path d="M4 8l8 4.5L20 8M12 12.5v8" />
  </svg>
);
export const IconSparkle = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 4v4M12 16v4M4 12h4M16 12h4" />
    <path d="m7 7 1.8 1.8M15.2 15.2 17 17M17 7l-1.8 1.8M8.8 15.2 7 17" />
  </svg>
);
export const IconArrowRight = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const IconShieldCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5 19 6v5.5c0 4.3-3 7.4-7 9-4-1.6-7-4.7-7-9V6z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </svg>
);
export const IconWallMount = (p: P) => (
  <svg {...base(p)}>
    <path d="M5 3.5v17" />
    <rect x="8.5" y="8" width="9" height="7" rx="1" />
  </svg>
);
export const IconCeiling = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 5h17" />
    <path d="M12 5v4" />
    <path d="M8 13a4 4 0 0 1 8 0z" />
  </svg>
);
export const IconFloor = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 19.5h17" />
    <rect x="7" y="10" width="10" height="7" rx="1" />
  </svg>
);
export const IconMoon = (p: P) => (
  <svg {...base(p)}>
    <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />
  </svg>
);
export const IconSun = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </svg>
);
export const IconPlay = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" strokeWidth={1.4} />
  </svg>
);
export const IconPause = (p: P) => (
  <svg {...base(p)}>
    <path d="M8.5 5.5v13M15.5 5.5v13" strokeWidth={2.6} />
  </svg>
);
export const IconNext = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 5.5v13l9-6.5z" fill="currentColor" strokeWidth={1.4} />
    <path d="M18 5.5v13" strokeWidth={2.2} />
  </svg>
);
export const IconFilm = (p: P) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
    <path d="m10.5 9.5 4 2.5-4 2.5z" fill="currentColor" />
  </svg>
);

/* ---------- Maison (smart home) ---------- */

export const IconHouse = (p: P) => (
  <svg {...base(p)}>
    <path d="M3.5 11 12 4l8.5 7" />
    <path d="M5.5 9.5V20h13V9.5" />
    <path d="M10 20v-5.5h4V20" />
  </svg>
);
export const IconBulb = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 17.5h6" />
    <path d="M10 20.5h4" />
    <path d="M12 3.5a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2v1h5v-1c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3.5Z" />
  </svg>
);
export const IconFloorLamp = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 3.5h8l2 6H6z" />
    <path d="M12 9.5v11" />
    <path d="M8.5 20.5h7" />
  </svg>
);
export const IconPendant = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 2.5v5" />
    <path d="M5 15a7 7 0 0 1 14 0z" />
    <path d="M10 18.5a2 2 0 0 0 4 0" />
  </svg>
);
export const IconStrip = (p: P) => (
  <svg {...base(p)}>
    <rect x="4" y="6" width="16" height="10" rx="1.5" />
    <path d="M9 20h6" />
    <path d="M2 4.5c1 0 1.5-1 1.5-1M22 4.5c-1 0-1.5-1-1.5-1M2 17.5c1 0 1.5 1 1.5 1M22 17.5c-1 0-1.5 1-1.5 1" />
  </svg>
);
export const IconPlug = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 3.5v4M15 3.5v4" />
    <path d="M6.5 7.5h11v3a5.5 5.5 0 0 1-11 0z" />
    <path d="M12 16v4.5" />
  </svg>
);
export const IconFan = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="1.8" />
    <path d="M12 10.2C11 6.5 12 3.5 14.5 3.5c2 0 2.5 2.5.5 4.5-1 1-2 1.6-3 2.2" />
    <path d="M13.6 12.9c3.7.8 6 3 4.9 5.2-.9 1.8-3.3 1-4.2-1.6-.5-1.3-.7-2.5-.7-3.6" />
    <path d="M10.4 12.9c-2.7 2.7-5.8 3.5-7 1.4-1-1.7.9-3.4 3.6-3.1 1.4.1 2.5.6 3.4 1.1" />
  </svg>
);
export const IconTv = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="5" width="18" height="12" rx="2" />
    <path d="M8.5 20.5h7" />
  </svg>
);
export const IconPower = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5v8" />
    <path d="M6.6 6.8a7.5 7.5 0 1 0 10.8 0" />
  </svg>
);
export const IconChevronRight = (p: P) => (
  <svg {...base(p)}>
    <path d="m9.5 6 6 6-6 6" />
  </svg>
);
export const IconChevronLeft = (p: P) => (
  <svg {...base(p)}>
    <path d="m14.5 6-6 6 6 6" />
  </svg>
);
export const IconMinus = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 12h12" />
  </svg>
);
export const IconDoor = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 20.5V4.5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v16" />
    <path d="M3.5 20.5h17" />
    <circle cx="14.5" cy="12.5" r="0.6" fill="currentColor" />
  </svg>
);
export const IconVolume = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
    <path d="M15.5 9a4 4 0 0 1 0 6" />
    <path d="M18 6.5a7.5 7.5 0 0 1 0 11" />
  </svg>
);
export const IconDroplet = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5s6 6.2 6 10.5a6 6 0 0 1-12 0c0-4.3 6-10.5 6-10.5Z" />
  </svg>
);
export const IconSpeaker = (p: P) => (
  <svg {...base(p)}>
    <path d="M5.5 9.5a6.5 6.5 0 0 1 13 0V15a6.5 6.5 0 0 1-13 0Z" />
    <ellipse cx="12" cy="6.3" rx="3.2" ry="1" />
  </svg>
);
export const IconPrev = (p: P) => (
  <svg {...base(p)}>
    <path d="M18 5.5v13l-9-6.5z" fill="currentColor" strokeWidth={1.4} />
    <path d="M6 5.5v13" strokeWidth={2.2} />
  </svg>
);
export const IconMusic = (p: P) => (
  <svg {...base(p)}>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </svg>
);
/** « Organiser »: reorder (up / down arrows). */
export const IconReorder = (p: P) => (
  <svg {...base(p)}>
    <path d="M7 4v16" />
    <path d="m3.5 7.5 3.5-3.5 3.5 3.5" />
    <path d="M17 20V4" />
    <path d="m13.5 16.5 3.5 3.5 3.5-3.5" />
  </svg>
);
/** Drag handle (six dots). */
export const IconGrip = (p: P) => (
  <svg {...base({ fill: "currentColor", stroke: "none", ...p })}>
    {[7, 12, 17].map((y) => (
      <g key={y}>
        <circle cx="9" cy={y} r="1.6" />
        <circle cx="15" cy={y} r="1.6" />
      </g>
    ))}
  </svg>
);
/** Ambilight: a screen with light rays around it. */
export const IconAmbilight = (p: P) => (
  <svg {...base(p)}>
    <rect x="6" y="7" width="12" height="9" rx="1.5" />
    <path d="M12 2.5v2M12 18.5v2M2.5 11.5h2M19.5 11.5h2M5 4.5l1.4 1.4M19 4.5l-1.4 1.4M5 18.5l1.4-1.4M19 18.5l-1.4-1.4" />
  </svg>
);
