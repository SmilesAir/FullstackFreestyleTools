import type { NextConfig } from "next";

// The old FPA Judging System lives at /old: a copy of its page, patched to run there, in
// public/old (scripts/fetch-legacy-site.mjs). It still calls its own APIs on AWS.
// public/old/bundle.js is served as a file; /old and every address under it (its own
// routes, like /old/admin) get its one page.
//
// The old system used to be at `/`, driven by ?query parameters, so its links and
// permalinks (freestylejudge.com/?startup=…, /?x=…, /?eventKey=…) and its own routes
// (/admin, /quick, /creator, /viewer) are sent on to /old; a redirect keeps the query.
// This app's home page used to be at /new, which now goes to `/`.
const OLD_SYSTEM_QUERY_KEYS = ["startup", "x", "eventKey"];
const OLD_SYSTEM_ROUTES = ["/admin", "/quick", "/creator", "/viewer"];

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

  // Hide the floating Next.js "N" badge `next dev` puts in the corner. Build
  // and runtime errors still show their overlay.
  devIndicators: false,

  // The registration form is embedded in an iframe on tournaments' own sites (any domain),
  // so its pages say outright that any site may frame them. Its sign-in window
  // (/register/<form>/connect) is a top-level page and isn't included. Nothing in the app
  // sends X-Frame-Options.
  async headers() {
    const frameable = [{ key: "Content-Security-Policy", value: "frame-ancestors *" }];
    return [
      { source: "/embed/:path*", headers: frameable },
      { source: "/register/:formId", headers: frameable },
    ];
  },

  async redirects() {
    return [
      ...OLD_SYSTEM_QUERY_KEYS.map((key) => ({
        source: "/",
        has: [{ type: "query" as const, key }],
        destination: "/old",
        permanent: false,
      })),
      ...OLD_SYSTEM_ROUTES.map((route) => ({ source: route, destination: `/old${route}`, permanent: false })),
      { source: "/new", destination: "/", permanent: false },
    ];
  },

  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [
        { source: "/old", destination: "/old/index.html" },
        { source: "/old/:path*", destination: "/old/index.html" },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
