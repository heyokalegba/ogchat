import type {
  Project,
  PublicSettings,
  ReasoningEffort,
  SendBody,
  Session,
  SessionDetail,
  SessionMeta,
  SettingsCheck,
  StreamEvent,
} from "@/lib/types";

/** Browser-side client for the ogchat API. The API key never passes through here in the clear, except on its way in from the settings form. */

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const UNREACHABLE = "Can't reach the ogchat server. Check that it is still running, then retry.";

export interface SettingsUpdate {
  baseUrl?: string;
  model?: string;
  /** A string saves a new key, null removes the saved one, omitted leaves it. */
  apiKey?: string | null;
  reasoning?: ReasoningEffort;
  systemPrompt?: string;
}

export interface ChatApi {
  /** `project`: a project id, "none" for chats outside any project, or nothing for all. */
  listSessions(
    query?: string,
    signal?: AbortSignal,
    project?: string | null,
  ): Promise<SessionMeta[]>;
  createSession(projectId?: string | null): Promise<Session>;
  /** Files a session under a project; null takes it out of one. */
  moveSession(id: string, projectId: string | null): Promise<SessionMeta>;
  listProjects(): Promise<Project[]>;
  createProject(name: string): Promise<Project>;
  updateProject(id: string, patch: { name?: string; instructions?: string }): Promise<Project>;
  deleteProject(id: string): Promise<void>;
  addProjectFiles(id: string, files: File[]): Promise<Project>;
  removeProjectFile(id: string, fileId: string): Promise<Project>;
  projectFileUrl(id: string, fileId: string): string;
  getSession(id: string): Promise<SessionDetail>;
  renameSession(id: string, title: string): Promise<SessionMeta>;
  deleteSession(id: string): Promise<void>;
  deleteMessage(id: string, messageId: string): Promise<Session>;
  stop(id: string): Promise<void>;
  getSettings(): Promise<PublicSettings>;
  saveSettings(update: SettingsUpdate): Promise<PublicSettings>;
  /** Tests the settings as they would be with `update` applied, without saving it. */
  testSettings(update: SettingsUpdate): Promise<SettingsCheck>;
  /** URL of a stored attachment, for thumbnails and "open file" links. */
  fileUrl(id: string, fileId: string): string;
  /** Sends a turn and reports each stream event. Resolves when the stream ends cleanly. */
  send(
    id: string,
    body: SendBody,
    onEvent: (event: StreamEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
}

async function failureOf(res: Response): Promise<ApiError> {
  try {
    const data = (await res.json()) as { error?: { code?: string; message?: string } };
    if (data.error?.message) {
      return new ApiError(data.error.code ?? "request_failed", data.error.message, res.status);
    }
  } catch {
    // fall through to the generic message
  }
  return new ApiError(
    "request_failed",
    `The ogchat server answered with an error (${res.status}).`,
    res.status,
  );
}

export function createApi(base = "/api"): ChatApi {
  async function call(path: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${base}${path}`, {
        ...init,
        // Form data sets its own content type (with the multipart boundary).
        headers:
          typeof init?.body === "string" ? { "Content-Type": "application/json" } : undefined,
        cache: "no-store",
      });
    } catch (err) {
      if (init?.signal?.aborted) throw err;
      throw new ApiError("unreachable", UNREACHABLE);
    }
    if (!res.ok) throw await failureOf(res);
    return res;
  }

  async function data<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await call(path, init);
    try {
      return (await res.json()) as T;
    } catch {
      throw new ApiError("unreachable", UNREACHABLE);
    }
  }

  const body = (method: string, value?: unknown): RequestInit => ({
    method,
    body: value === undefined ? undefined : JSON.stringify(value),
  });

  return {
    async listSessions(query, signal, project) {
      const params = new URLSearchParams();
      if (query?.trim()) params.set("q", query.trim());
      if (project) params.set("project", project);
      const q = params.size ? `?${params}` : "";
      return (await data<{ sessions: SessionMeta[] }>(`/sessions${q}`, { signal })).sessions;
    },
    async createSession(projectId) {
      return (
        await data<{ session: Session }>("/sessions", body("POST", projectId ? { projectId } : {}))
      ).session;
    },
    async moveSession(id, projectId) {
      return (await data<{ session: SessionMeta }>(`/sessions/${id}`, body("PATCH", { projectId })))
        .session;
    },
    async listProjects() {
      return (await data<{ projects: Project[] }>("/projects")).projects;
    },
    async createProject(name) {
      return (await data<{ project: Project }>("/projects", body("POST", { name }))).project;
    },
    async updateProject(id, patch) {
      return (await data<{ project: Project }>(`/projects/${id}`, body("PATCH", patch))).project;
    },
    async deleteProject(id) {
      await call(`/projects/${id}`, body("DELETE"));
    },
    async addProjectFiles(id, files) {
      const form = new FormData();
      for (const file of files) form.append("files", file, file.name);
      return (
        await data<{ project: Project }>(`/projects/${id}/files`, { method: "POST", body: form })
      ).project;
    },
    async removeProjectFile(id, fileId) {
      return (await data<{ project: Project }>(`/projects/${id}/files/${fileId}`, body("DELETE")))
        .project;
    },
    projectFileUrl(id, fileId) {
      return `${base}/projects/${id}/files/${fileId}`;
    },
    getSession(id) {
      return data<SessionDetail>(`/sessions/${id}`);
    },
    async renameSession(id, title) {
      return (await data<{ session: SessionMeta }>(`/sessions/${id}`, body("PATCH", { title })))
        .session;
    },
    async deleteSession(id) {
      await call(`/sessions/${id}`, body("DELETE"));
    },
    async deleteMessage(id, messageId) {
      return (
        await data<{ session: Session }>(`/sessions/${id}/messages/${messageId}`, body("DELETE"))
      ).session;
    },
    async stop(id) {
      await call(`/sessions/${id}/stop`, body("POST", {}));
    },
    async getSettings() {
      return (await data<{ settings: PublicSettings }>("/settings")).settings;
    },
    async saveSettings(update) {
      return (await data<{ settings: PublicSettings }>("/settings", body("PUT", update))).settings;
    },
    async testSettings(update) {
      return (await data<{ check: SettingsCheck }>("/settings/test", body("POST", update))).check;
    },
    fileUrl(id, fileId) {
      return `${base}/sessions/${id}/files/${fileId}`;
    },
    async send(id, payload, onEvent, signal) {
      let init: RequestInit;
      if ("files" in payload && payload.files?.length) {
        // Files travel as multipart form data alongside the message text.
        const form = new FormData();
        form.set("content", payload.content);
        if (payload.replaceFromMessageId) {
          form.set("replaceFromMessageId", payload.replaceFromMessageId);
        }
        if (payload.web) form.set("web", "true");
        for (const file of payload.files) form.append("files", file, file.name);
        init = { method: "POST", body: form };
      } else if ("content" in payload) {
        const { content, replaceFromMessageId, web, replayOf } = payload;
        init = body("POST", {
          content,
          replaceFromMessageId,
          ...(web ? { web: true } : {}),
          ...(replayOf ? { replayOf } : {}),
        });
      } else {
        init = body("POST", payload);
      }
      const res = await call(`/sessions/${id}/messages`, { ...init, signal });
      if (!res.body) throw new ApiError("connection_lost", UNREACHABLE);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let ended = false;
      const drain = (final: boolean) => {
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          let event: StreamEvent;
          try {
            event = JSON.parse(line) as StreamEvent;
          } catch {
            continue;
          }
          if (event.type === "done" || event.type === "error") ended = true;
          onEvent(event);
        }
        if (final) buffer = "";
      };
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          drain(false);
        }
        buffer += `${decoder.decode()}\n`;
        drain(true);
      } catch (err) {
        if (signal?.aborted) throw err;
        throw new ApiError(
          "connection_lost",
          "The connection to the ogchat server was interrupted.",
        );
      }
      if (!ended) {
        throw new ApiError(
          "connection_lost",
          "The connection to the ogchat server was interrupted.",
        );
      }
    },
  };
}
