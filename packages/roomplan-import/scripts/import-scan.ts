// Usage: pnpm exec vite-node scripts/import-scan.ts <scan.appart3d.json> [out.scene.json]
import { readFileSync, writeFileSync } from "node:fs";
import { importRoomPlan } from "../src";
import { polygonArea, validateScene } from "@appart3d/scene";

const [input, output] = process.argv.slice(2);
if (!input) throw new Error("usage: import-scan <scan.appart3d.json> [out.json]");
const { scene, warnings } = importRoomPlan(JSON.parse(readFileSync(input, "utf8")));
console.log("warnings:", warnings);
console.log("validate:", validateScene(scene));
for (const r of scene.rooms) console.log(`room ${r.id} "${r.name}" ${r.kind} ${polygonArea(r.floor).toFixed(1)} m² pts=${r.floor.length}`);
console.log("walls", scene.walls.length, "openings", scene.openings.map((o) => o.kind).join(","));
for (const it of scene.items)
  console.log(`  ${it.category.padEnd(12)} ${it.label ?? ""} room=${it.roomId ?? "-"} pos=${it.position.map((v) => v.toFixed(2))} rot=${((it.rotationY * 180) / Math.PI).toFixed(0)} dim=${it.dimensions.map((v) => v.toFixed(2))} conf=${it.confidence}`);
if (output) writeFileSync(output, JSON.stringify(scene, null, 2));
