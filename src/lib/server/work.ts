import type { SessionWork } from "@/lib/types";
import { isEnvironmentId } from "./environments";
import { parseBranch, parseRepo } from "./github";

/**
 * Where a chat works, as the browser sent it: checked, with only the parts
 * that were sent. Returns a message instead if a part is not what it should be.
 * "" and null both mean "none".
 */
export function parseWork(body: Record<string, unknown>): Partial<SessionWork> | string {
  const work: Partial<SessionWork> = {};
  const none = (value: unknown) => value === null || value === "";
  if (body.repo !== undefined) {
    if (none(body.repo)) work.repo = null;
    else {
      const repo = parseRepo(body.repo);
      if (!repo) return "That is not a GitHub repository. Give it as owner/name, or its address.";
      work.repo = repo;
    }
  }
  if (body.branch !== undefined) {
    if (none(body.branch)) work.branch = null;
    else {
      const branch = parseBranch(body.branch);
      if (!branch) return "That is not a branch name.";
      work.branch = branch;
    }
  }
  if (body.environmentId !== undefined) {
    if (none(body.environmentId) || body.environmentId === "default") work.environmentId = null;
    else if (isEnvironmentId(body.environmentId)) work.environmentId = body.environmentId;
    else return "That environment does not exist.";
  }
  return work;
}
