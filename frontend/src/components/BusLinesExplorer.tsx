import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Search, ArrowLeft, RefreshCw, MapPin, Clock } from "lucide-react"

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080"
const BUS_RED  = "#e1251b"
const DARK_BG  = "#0d1117"

// ── Types ─────────────────────────────────────────────────────────────────────

type BusLine = {
  id:            string
  name:          string
  routeSection?: string
  serviceType?:  string
}

type BusArrivalEntry = { stopName: string; lineName: string; etaMs: number }

type BusLineArrivals = {
  lineID:       string
  serverTimeMs: number
  arrivals:     BusArrivalEntry[]
}

// ── Font-size helpers (no nested ternaries) ───────────────────────────────────

function roundelFontSize(len: number): number {
  if (len > 4) return 10
  if (len > 3) return 12
  if (len > 2) return 15
  return 20
}

function panelFontSize(len: number): number {
  if (len > 3) return 13
  if (len > 2) return 16
  return 20
}

function explorerShadow(selected: boolean, hovered: boolean, colours: (typeof ROUTE_COLOURS)[RouteType]): string {
  if (selected) return `0 0 0 5px ${colours.bg}28, 0 8px 24px ${colours.glow}`
  if (hovered)  return `0 0 0 3px ${colours.bg}25, 0 5px 18px ${colours.glow}`
  return "0 3px 10px rgba(0,0,0,0.35)"
}

function tooltipTypeColor(type: RouteType): string {
  if (type === "regular") return "#fca5a5"
  if (type === "night")   return "#93c5fd"
  if (type === "express") return "#fcd34d"
  return "#c4b5fd"
}

// ── Route type helpers ────────────────────────────────────────────────────────

type RouteType = "night" | "express" | "letter" | "regular"

function routeType(id: string): RouteType {
  const u = id.toUpperCase()
  if (u.startsWith("N")) return "night"
  if (u.startsWith("X")) return "express"
  if (/^[A-Z]/.test(u))  return "letter"
  return "regular"
}

const ROUTE_COLOURS: Record<RouteType, { bg: string; border: string; glow: string; label: string }> = {
  regular: { bg: BUS_RED,   border: "rgba(255,255,255,0.18)", glow: "rgba(225,37,27,0.5)",  label: "Regular"  },
  night:   { bg: "#003688", border: "rgba(100,150,255,0.3)",  glow: "rgba(0,54,136,0.6)",   label: "Night"    },
  express: { bg: "#b45309", border: "rgba(255,200,80,0.3)",   glow: "rgba(180,83,9,0.55)",  label: "Express"  },
  letter:  { bg: "#7c3aed", border: "rgba(180,140,255,0.25)", glow: "rgba(124,58,237,0.5)", label: "Lettered" },
}

// ── ETA helpers ───────────────────────────────────────────────────────────────

function etaLabel(etaMs: number, nowMs: number): { text: string; urgent: boolean } {
  const secs = Math.max(0, Math.round((etaMs - nowMs) / 1000))
  if (secs < 30) return { text: "Due",     urgent: true }
  if (secs < 60) return { text: "< 1 min", urgent: true }
  const mins = Math.floor(secs / 60)
  return { text: `${mins} min`, urgent: mins <= 2 }
}

// ── TfL roundel badge ─────────────────────────────────────────────────────────

function TfLRoundel({ size = 32 }: { readonly size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: "#003688", border: "3px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <div style={{ width: size * 0.72, height: size * 0.17, background: BUS_RED, borderRadius: 2 }} />
    </div>
  )
}

// ── Hover tooltip ─────────────────────────────────────────────────────────────

function HoverTooltip({ line, colours }: { readonly line: BusLine; readonly colours: typeof ROUTE_COLOURS[RouteType] }) {
  const type      = routeType(line.id)
  const typeLabel = line.serviceType || colours.label
  const route     = line.routeSection

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.86 }}
      animate={{ opacity: 1, y: 0,  scale: 1 }}
      exit={{ opacity: 0, y: 6, scale: 0.92 }}
      transition={{ type: "spring", stiffness: 440, damping: 28 }}
      style={{
        position:      "absolute",
        bottom:        "calc(100% + 12px)",
        left:          "50%",
        transform:     "translateX(-50%)",
        zIndex:        300,
        background:    "#13181f",
        border:        `1px solid ${colours.border}`,
        borderRadius:  12,
        padding:       "10px 14px",
        minWidth:      170,
        maxWidth:      240,
        boxShadow:     `0 10px 36px rgba(0,0,0,0.65), 0 0 0 1px ${colours.bg}22`,
        pointerEvents: "none",
        whiteSpace:    "nowrap",
      }}
    >
      {/* Arrow */}
      <div style={{ position: "absolute", bottom: -5, left: "50%", transform: "translateX(-50%)", width: 10, height: 10, background: "#13181f", border: `1px solid ${colours.border}`, borderTop: "none", borderLeft: "none", rotate: "45deg" }} />

      {/* Badge + type */}
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: route ? 7 : 4 }}>
        <div style={{ background: colours.bg, borderRadius: 7, padding: "3px 9px", fontWeight: 800, fontSize: 14, color: "#fff", fontFamily: "system-ui, sans-serif", letterSpacing: "-0.3px" }}>
          {line.name}
        </div>
        <span style={{ background: `${colours.bg}22`, border: `1px solid ${colours.bg}44`, borderRadius: 5, padding: "2px 7px", fontSize: 10, color: tooltipTypeColor(type), fontWeight: 600, fontFamily: "system-ui, sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {typeLabel}
        </span>
      </div>

      {/* Route section */}
      {route && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 5, marginBottom: 7 }}>
          <MapPin size={11} style={{ color: "#6b7280", flexShrink: 0, marginTop: 1 }} />
          <span style={{ color: "#9ca3af", fontSize: 12, fontFamily: "system-ui, sans-serif", whiteSpace: "normal", lineHeight: 1.4 }}>
            {route}
          </span>
        </div>
      )}

      {/* CTA */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <Clock size={10} style={{ color: "#4b5563" }} />
        <span style={{ color: "#4b5563", fontSize: 11, fontFamily: "system-ui, sans-serif" }}>Click for live arrivals</span>
      </div>
    </motion.div>
  )
}

// ── Bus roundel tile ──────────────────────────────────────────────────────────

function BusRoundel({
  line,
  index,
  onClick,
  selected,
}: {
  readonly line:     BusLine
  readonly index:    number
  readonly onClick:  (line: BusLine) => void
  readonly selected: boolean
}) {
  const [hovered, setHovered] = useState(false)
  const type    = routeType(line.id)
  const colours = ROUTE_COLOURS[type]
  const fontSize = roundelFontSize(line.id.length)

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {/* Pulsing ring when selected */}
      {selected && (
        <motion.div
          style={{ position: "absolute", inset: -7, borderRadius: "50%", border: `2px solid ${colours.bg}`, pointerEvents: "none" }}
          animate={{ opacity: [0.8, 0], scale: [1, 1.55] }}
          transition={{ duration: 1.3, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      <motion.button
        initial={{ opacity: 0, scale: 0.45, y: 20 }}
        animate={{ opacity: 1, scale: selected ? 1.2 : 1, y: 0 }}
        transition={{
          delay:     (index % 60) * 0.009,
          type:      "spring",
          stiffness: 360,
          damping:   22,
          scale:     { duration: 0.15, type: "tween" },
        }}
        whileHover={{ scale: selected ? 1.2 : 1.18 }}
        whileTap={{ scale: 0.88 }}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        onClick={() => { onClick(line); setHovered(false) }}
        style={{
          background:     selected ? "#fff" : colours.bg,
          borderRadius:   "50%",
          width:          64,
          height:         64,
          border:         selected
            ? `3px solid ${colours.bg}`
            : `2px solid ${colours.border}`,
          cursor:         "pointer",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
          fontWeight:     800,
          fontSize,
          color:          selected ? colours.bg : "#fff",
          letterSpacing:  "-0.5px",
          boxShadow:      explorerShadow(selected, hovered, colours),
          fontFamily:     "system-ui, sans-serif",
          transition:     "background 0.15s, color 0.15s, border-color 0.15s, box-shadow 0.2s",
          userSelect:     "none",
          position:       "relative",
          zIndex:         1,
        }}
        aria-label={`Bus route ${line.name}`}
        aria-pressed={selected}
      >
        {line.name}
      </motion.button>

      {/* Hover tooltip */}
      <AnimatePresence>
        {hovered && !selected && (
          <HoverTooltip line={line} colours={colours} />
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Driving bus strip ─────────────────────────────────────────────────────────

function DrivingBus({ active }: { readonly active: boolean }) {
  return (
    <div style={{ overflow: "hidden", height: 46, background: "rgba(225,37,27,0.05)", borderBottom: "1px solid rgba(225,37,27,0.1)", display: "flex", alignItems: "center", flexShrink: 0 }}>
      <motion.div
        key={active ? "drive" : "stop"}
        initial={{ x: "-14%" }}
        animate={{ x: "110%" }}
        transition={{ duration: active ? 2 : 0, ease: "easeInOut", repeat: active ? Infinity : 0, repeatDelay: 0.5 }}
      >
        <svg width="68" height="50" viewBox="0 0 100 72" fill="none" aria-hidden>
          <rect x="2"  y="4"  width="96" height="52" rx="6" fill={BUS_RED} />
          <rect x="10" y="10" width="16" height="14" rx="3" fill="rgba(255,255,255,0.75)" />
          <rect x="32" y="10" width="16" height="14" rx="3" fill="rgba(255,255,255,0.75)" />
          <rect x="54" y="10" width="16" height="14" rx="3" fill="rgba(255,255,255,0.75)" />
          <rect x="76" y="10" width="16" height="14" rx="3" fill="rgba(255,255,255,0.75)" />
          <rect x="2"  y="28" width="96" height="4"  fill="rgba(0,0,0,0.25)" />
          <rect x="10" y="35" width="14" height="12" rx="3" fill="rgba(255,255,255,0.65)" />
          <rect x="30" y="35" width="14" height="12" rx="3" fill="rgba(255,255,255,0.65)" />
          <rect x="50" y="35" width="14" height="12" rx="3" fill="rgba(255,255,255,0.65)" />
          <rect x="70" y="33" width="20" height="23" rx="2" fill="rgba(0,0,0,0.3)" />
          <rect x="4"  y="54" width="92" height="6"  rx="2" fill="rgba(0,0,0,0.4)" />
          <circle cx="22" cy="64" r="8" fill="#1a1a1a" /><circle cx="22" cy="64" r="4" fill="#444" /><circle cx="22" cy="64" r="1.5" fill="#888" />
          <circle cx="78" cy="64" r="8" fill="#1a1a1a" /><circle cx="78" cy="64" r="4" fill="#444" /><circle cx="78" cy="64" r="1.5" fill="#888" />
        </svg>
      </motion.div>
    </div>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function BusLineDetail({ line, onBack }: { readonly line: BusLine; readonly onBack: () => void }) {
  const [arrivals, setArrivals]     = useState<BusLineArrivals | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)
  const [nowMs, setNowMs]           = useState(() => Date.now())
  const [refreshing, setRefreshing] = useState(false)
  const colours = ROUTE_COLOURS[routeType(line.id)]

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
      setLoading(false)
      setRefreshing(false)
    }
  }, [line.id])

  useEffect(() => {
    fetchArrivals()
    const id = setInterval(() => fetchArrivals(true), 30_000)
    return () => clearInterval(id)
  }, [fetchArrivals])

  const labelFontSize = panelFontSize(line.id.length)

  return (
    <motion.div
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 60 }}
      transition={{ type: "spring", stiffness: 340, damping: 30 }}
      style={{ position: "absolute", inset: 0, background: "#0f1419", display: "flex", flexDirection: "column", zIndex: 20 }}
    >
      {/* Header */}
      <div style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "5px 11px", color: "#ccc", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "system-ui, sans-serif", flexShrink: 0 }}
        >
          <ArrowLeft size={13} /> All buses
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
          <div style={{ background: colours.bg, borderRadius: "50%", width: 48, height: 48, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#fff", fontSize: labelFontSize, flexShrink: 0, fontFamily: "system-ui, sans-serif", boxShadow: `0 4px 14px ${colours.glow}` }}>
            {line.name}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 17, fontFamily: "system-ui, sans-serif" }}>Bus {line.name}</div>
            {line.routeSection
              ? <div style={{ color: "#6b7280", fontSize: 11, fontFamily: "system-ui, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{line.routeSection}</div>
              : <div style={{ color: "#6b7280", fontSize: 11, fontFamily: "system-ui, sans-serif" }}>Live arrivals · all stops</div>
            }
          </div>
        </div>

        <motion.button
          onClick={() => fetchArrivals(true)}
          disabled={refreshing}
          animate={{ rotate: refreshing ? 360 : 0 }}
          transition={{ duration: 0.7, repeat: refreshing ? Infinity : 0 }}
          style={{ background: "transparent", border: "none", color: refreshing ? "#374151" : "#6b7280", cursor: refreshing ? "default" : "pointer", display: "flex", padding: 4, flexShrink: 0 }}
          title="Refresh"
        >
          <RefreshCw size={15} />
        </motion.button>
      </div>

      <DrivingBus active={loading} />

      {/* Column headers */}
      {!loading && arrivals && arrivals.arrivals.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "5px 18px", background: "#161b22", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
          <span style={{ color: "#4b5563", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "system-ui, sans-serif" }}>Stop</span>
          <span style={{ color: "#4b5563", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right", minWidth: 56, fontFamily: "system-ui, sans-serif" }}>Wait</span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && !arrivals && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#4b5563", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>
            Fetching live arrivals for bus {line.name}…
          </div>
        )}
        {error && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#ef4444", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>{error}</div>
        )}
        {!loading && arrivals?.arrivals.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 20px", color: "#4b5563", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>
            No live arrivals predicted for bus {line.name}
          </div>
        )}
        {arrivals && arrivals.arrivals.length > 0 && (
          <>
            {arrivals.arrivals.map((entry, i) => {
              const eta = etaLabel(entry.etaMs, nowMs)
              return (
                <motion.div
                  key={`${entry.stopName}-${entry.etaMs}`}
                  initial={{ opacity: 0, x: -14 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.025, type: "spring", stiffness: 340, damping: 28 }}
                  style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "10px 18px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent", alignItems: "center" }}
                >
                  <span style={{ color: "#d0d0d0", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "system-ui, sans-serif" }}>
                    {entry.stopName || "—"}
                  </span>
                  <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 13, minWidth: 56, textAlign: "right", color: eta.urgent ? "#fbbf24" : "#86efac", background: eta.urgent ? "rgba(251,191,36,0.12)" : "rgba(134,239,172,0.1)", borderRadius: 6, padding: "2px 9px", fontFamily: "system-ui, sans-serif" }}>
                    {eta.text}
                  </span>
                </motion.div>
              )
            })}
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981" }} />
              <span style={{ color: "#374151", fontSize: 10, fontFamily: "system-ui, sans-serif" }}>Live · TfL Countdown</span>
              {refreshing && <span style={{ color: "#374151", fontSize: 10, marginLeft: "auto", fontFamily: "system-ui, sans-serif" }}>Updating…</span>}
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div style={{ display: "flex", gap: 14, padding: "7px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexWrap: "wrap", flexShrink: 0 }}>
      {(Object.entries(ROUTE_COLOURS) as [RouteType, typeof ROUTE_COLOURS[RouteType]][]).map(([type, c]) => (
        <div key={type} style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 11, height: 11, borderRadius: "50%", background: c.bg }} />
          <span style={{ color: "#4b5563", fontSize: 10, fontFamily: "system-ui, sans-serif" }}>{c.label}</span>
        </div>
      ))}
      <span style={{ color: "#374151", fontSize: 10, fontFamily: "system-ui, sans-serif", marginLeft: "auto" }}>Hover for route info</span>
    </div>
  )
}

// ── Main explorer ─────────────────────────────────────────────────────────────

export function BusLinesExplorer({ onClose }: { readonly onClose: () => void }) {
  const [lines, setLines]               = useState<BusLine[]>([])
  const [loadingLines, setLoadingLines] = useState(true)
  const [linesError, setLinesError]     = useState<string | null>(null)
  const [search, setSearch]             = useState("")
  const [selectedLine, setSelectedLine] = useState<BusLine | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    globalThis.addEventListener("keydown", onKey)
    return () => globalThis.removeEventListener("keydown", onKey)
  }, [onClose])

  useEffect(() => {
    searchRef.current?.focus()
    ;(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/buses`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        setLines(await r.json())
      } catch (e) {
        setLinesError(e instanceof Error ? e.message : "Failed to load bus lines")
      } finally {
        setLoadingLines(false)
      }
    })()
  }, [])

  const filtered = useMemo(() => {
    if (!search.trim()) return lines
    const q = search.trim().toLowerCase()
    return lines.filter(l => l.id.toLowerCase().includes(q) || l.name.toLowerCase().includes(q) || l.routeSection?.toLowerCase().includes(q))
  }, [lines, search])

  // Keep selected line data fresh after load
  useEffect(() => {
    if (!selectedLine || lines.length === 0) return
    const updated = lines.find(l => l.id === selectedLine.id)
    if (updated) setSelectedLine(updated)
  }, [lines]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        style={{ position: "fixed", inset: 0, zIndex: 9000, background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
        onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <motion.div
          key="panel"
          initial={{ opacity: 0, y: 36, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 36, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          style={{ width: "min(880px, 96vw)", height: "min(700px, 90vh)", background: DARK_BG, borderRadius: 20, border: "1px solid rgba(255,255,255,0.09)", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 28px 90px rgba(0,0,0,0.75)" }}
        >
          {/* Header */}
          <div style={{ background: BUS_RED, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <TfLRoundel size={32} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, fontFamily: "system-ui, sans-serif" }}>London Bus Lines</div>
              <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 11, marginTop: 1, fontFamily: "system-ui, sans-serif" }}>
                {loadingLines ? "Loading routes…" : `${lines.length} routes · hover for route info · click for live arrivals`}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{ background: "rgba(0,0,0,0.22)", border: "none", borderRadius: "50%", width: 30, height: 30, cursor: "pointer", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
              aria-label="Close"
            >
              <X size={15} />
            </button>
          </div>

          {/* Legend */}
          <Legend />

          {/* Search */}
          <div style={{ padding: "11px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#4b5563", pointerEvents: "none" }} />
              <input
                ref={searchRef}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Filter by route number or name (169, N73, W3, Tottenham…)"
                style={{ width: "100%", padding: "8px 12px 8px 33px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 10, color: "#e0e0e0", fontSize: 13, fontFamily: "system-ui, sans-serif", outline: "none", boxSizing: "border-box" }}
              />
            </div>
          </div>

          {/* Grid */}
          <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
            <div style={{ height: "100%", overflowY: "auto", padding: "16px 20px" }}>
              {loadingLines && (
                <div style={{ textAlign: "center", padding: 60, color: "#4b5563", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>Loading London bus routes…</div>
              )}
              {linesError && (
                <div style={{ textAlign: "center", padding: 60, color: "#ef4444", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>{linesError}</div>
              )}
              {!loadingLines && filtered.length === 0 && (
                <div style={{ textAlign: "center", padding: 60, color: "#4b5563", fontSize: 13, fontFamily: "system-ui, sans-serif" }}>
                  No routes match &ldquo;{search}&rdquo;
                </div>
              )}
              {!loadingLines && filtered.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
                  {filtered.map((line, i) => (
                    <BusRoundel
                      key={line.id}
                      line={line}
                      index={i}
                      onClick={setSelectedLine}
                      selected={selectedLine?.id === line.id}
                    />
                  ))}
                </div>
              )}
            </div>

            <AnimatePresence>
              {selectedLine && (
                <BusLineDetail key={selectedLine.id} line={selectedLine} onBack={() => setSelectedLine(null)} />
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
