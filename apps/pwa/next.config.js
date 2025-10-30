/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // serverActions is now stable in Next.js 14+
  },
  // Enable server actions (stable in Next.js 14+)
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
