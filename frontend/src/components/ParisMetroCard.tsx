import { useEffect, useRef, useState } from "react"
import { motion, useInView } from "framer-motion"
import { Train, Clock, AlertTriangle, Check } from "lucide-react"

// Official RATP line colours (hex without #)
const LINE_COLORS: Record<string, { bg: string; fg: string }> = {
  // Metro
  "1":  { bg: "#FFCD00", fg: "#000" },
  "2":  { bg: "#003CA6", fg: "#fff" },
  "3":  { bg: "#837902", fg: "#fff" },
  "3b": { bg: "#6EC4E8", fg: "#000" },
  "4":  { bg: "#CF009E", fg: "#fff" },
  "5":  { bg: "#FF7E2E", fg: "#fff" },
  "6":  { bg: "#6ECA97", fg: "#000" },
  "7":  { bg: "#FA9ABA", fg: "#000" },
  "7b": { bg: "#6ECA97", fg: "#000" },
  "8":  { bg: "#E19BDF", fg: "#000" },
  "9":  { bg: "#B6BD00", fg: "#000" },
  "10": { bg: "#C9910A", fg: "#fff" },
  "11": { bg: "#704B1C", fg: "#fff" },
  "12": { bg: "#007852", fg: "#fff" },
  "13": { bg: "#6EC4E8", fg: "#000" },
  "14": { bg: "#62259D", fg: "#fff" },
  // RER
  "a":  { bg: "#E2231A", fg: "#fff" },
  "b":  { bg: "#4B92DB", fg: "#fff" },
  "c":  { bg: "#FFCD00", fg: "#000" },
  "d":  { bg: "#007852", fg: "#fff" },
  "e":  { bg: "#BF7FB5", fg: "#fff" },
}

function lineStyle(label: string, colorHex: string, textColorHex: string) {
  const key = label.toLowerCase().trim()
  if (LINE_COLORS[key]) return LINE_COLORS[key]
  if (colorHex) {
    const bg = colorHex.startsWith("#") ? colorHex : `#${colorHex}`
    const fg = textColorHex ? (textColorHex.startsWith("#") ? textColorHex : `#${textColorHex}`) : "#fff"
    return { bg, fg }
  }
  return { bg: "#374151", fg: "#fff" }
}

interface DepEntry {
  sched: string
  base: string
  delayMins: number
  mode: string
  label: string
  direction: string
  color: string
  textColor: string
}

interface Parsed {
  station: string
  entries: DepEntry[]
}

function parseRATP(raw: string): Parsed | null {
  const m = /RATP_START:([^|\n]+)\|(\d+)/.exec(raw)
  if (!m) return null

  const entries: DepEntry[] = []
  for (const line of raw.split("\n")) {
    if (!line.startsWith("DEP:")) continue
    const p = line.slice(4).split("|")
    if (p.length < 6) continue
    entries.push({
      sched:     p[0].trim(),
      base:      p[1].trim(),
      delayMins: parseInt(p[2]) || 0,
      mode:      p[3].trim(),
      label:     p[4].trim(),
      direction: p[5].trim(),
      color:     p[6]?.trim() ?? "",
      textColor: p[7]?.trim().replace(/\r$/, "") ?? "",
    })
  }

  return { station: m[1].trim(), entries }
}

function useLiveClock() {
  const fmt = () => new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
  const [t, setT] = useState(fmt)
  useEffect(() => {
    const id = setInterval(() => setT(fmt()), 10_000)
    return () => clearInterval(id)
  }, [])
  return t
}

function DepRow({ entry, index }: { readonly entry: DepEntry; readonly index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })
  const { bg, fg } = lineStyle(entry.label, entry.color, entry.textColor)
  const delayed = entry.delayMins > 0

  return (
    <motion.div
      ref={ref}
      className="relative flex items-center gap-3 px-4 py-3 border-b group cursor-default overflow-hidden"
      style={{
        borderColor: "rgba(255,255,255,0.05)",
        backgroundColor: index % 2 === 0 ? "#0F1520" : "#0B1018",
      }}
      initial={{ opacity: 0, rotateX: -18, y: 6 }}
      animate={inView ? { opacity: 1, rotateX: 0, y: 0 } : {}}
      transition={{ delay: index * 0.06, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ backgroundColor: "#1a2535" }}
    >
      {/* Left accent */}
      <motion.div
        className="absolute inset-y-0 left-0 w-[3px] opacity-0 group-hover:opacity-100"
        style={{ backgroundColor: bg }}
        transition={{ duration: 0.12 }}
      />

      {/* Time */}
      <div className="flex flex-col shrink-0 w-14">
        {delayed && (
          <span className="text-[9px] font-mono text-white/30 line-through tabular-nums leading-none mb-0.5">
            {entry.base}
          </span>
        )}
        <motion.span
          className="text-[19px] font-black tabular-nums font-mono leading-none"
          style={{ color: delayed ? "#f59e0b" : "#fff" }}
          animate={delayed ? { opacity: [1, 0.5, 1] } : {}}
          transition={delayed ? { duration: 1.8, repeat: Infinity } : {}}
        >
          {entry.sched}
        </motion.span>
      </div>

      {/* Line badge + status */}
      <div className="flex flex-col gap-1 shrink-0">
        <div className="flex items-center gap-1.5">
          <span
            className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded tracking-wide"
            style={{ backgroundColor: bg, color: fg, minWidth: 28, textAlign: "center" as const }}
          >
            {entry.label}
          </span>
          <span className="text-white/35 text-[10px] font-medium">{entry.mode}</span>
        </div>
        {delayed ? (
          <motion.div
            className="flex items-center gap-1"
            animate={{ opacity: [1, 0.6, 1] }}
            transition={{ duration: 1.3, repeat: Infinity }}
          >
            <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />
            <span className="text-[9px] font-bold text-amber-400">+{entry.delayMins} min</span>
          </motion.div>
        ) : (
          <div className="flex items-center gap-1">
            <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
            <span className="text-[9px] font-semibold text-emerald-400">À l'heure</span>
          </div>
        )}
      </div>

      {/* Direction */}
      <div className="ml-auto min-w-0 text-right">
        <span className="text-white/80 text-sm font-medium truncate block">{entry.direction}</span>
      </div>
    </motion.div>
  )
}

export function ParisMetroCard({ result }: { readonly result: string }) {
  const parsed = parseRATP(result)
  if (!parsed) return null

  const { station, entries } = parsed
  const clock = useLiveClock()

  return (
    <motion.div
      className="rounded-2xl overflow-hidden shadow-2xl"
      style={{ border: "1px solid rgba(255,255,255,0.07)", backgroundColor: "#0B1018" }}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Header */}
      <div
        className="relative overflow-hidden px-4 py-3.5"
        style={{ background: "linear-gradient(135deg, #009A44 0%, #006630 100%)" }}
      >
        <motion.div
          className="absolute inset-y-0 w-24 pointer-events-none"
          style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.08), transparent)" }}
          animate={{ x: [-96, 600] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear", repeatDelay: 2 }}
        />
        <div className="relative flex items-center gap-2.5">
          <Train className="w-4 h-4 text-white shrink-0" />
          <div>
            <div className="text-white font-bold text-[13px] leading-tight">{station}</div>
            <div className="text-green-200/70 text-[9px] font-semibold uppercase tracking-[0.18em]">
              Paris Transit · RATP
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: "rgba(0,0,0,0.25)" }}>
            <Clock className="w-3 h-3 text-white/70" />
            <span className="text-white font-mono font-bold text-[13px] tabular-nums">{clock}</span>
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div
        className="flex items-center px-4 py-1.5 text-[8px] font-bold uppercase tracking-[0.15em]"
        style={{ color: "rgba(255,255,255,0.2)", backgroundColor: "#080D14", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="w-14 shrink-0">Heure</span>
        <span className="w-28 shrink-0">Ligne</span>
        <span className="ml-auto">Direction</span>
      </div>

      {/* Rows */}
      <div style={{ perspective: "600px" }}>
        {entries.map((entry, i) => (
          <DepRow key={`${entry.label}-${entry.sched}-${i}`} entry={entry} index={i} />
        ))}
        {entries.length === 0 && (
          <p className="text-white/30 text-xs text-center py-8">Aucun départ prévu</p>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-1.5"
        style={{ backgroundColor: "#080D14", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-1.5">
          <motion.div
            className="w-1.5 h-1.5 rounded-full bg-emerald-400"
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 2.2, repeat: Infinity }}
          />
          <span className="text-[9px] font-mono text-white/22">RATP Live · Navitia</span>
        </div>
        <span className="text-[9px] font-mono text-white/18">{entries.length} départs</span>
      </div>
    </motion.div>
  )
}
