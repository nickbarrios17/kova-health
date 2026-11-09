/**
 * Web build of the phone app (docs/web-celular.md): the same mannequin page as MannequinView.tsx, in a
 * sandboxed iframe instead of a WebView (scripts only: no same-origin access, no navigation).
 */
import type { MannequinSpec } from '@kova/domain';
import { createElement, useMemo } from 'react';
import { View } from 'react-native';
import { MANNEQUIN_JS } from './mannequinSource';
import { rad } from './theme';

const html = (a: MannequinSpec) => `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#0f1019;overflow:hidden}gym-mannequin{display:block;width:100vw;height:100vh}</style></head>
<body><gym-mannequin slug="${a.slug}" muscle="${a.muscle}" equipment="${a.equipment}" category="${a.category}" layer="muscles" view="34"></gym-mannequin>
<script>${MANNEQUIN_JS}</script></body></html>`;

export function MannequinView({ spec, height = 260 }: { spec: MannequinSpec; height?: number }) {
  const srcDoc = useMemo(() => html(spec), [spec.slug, spec.muscle, spec.equipment, spec.category]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ height, borderRadius: rad.card, overflow: 'hidden', backgroundColor: '#0f1019' }}>
      {createElement('iframe', {
        srcDoc, sandbox: 'allow-scripts', title: 'Modelo 3D del ejercicio',
        style: { border: 0, width: '100%', height: '100%', background: '#0f1019', touchAction: 'none' },
      })}
    </View>
  );
}
