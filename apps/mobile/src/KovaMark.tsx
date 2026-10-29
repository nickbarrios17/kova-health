/** Kova Health mark ("Cinta Vital"); same geometry as design/brand/kova-mark.svg and the web KovaMark. */
import Svg, { Defs, G, Mask, Path, Rect } from 'react-native-svg';

const BACK = 'M 326 140 L 216 250 C 192 274 180 296 180 330 L 180 362';
const FRONT = 'M 180 150 L 180 206 C 180 238 192 256 218 278 L 332 372';

export function KovaMark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="136 96 240 320" accessibilityElementsHidden importantForAccessibility="no">
      <Defs>
        <Mask id="kova-gap" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
          <Rect width="512" height="512" fill="#fff" />
          <Path d={FRONT} fill="none" stroke="#000" strokeWidth={80} strokeLinecap="round" />
        </Mask>
      </Defs>
      <G fill="none" strokeWidth={56} strokeLinecap="round" strokeLinejoin="round">
        <Path d={BACK} stroke="#5D5294" mask="url(#kova-gap)" />
        <Path d={FRONT} stroke="#9184D9" />
      </G>
    </Svg>
  );
}
