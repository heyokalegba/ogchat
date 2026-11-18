import type { MetadataRoute } from "next";

/**
 * Lets a browser install ogchat as an app of its own: a window with no tabs
 * or address bar, its own icon in the Dock. The server still has to be
 * running; scripts/ogchat.command starts both together.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ogchat",
    short_name: "ogchat",
    description: "A personal, local-only AI chat interface.",
    start_url: "/",
    display: "standalone",
    background_color: "#151b2e",
    theme_color: "#0d0c0b",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
