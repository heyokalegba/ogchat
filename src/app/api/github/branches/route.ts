import { GitHubError, listBranches, parseRepo } from "@/lib/server/github";
import { guard } from "@/lib/server/guard";
import { errorJson, json } from "@/lib/server/http";
import { resolveSettings } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

/** GET /api/github/branches?repo=owner/name  →  { branches, defaultBranch } */
export async function GET(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const token = resolveSettings().githubToken;
  if (!token) return errorJson(400, "no_token", "There is no GitHub token in settings.");
  const repo = parseRepo(new URL(request.url).searchParams.get("repo"));
  if (!repo) return errorJson(400, "bad_repo", "That is not a repository.");
  try {
    return json(await listBranches(token, repo));
  } catch (err) {
    if (err instanceof GitHubError) return errorJson(502, "github", err.message);
    throw err;
  }
}
