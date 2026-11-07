/** The cycling map in the browser (docs/web-celular.md): the same page as the phone, in an iframe. */
import { createElement, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { MAP_BG, ROUTE_MAP_HTML } from './routeMapHtml';
import { r } from './theme';
import type { MapData, MapEvents, NavPos, Ride } from './RouteMap';

export type { MapData, MapEvents, NavPos, Ride } from './RouteMap';

export function RouteMap({ data, ride = null, nav = null, height, ...events }: { data: MapData; ride?: Ride | null; nav?: NavPos | null; height: number } & MapEvents) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const ev = useRef(events);
  ev.current = events;
  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.source !== ref.current?.contentWindow || typeof e.data?.kovaMap !== 'string') return;
      try {
        const m = JSON.parse(e.data.kovaMap);
        if (m.type === 'ready') setReady(true);
        else if (m.type === 'tap') ev.current.onTap?.(m.coord);
        else if (m.type === 'pick') ev.current.onPick?.(m.index);
        else if (m.type === 'flyEnd') ev.current.onFlyEnd?.();
        else if (m.type === 'rideProgress') ev.current.onRideProgress?.(m.done_m, m.total_m);
      } catch { /* ignore */ }
    };
    window.addEventListener('message', on);
    return () => window.removeEventListener('message', on);
  }, []);
  useEffect(() => {
    if (ready) ref.current?.contentWindow?.postMessage({ kovaMapIn: JSON.stringify(data) }, '*');
  }, [ready, data]);
  useEffect(() => {
    if (ready) ref.current?.contentWindow?.postMessage({ kovaRideIn: JSON.stringify(ride) }, '*');
  }, [ready, ride]);
  useEffect(() => {
    if (ready) ref.current?.contentWindow?.postMessage({ kovaNavIn: JSON.stringify(nav) }, '*');
  }, [ready, nav]);
  return (
    <View style={{ height, borderRadius: r.lg, overflow: 'hidden', backgroundColor: MAP_BG }}>
      {createElement('iframe', {
        ref, srcDoc: ROUTE_MAP_HTML, title: 'Mapa de la ruta', sandbox: 'allow-scripts',
        style: { border: 0, width: '100%', height: '100%', display: 'block' },
      })}
    </View>
  );
}
