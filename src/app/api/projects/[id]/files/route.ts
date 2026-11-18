import { MAX_PROJECT_FILES, MAX_REQUEST_BYTES } from "@/lib/limits";
import { FileRejected, ingestFile, type IngestedFile } from "@/lib/server/files";
import { guard } from "@/lib/server/guard";
import { errorJson, json } from "@/lib/server/http";
import { addProjectFiles, ProjectError, projectExists } from "@/lib/server/projects";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/projects/:id/files   multipart form data, any number of `files`
 *   →  { project }
 * The same kinds of file a message can carry: text, PDFs and images.
 */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id } = await params;
  if (!projectExists(id)) return errorJson(404, "not_found", "Project not found.");

  if (Number(request.headers.get("content-length") ?? "0") > MAX_REQUEST_BYTES) {
    return errorJson(413, "request_too_large", "These files are too large to add together.");
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorJson(400, "bad_request", "Could not read the uploaded files.");
  }
  const files = form.getAll("files").filter((entry): entry is File => typeof entry !== "string");
  if (files.length === 0) return errorJson(400, "no_files", "No files were sent.");
  if (files.length > MAX_PROJECT_FILES) {
    return errorJson(400, "too_many_files", `A project holds at most ${MAX_PROJECT_FILES} files.`);
  }
  try {
    const uploads: IngestedFile[] = [];
    for (const file of files) {
      uploads.push(
        await ingestFile({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }),
      );
    }
    const project = addProjectFiles(id, uploads);
    return project ? json({ project }) : errorJson(404, "not_found", "Project not found.");
  } catch (err) {
    if (err instanceof FileRejected || err instanceof ProjectError) {
      return errorJson(err.status, err.code, err.message);
    }
    throw err;
  }
}
