// Expo config plugin: on Windows, native C++ object paths can exceed the 260-character limit
// (ninja: "Filename longer than 260 characters"). When VIDA_CXX_DIR is set at prebuild time, CMake's
// staging directory is moved to that short path. No effect when the variable is unset.
// See docs/android.md → "Compilar en Windows".
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withShortCxxDir(config) {
  const dir = process.env.VIDA_CXX_DIR;
  if (!dir) return config;
  return withAppBuildGradle(config, (cfg) => {
    const marker = '// vida:short-cxx-dir';
    if (cfg.modResults.contents.includes(marker)) return cfg;
    const block = `\n${marker}\nandroid { externalNativeBuild { cmake { buildStagingDirectory "${dir.replace(/\\/g, '/')}" } } }\n`;
    cfg.modResults.contents += block;
    return cfg;
  });
};
