import type { NextConfig } from "next";

// Transformers is loaded at runtime, so the tracer cannot discover it.
// Include the Linux x64 native runtime used on Vercel without the other platforms.
const embeddingRuntimeFiles = [
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
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: false,
  // PDF exports read brand fonts + the logo from disk at runtime.
  outputFileTracingIncludes: {
    "/api/admin/**": ["./src/assets/fonts/**", "./public/prism-mark.png"],
    "/api/admin/un/kb": embeddingRuntimeFiles,
    "/api/admin/un/country": embeddingRuntimeFiles,
    "/api/admin/un/use-cases/*/profiles": embeddingRuntimeFiles,
    "/api/admin/un/use-cases/*/sop-structure": embeddingRuntimeFiles,
    "/api/admin/un/use-cases/*/pilot/sop": embeddingRuntimeFiles,
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
