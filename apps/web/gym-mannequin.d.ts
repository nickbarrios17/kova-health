// <gym-mannequin>, Kova Health's 3D mannequin web component (public/mannequin.js).
import type { CSSProperties } from 'react';

declare module 'react' {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace JSX {
    interface IntrinsicElements {
      'gym-mannequin': {
        slug?: string; muscle?: string; equipment?: string; category?: string;
        layer?: 'normal' | 'muscles'; view?: 'front' | '34' | 'side' | 'back'; paused?: 'true' | 'false'; speed?: string;
        style?: CSSProperties;
      };
    }
  }
}
