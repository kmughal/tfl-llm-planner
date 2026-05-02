import { useRef } from "react"
import { motion, useInView } from "framer-motion"
import { Train, Clock, MapPin } from "lucide-react"

const SNCF_ORANGE = "#E05206"

interface StopEntry {
  name: string
  arr: string
  dep: string
}

interface TrainSchedule {
  trainNumber: string
  name: string
  direction: string
  stops: StopEntry[]
}

function parseTrainSchedules(raw: string): TrainSchedule[] {
  const schedules: TrainSchedule[] = []
  let current: TrainSchedule | null = null

  for (const line of raw.split("\n")) {
    const t = line.trim()
    if (t.startsWith("TRAIN_START:")) {
      const p = t.slice("TRAIN_START:".length).split("|")
      current = { trainNumber: p[0] ?? "", name: p[1] ?? "", direction: p[2] ?? "", stops: [] }
    } else if (t === "TRAIN_END" && current) {
      schedules.push(current)
      current = null
    } else if (t.startsWith("STOP:") && current) {
      const p = t.slice(5).split("|")
      current.stops.push({ name: p[0] ?? "", arr: p[1] ?? "", dep: p[2] ?? "" })
    }
  }

  return schedules
}

function timeToMinutes(t: string): number {
  const parts = t.split(":")
  if (parts.length < 2) return 0
  return parseInt(parts[0]) * 60 + parseInt(parts[1])
}

function journeyDuration(stops: StopEntry[]): string {
  if (stops.length < 2) return ""
  const first = stops[0]
  const last = stops[stops.length - 1]
  const depTime = first.dep || first.arr
  const arrTime = last.arr || last.dep
  if (!depTime || !arrTime) return ""
  const mins = timeToMinutes(arrTime) - timeToMinutes(depTime)
  if (mins <= 0) return ""
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}` : `${m} min`
}

function currentProgress(stops: StopEntry[]): number | null {
  const now = new Date()
  const nowMins = now.getHours() * 60 + now.getMinutes()

  const times = stops.map(s => timeToMinutes(s.dep || s.arr)).filter(Boolean)
  if (times.length < 2) return null

  const first = times[0]
  const last = times[times.length - 1]
  if (nowMins < first || nowMins > last) return null

  for (let i = 0; i < times.length - 1; i++) {
    if (nowMins >= times[i] && nowMins < times[i + 1]) {
      const segProg = (nowMins - times[i]) / (times[i + 1] - times[i])
      return (i + segProg) / (times.length - 1)
    }
  }
  return null
}

function StopRow({ stop, index, total, inView }: {
  readonly stop: StopEntry
  readonly index: number
  readonly total: number
  readonly inView: boolean
}) {
  const isFirst = index === 0
  const isLast = index === total - 1
  const isTerminal = isFirst || isLast
  const delay = index * 0.22

  const displayTime = isFirst
    ? (stop.dep || stop.arr)
    : isLast
    ? (stop.arr || stop.dep)
    : null
  const hasBoth = !isFirst && !isLast && stop.arr && stop.dep && stop.arr !== stop.dep

  return (
    <div className="flex items-stretch gap-4 min-w-0">
      {/* Track column */}
      <div className="flex flex-col items-center shrink-0" style={{ width: 24 }}>
        <motion.div
          className="z-10 rounded-full border-2 shrink-0"
          style={{
            width: isTerminal ? 20 : 12,
            height: isTerminal ? 20 : 12,
            borderColor: SNCF_ORANGE,
            backgroundColor: isTerminal ? SNCF_ORANGE : "#fff",
            boxShadow: isTerminal ? `0 0 0 5px ${SNCF_ORANGE}22` : `0 0 0 3px ${SNCF_ORANGE}15`,
          }}
          initial={{ scale: 0 }}
          animate={inView ? { scale: 1 } : {}}
          transition={{ delay, type: "spring", stiffness: 520, damping: 22 }}
          whileHover={{ scale: 1.5, boxShadow: `0 0 0 8px ${SNCF_ORANGE}28` }}
        />
        {!isLast && (
          <motion.div
            className="flex-1 w-0.5 min-h-[20px]"
            style={{ backgroundColor: `${SNCF_ORANGE}35` }}
            initial={{ scaleY: 0, originY: "top" as const }}
            animate={inView ? { scaleY: 1 } : {}}
            transition={{ delay: delay + 0.1, duration: 0.22 }}
          />
        )}
      </div>

      {/* Content */}
      <motion.div
        className="flex items-center justify-between flex-1 pb-4 min-w-0"
        style={{ paddingTop: isTerminal ? 1 : 0 }}
        initial={{ opacity: 0, x: 10 }}
        animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ delay: delay + 0.1, duration: 0.24 }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {isTerminal && (
            <MapPin className="w-3 h-3 shrink-0" style={{ color: SNCF_ORANGE }} />
          )}
          <span
            className="text-sm truncate"
            style={{
              fontWeight: isTerminal ? 700 : 400,
              color: isTerminal ? "#111827" : "#374151",
            }}
          >
            {stop.name}
          </span>
        </div>

        <div className="flex flex-col items-end shrink-0 ml-3">
          {hasBoth ? (
            <>
              <span className="text-[9px] tabular-nums text-gray-400 leading-tight">arr {stop.arr}</span>
              <span className="text-[11px] font-bold tabular-nums leading-tight" style={{ color: SNCF_ORANGE }}>
                dep {stop.dep}
              </span>
            </>
          ) : displayTime ? (
            <span
              className="tabular-nums font-bold"
              style={{ fontSize: isTerminal ? 17 : 12, color: isTerminal ? SNCF_ORANGE : "#6b7280" }}
            >
              {displayTime}
            </span>
          ) : null}
        </div>
      </motion.div>
    </div>
  )
}

function TrainCard({ schedule }: { readonly schedule: TrainSchedule }) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: "-40px" })
  const duration = journeyDuration(schedule.stops)
  const progress = currentProgress(schedule.stops)
  const origin = schedule.stops[0]?.name ?? ""
  const destination = schedule.stops[schedule.stops.length - 1]?.name ?? schedule.direction

  return (
    <motion.div
      ref={ref}
      className="rounded-2xl overflow-hidden shadow-lg border"
      style={{ borderColor: `${SNCF_ORANGE}25` }}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: "easeOut" }}
    >
      {/* Header */}
      <div
        className="relative overflow-hidden px-4 py-4"
        style={{ background: `linear-gradient(135deg, #1a0800 0%, #3d1500 50%, #1a0800 100%)` }}
      >
        {/* Animated shimmer */}
        <motion.div
          className="absolute inset-y-0 w-32 pointer-events-none"
          style={{ background: "linear-gradient(to right, transparent, rgba(224,82,6,0.12), transparent)" }}
          animate={{ x: [-128, 600] }}
          transition={{ duration: 3.5, repeat: Infinity, ease: "linear", repeatDelay: 3 }}
        />

        <div className="relative">
          {/* Train number row */}
          <div className="flex items-center gap-3 mb-2">
            <div
              className="flex items-center gap-2 px-3 py-1 rounded-lg"
              style={{ backgroundColor: SNCF_ORANGE }}
            >
              <Train className="w-3.5 h-3.5 text-white shrink-0" />
              <span className="text-white font-black text-sm tracking-tight">{schedule.name || schedule.trainNumber}</span>
            </div>
            {duration && (
              <div className="flex items-center gap-1.5 ml-auto" style={{ color: "rgba(255,255,255,0.6)" }}>
                <Clock className="w-3 h-3 shrink-0" />
                <span className="text-[12px] font-semibold tabular-nums">{duration}</span>
              </div>
            )}
          </div>

          {/* Origin → Destination */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-white/90 font-semibold truncate max-w-[130px]">{origin}</span>
            <motion.div
              className="flex-1 h-px min-w-[20px]"
              style={{ backgroundColor: `${SNCF_ORANGE}60` }}
              initial={{ scaleX: 0, originX: "left" as const }}
              animate={inView ? { scaleX: 1 } : {}}
              transition={{ delay: 0.3, duration: 0.5 }}
            />
            <span className="text-white font-bold truncate max-w-[130px] text-right">{destination}</span>
          </div>
        </div>
      </div>

      {/* Progress bar (only shown when train is en route) */}
      {progress !== null && (
        <div className="px-4 py-2 border-b" style={{ backgroundColor: "#fff9f5", borderColor: `${SNCF_ORANGE}15` }}>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: SNCF_ORANGE }}>En route</span>
            <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: SNCF_ORANGE }}
                initial={{ width: 0 }}
                animate={inView ? { width: `${progress * 100}%` } : {}}
                transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
              />
            </div>
            <span className="text-[9px] tabular-nums font-mono" style={{ color: SNCF_ORANGE }}>
              {Math.round(progress * 100)}%
            </span>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="bg-white px-5 pt-4 pb-2">
        <div className="text-[9px] font-bold uppercase tracking-widest mb-3" style={{ color: `${SNCF_ORANGE}99` }}>
          Schedule · {schedule.stops.length} stops
        </div>
        {schedule.stops.map((stop, i) => (
          <StopRow
            key={`${stop.name}-${i}`}
            stop={stop}
            index={i}
            total={schedule.stops.length}
            inView={inView}
          />
        ))}
      </div>
    </motion.div>
  )
}

export function SNCFTrain({ result }: { readonly result: string }) {
  const schedules = parseTrainSchedules(result)
  if (schedules.length === 0) return null
  return (
    <div className="flex flex-col gap-3">
      {schedules.map((s, i) => (
        <TrainCard key={`${s.trainNumber}-${i}`} schedule={s} />
      ))}
    </div>
  )
}
