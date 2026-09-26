import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` refuses to serve its scripts to a page opened from another device
  // (a phone on the same Wi-Fi or hotspot), so the page loads but never starts:
  // nothing updates and nothing can be pressed. Allow the local network's
  // addresses. Only affects `next dev`; `next start` has no such check.
  allowedDevOrigins: [
    "192.168.*.*",
    "10.*.*.*",
    ...Array.from({ length: 16 }, (_, i) => `172.${16 + i}.*.*`),
    "*.local",
  ],
};

export default nextConfig;
