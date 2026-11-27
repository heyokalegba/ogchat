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

export default nextConfig;
