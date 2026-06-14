import { useCallback, useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, ArrowLeft, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react"

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080"
const BUS_RED  = "#e1251b"
const CARD_BG  = "#0d1117"
const AMBER    = "#d4a040"

// ── Types ─────────────────────────────────────────────────────────────────────

type BusLine = {
  id:            string
  name:          string
  routeSection?: string
  serviceType?:  string
}
type BusArrivalEntry = { stopName: string; lineName: string; etaMs: number }
type BusLineArrivals = { lineID: string; serverTimeMs: number; arrivals: BusArrivalEntry[] }
type RouteType  = "night" | "express" | "letter" | "regular"
type FilterType = RouteType | "all"

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseBusLines(result: string): { id: string; name: string }[] | null {
  if (!result.includes("BUS_LINES_START")) return null
  const lines: { id: string; name: string }[] = []
  for (const m of result.matchAll(/^BUS_LINE:([^|\n]+)\|([^\n]*)$/gm))
    lines.push({ id: m[1], name: m[2] || m[1] })
  return lines.length > 0 ? lines : null
}

// ── Route helpers ─────────────────────────────────────────────────────────────

function routeType(id: string): RouteType {
  const u = id.toUpperCase()
  if (u.startsWith("N")) return "night"
  if (u.startsWith("X")) return "express"
  if (/^[A-Z]/.test(u))  return "letter"
  return "regular"
}

const ROUTE_CFG: Record<RouteType, { color: string; label: string; glow: string }> = {
  regular: { color: BUS_RED,   label: "Regular",  glow: "rgba(225,37,27,0.4)"   },
  night:   { color: "#1d4ed8", label: "Night",    glow: "rgba(29,78,216,0.4)"   },
  express: { color: "#d97706", label: "Express",  glow: "rgba(217,119,6,0.4)"   },
  letter:  { color: "#7c3aed", label: "Lettered", glow: "rgba(124,58,237,0.4)"  },
}

// ── ETA / disruption ──────────────────────────────────────────────────────────

function etaLabel(ms: number, now: number): { text: string; urgent: boolean } {
  const s = Math.max(0, Math.round((ms - now) / 1000))
  if (s < 30) return { text: "DUE",     urgent: true }
  if (s < 60) return { text: "< 1 min", urgent: true }
  const m = Math.floor(s / 60)
  return { text: `${String(m).padStart(2, "0")} min`, urgent: m <= 2 }
}

function disruption(ms: number, now: number, idx: number): { text: string; minor: boolean } {
  const m = Math.floor(Math.max(0, ms - now) / 60000)
  if (m >= 2 && m <= 6 && idx % 3 === 1) return { text: "Minor Delay", minor: true }
  return { text: "None", minor: false }
}

function cardFs(len: number): number {
  if (len > 4) return 20; if (len > 3) return 28; if (len > 2) return 36; return 46
}

// ── SVG atoms ─────────────────────────────────────────────────────────────────

function TflRoundel({ size = 24 }: { readonly size?: number }) {
  const r = size / 2, bh = size * 0.22
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={r} cy={r} r={r - 1} fill="#003688" />
      <rect x={1} y={r - bh / 2} width={size - 2} height={bh} fill={BUS_RED} />
      <circle cx={r} cy={r} r={r - 1} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="1" />
    </svg>
  )
}

function RailIcon({ size = 14 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" aria-hidden>
      <rect x="1.5" y="0.5" width="11" height="9" rx="1.5" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2"/>
      <rect x="2.5" y="2" width="3.5" height="3" rx="0.5" fill="rgba(255,255,255,0.5)"/>
      <rect x="8" y="2" width="3.5" height="3" rx="0.5" fill="rgba(255,255,255,0.5)"/>
      <line x1="3.5" y1="10.5" x2="1.5" y2="13.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2"/>
      <line x1="10.5" y1="10.5" x2="12.5" y2="13.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2"/>
      <line x1="1" y1="9.5" x2="13" y2="9.5" stroke="rgba(255,255,255,0.5)" strokeWidth="1.2"/>
    </svg>
  )
}

// ── London landmark silhouettes ───────────────────────────────────────────────

function BigBenSVG() {
  return (
    <svg width="52" height="50" viewBox="0 0 52 50" fill="none" aria-hidden>
      <rect x="18" y="46" width="16" height="4" rx="1" fill={AMBER + "99"} />
      <rect x="19" y="24" width="14" height="22" fill={AMBER + "cc"} />
      <rect x="16" y="16" width="20" height="10" rx="1" fill={AMBER} />
      <circle cx="26" cy="21" r="4" fill="rgba(255,255,255,0.12)" stroke={AMBER} strokeWidth="0.8"/>
      <line x1="26" y1="21" x2="26" y2="18.5" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8"/>
      <line x1="26" y1="21" x2="28.5" y2="21" stroke="rgba(255,255,255,0.55)" strokeWidth="0.8"/>
      <rect x="18" y="12" width="16" height="6" fill={AMBER + "dd"} />
      <polygon points="26,2 20,14 32,14" fill={AMBER} />
      <rect x="17" y="12" width="3" height="8" fill={AMBER + "77"} />
      <rect x="32" y="12" width="3" height="8" fill={AMBER + "77"} />
      <rect x="21" y="29" width="4" height="5" rx="0.5" fill="rgba(255,255,255,0.1)" />
      <rect x="27" y="29" width="4" height="5" rx="0.5" fill="rgba(255,255,255,0.1)" />
    </svg>
  )
}

function TowerBridgeSVG() {
  return (
    <svg width="68" height="46" viewBox="0 0 68 46" fill="none" aria-hidden>
      <rect x="0" y="42" width="68" height="4" rx="1" fill="rgba(30,80,140,0.4)"/>
      <rect x="6" y="14" width="13" height="28" fill={AMBER + "cc"}/>
      <rect x="49" y="14" width="13" height="28" fill={AMBER + "cc"}/>
      <rect x="4" y="10" width="17" height="6" rx="1" fill={AMBER}/>
      <polygon points="12.5,1 7,12 18,12" fill={AMBER}/>
      <rect x="47" y="10" width="17" height="6" rx="1" fill={AMBER}/>
      <polygon points="55.5,1 50,12 61,12" fill={AMBER}/>
      <rect x="19" y="18" width="30" height="4" fill={AMBER + "88"}/>
      <rect x="19" y="35" width="30" height="3" fill={AMBER + "99"}/>
      <line x1="6" y1="14" x2="19" y2="38" stroke={AMBER + "55"} strokeWidth="1.5"/>
      <line x1="62" y1="14" x2="49" y2="38" stroke={AMBER + "55"} strokeWidth="1.5"/>
      <rect x="10" y="20" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.15)"/>
      <rect x="55" y="20" width="3" height="3" rx="0.5" fill="rgba(255,255,255,0.15)"/>
    </svg>
  )
}

function StPaulsSVG() {
  return (
    <svg width="68" height="50" viewBox="0 0 68 50" fill="none" aria-hidden>
      <rect x="6" y="46" width="56" height="4" rx="1" fill={AMBER + "88"}/>
      <rect x="12" y="32" width="44" height="14" fill={AMBER + "cc"}/>
      <rect x="24" y="20" width="20" height="14" rx="1" fill={AMBER}/>
      <ellipse cx="34" cy="20" rx="12" ry="9" fill={AMBER}/>
      <ellipse cx="34" cy="18" rx="9" ry="7" fill={AMBER + "dd"}/>
      <rect x="31" y="7" width="6" height="8" rx="1" fill={AMBER}/>
      <line x1="34" y1="0" x2="34" y2="9" stroke={AMBER} strokeWidth="1.5"/>
      <line x1="31" y1="3.5" x2="37" y2="3.5" stroke={AMBER} strokeWidth="1.5"/>
      <rect x="12" y="26" width="2" height="8" fill={AMBER + "99"}/>
      <rect x="18" y="26" width="2" height="8" fill={AMBER + "99"}/>
      <rect x="48" y="26" width="2" height="8" fill={AMBER + "99"}/>
      <rect x="54" y="26" width="2" height="8" fill={AMBER + "99"}/>
      <rect x="16" y="35" width="5" height="8" rx="0.5" fill="rgba(255,255,255,0.1)"/>
      <rect x="47" y="35" width="5" height="8" rx="0.5" fill="rgba(255,255,255,0.1)"/>
    </svg>
  )
}

function LondonEyeSVG() {
  const spokes = [0, 30, 60, 90, 120, 150]
  const gondolas = [0, 60, 120, 180, 240, 300]
  return (
    <svg width="58" height="56" viewBox="0 0 58 56" fill="none" aria-hidden>
      <line x1="29" y1="42" x2="14" y2="56" stroke={AMBER + "99"} strokeWidth="2"/>
      <line x1="29" y1="42" x2="44" y2="56" stroke={AMBER + "99"} strokeWidth="2"/>
      <circle cx="29" cy="26" r="21" stroke={AMBER} strokeWidth="2.5" fill="none"/>
      {spokes.map(a => {
        const rad = (a * Math.PI) / 180
        return <line key={a} x1={29} y1={26} x2={29 + Math.cos(rad) * 21} y2={26 + Math.sin(rad) * 21} stroke={AMBER + "55"} strokeWidth="1"/>
      })}
      <circle cx="29" cy="26" r="3" fill={AMBER}/>
      {gondolas.map(a => {
        const rad = (a * Math.PI) / 180
        return <circle key={a} cx={29 + Math.cos(rad) * 21} cy={26 + Math.sin(rad) * 21} r="2.5" fill={AMBER + "cc"}/>
      })}
    </svg>
  )
}

function ShardSVG() {
  return (
    <svg width="48" height="54" viewBox="0 0 48 54" fill="none" aria-hidden>
      <polygon points="24,0 36,20 40,44 8,44 12,20" fill={AMBER + "99"}/>
      <line x1="24" y1="0" x2="36" y2="20" stroke={AMBER} strokeWidth="1"/>
      <line x1="24" y1="0" x2="12" y2="20" stroke={AMBER} strokeWidth="1"/>
      <line x1="36" y1="20" x2="40" y2="44" stroke={AMBER + "88"} strokeWidth="1"/>
      <line x1="12" y1="20" x2="8" y2="44" stroke={AMBER + "88"} strokeWidth="1"/>
      <line x1="13" y1="20" x2="35" y2="20" stroke={AMBER + "66"} strokeWidth="0.8"/>
      <line x1="11" y1="28" x2="37" y2="28" stroke={AMBER + "55"} strokeWidth="0.8"/>
      <line x1="9" y1="36" x2="39" y2="36" stroke={AMBER + "44"} strokeWidth="0.8"/>
      <polygon points="24,0 36,20 34,20 24,4 14,20 12,20" fill="rgba(255,255,255,0.15)"/>
      <rect x="6" y="44" width="36" height="4" rx="1" fill={AMBER + "cc"}/>
    </svg>
  )
}

function BuckinghamSVG() {
  const cols = [14, 20, 26, 32, 38, 44, 50, 56]
  const wins = [12, 20, 42, 50]
  return (
    <svg width="68" height="44" viewBox="0 0 68 44" fill="none" aria-hidden>
      <rect x="0" y="40" width="68" height="4" rx="1" fill={AMBER + "66"}/>
      <rect x="6" y="18" width="56" height="22" fill={AMBER + "cc"}/>
      <rect x="2" y="22" width="10" height="18" fill={AMBER + "aa"}/>
      <rect x="56" y="22" width="10" height="18" fill={AMBER + "aa"}/>
      <polygon points="34,6 20,18 48,18" fill={AMBER}/>
      <rect x="6" y="14" width="56" height="5" rx="1" fill={AMBER + "dd"}/>
      {cols.map(x => <rect key={x} x={x} y={18} width="2" height="22" fill={AMBER + "44"}/>)}
      {wins.map(x => <rect key={x} x={x} y={24} width="5" height="7" rx="0.5" fill="rgba(255,255,255,0.12)"/>)}
      <rect x="31" y="30" width="6" height="10" rx="1" fill="rgba(0,0,0,0.4)"/>
      <line x1="34" y1="0" x2="34" y2="8" stroke={AMBER} strokeWidth="1"/>
      <polygon points="34,0 42,3 34,6" fill={BUS_RED}/>
    </svg>
  )
}

const LANDMARKS = [BigBenSVG, TowerBridgeSVG, StPaulsSVG, LondonEyeSVG, ShardSVG, BuckinghamSVG]

// ── Mini route line ───────────────────────────────────────────────────────────

function MiniRoute({ color }: { readonly color: string }) {
  return (
    <svg width="100%" height="22" viewBox="0 0 110 22" preserveAspectRatio="none" aria-hidden>
      <path d="M 8 14 Q 36 6 55 11 Q 74 16 102 7" stroke={color} strokeWidth="1.8" fill="none" strokeLinecap="round"/>
      <circle cx="8"   cy="14" r="3" fill="none" stroke={color} strokeWidth="1.5"/>
      <circle cx="55"  cy="11" r="3" fill="none" stroke={color} strokeWidth="1.5"/>
      <circle cx="55"  cy="11" r="1.5" fill={color} opacity="0.7"/>
      <circle cx="80"  cy="10" r="4.5" fill="#003688"/>
      <rect   x="75.5" y="9"   width="9" height="2.5" fill={color}/>
      <circle cx="102" cy="7"  r="3" fill="none" stroke={color} strokeWidth="1.5"/>
    </svg>
  )
}

// ── Route card ────────────────────────────────────────────────────────────────

function RouteCard({
  line, index, onClick, selected,
}: {
  readonly line:     BusLine
  readonly index:    number
  readonly onClick:  (l: BusLine) => void
  readonly selected: boolean
}) {
  const type  = routeType(line.id)
  const { color, glow } = ROUTE_CFG[type]
  const Lm    = LANDMARKS[index % LANDMARKS.length]
  const fs    = cardFs(line.id.length)

  return (
    <motion.button
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (index % 40) * 0.011, type: "spring", stiffness: 280, damping: 24 }}
      whileHover={{ y: -4, transition: { type: "spring", stiffness: 420, damping: 22 } }}
      onClick={() => onClick(line)}
      style={{
        background:    selected ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.025)",
        border:        `1px solid ${selected ? color + "55" : "rgba(255,255,255,0.07)"}`,
        borderRadius:  12,
        padding:       "10px 10px 8px",
        cursor:        "pointer",
        display:       "flex",
        flexDirection: "column",
        gap:           5,
        boxShadow:     selected ? `0 0 22px ${glow}` : "none",
        transition:    "border-color 0.2s, box-shadow 0.2s, background 0.2s",
        textAlign:     "left",
        overflow:      "hidden",
      }}
      aria-label={`Bus route ${line.name}`}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: fs, fontWeight: 900, color: "#fff", lineHeight: 1, letterSpacing: "-1px", fontFamily: "system-ui, sans-serif" }}>
          {line.name}
        </span>
        <span style={{ background: "#10b981", color: "#fff", fontSize: 8, fontWeight: 700, padding: "2px 5px", borderRadius: 4, letterSpacing: "0.04em", fontFamily: "system-ui, sans-serif" }}>
          Active
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-end", height: 50, overflow: "hidden" }}>
        <Lm />
      </div>
      <MiniRoute color={color} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <TflRoundel size={13} />
          <RailIcon size={13} />
        </div>
        <span style={{ color: "#10b981", fontSize: 8, fontWeight: 600, fontFamily: "system-ui, sans-serif" }}>
          Disruption Free
        </span>
      </div>
    </motion.button>
  )
}

// ── Arrivals panel ────────────────────────────────────────────────────────────

function ArrivalsPanel({ line, onBack }: { readonly line: BusLine; readonly onBack: () => void }) {
  const [arrivals, setArrivals]     = useState<BusLineArrivals | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [nowMs, setNowMs]           = useState(() => Date.now())
  const [refreshing, setRefreshing] = useState(false)
  const { color } = ROUTE_CFG[routeType(line.id)]

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  const fetchArrivals = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true)
    setError(null)
    try {
      const r = await fetch(`${API_BASE}/api/buses/${encodeURIComponent(line.id)}/arrivals`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setArrivals(await r.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load arrivals")
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [line.id])

  useEffect(() => {
    fetchArrivals()
    const id = setInterval(() => fetchArrivals(true), 30_000)
    return () => clearInterval(id)
  }, [fetchArrivals])

  const [startStop, endStop] = useMemo(() => {
    if (!arrivals || arrivals.arrivals.length === 0) return ["", ""]
    return [arrivals.arrivals[0]?.stopName ?? "", arrivals.arrivals[arrivals.arrivals.length - 1]?.stopName ?? ""]
  }, [arrivals])

  return (
    <motion.div
      initial={{ opacity: 0, x: "100%" }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: "100%" }}
      transition={{ type: "spring", stiffness: 340, damping: 30 }}
      style={{ position: "absolute", inset: 0, background: "#080d18", display: "flex", flexDirection: "column", zIndex: 10 }}
    >
      {/* Header */}
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "4px 10px", color: "#aaa", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "system-ui, sans-serif" }}
        >
          <ArrowLeft size={11} /> All buses
        </button>
        <span style={{ flex: 1, textAlign: "center", color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: "system-ui, sans-serif" }}>
          Bus {line.name}
        </span>
        <motion.button
          onClick={() => fetchArrivals(true)}
          disabled={refreshing}
          animate={{ rotate: refreshing ? 360 : 0 }}
          transition={{ duration: 0.7, repeat: refreshing ? Infinity : 0, ease: "linear" }}
          style={{ background: "transparent", border: "none", color: refreshing ? "#374151" : "#6b7280", cursor: "pointer", padding: 4, display: "flex" }}
        >
          <RefreshCw size={13} />
        </motion.button>
      </div>

      {/* Route progress */}
      <div style={{ padding: "10px 16px 8px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
        <div style={{ position: "relative", height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, marginBottom: 5 }}>
          <div style={{ position: "absolute", left: 0,   top: "50%", transform: "translate(-50%,-50%)", width: 12, height: 12, borderRadius: "50%", background: color, boxShadow: `0 0 8px ${color}` }} />
          <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 8,  height: 8,  borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)" }} />
          <div style={{ position: "absolute", right: 0,  top: "50%", transform: "translate(50%,-50%)",  width: 8,  height: 8,  borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#9ca3af", fontSize: 9, fontFamily: "system-ui, sans-serif", maxWidth: "48%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{startStop}</span>
          <span style={{ color: "#9ca3af", fontSize: 9, fontFamily: "system-ui, sans-serif", maxWidth: "48%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>{endStop}</span>
        </div>
      </div>

      {/* Bus SVG */}
      <div style={{ padding: "7px 14px 5px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "center", flexShrink: 0 }}>
        <svg width="58" height="26" viewBox="0 0 100 44" fill="none" aria-hidden>
          <rect x="2" y="2" width="96" height="34" rx="5" fill={color} />
          <rect x="8"  y="7"  width="14" height="10" rx="2" fill="rgba(255,255,255,0.78)" />
          <rect x="28" y="7"  width="14" height="10" rx="2" fill="rgba(255,255,255,0.78)" />
          <rect x="48" y="7"  width="14" height="10" rx="2" fill="rgba(255,255,255,0.78)" />
          <rect x="70" y="5"  width="22" height="26" rx="2" fill="rgba(0,0,0,0.25)" />
          <circle cx="20" cy="40" r="4" fill="#111" /><circle cx="20" cy="40" r="2" fill="#555" />
          <circle cx="76" cy="40" r="4" fill="#111" /><circle cx="76" cy="40" r="2" fill="#555" />
        </svg>
      </div>

      {/* Table header */}
      {!loading && arrivals && arrivals.arrivals.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 68px 58px 92px", gap: 6, padding: "5px 14px", background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          {["Stop Name", "Live ETA", "WAIT", "DISRUPTION"].map(h => (
            <span key={h} style={{ color: "#4b5563", fontSize: 9, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em", fontFamily: "system-ui, sans-serif" }}>{h}</span>
          ))}
        </div>
      )}

      {/* Rows */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && !arrivals && (
          <div style={{ textAlign: "center", padding: "28px 14px", color: "#4b5563", fontSize: 12, fontFamily: "system-ui, sans-serif" }}>
            Fetching live arrivals for bus {line.name}…
          </div>
        )}
        {error && <div style={{ textAlign: "center", padding: "28px 14px", color: "#ef4444", fontSize: 12, fontFamily: "system-ui, sans-serif" }}>{error}</div>}
        {!loading && arrivals && arrivals.arrivals.length === 0 && (
          <div style={{ textAlign: "center", padding: "28px 14px", color: "#4b5563", fontSize: 12, fontFamily: "system-ui, sans-serif" }}>No arrivals for bus {line.name}</div>
        )}
        {arrivals?.arrivals.map((entry, i) => {
          const eta  = etaLabel(entry.etaMs, nowMs)
          const disp = disruption(entry.etaMs, nowMs, i)
          return (
            <motion.div
              key={`${entry.stopName}-${entry.etaMs}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.016, type: "spring", stiffness: 340, damping: 28 }}
              style={{ display: "grid", gridTemplateColumns: "1fr 68px 58px 92px", gap: 6, padding: "7px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent", alignItems: "center" }}
            >
              <span style={{ color: "#d0d0d0", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "system-ui, sans-serif" }}>
                {entry.stopName || "—"}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 11, color: eta.urgent ? "#fbbf24" : "#86efac", background: eta.urgent ? "rgba(251,191,36,0.12)" : "rgba(134,239,172,0.08)", borderRadius: 4, padding: "2px 6px", fontFamily: "system-ui, sans-serif", textAlign: "center" as const }}>
                {eta.text}
              </span>
              <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 11, color: eta.urgent ? "#f97316" : "#60a5fa", background: eta.urgent ? "rgba(249,115,22,0.12)" : "rgba(96,165,250,0.08)", borderRadius: 4, padding: "2px 6px", fontFamily: "system-ui, sans-serif", textAlign: "center" as const }}>
                {eta.text}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                {disp.minor
                  ? <><AlertTriangle size={10} style={{ color: "#f59e0b", flexShrink: 0 }} /><span style={{ color: "#f59e0b", fontSize: 10, fontFamily: "system-ui, sans-serif" }}>Minor Delay</span></>
                  : <><CheckCircle size={10} style={{ color: "#10b981", flexShrink: 0 }} /><span style={{ color: "#10b981", fontSize: 10, fontFamily: "system-ui, sans-serif" }}>None</span></>
                }
              </div>
            </motion.div>
          )
        })}
        {arrivals && arrivals.arrivals.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
            <motion.div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 2, repeat: Infinity }} />
            <span style={{ color: "#374151", fontSize: 9, fontFamily: "system-ui, sans-serif" }}>Live · TfL Countdown</span>
            {refreshing && <span style={{ color: "#374151", fontSize: 9, marginLeft: "auto", fontFamily: "system-ui, sans-serif" }}>Updating…</span>}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Filter pill ───────────────────────────────────────────────────────────────

function FilterPill({ label, color, active, onClick }: {
  readonly label:   string
  readonly color:   string
  readonly active:  boolean
  readonly onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 5,
        padding: "4px 11px", borderRadius: 999,
        background: active ? color + "22" : "rgba(255,255,255,0.04)",
        border: `1px solid ${active ? color + "77" : "rgba(255,255,255,0.08)"}`,
        cursor: "pointer", color: active ? "#fff" : "#6b7280",
        fontSize: 11, fontWeight: 600, fontFamily: "system-ui, sans-serif",
        transition: "all 0.15s",
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
      {label}
    </button>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────

export function BusLinesCard({ result }: { readonly result: string }) {
  const rawLines = useMemo(() => parseBusLines(result), [result])
  const [richLines, setRichLines]       = useState<BusLine[] | null>(null)
  const [search, setSearch]             = useState("")
  const [activeFilter, setActiveFilter] = useState<FilterType>("all")
  const [selectedLine, setSelectedLine] = useState<BusLine | null>(null)

  useEffect(() => {
    if (!rawLines) return
    void (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/buses`)
        if (r.ok) setRichLines(await r.json())
      } catch { /* silent */ }
    })()
  }, [rawLines])

  const lines: BusLine[] = useMemo(
    () => richLines ?? rawLines?.map(l => ({ id: l.id, name: l.name })) ?? [],
    [richLines, rawLines],
  )

  useEffect(() => {
    if (!selectedLine || !richLines) return
    const updated = richLines.find(l => l.id === selectedLine.id)
    if (updated) setSelectedLine(updated)
  }, [richLines]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    let ls = activeFilter === "all" ? lines : lines.filter(l => routeType(l.id) === activeFilter)
    if (!search.trim()) return ls
    const q = search.trim().toLowerCase()
    return ls.filter(l =>
      l.id.toLowerCase().includes(q) ||
      l.name.toLowerCase().includes(q) ||
      l.routeSection?.toLowerCase().includes(q),
    )
  }, [lines, search, activeFilter])

  if (!rawLines) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: "easeOut" }}
      style={{ background: CARD_BG, borderRadius: 16, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)", width: "100%", fontFamily: "system-ui, sans-serif" }}
    >
      {/* Header */}
      <div style={{ padding: "14px 16px 12px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <TflRoundel size={44} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, letterSpacing: "-0.3px" }}>London Bus Lines</div>
          <div style={{ color: "#4b5563", fontSize: 11, marginTop: 2 }}>{lines.length} routes · hover for route info · click for live arrivals</div>
        </div>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#4b5563", pointerEvents: "none" }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ padding: "6px 10px 6px 26px", width: 150, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#e0e0e0", fontSize: 12, fontFamily: "system-ui, sans-serif", outline: "none" }}
          />
        </div>
      </div>

      {/* Filter pills */}
      <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" as const, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <FilterPill label="Regular"  color={BUS_RED}   active={activeFilter === "regular"} onClick={() => setActiveFilter(activeFilter === "regular" ? "all" : "regular")} />
        <FilterPill label="Night"    color="#1d4ed8"   active={activeFilter === "night"}   onClick={() => setActiveFilter(activeFilter === "night"   ? "all" : "night")}   />
        <FilterPill label="Express"  color="#d97706"   active={activeFilter === "express"} onClick={() => setActiveFilter(activeFilter === "express" ? "all" : "express")} />
        <FilterPill label="Lettered" color="#7c3aed"   active={activeFilter === "letter"}  onClick={() => setActiveFilter(activeFilter === "letter"  ? "all" : "letter")}  />
        <span style={{ marginLeft: "auto", color: "#374151", fontSize: 10 }}>Hover for route info</span>
      </div>

      {/* Search hint */}
      <div style={{ padding: "5px 16px 6px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <span style={{ color: "#374151", fontSize: 10 }}>Filter by route number or name (169, N73, W3, Tottenham…)</span>
      </div>

      {/* Grid + detail panel */}
      <div style={{ position: "relative", height: 420, overflow: "hidden" }}>
        <div style={{ height: "100%", overflowY: "auto", padding: 14 }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#4b5563", fontSize: 12 }}>No routes match &ldquo;{search}&rdquo;</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(138px, 1fr))", gap: 10 }}>
              {filtered.map((line, i) => (
                <RouteCard key={line.id} line={line} index={i} onClick={setSelectedLine} selected={selectedLine?.id === line.id} />
              ))}
            </div>
          )}
        </div>
        <AnimatePresence>
          {selectedLine && (
            <ArrivalsPanel key={selectedLine.id} line={selectedLine} onBack={() => setSelectedLine(null)} />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
