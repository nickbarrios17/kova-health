/** Exercise photos (start and end position) alternating like a short animation. */
import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { r } from './theme';

export function ExerciseFrames({ urls, height = 240 }: { urls: string[]; height?: number }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    setI(0);
    if (urls.length < 2) return;
    const iv = setInterval(() => setI((x) => (x + 1) % urls.length), 1100);
    return () => clearInterval(iv);
  }, [urls.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!urls.length) return null;
  return (
    <View style={{ height, borderRadius: r.lg, backgroundColor: '#fff', overflow: 'hidden' }}>
      {urls.map((u, n) => (
        <Image key={u} source={{ uri: u }} resizeMode="contain" accessibilityIgnoresInvertColors
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: n === i ? 1 : 0 }} />
      ))}
    </View>
  );
}

/** First photo of an exercise as a small square, for lists. */
export function ExerciseThumb({ url, size = 44 }: { url?: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: r.md, backgroundColor: url ? '#fff' : 'rgba(233,233,237,0.06)', overflow: 'hidden' }}>
      {url ? <Image source={{ uri: url }} resizeMode="cover" style={{ width: size, height: size }} accessibilityIgnoresInvertColors /> : null}
    </View>
  );
}
