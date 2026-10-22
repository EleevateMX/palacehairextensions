import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
];

const config: NextConfig = {
  transpilePackages: ["@palace/domain"],
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Íconos y logotipo: cambian poco; el navegador los guarda una semana.
      {
        source: "/:file(icon\\.svg|icon-192\\.png|icon-512\\.png|icon-maskable-512\\.png|apple-touch-icon\\.png|logo-palace\\.svg)",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }],
      },
    ];
  },
};

export default config;
