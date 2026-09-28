import type { NextConfig } from "next";

// While the old FPA Judging System is still in use, it keeps freestylejudge.com's home page:
// set LEGACY_SITE_ORIGIN (on the hosted site only) to its CloudFront address and the app
// passes the old system's requests through to it. The old app is one page at `/` driven by
// ?query parameters (which it reads from the browser's address, so they reach it either
// way), plus its own files; anything this app has no page for goes there too. This app's
// home page is then at /new (lib/site.ts). Unset (laptops, dev, and after the cutover),
// `/` is this app's home page.
const legacyOrigin = process.env.LEGACY_SITE_ORIGIN?.trim().replace(/\/+$/, "");
const LEGACY_FILES = ["/", "/index.html", "/bundle.js", "/bundle.js.LICENSE.txt"];

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

  async rewrites() {
    if (!legacyOrigin) return [];
    return {
      beforeFiles: LEGACY_FILES.map((path) => ({ source: path, destination: `${legacyOrigin}${path}` })),
      afterFiles: [],
      fallback: [{ source: "/:path*", destination: `${legacyOrigin}/:path*` }],
    };
  },
};

export default nextConfig;
