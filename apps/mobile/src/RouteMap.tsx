/** The cycling map in a WebView (routeMapHtml.ts). The browser version is RouteMap.web.tsx. */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { MAP_BG, ROUTE_MAP_HTML } from './routeMapHtml';
import { r } from './theme';

export interface MapData {
  routes: Array<{ coords: Array<number[]>; segments: Array<{ from: number; to: number; kind: string }>; selected: boolean }>;
  parks: Array<{ rings: Array<Array<[number, number]>> }>;
  markers: Array<{ coord: [number, number]; kind: 'start' | 'end' | 'stop' | 'me' }>;
  fit?: boolean;
  view3d?: boolean;
}
/** «Recorrer en 3D» on the selected route: map speed in km/h, and whether it is paused. */
export interface Ride { kmh: number; paused: boolean }
/** Navigation mode: your GPS position, heading and speed, once per fix. */
export interface NavPos { pos: [number, number]; bearing: number; kmh: number }
export interface MapEvents {
  onTap?: (coord: [number, number]) => void;
  onPick?: (index: number) => void;
  onFlyEnd?: () => void;
  onRideProgress?: (doneM: number, totalM: number) => void;
}

const SOURCE = { html: ROUTE_MAP_HTML, baseUrl: 'https://kova-health.vercel.app/' };

export function RouteMap({ data, ride = null, nav = null, height, ...events }: { data: MapData; ride?: Ride | null; nav?: NavPos | null; height: number } & MapEvents) {
  const ref = useRef<ComponentRef<typeof WebView>>(null);
  const [ready, setReady] = useState(false);
  const ev = useRef(events);
  ev.current = events;
  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(`window.kovaMap(${JSON.stringify(data)});true;`);
  }, [ready, data]);
  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(`window.kovaRide(${JSON.stringify(ride)});true;`);
  }, [ready, ride]);
  useEffect(() => {
    if (ready) ref.current?.injectJavaScript(`window.kovaNav(${JSON.stringify(nav)});true;`);
  }, [ready, nav]);
  return (
    <View style={{ height, borderRadius: r.lg, overflow: 'hidden', backgroundColor: MAP_BG }}>
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
            else if (m.type === 'rideProgress') ev.current.onRideProgress?.(m.done_m, m.total_m);
          } catch { /* ignore */ }
        }}
        style={{ backgroundColor: MAP_BG }} accessibilityLabel="Mapa de la ruta" />
    </View>
  );
}
