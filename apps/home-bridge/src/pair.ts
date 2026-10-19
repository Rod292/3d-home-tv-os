/** `pnpm --filter @appart3d/home-bridge pair [--rotate]`: LAN URL, pair code and QR code. */
import { configPath, loadConfig, newPairCode, updateConfig } from "./config.ts";
import { lanAddresses, localHostName } from "./lan.ts";
import { encodeQr, renderQrTerminal } from "./qr.ts";

const path = configPath();
let { config } = loadConfig(path);
if (process.argv.includes("--rotate")) {
  config = updateConfig((c) => {
    c.pairCode = newPairCode();
  }, path);
  console.log("Nouveau code d'appairage généré (l'ancien ne fonctionne plus).\n");
}

// The Mac's Bonjour name (my-macbook-pro.local) survives IP changes after a router reboot:
// put it first, so the QR code and the home-screen app keep working. IPs follow as a fallback.
const ips = lanAddresses();
const local = localHostName();
const hosts = [...(local ? [`${local}.local`] : []), ...(ips.length ? ips : ["localhost"])];
const urls = hosts.map((h) => `http://${h}:${config.port}/pair?code=${config.pairCode}`);
console.log(`${config.homeName} — code d'appairage : ${config.pairCode}\n`);
for (const u of urls) console.log(`  ${u}`);
console.log("\nScannez avec le téléphone (même Wi-Fi) :\n");
console.log(renderQrTerminal(encodeQr(urls[0]!)));
console.log(`\nNouveau code : pnpm --filter @appart3d/home-bridge pair --rotate`);
