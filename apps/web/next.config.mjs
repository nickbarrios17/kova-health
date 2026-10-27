/** @type {import('next').NextConfig} */
const nextConfig = {
  // The shared packages ship TypeScript sources.
  transpilePackages: ['@vida/api-client', '@vida/domain'],
  // No ESLint config in the repo yet; type safety is enforced by `npm run typecheck`.
  eslint: { ignoreDuringBuilds: true },
  webpack(config) {
    // Shared packages import siblings as './x.js' (ESM style) while the files are .ts.
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};

export default nextConfig;
