import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/r',
        destination: '/registro',
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
