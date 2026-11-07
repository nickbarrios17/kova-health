/** The cycling map in a WebView (routeMapHtml.ts). The browser version is RouteMap.web.tsx. */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { ROUTE_MAP_HTML } from './routeMapHtml';
import { r } from './theme';

export interface MapData {
  routes: Array<{ coords: Array<number[]>; segments: Array<{ from: number; to: number; kind: string }>; selected: boolean }>;
  parks: Array<{ rings: Array<Array<[number, number]>> }>;
  markers: Array<{ coord: [number, number]; kind: 'start' | 'end' | 'stop' | 'me' }>;
  fit?: boolean;
  view3d?: boolean;
  fly?: boolean;
}
export interface MapEvents {
  onTap?: (coord: [number, number]) => void;
  onPick?: (index: number) => void;
  onFlyEnd?: () => void;
}

const SOURCE = { html: ROUTE_MAP_HTML, baseUrl: 'https://kova-health.vercel.app/' };

export function RouteMap({ data, height, ...events }: { data: MapData; height: number } & MapEvents) {
  const ref = useRef<ComponentRef<typeof WebView>>(null);
  const [ready, setReady] = useState(false);
  const ev = useRef(events);
  ev.current = events;
  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(`window.kovaMap(${JSON.stringify(data)});true;`);
  }, [ready, data]);
  return (
    <View style={{ height, borderRadius: r.lg, overflow: 'hidden', backgroundColor: '#0f1019' }}>
      <WebView ref={ref} source={SOURCE} originWhitelist={['*']} javaScriptEnabled domStorageEnabled
        allowFileAccess={false} setSupportMultipleWindows={false} overScrollMode="never" bounces={false}
        // The map loads tiles and its library, but never navigates away.
        onShouldStartLoadWithRequest={(req) => req.url === SOURCE.baseUrl || req.url.startsWith('about:')}
        onMessage={(e) => {
          try {
            const m = JSON.parse(e.nativeEvent.data);
            if (m.type === 'ready') setReady(true);
            else if (m.type === 'tap') ev.current.onTap?.(m.coord);
            else if (m.type === 'pick') ev.current.onPick?.(m.index);
            else if (m.type === 'flyEnd') ev.current.onFlyEnd?.();
          } catch { /* ignore */ }
        }}
        style={{ backgroundColor: '#0f1019' }} accessibilityLabel="Mapa de la ruta" />
    </View>
  );
}
