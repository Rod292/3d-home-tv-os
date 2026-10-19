import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ambilightEffectLabel, tvAppButton, type Device, type HomeScene, type TvApp } from "@appart3d/home";
import { appBrand } from "../lib/tvCard";
import { useStore } from "../state/store";
import { useHome } from "../state/home";
import {
  ALL_ROOMS,
  canMedia,
  deviceTint,
  formatTime,
  mediaPosition,
  nowPlaying,
  resolveAsset,
  devicesInRoom,
  fanStep,
  homeTitle,
  isOn,
  isReachable,
  kelvinToHex,
  lightColor,
  lightsSummary,
  roomCounts,
  sourceLabel,
  stateWord,
  stepToSpeed,
  tileLabel,
  UNREACHABLE_HINT,
} from "../lib/home";
import { NightToggle } from "./Chrome";
import {
  IconAmbilight,
  IconBulb,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconDoor,
  IconFan,
  IconFilm,
  IconFloorLamp,
  IconGrip,
  IconMinus,
  IconMoon,
  IconMusic,
  IconNext,
  IconPause,
  IconPlay,
  IconPrev,
  IconSpeaker,
  IconPendant,
  IconPlug,
  IconPlus,
  IconPower,
  IconReorder,
  IconSofa,
  IconStrip,
  IconSun,
  IconTv,
  IconVolume,
} from "./icons";

type IconT = typeof IconBulb;

const SCENE_ICONS: Record<HomeScene["icon"], IconT> = { sun: IconSun, sofa: IconSofa, film: IconFilm, moon: IconMoon, door: IconDoor };

const COLORS = ["#ffb35c", "#ff6a4d", "#ff5fa2", "#b06bff", "#5a7dff", "#3fc9e8", "#4fd38a", "#ffe066"];
const WHITES: { k: number; label: string }[] = [
  { k: 2200, label: "Bougie" },
  { k: 2700, label: "Chaud" },
  { k: 4000, label: "Neutre" },
  { k: 6500, label: "Froid" },
];

function useItemCategory(itemId: string | undefined) {
  return useStore((s) => (itemId ? s.scene.items.find((i) => i.id === itemId)?.category : undefined));
}

function DeviceIcon({ device, ...p }: { device: Device } & React.SVGProps<SVGSVGElement>) {
  const category = useItemCategory(device.itemId);
  let Icon: IconT = IconBulb;
  if (device.kind === "fan") Icon = IconFan;
  else if (device.kind === "tv") Icon = IconTv;
  else if (device.kind === "plug") Icon = IconPlug;
  else if (device.kind === "speaker") Icon = IconSpeaker;
  else if (/strip|ruban|led/i.test(device.name) || category === "television") Icon = IconStrip;
  else if (category === "floorLamp") Icon = IconFloorLamp;
  else if (category === "pendantLamp" || /lustre|suspension/i.test(device.name)) Icon = IconPendant;
  return <Icon {...p} />;
}

const tintStyle = (d: Device): CSSProperties => ({ ["--tint" as string]: deviceTint(d) });

/* ------------------------------------------------------------------ root */

export function HomePanel() {
  const status = useHome((s) => s.status);
  const view = useHome((s) => s.view);
  const devices = useHome((s) => s.devices);
  const compact = useHome((s) => s.compact);
  const widget = useHome((s) => s.widget);
  const anyOn = devices.some(isOn);

  let body: ReactNode;
  if (status === "connecting" && devices.length === 0) body = <HomeMessage title="Connexion à la maison…" spinner />;
  else if (status === "unauthorized")
    body = (
      <HomeMessage title="Appareil non appairé">
        Sur le Mac de la maison, ouvrez la barre de menus Appart3D → « Appairer un téléphone », puis ouvrez le lien affiché sur cet appareil.
      </HomeMessage>
    );
  else if (status === "offline" && devices.length === 0)
    body = (
      <HomeMessage title="Maison injoignable" spinner>
        Le pont ne répond pas. Vérifiez que le Mac est allumé et sur le même réseau — nouvel essai automatique.
      </HomeMessage>
    );
  else if (view.kind === "device") body = <DeviceDetail id={view.id} />;
  else if (view.kind === "item") body = <ItemDevices itemId={view.itemId} />;
  else body = <HomeList />;

  return (
    <>
      <aside className={`home-panel${anyOn ? " any-on" : ""}${compact ? " is-compact" : ""}`} aria-label="Maison">
        {body}
        <HomeFooter />
      </aside>
      {compact && !widget && (
        <button className="hp-exit" onClick={() => useStore.getState().setMode("navigate")} aria-label="Quitter le mode Maison" title="Quitter le mode Maison">
          <IconClose width={16} height={16} />
        </button>
      )}
    </>
  );
}

function HomeMessage({ title, spinner, children }: { title: string; spinner?: boolean; children?: ReactNode }) {
  return (
    <div className="hp-message">
      {spinner && <span className="hp-spinner" aria-hidden />}
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

function HomeFooter() {
  const status = useHome((s) => s.status);
  const client = useHome((s) => s.client);
  const label = client?.kind === "mock" ? "Démo (appareils simulés)" : client ? `Pont · ${client.label}` : "";
  if (!label) return null;
  const tone = status === "online" ? "ok" : status === "reconnecting" || status === "connecting" ? "wait" : "bad";
  return (
    <footer className="hp-foot">
      <span className={`hp-dot tone-${tone}`} aria-hidden />
      <span>{status === "reconnecting" ? "Reconnexion…" : label}</span>
    </footer>
  );
}

/* ------------------------------------------------------------------ list */

function HomeList() {
  const home = useHome((s) => s.home);
  const devices = useHome((s) => s.devices);
  const scenes = useHome((s) => s.scenes);
  const room = useHome((s) => s.room);
  const running = useHome((s) => s.runningScene);
  const compact = useHome((s) => s.compact);
  const organizing = useHome((s) => s.organizing);
  const counts = useMemo(() => roomCounts(devices), [devices]);
  const shown = useMemo(() => devicesInRoom(devices, counts.some((c) => c.room === room) ? room : ALL_ROOMS), [devices, room, counts]);
  const anyOn = devices.some(isOn);
  const h = useHome.getState();

  return (
    <>
      <header className="hp-head">
        <div className="hp-title">
          <h2>{homeTitle(home)}</h2>
          <p>{lightsSummary(devices)}</p>
        </div>
        {compact && !organizing && <NightToggle className="hp-night" />}
        {organizing ? (
          <button className="hp-done" onClick={() => h.setOrganizing(false)}>
            Terminé
          </button>
        ) : (
          <button className="hp-organize" onClick={() => h.setOrganizing(true)} aria-label="Organiser les appareils" title="Organiser (glisser les tuiles pour les réordonner)">
            <IconReorder width={18} height={18} />
          </button>
        )}
        <button
          className={`hp-power${anyOn ? " is-on" : ""}`}
          onClick={() => h.masterPower()}
          aria-label={anyOn ? "Tout éteindre" : "Allumer toutes les lumières"}
          title={anyOn ? "Tout éteindre" : "Allumer toutes les lumières"}
        >
          <IconPower width={20} height={20} />
        </button>
      </header>

      <div className="hp-scenes" role="group" aria-label="Scènes">
        {scenes.map((sc) => {
          const Icon = SCENE_ICONS[sc.icon] ?? IconSun;
          return (
            <button key={sc.id} className={`hp-scene scene-${sc.icon}${running === sc.id ? " is-running" : ""}`} onClick={() => h.runScene(sc.id)} disabled={!!running}>
              <span className="hp-scene-ic">
                <Icon width={19} height={19} />
              </span>
              <span>{sc.name}</span>
            </button>
          );
        })}
      </div>

      <NowPlayingCard />

      <div className="hp-rooms" role="tablist" aria-label="Pièces">
        {counts.map((c) => (
          <button key={c.room} role="tab" aria-selected={room === c.room} className={`hp-chip${room === c.room ? " is-active" : ""}`} onClick={() => h.setRoom(c.room)}>
            {c.room === ALL_ROOMS ? "Tous" : c.room}
            <span className={`hp-chip-count${c.on ? " has-on" : ""}`}>{c.on}</span>
          </button>
        ))}
      </div>

      <div className="hp-scroll">
        {organizing && <p className="hp-organize-hint">Faites glisser les tuiles pour les réordonner — l'ordre est partagé avec l'iPhone, l'iPad et le Mac.</p>}
        {organizing ? (
          <OrganizeGrid devices={shown} />
        ) : (
          <div className="hp-grid">
            {shown.map((d) => (
              <DeviceTile key={d.id} device={d} />
            ))}
          </div>
        )}
        {shown.length === 0 && <p className="hp-empty">Aucun appareil dans cette pièce.</p>}
      </div>
    </>
  );
}

/**
 * « Organiser » mode: drag a tile (mouse, pen or finger) over another one to take its place; the
 * others slide out of the way (FLIP animation). The order is saved on the bridge for every client.
 */
function OrganizeGrid({ devices }: { devices: Device[] }) {
  const grid = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const drag = useRef<{ id: string; pointer: number; x: number; y: number; ox: number; oy: number; moved: number; el: HTMLElement } | null>(null);
  const rects = useRef(new Map<string, DOMRect>());
  const h = useHome.getState();

  // FLIP: tiles that moved since the last render glide from their old place.
  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const next = new Map<string, DOMRect>();
    for (const tile of el.querySelectorAll<HTMLElement>("[data-device-id]")) {
      const id = tile.dataset.deviceId!;
      const r = tile.getBoundingClientRect();
      next.set(id, r);
      const old = rects.current.get(id);
      if (!old || id === drag.current?.id) continue;
      const dx = old.left - r.left;
      const dy = old.top - r.top;
      if (!dx && !dy) continue;
      tile.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
    }
    rects.current = next;
  });

  const end = () => {
    const d = drag.current;
    if (d) d.el.style.transform = "";
    drag.current = null;
    setDragId(null);
  };

  return (
    <div className="hp-grid is-organizing" ref={grid} role="list" aria-label="Ordre des appareils">
      {devices.map((d, i) => (
        <div
          key={d.id}
          role="listitem"
          data-device-id={d.id}
          className={`hp-tile hp-org-tile kind-${d.kind}${isOn(d) ? " is-on" : ""}${isReachable(d) ? "" : " is-unreachable"}${dragId === d.id ? " is-dragging" : ""}`}
          style={tintStyle(d)}
          tabIndex={0}
          aria-label={`${d.name}, position ${i + 1} sur ${devices.length} (flèches pour déplacer)`}
          onKeyDown={(e) => {
            const target = e.key === "ArrowLeft" || e.key === "ArrowUp" ? devices[i - 1] : e.key === "ArrowRight" || e.key === "ArrowDown" ? devices[i + 1] : undefined;
            if (!target) return;
            e.preventDefault();
            h.moveDevice(d.id, target.id);
            requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-device-id="${CSS.escape(d.id)}"]`)?.focus());
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { id: d.id, pointer: e.pointerId, x: e.clientX, y: e.clientY, ox: e.currentTarget.offsetLeft, oy: e.currentTarget.offsetTop, moved: 0, el: e.currentTarget };
            setDragId(d.id);
          }}
          onPointerMove={(e) => {
            const st = drag.current;
            if (!st || st.pointer !== e.pointerId) return;
            // Follow the finger, relative to where the tile sits now (it moves in the grid while dragging).
            const tx = e.clientX - st.x - (st.el.offsetLeft - st.ox);
            const ty = e.clientY - st.y - (st.el.offsetTop - st.oy);
            st.el.style.transform = `translate(${tx}px, ${ty}px) scale(1.04)`;
            st.el.style.pointerEvents = "none";
            const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-device-id]");
            st.el.style.pointerEvents = "";
            const target = under?.dataset.deviceId;
            // Short pause after each move: the tiles sliding away must not bounce the drag back.
            if (target && target !== st.id && performance.now() - st.moved > 260) {
              st.moved = performance.now();
              h.moveDevice(st.id, target);
            }
          }}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <span className="hp-tile-main" aria-hidden>
            <span className="hp-ic">
              <DeviceIcon device={d} width={20} height={20} />
            </span>
            <span className="hp-tile-text">
              <span className="hp-name">{d.name}</span>
              <span className="hp-state">{tileLabel(d)}</span>
            </span>
          </span>
          <span className="hp-grip" aria-hidden>
            <IconGrip width={18} height={18} />
          </span>
        </div>
      ))}
    </div>
  );
}

function DeviceTile({ device: d }: { device: Device }) {
  const on = isOn(d);
  const reachable = isReachable(d);
  const pending = useHome((s) => !!s.pending[d.id]);
  const hovered = useStore((s) => s.mode === "home" && !!d.itemId && s.hoveredItemId === d.itemId);
  const press = useRef<{ timer?: ReturnType<typeof setTimeout>; long: boolean }>({ long: false });
  const h = useHome.getState();
  const startPress = () => {
    press.current.long = false;
    clearTimeout(press.current.timer);
    press.current.timer = setTimeout(() => {
      press.current.long = true;
      h.openDevice(d.id);
    }, 480);
  };
  const endPress = () => clearTimeout(press.current.timer);
  return (
    <div className={`hp-tile kind-${d.kind}${on ? " is-on" : ""}${reachable ? "" : " is-unreachable"}${pending ? " is-pending" : ""}${hovered ? " is-hovered" : ""}`} style={tintStyle(d)}>
      <button
        className="hp-tile-main"
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onPointerCancel={endPress}
        onContextMenu={(e) => {
          e.preventDefault();
          h.openDevice(d.id);
        }}
        onClick={() => {
          if (press.current.long) return;
          if (reachable && (d.kind !== "speaker" || canMedia(d, "playPause"))) h.toggle(d.id);
          else h.openDevice(d.id);
        }}
        onPointerEnter={() => d.itemId && useStore.getState().hoverItem(d.itemId)}
        onMouseLeave={() => d.itemId && useStore.getState().hoveredItemId === d.itemId && useStore.getState().hoverItem(null)}
        aria-pressed={on}
        aria-label={`${d.name} : ${stateWord(d)}${reachable ? " — toucher pour " + (on ? "éteindre" : "allumer") : ""}`}
      >
        <span className="hp-ic">
          <DeviceIcon device={d} width={20} height={20} />
        </span>
        <span className="hp-tile-text">
          <span className="hp-name">{d.name}</span>
          <span className="hp-state">{tileLabel(d)}</span>
        </span>
      </button>
      <button className="hp-chev" onClick={() => h.openDevice(d.id)} aria-label={`Réglages de ${d.name}`} title="Réglages">
        <IconChevronRight width={16} height={16} />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ item (several devices) */

function ItemDevices({ itemId }: { itemId: string }) {
  const devices = useHome((s) => s.byItem.get(itemId) ?? []);
  const label = useStore((s) => s.scene.items.find((i) => i.id === itemId)?.label);
  return (
    <>
      <DetailHeader title={label ?? "Appareils"} subtitle={`${devices.length} appareils liés`} />
      <div className="hp-scroll">
        <div className="hp-grid">
          {devices.map((d) => (
            <DeviceTile key={d.id} device={d} />
          ))}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ detail */

function DetailHeader({ title, subtitle, device }: { title: string; subtitle?: string; device?: Device }) {
  const h = useHome.getState();
  const on = device ? isOn(device) : false;
  const reachable = device ? isReachable(device) : true;
  return (
    <header className="hp-head hp-detail-head">
      <button className="hp-back" onClick={() => h.back()} aria-label="Retour">
        <IconChevronLeft width={20} height={20} />
      </button>
      {device && (
        <span className="hp-ic hp-ic-lg" style={tintStyle(device)} data-on={on}>
          <DeviceIcon device={device} width={22} height={22} />
        </span>
      )}
      <div className="hp-title">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {device && device.kind !== "tv" && device.kind !== "speaker" && (
        <button
          className={`hp-switch${on ? " is-on" : ""}`}
          role="switch"
          aria-checked={on}
          aria-label={on ? "Éteindre" : "Allumer"}
          disabled={!reachable}
          style={tintStyle(device)}
          onClick={() => h.act(device.id, device.kind === "fan" ? (on ? { type: "power", on: false } : { type: "toggle" }) : { type: "power", on: !on })}
        >
          <span />
        </button>
      )}
    </header>
  );
}

function DeviceDetail({ id }: { id: string }) {
  const d = useHome((s) => s.devices.find((x) => x.id === id));
  if (!d) return <HomeMessage title="Appareil introuvable" />;
  const reachable = isReachable(d);
  return (
    <>
      <DetailHeader title={d.name} subtitle={d.room} device={d} />
      <div className={`hp-scroll hp-detail${reachable ? "" : " is-unreachable"}`} style={tintStyle(d)}>
        {!reachable && <p className="hp-warn">{UNREACHABLE_HINT}</p>}
        {(d.kind === "light" || d.kind === "plug") && <LightControls d={d} />}
        {d.kind === "fan" && <FanControls d={d} />}
        {d.kind === "tv" && <TvControls d={d} />}
        {d.kind === "speaker" && <SpeakerControls d={d} />}
      </div>
    </>
  );
}

/** Throttled sender: immediate first call, then at most every `ms`, always delivering the last value. */
function useThrottled(send: (v: number) => void, ms = 160) {
  const st = useRef<{ last: number; timer?: ReturnType<typeof setTimeout>; value?: number }>({ last: 0 });
  const sendRef = useRef(send);
  sendRef.current = send;
  useEffect(() => () => clearTimeout(st.current.timer), []);
  return (v: number, final = false) => {
    const s = st.current;
    s.value = v;
    const now = performance.now();
    clearTimeout(s.timer);
    if (final || now - s.last >= ms) {
      s.last = now;
      sendRef.current(v);
    } else
      s.timer = setTimeout(() => {
        s.last = performance.now();
        sendRef.current(s.value!);
      }, ms - (now - s.last));
  };
}

function BigSlider({ value, onChange, disabled, label }: { value: number; onChange: (v: number, final: boolean) => void; disabled?: boolean; label: string }) {
  const track = useRef<HTMLDivElement>(null);
  const valueAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    return Math.round(Math.min(100, Math.max(1, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div
      ref={track}
      className={`hp-slider${disabled ? " is-disabled" : ""}`}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-valuemin={1}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value} %`}
      style={{ ["--v" as string]: `${value}%` }}
      onPointerDown={(e) => {
        if (disabled) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        onChange(valueAt(e.clientX), false);
      }}
      onPointerMove={(e) => {
        if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        onChange(valueAt(e.clientX), false);
      }}
      onPointerUp={(e) => {
        if (disabled || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
        onChange(valueAt(e.clientX), true);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        const step = e.shiftKey ? 10 : 5;
        if (e.key === "ArrowRight" || e.key === "ArrowUp") onChange(Math.min(100, value + step), true);
        else if (e.key === "ArrowLeft" || e.key === "ArrowDown") onChange(Math.max(1, value - step), true);
        else return;
        e.preventDefault();
      }}
    >
      <div className="hp-slider-fill" />
      <div className="hp-slider-knob" />
    </div>
  );
}

function LightControls({ d }: { d: Device }) {
  const h = useHome.getState();
  const reachable = isReachable(d);
  const on = isOn(d);
  const server = Math.round(d.state.brightness ?? 100);
  const [drag, setDrag] = useState<number | null>(null);
  const send = useThrottled((v) => h.act(d.id, { type: "brightness", value: v }));
  const shown = drag ?? server;
  const color = lightColor(d);

  return (
    <>
      {d.capabilities.brightness ? (
        <section className="hp-section">
          <div className="hp-big">
            <span className="hp-big-num">{on || drag !== null ? shown : 0}</span>
            <span className="hp-big-unit">%</span>
            <span className="hp-big-label">{on || drag !== null ? "Luminosité" : "Éteint"}</span>
          </div>
          <BigSlider
            label="Luminosité"
            value={on || drag !== null ? shown : 1}
            disabled={!reachable}
            onChange={(v, final) => {
              setDrag(final ? null : v);
              send(v, final);
            }}
          />
        </section>
      ) : (
        <section className="hp-section">
          <button className={`hp-bigpower${on ? " is-on" : ""}`} disabled={!reachable} onClick={() => h.act(d.id, { type: "power", on: !on })}>
            <IconPower width={34} height={34} />
            <span>{on ? "Allumé" : "Éteint"}</span>
          </button>
        </section>
      )}
      {d.capabilities.color && (
        <section className="hp-section">
          <h3>Couleur</h3>
          <div className="hp-swatches">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`hp-swatch${on && d.state.color?.toLowerCase() === c && !d.state.kelvin ? " is-active" : ""}`}
                style={{ ["--c" as string]: c }}
                disabled={!reachable}
                onClick={() => h.act(d.id, { type: "color", hex: c })}
                aria-label={`Couleur ${c}`}
              />
            ))}
          </div>
        </section>
      )}
      {d.capabilities.kelvin && (
        <section className="hp-section">
          <h3>Blanc</h3>
          <div className="hp-whites">
            {WHITES.map((w) => {
              const active = on && !!d.state.kelvin && Math.abs(d.state.kelvin - w.k) < 250;
              return (
                <button key={w.k} className={`hp-white${active ? " is-active" : ""}`} style={{ ["--c" as string]: kelvinToHex(w.k) }} disabled={!reachable} onClick={() => h.act(d.id, { type: "kelvin", value: w.k })}>
                  <i aria-hidden />
                  <span>{w.label}</span>
                  <small>{w.k} K</small>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {on && (d.capabilities.color || d.capabilities.kelvin) && (
        <p className="hp-now">
          <i style={{ background: color }} aria-hidden /> Couleur actuelle
        </p>
      )}
    </>
  );
}

function Stepper({ value, min, max, onChange, disabled, label, format }: { value: number; min: number; max: number; onChange: (v: number) => void; disabled?: boolean; label: string; format?: (v: number) => string }) {
  return (
    <div className="hp-stepper" role="group" aria-label={label}>
      <button className="hp-step-btn" onClick={() => onChange(Math.max(min, value - 1))} disabled={disabled || value <= min} aria-label={`${label} : moins`}>
        <IconMinus width={20} height={20} />
      </button>
      <output className="hp-step-val">{format ? format(value) : value}</output>
      <button className="hp-step-btn" onClick={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max} aria-label={`${label} : plus`}>
        <IconPlus width={20} height={20} />
      </button>
    </div>
  );
}

function FanControls({ d }: { d: Device }) {
  const h = useHome.getState();
  const reachable = isReachable(d);
  const steps = d.capabilities.speedSteps ?? 6;
  const step = fanStep(d);
  const set = (s: number) => h.act(d.id, { type: "speed", value: stepToSpeed(s, steps) });
  return (
    <>
      <section className="hp-section">
        <div className="hp-big">
          <span className={`hp-fan-spin${step > 0 ? " is-spinning" : ""}`} style={{ ["--spd" as string]: `${Math.max(0.25, 2.4 - step * 0.35)}s` }} aria-hidden>
            <IconFan width={44} height={44} />
          </span>
          <span className="hp-big-num">{step}</span>
          <span className="hp-big-label">{step === 0 ? "Arrêté" : `Vitesse sur ${steps}`}</span>
        </div>
        <div className="hp-dots" aria-hidden>
          {Array.from({ length: steps }, (_, i) => (
            <span key={i} className={i < step ? "is-lit" : ""} />
          ))}
        </div>
        <Stepper label="Vitesse" value={step} min={0} max={steps} onChange={set} disabled={!reachable} format={(v) => (v === 0 ? "Arrêt" : `Vitesse ${v}`)} />
      </section>
      {(d.capabilities.fanLight || d.state.lightOn !== undefined) && (
        <section className="hp-section">
          <button className={`hp-row-toggle${d.state.lightOn ? " is-on" : ""}`} disabled={!reachable} onClick={() => h.act(d.id, { type: "fanLight", on: !d.state.lightOn })} role="switch" aria-checked={!!d.state.lightOn}>
            <IconBulb width={20} height={20} />
            <span>Lumière du ventilateur</span>
            <span className={`hp-switch sm${d.state.lightOn ? " is-on" : ""}`} aria-hidden>
              <span />
            </span>
          </button>
        </section>
      )}
    </>
  );
}

const REMOTE_NAV = ["up", "down", "left", "right", "ok"];
const REMOTE_KNOWN = new Set(["tv_power", "volume_up", "volume_down", "mute", "channel_up", "channel_down", "home", "back", ...REMOTE_NAV]);

const appClass = (b: string) => `app-${b.replace(/^source:/, "").toLowerCase().replace(/[^a-z0-9]+/g, "")}`;

function TvControls({ d }: { d: Device }) {
  const h = useHome.getState();
  const reachable = isReachable(d);
  const on = isOn(d);
  const buttons = d.capabilities.buttons ?? [];
  const has = (b: string) => buttons.includes(b);
  const press = (name: string) => h.act(d.id, { type: "button", name });
  // Sources (inputs) and amp buttons; installed apps get their own grid.
  const apps = buttons.filter((b) => !REMOTE_KNOWN.has(b) && !b.startsWith("app:"));
  const nav = REMOTE_NAV.every(has);
  const power = () => (has("tv_power") ? press("tv_power") : h.act(d.id, { type: "power", on: !on }));
  const volume = (delta: 1 | -1) => (d.capabilities.volume || !has(delta > 0 ? "volume_up" : "volume_down") ? h.act(d.id, { type: "volumeStep", delta }) : press(delta > 0 ? "volume_up" : "volume_down"));
  const currentSource = d.state.source?.toLowerCase();
  return (
    <>
      <section className="hp-section">
        <button className={`hp-bigpower${on ? " is-on" : ""}`} disabled={!reachable} onClick={power}>
          <IconPower width={34} height={34} />
          <span>{on ? "Allumée" : "Éteinte"}</span>
          {on && (d.state.media?.app || d.state.media?.channel || d.state.source) && (
            <small>{d.state.media?.app ?? d.state.media?.channel ?? sourceLabel(d.state.source!)}</small>
          )}
        </button>
        {on && d.state.media?.title && <p className="hp-tv-now">{d.state.media.title}</p>}
      </section>
      {!!d.capabilities.apps?.length && <TvApps d={d} apps={d.capabilities.apps} />}
      {(d.capabilities.volume || has("volume_up")) && (
        <section className="hp-section">
          <h3>
            <IconVolume width={15} height={15} /> Volume
          </h3>
          <div className="hp-stepper" role="group" aria-label="Volume">
            <button className="hp-step-btn" disabled={!reachable} onClick={() => volume(-1)} aria-label="Baisser le volume">
              <IconMinus width={20} height={20} />
            </button>
            <output className="hp-step-val">{typeof d.state.volume === "number" ? d.state.volume : "—"}</output>
            <button className="hp-step-btn" disabled={!reachable} onClick={() => volume(1)} aria-label="Monter le volume">
              <IconPlus width={20} height={20} />
            </button>
            {has("mute") && (
              <button className="hp-step-btn hp-mute" disabled={!reachable} onClick={() => press("mute")} aria-label="Couper le son" title="Couper le son">
                Muet
              </button>
            )}
          </div>
        </section>
      )}
      {apps.length > 0 && (
        <section className="hp-section">
          <h3>{d.capabilities.apps?.length ? "Sources" : "Applications et sources"}</h3>
          <div className="hp-apps">
            {apps.map((b) => {
              const active = on && !!currentSource && sourceLabel(b).toLowerCase() === sourceLabel(currentSource).toLowerCase();
              return (
                <button key={b} className={`hp-app ${appClass(b)}${active ? " is-active" : ""}`} disabled={!reachable} onClick={() => press(b)}>
                  {sourceLabel(b)}
                </button>
              );
            })}
          </div>
        </section>
      )}
      {d.capabilities.ambilight && <AmbilightControls d={d} />}
      {(nav || has("channel_up")) && (
        <section className="hp-section hp-remote">
          <h3>Télécommande</h3>
          <div className="hp-remote-row">
            {nav && (
              <div className="hp-dpad" role="group" aria-label="Flèches">
                {(["up", "left", "ok", "right", "down"] as const).map((b) => (
                  <button key={b} className={`hp-dpad-${b}`} disabled={!reachable} onClick={() => press(b)} aria-label={DPAD_LABELS[b]}>
                    {b === "ok" ? "OK" : <IconChevronRight width={18} height={18} />}
                  </button>
                ))}
              </div>
            )}
            <div className="hp-remote-side">
              {has("channel_up") && (
                <div className="hp-channel" role="group" aria-label="Chaîne">
                  <button disabled={!reachable} onClick={() => press("channel_up")} aria-label="Chaîne suivante">
                    <IconPlus width={18} height={18} />
                  </button>
                  <span>CH</span>
                  <button disabled={!reachable || !has("channel_down")} onClick={() => press("channel_down")} aria-label="Chaîne précédente">
                    <IconMinus width={18} height={18} />
                  </button>
                </div>
              )}
              <div className="hp-remote-keys">
                {has("back") && (
                  <button disabled={!reachable} onClick={() => press("back")}>
                    Retour
                  </button>
                )}
                {has("home") && (
                  <button disabled={!reachable} onClick={() => press("home")}>
                    Accueil
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

const DPAD_LABELS = { up: "Haut", down: "Bas", left: "Gauche", right: "Droite", ok: "OK" };

/** Installed apps of the TV: branded tiles; the one in front is highlighted. Opening one switches the TV on. */
function TvApps({ d, apps }: { d: Device; apps: TvApp[] }) {
  const h = useHome.getState();
  const on = isOn(d);
  const front = on ? d.state.media?.app?.toLowerCase() : undefined;
  return (
    <section className="hp-section">
      <h3>Applications</h3>
      <div className="hp-tvapps">
        {apps.map((a) => {
          const b = appBrand(a.label);
          const active = !!front && front === a.label.toLowerCase();
          return (
            <button
              key={a.id}
              className={`hp-tvapp${active ? " is-active" : ""}`}
              style={{ ["--a0" as string]: b.bg[0], ["--a1" as string]: b.bg[1], ["--afg" as string]: b.fg, ["--aac" as string]: b.accent }}
              disabled={!isReachable(d)}
              onClick={() => h.act(d.id, { type: "button", name: tvAppButton(a.id) })}
              aria-pressed={active}
              title={on ? `Ouvrir ${a.label}` : `Allumer la TV et ouvrir ${a.label}`}
            >
              <span className="hp-tvapp-dot" aria-hidden />
              <span className="hp-tvapp-name">{a.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** The TV's Ambilight: on / off, fixed colors, level, and the modes that follow the picture / sound. */
function AmbilightControls({ d }: { d: Device }) {
  const h = useHome.getState();
  const caps = d.capabilities.ambilight ?? {};
  const amb = d.state.ambilight ?? { on: false };
  const tvOn = isOn(d);
  const enabled = isReachable(d) && tvOn;
  const lit = enabled && amb.on;
  const [drag, setDrag] = useState<number | null>(null);
  const send = useThrottled((v) => h.act(d.id, { type: "ambilight", brightness: v }));
  const level = drag ?? Math.round(amb.brightness ?? 100);
  const groups = useMemo(() => {
    const out: { group: string; items: { id: string; name: string }[] }[] = [];
    for (const id of caps.effects ?? []) {
      const [group, name = id] = ambilightEffectLabel(id).split(" · ");
      let g = out.find((x) => x.group === group);
      if (!g) out.push((g = { group: group!, items: [] }));
      g.items.push({ id, name });
    }
    const rank = (g: string) => ["Vidéo", "Son", "Couleur"].indexOf(g) >>> 0;
    return out.sort((a, b) => rank(a.group) - rank(b.group));
  }, [caps.effects]);
  return (
    <section className="hp-section hp-ambilight" style={{ ["--tint" as string]: amb.color ?? "#8fb0ff" }}>
      <button
        className={`hp-row-toggle${lit ? " is-on" : ""}`}
        disabled={!enabled}
        onClick={() => h.act(d.id, { type: "ambilight", on: !amb.on })}
        role="switch"
        aria-checked={lit}
      >
        <IconAmbilight width={20} height={20} />
        <span>Ambilight</span>
        <span className={`hp-switch sm${lit ? " is-on" : ""}`} aria-hidden>
          <span />
        </span>
      </button>
      {!tvOn && <p className="hp-amb-hint">S'allume avec la TV.</p>}
      {lit && amb.effect && !amb.color && <p className="hp-amb-hint">{ambilightEffectLabel(amb.effect)}</p>}
      {caps.brightness && (
        <div className="hp-amb-row">
          <h3>
            Intensité <span className="hp-vol-num">{lit && amb.brightness !== undefined ? `${level} %` : lit ? "auto" : "—"}</span>
          </h3>
          <BigSlider
            label="Intensité de l'Ambilight"
            value={lit ? Math.max(1, level) : 1}
            disabled={!enabled}
            onChange={(v, final) => {
              setDrag(final ? null : v);
              send(v, final);
            }}
          />
        </div>
      )}
      {caps.color && (
        <div className="hp-amb-row">
          <h3>Couleur</h3>
          <div className="hp-swatches">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`hp-swatch${lit && amb.color?.toLowerCase() === c ? " is-active" : ""}`}
                style={{ ["--c" as string]: c }}
                disabled={!enabled}
                onClick={() => h.act(d.id, { type: "ambilight", hex: c })}
                aria-label={`Ambilight couleur ${c}`}
              />
            ))}
          </div>
        </div>
      )}
      {groups.map((g) => (
        <div className="hp-amb-row" key={g.group}>
          <h3>{g.group === "Vidéo" ? "Suit l'image" : g.group === "Son" ? "Suit le son" : g.group === "Couleur" ? "Ambiances" : g.group}</h3>
          <div className="hp-chips">
            {g.items.map((e) => (
              <button key={e.id} className={`hp-chip-btn${lit && amb.effect === e.id ? " is-active" : ""}`} disabled={!enabled} onClick={() => h.act(d.id, { type: "ambilight", effect: e.id })}>
                {e.name}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------ now playing */

/** Re-renders every second while `active` (progress bars). */
function useTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return active ? now : Date.now();
}

function useArtwork(d: Device): string | undefined {
  const base = useHome((s) => s.client?.base ?? "");
  return resolveAsset(d.state.media?.artworkUrl, base);
}

function Artwork({ url, size, playing }: { url: string | undefined; size: "sm" | "lg"; playing: boolean }) {
  const [broken, setBroken] = useState<string | null>(null);
  const show = url && broken !== url;
  return (
    <span className={`hp-art hp-art-${size}${playing ? " is-playing" : ""}`}>
      {show ? <img src={url} alt="" draggable={false} onError={() => setBroken(url)} /> : <IconMusic width={size === "lg" ? 54 : 22} height={size === "lg" ? 54 : 22} />}
    </span>
  );
}

function Progress({ d, now, times }: { d: Device; now: number; times?: boolean }) {
  const m = d.state.media;
  const pos = mediaPosition(m, now);
  const dur = m?.duration;
  if (pos === undefined || !dur) return null;
  return (
    <div className="hp-progress" aria-label={`${formatTime(pos)} sur ${formatTime(dur)}`}>
      <div className="hp-progress-track">
        <div className="hp-progress-fill" style={{ width: `${(pos / dur) * 100}%` }} />
      </div>
      {times && (
        <div className="hp-progress-times">
          <span>{formatTime(pos)}</span>
          <span>-{formatTime(Math.max(0, dur - pos))}</span>
        </div>
      )}
    </div>
  );
}

function Transport({ d, big }: { d: Device; big?: boolean }) {
  const h = useHome.getState();
  const playing = d.state.media?.state === "playing";
  const can = (c: "previous" | "next" | "playPause") => canMedia(d, c);
  const sz = big ? 26 : 18;
  if (!can("previous") && !can("next") && !can("playPause")) return null;
  return (
    <div className={`hp-transport${big ? " is-big" : ""}`} role="group" aria-label="Lecture">
      {can("previous") && (
        <button className="hp-tr-btn" onClick={() => h.act(d.id, { type: "media", command: "previous" })} aria-label="Piste précédente" title="Piste précédente">
          <IconPrev width={sz} height={sz} />
        </button>
      )}
      {can("playPause") && (
        <button
          className="hp-tr-btn hp-tr-main"
          onClick={() => h.act(d.id, { type: "media", command: playing ? "pause" : "play" })}
          aria-label={playing ? "Pause" : "Lecture"}
          title={playing ? "Pause" : "Lecture"}
        >
          {playing ? <IconPause width={sz + 4} height={sz + 4} /> : <IconPlay width={sz + 4} height={sz + 4} />}
        </button>
      )}
      {can("next") && (
        <button className="hp-tr-btn" onClick={() => h.act(d.id, { type: "media", command: "next" })} aria-label="Piste suivante" title="Piste suivante">
          <IconNext width={sz} height={sz} />
        </button>
      )}
    </div>
  );
}

/** « Lecture en cours » card at the top of the Maison panel (speaker playing or paused). */
function NowPlayingCard() {
  const devices = useHome((s) => s.devices);
  const d = useMemo(() => nowPlaying(devices), [devices]);
  if (!d) return null;
  return <NowPlayingInner d={d} />;
}

function NowPlayingInner({ d }: { d: Device }) {
  const m = d.state.media!;
  const playing = m.state === "playing";
  const now = useTicker(playing);
  const art = useArtwork(d);
  const h = useHome.getState();
  const line2 = [m.artist, m.album].filter(Boolean).join(" — ");
  return (
    <section className={`hp-np${playing ? " is-playing" : ""}`} style={tintStyle(d)} aria-label="Lecture en cours">
      <button className="hp-np-open" onClick={() => h.openDevice(d.id)} aria-label={`Lecture en cours sur ${d.name}`}>
        <Artwork url={art} size="sm" playing={playing} />
        <span className="hp-np-text">
          <span className="hp-np-kicker">
            {playing && <Bars />}
            {playing ? "Lecture en cours" : "En pause"} · {m.app ? `${m.app} · ` : ""}
            {d.name}
          </span>
          <span className="hp-np-title">{m.title ?? "Sans titre"}</span>
          {line2 && <span className="hp-np-artist">{line2}</span>}
        </span>
      </button>
      <Transport d={d} />
      <Progress d={d} now={now} />
    </section>
  );
}

function Bars() {
  return (
    <span className="hp-bars" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

function SpeakerControls({ d }: { d: Device }) {
  const h = useHome.getState();
  const m = d.state.media;
  const active = !!m && m.state !== "idle";
  const playing = m?.state === "playing";
  const now = useTicker(playing);
  const art = useArtwork(d);
  const [drag, setDrag] = useState<number | null>(null);
  const send = useThrottled((v) => h.act(d.id, { type: "volume", value: v }));
  const volume = drag ?? Math.round(d.state.volume ?? 0);
  return (
    <>
      <section className="hp-section hp-speaker">
        <Artwork url={active ? art : undefined} size="lg" playing={playing} />
        {active ? (
          <div className="hp-speaker-meta">
            <h3 className="hp-speaker-title">{m!.title ?? "Sans titre"}</h3>
            {m!.artist && <p className="hp-speaker-artist">{m!.artist}</p>}
            {(m!.album || m!.app) && <p className="hp-speaker-album">{[m!.album, m!.app].filter(Boolean).join(" · ")}</p>}
          </div>
        ) : (
          <div className="hp-speaker-meta">
            <h3 className="hp-speaker-title">Rien en lecture</h3>
            <p className="hp-speaker-album">Lancez de la musique depuis l'iPhone (AirPlay) ou demandez à Siri.</p>
          </div>
        )}
        {active && <Progress d={d} now={now} times />}
        {active && <Transport d={d} big />}
        {active && !d.capabilities.media?.length && <p className="hp-speaker-note">Commandes de lecture non proposées par le HomePod pour cette source.</p>}
      </section>
      {d.capabilities.volume && (
        <section className="hp-section">
          <h3>
            <IconVolume width={15} height={15} /> Volume <span className="hp-vol-num">{volume} %</span>
          </h3>
          <BigSlider
            label="Volume"
            value={Math.max(1, volume)}
            disabled={!isReachable(d)}
            onChange={(v, final) => {
              setDrag(final ? null : v);
              send(v, final);
            }}
          />
        </section>
      )}
    </>
  );
}
