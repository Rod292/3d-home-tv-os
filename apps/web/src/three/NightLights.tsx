import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { pointInPolygon, type Vec3 } from "@appart3d/scene";
import { useStore } from "../state/store";
import { daylightTarget, NIGHT_TRANSITION, nightFx } from "../state/night";
import { homeLightMap, lampSources, MAX_NIGHT_LIGHTS, pickKeyLight, selectLights, sourceFactor, stripSource, type LampSource } from "../lib/nightLights";
import { useHome } from "../state/home";
import { hasStripGlow, type GlowLook } from "../lib/home";
import { smoothstep } from "../lib/slideshow";

/**
 * Emissive multipliers applied at night to the catalog's shared materials, found by name
 * (`appart3d:<hex>|<role>|<highlight>`, see packages/catalog theme.ts) so the catalog stays untouched.
 */
const NIGHT_EMISSIVE: Record<string, number> = { glow: 2.1, screen: 2.6, mirror: 0.3 };
const ROLE_RE = /^appart3d:[^|]*\|(glow|screen|mirror)\|/;

type Emissive = THREE.Material & { emissiveIntensity: number };

/** Blend target: the sun (Maison, `auto`), else the Jour / Nuit flag (always the flag in the slideshow). */
function blendTarget(): { progress: number; dusk: number } {
  const s = useStore.getState();
  return s.slideshow ? { progress: s.night ? 1 : 0, dusk: 0 } : daylightTarget(s.daylight, s.sunElevation, s.night);
}

/**
 * Eases `nightFx.mix` toward the store's day / night target (continuous with the sun: dusk is a
 * partial blend) and boosts self-lit materials accordingly.
 */
export function NightController() {
  const night = useStore((s) => s.night);
  const daylight = useStore((s) => s.daylight);
  const sunElevation = useStore((s) => s.sunElevation);
  const slideshow = useStore((s) => s.slideshow);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);
  const tracked = useRef(new Map<Emissive, number>());
  const scanIn = useRef(0);
  const applied = useRef(-1);

  // Page loaded at night: no transition.
  useLayoutEffect(() => {
    const t = blendTarget();
    nightFx.progress = t.progress;
    nightFx.mix = smoothstep(t.progress);
    nightFx.dusk = t.dusk;
  }, []);
  useEffect(() => invalidate(), [night, daylight, sunElevation, slideshow, invalidate]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const { progress: target, dusk } = blendTarget();
    const step = dt / NIGHT_TRANSITION;
    if (nightFx.progress !== target) {
      nightFx.progress = target > nightFx.progress ? Math.min(target, nightFx.progress + step) : Math.max(target, nightFx.progress - step);
      nightFx.mix = smoothstep(nightFx.progress);
      invalidate();
    }
    if (nightFx.dusk !== dusk) {
      nightFx.dusk = dusk > nightFx.dusk ? Math.min(dusk, nightFx.dusk + step) : Math.max(dusk, nightFx.dusk - step);
      invalidate();
    }
    let found = false;
    scanIn.current -= dtRaw;
    if (scanIn.current <= 0 && (nightFx.mix > 0 || applied.current > 0)) {
      scanIn.current = 0.6;
      scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as Emissive | Emissive[] | undefined;
        if (!m || Array.isArray(m) || tracked.current.has(m)) return;
        const role = ROLE_RE.exec(m.name)?.[1];
        if (!role || typeof m.emissiveIntensity !== "number") return;
        // Ghost clones copy userData: they inherit the day value of their source.
        if (typeof m.userData.nightBase !== "number") m.userData.nightBase = m.emissiveIntensity;
        tracked.current.set(m, NIGHT_EMISSIVE[role]!);
        found = true;
      });
    }
    if (found || applied.current !== nightFx.mix) {
      applied.current = nightFx.mix;
      for (const [m, boost] of tracked.current) m.emissiveIntensity = (m.userData.nightBase as number) * (1 + (boost - 1) * nightFx.mix);
      if (found) invalidate();
    }
  });
  return null;
}

/**
 * Real lights exist only once night (or the Maison mode) has been used in this session (no cost for
 * day-only users). In Maison mode the lamps follow their linked devices instead of "all on at night".
 */
export function NightLights() {
  const items = useStore((s) => s.scene.items);
  const walls = useStore((s) => s.scene.walls);
  const rooms = useStore((s) => s.scene.rooms);
  const homeMode = useStore((s) => s.mode === "home");
  const byItem = useHome((s) => s.byItem);
  const wanted = useStore((s) => s.night || s.slideshow || s.mode === "home");
  const [armed, setArmed] = useState(wanted);
  useEffect(() => {
    if (wanted) setArmed(true);
  }, [wanted]);
  // Light strips linked to screens get their own source (only while in Maison mode).
  const stripIds = useMemo(() => {
    if (!homeMode) return "";
    const ids: string[] = [];
    for (const [itemId, devices] of byItem) if (hasStripGlow(devices)) ids.push(itemId);
    return ids.sort().join(",");
  }, [homeMode, byItem]);
  const sources = useMemo(() => {
    const base = lampSources({ items, walls, rooms });
    if (!stripIds) return base;
    const ids = new Set(stripIds.split(","));
    const strips = items.filter((it) => ids.has(it.id) && (it.category === "television" || it.category === "monitor")).map((it) => stripSource(it, { walls, rooms }));
    return [...strips, ...base];
  }, [items, walls, rooms, stripIds]);
  const home = useMemo(() => (homeMode ? homeLightMap(sources, byItem) : null), [homeMode, sources, byItem]);
  if (!armed || sources.length === 0) return null;
  return <LampRig sources={sources} home={home} />;
}

interface Slot {
  light: THREE.PointLight;
  src: LampSource | null;
  level: number;
}

const ray = new THREE.Raycaster();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const center = new THREE.Vector2(0, 0);
const hit = new THREE.Vector3();

/**
 * A fixed pool of point lights (count never changes while the lamps stay the same, so shaders are
 * not recompiled) reassigned to the most relevant lamps around what the camera looks at, with
 * soft fades; plus one shadow-casting spot under the key overhead light.
 */
function LampRig({ sources, home }: { sources: LampSource[]; home: Map<string, GlowLook | null> | null }) {
  const rooms = useStore((s) => s.scene.rooms);
  const invalidate = useThree((s) => s.invalidate);
  const count = Math.min(MAX_NIGHT_LIGHTS, sources.length);
  const slots = useMemo<Slot[]>(
    () =>
      Array.from({ length: count }, () => {
        const light = new THREE.PointLight("#ffb46b", 0, 6, 1.6);
        light.castShadow = false;
        return { light, src: null, level: 0 };
      }),
    [count],
  );
  useEffect(() => () => slots.forEach((s) => s.light.dispose()), [slots]);
  const hasOverhead = sources.some((s) => s.overhead);
  const spot = useMemo(() => {
    const l = new THREE.SpotLight("#ffb46b", 0, 8, 1.05, 0.9, 1.5);
    l.castShadow = true;
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.bias = -0.0008;
    l.shadow.normalBias = 0.03;
    l.shadow.radius = 6;
    l.shadow.camera.near = 0.05;
    l.shadow.camera.far = 8;
    return l;
  }, []);
  useEffect(() => () => spot.dispose(), [spot]);

  const desired = useRef<LampSource[]>([]);
  const key = useRef<{ src: LampSource | null; next: LampSource | null; level: number }>({ src: null, next: null, level: 0 });
  const selectIn = useRef(0);
  const dirty = useRef(true);
  const homeRef = useRef(home);
  homeRef.current = home;
  useEffect(() => {
    dirty.current = true;
    selectIn.current = 0;
    invalidate();
  }, [sources, home, invalidate]);

  useFrame(({ camera, clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const mix = nightFx.mix;
    const home = homeRef.current;
    if (mix === 0 && !dirty.current && !home) return;
    // Maison mode: only sources that actually give light compete for the real lights.
    const lit = (s: LampSource) => sourceFactor(home?.get(s.itemId), mix) > 0;
    dirty.current = false;

    selectIn.current -= dt;
    if (selectIn.current <= 0) {
      selectIn.current = 0.5;
      // What the camera looks at: standing inside → where it stands; above → the ground at screen center.
      let focus: Vec3;
      if (camera.position.y < 3) focus = [camera.position.x, 0, camera.position.z];
      else {
        ray.setFromCamera(center, camera);
        focus = ray.ray.intersectPlane(ground, hit) ? [hit.x, 0, hit.z] : [camera.position.x, 0, camera.position.z];
      }
      const room = rooms.find((r) => pointInPolygon([focus[0], focus[2]], r.floor));
      desired.current = selectLights(home ? sources.filter(lit) : sources, focus, room?.id, count);
      key.current.next = pickKeyLight(desired.current, focus) ?? null;
    }

    let moving = false;
    const want = new Set(desired.current.map((s) => s.itemId));
    const taken = new Set(slots.filter((s) => s.src && want.has(s.src.itemId)).map((s) => s.src!.itemId));
    const queue = desired.current.filter((s) => !taken.has(s.itemId));
    const t = clock.elapsedTime;
    for (const slot of slots) {
      if (slot.src && !sources.includes(slot.src)) slot.src = sources.find((s) => s.itemId === slot.src!.itemId) ?? null;
      if (slot.src && want.has(slot.src.itemId)) {
        if (slot.level < 1) {
          slot.level = Math.min(1, slot.level + dt * 2.5);
          moving = true;
        }
      } else if (slot.src && slot.level > 0) {
        slot.level = Math.max(0, slot.level - dt * 3);
        moving = true;
      } else {
        slot.src = queue.shift() ?? null;
        slot.level = 0;
        if (slot.src) {
          const l = slot.light;
          l.position.set(...slot.src.position);
          l.color.set(slot.src.color);
          l.distance = slot.src.distance;
          l.decay = slot.src.decay;
          moving = true;
        }
      }
      let f = 1;
      if (slot.src?.flicker) {
        f = 0.82 + 0.1 * Math.sin(t * 7.3) + 0.06 * Math.sin(t * 13.1 + 1.7) + 0.04 * Math.sin(t * 23.7);
        moving = true;
      }
      const look = slot.src ? home?.get(slot.src.itemId) : undefined;
      if (slot.src) slot.light.color.set(look ? look.color : slot.src.color);
      slot.light.intensity = slot.src ? slot.src.intensity * slot.level * sourceFactor(look, mix) * f : 0;
    }

    // Key light (shadows): fades out, moves, fades in.
    const kk = key.current;
    if (kk.src && kk.next && kk.src.itemId === kk.next.itemId) {
      kk.src = kk.next;
      if (kk.level < 1) {
        kk.level = Math.min(1, kk.level + dt * 2);
        moving = true;
      }
    } else if (kk.level > 0) {
      kk.level = Math.max(0, kk.level - dt * 3);
      moving = true;
    } else {
      kk.src = kk.next;
    }
    if (kk.src) {
      spot.position.set(kk.src.position[0], kk.src.bottomY - 0.03, kk.src.position[2]);
      spot.target.position.set(kk.src.position[0], 0, kk.src.position[2]);
      spot.target.updateMatrixWorld();
      spot.color.set(home?.get(kk.src.itemId)?.color ?? kk.src.color);
    }
    spot.intensity = kk.src ? kk.src.intensity * 1.1 * kk.level * sourceFactor(home?.get(kk.src.itemId), mix) : 0;
    if (moving) invalidate();
  });

  return (
    <>
      {slots.map((s, i) => (
        <primitive key={i} object={s.light} />
      ))}
      {hasOverhead && (
        <>
          <primitive object={spot} />
          <primitive object={spot.target} />
        </>
      )}
    </>
  );
}
