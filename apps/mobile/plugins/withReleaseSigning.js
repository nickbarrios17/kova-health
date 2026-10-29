// Expo config plugin: release builds are signed with Kova Health's own key when its environment variables
// are present at Gradle time (GitHub Actions, or a local build that exports them), and with the
// debug key otherwise. Android only installs an update signed with the same key as the installed
// app, so every published APK must use the release key. KOVA_VERSION_CODE (set by CI) becomes the
// versionCode the in-app updater compares against. See docs/android.md → "Actualizaciones".
const { withAppBuildGradle } = require('expo/config-plugins');

module.exports = function withReleaseSigning(config) {
  const code = Number(process.env.KOVA_VERSION_CODE);
  if (Number.isInteger(code) && code > 0) config.android = { ...config.android, versionCode: code };

  return withAppBuildGradle(config, (cfg) => {
    const marker = '// kova:release-signing';
    let g = cfg.modResults.contents;
    if (g.includes(marker)) return cfg;
    g = g.replace(
      /signingConfigs\s*\{/,
      `signingConfigs {
        ${marker}
        release {
            if (System.getenv('KOVA_KEYSTORE_FILE')) {
                storeFile file(System.getenv('KOVA_KEYSTORE_FILE'))
                storePassword System.getenv('KOVA_KEYSTORE_PASSWORD')
                keyAlias System.getenv('KOVA_KEY_ALIAS')
                keyPassword System.getenv('KOVA_KEY_PASSWORD')
            }
        }`,
    );
    // The release build type points at the debug key in the template; switch it when the key exists.
    g = g.replace(
      /(release\s*\{[^{}]*?)signingConfig signingConfigs\.debug/,
      "$1signingConfig System.getenv('KOVA_KEYSTORE_FILE') ? signingConfigs.release : signingConfigs.debug",
    );
    cfg.modResults.contents = g;
    return cfg;
  });
};
