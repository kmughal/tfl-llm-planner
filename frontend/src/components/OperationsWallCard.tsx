import { motion } from "framer-motion"
import { AlertTriangle, GitBranch, Globe2, Network } from "lucide-react"
import { eurostarDisplayClass, useEurostarDisplay } from "./EurostarDisplay"

type CardData = {
  overview: {
    narrative: string
    networksLive: number
    activeServices: number
    watchedServices: number
    networkAlerts: number
    crewCoverage: number
    disruptionPoints: number
  }
  eurostar: { servicesToday: number; active: number; watched: number; cancelled: number }
  tfl: { disrupted: number; roadIssues: number }
  sncf: { incidents: Array<unknown> }
  nationalRail: { delayed: number }
  paris: { delayed: number }
  correlations: Array<{ headline: string; explanation: string }>
  propagations: Array<{ title: string; summary: string }>
  fetchedAt?: string
}

function parseCardData(result: string): CardData | null {
  try {
    return JSON.parse(result) as CardData
  } catch {
    return null
  }
}

export function OperationsWallCard({ result }: { readonly result: string }) {
  const { theme, compact } = useEurostarDisplay()
  const data = parseCardData(result)
  if (!data) return null

  const updated = data.fetchedAt
    ? new Date(data.fetchedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "--:--:--"

  return (
    <motion.section
      className={`${eurostarDisplayClass(theme, compact)} es-themed-panel w-full overflow-hidden rounded-[28px] border`}
      style={{
        borderColor: "rgba(125,211,252,0.18)",
        background: "linear-gradient(135deg, rgba(4,12,28,0.98), rgba(8,14,28,0.92) 52%, rgba(9,24,52,0.94))",
        boxShadow: "0 24px 80px rgba(2,6,23,0.28)",
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="border-b px-5 py-4 text-white" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/15 text-cyan-300">
            <Globe2 size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">Cross-border</div>
            <div className="text-lg font-black">Operations Wall</div>
          </div>
          <div className="text-right text-[11px] text-white/45">Updated {updated}</div>
        </div>
        <div className="mt-4 text-2xl font-black leading-tight text-white">{data.overview.narrative}</div>
        <div className="mt-2 text-sm leading-6 text-white/62">
          {data.overview.networksLive} networks live, {data.overview.activeServices} active services, {data.overview.watchedServices} watched services, {data.overview.networkAlerts} alerts.
        </div>
      </div>

      <div className="grid gap-3 px-5 py-4 md:grid-cols-4">
        {[
          { label: "Live networks", value: data.overview.networksLive, tint: "#38bdf8" },
          { label: "Active services", value: data.overview.activeServices, tint: "#c084fc" },
          { label: "Watched", value: data.overview.watchedServices, tint: "#f59e0b" },
          { label: "Crewed Eurostar", value: data.overview.crewCoverage, tint: "#22c55e" },
        ].map(item => (
          <div key={item.label} className="rounded-[22px] border px-4 py-3" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
            <div className="text-2xl font-black" style={{ color: item.tint }}>{item.value}</div>
            <div className="mt-1 text-[11px] text-white/45">{item.label}</div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 px-5 pb-5 xl:grid-cols-[minmax(0,1fr)_minmax(280px,.9fr)]">
        <div className="rounded-[24px] border p-4" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)" }}>
          <div className="mb-3 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200">
            <Network size={14} /> Network slice
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border px-3 py-3" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
              <div className="text-sm font-black text-white">Eurostar</div>
              <div className="mt-1 text-[11px] text-white/55">{data.eurostar.servicesToday} services · {data.eurostar.active} active · {data.eurostar.watched} watched</div>
            </div>
            <div className="rounded-2xl border px-3 py-3" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
              <div className="text-sm font-black text-white">TfL</div>
              <div className="mt-1 text-[11px] text-white/55">{data.tfl.disrupted} disrupted lines · {data.tfl.roadIssues} road issues</div>
            </div>
            <div className="rounded-2xl border px-3 py-3" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
              <div className="text-sm font-black text-white">SNCF</div>
              <div className="mt-1 text-[11px] text-white/55">{data.sncf.incidents.length} incidents across French rail</div>
            </div>
            <div className="rounded-2xl border px-3 py-3" style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)" }}>
              <div className="text-sm font-black text-white">Onward links</div>
              <div className="mt-1 text-[11px] text-white/55">{data.nationalRail.delayed} National Rail delayed · {data.paris.delayed} Paris delayed</div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {data.correlations[0] && (
            <div className="rounded-[24px] border p-4" style={{ borderColor: "rgba(251,191,36,0.2)", background: "rgba(120,53,15,0.18)" }}>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-amber-200">
                <AlertTriangle size={14} /> Top correlation
              </div>
              <div className="text-sm font-black text-white">{data.correlations[0].headline}</div>
              <div className="mt-1 text-[11px] leading-5 text-white/65">{data.correlations[0].explanation}</div>
            </div>
          )}
          {data.propagations[0] && (
            <div className="rounded-[24px] border p-4" style={{ borderColor: "rgba(56,189,248,0.2)", background: "rgba(8,47,73,0.22)" }}>
              <div className="mb-2 flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-cyan-200">
                <GitBranch size={14} /> Primary propagation
              </div>
              <div className="text-sm font-black text-white">{data.propagations[0].title}</div>
              <div className="mt-1 text-[11px] leading-5 text-white/65">{data.propagations[0].summary}</div>
            </div>
          )}
        </div>
      </div>
    </motion.section>
  )
}
