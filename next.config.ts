import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components (Next.js 16's new default caching model) is turned
  // OFF deliberately. Nearly every route in this app reads live,
  // request-specific data (address search results, auth-gated admin
  // screens, designation lookups keyed on query params) with little to
  // gain from static prerendering, and Cache Components requires careful
  // `use cache` / Suspense-boundary placement around every dynamic read to
  // avoid build-time errors. Opting out keeps the whole app on the
  // simpler, fully-dynamic-by-default rendering model and removes a class
  // of subtle prerendering bugs. Revisit if/when specific pages (e.g. a
  // static "About" or methodology page) would clearly benefit from it.
  cacheComponents: false,
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
