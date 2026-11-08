import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: false,
  // PDF exports read brand fonts + the logo from disk at runtime.
  outputFileTracingIncludes: {
    "/api/admin/**": ["./src/assets/fonts/**", "./public/prism-mark.png"],
    // Query embedding (src/lib/un/vector.ts) loads transformers.js through a
    // run-time import the tracer cannot see, so ship it explicitly, Linux x64
    // only (the all-platform onnxruntime-node is ~290 MB; this is ~100 MB, under
    // Vercel's ~250 MB function limit). Without it the route falls back to BM25.
    "/api/admin/un/kb": [
      "./node_modules/@huggingface/transformers/**",
      "./node_modules/@huggingface/jinja/**",
      "./node_modules/@huggingface/tokenizers/**",
      "./node_modules/onnxruntime-common/**",
      "./node_modules/onnxruntime-node/package.json",
      "./node_modules/onnxruntime-node/dist/**",
      "./node_modules/onnxruntime-node/bin/napi-v6/linux/x64/**",
      "./node_modules/sharp/**",
      "./node_modules/@img/sharp-linux-x64/**",
      "./node_modules/@img/sharp-libvips-linux-x64/**",
      "./node_modules/@img/colour/**",
      "./node_modules/detect-libc/**",
      "./node_modules/semver/**",
    ],
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
