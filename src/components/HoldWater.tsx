import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const RETREAT_S = 0.2; // released early: water pulls back
const RIPPLE_S = 0.3; // after the fill completes: one ripple, then fade
const FADE_S = 0.3;

const vertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

// Water enters from the left; its front edge and the trailing swell are waves. Alpha stays low so card text stays legible.
const fragment = /* glsl */ `
varying vec2 vUv;
uniform float uTime, uProgress, uRipple, uAlpha, uAspect;
uniform vec3 uColor;
void main() {
  float amp = 1.0 + 3.0 * uRipple;
  float y = vUv.y;
  float edge = uProgress * 1.12 - 0.06
    + amp * (0.018 * sin(y * 7.0 * 1.0 + uTime * 4.0) + 0.010 * sin(y * 17.0 - uTime * 6.0));
  float inside = 1.0 - smoothstep(edge - 0.004, edge + 0.004, vUv.x);
  float swell = 0.5 + 0.5 * sin(vUv.x * uAspect * 6.0 - uTime * 3.0 + y * 3.0);
  float depth = 0.14 + 0.10 * (1.0 - y) + 0.05 * swell * amp;
  float rim = (1.0 - smoothstep(0.0, 0.012, abs(vUv.x - edge))) * 0.28;
  float a = (inside * depth + rim * step(0.001, uProgress)) * uAlpha;
  gl_FragColor = vec4(uColor, a);
}`;

type Mode = "idle" | "hold" | "retreat" | "done";

/** Accent as raw sRGB (the shader writes colours as-is). */
function accentColor() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim().split(/\s+/);
  const [h = 210, s = 100, l = 40] = v.map((x) => parseFloat(x));
  return new THREE.Color().setHSL(h / 360, s / 100, l / 100, THREE.LinearSRGBColorSpace);
}

function Water({ holding, burst, ms }: { holding: boolean; burst: number; ms: number }) {
  const invalidate = useThree((s) => s.invalidate);
  const aspect = useThree((s) => s.size.width / Math.max(s.size.height, 1));
  const st = useRef({ mode: "idle" as Mode, t0: 0, p0: 0, p: 0, burst });
  const uniforms = useMemo(
    () => ({ uTime: { value: 0 }, uProgress: { value: 0 }, uRipple: { value: 0 }, uAlpha: { value: 1 }, uAspect: { value: 3 }, uColor: { value: new THREE.Color() } }),
    [],
  );

  const material = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, transparent: true, depthTest: false, depthWrite: false }),
    [uniforms],
  );
  useEffect(() => () => material.dispose(), [material]);

  useEffect(() => {
    const s = st.current;
    const now = performance.now() / 1000;
    if (burst !== s.burst) {
      s.burst = burst;
      s.mode = "done";
      s.t0 = now;
    } else if (holding && s.mode !== "hold") {
      uniforms.uColor.value.copy(accentColor());
      s.mode = "hold";
      s.t0 = now;
    } else if (!holding && s.mode === "hold") {
      s.mode = "retreat";
      s.p0 = s.p;
      s.t0 = now;
    }
    invalidate();
  }, [holding, burst, invalidate, uniforms]);

  useFrame(() => {
    const s = st.current;
    if (s.mode === "idle") return;
    const now = performance.now() / 1000;
    const d = now - s.t0;
    let ripple = 0;
    let alpha = 1;
    if (s.mode === "hold") s.p = Math.min(d / (ms / 1000), 1);
    else if (s.mode === "retreat") {
      s.p = Math.max(s.p0 - d / RETREAT_S, 0);
      if (s.p === 0) s.mode = "idle";
    } else {
      s.p = 1;
      ripple = d < RIPPLE_S ? Math.sin((Math.PI * d) / RIPPLE_S) : 0;
      alpha = d < RIPPLE_S ? 1 : 1 - (d - RIPPLE_S) / FADE_S;
      if (d >= RIPPLE_S + FADE_S) {
        s.mode = "idle";
        s.p = 0;
      }
    }
    uniforms.uTime.value = now % 1000;
    uniforms.uProgress.value = s.p;
    uniforms.uRipple.value = ripple;
    uniforms.uAlpha.value = Math.max(alpha, 0);
    uniforms.uAspect.value = aspect;
    if (s.mode !== "idle") invalidate();
    else {
      uniforms.uProgress.value = 0;
    }
  });

  return (
    <mesh frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

/** Water that fills its (positioned) parent. Draws only while a hold/ripple is in progress. */
export default function HoldWater(props: { holding: boolean; burst: number; ms: number }) {
  return (
    <Canvas dpr={[1, 1.5]} frameloop="demand" gl={{ alpha: true, antialias: false }} className="!absolute inset-0">
      <Water {...props} />
    </Canvas>
  );
}
