/**
 * Android back (button or edge-swipe gesture) inside the app. The innermost open thing handles it:
 * a dialog (its Modal's onRequestClose), then a sub-screen (routine editor, recalculation, live
 * session), then the tab (back to Hoy). Only on Hoy with nothing open does Android close the app.
 * Handlers added later run first, so a sub-screen registered after the shell wins.
 */
import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

/** While `active`, back runs `onBack` instead of leaving the current screen. */
export function useBack(active: boolean, onBack: () => void) {
  const ref = useRef(onBack);
  ref.current = onBack;
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      ref.current();
      return true;
    });
    return () => sub.remove();
  }, [active]);
}
