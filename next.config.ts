import type { NextConfig } from "next";
// NEXT_PUBLIC 值会进入客户端包；必须在构建/启动时拦截误填的服务端密钥。
const clientKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (clientKey && !clientKey.startsWith("sb_publishable_")) {
  throw new Error(
    "Supabase 配置错误：NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 只接受 sb_publishable_ 开头的公开客户端密钥。不要填写服务端密钥。",
  );
}
const staticExport = process.env.OUR_SPACE_STATIC_EXPORT === "1";
const nextConfig: NextConfig = {
  ...(staticExport ? { output: "export" as const, trailingSlash: true } : {}),
  devIndicators: false,
  // 仅允许本机回环别名，用于同时验证两个独立登录会话。
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};
if (staticExport) delete nextConfig.headers;
export default nextConfig;
