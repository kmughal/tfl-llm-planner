import { useRef } from "react"
import { motion, useInView } from "framer-motion"
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle } from "lucide-react"

// ── Line colour map ─────────────────────────────────────────────────────────
const LINE_COLORS: Record<string, string> = {
  bakerloo:        "#B36305",
  central:         "#E32017",
  circle:          "#FFD300",
  district:        "#00782A",
  elizabeth:       "#6950A1",
  "elizabeth line": "#6950A1",
  hammersmith:     "#F3A9BB",
  "hammersmith & city": "#F3A9BB",
  jubilee:         "#A0A5A9",
  metropolitan:    "#9B0056",
  northern:        "#000000",
  piccadilly:      "#003688",
  victoria:        "#0098D4",
  "waterloo & city": "#95CDBA",
  "waterloo-city": "#95CDBA",
  dlr:             "#00A4A7",
  overground:      "#EE7C0E",
  tram:            "#84B817",
}

function lineColor(name: string): string {
  const key = name.toLowerCase().trim()
  // Try exact match first
  if (LINE_COLORS[key]) return LINE_COLORS[key]
  // Try partial match
  for (const [k, v] of Object.entries(LINE_COLORS)) {
    if (key.includes(k) || k.includes(key)) return v
  }
  return "#6b7280"
}

// ── Status helpers ───────────────────────────────────────────────────────────
type StatusLevel = "good" | "minor" | "severe" | "suspended" | "closure" | "unknown"

function classifyStatus(status: string): StatusLevel {
  const s = status.toLowerCase()
  if (s.includes("good service") || s.includes("good"))      return "good"
  if (s.includes("minor delay"))                              return "minor"
  if (s.includes("severe delay"))                            return "severe"
  if (s.includes("part suspended") || s.includes("suspended")) return "suspended"
  if (s.includes("planned closure") || s.includes("closure"))  return "closure"
  return "unknown"
}

const STATUS_CONFIG: Record<StatusLevel, { bg: string; text: string; border: string; label: string }> = {
  good:      { bg: "rgba(34,197,94,0.18)",   text: "#4ade80", border: "rgba(34,197,94,0.35)",    label: "Good Service" },
  minor:     { bg: "rgba(251,191,36,0.18)",  text: "#fbbf24", border: "rgba(251,191,36,0.35)",   label: "Minor Delays" },
  severe:    { bg: "rgba(239,68,68,0.18)",   text: "#f87171", border: "rgba(239,68,68,0.35)",    label: "Severe Delays" },
  suspended: { bg: "rgba(239,68,68,0.18)",   text: "#f87171", border: "rgba(239,68,68,0.35)",    label: "Part Suspended" },
  closure:   { bg: "rgba(107,114,128,0.18)", text: "#9ca3af", border: "rgba(107,114,128,0.35)",  label: "Planned Closure" },
  unknown:   { bg: "rgba(107,114,128,0.18)", text: "#9ca3af", border: "rgba(107,114,128,0.35)",  label: "No Service Info" },
}

function StatusIcon({ level }: { readonly level: StatusLevel }) {
  if (level === "good")
    return <CheckCircle2 size={12} className="flex-shrink-0" />
  if (level === "minor")
    return <AlertTriangle size={12} className="flex-shrink-0" />
  return <XCircle size={12} className="flex-shrink-0" />
}

// ── Data types ───────────────────────────────────────────────────────────────
interface LineStatus {
  name:   string
  status: string
  reason: string
  level:  StatusLevel
}

// ── Parser ───────────────────────────────────────────────────────────────────
//  Handles lines like:
//    ✓ Bakerloo: Good Service
//    ⚠ Jubilee: Minor Delays — reason text
//  or plain "  Central: Good Service"
function parseTflStatus(raw: string): LineStatus[] {
  const results: LineStatus[] = []
  const seen = new Set<string>()

  for (const line of raw.split("\n")) {
    // Strip leading bullets/icons/whitespace
    const trimmed = line.replace(/^[\s✓⚠✗×•\-–—]+/, "").trim()
    if (!trimmed) continue

    // Must have "Name: Status" pattern
    const colonIdx = trimmed.indexOf(":")
    if (colonIdx < 1) continue

    const rawName = trimmed.slice(0, colonIdx).trim()
    const rest    = trimmed.slice(colonIdx + 1).trim()
    if (!rawName || !rest) continue

    // Skip header-like lines (e.g. "TFL status for mode(s)")
    if (rawName.toLowerCase().startsWith("tfl status") ||
        rawName.toLowerCase().startsWith("tfl line status")) continue
    // Skip very long names (probably prose sentences, not line names)
    if (rawName.length > 35) continue

    // Split "Status — reason" or "Status - reason"
    const dashIdx = rest.search(/\s[—–-]\s/)
    let status = dashIdx >= 0 ? rest.slice(0, dashIdx).trim() : rest.trim()
    let reason = dashIdx >= 0 ? rest.slice(dashIdx).replace(/^[\s—–-]+/, "").trim() : ""

    const key = rawName.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)

    results.push({
      name:   rawName,
      status,
      reason,
      level:  classifyStatus(status),
    })
  }

  return results
}

// ── TFL Roundel SVG ──────────────────────────────────────────────────────────
function TflRoundel({ size = 32 }: { readonly size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14" fill="#E32017" />
      <circle cx="16" cy="16" r="14" fill="none" stroke="#E32017" strokeWidth="2" />
      {/* White inner ring */}
      <circle cx="16" cy="16" r="11" fill="none" stroke="#fff" strokeWidth="3" />
      {/* Blue horizontal bar */}
      <rect x="2" y="13" width="28" height="6" fill="#003688" />
      {/* White bar text area (simplified) */}
      <rect x="5" y="13.5" width="22" height="5" fill="#003688" />
    </svg>
  )
}

// ── Line dot ─────────────────────────────────────────────────────────────────
function LineDot({ name }: { readonly name: string }) {
  const color = lineColor(name)
  return (
    <div
      className="flex-shrink-0 rounded-full border-2"
      style={{
        width: 20,
        height: 20,
        backgroundColor: color,
        borderColor: color === "#000000" ? "rgba(255,255,255,0.25)" : "transparent",
      }}
    />
  )
}

// ── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ level, label }: { readonly level: StatusLevel; readonly label: string }) {
  const cfg = STATUS_CONFIG[level]
  return (
    <span
      className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ background: cfg.bg, color: cfg.text, borderColor: cfg.border }}
    >
      <StatusIcon level={level} />
      {label}
    </span>
  )
}

// ── Single line row ──────────────────────────────────────────────────────────
function LineRow({ entry, index }: { readonly entry: LineStatus; readonly index: number }) {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })
  const color  = lineColor(entry.name)
  const cfg    = STATUS_CONFIG[entry.level]

  return (
    <motion.div
      ref={ref}
      className="flex items-center gap-3 px-4 py-3 rounded-xl border"
      style={{
        background:   `${color}15`,
        borderColor:  `${color}30`,
      }}
      initial={{ opacity: 0, x: -12 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ delay: index * 0.05, duration: 0.28, ease: "easeOut" }}
      whileHover={{ scale: 1.01, borderColor: `${color}55` }}
    >
      {/* Line color dot */}
      <LineDot name={entry.name} />

      {/* Name + reason */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white leading-tight">{entry.name}</p>
        {entry.reason && (
          <p className="text-[10px] text-gray-400 mt-0.5 truncate" title={entry.reason}>
            {entry.reason}
          </p>
        )}
      </div>

      {/* Status badge — use the parsed status text when concise, else use config label */}
      <StatusBadge
        level={entry.level}
        label={entry.status.length <= 20 ? entry.status : cfg.label}
      />
    </motion.div>
  )
}

// ── Main exported component ───────────────────────────────────────────────────
export function TflStatusCard({ result }: { readonly result: string }) {
  const lines  = parseTflStatus(result)
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })

  if (lines.length < 1) return null

  const goodCount    = lines.filter(l => l.level === "good").length
  const delayedCount = lines.length - goodCount

  return (
    <motion.div
      ref={ref}
      className="w-full max-w-2xl rounded-2xl overflow-hidden"
      style={{
        background:   "#1a1a2e",
        border:       "1px solid rgba(255,255,255,0.10)",
        boxShadow:    "0 8px 32px rgba(0,0,0,0.45)",
      }}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-3">
          <TflRoundel size={36} />
          <div>
            <p className="text-xs font-bold tracking-widest text-blue-300 uppercase">
              Transport for London
            </p>
            <p className="text-base font-extrabold text-white leading-tight tracking-wide">
              Underground Line Status
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Summary counts */}
          <div className="text-right">
            <p className="text-[11px] text-green-400 font-semibold">{goodCount} Good</p>
            {delayedCount > 0 && (
              <p className="text-[11px] text-amber-400 font-semibold">{delayedCount} Disrupted</p>
            )}
          </div>
          <RefreshCw size={15} className="text-gray-500" />
        </div>
      </div>

      {/* Line rows */}
      <div className="flex flex-col gap-2 p-4">
        {lines.map((entry, i) => (
          <LineRow key={entry.name} entry={entry} index={i} />
        ))}
      </div>

      {/* Footer */}
      <div
        className="px-5 py-2.5 flex items-center justify-between"
        style={{ borderTop: "1px solid rgba(255,255,255,0.07)" }}
      >
        <p className="text-[10px] text-gray-500">
          {lines.length} line{lines.length !== 1 ? "s" : ""} monitored
        </p>
        <p className="text-[10px] text-gray-600">tfl.gov.uk</p>
      </div>
    </motion.div>
  )
}
