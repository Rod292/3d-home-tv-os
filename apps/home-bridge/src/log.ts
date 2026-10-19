/** Minimal logger. Never pass secrets (tokens, Hue username, pair code) to it. */
type Level = "info" | "warn" | "error";

function write(level: Level, scope: string, msg: string): void {
  const line = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${msg}`;
  if (level === "info") console.log(line);
  else console.error(line);
}

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export function logger(scope: string): Logger {
  return {
    info: (m) => write("info", scope, m),
    warn: (m) => write("warn", scope, m),
    error: (m) => write("error", scope, m),
  };
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
