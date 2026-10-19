import { describe, expect, it } from "vitest";
import { appLabel, parseFocus } from "../src/tvApp.ts";
import { withForegroundApp } from "../src/ha.ts";

describe("TV foreground app over ADB", () => {
  it("reads the package from dumpsys and names it", () => {
    const r = "  mCurrentFocus=Window{72a63f7 u0 com.google.android.youtube.tv/com.google.android.apps.youtube.tv.activity.ShellActivity}";
    expect(parseFocus(r)).toBe("com.google.android.youtube.tv");
    expect(appLabel("com.google.android.youtube.tv")).toBe("YouTube");
    expect(appLabel("com.canal.android.canal")).toBe("myCANAL");
    expect(appLabel("org.droidtv.hdmi")).toBe("HDMI");
    expect(parseFocus("nothing")).toBeNull();
  });
  it("adds the app to a TV that is on, never to one that is off", () => {
    const adb = { entity_id: "media_player.android_tv_1", state: "off", attributes: { adb_response: "mCurrentFocus=Window{1 u0 com.netflix.ninja/com.netflix.ninja.MainActivity}" } };
    expect(withForegroundApp({ on: true, reachable: true }, adb as never).media?.app).toBe("Netflix");
    expect(withForegroundApp({ on: false, reachable: true }, adb as never).media).toBeUndefined();
  });
});
