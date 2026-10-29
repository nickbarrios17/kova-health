/**
 * Kova Health's 3D mannequin (the <gym-mannequin> web component, apps/web/public/mannequin.js) in a
 * WebView: it draws on a canvas, with no network. Drag to rotate; the working muscles light up.
 */
import type { MannequinSpec } from '@kova/domain';
import { useMemo } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { MANNEQUIN_JS } from './mannequinSource';
import { r } from './theme';

// Attribute values come from exerciseAnimation(), already limited to [a-z0-9-].
const html = (a: MannequinSpec) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>html,body{margin:0;height:100%;background:#0f1019;overflow:hidden}gym-mannequin{display:block;width:100vw;height:100vh}</style></head>
<body><gym-mannequin slug="${a.slug}" muscle="${a.muscle}" equipment="${a.equipment}" category="${a.category}" layer="muscles" view="34"></gym-mannequin>
<script>${MANNEQUIN_JS}</script></body></html>`;

export function MannequinView({ spec, height = 260 }: { spec: MannequinSpec; height?: number }) {
  const source = useMemo(() => ({ html: html(spec) }), [spec.slug, spec.muscle, spec.equipment, spec.category]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ height, borderRadius: r.lg, overflow: 'hidden', backgroundColor: '#0f1019' }}>
      <WebView source={source} originWhitelist={['about:blank']} scrollEnabled={false} bounces={false} overScrollMode="never"
        javaScriptEnabled domStorageEnabled={false} allowFileAccess={false} setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={(req) => req.url === 'about:blank'} style={{ backgroundColor: '#0f1019' }}
        accessibilityLabel="Modelo 3D del ejercicio" />
    </View>
  );
}
