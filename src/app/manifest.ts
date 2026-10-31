import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Opportunity Compass",
    short_name: "Compass",
    description:
      "Your personal space for opportunities, conversations, and shared discoveries.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#f8f8fa",
    theme_color: "#7960bd",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    share_target: {
      action: "/share",
      method: "GET",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
