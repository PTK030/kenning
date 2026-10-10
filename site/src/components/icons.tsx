import type { SVGProps } from "react";

// Line icons in the Lucide style, drawn at 24 units.
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const Check = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </Icon>
);
export const Plus = () => (
  <Icon>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v8M8 12h8" />
  </Icon>
);
export const Alert = () => (
  <Icon>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4M12 17h.01" />
  </Icon>
);
export const ArrowIn = () => (
  <Icon>
    <path d="M17 7 7 17M17 17H7V7" />
  </Icon>
);
export const ArrowOut = () => (
  <Icon>
    <path d="M7 17 17 7M7 7h10v10" />
  </Icon>
);
export const Copy = () => (
  <Icon>
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Icon>
);
export const Replay = () => (
  <Icon>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
);
export const Download = () => (
  <Icon>
    <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
  </Icon>
);
export const Pointer = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true">
    <path d="M5 3l14 7.5-6.2 1.6L10 18.5z" fill="#fff" stroke="#16202A" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);
