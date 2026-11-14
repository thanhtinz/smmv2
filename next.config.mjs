/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: "4mb" },
    // GĐ2: @node-rs/argon2 là binary napi — để ngoài bundle webpack, Node nạp trực tiếp từ node_modules lúc chạy
    serverComponentsExternalPackages: ["@node-rs/argon2"],
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
