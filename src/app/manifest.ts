import type { MetadataRoute } from "next";

/** PWA manifest (PRD §5 responsive web + PWA). Installable from Chrome/Edge/Android and "Add to Home Screen" on iOS. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NutriMove AI",
    short_name: "NutriMove",
    description: "Your fitness and nutrition coach: real-time form feedback, Filipino-friendly meal plans and targets that adapt every week.",
    id: "/",
    start_url: "/overview",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f5f7f1",
    theme_color: "#9bd141",
    categories: ["health", "fitness", "food"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Log food", url: "/nutrition", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Today's workout", url: "/workout", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
