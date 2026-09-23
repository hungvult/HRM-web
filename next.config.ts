import type { NextConfig } from "next";

const pageCacheHeaders = [
  {
    key: "Cache-Control",
    value: "no-store, max-age=0, must-revalidate",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/",
        headers: pageCacheHeaders,
      },
      {
        source: "/login",
        headers: pageCacheHeaders,
      },
      {
        source: "/accounts",
        headers: pageCacheHeaders,
      },
    ];
  },
  async redirects() {
    return [
      {
        source: "/",
        destination: "/login",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
