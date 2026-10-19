# Privacy and secrets

A 3D scan is a precise map of the inside of someone's home. Treat it like keys.

## Never in git, an issue, a gist or a public demo
- Scans (`*.appart3d.json`), their scene (`apps/web/public/shared/*` except the demo), photos used as
  artwork or textures.
- `~/.config/appart3d/*`: `home.json` (access token, pair code), `ha-token`, `hue.env`, `adb/` keys.
- Device ids that identify hardware (HomePod identifiers, MACs), LAN IPs, the home's name if it
  contains real names, Apple team IDs, bundle ids with their name.

The `.gitignore` covers these paths; it cannot catch a token pasted into source code. Before each
commit: `git status`, `git diff --cached`, and a quick
`git grep -n -I -E "token|password|BEGIN .*KEY|192\.168\."` on what is staged.

## Network exposure
- The bridge listens on the LAN; non-loopback requests need the token (`Authorization: Bearer` or the
  `appart3d_home` cookie set by `/pair`). Don't port-forward it to the internet.
- The pair code is rate-limited; rotate it with `pnpm --filter @appart3d/home-bridge pair --rotate`.

## Sharing their result
- Videos/screenshots: check the 3D and the panels for names, addresses, the Wi-Fi name.
- A public demo should use a fictional or simplified layout (like `demo-apartment.json`).
