import type { NextConfig } from "next";

// Local, single-user, fully dynamic app: no prerendering or component caching needed.
// better-sqlite3 is on Next's built-in serverExternalPackages list, so no extra config is required.
const nextConfig: NextConfig = {
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
