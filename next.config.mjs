/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next 15: serverComponentsExternalPackages -> serverExternalPackages (top-level)
  serverExternalPackages: ["@node-rs/argon2"],
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
  },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "X-DNS-Prefetch-Control", value: "off" },
          // Content-Security-Policy do middleware cấp kèm nonce theo từng
          // request (src/middleware.ts) — không đặt tĩnh ở đây nữa.
        ],
      },
    ];
  },
};
export default nextConfig;
