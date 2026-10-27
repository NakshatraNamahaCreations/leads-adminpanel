import type { NextConfig } from "next";

// Static export (`out/` folder) is applied only for Netlify builds, which set
// NETLIFY=true. The live panel runs on our own server with pm2 `next start`,
// which cannot serve a static export (its script chunks 500 and the panel hangs
// on "loading"), so a normal server build is used there. Netlify rewrites in
// netlify.toml serve a prerendered shell for any non-enumerated ID, and
// `useParams()` reads the real id from the URL.
const nextConfig: NextConfig = {
  ...(process.env.NETLIFY === "true" ? { output: "export" as const } : {}),
  // CKEditor 5 ships CommonJS that Turbopack chokes on unless we explicitly
  // transpile it through the Next.js pipeline.
  transpilePackages: ["@ckeditor/ckeditor5-react", "@ckeditor/ckeditor5-build-classic"],
};

export default nextConfig;
