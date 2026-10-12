import { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet } from "react-native";
import Svg, { type SvgProps } from "react-native-svg";

// Reuse decoded, immutable artwork across the preview and the native modal.
// Hardware layers alone cannot prevent a newly mounted SVG from rasterizing again.
const textures = new Map<string, string>();
const maximumTextures = 16;

export function MembershipCardTexture({ cacheKey, ...props }: SvgProps & { cacheKey: string }) {
  const svg = useRef<Svg>(null);
  const frame = useRef<number | null>(null);
  const alive = useRef(true);
  const laidOut = useRef(false);
  const capturing = useRef(false);
  const currentKey = useRef(cacheKey);
  currentKey.current = cacheKey;
  const [snapshot, setSnapshot] = useState(() => ({ key: cacheKey, uri: textures.get(cacheKey) }));
  const uri = snapshot.key === cacheKey ? snapshot.uri : textures.get(cacheKey);

  const capture = useCallback(() => {
    if (frame.current !== null || capturing.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      capturing.current = true;
      svg.current?.toDataURL?.((data) => {
        if (!alive.current || currentKey.current !== cacheKey) return;
        capturing.current = false;
        if (!data) return;
        const captured = `data:image/png;base64,${data}`;
        textures.delete(cacheKey);
        textures.set(cacheKey, captured);
        if (textures.size > maximumTextures) textures.delete(textures.keys().next().value!);
        setSnapshot({ key: cacheKey, uri: captured });
      });
    });
  }, [cacheKey]);

  useEffect(() => {
    alive.current = true;
    capturing.current = false;
    // A new viewBox does not necessarily change the native SVG's layout bounds.
    if (laidOut.current && !uri) capture();
    return () => {
      alive.current = false;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [cacheKey, uri, capture]);

  if (uri) {
    return (
      <Image
        source={{ uri }}
        resizeMode="stretch"
        fadeDuration={0}
        accessible={false}
        style={StyleSheet.absoluteFill}
      />
    );
  }
  return (
    <Svg
      {...props}
      ref={svg}
      onLayout={() => {
        laidOut.current = true;
        capture();
      }}
    />
  );
}
