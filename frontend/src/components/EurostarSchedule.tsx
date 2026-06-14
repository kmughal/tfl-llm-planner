import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Train, ArrowRight, Clock, AlertCircle, RefreshCw, ChevronLeft, ChevronRight, Users, Phone, MapPin } from "lucide-react"
import { EurostarDisplayMenu, EurostarDisplayStyles, eurostarDisplayClass, useEurostarDisplay } from "./EurostarDisplay"

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080"
const NAVY = "#003366"
const GOLD = "#C89A0C"
const DAY_NAMES  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// ── Station lookup ────────────────────────────────────────────────────────────

const STATION_NAMES: Record<string, string> = {
  SPX: "London St Pancras",
  PNO: "Paris Gare du Nord",
  BRU: "Brussels-Midi",
  LIL: "Lille Europe",
  LEW: "Lille Europe",
  AMS: "Amsterdam Centraal",
  ASD: "Amsterdam Centraal",
  RTD: "Rotterdam Centraal",
  RDM: "Rotterdam Centraal",
  EBF: "Ebbsfleet Intl",
  EBD: "Ebbsfleet Intl",
  CFR: "Calais-Fréthun",
  FTN: "Calais-Fréthun",
  MVC: "Marne-la-Vallée",
  ASH: "Ashford Intl",
  AFK: "Ashford Intl",
}

const FLAG: Record<string, string> = { GB: "🇬🇧", FR: "🇫🇷", BE: "🇧🇪", NL: "🇳🇱" }

function sName(code: string): string { return STATION_NAMES[code] ?? code }

// ── Types ─────────────────────────────────────────────────────────────────────

type EStation = {
  sequenceNumber: number
  stopType: string
  shortCode: string
  country: string
  departureDateTime: string
  arrivalDatetime: string
}

type TrainPlan = {
  planID: string
  serviceCode: string
  status: string
  range: string
  departureDateTime: string
  arrivalDateTime: string
  stations: EStation[]
}

type Filter = "all" | "outbound" | "inbound"

type EnrichedCrew = {
  crewType:    string
  crewId:      string
  firstName:   string
  lastName:    string
  phone:       string
  homeDepot:   string
  serviceCode: string
  origin:      string
  destination: string
  departure:   string
  arrival:     string
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r
}

function startOfDay(d: Date): Date {
  const r = new Date(d); r.setHours(0, 0, 0, 0); return r
}

function fmtHHMM(dt: string): string {
  if (!dt) return "—"
  if (dt.includes("T")) {
    try {
      return new Date(dt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    } catch { return "—" }
  }
  return dt.slice(0, 5)
}

function fmtDuration(dep: string, arr: string): string {
  if (!dep || !arr) return ""
  const diff = new Date(arr).getTime() - new Date(dep).getTime()
  if (diff <= 0) return ""
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function originSt(t: TrainPlan): EStation | undefined { return t.stations.find(s => s.stopType === "origin") }
function destSt(t: TrainPlan): EStation | undefined   { return t.stations.find(s => s.stopType === "destination") }
function isOutbound(t: TrainPlan): boolean             { return originSt(t)?.country === "GB" }

function statusColor(s: string): string {
  if (s === "cancelled" || s === "deleted" || s === "suspended") return "#ef4444"
  if (s === "active") return "#10b981"
  return "#f59e0b"
}

function statusLabel(s: string): string {
  if (s === "cancelled" || s === "deleted") return "Cancelled"
  if (s === "suspended")  return "Suspended"
  if (s === "active")     return "Active"
  return s
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="rounded-2xl p-4 animate-pulse"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="h-4 w-16 rounded" style={{ background: "rgba(255,255,255,0.1)" }} />
        <div className="h-5 w-14 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }} />
      </div>
      <div className="flex items-center gap-3">
        <div className="h-8 w-12 rounded" style={{ background: "rgba(255,255,255,0.1)" }} />
        <div className="flex-1 h-0.5 rounded" style={{ background: "rgba(255,255,255,0.07)" }} />
        <div className="h-8 w-12 rounded" style={{ background: "rgba(255,255,255,0.1)" }} />
      </div>
    </div>
  )
}

// ── Date strip ────────────────────────────────────────────────────────────────

function DateStrip({
  dates, selected, onSelect,
}: {
  readonly dates: Date[]
  readonly selected: Date
  readonly onSelect: (d: Date) => void
}) {
  const ref   = useRef<HTMLDivElement>(null)
  const today = startOfDay(new Date())

  useEffect(() => {
    const idx = dates.findIndex(d => toISO(d) === toISO(selected))
    if (idx < 0 || !ref.current) return
    const el = ref.current.children[idx] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" })
  }, [selected, dates])

  return (
    <div
      ref={ref}
      className="flex gap-1.5 overflow-x-auto px-4 pb-1 scrollbar-none"
      style={{ scrollbarWidth: "none" }}
    >
      {dates.map((d) => {
        const iso   = toISO(d)
        const isSel = iso === toISO(selected)
        const isTod = iso === toISO(today)
        return (
          <motion.button
            key={iso}
            type="button"
            onClick={() => onSelect(d)}
            className="flex flex-col items-center gap-0.5 rounded-xl py-2 shrink-0 transition-colors"
            style={{
              width: 44,
              background: isSel
                ? `linear-gradient(160deg, ${NAVY} 0%, #0055cc 100%)`
                : "rgba(255,255,255,0.04)",
              border: isSel
                ? "1px solid rgba(0,85,204,0.6)"
                : isTod
                ? `1px solid ${GOLD}55`
                : "1px solid rgba(255,255,255,0.06)",
            }}
            whileHover={isSel ? {} : { scale: 1.06, background: "rgba(255,255,255,0.08)" }}
            whileTap={{ scale: 0.95 }}
          >
            <span
              className="text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: isSel ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.35)" }}
            >
              {DAY_NAMES[d.getDay()]}
            </span>
            <span
              className="text-sm font-bold"
              style={{ color: isSel ? "#fff" : isTod ? GOLD : "rgba(255,255,255,0.8)" }}
            >
              {d.getDate()}
            </span>
            {isTod && !isSel && (
              <span className="w-1 h-1 rounded-full" style={{ background: GOLD }} />
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

// ── Train card ────────────────────────────────────────────────────────────────

function TrainCard({
  train, selected, onClick,
}: {
  readonly train: TrainPlan
  readonly selected: boolean
  readonly onClick: () => void
}) {
  const origin   = originSt(train)
  const dest     = destSt(train)
  const outbound = isOutbound(train)
  const dep      = fmtHHMM(train.departureDateTime)
  const arr      = fmtHHMM(train.arrivalDateTime)
  const dur      = fmtDuration(train.departureDateTime, train.arrivalDateTime)
  const cancelled = train.status === "cancelled" || train.status === "suspended"

  return (
    <motion.button
      type="button"
      onClick={onClick}
      className="w-full text-left rounded-2xl p-4 transition-all"
      style={{
        background: selected
          ? "rgba(0,51,102,0.28)"
          : "rgba(255,255,255,0.04)",
        border: selected
          ? `1px solid rgba(0,85,204,0.45)`
          : "1px solid rgba(255,255,255,0.07)",
        opacity: cancelled ? 0.65 : 1,
      }}
      whileHover={selected ? {} : { background: "rgba(255,255,255,0.07)", scale: 1.005 }}
      whileTap={{ scale: 0.99 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: cancelled ? 0.65 : 1, y: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ background: `${NAVY}40` }}
          >
            <Train style={{ width: 14, height: 14, color: "#7eaaff" }} />
          </div>
          <div>
            <span className="text-xs font-semibold" style={{ color: "rgba(255,255,255,0.5)" }}>
              {outbound ? "→ Outbound" : "← Inbound"}
            </span>
            <p className="text-sm font-bold leading-none" style={{ color: "rgba(255,255,255,0.92)" }}>
              {train.serviceCode}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {cancelled && <AlertCircle style={{ width: 12, height: 12, color: "#ef4444" }} />}
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: `${statusColor(train.status)}20`,
              color: statusColor(train.status),
              border: `1px solid ${statusColor(train.status)}40`,
            }}
          >
            {statusLabel(train.status)}
          </span>
        </div>
      </div>

      {/* Route timeline */}
      <div className="flex items-center gap-2">
        {/* Origin */}
        <div className="shrink-0 min-w-0">
          <p
            className="text-2xl font-bold tabular-nums leading-none"
            style={{
              color: cancelled ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.95)",
              textDecoration: cancelled ? "line-through" : "none",
            }}
          >
            {dep}
          </p>
          <p className="text-[10px] mt-0.5 truncate max-w-[90px]" style={{ color: "rgba(255,255,255,0.38)" }}>
            {FLAG[origin?.country ?? ""] ?? ""} {origin ? sName(origin.shortCode) : ""}
          </p>
        </div>

        {/* Track */}
        <div className="flex-1 flex flex-col items-center gap-1 min-w-0 px-2">
          <div className="flex items-center w-full gap-1">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cancelled ? "rgba(255,255,255,0.2)" : "#7eaaff" }} />
            <div className="flex-1 h-px" style={{ background: cancelled ? "rgba(255,255,255,0.1)" : "rgba(0,85,204,0.5)" }} />
            <ArrowRight style={{ width: 10, height: 10, color: cancelled ? "rgba(255,255,255,0.2)" : "#7eaaff", flexShrink: 0 }} />
            <div className="flex-1 h-px" style={{ background: cancelled ? "rgba(255,255,255,0.1)" : "rgba(0,85,204,0.5)" }} />
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cancelled ? "rgba(255,255,255,0.2)" : "#7eaaff" }} />
          </div>
          {dur && (
            <div className="flex items-center gap-1">
              <Clock style={{ width: 9, height: 9, color: "rgba(255,255,255,0.3)" }} />
              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{dur}</span>
            </div>
          )}
        </div>

        {/* Destination */}
        <div className="shrink-0 text-right min-w-0">
          <p
            className="text-2xl font-bold tabular-nums leading-none"
            style={{
              color: cancelled ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.95)",
              textDecoration: cancelled ? "line-through" : "none",
            }}
          >
            {arr}
          </p>
          <p className="text-[10px] mt-0.5 truncate max-w-[90px] text-right" style={{ color: "rgba(255,255,255,0.38)" }}>
            {FLAG[dest?.country ?? ""] ?? ""} {dest ? sName(dest.shortCode) : ""}
          </p>
        </div>
      </div>

      {/* Intermediate stops count */}
      {train.stations.filter(s => s.stopType === "stop").length > 0 && (
        <p className="mt-2 text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
          {train.stations.filter(s => s.stopType === "stop").length} intermediate stop{train.stations.filter(s => s.stopType === "stop").length !== 1 ? "s" : ""}
        </p>
      )}
    </motion.button>
  )
}

// ── Detail panel ──────────────────────────────────────────────────────────────

function StopRow({
  station, isFirst, isLast, idx, onHoverEnter, onHoverLeave,
}: {
  readonly station: EStation
  readonly isFirst: boolean
  readonly isLast: boolean
  readonly idx: number
  readonly onHoverEnter?: () => void
  readonly onHoverLeave?: () => void
}) {
  const dep = fmtHHMM(station.departureDateTime)
  const arr = fmtHHMM(station.arrivalDatetime)

  return (
    <motion.div
      className="flex gap-3 items-stretch cursor-pointer"
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.06, duration: 0.24, ease: "easeOut" }}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      {/* Timeline column */}
      <div className="flex flex-col items-center shrink-0" style={{ width: 18 }}>
        <motion.div
          className="rounded-full border-2 shrink-0 mt-1"
          style={{
            width:           isFirst || isLast ? 14 : 10,
            height:          isFirst || isLast ? 14 : 10,
            borderColor:     isFirst || isLast ? "#7eaaff" : "rgba(0,85,204,0.5)",
            backgroundColor: isFirst || isLast ? "#7eaaff" : "transparent",
          }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: idx * 0.06 + 0.06, type: "spring", stiffness: 500, damping: 18 }}
        />
        {!isLast && (
          <motion.div
            className="flex-1 rounded-full mt-1"
            style={{ width: 2, background: "rgba(0,85,204,0.3)", minHeight: 24 }}
            initial={{ scaleY: 0, originY: "top" }}
            animate={{ scaleY: 1 }}
            transition={{ delay: idx * 0.06 + 0.12, duration: 0.3 }}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex items-start justify-between w-full pb-4 min-w-0">
        <div className="min-w-0">
          <p
            className="text-sm font-semibold leading-snug"
            style={{ color: isFirst || isLast ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.65)" }}
          >
            {FLAG[station.country] ?? ""} {sName(station.shortCode)}
          </p>
          <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
            {station.stopType === "passThrough" ? "pass through" : station.stopType}
          </p>
        </div>
        <div className="text-right shrink-0 ml-3">
          {arr && <p className="text-xs tabular-nums" style={{ color: "rgba(255,255,255,0.45)" }}>arr {arr}</p>}
          {dep && <p className="text-xs font-semibold tabular-nums" style={{ color: "rgba(255,255,255,0.82)" }}>dep {dep}</p>}
          {!arr && !dep && (isFirst || isLast) && (
            <p className="text-xs tabular-nums" style={{ color: "rgba(255,255,255,0.45)" }}>
              {isFirst ? fmtHHMM(station.departureDateTime) : fmtHHMM(station.arrivalDatetime)}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Crew section ──────────────────────────────────────────────────────────────

function crewTypeLabel(t: string): string {
  if (t === "TRAIN_DRIVER") return "Driver"
  return t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function initials(first: string, last: string): string {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || "?"
}

function CrewOverlay({
  crew, loading, onClose,
}: {
  readonly crew:    EnrichedCrew[]
  readonly loading: boolean
  readonly onClose: () => void
}) {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col z-20 overflow-hidden"
      style={{ background: "rgba(2,6,20,0.96)", backdropFilter: "blur(20px)" }}
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* ambient gold sweep */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "linear-gradient(135deg, transparent 0%, rgba(251,191,36,0.05) 50%, transparent 100%)" }}
        animate={{ x: ["-100%", "150%"] }}
        transition={{ repeat: Infinity, duration: 4, ease: "easeInOut", repeatDelay: 3 }}
      />

      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between shrink-0 relative z-10">
        <div className="flex items-center gap-2.5">
          <motion.div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(251,191,36,0.22) 0%, rgba(251,191,36,0.06) 100%)", border: "1px solid rgba(251,191,36,0.35)" }}
            animate={{ boxShadow: ["0 0 0 0 rgba(251,191,36,0.45)", "0 0 16px 6px rgba(251,191,36,0)"] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: "easeOut" }}
          >
            <Users style={{ width: 14, height: 14, color: "#fbbf24" }} />
          </motion.div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: "rgba(251,191,36,0.55)" }}>Crew on duty</p>
            <p className="text-sm font-black leading-none" style={{ color: "#fbbf24" }}>
              {loading ? "Loading…" : `${crew.length} assigned`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg"
          style={{ color: "rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.06)" }}
        >
          <X style={{ width: 12, height: 12 }} />
        </button>
      </div>

      {/* Divider */}
      <motion.div
        className="mx-4 mb-3 h-px relative z-10"
        style={{ background: "linear-gradient(90deg, transparent, rgba(251,191,36,0.3), transparent)" }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.35, delay: 0.08 }}
      />

      {/* Cards */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 flex flex-col gap-2 relative z-10">
        {loading && [1, 2].map(i => (
          <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
        ))}

        {!loading && crew.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-2 py-10">
            <Users style={{ width: 24, height: 24, color: "rgba(255,255,255,0.1)" }} />
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.22)" }}>No crew assigned</p>
          </div>
        )}

        {!loading && crew.map((m, i) => {
          const isDriver = m.crewType === "TRAIN_DRIVER"
          const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.crewId
          return (
            <motion.div
              key={`${m.crewId}-${m.serviceCode}`}
              className="relative rounded-xl p-3 overflow-hidden"
              style={{
                background: isDriver
                  ? "linear-gradient(135deg, rgba(251,191,36,0.1) 0%, rgba(251,191,36,0.03) 100%)"
                  : "rgba(255,255,255,0.04)",
                border: isDriver ? "1px solid rgba(251,191,36,0.28)" : "1px solid rgba(255,255,255,0.07)",
              }}
              initial={{ opacity: 0, y: 14, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.07, type: "spring", stiffness: 380, damping: 22 }}
            >
              {isDriver && (
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: "linear-gradient(105deg, transparent 20%, rgba(251,191,36,0.08) 50%, transparent 80%)" }}
                  animate={{ x: ["-100%", "200%"] }}
                  transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut", repeatDelay: 3.5 }}
                />
              )}
              <div className="flex items-center gap-2.5 relative z-10">
                <motion.div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black shrink-0 select-none"
                  style={{
                    background: isDriver ? "linear-gradient(135deg, #003366 0%, #0055cc 100%)" : "rgba(255,255,255,0.08)",
                    color: isDriver ? "#fbbf24" : "rgba(255,255,255,0.5)",
                    border: isDriver ? "2px solid rgba(251,191,36,0.5)" : "1px solid rgba(255,255,255,0.1)",
                  }}
                  animate={isDriver ? { boxShadow: ["0 0 0 0 rgba(251,191,36,0.5)", "0 0 0 7px rgba(251,191,36,0)"] } : {}}
                  transition={{ repeat: Infinity, duration: 2, ease: "easeOut" }}
                >
                  {initials(m.firstName, m.lastName)}
                </motion.div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-bold truncate" style={{ color: "rgba(255,255,255,0.92)" }}>{name}</span>
                    <motion.span
                      className="text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wide shrink-0"
                      style={{ background: isDriver ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.07)", color: isDriver ? "#fbbf24" : "rgba(255,255,255,0.38)" }}
                      animate={isDriver ? { opacity: [1, 0.6, 1] } : {}}
                      transition={{ repeat: Infinity, duration: 1.8 }}
                    >
                      {crewTypeLabel(m.crewType)}
                    </motion.span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.22)" }}>{m.crewId}</span>
                    {m.homeDepot && (
                      <>
                        <MapPin style={{ width: 7, height: 7, color: "rgba(255,255,255,0.18)" }} />
                        <span className="text-[9px] truncate" style={{ color: "rgba(255,255,255,0.22)" }}>{m.homeDepot}</span>
                      </>
                    )}
                  </div>
                </div>
                {m.phone && (
                  <a
                    href={`tel:${m.phone.replaceAll(" ", "")}`}
                    className="shrink-0 flex items-center justify-center rounded-lg w-8 h-8"
                    style={{
                      background: isDriver ? "rgba(251,191,36,0.12)" : "rgba(255,255,255,0.06)",
                      border: isDriver ? "1px solid rgba(251,191,36,0.22)" : "1px solid rgba(255,255,255,0.08)",
                      color: isDriver ? "#fbbf24" : "#7eaaff",
                    }}
                    onClick={e => e.stopPropagation()}
                  >
                    <Phone style={{ width: 10, height: 10 }} />
                  </a>
                )}
              </div>
              <div className="mt-2 pt-2 flex items-center gap-1.5 relative z-10" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <Clock style={{ width: 8, height: 8, color: "rgba(255,255,255,0.2)" }} />
                <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>{m.departure} → {m.arrival}</span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </motion.div>
  )
}

function DetailPanel({
  train, onClose, crew, crewLoading,
}: {
  readonly train:        TrainPlan
  readonly onClose:      () => void
  readonly crew:         EnrichedCrew[]
  readonly crewLoading:  boolean
}) {
  const origin    = originSt(train)
  const dest      = destSt(train)
  const dur       = fmtDuration(train.departureDateTime, train.arrivalDateTime)
  const cancelled = train.status === "cancelled" || train.status === "suspended"
  const stops     = [...train.stations].sort((a, b) => a.sequenceNumber - b.sequenceNumber)

  const [crewVisible, setCrewVisible] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleStopEnter() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    if (crew.length > 0 || crewLoading) setCrewVisible(true)
  }

  function handleStopLeave() {
    hoverTimer.current = setTimeout(() => setCrewVisible(false), 350)
  }

  function handleOverlayClose() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    setCrewVisible(false)
  }

  return (
    <motion.div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        background: "rgba(0,30,80,0.35)",
        border: "1px solid rgba(0,85,204,0.3)",
        backdropFilter: "blur(12px)",
      }}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 30 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Detail header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "rgba(0,85,204,0.2)" }}
      >
        <div className="flex items-center gap-2">
          <div
            className="flex items-center justify-center w-8 h-8 rounded-lg"
            style={{ background: `${NAVY}60` }}
          >
            <Train style={{ width: 14, height: 14, color: "#7eaaff" }} />
          </div>
          <div>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Train</p>
            <p className="text-lg font-bold leading-none" style={{ color: "rgba(255,255,255,0.95)" }}>
              {train.serviceCode}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{
              background: `${statusColor(train.status)}20`,
              color: statusColor(train.status),
              border: `1px solid ${statusColor(train.status)}40`,
            }}
          >
            {statusLabel(train.status)}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ color: "rgba(255,255,255,0.35)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <X style={{ width: 13, height: 13 }} />
          </button>
        </div>
      </div>

      {/* Summary row */}
      <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(0,85,204,0.15)" }}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>Departs</p>
            <p
              className="text-3xl font-bold tabular-nums"
              style={{
                color: cancelled ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.95)",
                textDecoration: cancelled ? "line-through" : "none",
                letterSpacing: "-0.02em",
              }}
            >
              {fmtHHMM(train.departureDateTime)}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              {origin ? sName(origin.shortCode) : ""}
            </p>
          </div>
          <div className="flex flex-col items-center gap-1 px-3">
            {dur && (
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "rgba(0,85,204,0.2)", border: "1px solid rgba(0,85,204,0.3)" }}>
                <Clock style={{ width: 9, height: 9, color: "#7eaaff" }} />
                <span className="text-[10px] font-semibold" style={{ color: "#7eaaff" }}>{dur}</span>
              </div>
            )}
            <div className="w-12 h-px" style={{ background: "rgba(0,85,204,0.3)" }} />
          </div>
          <div className="text-right">
            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>Arrives</p>
            <p
              className="text-3xl font-bold tabular-nums"
              style={{
                color: cancelled ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.95)",
                textDecoration: cancelled ? "line-through" : "none",
                letterSpacing: "-0.02em",
              }}
            >
              {fmtHHMM(train.arrivalDateTime)}
            </p>
            <p className="text-[10px] mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              {dest ? sName(dest.shortCode) : ""}
            </p>
          </div>
        </div>
      </div>

      {/* Stops + crew overlay on hover */}
      <div className="flex-1 relative min-h-0">
        <div className="h-full overflow-y-auto px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
            All stops · {stops.length}
            {(crew.length > 0 || crewLoading) && (
              <span style={{ color: "rgba(251,191,36,0.45)" }}> · hover to see crew</span>
            )}
          </p>
          {stops.map((s, i) => (
            <StopRow
              key={`${s.shortCode}-${s.sequenceNumber}`}
              station={s}
              isFirst={i === 0}
              isLast={i === stops.length - 1}
              idx={i}
              onHoverEnter={handleStopEnter}
              onHoverLeave={handleStopLeave}
            />
          ))}
        </div>
        <AnimatePresence>
          {crewVisible && (
            <CrewOverlay
              crew={crew}
              loading={crewLoading}
              onClose={handleOverlayClose}
            />
          )}
        </AnimatePresence>
      </div>

      {/* PlanID footer */}
      <div
        className="px-4 py-2 border-t"
        style={{ borderColor: "rgba(0,85,204,0.15)" }}
      >
        <p className="text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>
          {train.planID}
        </p>
      </div>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function EurostarSchedule({ onClose }: { readonly onClose: () => void }) {
  const { theme, compact } = useEurostarDisplay()
  const today = useMemo(() => startOfDay(new Date()), [])
  const dates = useMemo(() => Array.from({ length: 30 }, (_, i) => addDays(today, i)), [today])

  const [selectedDate, setSelectedDate] = useState<Date>(today)
  const [filter, setFilter]             = useState<Filter>("all")
  const [trains, setTrains]             = useState<TrainPlan[] | null>(null)
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [selectedTrain, setSelectedTrain] = useState<TrainPlan | null>(null)
  const [crew, setCrew]                 = useState<EnrichedCrew[]>([])
  const [crewLoading, setCrewLoading]   = useState(false)

  const load = useCallback((date: Date) => {
    setLoading(true)
    setError(null)
    setTrains(null)
    setSelectedTrain(null)
    fetch(`${API_BASE}/api/eurostar/trains?date=${toISO(date)}`)
      .then(r => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setTrains(data as TrainPlan[])
        else setError((data as { error?: string }).error ?? "Failed to load")
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load(selectedDate) }, [selectedDate, load])

  useEffect(() => {
    if (!selectedTrain) { setCrew([]); return }
    setCrewLoading(true)
    setCrew([])
    fetch(`${API_BASE}/api/crew/activities?date=${toISO(selectedDate)}&serviceCode=${selectedTrain.serviceCode}`)
      .then(r => r.json())
      .then((data: unknown) => { if (Array.isArray(data)) setCrew(data as EnrichedCrew[]) })
      .catch(() => {})
      .finally(() => setCrewLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTrain?.planID, toISO(selectedDate)])

  function handleDateSelect(d: Date) {
    setSelectedDate(d)
    setFilter("all")
  }

  const filtered = useMemo(() => {
    if (!trains) return []
    return trains
      .filter(t => filter === "all" || (filter === "outbound") === isOutbound(t))
      .sort((a, b) => a.departureDateTime.localeCompare(b.departureDateTime))
  }, [trains, filter])

  const activeCount   = filtered.filter(t => t.status === "active").length
  const cancelCount   = filtered.filter(t => t.status !== "active").length

  const formattedDate = `${DAY_NAMES[selectedDate.getDay()]}, ${selectedDate.getDate()} ${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getFullYear()}`

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(1,4,14,0.85)", backdropFilter: "blur(10px)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
    >
      <motion.div
        className={`${eurostarDisplayClass(theme, compact)} es-themed-panel es-legacy-dark relative w-full max-w-5xl max-h-[92vh] flex flex-col rounded-lg overflow-hidden`}
        style={{
          background: "rgba(4,10,28,0.97)",
          border: "1px solid rgba(0,51,102,0.45)",
          boxShadow: "0 40px 100px rgba(0,20,80,0.7), 0 0 0 1px rgba(255,255,255,0.03)",
        }}
        initial={{ opacity: 0, y: 32, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
        onClick={e => e.stopPropagation()}
      >
        <EurostarDisplayStyles />
        {/* ── Header ── */}
        <div
          className="flex items-center gap-3 px-5 py-4 border-b shrink-0"
          style={{ borderColor: "rgba(0,51,102,0.35)" }}
        >
          <div
            className="flex items-center justify-center w-10 h-10 rounded-xl shrink-0"
            style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #0055cc 100%)` }}
          >
            <Train className="text-white" style={{ width: 18, height: 18 }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm" style={{ color: "rgba(255,255,255,0.95)" }}>Train Schedule</p>
            <p className="text-[11px]" style={{ color: "rgba(255,255,255,0.38)" }}>{formattedDate}</p>
          </div>

          {/* Stats */}
          {trains && (
            <div className="hidden sm:flex items-center gap-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.25)" }}>
                {activeCount} active
              </span>
              {cancelCount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>
                  {cancelCount} cancelled
                </span>
              )}
            </div>
          )}

          <EurostarDisplayMenu inverted={theme !== "light"} />
          <button
            type="button"
            onClick={() => load(selectedDate)}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
            style={{ color: "rgba(255,255,255,0.35)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            aria-label="Refresh"
          >
            <RefreshCw style={{ width: 14, height: 14 }} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
            style={{ color: "rgba(255,255,255,0.35)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            aria-label="Close"
          >
            <X style={{ width: 16, height: 16 }} />
          </button>
        </div>

        {/* ── Date picker ── */}
        <div className="py-3 border-b shrink-0" style={{ borderColor: "rgba(0,51,102,0.2)" }}>
          <div className="flex items-center gap-2 px-4 mb-2">
            <button
              type="button"
              onClick={() => handleDateSelect(addDays(selectedDate, -1))}
              className="flex items-center justify-center w-6 h-6 rounded-lg shrink-0"
              style={{ color: "rgba(255,255,255,0.35)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <ChevronLeft style={{ width: 14, height: 14 }} />
            </button>
            <div className="flex-1 overflow-hidden">
              <DateStrip dates={dates} selected={selectedDate} onSelect={handleDateSelect} />
            </div>
            <button
              type="button"
              onClick={() => handleDateSelect(addDays(selectedDate, 1))}
              className="flex items-center justify-center w-6 h-6 rounded-lg shrink-0"
              style={{ color: "rgba(255,255,255,0.35)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <ChevronRight style={{ width: 14, height: 14 }} />
            </button>
          </div>

          {/* Direction filter */}
          <div className="flex items-center gap-1.5 px-4">
            {(["all", "outbound", "inbound"] as Filter[]).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className="text-[10px] font-semibold px-3 py-1 rounded-full transition-colors capitalize"
                style={{
                  background: filter === f ? `${NAVY}50` : "rgba(255,255,255,0.04)",
                  color:      filter === f ? "#7eaaff"   : "rgba(255,255,255,0.4)",
                  border:     filter === f ? "1px solid rgba(0,85,204,0.4)" : "1px solid rgba(255,255,255,0.06)",
                }}
              >
                {f === "outbound" ? "→ UK to Europe" : f === "inbound" ? "← Europe to UK" : "All Trains"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Body: train list + detail ── */}
        <div className="flex-1 flex min-h-0">
          {/* Train list */}
          <div className="es-density-list flex-1 overflow-y-auto p-4 flex flex-col gap-2.5 min-w-0">
            {loading && Array.from({ length: 5 }).map((_, i) => <SkeletonCard key={i} />)}

            {error && (
              <div className="flex flex-col items-center justify-center flex-1 gap-3 py-16">
                <AlertCircle style={{ width: 32, height: 32, color: "rgba(239,68,68,0.7)" }} />
                <p className="text-sm text-center" style={{ color: "rgba(255,255,255,0.4)" }}>{error}</p>
                <button
                  type="button"
                  onClick={() => load(selectedDate)}
                  className="text-xs px-4 py-2 rounded-xl"
                  style={{ background: `${NAVY}40`, color: "#7eaaff", border: "1px solid rgba(0,85,204,0.3)" }}
                >
                  Retry
                </button>
              </div>
            )}

            {!loading && !error && filtered.length === 0 && trains !== null && (
              <div className="flex flex-col items-center justify-center flex-1 gap-2 py-16">
                <Train style={{ width: 32, height: 32, color: "rgba(255,255,255,0.15)" }} />
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>No trains found</p>
              </div>
            )}

            <AnimatePresence mode="popLayout">
              {!loading && filtered.map(t => (
                <TrainCard
                  key={t.planID}
                  train={t}
                  selected={selectedTrain?.planID === t.planID}
                  onClick={() => setSelectedTrain(prev => prev?.planID === t.planID ? null : t)}
                />
              ))}
            </AnimatePresence>
          </div>

          {/* Detail panel */}
          <AnimatePresence>
            {selectedTrain && (
              <motion.div
                className="w-80 shrink-0 overflow-y-auto p-3 border-l"
                style={{ borderColor: "rgba(0,51,102,0.25)" }}
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                <DetailPanel
                  train={selectedTrain}
                  onClose={() => setSelectedTrain(null)}
                  crew={crew}
                  crewLoading={crewLoading}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Footer ── */}
        <div
          className="px-5 py-2.5 border-t shrink-0 flex items-center gap-2"
          style={{ borderColor: "rgba(0,51,102,0.2)" }}
        >
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#34d399" }} />
          <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
            Live data from Eurostar Euromap API · Select a train to see full stop detail
          </p>
          {trains && (
            <p className="ml-auto text-[10px] font-mono" style={{ color: "rgba(255,255,255,0.18)" }}>
              {trains.length} services
            </p>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
