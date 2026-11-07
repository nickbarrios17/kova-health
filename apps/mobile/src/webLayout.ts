/**
 * Web build of the phone app (docs/web-celular.md). The same address serves the desktop web and this
 * app: narrow screens get this one (apps/web/app/layout.tsx sends them to /m/), wide screens the
 * desktop. A person can pick the other one; that choice is a per-browser convenience in localStorage.
 */
import { Platform } from 'react-native';

export const PREFER_DESKTOP_KEY = 'kova:prefer-desktop';
const WIDE = 1024;

const store = (value: string | null) => {
  try {
    if (value == null) localStorage.removeItem(PREFER_DESKTOP_KEY);
    else localStorage.setItem(PREFER_DESKTOP_KEY, value);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
};

/** «Ver la versión de escritorio» (Ajustes, web only). */
export function openDesktop() {
  if (Platform.OS !== 'web') return;
  store('1');
  window.location.assign('/');
}

/** On a wide screen, the desktop web fits better (unless the address asks for this one with ?celular). */
export function sendWideScreensToDesktop() {
  if (Platform.OS !== 'web') return;
  if (new URLSearchParams(window.location.search).has('celular')) return store(null);
  if (window.innerWidth >= WIDE) window.location.replace('/');
}
