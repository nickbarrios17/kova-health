/** @type {import('next').NextConfig} */
const nextConfig = {
  // The shared packages ship TypeScript sources.
  transpilePackages: ['@kova/api-client', '@kova/domain'],
  // No ESLint config in the repo yet; type safety is enforced by `npm run typecheck`.
  eslint: { ignoreDuringBuilds: true },
  // The phone app built for the browser lives in public/m (scripts/build-mobile-web.mjs, docs/web-celular.md).
  async rewrites() {
    return [{ source: '/m', destination: '/m/index.html' }];
  },
  webpack(config) {
    // Shared packages import siblings as './x.js' (ESM style) while the files are .ts.
    config.resolve.extensionAlias = { '.js': ['.ts', '.tsx', '.js'] };
    return config;
  },
};

export default nextConfig;
