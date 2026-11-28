import { createRequire } from "node:module";
import path from "node:path";
import type { NextConfig } from "next";

// ogchat is local-only: opt out of Next.js' anonymous usage telemetry unless
// the environment says otherwise.
process.env.NEXT_TELEMETRY_DISABLED ??= "1";

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
  // The server reads and runs things at paths only known when it runs (your data
  // folder, a chat's workspace, the claude program). None of that is part of the
  // build: keep the build from following it into your chats, clones and the Mac app.
  outputFileTracingExcludes: {
    "*": ["data/**", "dist-app/**", "electron/**", "tests/**", "scripts/**"],
  },
};

/**
 * As a build begins, the desktop app's servers of this project are stopped.
 *
 * A build replaces the files a running server answers with, so that server
 * can only go on showing the old ogchat. And the desktop app takes any ogchat
 * answering on its port for one already running: with the old server out of
 * the way it starts a new one, on the new build. That is all an update needs
 * from whoever is using the app: quit it, and open it again.
 *
 * Only a server run from this folder on the app's own ports is stopped, never
 * the one this build was started from, and nothing here can fail the build.
 */
async function stopOldServers() {
  try {
    const here = createRequire(path.join(process.cwd(), "next.config.ts"));
    const launcher = here("./electron/server.cjs") as {
      stopServers?: (projectDir: string) => Promise<number[]>;
    };
    const stopped = (await launcher.stopServers?.(process.cwd())) ?? [];
    if (stopped.length) {
      console.log(`ogchat: stopped the server from before this build (${stopped.join(", ")})`);
    }
  } catch {
    // no launcher here, or it could not tell: the build goes on as it would have
  }
}

export default async function config(phase: string): Promise<NextConfig> {
  // "phase-production-build" is PHASE_PRODUCTION_BUILD in next/constants.
  if (phase === "phase-production-build") await stopOldServers();
  return nextConfig;
}
