import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components: opts the App Router into the `use cache` directive +
  // cacheTag/cacheLife. Currently only listReadyVideos is cached; other
  // pages (auth-gated dashboard, login flow) remain dynamic by default.
  cacheComponents: true,
};

export default nextConfig;
