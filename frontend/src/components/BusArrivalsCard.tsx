import { useEffect, useMemo, useRef, useState } from "react"
import { motion, useInView } from "framer-motion"

// ── TfL bus line badge colours (roundel style) ────────────────────────────────
const BUS_RED = "#e1251b"

// ── Parser ────────────────────────────────────────────────────────────────────

type BusRow = {
  lineName: string
  stopName: string
  etaMs:    number
}

type ParsedArrivals = {
  stopCode:     string
  lineID:       string
  label:        string   // display name: stop name or "bus 169"
  count:        number
  serverTimeMs: number
  buses:        BusRow[]
  isLineQuery:  boolean  // true when queried by line (stop name varies per row)
}

function parse(result: string): ParsedArrivals | null {
  // Header: BUS_ARRIVALS_START:stopCode|lineID|label|count|serverTimeMs
  const startMatch = /BUS_ARRIVALS_START:([^|\n]*)\|([^|\n]*)\|([^|\n]*)\|(\d+)\|(\d+)/.exec(result)
  if (!startMatch) return null

  const [, stopCode, lineID, label, countStr, serverStr] = startMatch
  const buses: BusRow[] = []

  // BUS:lineName|stopName|etaMs
  for (const m of result.matchAll(/^BUS:([^|\n]+)\|([^|\n]*)\|(\d+)$/gm)) {
    buses.push({ lineName: m[1], stopName: m[2], etaMs: Number(m[3]) })
  }

  return {
    stopCode,
    lineID,
    label,
    count:        Number.parseInt(countStr, 10),
    serverTimeMs: Number.parseInt(serverStr, 10),
    buses,
    isLineQuery:  stopCode === "" && lineID !== "",
  }
}

// ── ETA display ───────────────────────────────────────────────────────────────

function etaLabel(etaMs: number, nowMs: number): { text: string; urgent: boolean } {
  const secs = Math.max(0, Math.round((etaMs - nowMs) / 1000))
  if (secs < 30)  return { text: "Due",      urgent: true }
  if (secs < 60)  return { text: "< 1 min",  urgent: true }
  const mins = Math.floor(secs / 60)
  return { text: `${mins} min`,  urgent: mins <= 2 }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function BusRoundel({ line }: { readonly line: string }) {
  return (
    <div
      style={{
        background:   BUS_RED,
        borderRadius: "50%",
        width:        36,
        height:       36,
        display:      "flex",
        alignItems:   "center",
        justifyContent: "center",
        flexShrink:   0,
        fontWeight:   700,
        fontSize:     line.length > 3 ? 9 : line.length > 2 ? 11 : 13,
        color:        "#fff",
        letterSpacing: "-0.5px",
        border:       "2px solid rgba(255,255,255,0.15)",
      }}
    >
      {line}
    </div>
  )
}

function BusRow({
  bus,
  nowMs,
  index,
  isLineQuery,
}: {
  readonly bus:         BusRow
  readonly nowMs:       number
  readonly index:       number
  readonly isLineQuery: boolean
}) {
  const eta = etaLabel(bus.etaMs, nowMs)

  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04, duration: 0.28, ease: "easeOut" }}
      style={{
        display:       "grid",
        gridTemplateColumns: "40px 1fr auto",
        alignItems:    "center",
        gap:           12,
        padding:       "9px 14px",
        borderBottom:  "1px solid rgba(255,255,255,0.06)",
        background:    index % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent",
      }}
    >
      <BusRoundel line={bus.lineName} />

      <span style={{ color: "#f0f0f0", fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {isLineQuery ? (bus.stopName || "—") : `Bus ${bus.lineName}`}
      </span>

      <span
        style={{
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          fontSize:   13,
          minWidth:   54,
          textAlign:  "right",
          color:      eta.urgent ? "#fbbf24" : "#86efac",
          background: eta.urgent ? "rgba(251,191,36,0.12)" : "rgba(134,239,172,0.10)",
          borderRadius: 6,
          padding:    "2px 8px",
        }}
      >
        {eta.text}
      </span>
    </motion.div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export function BusArrivalsCard({ result }: { readonly result: string }) {
  const data = useMemo(() => parse(result), [result])
  const [nowMs, setNowMs] = useState(() => Date.now())
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5000)
    return () => clearInterval(id)
  }, [])

  if (!data) return null

  const displayName = data.label || data.stopCode || data.lineID

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{
        background:   "#0d1117",
        borderRadius: 14,
        overflow:     "hidden",
        border:       "1px solid rgba(255,255,255,0.1)",
        maxWidth:     500,
        fontFamily:   "system-ui, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: BUS_RED,
          padding:    "10px 14px",
          display:    "flex",
          alignItems: "center",
          gap:        10,
        }}
      >
        {/* TfL roundel icon */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: "#003688", border: "3px solid #fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{ width: 20, height: 4, background: BUS_RED, borderRadius: 2 }} />
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {displayName}
          </div>
        </div>

        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>
            {data.buses.length}
          </div>
          <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 10 }}>buses due</div>
        </div>
      </div>

      {/* Column headers */}
      <div style={{
        display:       "grid",
        gridTemplateColumns: "40px 1fr auto",
        gap:           12,
        padding:       "5px 14px",
        background:    "#161b22",
        borderBottom:  "1px solid rgba(255,255,255,0.08)",
      }}>
        <span style={{ color: "#6b7280", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Line</span>
        <span style={{ color: "#6b7280", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>{data.isLineQuery ? "Stop" : "Route"}</span>
        <span style={{ color: "#6b7280", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", textAlign: "right", minWidth: 54 }}>Wait</span>
      </div>

      {/* Bus rows */}
      {data.buses.length === 0 ? (
        <div style={{ padding: "20px 14px", color: "#9ca3af", fontSize: 13, textAlign: "center" }}>
          No buses currently predicted
        </div>
      ) : (
        data.buses.map((bus, i) => (
          <BusRow key={`${bus.lineName}-${bus.etaMs}`} bus={bus} nowMs={nowMs} index={i} isLineQuery={data.isLineQuery} />
        ))
      )}

      {/* Footer */}
      <div style={{
        padding:    "5px 14px",
        background: "#161b22",
        display:    "flex",
        alignItems: "center",
        gap:        6,
      }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", animation: "pulse 2s ease-in-out infinite" }} />
        <span style={{ color: "#6b7280", fontSize: 10 }}>Live • TfL Countdown</span>
        <span style={{ color: "#374151", fontSize: 10, marginLeft: "auto" }}>{data.stopCode}</span>
      </div>
    </motion.div>
  )
}
