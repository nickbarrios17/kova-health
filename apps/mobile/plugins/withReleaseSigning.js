// Expo config plugin: release builds are signed with VIDA's own key when its environment variables
// are present at Gradle time (GitHub Actions, or a local build that exports them), and with the
// debug key otherwise. Android only installs an update signed with the same key as the installed
// app, so every published APK must use the release key. VIDA_VERSION_CODE (set by CI) becomes the
// versionCode the in-app updater compares against. See docs/android.md → "Actualizaciones".
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withReleaseSigning(config) {
  const code = Number(process.env.VIDA_VERSION_CODE);
  if (Number.isInteger(code) && code > 0) config.android = { ...config.android, versionCode: code };

  return withAppBuildGradle(config, (cfg) => {
    const marker = '// vida:release-signing';
    let g = cfg.modResults.contents;
    if (g.includes(marker)) return cfg;
    g = g.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {
        ${marker}
        release {
            if (System.getenv('VIDA_KEYSTORE_FILE')) {
                storeFile file(System.getenv('VIDA_KEYSTORE_FILE'))
                storePassword System.getenv('VIDA_KEYSTORE_PASSWORD')
                keyAlias System.getenv('VIDA_KEY_ALIAS')
                keyPassword System.getenv('VIDA_KEY_PASSWORD')
            }
        }`,
    );
    // The release build type points at the debug key in the template; switch it when the key exists.
    g = g.replace(
      /(release\s*\{[^{}]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig System.getenv('VIDA_KEYSTORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    cfg.modResults.contents = g;
    return cfg;
  });
};
