import { describe, expect, it } from "vitest";
import { parseBrowse, parseCloud, parseLookup } from "../src/hueDiscovery.ts";

describe("Hue rediscovery parsing", () => {
  it("reads dns-sd browse and lookup output", () => {
    const browse = [
      "Browsing for _hue._tcp.local",
      "DATE: ---Tue 14 Oct 2026---",
      "15:20:01.123  ...STARTING...",
      "Timestamp     A/R    Flags  if Domain               Service Type         Instance Name",
      "15:20:01.456  Add        2  15 local.               _hue._tcp.           Hue Bridge - 1A2B3C",
    ].join("\n");
    expect(parseBrowse(browse)).toEqual(["Hue Bridge - 1A2B3C"]);
    expect(parseLookup("15:20:02.000  Hue\\032Bridge._hue._tcp.local. can be reached at ecb5fa1a2b3c.local.:443 (interface 15)")).toBe(
      "ecb5fa1a2b3c.local",
    );
    expect(parseLookup("nothing")).toBeNull();
  });
  it("reads the Philips discovery endpoint", () => {
    expect(parseCloud([{ id: "x", internalipaddress: "192.168.1.42", port: 443 }])).toEqual(["192.168.1.42"]);
    expect(parseCloud({ error: 1 })).toEqual([]);
  });
});
