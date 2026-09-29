import type { MetadataRoute } from "next";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

// Lets owners "Add to Home Screen" so the app opens like a native app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: APP_TAGLINE,
    start_url: "/home",
    display: "standalone",
    background_color: "#f8fafc",
    theme_color: "#047857",
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png" }],
  };
}
