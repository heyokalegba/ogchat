import { GitHubError, listRepos } from "@/lib/server/github";
import { guard } from "@/lib/server/guard";
import { errorJson, json } from "@/lib/server/http";
import { resolveSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

/** GET /api/github/repos  →  { repos }: the repositories the GitHub token in settings can reach. */
export async function GET(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const token = resolveSettings().githubToken;
  if (!token) return errorJson(400, "no_token", "There is no GitHub token in settings.");
  try {
    return json({ repos: await listRepos(token) });
  } catch (err) {
    if (err instanceof GitHubError) return errorJson(502, "github", err.message);
    throw err;
  }
}
