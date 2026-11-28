import { isClaudeProvider, type AccountRef, type ClaudeAccount, type RanOn } from "./types";

/**
 * The colours a Claude account can be given, so that a chat on one account is
 * told from a chat on another at a glance: in the list of chats, at the top of
 * the chat, and beside each reply. They are bright enough to read on black
 * and on white, and keep clear of the amber and red that mean "API tokens"
 * and "not signed in".
 */
export const ACCOUNT_COLORS = [
  { id: "blue", hex: "#4c9dff" },
  { id: "green", hex: "#3fc380" },
  { id: "violet", hex: "#a98bff" },
  { id: "pink", hex: "#ff74b1" },
  { id: "teal", hex: "#22c1c3" },
  { id: "orange", hex: "#ff8f4a" },
  { id: "lime", hex: "#a8cf3a" },
  { id: "silver", hex: "#b9bcc6" },
] as const;

export type AccountColor = (typeof ACCOUNT_COLORS)[number]["id"];

export function isAccountColor(value: unknown): value is AccountColor {
  return ACCOUNT_COLORS.some((one) => one.id === value);
}

/** The colour itself, for a style. Anything that is not one of them is the first. */
export function colorHex(id: string | null | undefined): string {
  return (ACCOUNT_COLORS.find((one) => one.id === id) ?? ACCOUNT_COLORS[0]).hex;
}

/** The first colour no account has yet; once they are all taken, they come round again. */
export function nextAccountColor(taken: readonly (string | null | undefined)[]): AccountColor {
  const free = ACCOUNT_COLORS.find((one) => !taken.includes(one.id));
  return (free ?? ACCOUNT_COLORS[taken.length % ACCOUNT_COLORS.length]!).id;
}

/**
 * Which account a reply ran on, as far as it says. Null for a reply that was
 * not from Claude. A reply from Claude that names no account was written
 * when there was only the one, so it stands for the main account.
 */
export function accountRefOf(ranOn: RanOn | null | undefined): AccountRef | null {
  if (!ranOn || !isClaudeProvider(ranOn.provider)) return null;
  return {
    ...(ranOn.accountId ? { id: ranOn.accountId } : {}),
    ...(ranOn.account ? { name: ranOn.account } : {}),
  };
}

/**
 * The account a reply or a chat points at: by id, or for one written before
 * ids were kept, by name. Null when that account is no longer on the list.
 * `accounts` has the main one first.
 */
export function findAccount(
  accounts: readonly ClaudeAccount[],
  ref: AccountRef | null | undefined,
): ClaudeAccount | null {
  if (!ref) return null;
  if (ref.id) return accounts.find((one) => one.id === ref.id) ?? null;
  if (ref.name) {
    const name = ref.name.toLowerCase();
    return accounts.find((one) => one.name.toLowerCase() === name) ?? null;
  }
  return accounts[0] ?? null;
}
