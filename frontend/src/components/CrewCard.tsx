import { useRef } from "react"
import { motion, useInView } from "framer-motion"
import { User, Train, Phone, MapPin, Calendar, ChevronRight, Zap } from "lucide-react"

const ES_NAVY = "#003366"
const ES_GOLD = "#FFD700"

// ── Types ─────────────────────────────────────────────────────────────────────
interface CrewMember {
  crewType:    string
  crewId:      string
  firstName:   string
  lastName:    string
  phone:       string
  homeDepot:   string
  serviceCode: string
  origin:      string
  destination: string
  dep:         string
  arr:         string
}

interface DayData {
  date: string
  crew: CrewMember[]
}

interface MonthShift {
  date:        string
  weekday:     string
  serviceCode: string
  origin:      string
  destination: string
  dep:         string
  arr:         string
}

interface MonthlyData {
  crewId:     string
  crewName:   string
  yearMonth:  string
  shifts:     MonthShift[]
}

// ── Parsers ───────────────────────────────────────────────────────────────────
function parseDayData(raw: string): DayData | null {
  const startMatch = raw.match(/CREW_DAY_START:(\d{4}-\d{2}-\d{2})/)
  if (!startMatch) return null
  const date = startMatch[1]
  const crew: CrewMember[] = []
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t.startsWith("CREW_ROW:")) continue
    const p = t.slice("CREW_ROW:".length).split("|")
    if (p.length < 11) continue
    crew.push({
      crewType: p[0], crewId: p[1], firstName: p[2], lastName: p[3],
      phone: p[4], homeDepot: p[5], serviceCode: p[6],
      origin: p[7], destination: p[8], dep: p[9], arr: p[10],
    })
  }
  return crew.length > 0 ? { date, crew } : null
}

function parseMonthlyData(raw: string): MonthlyData | null {
  const startMatch = raw.match(/CREW_MONTHLY_START:([^|]+)\|([^|]*)\|([^\n]+)/)
  if (!startMatch) return null
  const crewId = startMatch[1]
  const crewName = startMatch[2]
  const yearMonth = startMatch[3].trim()
  const shifts: MonthShift[] = []
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t.startsWith("CREW_SHIFT:")) continue
    const p = t.slice("CREW_SHIFT:".length).split("|")
    if (p.length < 7) continue
    shifts.push({
      date: p[0], weekday: p[1], serviceCode: p[2],
      origin: p[3], destination: p[4], dep: p[5], arr: p[6],
    })
  }
  return { crewId, crewName, yearMonth, shifts }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(first: string, last: string): string {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || "?"
}

function crewTypeLabel(t: string): string {
  if (t === "TRAIN_DRIVER") return "Driver"
  return t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())
}

function crewTypeColor(t: string): { bg: string; fg: string } {
  if (t === "TRAIN_DRIVER") return { bg: "#003366", fg: "#FFD700" }
  return { bg: "#1d4ed8", fg: "#fff" }
}

// ── Crew member card ──────────────────────────────────────────────────────────
function MemberCard({ m, index, inView }: { readonly m: CrewMember; readonly index: number; readonly inView: boolean }) {
  const tc = crewTypeColor(m.crewType)
  const name = [m.firstName, m.lastName].filter(Boolean).join(" ") || m.crewId
  const delay = index * 0.1

  return (
    <motion.div
      className="relative rounded-xl overflow-hidden"
      style={{ border: `1.5px solid ${ES_NAVY}18`, background: "white" }}
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={inView ? { opacity: 1, y: 0, scale: 1 } : {}}
      transition={{ delay, type: "spring", stiffness: 340, damping: 24 }}
      whileHover={{ y: -2, boxShadow: `0 8px 28px ${ES_NAVY}22` }}
    >
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: tc.bg }} />

      <div className="pl-4 pr-3 py-3 flex items-center gap-3">
        {/* Avatar */}
        <motion.div
          className="relative shrink-0 w-11 h-11 rounded-full flex items-center justify-center font-black text-sm select-none"
          style={{ background: `linear-gradient(135deg, ${tc.bg} 0%, ${tc.bg}cc 100%)`, color: tc.fg }}
          initial={{ scale: 0, rotate: -30 }}
          animate={inView ? { scale: 1, rotate: 0 } : {}}
          transition={{ delay: delay + 0.08, type: "spring", stiffness: 420, damping: 18 }}
          whileHover={{ scale: 1.15, rotate: 5 }}
        >
          {initials(m.firstName, m.lastName)}
          {/* Pulse ring for drivers */}
          {m.crewType === "TRAIN_DRIVER" && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ border: `2px solid ${ES_GOLD}` }}
              animate={{ scale: [1, 1.4, 1], opacity: [0.8, 0, 0.8] }}
              transition={{ repeat: Infinity, duration: 2.2, ease: "easeInOut", delay: index * 0.3 }}
            />
          )}
        </motion.div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm text-gray-900 truncate">{name}</span>
            <span
              className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0"
              style={{ backgroundColor: tc.bg, color: tc.fg }}
            >
              {crewTypeLabel(m.crewType)}
            </span>
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] text-gray-400 font-mono">{m.crewId}</span>
            {m.homeDepot && (
              <>
                <span className="text-gray-200">·</span>
                <MapPin className="w-2.5 h-2.5 text-gray-400 shrink-0" />
                <span className="text-[10px] text-gray-400 truncate">{m.homeDepot}</span>
              </>
            )}
          </div>
        </div>

        {/* Service badge */}
        <div className="shrink-0 text-right">
          <div
            className="text-[10px] font-black px-2 py-0.5 rounded-md mb-1"
            style={{ background: `${ES_NAVY}10`, color: ES_NAVY }}
          >
            {m.origin} → {m.destination}
          </div>
          <div className="text-[10px] tabular-nums text-gray-500 font-semibold">
            {m.dep}–{m.arr}
          </div>
        </div>
      </div>

      {/* Phone row */}
      {m.phone && (
        <div
          className="flex items-center gap-1.5 px-4 py-1.5 border-t"
          style={{ borderColor: `${ES_NAVY}08`, background: `${ES_NAVY}04` }}
        >
          <Phone className="w-3 h-3 text-gray-400 shrink-0" />
          <a
            href={`tel:${m.phone.replace(/\s/g, "")}`}
            className="text-[10px] text-blue-600 font-semibold hover:underline"
          >
            {m.phone}
          </a>
        </div>
      )}
    </motion.div>
  )
}

// ── Day crew card ─────────────────────────────────────────────────────────────
function DayCrewCard({ data }: { readonly data: DayData }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })

  // Group by service.
  const serviceOrder: string[] = []
  const byService: Record<string, CrewMember[]> = {}
  for (const m of data.crew) {
    if (!byService[m.serviceCode]) { byService[m.serviceCode] = []; serviceOrder.push(m.serviceCode) }
    byService[m.serviceCode].push(m)
  }

  let memberIndex = 0

  return (
    <motion.div
      ref={ref}
      className="rounded-2xl overflow-hidden"
      style={{ boxShadow: `0 8px 40px ${ES_NAVY}18, 0 2px 8px #00000010` }}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Header */}
      <div
        className="relative px-5 py-4 text-white overflow-hidden"
        style={{ background: `linear-gradient(135deg, #001f4d 0%, #003388 60%, #004db3 100%)` }}
      >
        {/* Shimmer */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.07) 50%, transparent 65%)" }}
          animate={{ x: ["-100%", "200%"] }}
          transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut", repeatDelay: 2.5 }}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)" }}
              animate={{ rotate: [0, 5, -5, 0] }}
              transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
            >
              <Zap className="w-5 h-5" style={{ color: ES_GOLD }} />
            </motion.div>
            <div>
              <div className="font-black text-base tracking-tight">Crew on Duty</div>
              <div className="text-[11px] text-white/60">{data.date}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1">
            <User className="w-3 h-3 text-white/70" />
            <span className="text-[11px] font-bold text-white/80">{data.crew.length} crew</span>
          </div>
        </div>
      </div>

      {/* Service groups */}
      <div className="bg-gray-50 p-3 flex flex-col gap-4">
        {serviceOrder.map((svc) => {
          const members = byService[svc]
          const first = members[0]
          return (
            <div key={svc}>
              {/* Service header */}
              <motion.div
                className="flex items-center gap-2 mb-2 px-1"
                initial={{ opacity: 0, x: -10 }}
                animate={inView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.3 }}
              >
                <Train className="w-3.5 h-3.5 shrink-0" style={{ color: ES_NAVY }} />
                <span className="text-xs font-black tracking-tight" style={{ color: ES_NAVY }}>
                  Service {svc}
                </span>
                <ChevronRight className="w-3 h-3 text-gray-400" />
                <span className="text-xs text-gray-500">{first.origin} → {first.destination}</span>
                <span className="ml-auto text-[10px] font-bold tabular-nums" style={{ color: ES_GOLD, textShadow: "0 0 8px #FFD70044" }}>
                  {first.dep}–{first.arr}
                </span>
              </motion.div>

              {/* Members */}
              <div className="flex flex-col gap-2">
                {members.map((m) => {
                  const idx = memberIndex++
                  return <MemberCard key={`${m.crewId}-${svc}`} m={m} index={idx} inView={inView} />
                })}
              </div>
            </div>
          )
        })}
      </div>
    </motion.div>
  )
}

// ── Monthly schedule card ─────────────────────────────────────────────────────
function MonthlyScheduleCard({ data }: { readonly data: MonthlyData }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })

  const [yr, mo] = data.yearMonth.split("-")
  const monthLabel = new Date(`${yr}-${mo}-01`).toLocaleString("en-GB", { month: "long", year: "numeric" })

  return (
    <motion.div
      ref={ref}
      className="rounded-2xl overflow-hidden"
      style={{ boxShadow: `0 8px 40px ${ES_NAVY}18` }}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Header */}
      <div
        className="relative px-5 py-4 text-white overflow-hidden"
        style={{ background: `linear-gradient(135deg, #001f4d 0%, #003388 60%, #004db3 100%)` }}
      >
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.07) 50%, transparent 65%)" }}
          animate={{ x: ["-100%", "200%"] }}
          transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut", repeatDelay: 2.5 }}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.15)" }}
              whileHover={{ scale: 1.1 }}
            >
              <Calendar className="w-5 h-5" style={{ color: ES_GOLD }} />
            </motion.div>
            <div>
              <div className="font-black text-base">{data.crewName || data.crewId}</div>
              <div className="text-[11px] text-white/60">{data.crewId} · {monthLabel}</div>
            </div>
          </div>
          <div
            className="text-3xl font-black tabular-nums"
            style={{ color: ES_GOLD, textShadow: "0 0 20px #FFD70044" }}
          >
            {data.shifts.length}
            <div className="text-[10px] font-bold text-white/50 text-center">shifts</div>
          </div>
        </div>
      </div>

      {/* Shifts list */}
      <div className="bg-white p-3 flex flex-col gap-1.5">
        {data.shifts.length === 0 ? (
          <div className="text-center text-sm text-gray-400 py-6">No shifts found this month</div>
        ) : (
          data.shifts.map((s, i) => (
            <motion.div
              key={`${s.date}-${s.serviceCode}`}
              className="flex items-center gap-3 px-3 py-2 rounded-xl"
              style={{ background: i % 2 === 0 ? `${ES_NAVY}06` : "transparent" }}
              initial={{ opacity: 0, x: -12 }}
              animate={inView ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: i * 0.04, duration: 0.25, ease: "easeOut" }}
              whileHover={{ backgroundColor: `${ES_NAVY}10` }}
            >
              {/* Date */}
              <div className="shrink-0 text-center w-14">
                <div className="text-[10px] font-bold text-gray-400 uppercase">{s.weekday}</div>
                <div className="text-xs font-black" style={{ color: ES_NAVY }}>{s.date.slice(8)}</div>
              </div>

              {/* Divider */}
              <div className="w-px h-8 rounded-full" style={{ backgroundColor: `${ES_NAVY}20` }} />

              {/* Service */}
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                <Train className="w-3 h-3 shrink-0" style={{ color: ES_NAVY }} />
                <span className="text-xs font-bold" style={{ color: ES_NAVY }}>Svc {s.serviceCode}</span>
                <span className="text-xs text-gray-500 truncate">{s.origin} → {s.destination}</span>
              </div>

              {/* Time */}
              <div className="shrink-0 text-[11px] font-bold tabular-nums text-gray-600">
                {s.dep}–{s.arr}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </motion.div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
export function CrewCard({ result }: { readonly result: string }) {
  const monthly = parseMonthlyData(result)
  if (monthly) return <MonthlyScheduleCard data={monthly} />

  const day = parseDayData(result)
  if (day) return <DayCrewCard data={day} />

  return null
}
