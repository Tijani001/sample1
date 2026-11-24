import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=()" },
];

const nextConfig: NextConfig = {
  // Goroada is a data-driven marketplace: most pages read live inventory and
  // session cookies, so we use classic dynamic rendering rather than Cache Components.
  cacheComponents: false,
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  poweredByHeader: false,
  // Files read from disk at runtime must ship with serverless functions.
  outputFileTracingIncludes: {
    "/**": ["./db/migrations/**/*"],
    "/api/bookings/[id]/tickets": ["./public/brand/logo-inverted-1200.png"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [{ protocol: "https", hostname: "upload.wikimedia.org" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
};

export default nextConfig;
