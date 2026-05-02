import { useRef, useState, useEffect } from "react"
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion"
import { Train, Users } from "lucide-react"
import { cn } from "../lib/utils"

const ES_NAVY  = "#003366"
const ES_GOLD  = "#FFD700"

// ── Class palette ─────────────────────────────────────────────────────────────
const CLASS_COLOR: Record<string, { bar: string; bg: string; text: string; border: string }> = {
  standard: { bar: "#0ea5e9", bg: "#f0f9ff", text: "#0369a1", border: "#bae6fd" },
  comfort:  { bar: ES_GOLD,   bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
  premium:  { bar: ES_NAVY,   bg: "#eef2ff", text: "#312e81", border: "#c7d2fe" },
}

// ── Passenger-type config ──────────────────────────────────────────────────────
const TYPE_META: Record<string, { emoji: string; label: string; color: string }> = {
  normal: { emoji: "👤", label: "Adult",  color: "#374151" },
  kid:    { emoji: "👶", label: "Child",  color: "#7c3aed" },
  senior: { emoji: "👴", label: "Senior", color: "#065f46" },
  youth:  { emoji: "🧒", label: "Youth",  color: "#b45309" },
  pmr:    { emoji: "♿", label: "PMR",    color: "#1d4ed8" },
  vip:    { emoji: "⭐", label: "VIP",    color: "#92400e" },
  group:  { emoji: "👥", label: "Group",  color: "#6d28d9" },
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ServiceData {
  serviceCode:  string
  totalCount:   number
  origin:       string
  destination:  string
  classes:      { cls: string; count: number }[]
  types:        { typ: string; count: number }[]
}

interface Summary {
  date:     string
  total:    number
  services: ServiceData[]
}

// ── Parser ────────────────────────────────────────────────────────────────────
export function parseTravelerSummary(raw: string): Summary | null {
  const lines = raw.split("\n").map(l => l.trim())
  const startIdx = lines.findIndex(l => l.startsWith("TRAVELER_SUMMARY_START:"))
  if (startIdx < 0) return null

  const hdr   = lines[startIdx].slice("TRAVELER_SUMMARY_START:".length).split("|")
  const date  = hdr[0] ?? ""
  const services: ServiceData[] = []
  let cur: ServiceData | null = null

  for (let i = startIdx + 1; i < lines.length; i++) {
    const l = lines[i]
    if (l.startsWith("SERVICE_START:")) {
      const p = l.slice("SERVICE_START:".length).split("|")
      cur = { serviceCode: p[0] ?? "", totalCount: Number(p[1] ?? 0),
              origin: p[2] ?? "", destination: p[3] ?? "", classes: [], types: [] }
    } else if (l === "SERVICE_END" && cur) {
      services.push(cur); cur = null
    } else if (l.startsWith("CLASS:") && cur) {
      const p = l.slice("CLASS:".length).split("|")
      cur.classes.push({ cls: p[0] ?? "", count: Number(p[1] ?? 0) })
    } else if (l.startsWith("TYPE:") && cur) {
      const p = l.slice("TYPE:".length).split("|")
      cur.types.push({ typ: p[0] ?? "", count: Number(p[1] ?? 0) })
    } else if (l === "TRAVELER_SUMMARY_END") {
      break
    }
  }

  if (services.length === 0) return null
  const total = services.reduce((s, v) => s + v.totalCount, 0)
  return { date, total, services }
}

// ── Animated counter ──────────────────────────────────────────────────────────
function CountUp({ to, inView, delay = 0 }: { readonly to: number; readonly inView: boolean; readonly delay?: number }) {
  const mv      = useMotionValue(0)
  const rounded = useTransform(mv, v => Math.round(v))
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const unsub = rounded.on("change", v => setDisplay(v))
    return unsub
  }, [rounded])

  useEffect(() => {
    if (!inView) return
    const ctrl = animate(mv, to, { duration: 1.1, delay, ease: [0.16, 1, 0.3, 1] })
    return () => ctrl.stop()
  }, [inView, to, delay, mv])

  return <>{display}</>
}

// ── Class breakdown bar ────────────────────────────────────────────────────────
function ClassBar({
  cls, count, total, inView, delay,
}: {
  readonly cls: string; readonly count: number; readonly total: number
  readonly inView: boolean; readonly delay: number
}) {
  const pct   = total > 0 ? (count / total) * 100 : 0
  const meta  = CLASS_COLOR[cls] ?? CLASS_COLOR.standard
  const label = cls.charAt(0).toUpperCase() + cls.slice(1)

  return (
    <motion.div
      className="rounded-xl p-3 flex flex-col gap-1.5"
      style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
      initial={{ opacity: 0, y: 10 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay, duration: 0.3 }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: meta.text }}>
          {label}
        </span>
        <span className="text-sm font-black tabular-nums" style={{ color: meta.text }}>
          <CountUp to={count} inView={inView} delay={delay + 0.1} />
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/70 overflow-hidden" style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)" }}>
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: meta.bar }}
          initial={{ width: 0 }}
          animate={inView ? { width: `${pct}%` } : {}}
          transition={{ delay: delay + 0.15, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <div className="text-[10px] font-semibold" style={{ color: meta.text }}>
        {pct.toFixed(0)}% of passengers
      </div>
    </motion.div>
  )
}

// ── Passenger type chip ────────────────────────────────────────────────────────
function TypeChip({
  typ, count, inView, delay,
}: {
  readonly typ: string; readonly count: number; readonly inView: boolean; readonly delay: number
}) {
  const meta = TYPE_META[typ]
  if (!meta) return null
  return (
    <motion.div
      className="flex items-center gap-1.5 rounded-xl px-3 py-2 bg-white border border-gray-100"
      style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ delay, type: "spring", stiffness: 420, damping: 22 }}
      whileHover={{ scale: 1.06, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
    >
      <span className="text-base leading-none">{meta.emoji}</span>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{meta.label}</span>
        <span className="text-sm font-black tabular-nums leading-none" style={{ color: meta.color }}>
          <CountUp to={count} inView={inView} delay={delay + 0.05} />
        </span>
      </div>
    </motion.div>
  )
}

// ── Single service card ────────────────────────────────────────────────────────
function ServiceCard({ svc, inView }: { readonly svc: ServiceData; readonly inView: boolean }) {
  const totalClassCount = svc.classes.reduce((s, c) => s + c.count, 0)

  return (
    <div className="flex flex-col gap-3">
      {/* Service header strip */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="px-2.5 py-1 rounded-lg text-white text-xs font-bold tracking-wide"
            style={{ background: `linear-gradient(135deg, ${ES_NAVY}, #0055cc)` }}
          >
            {svc.serviceCode}
          </div>
          <span className="text-xs font-semibold text-gray-600">
            {svc.origin} → {svc.destination}
          </span>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-400 uppercase tracking-wider">Passengers</div>
          <div className="text-xl font-black tabular-nums" style={{ color: ES_NAVY }}>
            <CountUp to={svc.totalCount} inView={inView} />
          </div>
        </div>
      </div>

      {/* Class breakdown */}
      {svc.classes.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Service class</div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.min(svc.classes.length, 3)}, 1fr)` }}>
            {svc.classes.map((c, i) => (
              <ClassBar
                key={c.cls}
                cls={c.cls}
                count={c.count}
                total={totalClassCount}
                inView={inView}
                delay={0.1 + i * 0.07}
              />
            ))}
          </div>
        </div>
      )}

      {/* Passenger types */}
      {svc.types.length > 0 && (
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Traveler types</div>
          <div className="flex flex-wrap gap-2">
            {svc.types.map((t, i) => (
              <TypeChip key={t.typ} typ={t.typ} count={t.count} inView={inView} delay={0.25 + i * 0.05} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function TravelerSummaryCard({ result }: { readonly result: string }) {
  const summary = parseTravelerSummary(result)
  if (!summary) return null

  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const [sel, setSel] = useState(0)
  const svc = summary.services[Math.min(sel, summary.services.length - 1)]

  const spring = (d: number) => ({ type: "spring" as const, stiffness: 320, damping: 28, delay: d })

  return (
    <motion.div
      ref={ref}
      className="rounded-2xl overflow-hidden bg-white w-full"
      style={{ boxShadow: "0 8px 40px #00336622, 0 2px 8px #00000012" }}
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={spring(0)}
    >
      {/* ── Hero header ── */}
      <div
        className="relative px-5 pt-5 pb-5 text-white overflow-hidden"
        style={{ background: `linear-gradient(135deg, #001f4d 0%, #003388 60%, #004db3 100%)` }}
      >
        {/* shimmer */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.07) 50%, transparent 65%)" }}
          animate={{ x: ["-100%", "200%"] }}
          transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut", repeatDelay: 2.5 }}
        />

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm"
              whileHover={{ scale: 1.12, backgroundColor: "rgba(255,255,255,0.25)" }}
            >
              <Users className="w-5 h-5" />
            </motion.div>
            <div>
              <div className="font-black text-base leading-tight tracking-tight">Passenger Load</div>
              <div className="text-[11px] text-white/60 leading-tight">{summary.date}</div>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[11px] text-white/50 uppercase tracking-widest mb-0.5">Total pax</div>
            <div className="text-4xl font-black tabular-nums leading-none" style={{ textShadow: "0 2px 16px rgba(255,215,0,0.4)", color: ES_GOLD }}>
              <CountUp to={summary.total} inView={inView} delay={0.1} />
            </div>
          </div>
        </div>

        {/* Service count pill */}
        <div className="mt-3 flex items-center gap-1.5">
          <Train className="w-3.5 h-3.5 text-white/60" />
          <span className="text-[11px] text-white/60">
            {summary.services.length} service{summary.services.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* ── Service tabs ── */}
      {summary.services.length > 1 && (
        <div className="flex overflow-x-auto border-b border-gray-100 bg-gray-50">
          {summary.services.map((s, i) => (
            <button
              key={s.serviceCode}
              type="button"
              onClick={() => setSel(i)}
              className={cn(
                "px-4 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-colors",
                i === sel
                  ? "border-[#003366] text-[#003366] bg-white"
                  : "border-transparent text-gray-400 hover:text-gray-600",
              )}
            >
              <span>{s.serviceCode}</span>
              <span className="ml-1.5 tabular-nums text-[10px] font-semibold opacity-70">{s.totalCount}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Service detail ── */}
      <div className="p-4">
        <ServiceCard svc={svc} inView={inView} />
      </div>
    </motion.div>
  )
}
