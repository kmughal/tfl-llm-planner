import { motion } from "framer-motion"
import { Activity, Train, Zap } from "lucide-react"

type JourneyStop = {
  index: number
  code: string
  name: string
  pointType: string
  arrival: string
  departure: string
  passing: string
}

type JourneyEvent = {
  code: string
  eventType: string
  time: string
  source: string
  correction: boolean
}

type JourneyCardData = {
  date: string
  serviceNumber: string
  status: string
  origin: string
  destination: string
  departure: string
  arrival: string
  trainSet: string
  equipment: string
  routeType: string
  actual?: { code: string; eventType: string; time: string; source: string }
  stops: JourneyStop[]
  events: JourneyEvent[]
}

function parse(result: string): JourneyCardData | null {
  const data: JourneyCardData = {
    date: "",
    serviceNumber: "",
    status: "",
    origin: "",
    destination: "",
    departure: "",
    arrival: "",
    trainSet: "",
    equipment: "",
    routeType: "",
    stops: [],
    events: [],
  }

  for (const line of result.split(/\r?\n/)) {
    if (line.startsWith("PROJ_JOURNEY_START:")) {
      const parts = line.slice("PROJ_JOURNEY_START:".length).split("|")
      ;[data.date, data.serviceNumber, data.status, data.origin, data.destination, data.departure, data.arrival, data.trainSet, data.equipment, data.routeType] = parts
    } else if (line.startsWith("PROJ_JOURNEY_ACTUAL:")) {
      const [code, eventType, time, source] = line.slice("PROJ_JOURNEY_ACTUAL:".length).split("|")
      data.actual = { code, eventType, time, source }
    } else if (line.startsWith("PROJ_JOURNEY_STOP:")) {
      const [index, code, name, pointType, arrival, departure, passing] = line.slice("PROJ_JOURNEY_STOP:".length).split("|")
      data.stops.push({ index: Number(index), code, name, pointType, arrival, departure, passing })
    } else if (line.startsWith("PROJ_JOURNEY_EVENT:")) {
      const [code, eventType, time, source, correction] = line.slice("PROJ_JOURNEY_EVENT:".length).split("|")
      data.events.push({ code, eventType, time, source, correction: correction === "true" })
    }
  }

  return data.serviceNumber ? data : null
}

export function ProjectionJourneyCard({ result }: { readonly result: string }) {
  const data = parse(result)
  if (!data) return null

  const activeIndex = Math.max(0, data.stops.findIndex(stop => stop.code === data.actual?.code))
  const progress = data.stops.length <= 1 ? 0 : activeIndex / (data.stops.length - 1)

  return (
    <motion.div
      className="overflow-hidden rounded-[28px] border"
      style={{ background: "linear-gradient(180deg, #071223, #0a1a35)", borderColor: "rgba(96,165,250,0.2)" }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="border-b px-5 py-4" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em]" style={{ background: "rgba(37,99,235,0.18)", color: "#93c5fd" }}>
            Projection Journey
          </div>
          <div className="text-sm font-black" style={{ color: "#f8fafc" }}>
            {data.serviceNumber} · {data.origin} → {data.destination}
          </div>
        </div>
        <div className="mt-2 text-sm" style={{ color: "rgba(255,255,255,0.58)" }}>
          {data.date} · {data.departure} → {data.arrival} {data.trainSet ? `· ${data.trainSet}` : ""}
        </div>
      </div>

      <div className="px-5 py-5">
        <div className="relative h-16">
          <div className="absolute left-0 right-0 top-8 h-[3px] rounded-full" style={{ background: "rgba(148,163,184,0.26)" }} />
          <motion.div className="absolute left-0 top-8 h-[3px] rounded-full" style={{ width: `${progress * 100}%`, background: "linear-gradient(90deg, #22d3ee, #60a5fa)" }} />
          {data.stops.map((stop, index) => {
            const left = data.stops.length <= 1 ? 0 : (index / (data.stops.length - 1)) * 100
            const active = index <= activeIndex
            return (
              <div key={`${stop.index}-${stop.code}`} className="absolute top-3 -translate-x-1/2" style={{ left: `${left}%` }}>
                <div className="text-[10px] font-bold uppercase text-center" style={{ color: active ? "#e0f2fe" : "rgba(255,255,255,0.4)" }}>
                  {stop.code}
                </div>
                <div className="mx-auto mt-2 h-4 w-4 rounded-full border-2" style={{ borderColor: active ? "#7dd3fc" : "rgba(255,255,255,0.2)" }} />
              </div>
            )
          })}
          <motion.div
            className="absolute top-1 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-2xl"
            style={{ left: `${progress * 100}%`, background: "rgba(15,23,42,0.92)", border: "1px solid rgba(96,165,250,0.3)" }}
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 2.2, repeat: Infinity }}
          >
            <Train style={{ width: 24, height: 24, color: "#7dd3fc" }} />
          </motion.div>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="flex flex-col gap-3">
            {data.stops.map((stop, index) => (
              <div
                key={`${stop.index}-${stop.code}-row`}
                className="rounded-2xl border px-4 py-3"
                style={{
                  borderColor: index === activeIndex ? "rgba(125,211,252,0.38)" : "rgba(255,255,255,0.08)",
                  background: index === activeIndex ? "rgba(8,47,73,0.22)" : "rgba(255,255,255,0.03)",
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold" style={{ color: "#f8fafc" }}>{stop.name}</div>
                    <div className="mt-1 text-xs uppercase" style={{ color: "rgba(255,255,255,0.45)" }}>{stop.pointType}</div>
                  </div>
                  <div className="text-right text-xs" style={{ color: "rgba(255,255,255,0.68)" }}>
                    <div>Arr {stop.arrival || "—"}</div>
                    <div>Dep {stop.departure || "—"}</div>
                    {stop.passing && <div>Pass {stop.passing}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-2xl border px-4 py-4" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "#93c5fd" }}>
                <Activity size={14} /> Last Confirmed
              </div>
              <div className="mt-2 text-sm font-bold" style={{ color: "#f8fafc" }}>
                {data.actual ? `${data.actual.code} · ${data.actual.eventType}` : "Planned only"}
              </div>
              <div className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>
                {data.actual ? `${data.actual.time} via ${data.actual.source}` : "No beacon or GPS event in this result"}
              </div>
            </div>
            <div className="rounded-2xl border px-4 py-4" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]" style={{ color: "#93c5fd" }}>
                <Zap size={14} /> Signal Stream
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {data.events.slice(-6).map((event, index) => (
                  <div key={`${event.code}-${event.time}-${index}`} className="rounded-xl border px-3 py-2" style={{ borderColor: "rgba(255,255,255,0.07)", background: event.source === "beacon" ? "rgba(8,47,73,0.22)" : "rgba(30,41,59,0.36)" }}>
                    <div className="text-sm font-bold" style={{ color: "#f8fafc" }}>{event.code} · {event.eventType}</div>
                    <div className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.48)" }}>{event.time} via {event.source}</div>
                  </div>
                ))}
                {data.events.length === 0 && (
                  <div className="text-xs" style={{ color: "rgba(255,255,255,0.48)" }}>
                    No beacon or GPS events were returned.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
