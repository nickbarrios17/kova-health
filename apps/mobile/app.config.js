// Two variants of the app from the same code (docs/entornos.md):
// - production (default): «Kova Health», com.kovahealth.app, update channel "production".
// - prueba (APP_VARIANT=prueba): «Kova Health Prueba», com.kovahealth.app.prueba, channel "prueba",
//   amber icon. It installs beside the real app and talks to the test Supabase project (the
//   EXPO_PUBLIC_* values are set by the workflow when building or publishing it).
module.exports = ({ config }) => {
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
