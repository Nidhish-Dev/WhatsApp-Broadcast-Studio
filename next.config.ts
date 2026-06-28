import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  serverExternalPackages: ["whatsapp-web.js", "puppeteer-core", "puppeteer", "xlsx"]
};

export default nextConfig;
