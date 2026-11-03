import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

// Local, fully dynamic app: no prerendering or component caching needed.
// better-sqlite3 is on Next's built-in serverExternalPackages list, so no extra config is required.
//
// Shared chats: a coworker on the same network opens this machine's LAN address. The dev server
// only trusts localhost by default, so this machine's own LAN addresses are allowed as origins.
const lanHosts = Object.values(networkInterfaces())
  .flat()
  .filter((n) => !!n && n.family === "IPv4" && !n.internal)
  .map((n) => n!.address);

const nextConfig: NextConfig = {
  allowedDevOrigins: lanHosts,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
