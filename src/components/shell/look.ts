import { SCENES, type SceneId } from "./art";

/**
 * How ogchat looks: which scene is behind the wall, what time it is there,
 * how light the wall is, and how the text on it is set. These are personal
 * preferences, so they live in this browser's storage and nowhere else.
 */
export interface Look {
  scene: SceneId;
  /** Milliseconds the scene's clock runs ahead of (or behind) the real one. 0 is real time. */
  clockOffsetMs: number;
  /** Whether people walk about in the scene. */
  people: boolean;
  /** Whether the brick wall is there. Without it the chat floats over the scene. */
  wallShown: boolean;
  /** Wall lightness, 0 (dark and gritty) to 100 (pale). 50 is the wall as drawn. */
  wall: number;
  /** Text size in percent of the standard size. */
  textSize: number;
  /** Colour of the text written on the wall, as #rrggbb. */
  textColor: string;
  /** Colour of the same text when the wall is hidden and it sits over the scene. */
  textColorOpen: string;
}

export const DEFAULT_LOOK: Look = {
  scene: "skyline",
  clockOffsetMs: 0,
  people: true,
  wallShown: true,
  wall: 50,
  textSize: 100,
  textColor: "#0d0c0b",
  // Over the open scene, chalk with a dark outline reads at any hour.
  textColorOpen: "#f4eee0",
};

/** The text colour in force: the one for the wall, or the one for the open scene. */
export function activeTextColor(look: Look): string {
  return look.wallShown ? look.textColor : look.textColorOpen;
}

export const TEXT_SIZE = { min: 80, max: 150, step: 5 };

/** Text colours that sit well on the wall. Any other colour can be picked too. */
export const TEXT_SWATCHES = [
  { name: "black", value: "#0d0c0b" },
  { name: "espresso", value: "#2e1c12" },
  { name: "mud brick", value: "#5e1f14" },
  { name: "bottle green", value: "#17382a" },
  { name: "navy", value: "#14233f" },
  { name: "chalk", value: "#f4eee0" },
];

const KEY = "ogchat:look";
const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const DAY_MS = 86_400_000;

function clean(value: unknown): Look {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const number = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    scene:
      typeof raw.scene === "string" && raw.scene in SCENES
        ? (raw.scene as SceneId)
        : DEFAULT_LOOK.scene,
    clockOffsetMs: clamp(Math.round(number(raw.clockOffsetMs, 0)), -DAY_MS, DAY_MS),
    people: typeof raw.people === "boolean" ? raw.people : DEFAULT_LOOK.people,
    wallShown: typeof raw.wallShown === "boolean" ? raw.wallShown : DEFAULT_LOOK.wallShown,
    wall: clamp(Math.round(number(raw.wall, DEFAULT_LOOK.wall)), 0, 100),
    textSize: clamp(
      Math.round(number(raw.textSize, DEFAULT_LOOK.textSize)),
      TEXT_SIZE.min,
      TEXT_SIZE.max,
    ),
    textColor:
      typeof raw.textColor === "string" && HEX.test(raw.textColor)
        ? raw.textColor.toLowerCase()
        : DEFAULT_LOOK.textColor,
    textColorOpen:
      typeof raw.textColorOpen === "string" && HEX.test(raw.textColorOpen)
        ? raw.textColorOpen.toLowerCase()
        : DEFAULT_LOOK.textColorOpen,
  };
}

export function loadLook(): Look {
  try {
    return clean(JSON.parse(window.localStorage.getItem(KEY) ?? "{}"));
  } catch {
    return DEFAULT_LOOK; // storage unavailable or unreadable: the defaults are fine
  }
}

export function saveLook(look: Look): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(look));
  } catch {
    // Not remembered, but still applied.
  }
}

/** Perceived lightness of a #rrggbb colour, 0 (black) to 1 (white). */
function lightness(color: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * The look as CSS variables for the app's root element.
 *
 * The wall slider is a brightness factor around the wall as drawn (0.72 to
 * 1.28). The halo behind wall text flips from pale to dark when the text
 * itself is light, so it always outlines rather than washes out. With the
 * wall hidden the text sits on buildings and sky, so the halo is made much
 * stronger: a solid outline first, then the soft glow.
 */
export function lookVariables(look: Look): Record<string, string> {
  const color = activeTextColor(look);
  const halo = lightness(color) > 0.5 ? "20, 16, 12" : "246, 240, 227";
  return {
    "--og-wall-light": (0.72 + (look.wall / 100) * 0.56).toFixed(3),
    "--og-wall-opacity": look.wallShown ? "1" : "0",
    "--og-type": (look.textSize / 100).toFixed(2),
    "--og-wall-text": color,
    "--og-halo-rgb": halo,
    ...(look.wallShown
      ? {}
      : {
          "--og-halo": [
            `0 0 1px rgba(${halo}, 1)`,
            `0 0 2px rgba(${halo}, 1)`,
            `0 1px 3px rgba(${halo}, 0.95)`,
            `0 0 7px rgba(${halo}, 0.85)`,
            `0 0 14px rgba(${halo}, 0.6)`,
          ].join(", "),
        }),
  };
}
