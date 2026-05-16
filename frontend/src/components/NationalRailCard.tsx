import { useEffect, useRef, useState } from "react"
import { motion, useInView } from "framer-motion"
import { Train, Clock, AlertTriangle, Ban, Check } from "lucide-react"

const NR_BLUE = "#003C71"
const NR_ORANGE = "#F5A623"

interface ServiceEntry {
  std: string
  etd: string
  delayMins: number
  operator: string
  destination: string
  platform: string
  cancelled: boolean
}

interface Parsed {
  station: string
  crs: string
  services: ServiceEntry[]
}

function parseNRail(raw: string): Parsed | null {
  const m = /NRAIL_START:([^|]+)\|([^|]+)\|(\d+)/.exec(raw)
  if (!m) return null

  const services: ServiceEntry[] = []
  for (const line of raw.split("\n")) {
    if (!line.startsWith("DEP:")) continue
    const p = line.slice(4).split("|")
    if (p.length < 6) continue
    const etd = p[1].trim()
    services.push({
      std: p[0].trim(),
      etd,
      delayMins: parseInt(p[2]) || 0,
      operator: p[3].trim(),
      destination: p[4].trim(),
      platform: p[5].trim().replace(/\r$/, ""),
      cancelled: etd === "Cancelled",
    })
  }

  return { station: m[1].trim(), crs: m[2].trim(), services }
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

function ServiceRow({ svc, index }: { readonly svc: ServiceEntry; readonly index: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true })

  const isDelayed = !svc.cancelled && svc.delayMins > 0
  const isOnTime = !svc.cancelled && svc.delayMins === 0 && svc.etd !== "Delayed"

  return (
    <motion.div
      ref={ref}
      className="relative flex items-center gap-3 px-4 py-3 border-b group cursor-default overflow-hidden"
      style={{
        borderColor: "rgba(255,255,255,0.05)",
        backgroundColor: index % 2 === 0 ? "#0F1520" : "#0B1018",
        opacity: svc.cancelled ? 0.55 : 1,
      }}
      initial={{ opacity: 0, rotateX: -18, y: 6 }}
      animate={inView ? { opacity: svc.cancelled ? 0.55 : 1, rotateX: 0, y: 0 } : {}}
      transition={{ delay: index * 0.06, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      whileHover={{ backgroundColor: "#1a2535" }}
    >
      {/* Left accent bar */}
      <motion.div
        className="absolute inset-y-0 left-0 w-[3px] opacity-0 group-hover:opacity-100"
        style={{ backgroundColor: svc.cancelled ? "#ef4444" : NR_ORANGE }}
        transition={{ duration: 0.12 }}
      />

      {/* Scheduled time */}
      <div className="flex flex-col shrink-0 w-14">
        {isDelayed && (
          <span className="text-[9px] font-mono text-white/30 line-through tabular-nums leading-none mb-0.5">
            {svc.std}
          </span>
        )}
        <motion.span
          className="text-[19px] font-black tabular-nums font-mono leading-none"
          style={{ color: svc.cancelled ? "#ef4444" : isDelayed ? "#f59e0b" : "#fff" }}
          animate={isDelayed ? { opacity: [1, 0.5, 1] } : {}}
          transition={isDelayed ? { duration: 1.8, repeat: Infinity } : {}}
        >
          {svc.cancelled ? "——" : svc.std}
        </motion.span>
      </div>

      {/* Status */}
      <div className="flex flex-col gap-1 shrink-0 w-28">
        <span className="text-white/70 text-[12px] font-medium truncate">{svc.destination}</span>
        <div className="flex items-center gap-1">
          {svc.cancelled ? (
            <motion.div
              className="flex items-center gap-1"
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              <Ban className="w-2.5 h-2.5 text-red-400 shrink-0" />
              <span className="text-[9px] font-bold text-red-400">Cancelled</span>
            </motion.div>
          ) : isDelayed ? (
            <motion.div
              className="flex items-center gap-1"
              animate={{ opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.3, repeat: Infinity }}
            >
              <AlertTriangle className="w-2.5 h-2.5 text-amber-400 shrink-0" />
              <span className="text-[9px] font-bold text-amber-400">+{svc.delayMins} min</span>
            </motion.div>
          ) : (
            <div className="flex items-center gap-1">
              <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
              <span className="text-[9px] font-semibold text-emerald-400">On time</span>
            </div>
          )}
        </div>
      </div>

      {/* Operator + platform */}
      <div className="ml-auto flex flex-col items-end gap-0.5 shrink-0">
        <span className="text-white/30 text-[9px] font-medium truncate max-w-24">{svc.operator}</span>
        {svc.platform && (
          <div
            className="text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded"
            style={{ backgroundColor: NR_ORANGE, color: "#000", minWidth: 22, textAlign: "center" as const }}
          >
            {svc.platform}
          </div>
        )}
      </div>
    </motion.div>
  )
}

export function NationalRailCard({ result }: { readonly result: string }) {
  const parsed = parseNRail(result)
  if (!parsed) return null

  const { station, crs, services } = parsed
  const clock = useLiveClock()
  const cancelled = services.filter(s => s.cancelled).length
  const delayed = services.filter(s => !s.cancelled && s.delayMins > 0).length

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
        style={{ background: `linear-gradient(135deg, ${NR_BLUE} 0%, #001f3f 100%)` }}
      >
        <motion.div
          className="absolute inset-y-0 w-24 pointer-events-none"
          style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.06), transparent)" }}
          animate={{ x: [-96, 600] }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear", repeatDelay: 2.5 }}
        />
        <div className="relative flex items-center gap-2.5">
          <Train className="w-4 h-4 text-white shrink-0" />
          <div>
            <div className="text-white font-bold text-[13px] leading-tight">{station}</div>
            <div className="text-blue-200/70 text-[9px] font-semibold uppercase tracking-[0.18em]">
              National Rail · {crs}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1" style={{ backgroundColor: "rgba(0,0,0,0.3)" }}>
            <Clock className="w-3 h-3 text-white/60" />
            <span className="text-white font-mono font-bold text-[13px] tabular-nums">{clock}</span>
          </div>
        </div>
      </div>

      {/* Column headers */}
      <div
        className="flex items-center px-4 py-1.5 text-[8px] font-bold uppercase tracking-[0.15em]"
        style={{ color: "rgba(255,255,255,0.2)", backgroundColor: "#080D14", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        <span className="w-14 shrink-0">Departs</span>
        <span className="w-28 shrink-0">Destination</span>
        <span className="ml-auto">Plat.</span>
      </div>

      {/* Rows */}
      <div style={{ perspective: "600px" }}>
        {services.map((svc, i) => (
          <ServiceRow key={`${svc.std}-${i}`} svc={svc} index={i} />
        ))}
        {services.length === 0 && (
          <p className="text-white/30 text-xs text-center py-8">No upcoming departures</p>
        )}
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between px-4 py-1.5"
        style={{ backgroundColor: "#080D14", borderTop: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-1.5">
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: cancelled > 0 ? "#ef4444" : delayed > 0 ? "#f59e0b" : "#10b981" }}
            animate={{ opacity: [1, 0.25, 1] }}
            transition={{ duration: 2.2, repeat: Infinity }}
          />
          <span className="text-[9px] font-mono text-white/22">National Rail Live · Huxley2</span>
        </div>
        <span className="text-[9px] font-mono text-white/18">{services.length} services</span>
      </div>
    </motion.div>
  )
}
