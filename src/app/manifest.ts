import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Goroada · Every road. One app.",
    short_name: "Goroada",
    description: "Search, compare and book road trips from trusted transport operators.",
    start_url: "/?source=pwa",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    orientation: "portrait",
    categories: ["travel", "navigation"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [{ name: "My Trips", url: "/trips" }, { name: "Find a booking", url: "/trips/find" }],
  };
}
