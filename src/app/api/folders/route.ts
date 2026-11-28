import { canChooseFolder, checkFolder, chooseFolder } from "@/lib/server/folders";
import { guard } from "@/lib/server/guard";
import { BadRequest, errorJson, json, readBody } from "@/lib/server/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/folders { path }            →  { folder }
 * POST /api/folders { choose: true }    →  { folder }   (null when cancelled)
 *
 * A folder on this computer for a chat on Claude Code to work in. With a
 * `path` it is checked and handed back in full (`~` filled in), or refused
 * with `400 bad_folder` and what is wrong with it. With `choose` the system's
 * own window for choosing a folder is opened on this computer's screen, and
 * the answer waits for it; `501 no_dialog` where there is no such window.
 */
export async function POST(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const body = await readBody(request);
    if (body.choose === true) {
      if (!canChooseFolder()) {
        return errorJson(
          501,
          "no_dialog",
          "There is no window to choose a folder in on this system. Type its path.",
        );
      }
      return json({ folder: await chooseFolder(request.signal) });
    }
    const checked = checkFolder(body.path);
    if ("error" in checked) return errorJson(400, "bad_folder", checked.error);
    return json({ folder: checked.folder });
  } catch (err) {
    if (err instanceof BadRequest) return errorJson(400, "bad_request", err.message);
    throw err;
  }
}
