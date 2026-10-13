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
        // The int8 model is versioned by file name (rename it when the weights change), so it can be cached for good.
        source: "/models/instanthmr-int8.onnx",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
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
    ];
  },
};

export default nextConfig;
