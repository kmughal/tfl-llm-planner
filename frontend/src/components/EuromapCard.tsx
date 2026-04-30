import "leaflet/dist/leaflet.css"
import { useState, useEffect, useRef } from "react"
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion"
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, useMap } from "react-leaflet"
import { Train, Clock } from "lucide-react"
import { cn } from "../lib/utils"

const ES_NAVY  = "#003366"
const ES_GOLD  = "#FFD700"
const ES_TRACK = "#003366"

// ── Types ─────────────────────────────────────────────────────────────────────
interface MapStation {
  shortCode: string
  stopType:  string
  lat:       number
  lng:       number
  dep:       string
  arr:       string
  name:      string
}

interface EuromapPlan {
  planID:      string
  planType:    string
  serviceCode: string
  status:      string
  dep:         string
  arr:         string
  travelDate?: string
  originCode?: string
  destCode?:   string
  stations:    MapStation[]
  isTechnical: boolean
}

interface StatusSummary {
  date:           string
  total:          number
  active:         number
  cancelled:      number
  outbound:       number
  inbound:        number
  firstDep:       string
  lastDep:        string
  cancelledCodes: string[]
}

// ── Parsers ───────────────────────────────────────────────────────────────────
function parseResult(raw: string): EuromapPlan[] {
  const plans: EuromapPlan[] = []
  let cur: EuromapPlan | null = null

  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (t.startsWith("PLAN_START:")) {
      const p = t.slice("PLAN_START:".length).split("|")
      cur = { planID: p[0] ?? "", planType: p[1] ?? "", serviceCode: p[2] ?? "",
              status: p[3] ?? "", dep: p[4] ?? "", arr: p[5] ?? "",
              stations: [], isTechnical: false }
    } else if (t.startsWith("TECH_PLAN_START:")) {
      const p = t.slice("TECH_PLAN_START:".length).split("|")
      cur = { planID: p[0] ?? "", planType: p[1] ?? "", serviceCode: p[2] ?? "",
              status: p[3] ?? "", dep: "", arr: "",
              travelDate: p[4] ?? "", originCode: p[5] ?? "", destCode: p[6] ?? "",
              stations: [], isTechnical: true }
    } else if ((t === "PLAN_END" || t === "TECH_PLAN_END") && cur) {
      plans.push(cur); cur = null
    } else if (t.startsWith("MAP_STATION:") && cur) {
      const p = t.slice("MAP_STATION:".length).split("|")
      const lat = Number.parseFloat(p[2] ?? "0")
      const lng = Number.parseFloat(p[3] ?? "0")
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        cur.stations.push({ shortCode: p[0] ?? "", stopType: p[1] ?? "",
          lat, lng, dep: p[4] ?? "", arr: p[5] ?? "", name: p[6] ?? "" })
      }
    }
  }
  return plans
}

function parseStatusSummary(raw: string): StatusSummary | null {
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (t.startsWith("STATUS_SUMMARY_START:")) {
      const p = t.slice("STATUS_SUMMARY_START:".length).split("|")
      return {
        date:           p[0] ?? "",
        total:          Number(p[1] ?? 0),
        active:         Number(p[2] ?? 0),
        cancelled:      Number(p[3] ?? 0),
        outbound:       Number(p[4] ?? 0),
        inbound:        Number(p[5] ?? 0),
        firstDep:       p[6] ?? "",
        lastDep:        p[7] ?? "",
        cancelledCodes: (p[8] ?? "").split(",").filter(Boolean),
      }
    }
  }
  return null
}

// ── Fit-bounds helper ─────────────────────────────────────────────────────────
function FitBounds({ positions }: { readonly positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 0) map.fitBounds(positions, { padding: [28, 28] })
  }, [map, positions])
  return null
}

// ── Stop-type helpers (extracted to reduce StationStop complexity) ─────────────
function stopTypeLabel(stopType: string): string {
  return stopType === "passThrough" || stopType === "pass" ? "pass" : stopType
}

function stopTypeClass(stopType: string): string {
  if (stopType === "origin")      return "bg-emerald-50 text-emerald-700"
  if (stopType === "destination") return "bg-blue-50 text-blue-700"
  return "bg-gray-100 text-gray-500"
}

function StationDotIcon({ isTerminal }: { readonly isTerminal: boolean }) {
  if (isTerminal) return <Train className="w-3 h-3 text-white" />
  return <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ES_NAVY }} />
}

// ── Animated station stop ─────────────────────────────────────────────────────
function StationStop({
  station, index, total, inView,
}: {
  readonly station: MapStation
  readonly index:   number
  readonly total:   number
  readonly inView:  boolean
}) {
  const isFirst    = index === 0
  const isLast     = index === total - 1
  const isTerminal = isFirst || isLast
  const delay      = index * 0.12
  const time       = station.dep || station.arr

  return (
    <motion.div
      className="flex items-stretch gap-3"
      initial={{ opacity: 0, x: -14 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ delay, duration: 0.3, ease: "easeOut" }}
    >
      {/* Track column */}
      <div className="flex flex-col items-center" style={{ width: 28 }}>
        <motion.div
          className="relative z-10 rounded-full flex items-center justify-center shrink-0"
          style={{
            width:  isTerminal ? 26 : 18,
            height: isTerminal ? 26 : 18,
            backgroundColor: isTerminal ? ES_NAVY : "#fff",
            border: `2.5px solid ${ES_NAVY}`,
            boxShadow: isTerminal
              ? `0 0 0 4px ${ES_NAVY}22, 0 2px 8px ${ES_NAVY}40`
              : `0 0 0 3px ${ES_NAVY}14`,
          }}
          initial={{ scale: 0 }}
          animate={inView ? { scale: 1 } : {}}
          transition={{ delay, type: "spring", stiffness: 520, damping: 18 }}
          whileHover={{ scale: 1.25, boxShadow: `0 0 0 7px ${ES_NAVY}30` }}
        >
          <StationDotIcon isTerminal={isTerminal} />
        </motion.div>

        {!isLast && (
          <motion.div
            className="flex-1 rounded-full"
            style={{ width: 2, backgroundColor: `${ES_TRACK}30`, minHeight: 20, marginTop: 3, marginBottom: 3 }}
            initial={{ scaleY: 0, originY: "top" }}
            animate={inView ? { scaleY: 1 } : {}}
            transition={{ delay: delay + 0.15, duration: 0.25 }}
          >
            {isFirst && (
              <motion.div
                className="w-full rounded-full"
                style={{ height: 6, backgroundColor: ES_GOLD }}
                animate={{ y: [0, 18, 0] }}
                transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut", delay: 0.5 }}
              />
            )}
          </motion.div>
        )}
      </div>

      {/* Station info */}
      <motion.div
        className={cn("flex flex-col pb-4 min-w-0", isLast && "pb-0")}
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ delay: delay + 0.1, duration: 0.25 }}
      >
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-sm leading-snug"
            style={{ fontWeight: isTerminal ? 700 : 500, color: isTerminal ? "#111827" : "#374151" }}
          >
            {station.name || station.shortCode}
          </span>
          {station.name && station.name !== station.shortCode && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase"
              style={{ backgroundColor: isTerminal ? ES_NAVY : "#f3f4f6", color: isTerminal ? "#fff" : "#6b7280" }}
            >
              {station.shortCode}
            </span>
          )}
          <span className={cn("text-[9px] font-semibold px-1.5 py-0.5 rounded-full capitalize", stopTypeClass(station.stopType))}>
            {stopTypeLabel(station.stopType)}
          </span>
        </div>

        {time && (
          <div className="flex items-center gap-1 mt-0.5">
            <Clock className="w-2.5 h-2.5 text-gray-400 shrink-0" />
            {station.dep && (
              <span className="text-[11px] tabular-nums text-gray-500">
                dep <span className="font-semibold text-gray-700">{station.dep}</span>
              </span>
            )}
            {station.dep && station.arr && <span className="text-gray-300 text-[10px]">·</span>}
            {station.arr && (
              <span className="text-[11px] tabular-nums text-gray-500">
                arr <span className="font-semibold text-gray-700">{station.arr}</span>
              </span>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

// ── Status summary card sub-components ───────────────────────────────────────
// ── Animated counter ──────────────────────────────────────────────────────────
function CountUp({ to, inView, delay = 0 }: { readonly to: number; readonly inView: boolean; readonly delay?: number }) {
  const mv  = useMotionValue(0)
  const val = useTransform(mv, v => Math.round(v))
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    const unsub = val.on("change", v => setDisplay(v))
    return unsub
  }, [val])

  useEffect(() => {
    if (!inView) return
    const ctrl = animate(mv, to, { duration: 1.2, delay, ease: [0.16, 1, 0.3, 1] })
    return () => ctrl.stop()
  }, [inView, to, delay, mv])

  return <>{display}</>
}

// ── StatusSummaryCard ─────────────────────────────────────────────────────────
function StatusSummaryCard({ summary }: { readonly summary: StatusSummary }) {
  const ref        = useRef<HTMLDivElement>(null)
  const inView     = useInView(ref, { once: true, margin: "-40px" })
  const activeRate = summary.total > 0 ? (summary.active / summary.total) * 100 : 0
  const cancelRate = 100 - activeRate

  const spring = (delay: number) => ({ type: "spring" as const, stiffness: 320, damping: 28, delay })

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
        className="relative px-5 pt-5 pb-6 text-white overflow-hidden"
        style={{ background: `linear-gradient(135deg, #001f4d 0%, #003388 60%, #004db3 100%)` }}
      >
        {/* shimmer sweep */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.07) 50%, transparent 65%)" }}
          animate={{ x: ["-100%", "200%"] }}
          transition={{ repeat: Infinity, duration: 3.2, ease: "easeInOut", repeatDelay: 2 }}
        />

        {/* top row */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur-sm"
              whileHover={{ scale: 1.12, backgroundColor: "rgba(255,255,255,0.25)" }}
            >
              <Train className="w-5 h-5" />
            </motion.div>
            <div>
              <div className="font-black text-base leading-tight tracking-tight">Eurostar</div>
              <div className="text-[11px] text-white/60 leading-tight">{summary.date}</div>
            </div>
          </div>

          {/* pulsing LIVE badge */}
          <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1">
            <motion.span
              className="w-2 h-2 rounded-full bg-emerald-400"
              animate={{ opacity: [1, 0.3, 1], scale: [1, 1.4, 1] }}
              transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
            />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Live</span>
          </div>
        </div>

        {/* big total + health bar */}
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="text-[11px] text-white/50 uppercase tracking-widest mb-0.5">Services today</div>
            <div className="text-5xl font-black tabular-nums leading-none" style={{ textShadow: "0 2px 20px rgba(255,215,0,0.3)" }}>
              <CountUp to={summary.total} inView={inView} />
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-white/50 uppercase tracking-widest mb-0.5">On time</div>
            <div className="text-2xl font-black tabular-nums" style={{ color: ES_GOLD }}>
              <CountUp to={Math.round(activeRate)} inView={inView} delay={0.3} />%
            </div>
          </div>
        </div>

        {/* health bar */}
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, #10b981, ${ES_GOLD})` }}
            initial={{ width: 0 }}
            animate={inView ? { width: `${activeRate}%` } : {}}
            transition={{ delay: 0.5, duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">

        {/* ── Active / Cancelled ── */}
        <div className="grid grid-cols-2 gap-3">
          {/* Active */}
          <motion.div
            className="relative rounded-xl p-4 overflow-hidden"
            style={{ background: "linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)", border: "1px solid #a7f3d0" }}
            initial={{ opacity: 0, x: -16 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={spring(0.15)}
            whileHover={{ scale: 1.02 }}
          >
            <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-emerald-200/40" />
            <div className="text-3xl font-black tabular-nums text-emerald-600 leading-none">
              <CountUp to={summary.active} inView={inView} delay={0.2} />
            </div>
            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 mt-1">Active</div>
            <div className="mt-2 h-1 rounded-full bg-emerald-200 overflow-hidden">
              <motion.div className="h-full rounded-full bg-emerald-500"
                initial={{ width: 0 }}
                animate={inView ? { width: `${activeRate}%` } : {}}
                transition={{ delay: 0.6, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </motion.div>

          {/* Cancelled */}
          <motion.div
            className="relative rounded-xl p-4 overflow-hidden"
            style={{
              background: summary.cancelled > 0
                ? "linear-gradient(135deg, #fff1f2 0%, #ffe4e6 100%)"
                : "linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%)",
              border: summary.cancelled > 0 ? "1px solid #fda4af" : "1px solid #e5e7eb",
            }}
            initial={{ opacity: 0, x: 16 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={spring(0.2)}
            whileHover={{ scale: 1.02 }}
          >
            <div className="absolute -right-3 -top-3 w-16 h-16 rounded-full bg-red-200/30" />
            <div className={cn("text-3xl font-black tabular-nums leading-none", summary.cancelled > 0 ? "text-red-500" : "text-gray-400")}>
              <CountUp to={summary.cancelled} inView={inView} delay={0.25} />
            </div>
            <div className={cn("text-[10px] font-bold uppercase tracking-widest mt-1", summary.cancelled > 0 ? "text-red-400" : "text-gray-400")}>
              Cancelled
            </div>
            <div className="mt-2 h-1 rounded-full bg-red-100 overflow-hidden">
              <motion.div className="h-full rounded-full bg-red-400"
                initial={{ width: 0 }}
                animate={inView ? { width: `${cancelRate}%` } : {}}
                transition={{ delay: 0.65, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </motion.div>
        </div>

        {/* ── Direction split ── */}
        <motion.div
          className="rounded-xl p-4"
          style={{ background: "linear-gradient(135deg, #f8faff 0%, #eef2ff 100%)", border: "1px solid #c7d2fe" }}
          initial={{ opacity: 0, y: 12 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={spring(0.3)}
        >
          <div className="text-[10px] font-black uppercase tracking-widest mb-3" style={{ color: ES_NAVY }}>
            Direction split
          </div>
          {[
            { label: "UK → Europe", count: summary.outbound, color: ES_NAVY, delay: 0.5 },
            { label: "Europe → UK", count: summary.inbound,  color: ES_GOLD, delay: 0.6 },
          ].map(({ label, count, color, delay }) => {
            const pct = summary.total > 0 ? (count / summary.total) * 100 : 0
            return (
              <div key={label} className="mb-2 last:mb-0">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-[11px] font-semibold" style={{ color: ES_NAVY }}>{label}</span>
                  <span className="text-[11px] font-black tabular-nums" style={{ color }}>{count}</span>
                </div>
                <div className="h-2.5 rounded-full bg-white/70 overflow-hidden" style={{ boxShadow: "inset 0 1px 3px rgba(0,0,0,0.08)" }}>
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: color }}
                    initial={{ width: 0 }}
                    animate={inView ? { width: `${pct}%` } : {}}
                    transition={{ delay, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              </div>
            )
          })}
        </motion.div>

        {/* ── First / last departure ── */}
        {(summary.firstDep || summary.lastDep) && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "First departure", time: summary.firstDep, icon: "🌅" },
              { label: "Last departure",  time: summary.lastDep,  icon: "🌙" },
            ].map(({ label, time, icon }, i) => (
              <motion.div
                key={label}
                className="rounded-xl p-3 text-center"
                style={{ background: "linear-gradient(135deg, #f8faff, #eef2ff)", border: `1px solid ${ES_NAVY}22` }}
                initial={{ opacity: 0, y: 10 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={spring(0.35 + i * 0.08)}
                whileHover={{ scale: 1.04, boxShadow: `0 4px 20px ${ES_NAVY}22` }}
              >
                <div className="text-lg mb-0.5">{icon}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
                <div className="text-xl font-black tabular-nums mt-0.5" style={{ color: ES_NAVY }}>{time || "—"}</div>
              </motion.div>
            ))}
          </div>
        )}

        {/* ── Cancelled service badges ── */}
        {summary.cancelledCodes.length > 0 && (
          <motion.div
            className="rounded-xl p-3"
            style={{ background: "#fff1f2", border: "1px solid #fda4af" }}
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={spring(0.45)}
          >
            <div className="flex items-center gap-1.5 mb-2">
              <motion.span
                className="w-1.5 h-1.5 rounded-full bg-red-500"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ repeat: Infinity, duration: 1.2 }}
              />
              <span className="text-[10px] font-black uppercase tracking-widest text-red-500">
                Cancelled · {summary.cancelledCodes.length}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {summary.cancelledCodes.map((code, i) => (
                <motion.span
                  key={code}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white text-red-500 border border-red-200 cursor-default"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={inView ? { opacity: 1, scale: 1 } : {}}
                  transition={{ delay: 0.5 + i * 0.025, type: "spring", stiffness: 400, damping: 20 }}
                  whileHover={{ scale: 1.15, backgroundColor: "#fee2e2" }}
                >
                  {code}
                </motion.span>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  )
}

// ── Plan card (all hooks unconditional) ──────────────────────────────────────
function PlanCard({ plans }: { readonly plans: EuromapPlan[] }) {
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inView  = useInView(listRef, { once: true, margin: "-40px" })

  const plan      = plans[Math.min(sel, plans.length - 1)]
  const positions = plan.stations.map((s): [number, number] => [s.lat, s.lng])
  const center: [number, number] = positions.length > 0
    ? [
        positions.reduce((a, p) => a + p[0], 0) / positions.length,
        positions.reduce((a, p) => a + p[1], 0) / positions.length,
      ]
    : [51, 0.5]

  return (
    <div className="rounded-xl overflow-hidden border border-[#003366]/20 shadow-md bg-white w-full">

      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 text-white"
        style={{ background: `linear-gradient(135deg, ${ES_NAVY} 0%, #004a99 100%)` }}
      >
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
            <Train className="w-4 h-4" />
          </div>
          <div>
            <div className="font-bold text-sm leading-none">Eurostar</div>
            <div className="text-[10px] text-white/70 leading-none mt-0.5">
              {plan.isTechnical ? "Technical Plans" : "Service Plans"}
            </div>
          </div>
        </div>
        <span className="text-[11px] bg-white/20 rounded-full px-2.5 py-0.5 font-semibold">
          {plans.length} service{plans.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Service tabs */}
      {plans.length > 1 && (
        <div className="flex overflow-x-auto border-b border-gray-100 bg-gray-50">
          {plans.map((p, i) => (
            <button
              key={p.planID}
              type="button"
              onClick={() => setSel(i)}
              className={cn(
                "px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors",
                i === sel
                  ? "border-[#003366] text-[#003366] bg-white"
                  : "border-transparent text-gray-400 hover:text-gray-600",
              )}
            >
              {p.serviceCode}
            </button>
          ))}
        </div>
      )}

      {/* Plan summary bar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-100 text-xs bg-[#f8faff]">
        <span className="font-bold text-gray-800">{plan.planID}</span>
        <span className="text-gray-400 capitalize">{plan.planType}</span>
        <span className={cn(
          "rounded-full px-2 py-0.5 font-bold text-[10px]",
          plan.status === "active" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700",
        )}>
          ● {plan.status}
        </span>
        {(plan.dep || plan.arr) && (
          <span className="ml-auto flex items-center gap-1 font-bold tabular-nums" style={{ color: ES_NAVY }}>
            <Clock className="w-3 h-3" />
            {plan.dep} → {plan.arr}
          </span>
        )}
        {plan.travelDate && <span className="ml-auto text-gray-400">{plan.travelDate}</span>}
      </div>

      <div className="flex flex-col md:flex-row">
        {/* Animated stop list */}
        <div ref={listRef} className="flex-1 px-4 py-4 border-r border-gray-100 min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-3 flex items-center gap-1.5">
            <Train className="w-3 h-3" /> Route · {plan.stations.length} stops
          </div>
          {plan.stations.map((s, i) => (
            <StationStop
              key={`${s.shortCode}-${i}`}
              station={s}
              index={i}
              total={plan.stations.length}
              inView={inView}
            />
          ))}
        </div>

        {/* Leaflet map */}
        {positions.length > 0 && (
          <div className="flex-1 min-h-[260px]" style={{ minWidth: 0 }}>
            <MapContainer
              center={center}
              zoom={6}
              style={{ height: "100%", minHeight: 260, width: "100%" }}
              scrollWheelZoom={false}
            >
              <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution="© OpenStreetMap contributors"
              />
              <FitBounds positions={positions} />
              <Polyline positions={positions} color={ES_NAVY} weight={3} opacity={0.8} />
              {plan.stations.map((s, i) => {
                const terminal = s.stopType === "origin" || s.stopType === "destination"
                return (
                  <CircleMarker
                    key={`m-${s.shortCode}-${i}`}
                    center={[s.lat, s.lng]}
                    radius={terminal ? 9 : 6}
                    fillColor={terminal ? ES_NAVY : "#fff"}
                    color={ES_NAVY}
                    weight={2.5}
                    fillOpacity={1}
                  >
                    <Popup>
                      <div style={{ minWidth: 120 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: ES_NAVY }}>
                          {s.name || s.shortCode}
                        </div>
                        <div style={{ color: "#6b7280", fontSize: 11, textTransform: "capitalize" }}>
                          {s.stopType}
                        </div>
                        {s.dep && <div style={{ fontSize: 11 }}>Dep {s.dep}</div>}
                        {s.arr && <div style={{ fontSize: 11 }}>Arr {s.arr}</div>}
                      </div>
                    </Popup>
                  </CircleMarker>
                )
              })}
            </MapContainer>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function EuromapCard({ result }: { readonly result: string }) {
  const summary = parseStatusSummary(result)
  if (summary) return <StatusSummaryCard summary={summary} />

  const plans = parseResult(result)
  if (plans.length === 0) return null
  return <PlanCard plans={plans} />
}
