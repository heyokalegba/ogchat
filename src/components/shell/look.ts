import { FIRST_DATE } from "@/lib/daylight";
import { SEASON_NAMES, WEATHERS, type SeasonName, type Weather } from "@/lib/weather";
import { SCENES, type SceneId } from "./art";

/**
 * How ogchat looks: which scene is behind the wall, what time it is there,
 * how light the wall is, and how the text on it is set. These are personal
 * preferences, so they live in this browser's storage and nowhere else.
 */
export interface Look {
  /**
   * Plain: black text on a white page, with no scene, wall or colour behind
   * it. For long stretches of focused work. The scene settings are kept for
   * when it is switched off again.
   */
  plain: boolean;
  /**
   * The page behind a chat on Claude or Claude Code. "formal" is white text
   * on a black page, so those chats are told apart at a glance from chats on
   * any other model; "same" shows them like the rest.
   */
  claudePage: "formal" | "same";
  scene: SceneId;
  /** Milliseconds the scene's clock runs ahead of (or behind) the real one. 0 is real time. */
  clockOffsetMs: number;
  /**
   * The day the scene is set to, as "2025-01-06", or "" for today. On a past
   * day the clock keeps its time of day and the weather is that day's.
   */
  date: string;
  /** The season: the calendar's ("auto"), one you hold it to, or winter with snow lying ("snow"). */
  season: "auto" | SeasonName | "snow";
  /**
   * The weather: New York's own ("live": now, or as it was on the day the
   * scene is set to), made up without asking anyone ("invented"), or one
   * kind you hold it to.
   */
  weather: "live" | "invented" | Weather;
  /** Whether people walk about in the scene. */
  people: boolean;
  /** Frozen: the scene holds still, like a picture. The light still follows the clock. */
  still: boolean;
  /** Whether the street can be heard: traffic, rain, wind, the odd siren. Off to begin with. */
  sound: boolean;
  /** How loud, in percent. */
  volume: number;
  /** How strongly the scene shows, in percent. Lower fades it into the dark, behind the text. */
  sceneStrength: number;
  /** Whether the chat is on screen at all. Hidden, there is only the scene to look at. */
  chatShown: boolean;
  /** Width of the sessions sidebar in pixels. The chat takes whatever is left. */
  sidebarWidth: number;
  /** Colour of the box messages are typed in, as #rrggbb. */
  inputColor: string;
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

/** What is behind a chat: the scene and its wall, black on white, or white on black. */
export type Page = "scene" | "plain" | "formal";

/** The page a chat is shown on, given whether it is a chat on Claude. */
export function pageFor(look: Look, claude: boolean): Page {
  if (claude && look.claudePage === "formal") return "formal";
  return look.plain ? "plain" : "scene";
}

export const DEFAULT_LOOK: Look = {
  plain: false,
  claudePage: "formal",
  scene: "skyline",
  clockOffsetMs: 0,
  date: "",
  season: "auto",
  weather: "live",
  people: true,
  still: false,
  sound: false,
  volume: 50,
  sceneStrength: 100,
  chatShown: true,
  sidebarWidth: 290,
  inputColor: "#a9c2d5",
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
export const SCENE_STRENGTH = { min: 15, max: 100, step: 5 };
export const SIDEBAR_WIDTH = { min: 190, max: 480, step: 10 };

/** Colours for the box messages are typed in. Any other colour can be picked too. */
export const INPUT_SWATCHES = [
  { name: "sky blue", value: "#a9c2d5" },
  { name: "paper", value: "#ebe4d4" },
  { name: "sand", value: "#d6c283" },
  { name: "sage", value: "#a9bfa4" },
  { name: "slate", value: "#34485e" },
  { name: "black", value: "#121212" },
];

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

/** A look as it was stored, with anything missing or out of range put right. */
export function cleanLook(value: unknown): Look {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const number = (v: unknown, fallback: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fallback;
  return {
    plain: raw.plain === true,
    claudePage: raw.claudePage === "same" ? "same" : "formal",
    scene:
      typeof raw.scene === "string" && raw.scene in SCENES
        ? (raw.scene as SceneId)
        : DEFAULT_LOOK.scene,
    clockOffsetMs: clamp(Math.round(number(raw.clockOffsetMs, 0)), -DAY_MS, DAY_MS),
    date:
      typeof raw.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.date) && raw.date >= FIRST_DATE
        ? raw.date
        : "",
    season:
      raw.season === "snow" || (SEASON_NAMES as readonly unknown[]).includes(raw.season)
        ? (raw.season as Look["season"])
        : "auto",
    weather:
      raw.weather === "invented" || (WEATHERS as readonly unknown[]).includes(raw.weather)
        ? (raw.weather as Look["weather"])
        : "live",
    people: typeof raw.people === "boolean" ? raw.people : DEFAULT_LOOK.people,
    still: typeof raw.still === "boolean" ? raw.still : DEFAULT_LOOK.still,
    sound: typeof raw.sound === "boolean" ? raw.sound : DEFAULT_LOOK.sound,
    volume: clamp(Math.round(number(raw.volume, DEFAULT_LOOK.volume)), 0, 100),
    sceneStrength: clamp(
      Math.round(number(raw.sceneStrength, DEFAULT_LOOK.sceneStrength)),
      SCENE_STRENGTH.min,
      SCENE_STRENGTH.max,
    ),
    chatShown: typeof raw.chatShown === "boolean" ? raw.chatShown : DEFAULT_LOOK.chatShown,
    sidebarWidth: clamp(
      Math.round(number(raw.sidebarWidth, DEFAULT_LOOK.sidebarWidth)),
      SIDEBAR_WIDTH.min,
      SIDEBAR_WIDTH.max,
    ),
    inputColor:
      typeof raw.inputColor === "string" && HEX.test(raw.inputColor)
        ? raw.inputColor.toLowerCase()
        : DEFAULT_LOOK.inputColor,
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
    return cleanLook(JSON.parse(window.localStorage.getItem(KEY) ?? "{}"));
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
export function lookVariables(
  look: Look,
  page: Page = look.plain ? "plain" : "scene",
): Record<string, string> {
  if (page === "formal") {
    // White on black: as with plain, only the text size and sidebar width still apply.
    return {
      "--og-sidebar": `${look.sidebarWidth}px`,
      "--og-type": (look.textSize / 100).toFixed(2),
      "--og-input-bg": "#0c0c0e",
      "--og-input-ink": "#f4f4f5",
      "--og-input-dim": "rgba(244, 244, 245, 0.5)",
      "--og-input-accent": "#f4f4f5",
      "--og-wall-opacity": "1",
      "--og-wall-light": "1",
      "--og-scene-veil": "0",
      "--og-wall-text": "#f4f4f5",
      "--og-halo-rgb": "0, 0, 0",
      "--og-halo": "none",
    };
  }
  if (page === "plain") {
    // Black on white: the text size and sidebar width still apply; nothing else does.
    return {
      "--og-sidebar": `${look.sidebarWidth}px`,
      "--og-type": (look.textSize / 100).toFixed(2),
      "--og-input-bg": "#ffffff",
      "--og-input-ink": "#000000",
      "--og-input-dim": "rgba(0, 0, 0, 0.55)",
      "--og-input-accent": "#74291c",
      "--og-wall-opacity": "1",
      "--og-wall-light": "1",
      "--og-scene-veil": "0",
      "--og-wall-text": "#000000",
      "--og-halo-rgb": "255, 255, 255",
      "--og-halo": "none",
    };
  }
  const color = activeTextColor(look);
  const halo = lightness(color) > 0.5 ? "20, 16, 12" : "246, 240, 227";
  // What is typed in the message box is dark on a light box and light on a dark one.
  const darkBox = lightness(look.inputColor) < 0.38;
  return {
    "--og-sidebar": `${look.sidebarWidth}px`,
    "--og-input-bg": look.inputColor,
    "--og-input-ink": darkBox ? "#f4eee0" : "#0d0c0b",
    "--og-input-dim": darkBox ? "rgba(244, 238, 224, 0.6)" : "rgba(13, 12, 11, 0.58)",
    "--og-input-accent": darkBox ? "#e58a6f" : "#74291c",
    "--og-wall-light": (0.72 + (look.wall / 100) * 0.56).toFixed(3),
    "--og-wall-opacity": look.wallShown ? "1" : "0",
    "--og-scene-veil": (1 - look.sceneStrength / 100).toFixed(2),
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
