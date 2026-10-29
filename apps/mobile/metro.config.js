// Expo's default Metro config already understands npm workspaces (SDK 52+). Two additions:
// 1. The shared @kova/* packages are resolved straight to their TypeScript sources (relative to this
//    repo), so builds also work when the repo is opened through a different drive letter/path
//    (e.g. `subst V:` to stay under Windows' 260-char limit) and the workspace symlink points elsewhere.
// 2. Inside those packages, ESM-style './x.js' imports map to the './x.ts' sources.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');
const fs = require('fs');

const repoRoot = path.resolve(__dirname, '../..');
const packagesDir = path.join(repoRoot, 'packages');
const sharedEntry = {
  '@kova/domain': path.join(packagesDir, 'domain/src/index.ts'),
  '@kova/api-client': path.join(packagesDir, 'api-client/src/index.ts'),
};

const config = getDefaultConfig(__dirname);
config.watchFolders = [...new Set([...(config.watchFolders ?? []), packagesDir])];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (sharedEntry[moduleName]) return { type: 'sourceFile', filePath: sharedEntry[moduleName] };
  const origin = context.originModulePath;
  if (moduleName.startsWith('.') && moduleName.endsWith('.js') && origin.startsWith(packagesDir)) {
    const candidate = path.resolve(path.dirname(origin), moduleName.replace(/\.js$/, '.ts'));
    if (fs.existsSync(candidate)) return { type: 'sourceFile', filePath: candidate };
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
