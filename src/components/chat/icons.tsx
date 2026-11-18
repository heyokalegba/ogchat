import type { SVGProps } from "react";

/** A small set of hairline icons, drawn on a 16px grid. */

function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const SendIcon = () => (
  <Icon strokeWidth="1.7">
    <path d="M8 12.5v-9M4.25 7.25 8 3.5l3.75 3.75" />
  </Icon>
);

export const GlobeIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M2.5 8h11M8 2.5c-2.2 1.7-2.2 9.3 0 11M8 2.5c2.2 1.7 2.2 9.3 0 11" />
  </Icon>
);

export const StopIcon = () => (
  <Icon>
    <rect x="4.5" y="4.5" width="7" height="7" rx="1.2" fill="currentColor" stroke="none" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon>
    <path d="M8 3.5v9M3.5 8h9" />
  </Icon>
);

export const SearchIcon = () => (
  <Icon>
    <circle cx="7.1" cy="7.1" r="3.9" />
    <path d="m10.1 10.1 3 3" />
  </Icon>
);

export const PencilIcon = () => (
  <Icon>
    <path d="M10.6 3.2 12.8 5.4 6 12.2l-2.9.7.7-2.9 6.8-6.8Z" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M3.5 4.75h9M6.5 4.5V3.25h3V4.5M4.75 4.75l.5 7.75h5.5l.5-7.75" />
  </Icon>
);

export const GearIcon = () => (
  <Icon>
    <path d="M2.5 5h5.25M11 5h2.5M2.5 11H5M8.25 11h5.25" />
    <circle cx="9.4" cy="5" r="1.6" />
    <circle cx="6.6" cy="11" r="1.6" />
  </Icon>
);

export const MenuIcon = () => (
  <Icon>
    <path d="M2.75 5h10.5M2.75 8h10.5M2.75 11h10.5" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="m4.25 4.25 7.5 7.5M11.75 4.25l-7.5 7.5" />
  </Icon>
);

export const CheckIcon = () => (
  <Icon>
    <path d="m3.5 8.5 3 3 6-7" />
  </Icon>
);

export const PaperclipIcon = () => (
  <Icon>
    <path d="M12.6 7.4 7.5 12.5a2.9 2.9 0 0 1-4.1-4.1l5.6-5.6a1.95 1.95 0 0 1 2.75 2.75L6.4 10.9a1 1 0 0 1-1.4-1.4l4.7-4.7" />
  </Icon>
);

export const FileIcon = () => (
  <Icon>
    <path d="M4 2.5h5l3 3v8H4v-11Z" />
    <path d="M9 2.5v3h3" />
  </Icon>
);
