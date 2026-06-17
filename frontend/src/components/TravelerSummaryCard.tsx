import { useEffect, useRef, useState } from "react"
import { animate, motion, useInView, useMotionValue, useTransform } from "framer-motion"
import { Crown, Sparkles, Train, Users } from "lucide-react"
import { cn } from "../lib/utils"
import { EurostarDisplayMenu, EurostarDisplayStyles, eurostarDisplayClass, useEurostarDisplay } from "./EurostarDisplay"

const ES_NAVY = "#003366"
const ES_GOLD = "#FFD700"

const CLASS_COLOR: Record<string, { bar: string; bg: string; text: string; border: string }> = {
  standard: { bar: "#0ea5e9", bg: "#f0f9ff", text: "#0369a1", border: "#bae6fd" },
  comfort: { bar: ES_GOLD, bg: "#fffbeb", text: "#92400e", border: "#fde68a" },
  premium: { bar: ES_NAVY, bg: "#eef2ff", text: "#312e81", border: "#c7d2fe" },
}

const TYPE_META: Record<string, { emoji: string; label: string; color: string }> = {
  normal: { emoji: "👤", label: "Adult", color: "#374151" },
  kid: { emoji: "👶", label: "Child", color: "#7c3aed" },
  senior: { emoji: "👴", label: "Senior", color: "#065f46" },
  youth: { emoji: "🧒", label: "Youth", color: "#b45309" },
  pmr: { emoji: "♿", label: "PMR", color: "#1d4ed8" },
  vip: { emoji: "⭐", label: "VIP", color: "#92400e" },
  group: { emoji: "👥", label: "Group", color: "#6d28d9" },
}

interface ServiceData {
  serviceCode: string
  totalCount: number
  origin: string
  destination: string
  classes: { cls: string; count: number }[]
  types: { typ: string; count: number }[]
}

interface Summary {
  date: string
  total: number
  services: ServiceData[]
}

export function parseTravelerSummary(raw: string): Summary | null {
  const lines = raw.split("\n").map(line => line.trim())
  const startIdx = lines.findIndex(line => line.startsWith("TRAVELER_SUMMARY_START:"))
  if (startIdx < 0) return null

  const hdr = lines[startIdx].slice("TRAVELER_SUMMARY_START:".length).split("|")
  const date = hdr[0] ?? ""
  const services: ServiceData[] = []
  let cur: ServiceData | null = null

  for (let i = startIdx + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.startsWith("SERVICE_START:")) {
      const p = line.slice("SERVICE_START:".length).split("|")
      cur = {
        serviceCode: p[0] ?? "",
        totalCount: Number(p[1] ?? 0),
        origin: p[2] ?? "",
        destination: p[3] ?? "",
        classes: [],
        types: [],
      }
    } else if (line === "SERVICE_END" && cur) {
      services.push(cur)
      cur = null
    } else if (line.startsWith("CLASS:") && cur) {
      const p = line.slice("CLASS:".length).split("|")
      cur.classes.push({ cls: p[0] ?? "", count: Number(p[1] ?? 0) })
    } else if (line.startsWith("TYPE:") && cur) {
      const p = line.slice("TYPE:".length).split("|")
      cur.types.push({ typ: p[0] ?? "", count: Number(p[1] ?? 0) })
    } else if (line === "TRAVELER_SUMMARY_END") {
      break
    }
  }

  if (services.length === 0) return null
  const total = services.reduce((sum, value) => sum + value.totalCount, 0)
  return { date, total, services }
}

function CountUp({ to, inView, delay = 0 }: { readonly to: number; readonly inView: boolean; readonly delay?: number }) {
  const mv = useMotionValue(0)
  const rounded = useTransform(mv, value => Math.round(value))
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const unsub = rounded.on("change", value => setDisplay(value))
    return unsub
  }, [rounded])

  useEffect(() => {
    if (!inView) return
    const ctrl = animate(mv, to, { duration: 1.1, delay, ease: [0.16, 1, 0.3, 1] })
    return () => ctrl.stop()
  }, [delay, inView, mv, to])

  return <>{display}</>
}

function classLabel(cls: string) {
  return cls.charAt(0).toUpperCase() + cls.slice(1)
}

function serviceClassShare(classes: ServiceData["classes"]) {
  const totalClassCount = classes.reduce((sum, item) => sum + item.count, 0)
  return classes
    .map(item => ({ ...item, pct: totalClassCount > 0 ? (item.count / totalClassCount) * 100 : 0 }))
    .sort((a, b) => b.count - a.count)
}

function classRingGradient(classes: ServiceData["classes"]) {
  const shares = serviceClassShare(classes)
  if (shares.length === 0) {
    return "conic-gradient(rgba(14,165,233,0.9) 0deg, rgba(15,23,42,0.92) 360deg)"
  }

  let cursor = 0
  const stops: string[] = []
  for (const item of shares) {
    const meta = CLASS_COLOR[item.cls] ?? CLASS_COLOR.standard
    const span = (item.pct / 100) * 360
    const end = cursor + span
    stops.push(`${meta.bar} ${cursor}deg ${end}deg`)
    cursor = end
  }
  if (cursor < 360) {
    stops.push(`rgba(148,163,184,0.18) ${cursor}deg 360deg`)
  }
  return `conic-gradient(${stops.join(",")})`
}

function ClassBar({
  cls, count, total, inView, delay,
}: {
  readonly cls: string
  readonly count: number
  readonly total: number
  readonly inView: boolean
  readonly delay: number
}) {
  const pct = total > 0 ? (count / total) * 100 : 0
  const meta = CLASS_COLOR[cls] ?? CLASS_COLOR.standard

  return (
    <motion.div
      className="flex flex-col gap-1.5 rounded-2xl p-3"
      style={{ background: meta.bg, border: `1px solid ${meta.border}` }}
      initial={{ opacity: 0, y: 10 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay, duration: 0.3 }}
      whileHover={{ scale: 1.02 }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: meta.text }}>
          {classLabel(cls)}
        </span>
        <span className="text-sm font-black tabular-nums" style={{ color: meta.text }}>
          <CountUp to={count} inView={inView} delay={delay + 0.1} />
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/70 shadow-[inset_0_1px_3px_rgba(0,0,0,0.08)]">
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

function TypeChip({
  typ, count, inView, delay,
}: {
  readonly typ: string
  readonly count: number
  readonly inView: boolean
  readonly delay: number
}) {
  const meta = TYPE_META[typ]
  if (!meta) return null

  return (
    <motion.div
      className="flex items-center gap-1.5 rounded-2xl border border-gray-100 bg-white px-3 py-2"
      style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ delay, type: "spring", stiffness: 420, damping: 22 }}
      whileHover={{ scale: 1.06, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}
    >
      <span className="text-base leading-none">{meta.emoji}</span>
      <div className="flex flex-col">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{meta.label}</span>
        <span className="text-sm font-black leading-none tabular-nums" style={{ color: meta.color }}>
          <CountUp to={count} inView={inView} delay={delay + 0.05} />
        </span>
      </div>
    </motion.div>
  )
}

function TypeBar({
  typ, count, total, inView, delay,
}: {
  readonly typ: string
  readonly count: number
  readonly total: number
  readonly inView: boolean
  readonly delay: number
}) {
  const meta = TYPE_META[typ]
  if (!meta) return null

  const pct = total > 0 ? (count / total) * 100 : 0
  return (
    <motion.div
      className="rounded-2xl border px-3 py-3"
      style={{ borderColor: "rgba(148,163,184,0.14)", background: "rgba(255,255,255,0.72)" }}
      initial={{ opacity: 0, y: 8 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay, duration: 0.28 }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="text-base leading-none">{meta.emoji}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: meta.color }}>
          {meta.label}
        </span>
        <span className="ml-auto text-sm font-black tabular-nums" style={{ color: meta.color }}>
          <CountUp to={count} inView={inView} delay={delay + 0.04} />
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200/80">
        <motion.div
          className="h-full rounded-full"
          style={{ background: meta.color }}
          initial={{ width: 0 }}
          animate={inView ? { width: `${pct}%` } : {}}
          transition={{ delay: delay + 0.08, duration: 0.75, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
    </motion.div>
  )
}

function ServiceCard({ svc, inView }: { readonly svc: ServiceData; readonly inView: boolean }) {
  const totalClassCount = svc.classes.reduce((sum, item) => sum + item.count, 0)
  const totalTypeCount = svc.types.reduce((sum, item) => sum + item.count, 0)
  const classShares = serviceClassShare(svc.classes)
  const leadClass = classShares[0]
  const leadType = svc.types[0] ? TYPE_META[svc.types[0].typ] : null

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)]">
      <div
        className="relative overflow-hidden rounded-[28px] border border-white/60 p-5"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,252,0.92))",
          boxShadow: "0 24px 60px rgba(15,23,42,0.12)",
        }}
      >
        <div className="absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.16),transparent_65%)]" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div
                className="rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
                style={{ background: `linear-gradient(135deg, ${ES_NAVY}, #0055cc)` }}
              >
                {svc.serviceCode}
              </div>
              <div className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-semibold text-slate-600">
                {svc.origin} to {svc.destination}
              </div>
            </div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Passengers on board</div>
            <div className="mt-2 text-5xl font-black tracking-tight text-slate-950">
              <CountUp to={svc.totalCount} inView={inView} />
            </div>
            <div className="mt-2 max-w-xl text-sm text-slate-500">
              {leadClass ? `${classLabel(leadClass.cls)} leads this service at ${leadClass.pct.toFixed(0)}% of the mix.` : "Live passenger mix is still building."}
            </div>
          </div>

          <div className="flex items-center gap-5 rounded-[24px] border border-slate-200/80 bg-white/70 px-4 py-4 backdrop-blur">
            <div className="relative h-36 w-36 rounded-full" style={{ background: classRingGradient(svc.classes) }}>
              <div className="absolute inset-[16px] rounded-full bg-white/95 shadow-[inset_0_1px_10px_rgba(15,23,42,0.08)]" />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Class mix</div>
                <div className="mt-1 text-2xl font-black text-slate-900">{classShares.length}</div>
                <div className="text-[11px] text-slate-500">active cabins</div>
              </div>
            </div>
            <div className="space-y-2">
              {classShares.map(item => {
                const meta = CLASS_COLOR[item.cls] ?? CLASS_COLOR.standard
                return (
                  <div key={item.cls} className="flex items-center gap-3 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.bar }} />
                    <span className="min-w-[74px] font-semibold text-slate-600">{classLabel(item.cls)}</span>
                    <span className="font-black tabular-nums text-slate-900">{Math.round(item.pct)}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {svc.classes.length > 0 && (
          <div className="relative mt-6">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-400">Cabin balance</div>
            <div className="grid gap-3 md:grid-cols-3">
              {svc.classes.map((item, i) => (
                <ClassBar
                  key={item.cls}
                  cls={item.cls}
                  count={item.count}
                  total={totalClassCount}
                  inView={inView}
                  delay={0.08 + i * 0.06}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div
        className="overflow-hidden rounded-[28px] border border-[#dbe6ff] p-5 text-white"
        style={{
          background: "linear-gradient(180deg, rgba(0,34,84,0.98), rgba(5,65,146,0.95) 58%, rgba(14,116,144,0.92))",
          boxShadow: "0 24px 60px rgba(0,51,102,0.25)",
        }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/12 backdrop-blur">
            <Crown className="h-4 w-4 text-[#ffe082]" />
          </div>
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-white/55">Traveler profile</div>
            <div className="text-lg font-black tracking-tight">Who is on this train</div>
          </div>
        </div>

        <div className="mt-5 rounded-[24px] border border-white/10 bg-white/8 p-4 backdrop-blur-sm">
          <div className="flex items-center justify-between text-sm text-white/70">
            <span>Coverage tracked</span>
            <span className="font-black tabular-nums text-white">{totalTypeCount || svc.totalCount}</span>
          </div>
          <div className="mt-3 grid gap-3">
            {svc.types.map((item, i) => (
              <TypeBar
                key={item.typ}
                typ={item.typ}
                count={item.count}
                total={Math.max(totalTypeCount, 1)}
                inView={inView}
                delay={0.18 + i * 0.05}
              />
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {svc.types.slice(0, 4).map((item, i) => (
            <TypeChip key={item.typ} typ={item.typ} count={item.count} inView={inView} delay={0.24 + i * 0.04} />
          ))}
        </div>

        <div className="mt-5 rounded-[24px] border border-white/10 bg-black/10 p-4">
          <div className="flex items-center gap-2 text-[#ffe082]">
            <Sparkles className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em]">Quick read</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-white/84">
            {leadClass
              ? `${classLabel(leadClass.cls)} is the lead cabin, and the traveler profile is weighted toward ${leadType?.label?.toLowerCase() ?? "core passengers"}.`
              : "Passenger segmentation is available, but class weighting is still refreshing."}
          </p>
        </div>
      </div>
    </div>
  )
}

export function TravelerSummaryCard({ result }: { readonly result: string }) {
  const { theme, compact } = useEurostarDisplay()
  const summary = parseTravelerSummary(result)
  if (!summary) return null

  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const [sel, setSel] = useState(0)
  const visibleServices = summary.services.slice(0, 18)
  const serviceIndex = Math.min(sel, Math.max(visibleServices.length - 1, 0))
  const svc = visibleServices[serviceIndex]
  const busiestService = [...summary.services].sort((a, b) => b.totalCount - a.totalCount)[0]

  const spring = (delay: number) => ({ type: "spring" as const, stiffness: 320, damping: 28, delay })

  return (
    <motion.div
      ref={ref}
      className={`${eurostarDisplayClass(theme, compact)} es-themed-panel relative w-full overflow-hidden rounded-[32px] bg-white`}
      style={{ boxShadow: "0 24px 70px rgba(0,51,102,0.18), 0 8px 20px rgba(15,23,42,0.12)" }}
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={spring(0)}
    >
      <EurostarDisplayStyles />
      <div className="absolute right-3 top-3 z-40">
        <EurostarDisplayMenu inverted />
      </div>

      <div
        className="relative overflow-hidden px-5 pb-6 pt-5 text-white"
        style={{ background: "linear-gradient(135deg, #001f4d 0%, #003388 46%, #005fd1 100%)" }}
      >
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.07) 50%, transparent 65%)" }}
          animate={{ x: ["-100%", "200%"] }}
          transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut", repeatDelay: 2.5 }}
        />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <motion.div
              className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm"
              whileHover={{ scale: 1.12, backgroundColor: "rgba(255,255,255,0.25)" }}
            >
              <Users className="h-5 w-5" />
            </motion.div>
            <div>
              <div className="text-base font-black leading-tight tracking-tight">Passenger Load</div>
              <div className="text-[11px] leading-tight text-white/60">{summary.date}</div>
            </div>
          </div>

          <div className="rounded-[24px] border border-white/12 bg-white/10 px-4 py-3 text-right backdrop-blur">
            <div className="mb-0.5 text-[11px] uppercase tracking-widest text-white/50">Total pax</div>
            <div className="text-4xl font-black leading-none tabular-nums" style={{ textShadow: "0 2px 16px rgba(255,215,0,0.4)", color: ES_GOLD }}>
              <CountUp to={summary.total} inView={inView} delay={0.1} />
            </div>
          </div>
        </div>

        <div className="relative mt-5 grid gap-3 md:grid-cols-3">
          <div className="rounded-[22px] border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/55">Services</div>
            <div className="mt-2 text-2xl font-black">{summary.services.length}</div>
          </div>
          <div className="rounded-[22px] border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/55">Busiest train</div>
            <div className="mt-2 text-lg font-black">{busiestService?.serviceCode ?? "--"}</div>
          </div>
          <div className="rounded-[22px] border border-white/12 bg-white/10 px-4 py-3 backdrop-blur">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/55">Peak load</div>
            <div className="mt-2 text-2xl font-black tabular-nums">{busiestService?.totalCount ?? 0}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[280px_minmax(0,1fr)]">
        <div className="border-b border-slate-200/80 bg-slate-50/80 p-4 xl:border-b-0 xl:border-r">
          <div className="mb-3 flex items-center gap-2 text-slate-500">
            <Train className="h-4 w-4" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Watched services</span>
          </div>
          <div className="space-y-2">
            {visibleServices.map((service, i) => (
              <button
                key={service.serviceCode}
                type="button"
                onClick={() => setSel(i)}
                className={cn(
                  "w-full rounded-[22px] border px-4 py-3 text-left transition-all",
                  i === serviceIndex
                    ? "border-[#9fc8ff] bg-white shadow-[0_12px_24px_rgba(0,51,102,0.10)]"
                    : "border-transparent bg-white/70 hover:border-slate-200 hover:bg-white",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-black tracking-tight text-slate-900">{service.serviceCode}</span>
                  <span className="text-sm font-black tabular-nums text-[#003366]">{service.totalCount}</span>
                </div>
                <div className="mt-1 text-xs font-medium text-slate-500">
                  {service.origin} to {service.destination}
                </div>
              </button>
            ))}
          </div>
          {summary.services.length > visibleServices.length && (
            <div className="mt-3 text-xs text-slate-400">
              Showing the first {visibleServices.length} services in the live selector.
            </div>
          )}
        </div>

        <div className="p-4 md:p-5">{svc ? <ServiceCard svc={svc} inView={inView} /> : null}</div>
      </div>
    </motion.div>
  )
}
