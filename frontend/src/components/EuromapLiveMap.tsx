import { useState, useEffect, useMemo } from "react"
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import { AnimatePresence, motion } from "framer-motion"
import { X, Search } from "lucide-react"
import { EurostarDisplayMenu, EurostarDisplayStyles, eurostarDisplayClass, useEurostarDisplay } from "./EurostarDisplay"

let _stylesInjected = false
function injectStyles() {
  if (_stylesInjected) return
  _stylesInjected = true
  const el = document.createElement("style")
  el.textContent = `
    .lm-wrap { position: relative; }
    .lm-pulse { position: absolute; inset: -6px; border-radius: 50%; border: 2px solid; animation: lm-tp 1.8s ease-out infinite; pointer-events: none; }
    @keyframes lm-tp { from { transform: scale(1); opacity: 0.8; } to { transform: scale(2.2); opacity: 0; } }
    .lm-dot { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-family: 'Courier New', monospace; color: white; box-shadow: 0 2px 12px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.25); position: relative; z-index: 1; line-height: 1; }
    .leaflet-tooltip { background: #10182e !important; border: 1px solid rgba(255,255,255,0.12) !important; box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important; border-radius: 12px !important; padding: 0 !important; }
    .leaflet-tooltip::before { display: none !important; }
  `
  document.head.appendChild(el)
}

interface LiveStop  { code: string; lat: number; lon: number; time: string; stopType: string }
interface LiveCrew  { role: string; id: string; name: string; depot: string }
interface LiveService {
  serviceCode: string; status: string; direction: "outbound" | "inbound"
  rameNumber: string; coaches: number; dep: string; arr: string; stops: LiveStop[]; crew: LiveCrew[]
}
interface MapStats  { date: string; total: number; active: number; cancelled: number; nowUtc: string }
type TrainState = "future" | "active" | "past"

export function parseLiveMap(raw: string): { stats: MapStats; services: LiveService[] } {
  const stats: MapStats = { date: "", total: 0, active: 0, cancelled: 0, nowUtc: "" }
  const services: LiveService[] = []
  for (const line of raw.split("\n")) {
    if (line.startsWith("LIVEMAP_START:")) {
      const [d, tot, act, canc, nu] = line.slice("LIVEMAP_START:".length).split("|")
      stats.date = d ?? ""; stats.total = Number.parseInt(tot ?? "0", 10)
      stats.active = Number.parseInt(act ?? "0", 10); stats.cancelled = Number.parseInt(canc ?? "0", 10); stats.nowUtc = nu ?? ""
    } else if (line.startsWith("LIVEMAP_SERVICE:")) {
      const p = line.slice("LIVEMAP_SERVICE:".length).split("|")
      if (p.length < 8) continue
      const stops: LiveStop[] = (p[7] ?? "").split(",").flatMap(s => {
        const sp = s.split(";"); if (sp.length < 5) return []
        const lat = Number.parseFloat(sp[1]), lon = Number.parseFloat(sp[2])
        if (Number.isNaN(lat) || Number.isNaN(lon) || (lat === 0 && lon === 0)) return []
        return [{ code: sp[0], lat, lon, time: sp[3], stopType: sp[4] }]
      })
      const crew: LiveCrew[] = (p[8] ?? "").split(";").flatMap(row => {
        const [role, id, name, depot] = row.split("~")
        return role || id ? [{ role: role || "Crew", id: id || "", name: name || id || "Assigned crew", depot: depot || "" }] : []
      })
      if (!stops.length) continue
      services.push({ serviceCode: p[0], status: p[1], direction: p[2] as "outbound" | "inbound", rameNumber: p[3], coaches: Number.parseInt(p[4] ?? "0", 10), dep: p[5], arr: p[6], stops, crew })
    }
  }
  return { stats, services }
}

const STATION_NAMES: Record<string, string> = {
  SPX: "London St Pancras", EBF: "Ebbsfleet", ASI: "Ashford Int'l",
  FTN: "Folkestone", CFR: "Calais-Fréthun", FRE: "Calais-Fréthun",
  LIL: "Lille Europe", PNO: "Paris Nord", BXL: "Brussels Midi",
  ZYP: "Brussels Midi", RTD: "Rotterdam", ASD: "Amsterdam",
  AMS: "Amsterdam", RDM: "Rotterdam", MVC: "Marne-la-Vallée", BRU: "Brussels", LIE: "Liège",
}
const TUNNEL_UK = new Set(["ASI", "FTN"])
const TUNNEL_FR = new Set(["CFR", "FRE", "CAL"])

function toMinutes(t: string): number {
  if (!t) return -1
  const [h, m] = t.split(":").map(Number)
  return Number.isNaN(h) || Number.isNaN(m) ? -1 : h * 60 + m
}
function nowUTCMinutes() { const n = new Date(); return n.getUTCHours() * 60 + n.getUTCMinutes() + n.getUTCSeconds() / 60 }
function nowUTCHHMM()    { const n = new Date(); return `${String(n.getUTCHours()).padStart(2,"0")}:${String(n.getUTCMinutes()).padStart(2,"0")}` }

function interpolate(svc: LiveService, now: number): { lat: number; lon: number; state: TrainState } | null {
  const stops = svc.stops.filter(s => toMinutes(s.time) >= 0)
  if (!stops.length) return null
  const last = stops.at(-1) ?? stops[0]
  const first = toMinutes(stops[0].time), lastT = toMinutes(last.time)
  if (now < first) return { ...stops[0], state: "future" }
  if (now >= lastT) return { ...last, state: "past" }
  for (let i = 0; i < stops.length - 1; i++) {
    const t0 = toMinutes(stops[i].time), t1 = toMinutes(stops[i+1].time)
    if (t0 < 0 || t1 < 0 || t0 >= t1) continue
    if (now >= t0 && now < t1) {
      const f = (now - t0) / (t1 - t0)
      return { lat: stops[i].lat + (stops[i+1].lat - stops[i].lat) * f, lon: stops[i].lon + (stops[i+1].lon - stops[i].lon) * f, state: "active" }
    }
  }
  return null
}

function buildRouteSegments(services: LiveService[]) {
  const seen = new Set<string>(), segs: Array<{ pts: [number,number][]; isTunnel: boolean }> = []
  for (const svc of services)
    for (let i = 0; i < svc.stops.length - 1; i++) {
      const a = svc.stops[i], b = svc.stops[i+1]
      const key = [a.code, b.code].sort((x,y) => x.localeCompare(y)).join("~")
      if (seen.has(key)) continue; seen.add(key)
      segs.push({ pts: [[a.lat,a.lon],[b.lat,b.lon]], isTunnel: (TUNNEL_UK.has(a.code)&&TUNNEL_FR.has(b.code))||(TUNNEL_UK.has(b.code)&&TUNNEL_FR.has(a.code)) })
    }
  return segs
}

function svcColor(svc: LiveService) {
  if (svc.status === "cancelled") return "#dc2626"
  return svc.direction === "outbound" ? "#2563eb" : "#f59e0b"
}

function makeIcon(svc: LiveService, state: TrainState): L.DivIcon {
  const color = svcColor(svc), active = state === "active"
  const sz = active ? 32 : 22, fs = active ? 9 : 7
  const pulse = active && svc.status !== "cancelled" ? `<div class="lm-pulse" style="border-color:${color};"></div>` : ""
  return L.divIcon({
    className: "", iconSize: [sz,sz], iconAnchor: [sz/2,sz/2],
    html: `<div class="lm-wrap" style="width:${sz}px;height:${sz}px;opacity:${active?1:0.5};">${pulse}<div class="lm-dot" style="width:${sz}px;height:${sz}px;background:${color};font-size:${fs}px;">${svc.serviceCode.slice(-4)}</div></div>`,
  })
}

function FitBoundsUpdater({ services }: { readonly services: LiveService[] }) {
  const map = useMap()
  useEffect(() => {
    const lats: number[] = [], lons: number[] = []
    for (const s of services) for (const p of s.stops) { lats.push(p.lat); lons.push(p.lon) }
    if (!lats.length) return
    map.fitBounds([[Math.min(...lats)-0.4,Math.min(...lons)-0.4],[Math.max(...lats)+0.4,Math.max(...lons)+0.4]],{padding:[28,28]})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}
function MapResizer({ hasSidebar }: { readonly hasSidebar: boolean }) {
  const map = useMap()
  useEffect(() => { setTimeout(() => map.invalidateSize(), 320) }, [hasSidebar, map])
  return null
}

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null
  const max = Math.max(...values), min = Math.min(...values), range = max - min || 1
  const pts = values.map((v,i) => `${(i/(values.length-1))*54},${17-((v-min)/range)*14}`).join(" ")
  return <svg width="54" height="18" viewBox="0 0 54 18" aria-hidden><polyline points={pts} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

function seededVals(seed: number, count: number, base: number, spread: number): number[] {
  let s = seed
  return Array.from({ length: count }, () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return base + ((s / 0x7fffffff) - 0.5) * spread })
}
function serviceMetrics(svc: LiveService) {
  const seed = svc.serviceCode.split("").reduce((a,c) => a + c.charCodeAt(0), 0)
  const speed = svc.status === "cancelled" ? 0 : 240 + (seed % 80)
  const energy = 83 + (seed % 14), load = 62 + (seed % 32)
  return { speed, energy, load, speedVals: seededVals(seed, 8, speed, 40), energyVals: seededVals(seed*3, 8, energy, 6), loadVals: seededVals(seed*7, 8, load, 15) }
}

// ── Dark tooltip ──────────────────────────────────────────────────────────────
function TrainTooltip({ svc, state, now }: { readonly svc: LiveService; readonly state: TrainState; readonly now: number }) {
  const color  = svcColor(svc)
  const origin = STATION_NAMES[svc.stops[0]?.code ?? ""] ?? svc.stops[0]?.code ?? "—"
  const dest   = STATION_NAMES[svc.stops.at(-1)?.code ?? ""] ?? svc.stops.at(-1)?.code ?? "—"
  const next   = state === "active" ? svc.stops.find(s => toMinutes(s.time) > now) : null
  const ok     = svc.status !== "cancelled"
  return (
    <div style={{ fontFamily: "system-ui,sans-serif", padding: "12px 14px", minWidth: 200, background: "#10182e", borderRadius: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: "-0.02em" }}>{svc.serviceCode}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <span style={{ background: ok ? "rgba(16,185,129,0.18)" : "rgba(220,38,38,0.18)", color: ok ? "#34d399" : "#f87171", border: `1px solid ${ok?"#34d39944":"#f8717144"}`, padding: "1px 7px", borderRadius: 999, fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>{svc.status}</span>
          <span style={{ background: `${color}22`, color, border: `1px solid ${color}44`, padding: "1px 7px", borderRadius: 999, fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.1em" }}>{svc.direction}</span>
        </div>
      </div>
      <div style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 600, marginBottom: 6 }}>{origin} → {dest}</div>
      <div style={{ display: "flex", gap: 14, marginBottom: 7 }}>
        {[{l:"Departs",v:svc.dep},{l:"Arrives",v:svc.arr}].map(({l,v})=>(
          <div key={l}><div style={{ fontSize: 8, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{l}</div><div style={{ fontSize: 14, fontWeight: 700, color: "#f1f5f9", fontFamily: "'Courier New',monospace" }}>{v||"—"}</div></div>
        ))}
      </div>
      {(svc.rameNumber||svc.coaches>0) && (
        <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 7, padding: "5px 9px", marginBottom: 7, display: "flex", gap: 12 }}>
          {svc.rameNumber && <div><div style={{ fontSize: 8, color: "#64748b", textTransform: "uppercase" as const }}>Rake</div><div style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 700 }}>{svc.rameNumber}</div></div>}
          {svc.coaches > 0 && <div><div style={{ fontSize: 8, color: "#64748b", textTransform: "uppercase" as const }}>Units</div><div style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 700 }}>{svc.coaches}</div></div>}
        </div>
      )}
      {state==="active"&&next&&<div style={{ fontSize: 10, color: "#60a5fa", display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e", display: "inline-block", flexShrink: 0 }} />Next stop: <strong style={{ color: "#e2e8f0" }}>{STATION_NAMES[next.code]??next.code}</strong> at {next.time}</div>}
      <div style={{ marginTop: 8, fontSize: 9, color: "#334155", textAlign: "right" as const }}>Click to full itinerary</div>
    </div>
  )
}

// ── Service Intelligence panel ────────────────────────────────────────────────
function DetailPanel({ svc, now, onClose }: { readonly svc: LiveService; readonly now: number; readonly onClose: () => void }) {
  const color   = svcColor(svc)
  const origin  = STATION_NAMES[svc.stops[0]?.code ?? ""] ?? svc.stops[0]?.code ?? "—"
  const dest    = STATION_NAMES[svc.stops.at(-1)?.code ?? ""] ?? svc.stops.at(-1)?.code ?? "—"
  const mx      = serviceMetrics(svc)
  const ok      = svc.status !== "cancelled"

  return (
    <motion.div
      initial={{ width: 0, opacity: 0 }} animate={{ width: 272, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
      transition={{ type: "spring", stiffness: 340, damping: 32 }}
      style={{ overflow: "hidden", borderLeft: "1px solid rgba(255,255,255,0.07)", background: "#0d1628", flexShrink: 0 }}
    >
      <div style={{ width: 272, padding: "14px 14px 18px", overflowY: "auto", maxHeight: 490, fontFamily: "system-ui,sans-serif" }}>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 38, fontWeight: 900, color: "#fff", letterSpacing: "-1.5px", lineHeight: 1 }}>{svc.serviceCode}</div>
            <div style={{ display: "flex", gap: 5, marginTop: 7 }}>
              <span style={{ background: ok?"rgba(16,185,129,0.15)":"rgba(220,38,38,0.15)", color: ok?"#34d399":"#f87171", border: `1px solid ${ok?"#34d39944":"#f8717144"}`, padding: "2px 8px", borderRadius: 999, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{svc.status}</span>
              <span style={{ background: `${color}18`, color, border: `1px solid ${color}44`, padding: "2px 8px", borderRadius: 999, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{svc.direction}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 6, color: "#94a3b8", cursor: "pointer", padding: "4px 6px", display: "flex" }}><X size={12} /></button>
        </div>

        {/* Origin → Dest */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)", marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 8, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 1 }}>From</div>
            <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{origin}</div>
          </div>
          <span style={{ color, fontWeight: 700, fontSize: 14, flexShrink: 0 }}>→</span>
          <div style={{ flex: 1, minWidth: 0, textAlign: "right" as const }}>
            <div style={{ fontSize: 8, color: "#64748b", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 1 }}>To</div>
            <div style={{ fontSize: 12, color: "#e2e8f0", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{dest}</div>
          </div>
        </div>

        {/* Service Intelligence header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.04em" }}>Service Intelligence</span>
          <span style={{ color: "#4b5563", fontSize: 14, letterSpacing: "0.1em" }}>···</span>
        </div>

        {/* Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 12 }}>
          {[
            { label: "Speed",  value: ok ? `${mx.speed}` : "0", unit: "km/h", color: "#f59e0b", vals: mx.speedVals },
            { label: "Effic.", value: `${mx.energy}%`,           unit: "",     color: "#34d399", vals: mx.energyVals },
            { label: "Load",   value: `${mx.load}%`,             unit: "",     color: "#60a5fa", vals: mx.loadVals  },
          ].map(m => (
            <div key={m.label} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "7px 8px" }}>
              <div style={{ fontSize: 8, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 2 }}>{m.label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: m.color, marginBottom: 4 }}>{m.value}</div>
              <Sparkline values={ok ? m.vals : Array(8).fill(0)} color={m.color} />
            </div>
          ))}
        </div>

        {/* Dep / arr */}
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {(["dep","arr"] as const).map(k => (
            <div key={k} style={{ flex: 1, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "7px 10px", textAlign: "center" as const }}>
              <div style={{ fontSize: 8, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 2 }}>{k==="dep"?"Departs":"Arrives"}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", fontFamily: "'Courier New',monospace" }}>{(k==="dep"?svc.dep:svc.arr)||"—"}</div>
            </div>
          ))}
        </div>

        {/* Live timeline */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
          <span style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Live Timeline</span>
          <motion.div style={{ width: 6, height: 6, borderRadius: "50%", background: "#22c55e" }} animate={{ opacity: [1,0.3,1] }} transition={{ duration: 1.6, repeat: Infinity }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
          {svc.stops.map((stop, i) => {
            const mins = toMinutes(stop.time)
            const passed    = mins >= 0 && mins < now
            const isCurrent = !passed && i > 0 && toMinutes(svc.stops[i-1].time) < now
            return (
              <div key={`${stop.code}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", borderRadius: 6, background: isCurrent?"rgba(245,158,11,0.1)":"transparent", border: isCurrent?"1px solid rgba(245,158,11,0.22)":"1px solid transparent", position: "relative" }}>
                {i < svc.stops.length-1 && <div style={{ position: "absolute", left: 9, top: "100%", width: 1, height: 4, background: "rgba(255,255,255,0.07)" }} />}
                <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, zIndex: 1, background: isCurrent?"#f59e0b":passed?"#1d4ed8":"rgba(255,255,255,0.1)", border: `1.5px solid ${isCurrent?"#f59e0b":passed?"#2563eb":"rgba(255,255,255,0.18)"}`, boxShadow: isCurrent?"0 0 6px #f59e0baa":"none" }} />
                <span style={{ flex: 1, fontSize: 10, color: isCurrent?"#f59e0b":passed?"#475569":"#d1d5db", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, fontWeight: isCurrent?700:400 }}>{STATION_NAMES[stop.code]??stop.code}</span>
                <span style={{ fontSize: 10, color: isCurrent?"#f59e0b":"#64748b", fontFamily: "'Courier New',monospace", flexShrink: 0, fontWeight: isCurrent?700:400 }}>{stop.time}</span>
              </div>
            )
          })}
        </div>

        {/* Formation */}
        {(svc.rameNumber||svc.coaches>0) && <>
          <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, margin: "12px 0 7px" }}>Formation</div>
          <div style={{ display: "flex", gap: 6 }}>
            {svc.rameNumber && <div style={{ flex:1, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:8, padding:"6px 10px", textAlign:"center" as const }}><div style={{ fontSize:8, color:"#64748b", textTransform:"uppercase" as const }}>Rame</div><div style={{ fontSize:13, fontWeight:700, color:"#e2e8f0" }}>{svc.rameNumber}</div></div>}
            {svc.coaches>0 && <div style={{ flex:1, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:8, padding:"6px 10px", textAlign:"center" as const }}><div style={{ fontSize:8, color:"#64748b", textTransform:"uppercase" as const }}>Units</div><div style={{ fontSize:13, fontWeight:700, color:"#e2e8f0" }}>{svc.coaches}</div></div>}
          </div>
        </>}

        {/* Live Start-on-Time crew assignments */}
        <div style={{ fontSize: 10, color: "#94a3b8", fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" as const, margin: "12px 0 7px" }}>Crew Information</div>
        {svc.crew.length > 0 ? <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 6 }}>
          {svc.crew.map(member => (
            <div key={`${member.id}-${member.role}`} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 9px", background:"rgba(255,255,255,0.03)", borderRadius:8, border:"1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"#2563eb22", border:"1px solid #2563eb55", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:10, fontWeight:800, color:"#60a5fa" }}>{member.name.slice(0,1).toUpperCase()}</div>
              <div style={{ minWidth:0, flex:1 }}><div style={{ fontSize:10, color:"#e2e8f0", fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{member.name}</div><div style={{ fontSize:9, color:"#60a5fa" }}>{member.role}{member.depot ? ` · ${member.depot}` : ""}</div></div>
            </div>
          ))}
        </div> : <div style={{ padding:"9px 10px", borderRadius:8, border:"1px dashed rgba(255,255,255,0.12)", color:"#64748b", fontSize:10 }}>No matching SOT crew assignment for service {svc.serviceCode}.</div>}
      </div>
    </motion.div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────
function Legend() {
  return (
    <div style={{ display:"flex", gap:14, alignItems:"center", flexWrap:"wrap" as const }}>
      {[{c:"#2563eb",l:"Outbound"},{c:"#f59e0b",l:"Inbound"},{c:"#dc2626",l:"Cancelled"}].map(({c,l})=>(
        <div key={l} style={{ display:"flex", alignItems:"center", gap:5 }}>
          <div style={{ width:8, height:8, borderRadius:"50%", background:c, boxShadow:`0 0 5px ${c}77` }} />
          <span style={{ fontSize:10, color:"#64748b" }}>{l}</span>
        </div>
      ))}
      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
        <svg width={22} height={6}><line x1={0} y1={3} x2={22} y2={3} stroke="#f59e0b" strokeWidth={2} strokeDasharray="5 3"/></svg>
        <span style={{ fontSize:10, color:"#64748b" }}>Channel Tunnel</span>
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:5 }}>
        <div style={{ width:8, height:8, borderRadius:"50%", background:"#2563eb", boxShadow:"0 0 0 3px #2563eb33" }} />
        <span style={{ fontSize:10, color:"#64748b" }}>Active / en route</span>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function EuromapLiveMap({ result }: { readonly result: string }) {
  const { theme, compact } = useEurostarDisplay()
  const { stats, services } = useMemo(() => parseLiveMap(result), [result])
  const seedNow = useMemo(() => { const m = toMinutes(stats.nowUtc); return m >= 0 ? m : nowUTCMinutes() }, [stats.nowUtc])
  const [now, setNow]     = useState(seedNow)
  const [clock, setClock] = useState(() => stats.nowUtc || nowUTCHHMM())
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter]     = useState<"all"|"outbound"|"inbound">("all")
  const [viewTab, setViewTab]   = useState<"stations"|"routes"|"trains"|"crew">("trains")
  const [search, setSearch]     = useState("")

  useEffect(() => { setNow(seedNow); setClock(stats.nowUtc || nowUTCHHMM()) }, [seedNow, stats.nowUtc])
  useEffect(() => {
    injectStyles()
    const id = setInterval(() => { setNow(nowUTCMinutes()); setClock(nowUTCHHMM()) }, 10_000)
    return () => clearInterval(id)
  }, [])

  const segments = useMemo(() => buildRouteSegments(services), [services])
  const visible  = useMemo(() => services.filter(s => {
    if (s.status === "cancelled") return false
    if (filter === "outbound" && s.direction !== "outbound") return false
    if (filter === "inbound"  && s.direction !== "inbound")  return false
    if (search.trim()) { const q = search.trim().toLowerCase(); if (!s.serviceCode.toLowerCase().includes(q)) return false }
    return true
  }), [services, filter, search])

  const positions = useMemo(() =>
    visible.map(s => ({ svc:s, pos:interpolate(s,now) }))
      .filter((x): x is { svc: LiveService; pos: { lat:number; lon:number; state:TrainState } } => x.pos !== null),
    [visible, now])

  const inFlight    = positions.filter(p => p.pos.state === "active").length
  const selectedSvc = selected ? (services.find(s => s.serviceCode === selected) ?? null) : null

  if (!services.length) return (
    <div style={{ background:"#080c18", border:"1px solid rgba(255,255,255,0.08)", borderRadius:14, padding:32, textAlign:"center", color:"#475569", fontFamily:"system-ui,sans-serif", fontSize:13 }}>No services found</div>
  )

  const pill = (f: "all"|"outbound"|"inbound", l: string) => (
    <button key={f} onClick={() => setFilter(f)} style={{ padding:"4px 14px", borderRadius:999, fontSize:11, fontWeight:600, cursor:"pointer", border:`1px solid ${filter===f?"rgba(255,255,255,0.2)":"rgba(255,255,255,0.07)"}`, background:filter===f?"rgba(255,255,255,0.1)":"transparent", color:filter===f?"#fff":"#64748b", fontFamily:"system-ui,sans-serif", transition:"all 0.15s" }}>{l}</button>
  )
  const VIEW_TABS = [{ k:"stations" as const,l:"Stations" },{ k:"routes" as const,l:"Routes" },{ k:"trains" as const,l:"Trains" },{ k:"crew" as const,l:"Crew" }]

  return (
    <div className={`${eurostarDisplayClass(theme, compact)} es-themed-panel euromap-live-shell`} style={{ background:"#080c18", borderRadius:8, overflow:"hidden", border:"1px solid rgba(255,255,255,0.08)", boxShadow:"0 8px 40px rgba(0,0,0,0.6)", fontFamily:"system-ui,sans-serif" }}>
      <EurostarDisplayStyles />

      {/* Command bar */}
      <div style={{ background:"#0a1020", borderBottom:"1px solid rgba(255,255,255,0.06)", padding:"10px 16px" }}>
        <div style={{ position:"relative", marginBottom:10 }}>
          <Search size={13} style={{ position:"absolute", left:12, top:"50%", transform:"translateY(-50%)", color:"#4b5563", pointerEvents:"none" }} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search for Train Number, Station, or Route..."
            style={{ width:"100%", padding:"9px 14px 9px 34px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, color:"#e2e8f0", fontSize:13, fontFamily:"system-ui,sans-serif", outline:"none", boxSizing:"border-box" as const }} />
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" as const }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:"#f59e0b", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <svg width="16" height="12" viewBox="0 0 18 14" fill="none"><path d="M1 2h16M1 7h12M1 12h16" stroke="white" strokeWidth="2.2" strokeLinecap="round"/></svg>
            </div>
            <div>
              <div style={{ color:"#fff", fontWeight:700, fontSize:13, letterSpacing:"0.08em" }}>EUROSTAR OPERATIONAL COMMAND</div>
              <div style={{ color:"#4b5563", fontSize:10 }}>Advanced Search &amp; Filters</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8, marginLeft:"auto", flexWrap:"wrap" as const }}>
            <EurostarDisplayMenu inverted />
            {[
              { label:"Total Services", value:String(stats.total),    color:"#94a3b8", dot:null         },
              { label:"Active",         value:String(stats.active),   color:"#38bdf8", dot:"#38bdf8"    },
              { label:"In Flight",      value:String(inFlight),       color:"#34d399", dot:"#34d399"    },
              { label:"Cancelled",      value:String(stats.cancelled),color:"#f87171", dot:"#f87171"    },
            ].map(s => (
              <div key={s.label} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:8, padding:"6px 12px", textAlign:"center" as const, minWidth:72 }}>
                <div style={{ fontSize:9, color:"#64748b", marginBottom:2, letterSpacing:"0.04em" }}>{s.label}</div>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                  {s.dot && <span style={{ width:6, height:6, borderRadius:"50%", background:s.dot, display:"inline-block", boxShadow:`0 0 5px ${s.dot}` }}/>}
                  <span style={{ fontSize:18, fontWeight:700, color:s.color, fontFamily:"'Courier New',monospace" }}>{s.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Map header */}
      <div style={{ padding:"8px 14px", borderBottom:"1px solid rgba(255,255,255,0.06)", background:"#0a1020", display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" as const }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <motion.span style={{ width:7, height:7, borderRadius:"50%", background:"#22c55e", display:"inline-block" }} animate={{ opacity:[1,0.3,1] }} transition={{ duration:1.6, repeat:Infinity }} />
          <span style={{ fontSize:11, fontWeight:700, color:"#94a3b8", letterSpacing:"0.1em", textTransform:"uppercase" as const }}>Eurostar Live Map</span>
        </div>
        <span style={{ fontSize:11, color:"#374151", fontFamily:"monospace" }}>{stats.date} · {clock} UTC</span>
        <div style={{ marginLeft:"auto", display:"flex", gap:10, fontSize:11, alignItems:"center" }}>
          <span style={{ color:"#64748b" }}>{stats.total} services</span>
          <span style={{ color:"#34d399", fontWeight:600 }}>{stats.active} active</span>
          {inFlight>0&&<span style={{ color:"#38bdf8", fontWeight:700 }}>{inFlight} in flight</span>}
        </div>
      </div>

      {/* Filter + view tabs */}
      <div style={{ padding:"8px 14px", borderBottom:"1px solid rgba(255,255,255,0.06)", background:"#0a1020", display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" as const }}>
        <div style={{ display:"flex", gap:4 }}>{pill("all","All")}{pill("outbound","Outbound")}{pill("inbound","Inbound")}</div>
        <div style={{ marginLeft:"auto", display:"flex", gap:4 }}>
          {VIEW_TABS.map(t=>(
            <button key={t.k} onClick={()=>setViewTab(t.k)} style={{ padding:"4px 10px", borderRadius:7, fontSize:10, fontWeight:600, cursor:"pointer", border:`1px solid ${viewTab===t.k?"rgba(255,255,255,0.15)":"rgba(255,255,255,0.06)"}`, background:viewTab===t.k?"rgba(255,255,255,0.08)":"transparent", color:viewTab===t.k?"#e2e8f0":"#4b5563", fontFamily:"system-ui,sans-serif" }}>{t.l}</button>
          ))}
        </div>
      </div>

      {/* Map + panel */}
      <div className="euromap-map-layout" style={{ display:"flex" }}>
        <div style={{ flex:1, minWidth:0 }}>
          <MapContainer center={[50.5,2.5]} zoom={6} className="euromap-map-canvas" style={{ height:"clamp(480px, 62vh, 680px)", width:"100%" }} scrollWheelZoom>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com">CARTO</a>'
              subdomains="abcd" maxZoom={18} />
            <FitBoundsUpdater services={services} />
            <MapResizer hasSidebar={!!selectedSvc} />
            {segments.map(seg=>(
              <Polyline key={`${seg.pts[0][0]},${seg.pts[0][1]}~${seg.pts[1][0]},${seg.pts[1][1]}`} positions={seg.pts}
                pathOptions={{ color:seg.isTunnel?"#f59e0b":"#3b82f6", weight:seg.isTunnel?2.5:2, opacity:seg.isTunnel?0.7:0.5, dashArray:seg.isTunnel?"7 5":undefined }} />
            ))}
            {positions.map(({svc,pos})=>(
              <Marker key={svc.serviceCode} position={[pos.lat,pos.lon]} icon={makeIcon(svc,pos.state)}
                zIndexOffset={pos.state==="active"?500:0}
                eventHandlers={{ click:()=>setSelected(s=>s===svc.serviceCode?null:svc.serviceCode) }}>
                <Tooltip sticky offset={[14,0]}><TrainTooltip svc={svc} state={pos.state} now={now} /></Tooltip>
              </Marker>
            ))}
          </MapContainer>
        </div>
        <AnimatePresence>
          {selectedSvc && <DetailPanel key={selectedSvc.serviceCode} svc={selectedSvc} now={now} onClose={()=>setSelected(null)} />}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div style={{ padding:"9px 16px", borderTop:"1px solid rgba(255,255,255,0.06)", background:"#0a1020", display:"flex", alignItems:"center", justifyContent:"space-between", gap:8, flexWrap:"wrap" as const }}>
        <Legend />
        <span style={{ fontSize:10, color:"#334155", fontFamily:"monospace" }}>Hover to inspect · Click for full itinerary · Auto-refreshes every 10s</span>
      </div>
    </div>
  )
}
