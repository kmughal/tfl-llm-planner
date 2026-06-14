import { useRef } from "react"
import { motion, useInView } from "framer-motion"
import { Users, Train, Clock, Calendar, MapPin } from "lucide-react"

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
interface DayData    { date: string; crew: CrewMember[] }
interface MonthShift { date: string; weekday: string; serviceCode: string; origin: string; destination: string; dep: string; arr: string }
interface MonthlyData { crewId: string; crewName: string; yearMonth: string; shifts: MonthShift[] }

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseDayData(raw: string): DayData | null {
  const m = raw.match(/CREW_DAY_START:(\d{4}-\d{2}-\d{2})/)
  if (!m) return null
  const crew: CrewMember[] = []
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t.startsWith("CREW_ROW:")) continue
    const p = t.slice("CREW_ROW:".length).split("|")
    if (p.length < 11) continue
    crew.push({ crewType: p[0], crewId: p[1], firstName: p[2], lastName: p[3], phone: p[4], homeDepot: p[5], serviceCode: p[6], origin: p[7], destination: p[8], dep: p[9], arr: p[10] })
  }
  return crew.length > 0 ? { date: m[1], crew } : null
}

function parseMonthlyData(raw: string): MonthlyData | null {
  const m = raw.match(/CREW_MONTHLY_START:([^|]+)\|([^|]*)\|([^\n]+)/)
  if (!m) return null
  const shifts: MonthShift[] = []
  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (!t.startsWith("CREW_SHIFT:")) continue
    const p = t.slice("CREW_SHIFT:".length).split("|")
    if (p.length < 7) continue
    shifts.push({ date: p[0], weekday: p[1], serviceCode: p[2], origin: p[3], destination: p[4], dep: p[5], arr: p[6] })
  }
  return { crewId: m[1], crewName: m[2], yearMonth: m[3].trim(), shifts }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(first: string, last: string): string {
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase() || "?"
}

function roleLabel(t: string): string {
  if (t === "TRAIN_DRIVER")    return "DRIVER"
  if (t === "TRAIN_MANAGER_A") return "TRAIN MANAGER A"
  if (t === "TRAIN_MANAGER_B") return "TRAIN MANAGER B"
  return t.replace(/_/g, " ")
}

function roleBadge(t: string): { bg: string; text: string } {
  if (t === "TRAIN_DRIVER")    return { bg: "#0f172a", text: "#fff" }
  if (t === "TRAIN_MANAGER_B") return { bg: "#0891b2", text: "#fff" }
  return { bg: "#1d4ed8", text: "#fff" }
}

function isDriver(t: string)     { return t === "TRAIN_DRIVER" }
function isUnassigned(m: CrewMember) { return !m.firstName && !m.lastName }

// ── Eurostar logo ─────────────────────────────────────────────────────────────

function EurostarLogo() {
  return (
    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#f59e0b,#d97706)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 10px rgba(245,158,11,0.45)" }}>
      <svg width="22" height="18" viewBox="0 0 22 18" fill="none" aria-hidden>
        <path d="M2 0h14a4 4 0 010 8H2V0z" fill="white"/>
        <path d="M2 5h10v3H2z" fill="rgba(245,158,11,0.5)"/>
        <path d="M2 9h14a4 4 0 010 8H2V9z" fill="white"/>
        <circle cx="19" cy="3" r="3" fill="white"/>
        <path d="M18 3h2M19 2v2" stroke="#d97706" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    </div>
  )
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function DriverHatSVG() {
  return (
    <svg width="24" height="18" viewBox="0 0 24 18" fill="none" aria-hidden>
      <rect x="0" y="12" width="24" height="5" rx="2.5" fill="white" opacity="0.9"/>
      <rect x="4" y="2" width="16" height="12" rx="3" fill="white" opacity="0.9"/>
      <rect x="4" y="9" width="16" height="3" fill="rgba(0,0,0,0.15)"/>
      <circle cx="12" cy="1.5" r="1.5" fill="white" opacity="0.7"/>
    </svg>
  )
}

function PersonSVG() {
  return (
    <svg width="18" height="20" viewBox="0 0 18 20" fill="none" aria-hidden>
      <circle cx="9" cy="5" r="4.5" fill="white" opacity="0.7"/>
      <path d="M0 18c0-4.97 4.03-9 9-9s9 4.03 9 9" fill="white" opacity="0.7"/>
    </svg>
  )
}

function CrewAvatar({ m, index }: { readonly m: CrewMember; readonly index: number }) {
  if (isDriver(m.crewType) && isUnassigned(m)) {
    return (
      <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#94a3b8", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <PersonSVG />
      </div>
    )
  }
  if (isDriver(m.crewType)) {
    return (
      <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#1e293b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <DriverHatSVG />
      </div>
    )
  }
  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 420, damping: 20 }}
      style={{ width: 38, height: 38, borderRadius: "50%", background: "#0d9488", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontWeight: 800, fontSize: 13, color: "#fff", letterSpacing: "-0.5px", fontFamily: "system-ui,sans-serif" }}
    >
      {initials(m.firstName, m.lastName)}
    </motion.div>
  )
}

// ── Member row ────────────────────────────────────────────────────────────────

function MemberRow({ m, index, isLast }: { readonly m: CrewMember; readonly index: number; readonly isLast: boolean }) {
  const badge  = roleBadge(m.crewType)
  const name   = isUnassigned(m) ? "DRIVER (Unassigned)" : [m.firstName, m.lastName].filter(Boolean).join(" ")
  const tmNote = isDriver(m.crewType) && m.crewId ? `TM: ${name}` : null

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.06, type: "spring", stiffness: 320, damping: 26 }}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", borderBottom: isLast ? "none" : "1px solid #f1f5f9", background: "#fff" }}
    >
      <CrewAvatar m={m} index={index} />

      {/* Name + role + ID */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const, marginBottom: 3 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: isUnassigned(m) ? "#94a3b8" : "#111827", fontFamily: "system-ui,sans-serif", whiteSpace: "nowrap" as const }}>
            {name}
          </span>
          <span style={{ background: badge.bg, color: badge.text, fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 999, letterSpacing: "0.04em", whiteSpace: "nowrap" as const, fontFamily: "system-ui,sans-serif" }}>
            {roleLabel(m.crewType)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#94a3b8", fontFamily: "system-ui,sans-serif" }}>
          {tmNote
            ? <span>{tmNote}</span>
            : <>
                <span style={{ fontFamily: "monospace", letterSpacing: "-0.3px" }}>{m.crewId}</span>
                {m.homeDepot && <><span>·</span><MapPin size={9} style={{ color: "#cbd5e1", flexShrink: 0 }} /><span>{m.homeDepot}</span></>}
              </>
          }
        </div>
      </div>

      {/* Route + times */}
      <div style={{ flexShrink: 0, textAlign: "right" as const }}>
        {(m.origin || m.destination) && (
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", marginBottom: 2, fontFamily: "system-ui,sans-serif", letterSpacing: "-0.2px" }}>
            {m.origin} → {m.destination}
          </div>
        )}
        {(m.dep || m.arr) && (
          <div style={{ fontSize: 10, color: "#94a3b8", fontFamily: "system-ui,sans-serif" }}>
            {m.dep && <span>Dept: <span style={{ color: "#64748b", fontWeight: 600 }}>{m.dep}</span></span>}
            {m.dep && m.arr && <span>  </span>}
            {m.arr && <span>Arr: <span style={{ color: "#64748b", fontWeight: 600 }}>{m.arr}</span></span>}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ── Day crew card ─────────────────────────────────────────────────────────────

function DayCrewCard({ data }: { readonly data: DayData }) {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })

  const serviceOrder: string[] = []
  const byService: Record<string, CrewMember[]> = {}
  for (const m of data.crew) {
    if (!byService[m.serviceCode]) { byService[m.serviceCode] = []; serviceOrder.push(m.serviceCode) }
    byService[m.serviceCode].push(m)
  }

  let rowIndex = 0

  return (
    <motion.div
      ref={ref}
      style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", fontFamily: "system-ui,sans-serif" }}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#001f4d 0%,#003388 60%,#0050cc 100%)", padding: "14px 16px", position: "relative", overflow: "hidden" }}>
        {/* Shimmer */}
        <motion.div
          style={{ position: "absolute", inset: 0, background: "linear-gradient(105deg,transparent 35%,rgba(255,255,255,0.06) 50%,transparent 65%)", pointerEvents: "none" }}
          animate={{ x: ["-100%","200%"] }}
          transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut", repeatDelay: 2.5 }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <EurostarLogo />
            <div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: "-0.3px" }}>Crew on Duty</div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 1 }}>{data.date}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.12)", borderRadius: 999, padding: "5px 12px" }}>
            <Users size={12} style={{ color: "rgba(255,255,255,0.7)" }} />
            <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 11, fontWeight: 700 }}>{data.crew.length} crew</span>
          </div>
        </div>
      </div>

      {/* Service groups */}
      {serviceOrder.map((svc, si) => {
        const members = byService[svc]
        const first = members[0]
        const allStops = [...new Set(members.map(m => m.origin))].join("/") + " → " + [...new Set(members.map(m => m.destination))].join("/")
        const svcOrigin = first.origin, svcDest = first.destination, svcDep = first.dep, svcArr = first.arr
        return (
          <div key={svc} style={{ borderBottom: si < serviceOrder.length - 1 ? "4px solid #f1f5f9" : "none" }}>
            {/* Service header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <Train size={13} style={{ color: "#1d4ed8", flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: "#1e293b" }}>SERVICE {svc}:</span>
                <span style={{ fontSize: 11, color: "#64748b" }}>
                  {svcOrigin} → {svcDest}
                </span>
              </div>
              {(svcDep || svcArr) && (
                <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#64748b" }}>
                  <Clock size={11} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#374151", fontFamily: "monospace" }}>{svcDep} – {svcArr}</span>
                </div>
              )}
            </div>

            {/* Rows */}
            {members.map((m, i) => {
              const idx = rowIndex++
              return <MemberRow key={`${m.crewId}-${svc}-${i}`} m={m} index={idx} isLast={i === members.length - 1} />
            })}
          </div>
        )
      })}
    </motion.div>
  )
}

// ── Monthly schedule card ─────────────────────────────────────────────────────

function MonthlyScheduleCard({ data }: { readonly data: MonthlyData }) {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const [yr, mo] = data.yearMonth.split("-")
  const monthLabel = new Date(`${yr}-${mo}-01`).toLocaleString("en-GB", { month: "long", year: "numeric" })

  return (
    <motion.div
      ref={ref}
      style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", fontFamily: "system-ui,sans-serif" }}
      initial={{ opacity: 0, y: 20 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {/* Header */}
      <div style={{ background: "linear-gradient(135deg,#001f4d 0%,#003388 60%,#0050cc 100%)", padding: "14px 16px", position: "relative", overflow: "hidden" }}>
        <motion.div
          style={{ position: "absolute", inset: 0, background: "linear-gradient(105deg,transparent 35%,rgba(255,255,255,0.06) 50%,transparent 65%)", pointerEvents: "none" }}
          animate={{ x: ["-100%","200%"] }}
          transition={{ repeat: Infinity, duration: 3.5, ease: "easeInOut", repeatDelay: 2.5 }}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <EurostarLogo />
            <div>
              <div style={{ color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: "-0.3px" }}>{data.crewName || data.crewId}</div>
              <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, marginTop: 1 }}>{data.crewId} · {monthLabel}</div>
            </div>
          </div>
          <div style={{ textAlign: "center" as const }}>
            <div style={{ color: "#f59e0b", fontSize: 28, fontWeight: 900, lineHeight: 1, textShadow: "0 0 20px rgba(245,158,11,0.4)", fontFamily: "monospace" }}>{data.shifts.length}</div>
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>shifts</div>
          </div>
        </div>
      </div>

      {/* Shifts */}
      <div style={{ background: "#fff" }}>
        {data.shifts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "32px", color: "#94a3b8", fontSize: 13 }}>No shifts found this month</div>
        ) : data.shifts.map((s, i) => (
          <motion.div
            key={`${s.date}-${s.serviceCode}`}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 16px", borderBottom: i < data.shifts.length - 1 ? "1px solid #f1f5f9" : "none", background: i % 2 === 0 ? "#fafafa" : "#fff" }}
            initial={{ opacity: 0, x: -10 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: i * 0.03, duration: 0.22, ease: "easeOut" }}
          >
            <div style={{ flexShrink: 0, width: 44, textAlign: "center" as const }}>
              <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "uppercase" as const, fontWeight: 600, letterSpacing: "0.06em" }}>{s.weekday}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#1d4ed8" }}>{s.date.slice(8)}</div>
            </div>
            <div style={{ width: 1, height: 28, background: "#e2e8f0", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <Train size={12} style={{ color: "#1d4ed8", flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "#1e293b" }}>Svc {s.serviceCode}</span>
              <span style={{ fontSize: 11, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{s.origin} → {s.destination}</span>
            </div>
            <div style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: "#374151", fontFamily: "monospace" }}>{s.dep}–{s.arr}</div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}

// ── Export ────────────────────────────────────────────────────────────────────

export function CrewCard({ result }: { readonly result: string }) {
  const monthly = parseMonthlyData(result)
  if (monthly) return <MonthlyScheduleCard data={monthly} />
  const day = parseDayData(result)
  if (day) return <DayCrewCard data={day} />
  return null
}
