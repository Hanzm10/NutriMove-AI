import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents is off on purpose: most screens read the Supabase session,
  // and plain dynamic rendering keeps the mental model simple (see AGENTS.md).
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        // Cross-origin isolation enables multi-threaded WASM for onnxruntime-web
        // on the pose screens only (PRD §9.1).
        source: "/(workout|dev)/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
      {
        // Workers spawned from cross-origin-isolated pages (ORT pthreads, our pose worker chunk)
        // must be served with COEP themselves.
        source: "/(ort|_next/static)/:path*",
        headers: [
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
          { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
        ],
      },
      {
        // Baseline hardening for every route (docs/security.md). A full script-src CSP needs per-request nonces
        // for Next's inline bootstrap scripts, so only the directives that can't break the app are enforced here.
        // (not /sw.js: it has its own stricter CSP above)
        source: "/:path((?!sw\\.js$).*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=()" },
          { key: "Content-Security-Policy", value: "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
