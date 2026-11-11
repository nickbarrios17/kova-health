// Two variants of the app from the same code (docs/entornos.md):
// - production (default): «Kova Health», com.kovahealth.app, update channel "production".
// - prueba (APP_VARIANT=prueba): «Kova Health Prueba», com.kovahealth.app.prueba, channel "prueba",
//   amber icon. It installs beside the real app and talks to the test Supabase project (the
//   EXPO_PUBLIC_* values are set by the workflow when building or publishing it).
// The web build (docs/web-celular.md) is served under /m/ of the web app: EXPO_WEB_BASE_URL=/m.
module.exports = ({ config }) => {
  if (process.env.EXPO_WEB_BASE_URL) config = { ...config, experiments: { ...config.experiments, baseUrl: process.env.EXPO_WEB_BASE_URL } };
  // Emulator build against the local Supabase (branch emulador/*): plain http to 10.0.2.2 and no OTA.
  if (process.env.KOVA_EMULATOR_LOCAL === '1') {
    config = {
      ...config,
      updates: { ...config.updates, enabled: false },
      plugins: (config.plugins ?? []).map((pl) => (Array.isArray(pl) && pl[0] === 'expo-build-properties'
        ? [pl[0], { ...pl[1], android: { ...pl[1].android, usesCleartextTraffic: true } }] : pl)),
    };
  }
  if (process.env.APP_VARIANT !== 'prueba') return config;
  return {
    ...config,
    name: 'Kova Health Prueba',
    scheme: 'kovahealthprueba',
    icon: './assets/icon-prueba.png',
    ios: { ...config.ios, bundleIdentifier: 'com.kovahealth.app.prueba' },
    android: {
      ...config.android,
      package: 'com.kovahealth.app.prueba',
      adaptiveIcon: { ...config.android.adaptiveIcon, backgroundColor: '#4A300C', backgroundImage: './assets/android-icon-background-prueba.png' },
    },
    updates: { ...config.updates, requestHeaders: { 'expo-channel-name': 'prueba' } },
  };
};
