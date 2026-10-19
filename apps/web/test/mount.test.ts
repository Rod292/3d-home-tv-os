import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { demoScene, wallAngle, wallNormal, wallSideOf, type Item, type Scene, type Wall } from "@appart3d/scene";
import {
  ceilingHeightAt,
  ceilingItemY,
  findHostWall,
  mountedPose,
  roomOfFace,
  roomWallFaces,
  snapToWall,
  WALL_GAP,
} from "../src/lib/mount";
import { itemCollisions } from "../src/lib/collision";
import { findFreeSpot, placeItem } from "../src/lib/placement";
import { buildWallGeometry, sideOfMaterialIndex, WALL_GROUP } from "../src/three/wallGeometry";

const close = (a: number, b: number, digits = 6) => expect(a).toBeCloseTo(b, digits);

// Two rooms side by side sharing the wall x = 4: A = [0,4]×[0,4], B = [4,7]×[0,4].
const T = 0.1;
const walls: Wall[] = [
  { id: "s", start: [0, 0], end: [7, 0], height: 2.6, thickness: T },
  { id: "e", start: [7, 0], end: [7, 4], height: 2.6, thickness: T },
  { id: "n", start: [7, 4], end: [0, 4], height: 2.6, thickness: T },
  { id: "w", start: [0, 4], end: [0, 0], height: 2.6, thickness: T },
  { id: "mid", start: [4, 0], end: [4, 4], height: 2.6, thickness: T },
];
const scene: Scene = {
  ...demoScene,
  rooms: [
    { id: "A", name: "A", kind: "bedroom", floor: [[0, 0], [4, 0], [4, 4], [0, 4]], floorMaterial: "wood" },
    { id: "B", name: "B", kind: "living", floor: [[4, 0], [7, 0], [7, 4], [4, 4]], floorMaterial: "wood" },
  ],
  walls,
  openings: [],
  items: [],
};
const mirror: Item = {
  id: "m",
  category: "mirror",
  mount: "wall",
  position: [2, 1.2, 0.1],
  rotationY: 0,
  dimensions: [0.6, 0.8, 0.03],
  source: "user",
};

describe("room wall faces", () => {
  it("picks the face looking into each room, so a shared wall gets one face per room", () => {
    const facesA = roomWallFaces(scene, scene.rooms[0]!);
    const facesB = roomWallFaces(scene, scene.rooms[1]!);
    const midA = facesA.find((f) => f.wallId === "mid")!;
    const midB = facesB.find((f) => f.wallId === "mid")!;
    expect(midA.side).toBe(wallSideOf(walls[4]!, [2, 2]));
    expect(midB.side).toBe(wallSideOf(walls[4]!, [5.5, 2]));
    expect(midA.side).not.toBe(midB.side);
    // Envelope walls: every listed face points to the room centre.
    for (const f of facesA) {
      const w = walls.find((x) => x.id === f.wallId)!;
      expect(f.side).toBe(wallSideOf(w, [2, 2]));
    }
    expect(roomOfFace(scene, walls[4]!, midA.side)?.id).toBe("A");
    expect(roomOfFace(scene, walls[4]!, midB.side)?.id).toBe("B");
  });
});

describe("host wall detection", () => {
  it("finds the wall a mirror's back touches and the flush pose", () => {
    const host = findHostWall(mirror, walls)!;
    expect(host.wallId).toBe("s");
    close(host.gap, 0.1 - T / 2 - 0.015);
    close(host.position[1], T / 2 + 0.015 + WALL_GAP);
    close(host.rotationY, 0); // faces +Z, into room A
  });

  it("accepts items sunk into the wall (scans) and uses the side they face", () => {
    const sunk: Item = { ...mirror, position: [4.01, 1.2, 2], rotationY: -Math.PI / 2 }; // faces -X → room A
    const host = findHostWall(sunk, walls)!;
    expect(host.wallId).toBe("mid");
    expect(host.position[0]).toBeLessThan(4 - T / 2);
    close(Math.sin(host.rotationY), -1);
  });

  it("ignores walls that are too far or not parallel", () => {
    expect(findHostWall({ ...mirror, position: [2, 1.2, 0.4] }, walls)).toBeUndefined();
    expect(findHostWall({ ...mirror, rotationY: Math.PI / 4 }, walls)).toBeUndefined();
    // Above the wall: not hosted.
    expect(findHostWall({ ...mirror, position: [2, 2.7, 0.1] }, walls)).toBeUndefined();
  });

  it("renders wall items flush on their host", () => {
    const pose = mountedPose({ ...mirror, position: [2, 1.2, 0.02] }, scene);
    expect(pose.hostWallId).toBe("s");
    close(pose.position[2], T / 2 + 0.015 + WALL_GAP);
    close(pose.position[1], 1.2);
  });
});

describe("wall-slide snapping", () => {
  it("slides along the nearest face, flush, facing away, keeping the height", () => {
    const r = snapToWall(mirror, 1.02, 0.6, scene)!;
    expect(r.wallId).toBe("s");
    close(r.position[0], 1.0);
    close(r.position[1], T / 2 + 0.015 + WALL_GAP);
    close(r.rotationY, 0);
    expect(r.y).toBe(1.2);
  });

  it("switches wall when the pointer gets closer to another one and clamps at its ends", () => {
    const r = snapToWall(mirror, 0.3, 3.95, scene)!;
    expect(r.wallId).toBe("n");
    close(r.position[1], 4 - T / 2 - 0.015 - WALL_GAP);
    close(Math.abs(r.rotationY), Math.PI); // faces -Z, into the room
    expect(r.position[0]).toBeGreaterThanOrEqual(0.3 - 1e-9);
    const end = snapToWall(mirror, -1, 0.05, { walls: [walls[0]!], rooms: scene.rooms })!;
    close(end.position[0], 0.3); // half width from the wall start
  });

  it("picks the face on the pointer's side of a shared wall", () => {
    const a = snapToWall(mirror, 3.8, 2, scene)!;
    const b = snapToWall(mirror, 4.2, 2, scene)!;
    expect(a.wallId).toBe("mid");
    expect(b.wallId).toBe("mid");
    expect(a.position[0]).toBeLessThan(4);
    expect(b.position[0]).toBeGreaterThan(4);
  });

  it("prefers faces that look into a room over the outside of the envelope", () => {
    const r = snapToWall(mirror, 2, -0.2, scene)!;
    expect(r.wallId).toBe("s");
    expect(r.position[1]).toBeGreaterThan(0); // room side
  });
});

describe("ceiling items", () => {
  const pendant: Item = { id: "p", category: "pendantLamp", mount: "ceiling", position: [2, 0, 2], rotationY: 0, dimensions: [0.4, 0.7, 0.4], source: "user" };

  it("touches the ceiling of the room it hangs in", () => {
    close(ceilingHeightAt(scene, [2, 2]), 2.6);
    close(ceilingItemY(pendant, 2.6), 1.9);
    close(mountedPose(pendant, scene).position[1], 1.9);
  });

  it("falls back to 2.5 m without walls", () => {
    close(ceilingHeightAt({ walls: [], rooms: [] }, [0, 0]), 2.5);
  });

  it("is placed at the room centre with its top on the ceiling", () => {
    const spot = findFreeSpot(pendant, scene, [1, 1]);
    close(spot.position[0], 2);
    close(spot.position[1], 2);
    close(spot.y!, 1.9);
  });
});

describe("mount-aware collisions and placement", () => {
  it("wall items don't collide with floor furniture nor with their wall", () => {
    const chest: Item = { id: "c", category: "storage", position: [2, 0, 0.3], rotationY: 0, dimensions: [1.2, 1.3, 0.45], source: "user" };
    const sunk: Item = { ...mirror, position: [2, 1.2, 0.02] };
    const r = itemCollisions(sunk, { ...scene, items: [chest, sunk] });
    expect(r.walls).toEqual([]);
    expect(r.items).toEqual([]);
    // Two wall items still collide with each other.
    const other: Item = { ...mirror, id: "m2", position: [2.2, 1.3, 0.02] };
    expect(itemCollisions(sunk, { ...scene, items: [sunk, other] }).items).toEqual(["m2"]);
  });

  it("puts a new wall item flush on a free face of the room, beside windows and other frames", () => {
    const withWindow: Scene = {
      ...scene,
      openings: [{ id: "win", wallId: "s", kind: "window", offset: 2, width: 1.2, height: 1.2, sill: 0.9 }],
      items: [{ ...mirror, id: "m0", position: [2.6, 1.2, 0.05] }],
    };
    const item = placeItem({ ...mirror, position: [0, 1.2, 0] }, withWindow, [2, 0.5]);
    const host = findHostWall(item, walls)!;
    expect(host).toBeDefined();
    expect(item.roomId).toBe("A");
    close(host.gap, WALL_GAP, 4);
    // Not over the window (x ∈ [1.4, 2.6] on wall s at mirror height) nor on the other mirror.
    if (host.wallId === "s") expect(Math.abs(item.position[0] - 2)).toBeGreaterThan(0.9);
    expect(itemCollisions(item, withWindow).items).toEqual([]);
  });
});

describe("wall face materials", () => {
  it("maps material groups to the right faces in world space", () => {
    const wall: Wall = { id: "d", start: [1, 1], end: [3, 2.5], height: 2.5, thickness: 0.2 };
    const geo = buildWallGeometry(wall, []);
    expect(geo.groups.map((g) => g.materialIndex)).toEqual([WALL_GROUP.right, WALL_GROUP.left, WALL_GROUP.sides]);
    // A vertex of the "left" group, transformed like the wall group, lies on wallNormal's side.
    const m = new THREE.Matrix4().makeRotationY(wallAngle(wall)).setPosition(wall.start[0], 0, wall.start[1]);
    const idx = geo.getIndex()!;
    const pos = geo.getAttribute("position");
    for (const g of geo.groups.slice(0, 2)) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(g.start)).applyMatrix4(m);
      expect(wallSideOf(wall, [v.x, v.z])).toBe(sideOfMaterialIndex(g.materialIndex));
    }
    expect(wallNormal(wall)).toBeDefined();
  });
});
