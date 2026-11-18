import type { NextConfig } from "next";

// ogchat is local-only: opt out of Next.js' anonymous usage telemetry unless
// the environment says otherwise.
process.env.NEXT_TELEMETRY_DISABLED ??= "1";

const nextConfig: NextConfig = {
  devIndicators: false,
  poweredByHeader: false,
};

export default nextConfig;
