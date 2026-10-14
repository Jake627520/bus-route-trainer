import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Change 51: service worker 的回應標頭（依 Next.js 官方 PWA 指南）。
  // 不快取腳本本身，修正版才能立即生效；CSP 限制它只能載入同源腳本。
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
