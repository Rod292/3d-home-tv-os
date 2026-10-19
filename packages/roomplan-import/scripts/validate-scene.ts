import { readFileSync } from "node:fs";
import { validateScene, roomAt } from "@appart3d/scene";
const s = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
console.log("errors:", validateScene(s));
for (const it of s.items) { const r = roomAt(s, [it.position[0], it.position[2]]); if (r?.id !== it.roomId) console.log("room mismatch", it.id, it.label, it.roomId, "→", r?.id); }
