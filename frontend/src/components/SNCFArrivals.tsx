import { useEffect, useRef, useState } from "react"
import { motion, useInView } from "framer-motion"
import { Train, ArrowLeft, Clock, AlertTriangle, Check } from "lucide-react"

const NAVY = "#1e3a5f"

const MODE_COLORS: Record<string, { bg: string; fg: string }> = {
  tgv:          { bg: "#E05206", fg: "#fff" },
  ouigo:        { bg: "#E2007A", fg: "#fff" },
  ter:          { bg: "#1b5896", fg: "#fff" },
  "intercités": { bg: "#64748b", fg: "#fff" },
  intercites:   { bg: "#64748b", fg: "#fff" },
  inoui:        { bg: "#E05206", fg: "#fff" },
}

function modeStyle(mode: string) {
  const key = mode.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  return (
    Object.entries(MODE_COLORS).find(([k]) =>
      k.normalize("NFD").replace(/[̀-ͯ]/g, "") === key
    )?.[1] ?? { bg: "#374151", fg: "#fff" }
  )
}

interface ArrEntry {
  sched: string
  base: string
  delay: number
  mode: string
  label: string
  origin: string
}

function parseArrivals(raw: string): { station: string; items: ArrEntry[] } | null {
  const m = /ARRIVALS_START:([^|\n]+)\|(\d+)/.exec(raw)
  if (!m) return null
  const items: ArrEntry[] = []
  for (const line of raw.split("\n")) {
    if (!line.startsWith("ARR:")) continue
    const p = line.slice(4).split("|")
    if (p.length < 6) continue
    items.push({
      sched: p[0].trim(), base: p[1].trim(),
      delay: parseInt(p[2]) || 0,
      mode: p[3].trim(), label: p[4].trim(),
      origin: p[5].trim().replace(/\r$/, ""),
    })
  }
  return { station: m[1].trim(), items }
}

function useLiveClock() {
  const fmt = () => new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  const [t, setT] = useState(fmt)
  useEffect(() => {
    const id = setInterval(() => setT(fmt()), 10_000)
    return () => clearInterval(id)
  }, [])
  return t
}

function ArrRow({ entry, index }: { readonly entry: ArrEntry; readonly index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })
  const { bg, fg } = modeStyle(entry.mode)
  const delayed = entry.delay > 0

  return (
    <motion.div
      ref={ref}
      className="relative flex items-center gap-3 px-4 py-3 border-b group cursor-default overflow-hidden"
      style={{ borderColor: "rgba(255,255,255,0.05)", backgroundColor: index % 2 === 0 ? "#0A1628" : "#081020" }}
      initial={{ opacity: 0, x: -24, y: 4 }}
      animate={inView ? { opacity: 1, x: 0, y: 0 } : {}}
      transition={{ delay: index * 0.07, duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ backgroundColor: "#132140" }}
    >
      {/* Right accent on hover (arrivals come from right) */}
      <motion.div
        className="absolute inset-y-0 right-0 w-[3px] opacity-0 group-hover:opacity-100"
        style={{ backgroundColor: "#3b82f6" }}
        transition={{ duration: 0.12 }}
      />

      {/* Time */}
      <div className="flex flex-col shrink-0 w-14">
        {delayed && (
          <span className="text-[9px] font-mono text-white/30 line-through tabular-nums leading-none mb-0.5">{entry.base}</span>
        )}
        <motion.span
          className="text-[19px] font-black tabular-nums font-mono leading-none"
          style={{ color: delayed ? "#f59e0b" : "#fff" }}
          animate={delayed ? { opacity: [1, 0.5, 1] } : {}}
          transition={delayed ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : {}}
        >
          {entry.sched}
        </motion.span>
      </div>

      {/* Status + mode */}
      <div className="flex flex-col gap-1 shrink-0">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-wide"
            style={{ backgroundColor: bg, color: fg, minWidth: 36, textAlign: "center" as const }}
          >
            {entry.mode.length > 6 ? entry.mode.slice(0, 5) : entry.mode}
          </span>
          <span className="text-white/45 text-[11px] font-mono">{entry.label}</span>
        </div>
        {delayed ? (
          <motion.div
            className="flex items-center gap-1"
            animate={{ opacity: [1, 0.6, 1] }}
            transition={{ duration: 1.3, repeat: Infinity }}
          >
            <AlertTriangle className="w-2.5 h-2.5 shrink-0" style={{ color: "#f59e0b" }} />
            <span className="text-[9px] font-bold tabular-nums" style={{ color: "#f59e0b" }}>+{entry.delay} min</span>
          </motion.div>
        ) : (
          <div className="flex items-center gap-1">
            <Check className="w-2.5 h-2.5 shrink-0" style={{ color: "#10b981" }} />
            <span className="text-[9px] font-semibold" style={{ color: "#10b981" }}>On time</span>
          </div>
        )}
      </div>

      {/* Origin */}
      <div className="flex items-center gap-1.5 ml-auto min-w-0">
        <span className="text-white/85 text-sm font-medium truncate">{entry.origin}</span>
        <ArrowLeft className="w-3 h-3 shrink-0" style={{ color: "#3b82f6" }} />
      </div>
    </motion.div>
  )
}

export function SNCFArrivals({ result }: { readonly result: string }) {
  const parsed = parseArrivals(result)
  if (!parsed) return null
  const { station, items } = parsed
  const clock = useLiveClock()

  return (
    <motion.div
      className="rounded-2xl overflow-hidden shadow-2xl"
      style={{ border: "1px solid rgba(255,255,255,0.07)", backgroundColor: "#081020" }}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Header */}
      <div
        className="relative overflow-hidden px-4 py-3.5"
        style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #0d213d 100%)` }}
      >
        {/* Scan line moving right to left (trains arriving) */}
        <motion.div
          className="absolute inset-y-0 w-24 pointer-events-none"
          style={{ background: "linear-gradient(to left, transparent, rgba(255,255,255,0.06), transparent)" }}
          animate={{ x: [600, -96] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "linear", repeatDelay: 2.5 }}
        />
        <div className="relative flex items-center gap-2.5">
          <Train className="w-4 h-4 text-white shrink-0" />
          <div>
            <div className="text-white font-bold text-[13px] leading-tight tracking-tight">{station}</div>
            <div className="text-blue-200/80 text-[9px] font-semibold uppercase tracking-[0.18em]">Arrivées · Arrivals</div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
            <Clock className="w-3 h-3 text-white/70" />
            <span className="text-white font-mono font-bold text-[13px] tabular-nums">{clock}</span>
          </div>
        </div>
      </div>

      {/* Col headers */}
      <div
        className="flex items-center px-4 py-1.5 text-[8px] font-bold uppercase tracking-[0.15em]"
        style={{ color: "rgba(255,255,255,0.2)", backgroundColor: "#060E1C", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="w-14 shrink-0">Time</span>
        <span className="w-28 shrink-0">Train</span>
        <span className="ml-auto">From</span>
      </div>

      {/* Rows */}
      <div>
        {items.map((entry, i) => (
          <ArrRow key={`${entry.label}-${i}`} entry={entry} index={i} />
        ))}
        {items.length === 0 && (
          <p className="text-white/30 text-xs text-center py-8">No upcoming arrivals</p>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-1.5"
        style={{ backgroundColor: "#060E1C", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-1.5">
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: "#3b82f6" }}
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 2.2, repeat: Infinity }}
          />
          <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.22)" }}>SNCF Live · Realtime</span>
        </div>
        <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.18)" }}>{items.length} trains</span>
      </div>
    </motion.div>
  )
}
