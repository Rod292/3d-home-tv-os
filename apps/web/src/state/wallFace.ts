import { create } from "zustand";

/**
 * Wall face picked in "Pièces" mode (click on a wall) to paint just that face.
 * Standalone mini-store (kept out of the main store); cleared when the room selection changes.
 */
export interface WallFaceSelection {
  wallId: string;
  side: "left" | "right";
  /** Room the face looks into, if any (the room panel only shows the face for that room). */
  roomId: string | null;
}

interface WallFaceState {
  face: WallFaceSelection | null;
  setFace: (face: WallFaceSelection | null) => void;
}

export const useWallFace = create<WallFaceState>()((set) => ({
  face: null,
  setFace: (face) => set({ face }),
}));
