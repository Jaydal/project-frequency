/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    // Avoid loading the entire icon catalog for each route during Turbopack
    // startup/builds. Imports remain source-compatible (e.g. { Calendar }).
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
