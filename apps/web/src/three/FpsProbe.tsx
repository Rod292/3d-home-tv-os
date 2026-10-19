import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/**
 * `?stats=1`: logs rendering stats every 5 s to the console (Android logcat shows WebView console
 * lines: `adb logcat | grep appart3d-stats`). For tuning the TV launcher's 3D on its modest GPU.
 */
export function FpsProbe() {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  useFrame(() => {
    frames.current++;
  });
  useEffect(() => {
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      const fps = (frames.current * 1000) / (now - last);
      frames.current = 0;
      last = now;
      const c = gl.domElement;
      const r = gl.info.render;
      console.info(`[appart3d-stats] fps=${fps.toFixed(1)} canvas=${c.width}x${c.height} dpr=${gl.getPixelRatio().toFixed(2)} calls=${r.calls} tris=${r.triangles}`);
    }, 5000);
    return () => clearInterval(id);
  }, [gl]);
  return null;
}
