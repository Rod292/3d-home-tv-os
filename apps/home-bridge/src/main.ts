/** Entry point: `node src/main.ts` (HOME_BRIDGE_MOCK=1 for simulated devices). */
import { watchFile } from "node:fs";
import { advertise, type BonjourHandle } from "./bonjour.ts";
import { configPath, expandHome, loadConfig } from "./config.ts";
import { HaAdapter } from "./ha.ts";
import { HomePodAdapter } from "./homepod.ts";
import { HueAdapter } from "./hue.ts";
import { forcedSunElevation, Hub } from "./hub.ts";
import { lanAddresses } from "./lan.ts";
import { errMsg, logger } from "./log.ts";
import { MockAdapter } from "./mock.ts";
import { RobotClient } from "./robot.ts";
import { createBridgeServer, type ServerState } from "./server.ts";
import type { Adapter } from "./types.ts";

const log = logger("bridge");
const path = configPath();
const { config, created } = loadConfig(path);
log.info(`configuration ${path}${created ? " (créée)" : ""}`);

const mock = process.env.HOME_BRIDGE_MOCK === "1";
const adapters: Adapter[] = [];
let ha: HaAdapter | undefined;
let robot: RobotClient | undefined;
if (mock) {
  log.warn("mode simulation : aucun appareil réel n'est piloté");
  adapters.push(new MockAdapter());
} else {
  if (config.hue.enabled) adapters.push(new HueAdapter(expandHome(config.hue.configFile), config.hue.pollMs));
  if (config.homeAssistant.enabled) {
    ha = new HaAdapter(config.homeAssistant.url, expandHome(config.homeAssistant.tokenFile), config.homeAssistant.tvEntity);
    adapters.push(ha);
  }
  if (config.homepod?.enabled) adapters.push(new HomePodAdapter(config.homepod));
  else log.info("HomePod désactivé (homepod.enabled)");
  if (config.robotUrl) robot = new RobotClient(config.robotUrl, config.robotKey);
  else log.info("robot désactivé (robotUrl non renseigné)");
}

const sunElevation = forcedSunElevation();
if (sunElevation !== undefined) log.warn(`soleil forcé à ${sunElevation}° (HOME_BRIDGE_SUN_ELEVATION)`);
const hub = new Hub(config, { adapters, ha, robot, sunElevation });
await hub.start();

const state: ServerState = { config, configPath: path };
const server = createBridgeServer(hub, state);
const port = Number(process.env.HOME_BRIDGE_PORT ?? config.port);
const host = process.env.HOME_BRIDGE_HOST ?? config.host;
let bonjour: BonjourHandle | undefined;
server.listen(port, host, () => {
  log.info(`${hub.devices().length} appareil(s) — http://localhost:${port}`);
  for (const ip of host === "0.0.0.0" ? lanAddresses() : []) log.info(`réseau local : http://${ip}:${port}  (appairage : pnpm pair)`);
  // Bonjour for native apps. A simulated bridge never announces itself under the real home's name.
  const isLocalOnly = host === "127.0.0.1" || host === "localhost" || host === "::1";
  if (config.bonjour && process.env.HOME_BRIDGE_BONJOUR !== "0" && !isLocalOnly) {
    const name = process.env.HOME_BRIDGE_BONJOUR_NAME ?? (mock ? `${config.homeName} (simulation)` : config.homeName);
    bonjour = advertise({ name, port, home: name });
  }
});
server.on("error", (e) => {
  log.error(`serveur: ${errMsg(e)}`);
  process.exit(1);
});

// Hand edits of the config file (rooms, names, links, token) apply without restart.
watchFile(path, { interval: 2000 }, () => {
  try {
    state.config = loadConfig(path).config;
    hub.setConfig(state.config);
  } catch (e) {
    log.warn(`config illisible, ignorée: ${errMsg(e)}`);
  }
});

function shutdown(): void {
  log.info("arrêt");
  bonjour?.stop();
  hub.stop();
  server.close();
  server.closeAllConnections();
  setTimeout(() => process.exit(0), 300).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
