import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Search, ArrowLeft, RefreshCw, MapPin, Clock } from "lucide-react"

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080"
const BUS_RED  = "#e1251b"

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

// ── Parser ────────────────────────────────────────────────────────────────────

export function parseBusLines(result: string): { id: string; name: string }[] | null {
  if (!result.includes("BUS_LINES_START")) return null
  const lines: { id: string; name: string }[] = []
  for (const m of result.matchAll(/^BUS_LINE:([^|\n]+)\|([^\n]*)$/gm)) {
    lines.push({ id: m[1], name: m[2] || m[1] })
  }
  return lines.length > 0 ? lines : null
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

const ROUTE_COLOURS: Record<RouteType, {
  bg: string; text: string; strip: string; glow: string; label: string; dest: string
}> = {
  regular: { bg: BUS_RED,   text: BUS_RED,   strip: BUS_RED,   glow: "rgba(225,37,27,0.55)",  label: "Regular",  dest: "Barking · Ilford · Euston" },
  night:   { bg: "#003688", text: "#60a5fa", strip: "#003688", glow: "rgba(0,54,136,0.65)",   label: "Night",    dest: "Night service" },
  express: { bg: "#b45309", text: "#fbbf24", strip: "#b45309", glow: "rgba(180,83,9,0.6)",    label: "Express",  dest: "Limited stops" },
  letter:  { bg: "#6d28d9", text: "#a78bfa", strip: "#6d28d9", glow: "rgba(109,40,217,0.55)", label: "Lettered", dest: "Local service" },
}

// ── ETA helpers ───────────────────────────────────────────────────────────────

function etaLabel(etaMs: number, nowMs: number): { text: string; urgent: boolean } {
  const secs = Math.max(0, Math.round((etaMs - nowMs) / 1000))
  if (secs < 30) return { text: "Due",     urgent: true }
  if (secs < 60) return { text: "< 1 min", urgent: true }
  const mins = Math.floor(secs / 60)
  return { text: `${mins} min`, urgent: mins <= 2 }
}

function tileFontSize(len: number): number {
  if (len > 4) return 15
  if (len > 3) return 19
  if (len > 2) return 24
  return 30
}

function panelFontSize(len: number): number {
  if (len > 3) return 13
  if (len > 2) return 16
  return 20
}

function tileShadow(selected: boolean, hovered: boolean, colours: (typeof ROUTE_COLOURS)[RouteType]): string {
  if (selected) return `0 0 0 0px transparent, 0 10px 28px ${colours.glow}`
  if (hovered)  return `0 10px 28px ${colours.glow}, 0 0 0 1px ${colours.bg}40`
  return "0 2px 8px rgba(0,0,0,0.5)"
}

function stripHeight(selected: boolean, hovered: boolean): number {
  if (selected) return 7
  if (hovered)  return 6
  return 4
}

// ── Destination board tile ────────────────────────────────────────────────────

function BusTile({
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
  const dest    = line.routeSection || colours.dest

  const numFontSize = tileFontSize(line.id.length)

  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      {/* Pulsing selection ring */}
      {selected && (
        <motion.div
          style={{
            position:     "absolute",
            inset:        -5,
            borderRadius: 14,
            border:       `2px solid ${colours.bg}`,
            pointerEvents: "none",
            zIndex:       2,
          }}
          animate={{ opacity: [0.9, 0], scale: [1, 1.1] }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "easeOut" }}
        />
      )}

      <motion.button
        /* ── Entrance: flip in from top like a departure board ── */
        initial={{ rotateX: -90, opacity: 0 }}
        animate={{ rotateX: 0, opacity: 1 }}
        transition={{
          delay:    (index % 70) * 0.009,
          type:     "spring",
          stiffness: 260,
          damping:  20,
        }}
        whileHover={{ y: -7, scale: 1.08, transition: { type: "spring", stiffness: 420, damping: 22 } }}
        whileTap={{ scale: 0.93, transition: { duration: 0.08 } }}
        onHoverStart={() => setHovered(true)}
        onHoverEnd={() => setHovered(false)}
        onClick={() => { onClick(line); setHovered(false) }}
        style={{
          width:          90,
          borderRadius:   11,
          background:     selected ? colours.bg : "#111827",
          border:         `1px solid ${selected ? colours.bg : "rgba(255,255,255,0.09)"}`,
          overflow:       "hidden",
          cursor:         "pointer",
          display:        "flex",
          flexDirection:  "column",
          padding:        0,
          boxShadow:      tileShadow(selected, hovered, colours),
          transformPerspective: 500,
          transition:     "background 0.18s, border-color 0.18s, box-shadow 0.22s",
        }}
        aria-label={`Bus route ${line.name}`}
      >
        {/* ── Coloured top strip (thickens on hover) ── */}
        <motion.div
          animate={{ height: stripHeight(selected, hovered) }}
          transition={{ duration: 0.15 }}
          style={{ background: colours.strip, flexShrink: 0 }}
        />

        {/* ── Route number ── */}
        <div style={{
          padding:        "10px 8px 8px",
          display:        "flex",
          alignItems:     "center",
          justifyContent: "center",
        }}>
          <motion.span
            animate={{ scale: hovered ? 1.06 : 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 20 }}
            style={{
              fontWeight:    900,
              fontSize:      numFontSize,
              color:         selected ? "#fff" : colours.text,
              fontFamily:    "system-ui, sans-serif",
              letterSpacing: line.id.length > 3 ? "-0.5px" : "-1px",
              lineHeight:    1,
              display:       "block",
            }}
          >
            {line.name}
          </motion.span>
        </div>

        {/* ── Destination strip — slides in on hover ── */}
        <AnimatePresence>
          {(hovered || selected) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 20, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              style={{
                background: selected ? "rgba(0,0,0,0.22)" : "rgba(0,0,0,0.55)",
                padding:    "3px 7px 3px",
                display:    "flex",
                alignItems: "center",
                gap:        3,
                overflow:   "hidden",
              }}
            >
              <MapPin size={8} style={{ color: selected ? "rgba(255,255,255,0.5)" : "#4b5563", flexShrink: 0 }} />
              <span style={{
                fontSize:      8.5,
                color:         selected ? "rgba(255,255,255,0.75)" : "#6b7280",
                fontFamily:    "system-ui, sans-serif",
                whiteSpace:    "nowrap",
                overflow:      "hidden",
                textOverflow:  "ellipsis",
                display:       "block",
                letterSpacing: "0.01em",
              }}>
                {dest}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )
}

// ── Hover info card ───────────────────────────────────────────────────────────
// (kept for future use — currently info is shown inline in the tile)

// ── Driving bus strip ─────────────────────────────────────────────────────────

function DrivingBus({ active }: { readonly active: boolean }) {
  return (
    <div style={{
      overflow:   "hidden",
      height:     40,
      background: "rgba(225,37,27,0.05)",
      borderBottom: "1px solid rgba(225,37,27,0.1)",
      flexShrink: 0,
      position:   "relative",
    }}>
      <motion.div
        key={active ? "run" : "idle"}
        initial={{ x: "-12%" }}
        animate={{ x: "110%" }}
        transition={{ duration: active ? 1.9 : 0, ease: "easeInOut", repeat: active ? Infinity : 0, repeatDelay: 0.5 }}
        style={{ position: "absolute", top: "50%", transform: "translateY(-50%)" }}
      >
        <svg width="64" height="28" viewBox="0 0 100 44" fill="none" aria-hidden>
          <rect x="2" y="2" width="96" height="34" rx="5" fill={BUS_RED} />
          <rect x="8"  y="7"  width="14" height="10" rx="2" fill="rgba(255,255,255,0.78)" />
          <rect x="28" y="7"  width="14" height="10" rx="2" fill="rgba(255,255,255,0.78)" />
          <rect x="48" y="7"  width="14" height="10" rx="2" fill="rgba(255,255,255,0.78)" />
          <rect x="70" y="5"  width="22" height="26" rx="2" fill="rgba(0,0,0,0.25)" />
          <rect x="2"  y="34" width="96" height="4"  rx="2" fill="rgba(0,0,0,0.3)" />
          <circle cx="20" cy="40" r="4" fill="#1a1a1a" /><circle cx="20" cy="40" r="2" fill="#555" />
          <circle cx="76" cy="40" r="4" fill="#1a1a1a" /><circle cx="76" cy="40" r="2" fill="#555" />
        </svg>
      </motion.div>
    </div>
  )
}

// ── Single arrival row ────────────────────────────────────────────────────────

function ArrivalRow({ entry, index, nowMs }: {
  readonly entry: BusArrivalEntry
  readonly index: number
  readonly nowMs: number
}) {
  const eta     = etaLabel(entry.etaMs, nowMs)
  const color   = eta.urgent ? "#fbbf24"              : "#86efac"
  const bgColor = eta.urgent ? "rgba(251,191,36,0.12)" : "rgba(134,239,172,0.1)"
  const rowBg   = index % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent"

  return (
    <motion.div
      key={`${entry.stopName}-${entry.etaMs}`}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.022, type: "spring", stiffness: 340, damping: 28 }}
      style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "8px 14px", borderBottom: "1px solid rgba(255,255,255,0.04)", background: rowBg, alignItems: "center" }}
    >
      <span style={{ color: "#d0d0d0", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "system-ui, sans-serif" }}>
        {entry.stopName || "—"}
      </span>
      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, fontSize: 12, minWidth: 50, textAlign: "right", color, background: bgColor, borderRadius: 5, padding: "2px 7px", fontFamily: "system-ui, sans-serif" }}>
        {eta.text}
      </span>
    </motion.div>
  )
}

// ── Arrivals panel ────────────────────────────────────────────────────────────

function ArrivalsPanel({ line, onBack }: { readonly line: BusLine; readonly onBack: () => void }) {
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
      style={{ position: "absolute", inset: 0, background: "#0d1117", display: "flex", flexDirection: "column", zIndex: 10 }}
    >
      {/* Back + header */}
      <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
        <button
          onClick={onBack}
          style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: 7, padding: "4px 10px", color: "#bbb", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "system-ui, sans-serif", flexShrink: 0 }}
        >
          <ArrowLeft size={12} /> All buses
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
          <div style={{ background: colours.bg, borderRadius: 8, width: 42, height: 42, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, color: "#fff", fontSize: labelFontSize, flexShrink: 0, fontFamily: "system-ui, sans-serif", boxShadow: `0 3px 12px ${colours.glow}` }}>
            {line.name}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: "system-ui, sans-serif" }}>Bus {line.name}</div>
            {line.routeSection && (
              <div style={{ color: "#6b7280", fontSize: 10, fontFamily: "system-ui, sans-serif", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                <MapPin size={9} style={{ display: "inline", marginRight: 3, verticalAlign: "middle" }} />{line.routeSection}
              </div>
            )}
          </div>
        </div>
        <motion.button
          onClick={() => fetchArrivals(true)}
          disabled={refreshing}
          animate={{ rotate: refreshing ? 360 : 0 }}
          transition={{ duration: 0.7, repeat: refreshing ? Infinity : 0 }}
          style={{ background: "transparent", border: "none", color: refreshing ? "#374151" : "#6b7280", cursor: refreshing ? "default" : "pointer", display: "flex", padding: 4, flexShrink: 0 }}
        >
          <RefreshCw size={13} />
        </motion.button>
      </div>

      <DrivingBus active={loading} />

      {!loading && arrivals && arrivals.arrivals.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, padding: "4px 14px", background: "#161b22", borderBottom: "1px solid rgba(255,255,255,0.05)", flexShrink: 0 }}>
          <span style={{ color: "#4b5563", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "system-ui, sans-serif" }}>Stop</span>
          <span style={{ color: "#4b5563", fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right", minWidth: 50, fontFamily: "system-ui, sans-serif" }}>Wait</span>
        </div>
      )}

      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading && !arrivals && (
          <div style={{ textAlign: "center", padding: "32px 14px", color: "#4b5563", fontSize: 12, fontFamily: "system-ui, sans-serif" }}>
            Fetching live arrivals for bus {line.name}…
          </div>
        )}
        {error && (
          <div style={{ textAlign: "center", padding: "32px 14px", color: "#ef4444", fontSize: 12, fontFamily: "system-ui, sans-serif" }}>{error}</div>
        )}
        {!loading && arrivals && arrivals.arrivals.length === 0 && (
          <div style={{ textAlign: "center", padding: "32px 14px", color: "#4b5563", fontSize: 12, fontFamily: "system-ui, sans-serif" }}>
            No arrivals predicted for bus {line.name}
          </div>
        )}
        {arrivals && arrivals.arrivals.length > 0 && (
          <>
            {arrivals.arrivals.map((entry, i) => (
              <ArrivalRow key={`${entry.stopName}-${entry.etaMs}`} entry={entry} index={i} nowMs={nowMs} />
            ))}
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#10b981" }} />
              <span style={{ color: "#374151", fontSize: 9, fontFamily: "system-ui, sans-serif" }}>Live · TfL Countdown</span>
              {refreshing && <span style={{ color: "#374151", fontSize: 9, marginLeft: "auto", fontFamily: "system-ui, sans-serif" }}>Updating…</span>}
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}

// ── Legend strip ──────────────────────────────────────────────────────────────

function Legend() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "5px 14px", borderBottom: "1px solid rgba(255,255,255,0.05)", flexWrap: "wrap" }}>
      {(Object.entries(ROUTE_COLOURS) as [RouteType, (typeof ROUTE_COLOURS)[RouteType]][]).map(([type, c]) => (
        <div key={type} style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ width: 9, height: 9, borderRadius: 3, background: c.bg }} />
          <span style={{ color: "#4b5563", fontSize: 9, fontFamily: "system-ui, sans-serif" }}>{c.label}</span>
        </div>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto" }}>
        <Clock size={9} style={{ color: "#374151" }} />
        <span style={{ color: "#374151", fontSize: 9, fontFamily: "system-ui, sans-serif" }}>Hover · destination &nbsp;|&nbsp; Click · live arrivals</span>
      </div>
    </div>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────

export function BusLinesCard({ result }: { readonly result: string }) {
  const rawLines = useMemo(() => parseBusLines(result), [result])
  const [richLines, setRichLines]       = useState<BusLine[] | null>(null)
  const [search, setSearch]             = useState("")
  const [selectedLine, setSelectedLine] = useState<BusLine | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Background-fetch rich data (route sections, service types)
  useEffect(() => {
    if (!rawLines) { return }
    void (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/buses`)
        if (r.ok) setRichLines(await r.json())
      } catch { /* silent fallback */ }
    })()
  }, [rawLines])

  const lines: BusLine[] = useMemo(
    () => richLines ?? rawLines?.map(l => ({ id: l.id, name: l.name })) ?? [],
    [richLines, rawLines],
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return lines
    const q = search.trim().toLowerCase()
    return lines.filter(l =>
      l.id.toLowerCase().includes(q) ||
      l.name.toLowerCase().includes(q) ||
      l.routeSection?.toLowerCase().includes(q),
    )
  }, [lines, search])

  // Keep selectedLine in sync once rich data loads
  useEffect(() => {
    if (!selectedLine || !richLines) return
    const updated = richLines.find(l => l.id === selectedLine.id)
    if (updated?.id !== selectedLine.id) setSelectedLine(updated ?? null)
  }, [richLines]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!rawLines) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: "easeOut" }}
      style={{
        background:   "#0d1117",
        borderRadius: 16,
        overflow:     "hidden",
        border:       "1px solid rgba(255,255,255,0.09)",
        width:        "100%",           /* fills the message bubble width */
        fontFamily:   "system-ui, sans-serif",
      }}
    >
      {/* ── Header ── */}
      <div style={{ background: BUS_RED, padding: "11px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        {/* TfL roundel */}
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#003688", border: "2px solid #fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <div style={{ width: 20, height: 4, background: BUS_RED, borderRadius: 2 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>London Bus Lines</div>
          <div style={{ color: "rgba(255,255,255,0.72)", fontSize: 10, marginTop: 1 }}>
            {lines.length} routes · hover for destination · click for live arrivals
          </div>
        </div>
        {/* Live dot */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8 }}>
            <motion.span
              style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(255,255,255,0.6)" }}
              animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
            <span style={{ position: "relative", width: 8, height: 8, borderRadius: "50%", background: "#fff", display: "block" }} />
          </span>
          <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em" }}>LIVE</span>
        </div>
      </div>

      {/* ── Legend ── */}
      <Legend />

      {/* ── Search ── */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
        <div style={{ position: "relative" }}>
          <Search size={12} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "#4b5563", pointerEvents: "none" }} />
          <input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filter route (169, N73, W3, Barking…)"
            style={{ width: "100%", padding: "6px 10px 6px 28px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#e0e0e0", fontSize: 12, fontFamily: "system-ui, sans-serif", outline: "none", boxSizing: "border-box" }}
          />
        </div>
      </div>

      {/* ── Tile grid + detail panel ── */}
      <div style={{ position: "relative", height: 340, overflow: "hidden" }}>
        <div style={{ height: "100%", overflowY: "auto", padding: "14px 14px 14px" }}>
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#4b5563", fontSize: 12 }}>
              No routes match &ldquo;{search}&rdquo;
            </div>
          ) : (
            <div style={{
              display:               "grid",
              gridTemplateColumns:   "repeat(auto-fill, minmax(90px, 1fr))",
              gap:                   10,
            }}>
              {filtered.map((line, i) => (
                <BusTile
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
            <ArrivalsPanel
              key={selectedLine.id}
              line={selectedLine}
              onBack={() => setSelectedLine(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
