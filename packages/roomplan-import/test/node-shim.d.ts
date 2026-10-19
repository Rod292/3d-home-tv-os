// Minimal typing for the one Node API the fixture-sync test uses (the workspace has no @types/node).
declare module "node:fs" {
  export function writeFileSync(path: string | URL, data: string): void;
  export function readFileSync(path: string | URL, encoding: "utf8"): string;
  export function existsSync(path: string | URL): boolean;
}
declare const process: { env: Record<string, string | undefined> };
