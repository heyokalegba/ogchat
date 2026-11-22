import { checkRunning } from "@/lib/server/workspace";
import { checkProvider } from "@/lib/provider/adapter";
import { checkClaude } from "@/lib/provider/claude";
import { checkGitHub } from "@/lib/server/github";
import type { SettingsCheckStep } from "@/lib/types";
import { guard } from "@/lib/server/guard";
import { BadRequest, errorJson, json, readBody } from "@/lib/server/http";
import { previewSettings, SettingsValidationError } from "@/lib/server/settings";

export const dynamic = "force-dynamic";

/**
 * POST /api/settings/test { baseUrl?, model?, apiKey? }  →  { check }
 *
 * Tests the provider settings as they would be if the given fields were
 * saved, without saving anything. Fields left out fall back to what is in
 * use now, so an empty body tests the current setup. It asks the provider for
 * its model list, then sends one tiny message. The key never comes back.
 */
export async function POST(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  try {
    const body = await readBody(request);
    const settings = previewSettings({
      baseUrl: body.baseUrl,
      model: body.model,
      apiKey: body.apiKey,
      provider: body.provider,
      claudeKey: body.claudeKey,
      claudeModel: body.claudeModel,
      githubToken: body.githubToken,
      runCode: body.runCode,
    });
    if (settings.provider === "claude") {
      // Claude: ask Anthropic about the model (which costs nothing), and GitHub who the token is.
      const claude = await checkClaude({
        apiKey: settings.claudeKey,
        model: settings.claudeModel,
        baseUrl: process.env.OGCHAT_ANTHROPIC_URL?.trim() || null,
      });
      const steps: SettingsCheckStep[] = [
        {
          id: "key",
          ok: claude.ok,
          title: claude.ok ? "Claude is ready" : "Claude is not ready",
          detail: claude.detail,
        },
      ];
      if (settings.githubToken) {
        const github = await checkGitHub(settings.githubToken);
        steps.push({
          id: "github",
          ok: github.ok,
          title: github.ok ? "GitHub token works" : "GitHub token does not work",
          detail: github.detail,
        });
      } else {
        steps.push({
          id: "github",
          ok: null,
          title: "No GitHub token",
          detail: "Claude can chat, but cannot read or change a repository until a token is added.",
        });
      }
      if (settings.runCode) {
        // Running code: try it, and see that the sandbox holds.
        const running = await checkRunning();
        steps.push({
          id: "code",
          ok: running.ok,
          title:
            running.ok === false
              ? "Running code is not safe here"
              : running.ok
                ? "Running code is fenced in"
                : "Running code has no sandbox here",
          detail: running.detail,
        });
      }
      const ok = claude.ok && steps.every((step) => step.ok !== false);
      return json({ check: { ok, steps }, keySource: settings.claudeKeySource });
    }
    const check = await checkProvider({
      config: { baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model },
    });
    return json({ check, keySource: settings.keySource });
  } catch (err) {
    if (err instanceof SettingsValidationError) {
      return errorJson(400, "invalid_settings", err.message);
    }
    if (err instanceof BadRequest) return errorJson(400, "bad_request", err.message);
    throw err;
  }
}
