import { useState, useEffect, useMemo } from "react"
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"

// ── Inject animation CSS once ─────────────────────────────────────────────────
let _stylesInjected = false
function injectStyles() {
  if (_stylesInjected) return
  _stylesInjected = true
  const el = document.createElement("style")
  el.textContent = `
    .lm-wrap { position: relative; }
    .lm-pulse { position: absolute; inset: -6px; border-radius: 50%; border: 2px solid; animation: lm-tp 1.8s ease-out infinite; pointer-events: none; }
    @keyframes lm-tp { from { transform: scale(1); opacity: 0.75; } to { transform: scale(2.1); opacity: 0; } }
    .lm-dot { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-family: 'Courier New', monospace; color: white; box-shadow: 0 2px 10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.22); position: relative; z-index: 1; line-height: 1; }
    .leaflet-tooltip { border: none !important; box-shadow: 0 4px 20px rgba(0,0,0,0.18) !important; border-radius: 10px !important; padding: 0 !important; }
    .leaflet-tooltip::before { display: none !important; }
  `
  document.head.appendChild(el)
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiveStop {
  code: string
  lat: number
  lon: number
  time: string
  stopType: string
}

interface LiveService {
  serviceCode: string
  status: string
  direction: "outbound" | "inbound"
  rameNumber: string
  coaches: number
  dep: string
  arr: string
  stops: LiveStop[]
}

interface MapStats {
  date: string
  total: number
  active: number
  cancelled: number
  nowUtc: string
}

type TrainState = "future" | "active" | "past"

// ── Parser ────────────────────────────────────────────────────────────────────

function parseLiveMap(raw: string): { stats: MapStats; services: LiveService[] } {
  const stats: MapStats = { date: "", total: 0, active: 0, cancelled: 0, nowUtc: "" }
  const services: LiveService[] = []
  for (const line of raw.split("\n")) {
    if (line.startsWith("LIVEMAP_START:")) {
      const [d, tot, act, canc, nowUtc] = line.slice("LIVEMAP_START:".length).split("|")
      stats.date    = d ?? ""
      stats.total   = Number.parseInt(tot ?? "0", 10)
      stats.active  = Number.parseInt(act ?? "0", 10)
      stats.cancelled = Number.parseInt(canc ?? "0", 10)
      stats.nowUtc  = nowUtc ?? ""
    } else if (line.startsWith("LIVEMAP_SERVICE:")) {
      const p = line.slice("LIVEMAP_SERVICE:".length).split("|")
      if (p.length < 8) continue
      // Stops are semicolon-separated within each entry (avoids clash with HH:MM colon)
      const stops: LiveStop[] = (p[7] ?? "").split(",").flatMap(s => {
        const sp = s.split(";")
        if (sp.length < 5) return []
        const lat = Number.parseFloat(sp[1])
        const lon = Number.parseFloat(sp[2])
        if (Number.isNaN(lat) || Number.isNaN(lon) || (lat === 0 && lon === 0)) return []
        return [{ code: sp[0], lat, lon, time: sp[3], stopType: sp[4] }]
      })
      if (stops.length === 0) continue
      services.push({
        serviceCode: p[0],
        status:      p[1],
        direction:   p[2] as "outbound" | "inbound",
        rameNumber:  p[3],
        coaches:     Number.parseInt(p[4] ?? "0", 10),
        dep: p[5], arr: p[6], stops,
      })
    }
  }
  return { stats, services }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATION_NAMES: Record<string, string> = {
  SPX: "London St Pancras", EBF: "Ebbsfleet", ASI: "Ashford Int'l",
  FTN: "Folkestone",        CFR: "Calais-Fréthun", FRE: "Calais-Fréthun",
  LIL: "Lille Europe",      PNO: "Paris Nord",     BXL: "Brussels Midi",
  ZYP: "Brussels Midi",     RTD: "Rotterdam",      ASD: "Amsterdam",
  AMS: "Amsterdam",         RDM: "Rotterdam",
}

const TUNNEL_UK = new Set(["ASI", "FTN"])
const TUNNEL_FR = new Set(["CFR", "FRE", "CAL"])

function toMinutes(t: string): number {
  if (!t) return -1
  const [h, m] = t.split(":").map(Number)
  return Number.isNaN(h) || Number.isNaN(m) ? -1 : h * 60 + m
}

function nowUTCMinutes(): number {
  const n = new Date()
  return n.getUTCHours() * 60 + n.getUTCMinutes() + n.getUTCSeconds() / 60
}

function nowUTCHHMM() {
  const n = new Date()
  return `${String(n.getUTCHours()).padStart(2, "0")}:${String(n.getUTCMinutes()).padStart(2, "0")}`
}

function interpolate(svc: LiveService, now: number): { lat: number; lon: number; state: TrainState } | null {
  const stops = svc.stops.filter(s => toMinutes(s.time) >= 0)
  if (!stops.length) return null
  const lastStop = stops.at(-1) ?? stops[0]
  const first = toMinutes(stops[0].time)
  const last  = toMinutes(lastStop.time)
  if (now < first)  return { ...stops[0], state: "future" }
  if (now >= last)  return { ...lastStop, state: "past" }
  for (let i = 0; i < stops.length - 1; i++) {
    const t0 = toMinutes(stops[i].time), t1 = toMinutes(stops[i + 1].time)
    if (t0 < 0 || t1 < 0 || t0 >= t1) continue
    if (now >= t0 && now < t1) {
      const f = (now - t0) / (t1 - t0)
      return {
        lat:   stops[i].lat + (stops[i + 1].lat - stops[i].lat) * f,
        lon:   stops[i].lon + (stops[i + 1].lon - stops[i].lon) * f,
        state: "active",
      }
    }
  }
  return null
}

function buildRouteSegments(services: LiveService[]): Array<{ pts: [number, number][]; isTunnel: boolean }> {
  const seen = new Set<string>()
  const segs: Array<{ pts: [number, number][]; isTunnel: boolean }> = []
  for (const svc of services) {
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const a = svc.stops[i], b = svc.stops[i + 1]
      const key = [a.code, b.code].sort((x, y) => x.localeCompare(y)).join("~")
      if (seen.has(key)) continue
      seen.add(key)
      segs.push({
        pts: [[a.lat, a.lon], [b.lat, b.lon]],
        isTunnel: (TUNNEL_UK.has(a.code) && TUNNEL_FR.has(b.code)) ||
                  (TUNNEL_UK.has(b.code) && TUNNEL_FR.has(a.code)),
      })
    }
  }
  return segs
}

// ── Leaflet icon factory ──────────────────────────────────────────────────────

function makeIcon(svc: LiveService, state: TrainState): L.DivIcon {
  const cancelled = svc.status === "cancelled"
  const color = cancelled ? "#dc2626" : svc.direction === "outbound" ? "#1d6feb" : "#d97706"
  const active = state === "active"
  const sz = active ? 32 : 22
  const fs = active ? 9 : 7
  const pulse = active && !cancelled
    ? `<div class="lm-pulse" style="border-color:${color};"></div>` : ""
  return L.divIcon({
    className: "",
    iconSize:   [sz, sz],
    iconAnchor: [sz / 2, sz / 2],
    html: `<div class="lm-wrap" style="width:${sz}px;height:${sz}px;opacity:${active ? 1 : 0.42};">
      ${pulse}
      <div class="lm-dot" style="width:${sz}px;height:${sz}px;background:${color};font-size:${fs}px;">${svc.serviceCode.slice(-4)}</div>
    </div>`,
  })
}

// ── Map helpers ───────────────────────────────────────────────────────────────

function FitBoundsUpdater({ services }: { readonly services: LiveService[] }) {
  const map = useMap()
  useEffect(() => {
    const lats: number[] = [], lons: number[] = []
    for (const s of services) for (const p of s.stops) { lats.push(p.lat); lons.push(p.lon) }
    if (!lats.length) return
    map.fitBounds(
      [[Math.min(...lats) - 0.4, Math.min(...lons) - 0.4], [Math.max(...lats) + 0.4, Math.max(...lons) + 0.4]],
      { padding: [28, 28] },
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function MapResizer({ hasSidebar }: { readonly hasSidebar: boolean }) {
  const map = useMap()
  useEffect(() => { setTimeout(() => map.invalidateSize(), 320) }, [hasSidebar, map])
  return null
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function stateLabel(state: TrainState): string {
  if (state === "future") return "Not yet departed"
  if (state === "past")   return "Journey complete"
  return ""
}

function TrainTooltip({ svc, state, now }: { readonly svc: LiveService; readonly state: TrainState; readonly now: number }) {
  const colour = svc.status === "cancelled" ? "#dc2626" : svc.direction === "outbound" ? "#1d6feb" : "#d97706"
  const origin = STATION_NAMES[svc.stops[0]?.code ?? ""] ?? svc.stops[0]?.code ?? "—"
  const dest   = STATION_NAMES[svc.stops.at(-1)?.code ?? ""] ?? svc.stops.at(-1)?.code ?? "—"
  const next   = state === "active" ? svc.stops.find(s => toMinutes(s.time) > now) : null
  const label  = stateLabel(state)

  return (
    <div style={{ fontFamily: "'SF Mono','Courier New',monospace", padding: "12px 14px", minWidth: 210, background: "white", borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 900, color: colour, letterSpacing: "-0.02em" }}>{svc.serviceCode}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ background: `${colour}18`, color: colour, border: `1px solid ${colour}44`, padding: "1px 7px", borderRadius: 999, fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>
            {svc.status}
          </span>
          <span style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", padding: "1px 7px", borderRadius: 999, fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>
            {svc.direction}
          </span>
        </div>
      </div>

      <div style={{ fontSize: 11, color: "#1e293b", fontWeight: 600, marginBottom: 5 }}>{origin} → {dest}</div>

      <div style={{ display: "flex", gap: 14, marginBottom: 7 }}>
        {[{ label: "Departs", val: svc.dep }, { label: "Arrives", val: svc.arr }].map(({ label: lbl, val }) => (
          <div key={lbl}>
            <div style={{ fontSize: 9, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{lbl}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", fontFamily: "'Courier New', monospace" }}>{val || "—"}</div>
          </div>
        ))}
      </div>

      {(svc.rameNumber || svc.coaches > 0) && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 7, padding: "5px 9px", marginBottom: 7, display: "flex", gap: 12 }}>
          {svc.rameNumber && (
            <div>
              <div style={{ fontSize: 8, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Rame</div>
              <div style={{ fontSize: 11, color: "#334155", fontWeight: 700 }}>{svc.rameNumber}</div>
            </div>
          )}
          {svc.coaches > 0 && (
            <div>
              <div style={{ fontSize: 8, color: "#94a3b8", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Units</div>
              <div style={{ fontSize: 11, color: "#334155", fontWeight: 700 }}>{svc.coaches}</div>
            </div>
          )}
        </div>
      )}

      {state === "active" && next && (
        <div style={{ fontSize: 10, color: "#2563eb", display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: "#22c55e", flexShrink: 0 }} />
          {"Next stop: "}<strong>{STATION_NAMES[next.code] ?? next.code}</strong>{" at "}{next.time}
        </div>
      )}
      {label && <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 2 }}>{label}</div>}

      <div style={{ marginTop: 8, fontSize: 9, color: "#cbd5e1", textAlign: "right" as const }}>Click to see full itinerary</div>
    </div>
  )
}

// ── Side panel ────────────────────────────────────────────────────────────────

function stopDotStyle(isCurrent: boolean, passed: boolean, colour: string): React.CSSProperties {
  if (isCurrent) return { background: colour, border: `1.5px solid ${colour}`, boxShadow: `0 0 0 3px ${colour}22` }
  if (passed)    return { background: "#dbeafe", border: "1.5px solid #93c5fd" }
  return { background: "#f1f5f9", border: "1.5px solid #e2e8f0" }
}

function DetailPanel({ svc, now, onClose }: { readonly svc: LiveService; readonly now: number; readonly onClose: () => void }) {
  const colour = svc.status === "cancelled" ? "#dc2626" : svc.direction === "outbound" ? "#1d6feb" : "#d97706"
  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 240, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 32 }}
      style={{ overflow: "hidden", borderLeft: "1px solid #e2e8f0", background: "#fff", flexShrink: 0 }}
    >
      <div style={{ width: 240, padding: "14px 14px 16px", overflowY: "auto", maxHeight: 504, fontFamily: "'SF Mono','Courier New',monospace" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, color: colour, letterSpacing: "-0.02em", lineHeight: 1 }}>{svc.serviceCode}</div>
            <div style={{ display: "flex", gap: 5, marginTop: 7, flexWrap: "wrap" as const }}>
              <span style={{ background: `${colour}18`, color: colour, border: `1px solid ${colour}44`, padding: "2px 8px", borderRadius: 999, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{svc.status}</span>
              <span style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", padding: "2px 8px", borderRadius: 999, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{svc.direction}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 2, marginTop: -2 }}><X size={14} /></button>
        </div>

        {(svc.rameNumber || svc.coaches > 0) && (
          <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
            <div style={{ fontSize: 8, color: "#94a3b8", letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 5 }}>Formation</div>
            <div style={{ display: "flex", gap: 16 }}>
              {svc.rameNumber && <div><div style={{ fontSize: 9, color: "#94a3b8" }}>Rame</div><div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{svc.rameNumber}</div></div>}
              {svc.coaches > 0 && <div><div style={{ fontSize: 9, color: "#94a3b8" }}>Units</div><div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{svc.coaches}</div></div>}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["dep", "arr"] as const).map(k => (
            <div key={k} style={{ flex: 1, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: "7px 10px", textAlign: "center" as const }}>
              <div style={{ fontSize: 8, color: "#94a3b8", letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 2 }}>{k === "dep" ? "Departs" : "Arrives"}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{(k === "dep" ? svc.dep : svc.arr) || "—"}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 8, color: "#94a3b8", letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 8 }}>Calling at</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {svc.stops.map((stop, i) => {
            const mins     = toMinutes(stop.time)
            const passed   = mins >= 0 && mins < now
            const isCurrent = !passed && i > 0 && toMinutes(svc.stops[i - 1].time) < now
            return (
              <div key={`${stop.code}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", position: "relative" }}>
                {i < svc.stops.length - 1 && (
                  <div style={{ position: "absolute", left: 4.5, top: 12, width: 1, height: "100%", background: "#e2e8f0" }} />
                )}
                <div style={{ width: 10, height: 10, borderRadius: "50%", flexShrink: 0, zIndex: 1, ...stopDotStyle(isCurrent, passed, colour) }} />
                <div style={{ flex: 1, fontSize: 10, color: passed ? "#94a3b8" : "#334155", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
                  {STATION_NAMES[stop.code] ?? stop.code}
                </div>
                <div style={{ fontSize: 9, color: "#94a3b8", fontFamily: "'Courier New',monospace", flexShrink: 0 }}>{stop.time}</div>
              </div>
            )
          })}
        </div>
      </div>
    </motion.div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" as const }}>
      {[{ c: "#1d6feb", l: "Outbound" }, { c: "#d97706", l: "Inbound" }, { c: "#dc2626", l: "Cancelled" }].map(({ c, l }) => (
        <div key={l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: c, boxShadow: `0 0 5px ${c}66` }} />
          <span style={{ fontSize: 11, color: "#475569" }}>{l}</span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <svg width={22} height={6}><line x1={0} y1={3} x2={22} y2={3} stroke="#d97706" strokeWidth={2} strokeDasharray="5 3" /></svg>
        <span style={{ fontSize: 11, color: "#475569" }}>Channel Tunnel</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#1d6feb", boxShadow: "0 0 0 3px #1d6feb33" }} />
        <span style={{ fontSize: 11, color: "#475569" }}>Active / en route</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function EuromapLiveMap({ result }: { readonly result: string }) {
  const { stats, services } = useMemo(() => parseLiveMap(result), [result])

  const seedNow = useMemo(() => {
    const m = toMinutes(stats.nowUtc)
    return m >= 0 ? m : nowUTCMinutes()
  }, [stats.nowUtc])

  const [now, setNow]     = useState(seedNow)
  const [clock, setClock] = useState(() => stats.nowUtc || nowUTCHHMM())

  useEffect(() => { setNow(seedNow); setClock(stats.nowUtc || nowUTCHHMM()) }, [seedNow, stats.nowUtc])

  const [selected, setSelected]       = useState<string | null>(null)
  const [filter, setFilter]           = useState<"all" | "outbound" | "inbound">("all")
  const [showCancelled, setShowCancelled] = useState(false)

  useEffect(() => {
    injectStyles()
    const id = setInterval(() => { setNow(nowUTCMinutes()); setClock(nowUTCHHMM()) }, 10_000)
    return () => clearInterval(id)
  }, [])

  const segments = useMemo(() => buildRouteSegments(services), [services])

  const visible = useMemo(() => services.filter(s => {
    if (!showCancelled && s.status === "cancelled") return false
    if (filter === "outbound" && s.direction !== "outbound") return false
    if (filter === "inbound"  && s.direction !== "inbound")  return false
    return true
  }), [services, filter, showCancelled])

  const positions = useMemo(() =>
    visible
      .map(s => ({ svc: s, pos: interpolate(s, now) }))
      .filter((x): x is { svc: LiveService; pos: { lat: number; lon: number; state: TrainState } } => x.pos !== null),
    [visible, now],
  )

  const inFlight    = positions.filter(p => p.pos.state === "active").length
  const selectedSvc = selected ? (services.find(s => s.serviceCode === selected) ?? null) : null

  if (!services.length) {
    return (
      <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 14, padding: 32, textAlign: "center", color: "#94a3b8", fontFamily: "monospace", fontSize: 13 }}>
        No services found
      </div>
    )
  }

  const pill = (f: "all" | "outbound" | "inbound"): React.CSSProperties => ({
    padding: "4px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600,
    letterSpacing: "0.06em", textTransform: "capitalize", cursor: "pointer",
    border: `1px solid ${filter === f ? "#1d6feb88" : "#e2e8f0"}`,
    background: filter === f ? "#dbeafe" : "#fff",
    color:      filter === f ? "#1d40ae"  : "#64748b",
  })

  return (
    <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 4px 24px rgba(0,0,0,0.07)" }}>

      {/* Header */}
      <div style={{ padding: "10px 16px", borderBottom: "1px solid #f1f5f9", background: "#fafbff", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", display: "inline-block", boxShadow: "0 0 8px #22c55e" }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: "#1e293b", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "monospace" }}>Eurostar Live Map</span>
        </div>
        <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{stats.date} · {clock} UTC</span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#64748b" }}>{stats.total} services</span>
          <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>{stats.active} active</span>
          {stats.cancelled > 0 && <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>{stats.cancelled} cancelled</span>}
          {inFlight > 0 && <span style={{ fontSize: 11, color: "#1d6feb", fontWeight: 700 }}>{inFlight} in flight</span>}
        </div>
      </div>

      {/* Filter bar */}
      <div style={{ padding: "8px 16px", borderBottom: "1px solid #f1f5f9", display: "flex", gap: 6, alignItems: "center" }}>
        <button style={pill("all")} onClick={() => setFilter("all")}>All</button>
        <button style={pill("outbound")} onClick={() => setFilter("outbound")}>Outbound</button>
        <button style={pill("inbound")} onClick={() => setFilter("inbound")}>Inbound</button>
        <button
          onClick={() => setShowCancelled(v => !v)}
          style={{ marginLeft: "auto", padding: "4px 13px", borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: "pointer", border: `1px solid ${showCancelled ? "#fca5a5" : "#e2e8f0"}`, background: showCancelled ? "#fee2e2" : "#fff", color: showCancelled ? "#dc2626" : "#94a3b8" }}
        >
          {showCancelled ? "Hide cancelled" : "Show cancelled"}
        </button>
      </div>

      {/* Map + detail panel */}
      <div style={{ display: "flex" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <MapContainer center={[50.5, 2.5]} zoom={6} style={{ height: 490, width: "100%" }} scrollWheelZoom={false}>
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com">CARTO</a>'
              subdomains="abcd"
              maxZoom={18}
            />
            <FitBoundsUpdater services={services} />
            <MapResizer hasSidebar={!!selectedSvc} />

            {segments.map((seg) => (
              <Polyline
                key={`${seg.pts[0][0]},${seg.pts[0][1]}~${seg.pts[1][0]},${seg.pts[1][1]}`}
                positions={seg.pts}
                pathOptions={{
                  color:     seg.isTunnel ? "#d97706" : "#3b82f6",
                  weight:    seg.isTunnel ? 2 : 1.5,
                  opacity:   seg.isTunnel ? 0.55 : 0.35,
                  dashArray: seg.isTunnel ? "7 5" : undefined,
                }}
              />
            ))}

            {positions.map(({ svc, pos }) => (
              <Marker
                key={svc.serviceCode}
                position={[pos.lat, pos.lon]}
                icon={makeIcon(svc, pos.state)}
                zIndexOffset={pos.state === "active" ? 500 : 0}
                eventHandlers={{ click: () => setSelected(s => s === svc.serviceCode ? null : svc.serviceCode) }}
              >
                <Tooltip sticky offset={[14, 0]}>
                  <TrainTooltip svc={svc} state={pos.state} now={now} />
                </Tooltip>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <AnimatePresence>
          {selectedSvc && (
            <DetailPanel key={selectedSvc.serviceCode} svc={selectedSvc} now={now} onClose={() => setSelected(null)} />
          )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div style={{ padding: "9px 16px", borderTop: "1px solid #f1f5f9", background: "#fafbff", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <Legend />
        <span style={{ fontSize: 10, color: "#cbd5e1", fontFamily: "monospace" }}>Hover to inspect · Click for full itinerary · Auto-refreshes every 10s</span>
      </div>
    </div>
  )
}
