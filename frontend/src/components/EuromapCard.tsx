import { useState, useEffect, useRef } from "react"
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion"
import { Train } from "lucide-react"
import { cn } from "../lib/utils"
import { EurostarDisplayMenu, EurostarDisplayStyles, eurostarDisplayClass, useEurostarDisplay } from "./EurostarDisplay"

const ES_NAVY  = "#003366"
const ES_GOLD  = "#FFD700"
const MC_BG    = "#020c23"
const MC_CYAN  = "#00d4ff"

const STATION_SLUG: Record<string, string> = {
  SPX: "london", PNO: "paris", BRU: "brussels", BXS: "brussels",
  AMS: "amsterdam", ASD: "amsterdam", RDM: "rotterdam", RTD: "rotterdam",
  LEW: "lille", LIL: "lille", EBF: "ebbsfleet", EBD: "ebbsfleet",
  FTN: "calais-frethun", MVC: "marne-la-vallee", LIE: "liege",
}

function planDate(planID: string): string {
  const d = planID.slice(0, 8)
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : ""
}

function bookingUrl(fromCode: string, toCode: string, date: string): string {
  const from = STATION_SLUG[fromCode.toUpperCase()] ?? fromCode.toLowerCase()
  const to   = STATION_SLUG[toCode.toUpperCase()]   ?? toCode.toLowerCase()
  return `https://www.eurostar.com/rw-en/train-tickets/${from}-to-${to}/${date}`
}

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

// ── Crew types ────────────────────────────────────────────────────────────────
interface CrewMember {
  crewType:    string
  crewId:      string
  firstName:   string
  lastName:    string
  origin:      string
  destination: string
  dep:         string
  arr:         string
}

// ── Parsers ───────────────────────────────────────────────────────────────────
function parseDayCrew(raw: string): CrewMember[] {
  const crew: CrewMember[] = []
  const seen = new Set<string>()
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t.startsWith("CREW_ROW:")) continue
    const p = t.slice("CREW_ROW:".length).split("|")
    if (p.length < 11) continue
    const key = `${p[1]}-${p[7]}-${p[8]}`
    if (seen.has(key)) continue
    seen.add(key)
    crew.push({
      crewType: p[0], crewId: p[1], firstName: p[2], lastName: p[3],
      origin: p[7], destination: p[8], dep: p[9], arr: p[10].trim(),
    })
  }
  return crew
}

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
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/80">Schedule</span>
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
            <div className="text-[11px] text-white/50 uppercase tracking-widest mb-0.5">Active share</div>
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

// ── Station style lookup ──────────────────────────────────────────────────────
interface StnStyle { grad: string; icon: string; city: string }
const STN_STYLE: Record<string, StnStyle> = {
  SPX: { grad: "linear-gradient(135deg,#0d3a52 0%,#1a5c3a 100%)", icon: "🏛",  city: "London" },
  EBF: { grad: "linear-gradient(135deg,#0d2a40 0%,#0d3a30 100%)", icon: "🚉",  city: "Ebbsfleet" },
  EBD: { grad: "linear-gradient(135deg,#0d2a40 0%,#0d3a30 100%)", icon: "🚉",  city: "Ebbsfleet" },
  ASI: { grad: "linear-gradient(135deg,#0d2a38 0%,#1a3a2a 100%)", icon: "🚉",  city: "Ashford" },
  FTN: { grad: "linear-gradient(135deg,#1a3040 0%,#0d3a40 100%)", icon: "⚓",  city: "Calais" },
  LEW: { grad: "linear-gradient(135deg,#3a0d52 0%,#260d4a 100%)", icon: "🎡",  city: "Lille" },
  LIL: { grad: "linear-gradient(135deg,#3a0d52 0%,#260d4a 100%)", icon: "🎡",  city: "Lille" },
  MVC: { grad: "linear-gradient(135deg,#3a2d0d 0%,#1a0d3a 100%)", icon: "🏰",  city: "Marne-la-Vallée" },
  BRU: { grad: "linear-gradient(135deg,#0d265c 0%,#0d4a52 100%)", icon: "🏰",  city: "Brussels" },
  BXS: { grad: "linear-gradient(135deg,#0d265c 0%,#0d4a52 100%)", icon: "🏰",  city: "Brussels" },
  LIE: { grad: "linear-gradient(135deg,#3a1a0d 0%,#2a0d3a 100%)", icon: "🏰",  city: "Liège" },
  AMS: { grad: "linear-gradient(135deg,#0d3a1a 0%,#0d2a40 100%)", icon: "🌷",  city: "Amsterdam" },
  ASD: { grad: "linear-gradient(135deg,#0d3a1a 0%,#0d2a40 100%)", icon: "🌷",  city: "Amsterdam" },
  RTD: { grad: "linear-gradient(135deg,#0d2a40 0%,#1a3a40 100%)", icon: "⚓",  city: "Rotterdam" },
  RDM: { grad: "linear-gradient(135deg,#0d2a40 0%,#1a3a40 100%)", icon: "⚓",  city: "Rotterdam" },
  KOL: { grad: "linear-gradient(135deg,#0d1a3a 0%,#2a0d3a 100%)", icon: "⛪",  city: "Cologne" },
  AAH: { grad: "linear-gradient(135deg,#1a0d3a 0%,#2a1a0d 100%)", icon: "🏛",  city: "Aachen" },
  AAC: { grad: "linear-gradient(135deg,#1a0d3a 0%,#2a1a0d 100%)", icon: "🏛",  city: "Aachen" },
  PNO: { grad: "linear-gradient(135deg,#52260d 0%,#4a3a0d 100%)", icon: "🗼",  city: "Paris" },
  WNH: { grad: "linear-gradient(135deg,#1a1a40 0%,#0d2a40 100%)", icon: "🚉",  city: "Woippy" },
}
function stnStyle(code: string): StnStyle {
  return STN_STYLE[code.toUpperCase()] ?? { grad: "linear-gradient(135deg,#0d1a30 0%,#0a1220 100%)", icon: "🚉", city: code }
}

// ── Journey stage card (left column) ─────────────────────────────────────────
function StopCard({
  station, index, inView,
}: { readonly station: MapStation; readonly index: number; readonly inView: boolean }) {
  const isTerminal = station.stopType === "origin" || station.stopType === "destination"
  const isPass     = station.stopType === "passThrough" || station.stopType === "pass"
  const st         = stnStyle(station.shortCode)
  const city       = station.name && station.name !== station.shortCode ? station.name : st.city

  return (
    <motion.div
      className="rounded-xl overflow-hidden"
      style={{
        background: st.grad,
        border:     `1px solid rgba(255,255,255,${isTerminal ? 0.18 : 0.08})`,
        opacity:    isPass ? 0.55 : 1,
        marginBottom: isTerminal ? 0 : 0,
      }}
      initial={{ opacity: 0, x: -20, scale: 0.96 }}
      animate={inView ? { opacity: isPass ? 0.55 : 1, x: 0, scale: 1 } : {}}
      transition={{ delay: index * 0.08, type: "spring", stiffness: 380, damping: 26 }}
      whileHover={isPass ? {} : { scale: 1.02, boxShadow: "0 8px 28px rgba(0,0,0,0.5)" }}
    >
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Landmark icon */}
        <div className="text-2xl shrink-0 leading-none">{st.icon}</div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div
            className="font-black text-xs leading-tight truncate"
            style={{ color: isTerminal ? "white" : "rgba(255,255,255,0.75)" }}
          >
            {city.toUpperCase()}
          </div>
          <div className="text-[9px] font-mono mt-px" style={{ color: "rgba(255,255,255,0.38)" }}>
            {station.shortCode}
            {!isTerminal && !isPass && (
              <span className="ml-1.5 capitalize" style={{ color: "rgba(255,255,255,0.3)" }}>
                {station.stopType}
              </span>
            )}
          </div>
          {(station.dep || station.arr) && (
            <div className="flex items-center gap-2 mt-1">
              {station.dep && (
                <span className="text-[11px] font-black tabular-nums" style={{ color: ES_GOLD }}>
                  {station.dep}
                </span>
              )}
              {station.dep && station.arr && (
                <span className="text-[8px]" style={{ color: "rgba(255,255,255,0.25)" }}>arr {station.arr}</span>
              )}
              {!station.dep && station.arr && (
                <span className="text-[11px] font-black tabular-nums" style={{ color: "rgba(255,255,255,0.7)" }}>
                  arr {station.arr}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Status badge for terminals */}
        {isTerminal && (
          <div className="shrink-0">
            <div
              className="text-[8px] font-black px-1.5 py-0.5 rounded-full"
              style={{ background: "rgba(16,185,129,0.2)", color: "#34d399", border: "1px solid rgba(16,185,129,0.3)" }}
            >
              ● On Time
            </div>
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Journey Stage PlanCard ─────────────────────────────────────────────────────
function PlanCard({ plans, crewResult, selection }: { readonly plans: EuromapPlan[]; readonly crewResult?: string; readonly selection?: "first" | "last" }) {
  const [sel, setSel] = useState(0)
  const cardRef = useRef<HTMLDivElement>(null)
  const inView  = useInView(cardRef, { once: true, margin: "-60px" })
  const allCrew = crewResult ? parseDayCrew(crewResult) : []

  const plan   = plans[Math.min(sel, plans.length - 1)]
  const stns   = plan.stations
  const origin = stns.find(s => s.stopType === "origin")
  const dest   = stns.find(s => s.stopType === "destination")
  const bDate  = plan.travelDate ?? planDate(plan.planID)
  const bUrl   = origin && dest && bDate ? bookingUrl(origin.shortCode, dest.shortCode, bDate) : null

  return (
    <div
      ref={cardRef}
      className="rounded-2xl overflow-hidden w-full select-none"
      style={{
        background: "linear-gradient(160deg, #080f1e 0%, #0a1628 55%, #080f1e 100%)",
        border:     "1px solid rgba(255,255,255,0.07)",
        boxShadow:  "0 32px 80px rgba(0,0,0,0.8)",
      }}
    >
      {selection && (
        <div className="flex flex-wrap items-center gap-4 px-5 py-4" style={{ background:"linear-gradient(90deg,#c9a227,#e3b93f)", color:"#07101f" }}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/10 text-xl">{selection === "last" ? "↓" : "↑"}</div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.18em]">{selection === "last" ? "Last departure" : "First departure"}</div>
            <div className="truncate text-sm font-black">{origin?.name || origin?.shortCode} → {dest?.name || dest?.shortCode}</div>
          </div>
          <div className="text-right"><div className="text-[9px] font-bold uppercase opacity-60">Service {plan.serviceCode}</div><div className="text-3xl font-black tabular-nums">{origin?.dep || plan.dep || "—"}</div></div>
        </div>
      )}
      {/* ── Header ── */}
      <div
        className="relative flex items-center justify-between px-5 py-3 overflow-hidden"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      >
        {/* Shimmer sweep */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.03) 50%,transparent 60%)" }}
          animate={{ x: ["-100%","200%"] }}
          transition={{ repeat: Infinity, duration: 5, ease: "easeInOut", repeatDelay: 4 }}
        />
        {/* Left: Eurostar e + journey label */}
        <div className="flex items-center gap-3 z-10">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm shrink-0"
            style={{ background: "linear-gradient(135deg,#003366 0%,#0055cc 100%)", color: ES_GOLD }}
          >
            e
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-widest font-bold" style={{ color: "rgba(255,255,255,0.35)" }}>
              {plan.isTechnical ? "Technical Plan" : "Journey"}
            </div>
            <div className="font-black text-sm text-white leading-tight">
              {origin?.name || origin?.shortCode || "—"}
              <span className="mx-1.5" style={{ color: MC_CYAN }}>→</span>
              {dest?.name || dest?.shortCode || "—"}
            </div>
          </div>
        </div>
        {/* Right: plan ID + status + times */}
        <div className="flex items-center gap-2.5 z-10">
          <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.25)" }}>{plan.planID}</span>
          <span
            className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wide"
            style={{
              background: plan.status === "active" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
              color:      plan.status === "active" ? "#34d399" : "#fbbf24",
              border:     `1px solid ${plan.status === "active" ? "#34d39940" : "#fbbf2440"}`,
            }}
          >
            ● {plan.status}
          </span>
          {(plan.dep || plan.arr) && (
            <div className="font-black text-sm tabular-nums text-white">
              {plan.dep}<span style={{ color: MC_CYAN, margin: "0 4px" }}>→</span>{plan.arr}
            </div>
          )}
        </div>
      </div>

      {/* ── Service tabs (multi-plan) ── */}
      {plans.length > 1 && (
        <div className="flex overflow-x-auto" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {plans.map((p, i) => (
            <button
              key={p.planID} type="button" onClick={() => setSel(i)}
              className="px-4 py-2 text-xs font-bold whitespace-nowrap transition-all"
              style={{
                color:        i === sel ? MC_CYAN : "rgba(255,255,255,0.3)",
                borderBottom: `2px solid ${i === sel ? MC_CYAN : "transparent"}`,
                background:   i === sel ? "rgba(0,212,255,0.05)" : "transparent",
              }}
            >
              {p.serviceCode}
            </button>
          ))}
        </div>
      )}

      {/* ── Body: Journey cards + route line + service panel ── */}
      <div
        className="p-4"
        style={{ display: "grid", gridTemplateColumns: "1fr 36px 1fr", gap: "0 8px", alignItems: "start" }}
      >
        {/* Left: stop cards */}
        <div className="flex flex-col gap-2">
          {stns.map((s, i) => (
            <StopCard key={`sc-${s.shortCode}-${i}`} station={s} index={i} inView={inView} />
          ))}
        </div>

        {/* Center: animated route line */}
        <div className="flex flex-col items-center" style={{ paddingTop: 18 }}>
          {stns.map((s, i) => {
            const isTerminal = s.stopType === "origin" || s.stopType === "destination"
            const isPass     = s.stopType === "passThrough" || s.stopType === "pass"
            const dotR       = isTerminal ? 10 : isPass ? 5 : 7
            const dotColor   = isTerminal ? ES_GOLD : isPass ? "rgba(255,255,255,0.2)" : MC_CYAN
            const isLast     = i === stns.length - 1
            const crewHere   = allCrew.filter(m => m.origin === s.shortCode)

            return (
              <div key={`rc-${s.shortCode}-${i}`} className="flex flex-col items-center w-full" style={{ flex: "1 0 auto" }}>
                {/* Dot */}
                <motion.div
                  className="rounded-full shrink-0 relative"
                  style={{
                    width:  dotR * 2,
                    height: dotR * 2,
                    background:  isTerminal ? ES_GOLD : isPass ? "rgba(255,255,255,0.12)" : MC_BG,
                    border:      `2px solid ${dotColor}`,
                    boxShadow:   isTerminal ? `0 0 12px ${ES_GOLD}80` : !isPass ? `0 0 8px ${MC_CYAN}50` : "none",
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={inView ? { scale: 1, opacity: 1 } : {}}
                  transition={{ delay: 0.3 + i * 0.1, type: "spring", stiffness: 500, damping: 22 }}
                >
                  {/* Crew count badge */}
                  {crewHere.length > 0 && (
                    <div
                      className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-black"
                      style={{ background: ES_GOLD, color: MC_BG, zIndex: 2 }}
                    >
                      {crewHere.length}
                    </div>
                  )}
                  {/* Pulse for terminals */}
                  {isTerminal && (
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{ border: `2px solid ${ES_GOLD}` }}
                      animate={{ scale: [1, 1.7, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ repeat: Infinity, duration: 2.5, delay: i * 0.2 }}
                    />
                  )}
                </motion.div>

                {/* Connecting line */}
                {!isLast && (
                  <motion.div
                    className="w-0.5 rounded-full"
                    style={{
                      background: `linear-gradient(180deg, ${isTerminal ? ES_GOLD : MC_CYAN}60 0%, rgba(0,212,255,0.2) 100%)`,
                      minHeight: 32,
                      flex: "1 0 32px",
                    }}
                    initial={{ scaleY: 0, originY: "top" }}
                    animate={inView ? { scaleY: 1 } : {}}
                    transition={{ delay: 0.4 + i * 0.1, duration: 0.3 }}
                  />
                )}
              </div>
            )
          })}
        </div>

        {/* Right: service info panel */}
        <div className="flex flex-col gap-3 pt-1">

          {/* Journey summary card */}
          <div
            className="rounded-xl p-3"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
          >
            <div className="text-[8px] uppercase tracking-widest font-bold mb-1.5" style={{ color: "rgba(255,255,255,0.28)" }}>
              Route overview
            </div>
            {(plan.dep || plan.arr) && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl font-black tabular-nums text-white">{plan.dep || "—"}</span>
                <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${ES_GOLD}80, ${MC_CYAN}80)` }} />
                <span className="text-xl font-black tabular-nums text-white">{plan.arr || "—"}</span>
              </div>
            )}
            <div className="flex gap-1 flex-wrap">
              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                {plan.planID}
              </span>
              <span className="text-[9px] capitalize px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                {plan.planType || "commercial"}
              </span>
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{
                  background: plan.status === "active" ? "rgba(16,185,129,0.15)" : "rgba(245,158,11,0.15)",
                  color:      plan.status === "active" ? "#34d399" : "#fbbf24",
                }}
              >
                ● {plan.status}
              </span>
            </div>
          </div>

          {/* Stops count */}
          <div
            className="rounded-xl p-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="text-[8px] uppercase tracking-widest font-bold mb-2" style={{ color: "rgba(255,255,255,0.28)" }}>
              All Stops · {stns.length}
            </div>
            <div className="flex flex-col gap-1.5">
              {stns.map((s, i) => {
                const isTerminal = s.stopType === "origin" || s.stopType === "destination"
                const isPass     = s.stopType === "passThrough" || s.stopType === "pass"
                const st         = stnStyle(s.shortCode)
                const time       = s.dep || s.arr
                return (
                  <motion.div
                    key={`stop-r-${s.shortCode}-${i}`}
                    className="flex items-center gap-2"
                    initial={{ opacity: 0, x: 8 }}
                    animate={inView ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.4 + i * 0.07 }}
                  >
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        background: isTerminal ? ES_GOLD : isPass ? "rgba(255,255,255,0.15)" : MC_CYAN,
                        boxShadow:  isTerminal ? `0 0 6px ${ES_GOLD}` : "none",
                      }}
                    />
                    <span
                      className="text-[10px] flex-1 truncate"
                      style={{
                        color:      isTerminal ? "white" : isPass ? "rgba(255,255,255,0.28)" : "rgba(255,255,255,0.65)",
                        fontWeight: isTerminal ? 700 : 400,
                      }}
                    >
                      {st.city !== s.shortCode ? st.city : s.name || s.shortCode}
                    </span>
                    {time && (
                      <span className="text-[10px] tabular-nums font-bold shrink-0"
                        style={{ color: isTerminal ? ES_GOLD : "rgba(255,255,255,0.3)" }}>
                        {time}
                      </span>
                    )}
                  </motion.div>
                )
              })}
            </div>
          </div>

          {/* Crew section */}
          {allCrew.length > 0 && (
            <div
              className="rounded-xl p-3"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <motion.span
                  className="w-1.5 h-1.5 rounded-full inline-block"
                  style={{ background: ES_GOLD }}
                  animate={{ opacity: [1, 0.2, 1] }}
                  transition={{ repeat: Infinity, duration: 1.4 }}
                />
                <div className="text-[8px] uppercase tracking-widest font-bold" style={{ color: "rgba(255,255,255,0.28)" }}>
                  Crew on Duty
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                {allCrew.slice(0, 5).map((m, ci) => {
                  const isDriver = m.crewType === "TRAIN_DRIVER"
                  const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.crewId
                  const ini  = ((m.firstName[0] ?? "") + (m.lastName[0] ?? "")).toUpperCase() || "?"
                  return (
                    <motion.div
                      key={`${m.crewId}-${m.origin}`}
                      className="flex items-center gap-2"
                      initial={{ opacity: 0, x: 8 }}
                      animate={inView ? { opacity: 1, x: 0 } : {}}
                      transition={{ delay: 0.6 + ci * 0.06 }}
                    >
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-black shrink-0 relative"
                        style={{ background: isDriver ? ES_GOLD : MC_CYAN, color: MC_BG }}
                      >
                        {ini}
                        {isDriver && (
                          <motion.div
                            className="absolute inset-0 rounded-full"
                            style={{ border: `1.5px solid ${ES_GOLD}` }}
                            animate={{ scale: [1, 1.6, 1], opacity: [0.6, 0, 0.6] }}
                            transition={{ repeat: Infinity, duration: 2.2, delay: ci * 0.3 }}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-semibold truncate" style={{ color: isDriver ? ES_GOLD : MC_CYAN }}>
                          {name}
                        </div>
                        <div className="text-[8px]" style={{ color: "rgba(255,255,255,0.28)" }}>
                          {m.origin}→{m.destination} · {m.dep}–{m.arr}
                        </div>
                      </div>
                      <span
                        className="text-[7px] font-black px-1 py-px rounded-full shrink-0"
                        style={{ background: isDriver ? ES_GOLD : MC_CYAN, color: MC_BG }}
                      >
                        {isDriver ? "DRV" : "TM"}
                      </span>
                    </motion.div>
                  )
                })}
                {allCrew.length > 5 && (
                  <div className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>+{allCrew.length - 5} more</div>
                )}
              </div>
            </div>
          )}

          {/* Booking CTA */}
          {bUrl && (
            <motion.a
              href={bUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full text-center text-[11px] font-black py-2.5 rounded-xl"
              style={{
                background: `linear-gradient(135deg, ${ES_GOLD} 0%, #ffa500 100%)`,
                color: MC_BG,
                boxShadow: `0 4px 20px rgba(255,215,0,0.3)`,
              }}
              whileHover={{ scale: 1.03, boxShadow: `0 6px 28px rgba(255,215,0,0.52)` }}
              whileTap={{ scale: 0.97 }}
            >
              Book on Eurostar ↗
            </motion.a>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function EuromapCard({ result, crewResult }: { readonly result: string; readonly crewResult?: string }) {
  const { theme, compact } = useEurostarDisplay()
  const summary = parseStatusSummary(result)
  const plans = parseResult(result)
  const selectionMatch = /SELECTION_CONTEXT:(first|last)\|/.exec(result)
  const selection = selectionMatch?.[1] as "first" | "last" | undefined
  if (!summary && plans.length === 0) return null

  return (
    <div className={`${eurostarDisplayClass(theme, compact)} relative w-full`}>
      <EurostarDisplayStyles />
      <div className="absolute right-3 top-3 z-40"><EurostarDisplayMenu inverted={theme !== "light" || !summary} /></div>
      {summary ? <StatusSummaryCard summary={summary} /> : <PlanCard plans={plans} crewResult={crewResult} selection={selection} />}
    </div>
  )
}
