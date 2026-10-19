import type { Device, DeviceAction } from "@appart3d/home";

/**
 * A device source. Adapters report devices with `room` set to the *source* room name
 * (Hue room, HA area…) and no itemId; the hub maps rooms, names and 3D links on top.
 */
export interface Adapter {
  readonly name: string;
  start(onChange: () => void): Promise<void>;
  stop(): void;
  devices(): Device[];
  /** Apply several actions to one device (merged into one call when the source allows it). */
  act(id: string, actions: DeviceAction[]): Promise<void>;
  /** Human-readable problems (adapter disabled, unreachable…). */
  warnings(): string[];
  /** Cover / logo of what a device plays (GET /api/home/media/:id/artwork). null = none. */
  artwork?(id: string): Promise<Artwork | null>;
}

/** An image served by GET /api/home/media/:id/artwork. */
export interface Artwork {
  mime: string;
  data: Buffer;
  /** Content key: same as the `h` query of `MediaInfo.artworkUrl` (long caching when they match). */
  key: string;
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
