/**
 * The models ogchat offers, and how a model and a thinking level are named on
 * screen. Shared by the server (what the pickers list) and the browser (what a
 * reply says it was written by), so both always say the same thing.
 */

import type { ProviderChoice, RanOn, ReasoningEffort } from "./types";

/** Current Claude models, for the settings panel and the chat picker. Any other id can be typed. */
export const CLAUDE_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
  { id: "claude-fable-5-2", label: "Claude Fable 5.2" },
  { id: "claude-fable-5-1", label: "Claude Fable 5.1" },
] as const;

/**
 * The models offered for a Claude Code chat. The pinned ones pass a full model
 * id, so the chat gets exactly that model. The aliases ("fable", "opus" …) are
 * whatever the installed Claude Code takes them to mean, which depends on its
 * version: an older one may still take "fable" to be Fable 5.1. "default" is
 * whatever it would pick by itself.
 */
export const CODE_MODELS = [
  { id: "default", label: "Claude Code · its default model" },
  { id: "claude-fable-5-2", label: "Claude Code · Fable 5.2" },
  { id: "claude-fable-5-1", label: "Claude Code · Fable 5.1" },
  { id: "claude-opus-5-5", label: "Claude Code · Opus 5.5" },
  { id: "claude-sonnet-5-5", label: "Claude Code · Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Claude Code · Haiku 5.5" },
  { id: "fable", label: "Claude Code · Fable (its newest)" },
  { id: "opus", label: "Claude Code · Opus (its newest)" },
  { id: "sonnet", label: "Claude Code · Sonnet (its newest)" },
  { id: "haiku", label: "Claude Code · Haiku (its newest)" },
] as const;

/**
 * A Claude model id as a name: "claude-fable-5-2" is "Claude Fable 5.2",
 * "claude-opus-5-5-20261101" is "Claude Opus 5.5", "claude-opus-5-5[1m]" is
 * "Claude Opus 5.5 (1M context)". Anything else comes back as it is.
 */
export function modelName(id: string): string {
  const known = CLAUDE_MODELS.find((m) => m.id === id);
  if (known) return known.label;
  const match = /^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(\[1m\])?$/i.exec(id.trim());
  if (!match) return id;
  const family = match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1).toLowerCase();
  const version = match[3] ? `${match[2]}.${match[3]}` : match[2];
  return `Claude ${family} ${version}${match[4] ? " (1M context)" : ""}`;
}

/**
 * The thinking levels as Claude's own apps show them: Low, Medium, High,
 * Extra and Max. "Extra" is the API's `xhigh`. "default" sends no level, so
 * the model's own default applies; ogchat calls that Auto.
 */
export const EFFORT_LEVELS: readonly {
  id: ReasoningEffort;
  name: string;
  /** What it is for, in a line. */
  hint: string;
  /** A warning, where there is one. */
  warning?: string;
}[] = [
  { id: "default", name: "Auto", hint: "Sends no level: the model's own default applies." },
  { id: "low", name: "Low", hint: "Quickest and cheapest. Fine for simple questions." },
  { id: "medium", name: "Medium", hint: "Balanced speed, cost and depth." },
  { id: "high", name: "High", hint: "Thinks as much as the task needs." },
  { id: "xhigh", name: "Extra", hint: "Extended thinking for long, hard work." },
  {
    id: "max",
    name: "Max",
    hint: "No limit on thinking.",
    warning:
      "May use excessive tokens resulting in long response times and may hit token limits. Use sparingly for the hardest tasks.",
  },
];

/** What Claude's apps say about effort, above the levels. */
export const EFFORT_BLURB =
  "Higher effort means more thorough responses, but takes longer and uses your limits faster.";

/**
 * Per model: the level it runs at when none is sent (its API default), and
 * the one Claude's apps mark Recommended.
 */
const MODEL_EFFORT: Record<string, { default: ReasoningEffort; recommended: ReasoningEffort }> = {
  "claude-fable-5-2": { default: "high", recommended: "high" },
  "claude-fable-5-1": { default: "high", recommended: "high" },
  "claude-opus-5-5": { default: "medium", recommended: "medium" },
  "claude-sonnet-5-5": { default: "high", recommended: "medium" },
  "claude-haiku-5-5": { default: "medium", recommended: "medium" },
};
/** Claude Code's aliases, by a model they stand for (both Fables share the same levels). */
const ALIAS_OF: Record<string, string> = {
  fable: "claude-fable-5-2",
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5",
};

/** What is known about a model's thinking levels, or null for a model ogchat does not know. */
export function effortFacts(
  provider: ProviderChoice,
  model: string,
): { default: ReasoningEffort; recommended: ReasoningEffort } | null {
  if (provider === "compatible") return null;
  return MODEL_EFFORT[ALIAS_OF[model] ?? model] ?? null;
}

/** The thinking level as it is shown: "auto" when nothing was asked for, "extra" for xhigh. */
export function effortName(effort: string | null | undefined): string {
  const level = EFFORT_LEVELS.find((one) => one.id === (effort || "default"));
  return level ? level.name.toLowerCase() : String(effort);
}

/** Which way a model was reached, in a word or two. */
export const PROVIDER_NAMES: Record<ProviderChoice, string> = {
  claude: "the Claude API",
  claudecode: "Claude Code",
  compatible: "the provider in settings",
};

const isFullId = (id: string) => /^claude-/.test(id);

/** What Auto came to: the model's own default, where it is known. */
function autoLine(provider: ProviderChoice, model: string): string {
  if (provider === "claudecode") {
    return "Thinking: auto (no level sent; Claude Code's own default applies).";
  }
  const facts = effortFacts(provider, model);
  return facts
    ? `Thinking: auto (no level sent; ${shortName(model)} defaults to ${effortName(facts.default)}).`
    : "Thinking: auto (no level sent; the model decides how long to think).";
}
/** "Claude Fable 5.2" without the "Claude ", for where space is short. */
const shortName = (id: string) => modelName(id).replace(/^Claude /, "");

/**
 * A reply's model and thinking level, as a short line to show beside it
 * ("Fable 5.2 · think: high", "Claude Code · Fable 5.1 · think: auto") and as
 * a few full sentences for its tooltip. Where there are several Claude
 * accounts, both also say which one it ran on.
 */
export function describeRanOn(ranOn: RanOn): { short: string; full: string } {
  const { provider, requested, model, effort, account } = ranOn;
  // Claude Code's "default" or an alias, not yet resolved to a model.
  const unresolved = provider === "claudecode" && !isFullId(model);
  const name = unresolved
    ? requested === "default" || !requested
      ? "its default model"
      : `${requested} (its newest)`
    : shortName(model);
  // A declined request the API passed on to another model.
  const swapped = isFullId(requested) && model !== requested;
  const think = `think: ${effortName(effort)}`;
  const short = [
    provider === "claudecode" ? "Claude Code" : "",
    swapped ? `${name} (in place of ${shortName(requested)})` : name,
    think,
    account ? `account: ${account}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const full = [
    unresolved
      ? `Model: whichever ${requested === "default" ? "Claude Code picks by default" : `Claude Code takes "${requested}" to mean`}; it has not said yet.`
      : `Model: ${modelName(model)} (${model}).`,
    swapped ? `Asked for ${modelName(requested)} (${requested}), which handed the request on.` : "",
    !unresolved && provider === "claudecode" && requested !== model
      ? `Chosen by Claude Code from "${requested}".`
      : "",
    `Through: ${PROVIDER_NAMES[provider]}.`,
    account ? `Account: ${account}.` : "",
    effort
      ? `Thinking: ${effortName(effort)} (sent as effort "${effort}").`
      : autoLine(provider, model),
  ]
    .filter(Boolean)
    .join("\n");
  return { short, full };
}
