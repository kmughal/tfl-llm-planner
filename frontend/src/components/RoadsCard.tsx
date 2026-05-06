import { useMemo, useState } from "react"
import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { MapContainer, TileLayer, Marker, Tooltip } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"

// ── Road lane animation style ─────────────────────────────────────────────────
const LANE_STYLE = `
@keyframes laneDash {
  from { transform: translateX(0); }
  to   { transform: translateX(-88px); }
}
.lane-dash-anim {
  animation: laneDash 1.1s linear infinite;
}
`

function MovingLane({ dim = false }: { readonly dim?: boolean }) {
  return (
    <div className="relative overflow-hidden" style={{ height: 10, background: "#0d1117" }}>
      <style>{LANE_STYLE}</style>
      <div
        className="lane-dash-anim absolute top-1/2 -translate-y-1/2 flex"
        style={{ gap: 12, paddingLeft: 4 }}
      >
        {Array.from({ length: 28 }).map((_, i) => (
          <div
            key={i}
            style={{
              width:           40,
              height:          3,
              borderRadius:    2,
              backgroundColor: dim ? "#374151" : "#fbbf24",
              opacity:         dim ? 0.4 : 0.75,
              flexShrink:      0,
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ── Severity helpers ──────────────────────────────────────────────────────────
function severityColor(s: string) {
  switch (s.toLowerCase()) {
    case "good":     return { dot: "#10b981", text: "#10b981", bg: "#022c22", border: "#065f46", map: "#10b981" }
    case "moderate": return { dot: "#f59e0b", text: "#fbbf24", bg: "#1c1400", border: "#78350f", map: "#f59e0b" }
    case "serious":  return { dot: "#f97316", text: "#fb923c", bg: "#1c0a00", border: "#9a3412", map: "#f97316" }
    case "severe":   return { dot: "#ef4444", text: "#fca5a5", bg: "#1c0202", border: "#991b1b", map: "#ef4444" }
    default:         return { dot: "#6b7280", text: "#9ca3af", bg: "#111827", border: "#374151", map: "#6b7280" }
  }
}

function disruptionColor(severity: string) {
  switch (severity.toLowerCase()) {
    case "serious": return "#f97316"
    case "severe":  return "#ef4444"
    case "moderate":return "#f59e0b"
    default:        return "#6b7280"
  }
}

// ── UK-style road badge ───────────────────────────────────────────────────────
function RoadBadge({ id }: { readonly id: string }) {
  const upper = id.toUpperCase()
  const isMoto = upper.startsWith("M")
  const bg     = isMoto ? "#003399" : "#005a00"
  return (
    <span
      className="inline-flex items-center justify-center font-black text-white rounded px-1.5 py-0.5 shrink-0"
      style={{ background: bg, fontSize: 10, minWidth: 32, letterSpacing: "0.04em" }}
    >
      {upper}
    </span>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ParsedRoad {
  id: string; name: string; severity: string; desc: string
  lat: number | null; lon: number | null
}

interface ParsedDisruption {
  category: string; severity: string; street: string
  comment: string; start: string; end: string; hasClosures: boolean
}

// ── Parsers ───────────────────────────────────────────────────────────────────
function parseRoads(raw: string) {
  const roads: ParsedRoad[] = []
  let total = 0, good = 0, issues = 0

  for (const line of raw.split("\n")) {
    if (line.startsWith("ROADS_START:")) {
      const [t, g, i] = line.slice(12).split("|")
      total = Number(t); good = Number(g); issues = Number(i)
    } else if (line.startsWith("ROAD:")) {
      const [id, name, severity, desc, latStr, lonStr] = line.slice(5).split("|")
      if (id) roads.push({
        id,
        name:     name ?? id,
        severity: severity ?? "",
        desc:     desc ?? "",
        lat:      latStr ? Number(latStr) : null,
        lon:      lonStr ? Number(lonStr) : null,
      })
    }
  }
  return { total, good, issues, roads }
}

function parseDisruptions(raw: string) {
  const disruptions: ParsedDisruption[] = []
  let roadId = "", roadName = "", total = 0, closures = 0

  for (const line of raw.split("\n")) {
    if (line.startsWith("ROAD_DISRUPTIONS_START:")) {
      const [id, name, t, c] = line.slice(23).split("|")
      roadId = id ?? ""; roadName = name ?? id ?? ""
      total = Number(t); closures = Number(c)
    } else if (line.startsWith("ROAD_DISRUPTION:")) {
      const parts = line.slice(16).split("|")
      disruptions.push({
        category:    parts[0] ?? "",
        severity:    parts[1] ?? "",
        street:      parts[2] ?? "",
        comment:     parts[3] ?? "",
        start:       parts[4] ?? "",
        end:         parts[5] ?? "",
        hasClosures: parts[6] === "true",
      })
    }
  }
  return { roadId, roadName, total, closures, disruptions }
}

// ── Road row ──────────────────────────────────────────────────────────────────
function RoadRow({ road, index }: { readonly road: ParsedRoad; readonly index: number }) {
  const ref    = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-20px" })
  const c      = severityColor(road.severity)

  return (
    <motion.div
      ref={ref}
      className="flex items-center gap-3 px-4 py-2.5 border-b"
      style={{ borderColor: "#1e293b" }}
      initial={{ opacity: 0, x: -16 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.24, delay: Math.min(index * 0.04, 0.4), ease: "easeOut" }}
    >
      <RoadBadge id={road.id} />

      <span className="flex-1 text-[12px] font-semibold" style={{ color: "#e2e8f0" }}>
        {road.name}
      </span>

      <div
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0"
        style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
      >
        <motion.span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: c.dot }}
          animate={road.severity !== "Good" ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
        {road.severity}
      </div>

      <span className="text-[10px] hidden sm:block truncate max-w-[180px]" style={{ color: "#4b5563" }}>
        {road.desc}
      </span>
    </motion.div>
  )
}

// ── Roads map view ────────────────────────────────────────────────────────────
function makeRoadIcon(road: ParsedRoad) {
  const c      = severityColor(road.severity)
  const upper  = road.id.toUpperCase()
  const isMoto = upper.startsWith("M")
  const isGood = road.severity.toLowerCase() === "good"
  const badgeBg = isMoto ? "#003399" : "#005a00"
  const pulse  = isGood ? "" : `
    <div style="
      position:absolute;inset:-5px;border-radius:50%;
      border:2px solid ${c.map};
      animation:road-pulse 1.8s ease-out infinite;
      pointer-events:none;
    "></div>`

  const html = `
    <div style="position:relative;display:inline-flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 6px ${c.map}88);">
      ${pulse}
      <div style="
        background:${badgeBg};
        color:white;
        font-weight:900;
        font-size:9px;
        padding:2px 6px;
        border-radius:4px;
        border:2px solid ${c.map};
        white-space:nowrap;
        letter-spacing:0.05em;
        box-shadow:0 0 0 1px ${c.map}44;
        line-height:1.4;
      ">${upper}</div>
      <div style="
        width:0;height:0;
        border-left:4px solid transparent;
        border-right:4px solid transparent;
        border-top:5px solid ${c.map};
        margin-top:-1px;
      "></div>
    </div>`

  return L.divIcon({
    html,
    className: "",
    iconSize:     [40, 28],
    iconAnchor:   [20, 28],
    tooltipAnchor:[0, -30],
  })
}

function RoadsMap({ roads }: { readonly roads: ParsedRoad[] }) {
  const mapped = roads.filter(r => r.lat !== null && r.lon !== null)

  return (
    <div>
      {/* inject pulse keyframe once */}
      <style>{`@keyframes road-pulse{from{transform:scale(1);opacity:.8}to{transform:scale(2.2);opacity:0}}`}</style>

      <MapContainer
        center={[51.505, -0.09]}
        zoom={10}
        style={{ height: 340, width: "100%" }}
        zoomControl={true}
        scrollWheelZoom={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        {mapped.map(road => {
          const c = severityColor(road.severity)
          return (
            <Marker
              key={road.id}
              position={[road.lat ?? 0, road.lon ?? 0]}
              icon={makeRoadIcon(road)}
            >
              <Tooltip direction="top" offset={[0, -4]} opacity={1}>
                <div style={{
                  background:   "#0d1117",
                  border:       `1px solid ${c.map}66`,
                  borderRadius: 10,
                  padding:      "8px 12px",
                  minWidth:     140,
                  fontFamily:   "system-ui,sans-serif",
                }}>
                  {/* Badge + severity row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{
                      background:    road.id.toUpperCase().startsWith("M") ? "#003399" : "#005a00",
                      color:         "white",
                      fontWeight:    900,
                      fontSize:      11,
                      padding:       "2px 7px",
                      borderRadius:  4,
                      letterSpacing: "0.05em",
                    }}>
                      {road.id.toUpperCase()}
                    </span>
                    <span style={{
                      background: c.bg,
                      color:      c.text,
                      border:     `1px solid ${c.border}`,
                      fontSize:   9,
                      fontWeight: 700,
                      padding:    "1px 6px",
                      borderRadius: 99,
                    }}>
                      ● {road.severity}
                    </span>
                  </div>
                  {/* Road name */}
                  <p style={{ color: "#e2e8f0", fontSize: 11, fontWeight: 600, margin: "0 0 4px" }}>
                    {road.name}
                  </p>
                  {/* Status description */}
                  <p style={{ color: "#6b7280", fontSize: 10, margin: 0, lineHeight: 1.4 }}>
                    {road.desc || "No exceptional delays"}
                  </p>
                </div>
              </Tooltip>
            </Marker>
          )
        })}
      </MapContainer>

      {/* Legend */}
      <div
        className="flex items-center gap-4 px-4 py-2 flex-wrap"
        style={{ background: "#0d1117", borderTop: "1px solid #1e293b" }}
      >
        {(["Good", "Moderate", "Serious", "Severe"] as const).map(sev => {
          const c = severityColor(sev)
          return (
            <div key={sev} className="flex items-center gap-1.5">
              <span style={{
                display: "inline-block", width: 8, height: 8,
                borderRadius: 2, background: c.map,
              }} />
              <span style={{ color: c.text, fontSize: 10, fontWeight: 600 }}>{sev}</span>
            </div>
          )
        })}
        <span style={{ color: "#374151", fontSize: 10, marginLeft: "auto" }}>
          {mapped.length} roads plotted
        </span>
      </div>
    </div>
  )
}

// ── Tab button ────────────────────────────────────────────────────────────────
function TabBtn({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      className="text-[11px] font-bold px-3 py-1 rounded-lg"
      style={{
        background: active ? "#1e3a5f" : "transparent",
        color:      active ? "#60a5fa" : "#4b5563",
        border:     active ? "1px solid #2563eb55" : "1px solid transparent",
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      {label}
    </motion.button>
  )
}

// ── Disruption card ───────────────────────────────────────────────────────────
function DisruptionRow({ d, index }: { readonly d: ParsedDisruption; readonly index: number }) {
  const ref    = useRef(null)
  const inView = useInView(ref, { once: true, margin: "-20px" })
  const color  = disruptionColor(d.severity)

  const categoryLabel = d.category
    .replace(/([A-Z])/g, " $1")
    .replace(/^Planned Works$/i, "Planned Works")
    .trim()

  return (
    <motion.div
      ref={ref}
      className="mx-4 mb-3 rounded-xl overflow-hidden"
      style={{ border: `1px solid ${color}33` }}
      initial={{ opacity: 0, y: 12 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.28, delay: Math.min(index * 0.07, 0.5), ease: "easeOut" }}
    >
      {/* Severity strip */}
      <div className="h-1" style={{ background: color }} />

      <div className="px-3 py-2.5" style={{ background: "#0d1117" }}>
        {/* Category + closure badge */}
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background: `${color}22`, color, border: `1px solid ${color}44` }}
          >
            {categoryLabel || "Disruption"}
          </span>
          {d.hasClosures && (
            <span className="text-[9px] font-bold" style={{ color: "#f87171" }}>
              🚧 Road closure
            </span>
          )}
          <span className="ml-auto text-[9px] font-semibold uppercase" style={{ color }}>
            {d.severity}
          </span>
        </div>

        {/* Street */}
        {d.street && (
          <p className="text-[11px] font-semibold mb-1" style={{ color: "#e2e8f0" }}>
            {d.street}
          </p>
        )}

        {/* Comment */}
        {d.comment && (
          <p className="text-[11px] leading-relaxed" style={{ color: "#6b7280" }}>
            {d.comment}
          </p>
        )}

        {/* Time window */}
        {(d.start || d.end) && (
          <p className="text-[10px] font-mono mt-1.5" style={{ color: "#374151" }}>
            {d.start && d.end
              ? `${d.start.replace("T", " ")} → ${d.end.replace("T", " ")}`
              : d.start
              ? `From ${d.start.replace("T", " ")}`
              : `Until ${d.end?.replace("T", " ")}`}
          </p>
        )}
      </div>
    </motion.div>
  )
}

// ── Roads overview card ───────────────────────────────────────────────────────
export function RoadsCard({ result }: { readonly result: string }) {
  const { total, good, issues, roads } = useMemo(() => parseRoads(result), [result])
  const [tab, setTab] = useState<"list" | "map">("list")

  const hasMap = roads.some(r => r.lat !== null)

  if (roads.length === 0) return null

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-lg w-full"
      style={{ background: "#0d1117", border: "1px solid #1e293b" }}
    >
      <MovingLane />

      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid #1e293b" }}>
        <span className="text-lg">🛣</span>
        <div>
          <p className="text-[13px] font-black text-white tracking-tight">TFL Road Network</p>
          <p className="text-[10px]" style={{ color: "#4b5563" }}>
            {total} roads · {good} clear · {issues > 0 ? `${issues} with issues` : "all clear"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {hasMap && (
            <>
              <TabBtn label="List" active={tab === "list"} onClick={() => setTab("list")} />
              <TabBtn label="Map"  active={tab === "map"}  onClick={() => setTab("map")}  />
            </>
          )}
          {issues > 0 && (
            <motion.span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "#1c0a00", color: "#f97316", border: "1px solid #9a3412" }}
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.4, repeat: Infinity }}
            >
              {issues} issues
            </motion.span>
          )}
        </div>
      </div>

      {/* Content */}
      {tab === "map" ? (
        <RoadsMap roads={roads} />
      ) : (
        <div>
          {roads.map((road, i) => (
            <RoadRow key={road.id} road={road} index={i} />
          ))}
        </div>
      )}

      <MovingLane dim />
    </div>
  )
}

// ── Road disruptions card ─────────────────────────────────────────────────────
export function RoadDisruptionsCard({ result }: { readonly result: string }) {
  const { roadName, total, closures, disruptions } = useMemo(() => parseDisruptions(result), [result])

  const allClear = total === 0

  return (
    <div
      className="rounded-2xl overflow-hidden shadow-lg w-full"
      style={{ background: "#0d1117", border: "1px solid #1e293b" }}
    >
      <MovingLane />

      {/* Header */}
      <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid #1e293b" }}>
        <RoadBadge id={roadName} />
        <div>
          <p className="text-[13px] font-black text-white tracking-tight">
            {allClear ? "Road Clear" : `${total} Active Disruption${total !== 1 ? "s" : ""}`}
          </p>
          <p className="text-[10px]" style={{ color: "#4b5563" }}>
            {allClear
              ? `${roadName} — no disruptions`
              : closures > 0
              ? `${closures} road closure${closures !== 1 ? "s" : ""} included`
              : "no full closures"}
          </p>
        </div>
        {allClear && (
          <motion.span
            className="ml-auto text-[11px] font-bold px-2.5 py-1 rounded-full"
            style={{ background: "#022c22", color: "#10b981", border: "1px solid #065f46" }}
            animate={{ opacity: [1, 0.5, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            ✓ All clear
          </motion.span>
        )}
      </div>

      {/* Disruption rows */}
      {disruptions.length > 0 && (
        <div className="pt-3">
          {disruptions.map((d, i) => (
            <DisruptionRow key={i} d={d} index={i} />
          ))}
        </div>
      )}

      <MovingLane dim />
    </div>
  )
}
