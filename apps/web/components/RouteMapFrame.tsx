'use client';
/** The cycling map (docs/ciclismo.md) on the desktop web: the same page as the phone, in a sandboxed iframe. */
import { MAP_BG, ROUTE_MAP_HTML, type SafetyZones } from '@kova/domain';
import { useEffect, useRef, useState } from 'react';

export interface MapData {
  routes: Array<{ coords: Array<number[]>; segments: Array<{ from: number; to: number; kind: string }>; selected: boolean }>;
  parks: Array<{ rings: Array<Array<[number, number]>> }>;
  markers: Array<{ coord: [number, number]; kind: 'start' | 'end' | 'stop' | 'me' }>;
  fit?: boolean;
  view3d?: boolean;
  zones?: SafetyZones | null;
  showZones?: boolean;
}
export interface Ride { kmh: number; paused: boolean }

export function RouteMapFrame({ data, ride = null, height, onTap, onPick, onFlyEnd, onRideProgress }: {
  data: MapData; ride?: Ride | null; height: number | string;
  onTap?: (coord: [number, number]) => void; onPick?: (index: number) => void; onFlyEnd?: () => void;
  onRideProgress?: (doneM: number, totalM: number) => void;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  const ev = useRef({ onTap, onPick, onFlyEnd, onRideProgress });
  ev.current = { onTap, onPick, onFlyEnd, onRideProgress };
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
  return (
    <div style={{ height, borderRadius: 'var(--kova-radius-xl)', overflow: 'hidden', background: MAP_BG }}>
      <iframe ref={ref} srcDoc={ROUTE_MAP_HTML} title="Mapa de la ruta" sandbox="allow-scripts"
        style={{ border: 0, width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
