import { codeSignIn } from "@/lib/server/claudecode";
import { guard } from "@/lib/server/guard";
import { json } from "@/lib/server/http";
import { codeSetup, resolveSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/sign-in  →  { signIn }
 *
 * How Claude Code is signed in on the account in use: to a Claude plan, or to
 * the Anthropic Console. It is what tells a chat on Claude Code whether its
 * replies count against the plan's usage or are paid for in API tokens.
 */
export async function GET(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  // Asked afresh: this is how a sign-in made a moment ago in Terminal shows up.
  return json({ signIn: codeSignIn(codeSetup(resolveSettings()), 0) });
}
