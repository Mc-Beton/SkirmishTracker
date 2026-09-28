import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WarBracket",
    short_name: "WarBracket",
    description: "Eldfall Chronicles tournaments, leagues and skirmishes",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0f1f",
    theme_color: "#0a0f1f",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
