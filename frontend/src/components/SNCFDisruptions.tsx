import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence, useInView } from "framer-motion"
import { AlertTriangle, Ban, Minus, Clock, Train } from "lucide-react"

// ── Types ─────────────────────────────────────────────────────────────────────
interface DisruptionStats {
  total: number
  noService: number
  delayed: number
  reduced: number
  other: number
}

interface Disruption {
  effect: string
  severityName: string
  impacted: string
  message: string
  begin: string
  end: string
}

// ── Parser ────────────────────────────────────────────────────────────────────
function parseDisruptions(raw: string): { stats: DisruptionStats; items: Disruption[] } | null {
  const startM = /DISRUPTIONS_START:(\d+)\|(\d+)\|(\d+)\|(\d+)\|(\d+)/.exec(raw)
  if (!startM) return null

  const stats: DisruptionStats = {
    total:     Number.parseInt(startM[1]),
    noService: Number.parseInt(startM[2]),
    delayed:   Number.parseInt(startM[3]),
    reduced:   Number.parseInt(startM[4]),
    other:     Number.parseInt(startM[5]),
  }

  const items: Disruption[] = []
  for (const line of raw.split("\n")) {
    if (!line.startsWith("DISRUPTION:")) continue
    const parts = line.slice("DISRUPTION:".length).split("|")
    if (parts.length < 6) continue
    items.push({
      effect:       parts[0],
      severityName: parts[1],
      impacted:     parts[2],
      message:      parts[3],
      begin:        parts[4],
      end:          parts[5],
    })
  }

  return { stats, items }
}

// ── Per-effect styling ────────────────────────────────────────────────────────
function effectStyle(effect: string): { color: string; bg: string; label: string } {
  if (effect === "NO_SERVICE")          return { color: "#ef4444", bg: "#fef2f2", label: "No Service" }
  if (effect === "SIGNIFICANT_DELAYS")  return { color: "#f59e0b", bg: "#fffbeb", label: "Delays" }
  if (effect === "REDUCED_SERVICE")     return { color: "#f97316", bg: "#fff7ed", label: "Reduced" }
  return { color: "#6b7280", bg: "#f9fafb", label: "Alert" }
}

function EffectIcon({ effect, size = 14 }: { readonly effect: string; readonly size?: number }) {
  if (effect === "NO_SERVICE")         return <Ban style={{ width: size, height: size }} />
  if (effect === "SIGNIFICANT_DELAYS") return <Clock style={{ width: size, height: size }} />
  if (effect === "REDUCED_SERVICE")    return <Minus style={{ width: size, height: size }} />
  return <AlertTriangle style={{ width: size, height: size }} />
}

// ── Animated counter ──────────────────────────────────────────────────────────
function Counter({ to, delay = 0 }: { readonly to: number; readonly delay?: number }) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (to === 0) return
    const start = Date.now() + delay * 1000
    const dur = 900
    let raf: number
    const tick = () => {
      const elapsed = Date.now() - start
      if (elapsed < 0) { raf = requestAnimationFrame(tick); return }
      const progress = Math.min(elapsed / dur, 1)
      // ease-out
      setVal(Math.round(to * (1 - (1 - progress) ** 3)))
      if (progress < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to, delay])
  return <>{val}</>
}

// ── Stat tile ─────────────────────────────────────────────────────────────────
function StatTile({
  value, label, color, delay,
}: {
  readonly value: number
  readonly label: string
  readonly color: string
  readonly delay: number
}) {
  return (
    <motion.div
      className="flex flex-col items-center px-3 py-2 rounded-xl min-w-[52px]"
      style={{ backgroundColor: `${color}18` }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 360, damping: 22 }}
    >
      <span className="text-2xl font-black leading-none tabular-nums" style={{ color }}>
        <Counter to={value} delay={delay} />
      </span>
      <span className="text-[9px] font-semibold uppercase tracking-wider mt-0.5" style={{ color, opacity: 0.75 }}>
        {label}
      </span>
    </motion.div>
  )
}

// ── Single disruption card ────────────────────────────────────────────────────
function DisruptionCard({ item, index }: { readonly item: Disruption; readonly index: number }) {
  const { color, bg, label } = effectStyle(item.effect)
  const isNoService = item.effect === "NO_SERVICE"
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-20px" })

  return (
    <motion.div
      ref={ref}
      className="relative flex gap-0 overflow-hidden rounded-xl border bg-white"
      style={{ borderColor: `${color}25` }}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.06, duration: 0.28, ease: "easeOut" }}
    >
      {/* Coloured left accent */}
      <motion.div
        style={{ width: 4, backgroundColor: color, flexShrink: 0 }}
        animate={isNoService ? { opacity: [1, 0.4, 1] } : {}}
        transition={isNoService ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" } : {}}
      />

      <div className="flex-1 px-3 py-2.5 min-w-0">
        {/* Top row: icon badge + impacted name + effect badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ backgroundColor: bg, color }}
          >
            <EffectIcon effect={item.effect} size={9} />
            {label}
          </span>

          {item.impacted && (
            <span className="flex items-center gap-1 text-[11px] font-semibold text-gray-700 truncate">
              <Train style={{ width: 10, height: 10, color: "#6b7280", flexShrink: 0 }} />
              <span className="truncate">{item.impacted}</span>
            </span>
          )}
        </div>

        {/* Message / cause */}
        {item.message && (
          <p className="text-[11px] text-gray-500 mt-1 leading-snug line-clamp-2">
            {item.message}
          </p>
        )}

        {/* Time window */}
        {(item.begin || item.end) && (
          <div className="flex items-center gap-1 mt-1.5">
            <Clock style={{ width: 9, height: 9, color: "#9ca3af", flexShrink: 0 }} />
            <span className="text-[10px] text-gray-400 tabular-nums">
              {item.begin || "—"} → {item.end || "—"}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function SNCFDisruptions({ result }: { readonly result: string }) {
  const parsed = parseDisruptions(result)
  if (!parsed) return null
  const { stats, items } = parsed

  return (
    <div className="w-full rounded-2xl overflow-hidden border border-red-100 shadow-md" style={{ maxWidth: 560 }}>

      {/* Header */}
      <div
        className="relative overflow-hidden px-4 py-3"
        style={{ background: "linear-gradient(135deg, #c00014 0%, #8b0000 100%)" }}
      >
        {/* Animated scan line */}
        <motion.div
          className="absolute inset-y-0 w-16 pointer-events-none"
          style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.07), transparent)" }}
          animate={{ x: [-64, 620] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear", repeatDelay: 2 }}
        />

        {/* Title row */}
        <div className="relative flex items-center gap-2 mb-3">
          <motion.div
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          >
            <AlertTriangle className="w-4 h-4 text-red-200" />
          </motion.div>
          <span className="text-white font-bold text-sm tracking-tight">SNCF Live Disruptions</span>
          <span className="ml-auto text-red-200 text-[10px] font-mono">
            {new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>

        {/* Stat tiles */}
        <div className="relative flex gap-2 flex-wrap">
          <StatTile value={stats.total}     label="Total"     color="#fff"     delay={0}    />
          <StatTile value={stats.noService} label="Cancelled" color="#fca5a5"  delay={0.08} />
          <StatTile value={stats.delayed}   label="Delayed"   color="#fcd34d"  delay={0.16} />
          <StatTile value={stats.reduced}   label="Reduced"   color="#fb923c"  delay={0.24} />
          {stats.other > 0 && (
            <StatTile value={stats.other} label="Other" color="#e5e7eb" delay={0.32} />
          )}
        </div>
      </div>

      {/* Disruption list */}
      <div
        className="flex flex-col gap-2 p-3 overflow-y-auto"
        style={{ maxHeight: 380, background: "#fafafa" }}
      >
        <AnimatePresence>
          {items.map((item, i) => (
            <DisruptionCard key={`${item.effect}-${item.impacted}-${i}`} item={item} index={i} />
          ))}
        </AnimatePresence>
        {items.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">No disruption details available.</p>
        )}
      </div>
    </div>
  )
}
