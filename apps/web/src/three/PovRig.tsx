import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { pointInPolygon } from "@appart3d/scene";
import { useStore } from "../state/store";
import { useHome } from "../state/home";
import { embedAim, useEmbed } from "../state/embed";
import { cameraBus, povInput } from "../state/view";
import { aimedItem, SEATED_EYE, sofaPov, type AimCandidate, type Pov } from "../lib/embed";
import { boundsCenter, boundsOf } from "./rigCommon";
import { usePerspective } from "./PhotoRig";

const FOV = 52;
/** One press of ← / → turns this much (rad)… */
const STEP = (20 * Math.PI) / 180;
/** …and holding it keeps turning at this speed (rad/s). */
const TURN_SPEED = (45 * Math.PI) / 180;
/** Settling in: the view starts a bit higher and lowers onto the sofa over this time (s). */
const SIT_S = 1.1;
/** Screensaver drift: how far the head turns each way (rad) and one full look left-right-back (s). */
const DRIFT_AMPLITUDE = 0.9;
const DRIFT_PERIOD_S = 90;
/** Devices that OK switches when looked at (the TV, speakers… are left out). */
const SWITCHABLE = new Set(["light", "plug", "fan"]);

/**
 * Embedded view (TV), `pov` command: seated on the sofa, facing the TV. ← / → on the remote turn the
 * head (`povTurn`). With the mirrored home screen on the 3D TV, the TV shows itself inside itself.
 * The lamp in the middle of the view gets a halo and is reported to the TV, where OK switches it.
 */
export function PovRig() {
  const items = useStore((s) => s.scene.items);
  const walls = useStore((s) => s.scene.walls);
  const rooms = useStore((s) => s.scene.rooms);
  const camera = usePerspective(FOV);
  const invalidate = useThree((s) => s.invalidate);
  const pov = useMemo<Pov>(() => {
    const p = sofaPov(items);
    if (p) return p;
    const c = boundsCenter(boundsOf(walls, rooms));
    return { eye: [c.x, SEATED_EYE, c.z], yaw: 0, pitch: 0, hide: [] };
  }, [items, walls, rooms]);
  const drift = useEmbed((s) => s.povDrift);
  const look = useRef({ yaw: pov.yaw, target: pov.yaw, presses: povInput.presses, sit: 0, t: 0 });

  // Switchable items of the room the view is in (walls hide the others).
  const linked = useHome((s) => s.devices.filter((d) => d.itemId && SWITCHABLE.has(d.kind)).map((d) => d.itemId).join("|"));
  const candidates = useMemo<AimCandidate[]>(() => {
    const ids = new Set(linked.split("|"));
    const here = rooms.find((r) => pointInPolygon([pov.eye[0], pov.eye[2]], r.floor));
    return items
      .filter((i) => ids.has(i.id) && (!here || i.roomId === here.id || pointInPolygon([i.position[0], i.position[2]], here.floor)))
      .map((i) => ({ id: i.id, center: [i.position[0], i.position[1] + i.dimensions[1] / 2, i.position[2]], radius: Math.max(i.dimensions[0], i.dimensions[1], i.dimensions[2]) / 2 }));
  }, [linked, items, rooms, pov]);
  useEffect(() => () => embedAim(null), []);

  useLayoutEffect(() => {
    look.current = { yaw: pov.yaw, target: pov.yaw, presses: povInput.presses, sit: 0, t: 0 };
    invalidate();
  }, [pov, invalidate]);

  useEffect(() => cameraBus.on((cmd) => cmd.type === "wake" && invalidate()), [invalidate]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const l = look.current;
    // ← turns left: with forward (sin yaw, cos yaw), a larger yaw is to the left.
    if (povInput.presses !== l.presses) {
      l.presses = povInput.presses;
      l.target -= povInput.dir * STEP;
    }
    l.target -= povInput.dir * TURN_SPEED * dt;
    if (drift) {
      l.t += dt;
      l.target = pov.yaw + Math.sin((l.t / DRIFT_PERIOD_S) * Math.PI * 2) * DRIFT_AMPLITUDE;
    }
    l.yaw += (l.target - l.yaw) * (1 - Math.exp(-dt * 6));
    l.sit = Math.min(1, l.sit + dt / SIT_S);
    const k = 1 - Math.pow(1 - l.sit, 3);
    const lift = (1 - k) * 0.35;
    const [x, y, z] = pov.eye;
    camera.position.set(x, y + lift, z);
    const pitch = pov.pitch - (1 - k) * 0.12;
    camera.lookAt(x + Math.sin(l.yaw) * Math.cos(pitch), y + lift + Math.sin(pitch), z + Math.cos(l.yaw) * Math.cos(pitch));
    if (l.sit >= 1 && !drift) embedAim(aimedItem(pov.eye, l.yaw, pov.pitch, candidates));
    if (drift || povInput.dir !== 0 || Math.abs(l.target - l.yaw) > 0.0005 || l.sit < 1) invalidate();
  });

  return null;
}
