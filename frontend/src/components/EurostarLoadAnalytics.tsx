import { useCallback, useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Activity, BarChart3, CalendarDays, RefreshCw, Train, TrendingUp, Users, X } from "lucide-react"

const API = (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8080"
const EUROSTAR_BLUE = "#003366"
const EUROSTAR_GOLD = "#C89A0C"
const INK = "#101828"

type EuromapStation = {
  stopType: string
  shortCode: string
}

type EuromapPlan = {
  status: string
  serviceCode: string
  departureDateTime: string
  arrivalDateTime: string
  stations: EuromapStation[]
}

type TravelerService = {
  serviceCode: string
  totalCount: number
  origin: string
  destination: string
  classes: Record<string, number>
  types: Record<string, number>
}

type TravelerSummary = {
  date: string
  services: number
  totalPassengers: number
  busiestService: string
  peakLoad: number
  items: TravelerService[]
}

type AnalyticsData = {
  traveler: TravelerSummary
  trains: EuromapPlan[]
}

const STATION_NAMES: Record<string, string> = {
  SPX: "London St Pancras",
  PNO: "Paris Gare du Nord",
  BXL: "Brussels-Midi",
  BRU: "Brussels-Midi",
  LIL: "Lille Europe",
  AMS: "Amsterdam Centraal",
  ASD: "Amsterdam Centraal",
  RTD: "Rotterdam Centraal",
  RDM: "Rotterdam Centraal",
  EBF: "Ebbsfleet International",
  ASH: "Ashford International",
  CFR: "Calais-Frethun",
  FTN: "Calais-Frethun",
}

const CLASS_META: Record<string, { label: string; color: string }> = {
  standard: { label: "Standard", color: "#0ea5e9" },
  comfort: { label: "Comfort", color: EUROSTAR_GOLD },
  premium: { label: "Premium", color: "#1d4ed8" },
}

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  active: { label: "Active", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  cancelled: { label: "Cancelled", color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  delayed: { label: "Delayed", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  other: { label: "Other", color: "#64748b", bg: "rgba(100,116,139,0.12)" },
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function normalizeServiceCode(value: string) {
  return value.replaceAll(/\D/g, "").replace(/^0+/, "").slice(-4)
}

function stationName(code: string) {
  return STATION_NAMES[code?.toUpperCase()] ?? code
}

function originCode(plan?: EuromapPlan) {
  return plan?.stations.find(stop => stop.stopType?.toLowerCase() === "origin")?.shortCode ?? plan?.stations[0]?.shortCode ?? "TBC"
}

function destCode(plan?: EuromapPlan) {
  return plan?.stations.find(stop => stop.stopType?.toLowerCase() === "destination")?.shortCode ?? plan?.stations.at(-1)?.shortCode ?? "TBC"
}

function fmtTime(value?: string) {
  if (!value) return "--:--"
  try {
    return new Date(value).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
  } catch {
    return "--:--"
  }
}

function statusKey(status?: string) {
  const value = (status ?? "").toUpperCase()
  if (value === "ON_TIME" || value === "ACTIVE") return "active"
  if (value.includes("CANCEL") || value.includes("DELETE") || value.includes("SUSPEND")) return "cancelled"
  if (value.includes("DELAY")) return "delayed"
  return "other"
}

function statusLabel(status?: string) {
  return STATUS_META[statusKey(status)]?.label ?? "Other"
}

async function loadAnalytics(date: string): Promise<AnalyticsData> {
  const [travelerRes, trainsRes] = await Promise.all([
    fetch(`${API}/api/eurostar/traveler-summary?date=${date}`),
    fetch(`${API}/api/eurostar/trains?date=${date}`),
  ])
  if (!travelerRes.ok) throw new Error("Eurostar passenger load is unavailable")
  if (!trainsRes.ok) throw new Error("Eurostar trains are unavailable")
  return {
    traveler: await travelerRes.json(),
    trains: await trainsRes.json(),
  }
}

function MetricTile({ label, value, sub, tone }: { readonly label: string; readonly value: string | number; readonly sub: string; readonly tone: string }) {
  return (
    <div className="rounded-[24px] border bg-white px-4 py-4 shadow-[0_10px_28px_rgba(0,0,0,.04)]" style={{ borderColor: "#e7ecf3" }}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "#667085" }}>{label}</div>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone }} />
      </div>
      <div className="mt-2 text-3xl font-black tabular-nums" style={{ color: INK }}>{value}</div>
      <div className="mt-1 text-xs" style={{ color: "#667085" }}>{sub}</div>
    </div>
  )
}

export function EurostarLoadAnalytics({ onClose }: { readonly onClose: () => void }) {
  const [date, setDate] = useState(todayDate())
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedServiceCode, setSelectedServiceCode] = useState<string | null>(null)
  const [hoveredServiceCode, setHoveredServiceCode] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const next = await loadAnalytics(date)
      setData(next)
      setError(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Eurostar analytics are unavailable")
    } finally {
      setLoading(false)
    }
  }, [date])

  useEffect(() => {
    void load()
  }, [load])

  const merged = useMemo(() => {
    const trainByService = new Map<string, EuromapPlan>()
    for (const train of data?.trains ?? []) {
      trainByService.set(normalizeServiceCode(train.serviceCode), train)
    }
    return (data?.traveler.items ?? [])
      .map(item => ({ item, train: trainByService.get(normalizeServiceCode(item.serviceCode)) }))
      .sort((a, b) => (a.train?.departureDateTime ?? "").localeCompare(b.train?.departureDateTime ?? ""))
  }, [data])

  const classTotals = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const row of data?.traveler.items ?? []) {
      for (const [key, value] of Object.entries(row.classes)) totals[key] = (totals[key] ?? 0) + value
    }
    return Object.entries(totals).sort((a, b) => b[1] - a[1])
  }, [data])

  const routeTotals = useMemo(() => {
    const totals = new Map<string, number>()
    for (const row of merged) {
      const origin = row.train ? stationName(originCode(row.train)) : row.item.origin
      const dest = row.train ? stationName(destCode(row.train)) : row.item.destination
      const key = `${origin} - ${dest}`
      totals.set(key, (totals.get(key) ?? 0) + row.item.totalCount)
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [merged])

  const statusTotals = useMemo(() => {
    const totals: Record<string, number> = { active: 0, cancelled: 0, delayed: 0, other: 0 }
    for (const train of data?.trains ?? []) {
      totals[statusKey(train.status)] += 1
    }
    return totals
  }, [data])

  const activeNow = useMemo(() => {
    const now = Date.now()
    return (data?.trains ?? []).filter(train => {
      const dep = new Date(train.departureDateTime).getTime()
      const arr = new Date(train.arrivalDateTime).getTime()
      return dep > 0 && arr > 0 && dep <= now && now <= arr && statusKey(train.status) !== "cancelled"
    }).length
  }, [data])

  const loadedCoverage = useMemo(() => {
    const travelerServices = new Set((data?.traveler.items ?? []).map(item => normalizeServiceCode(item.serviceCode)))
    let matched = 0
    for (const train of data?.trains ?? []) {
      if (travelerServices.has(normalizeServiceCode(train.serviceCode))) matched += 1
    }
    return matched
  }, [data])

  const timeline = useMemo(() => {
    const rows = merged
    const maxLoad = Math.max(...rows.map(row => row.item.totalCount), 1)
    return {
      maxLoad,
      rows: rows.map(row => ({
        row,
        status: statusKey(row.train?.status),
        heightPct: Math.max(6, Math.round((row.item.totalCount / maxLoad) * 100)),
      })),
    }
  }, [merged])

  const timelineTickIndexes = useMemo(() => {
    if (timeline.rows.length === 0) return []
    const desired = 10
    const step = Math.max(1, Math.floor(timeline.rows.length / desired))
    const indexes: number[] = []
    for (let index = 0; index < timeline.rows.length; index += step) indexes.push(index)
    const last = timeline.rows.length - 1
    if (!indexes.includes(last)) indexes.push(last)
    return indexes
  }, [timeline.rows])

  useEffect(() => {
    if (merged.length === 0) {
      setSelectedServiceCode(null)
      return
    }
    if (selectedServiceCode && merged.some(row => row.item.serviceCode === selectedServiceCode)) return
    const peak = merged.slice().sort((a, b) => b.item.totalCount - a.item.totalCount)[0]
    setSelectedServiceCode(peak?.item.serviceCode ?? merged[0].item.serviceCode)
  }, [merged, selectedServiceCode])

  const selectedTimelineRow = useMemo(
    () => merged.find(row => row.item.serviceCode === selectedServiceCode) ?? merged[0],
    [merged, selectedServiceCode],
  )
  const hoveredTimelineRow = useMemo(
    () => hoveredServiceCode ? merged.find(row => row.item.serviceCode === hoveredServiceCode) ?? null : null,
    [merged, hoveredServiceCode],
  )

  return (
    <motion.div
      className="fixed inset-0 z-[80] overflow-y-auto bg-[#f5f7fb]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <header className="sticky top-0 z-10 border-b bg-white/88 backdrop-blur-2xl" style={{ borderColor: "#e4e7ec" }}>
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-5 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl text-white" style={{ background: EUROSTAR_BLUE }}>
            <BarChart3 size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-black uppercase" style={{ color: INK }}>Eurostar Load Analytics</h1>
            <p className="text-xs" style={{ color: "#667085" }}>Passenger load by service, route and cabin mix on a selected date</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl border bg-white px-3 py-2" style={{ borderColor: "#d0d5dd" }}>
              <CalendarDays size={15} style={{ color: "#667085" }} />
              <input type="date" value={date} onChange={event => setDate(event.target.value)} className="bg-transparent text-sm font-semibold outline-none" style={{ color: INK }} />
            </div>
            <button type="button" onClick={() => void load()} className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-white" style={{ borderColor: "#d0d5dd", color: "#475467" }}>
              <motion.span animate={loading ? { rotate: 360 } : { rotate: 0 }} transition={{ duration: 0.7, repeat: loading ? Infinity : 0, ease: "linear" }}>
                <RefreshCw size={16} />
              </motion.span>
            </button>
            <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-2xl border bg-white" style={{ borderColor: "#d0d5dd", color: "#475467" }}>
              <X size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-5">
        {error && (
          <div className="mb-4 rounded-2xl border px-4 py-3 text-sm font-semibold" style={{ background: "#fff1f3", borderColor: "#fecdd3", color: "#be123c" }}>
            {error}
          </div>
        )}

        <section className="mb-5 grid grid-cols-4 gap-4 max-lg:grid-cols-2">
          <MetricTile label="Total passengers" value={loading && !data ? "..." : data?.traveler.totalPassengers.toLocaleString("en-GB") ?? "--"} sub="all Eurostar services on the selected date" tone="#f472b6" />
          <MetricTile label="Services" value={loading && !data ? "..." : data?.traveler.services ?? "--"} sub="services with traveler coverage" tone="#38bdf8" />
          <MetricTile label="Peak service" value={loading && !data ? "..." : data?.traveler.peakLoad ?? "--"} sub={data?.traveler.busiestService ? `${data.traveler.busiestService} busiest service` : "highest onboard load"} tone={EUROSTAR_GOLD} />
          <MetricTile label="Average load" value={loading && !data ? "..." : data?.traveler.services ? Math.round(data.traveler.totalPassengers / data.traveler.services) : "--"} sub="mean passengers per service" tone="#22c55e" />
        </section>

        <section className="mb-5 grid grid-cols-4 gap-4 max-lg:grid-cols-2">
          <MetricTile label="Active now" value={loading && !data ? "..." : activeNow} sub="services currently running" tone="#22c55e" />
          <MetricTile label="Cancelled" value={loading && !data ? "..." : statusTotals.cancelled} sub="cancelled or suspended services" tone="#ef4444" />
          <MetricTile label="Delayed" value={loading && !data ? "..." : statusTotals.delayed} sub="services flagged off-plan" tone="#f59e0b" />
          <MetricTile label="Load coverage" value={loading && !data ? "..." : `${loadedCoverage}/${data?.trains.length ?? 0}`} sub="traveler feed matched to trains" tone="#8b5cf6" />
        </section>

        <section className="mb-5 overflow-hidden rounded-[30px] border bg-white p-5 shadow-[0_16px_50px_rgba(0,0,0,.05)]" style={{ borderColor: "#e7ecf3" }}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "#667085" }}>Service timeline</div>
              <div className="mt-1 text-2xl font-black" style={{ color: INK }}>Passenger load across the day</div>
            </div>
            <div className="text-right text-xs" style={{ color: "#667085" }}>
              <div>{merged.length} services plotted</div>
              <div>Date {date}</div>
            </div>
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            {Object.entries(STATUS_META).map(([key, meta]) => (
              <div key={key} className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-bold" style={{ borderColor: meta.bg, background: "white", color: "#475467" }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                <span>{meta.label}</span>
                <span className="tabular-nums" style={{ color: INK }}>{statusTotals[key as keyof typeof statusTotals]}</span>
              </div>
            ))}
          </div>
          <div className="mb-4 grid gap-2 md:grid-cols-4">
            <div className="inline-flex items-center gap-2 rounded-2xl border bg-[#fbfdff] px-3 py-2 text-[11px] font-semibold" style={{ borderColor: "#e2e8f0", color: "#475467" }}>
              <span className="h-4 w-3 rounded-sm" style={{ background: EUROSTAR_BLUE }} />
              Service load bars
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border bg-[#fbfdff] px-3 py-2 text-[11px] font-semibold" style={{ borderColor: "#e2e8f0", color: "#475467" }}>
              <span className="h-4 w-3 rounded-sm border-2" style={{ borderColor: EUROSTAR_GOLD }} />
              Selected service
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border bg-[#fbfdff] px-3 py-2 text-[11px] font-semibold" style={{ borderColor: "#e2e8f0", color: "#475467" }}>
              <span className="flex h-5 w-5 items-center justify-center rounded-full text-white" style={{ background: "#ef4444" }}>
                <X size={11} />
              </span>
              Cancelled marker
            </div>
            <div className="inline-flex items-center gap-2 rounded-2xl border bg-[#fbfdff] px-3 py-2 text-[11px] font-semibold" style={{ borderColor: "#e2e8f0", color: "#475467" }}>
              <span className="text-[13px] font-black" style={{ color: "#94a3b8" }}>Hover</span>
              inspect · click to pin
            </div>
          </div>
          <div className="grid gap-3 xl:grid-cols-[72px_minmax(0,1fr)]">
            <div className="hidden xl:flex xl:h-[320px] xl:flex-col xl:justify-between xl:pb-8">
              {[1, 0.75, 0.5, 0.25, 0].map(mark => (
                <div key={mark} className="text-[10px] font-bold tabular-nums" style={{ color: "#94a3b8" }}>
                  {Math.round(timeline.maxLoad * mark)} pax
                </div>
              ))}
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[1120px]">
                <div className="relative flex h-[320px] items-end gap-1.5 rounded-[24px] border bg-[#fbfdff] px-4 pb-8 pt-4" style={{ borderColor: "#e2e8f0" }}>
                  {[25, 50, 75].map(mark => (
                    <div
                      key={mark}
                      className="pointer-events-none absolute inset-x-4 border-t border-dashed"
                      style={{ bottom: `${8 + mark * 2.4}px`, borderColor: "rgba(148,163,184,0.22)" }}
                    />
                  ))}
                  {timeline.rows.map(({ row, status, heightPct }, index) => {
                    const meta = STATUS_META[status]
                    const selected = selectedServiceCode === row.item.serviceCode
                    const hovered = hoveredServiceCode === row.item.serviceCode
                    return (
                      <div key={`${row.item.serviceCode}-${index}`} className="relative flex h-full w-4 shrink-0 items-end">
                        {hovered && (
                          <div
                            className="absolute bottom-[calc(100%-244px)] left-1/2 z-10 w-48 -translate-x-1/2 rounded-2xl border px-3 py-2.5"
                            style={{ background: "rgba(15,23,42,0.96)", borderColor: "rgba(148,163,184,0.3)" }}
                          >
                            <div className="text-[11px] font-black" style={{ color: "#f8fafc" }}>
                              {row.item.serviceCode} · {statusLabel(row.train?.status)}
                            </div>
                            <div className="mt-1 text-[11px] font-bold" style={{ color: "#93c5fd" }}>
                              {row.item.totalCount} passengers
                            </div>
                            <div className="mt-1 text-[10px] font-semibold leading-4" style={{ color: "#cbd5e1" }}>
                              {fmtTime(row.train?.departureDateTime)} · {row.train ? `${stationName(originCode(row.train))} - ${stationName(destCode(row.train))}` : `${row.item.origin} - ${row.item.destination}`}
                            </div>
                          </div>
                        )}
                        <motion.button
                          type="button"
                          className="relative w-full rounded-t-[10px] border-2 transition"
                          style={{
                            height: `${heightPct}%`,
                            background: selected ? meta.color : meta.bg,
                            borderColor: meta.color,
                            boxShadow: selected ? `0 0 0 2px ${meta.bg}` : "none",
                          }}
                          initial={{ opacity: 0, y: 14 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.22, delay: Math.min(index * 0.01, 0.45) }}
                          onClick={() => setSelectedServiceCode(row.item.serviceCode)}
                          onMouseEnter={() => setHoveredServiceCode(row.item.serviceCode)}
                          onMouseLeave={() => setHoveredServiceCode(current => current === row.item.serviceCode ? null : current)}
                          aria-label={`Service ${row.item.serviceCode} with ${row.item.totalCount} passengers`}
                        >
                          {status === "cancelled" && (
                            <span className="absolute left-1/2 top-1.5 -translate-x-1/2 text-[10px] font-black" style={{ color: "#ef4444" }}>
                              ×
                            </span>
                          )}
                        </motion.button>
                        {timelineTickIndexes.includes(index) && (
                          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-6 text-[10px] font-bold whitespace-nowrap" style={{ color: "#667085" }}>
                            {fmtTime(row.train?.departureDateTime)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
          {selectedTimelineRow && (
            <div className="mt-4 rounded-[24px] border bg-[#fbfdff] px-4 py-4" style={{ borderColor: "#e2e8f0" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black tabular-nums" style={{ color: INK }}>{selectedTimelineRow.item.serviceCode}</span>
                    <span
                      className="rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em]"
                      style={{
                        color: STATUS_META[statusKey(selectedTimelineRow.train?.status)]?.color ?? "#475467",
                        background: STATUS_META[statusKey(selectedTimelineRow.train?.status)]?.bg ?? "rgba(100,116,139,0.12)",
                      }}
                    >
                      {statusLabel(selectedTimelineRow.train?.status)}
                    </span>
                  </div>
                  <div className="mt-1 text-sm font-semibold" style={{ color: "#475467" }}>
                    {selectedTimelineRow.train
                      ? `${stationName(originCode(selectedTimelineRow.train))} - ${stationName(destCode(selectedTimelineRow.train))}`
                      : `${selectedTimelineRow.item.origin} - ${selectedTimelineRow.item.destination}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-black tabular-nums" style={{ color: EUROSTAR_BLUE }}>
                    {selectedTimelineRow.item.totalCount}
                  </div>
                  <div className="text-xs" style={{ color: "#667085" }}>passengers on board</div>
                </div>
              </div>
              {hoveredTimelineRow && hoveredTimelineRow.item.serviceCode !== selectedTimelineRow.item.serviceCode && (
                <div className="mt-3 rounded-2xl border bg-white px-3 py-2.5 text-xs" style={{ borderColor: "#e2e8f0", color: "#475467" }}>
                  Hovering <span className="font-black" style={{ color: INK }}>{hoveredTimelineRow.item.serviceCode}</span> · {hoveredTimelineRow.item.totalCount} passengers · {statusLabel(hoveredTimelineRow.train?.status)}
                </div>
              )}
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl bg-white px-3 py-2.5">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "#667085" }}>Departs</div>
                  <div className="mt-1 text-sm font-black tabular-nums" style={{ color: INK }}>{fmtTime(selectedTimelineRow.train?.departureDateTime)}</div>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2.5">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "#667085" }}>Arrives</div>
                  <div className="mt-1 text-sm font-black tabular-nums" style={{ color: INK }}>{fmtTime(selectedTimelineRow.train?.arrivalDateTime)}</div>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2.5">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "#667085" }}>Lead cabin</div>
                  <div className="mt-1 text-sm font-black" style={{ color: INK }}>
                    {Object.entries(selectedTimelineRow.item.classes).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixed"}
                  </div>
                </div>
                <div className="rounded-2xl bg-white px-3 py-2.5">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em]" style={{ color: "#667085" }}>Lead traveler</div>
                  <div className="mt-1 text-sm font-black" style={{ color: INK }}>
                    {Object.entries(selectedTimelineRow.item.types).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "mixed"}
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="mb-5 grid grid-cols-[minmax(0,1.2fr)_minmax(340px,.8fr)] gap-5 max-xl:grid-cols-1">
          <div className="rounded-[30px] border bg-white p-5 shadow-[0_16px_50px_rgba(0,0,0,.05)]" style={{ borderColor: "#e7ecf3" }}>
            <div className="mb-4 flex items-center gap-2">
              <Users size={16} style={{ color: EUROSTAR_BLUE }} />
              <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "#667085" }}>Cabin mix</div>
            </div>
            <div className="relative h-5 overflow-hidden rounded-full bg-slate-100">
              {(() => {
                let offset = 0
                return classTotals.map(([key, value]) => {
                  const meta = CLASS_META[key] ?? { label: key, color: "#64748b" }
                  const share = data?.traveler.totalPassengers ? (value / data.traveler.totalPassengers) * 100 : 0
                  const left = offset
                  offset += share
                  return (
                    <motion.div
                      key={key}
                      className="absolute inset-y-0"
                      style={{ left: `${left}%`, background: meta.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${share}%` }}
                      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                    />
                  )
                })
              })()}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {classTotals.map(([key, value], index) => {
                const meta = CLASS_META[key] ?? { label: key, color: "#64748b" }
                const share = data?.traveler.totalPassengers ? Math.round((value / data.traveler.totalPassengers) * 100) : 0
                return (
                  <motion.div key={key} className="rounded-2xl border bg-white px-4 py-3" style={{ borderColor: "#e2e8f0" }} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + index * 0.07 }}>
                    <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em]" style={{ color: "#667085" }}>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} />
                      {meta.label}
                    </div>
                    <div className="mt-2 text-2xl font-black tabular-nums" style={{ color: INK }}>{value.toLocaleString("en-GB")}</div>
                    <div className="text-xs" style={{ color: "#667085" }}>{share}% of passengers</div>
                  </motion.div>
                )
              })}
            </div>
          </div>

          <div className="rounded-[30px] border bg-white p-5 shadow-[0_16px_50px_rgba(0,0,0,.05)]" style={{ borderColor: "#e7ecf3" }}>
            <div className="mb-4 flex items-center gap-2">
              <Activity size={16} style={{ color: EUROSTAR_GOLD }} />
              <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "#667085" }}>Service state</div>
            </div>
            <div className="space-y-3">
              {(Object.entries(statusTotals) as Array<[keyof typeof statusTotals, number]>).map(([key, count], index) => {
                const meta = STATUS_META[key]
                const total = Math.max(data?.trains.length ?? 0, 1)
                const width = Math.max(count > 0 ? 8 : 0, Math.round((count / total) * 100))
                return (
                  <div key={key}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="truncate font-bold" style={{ color: INK }}>{meta.label}</span>
                      <span className="tabular-nums font-black" style={{ color: meta.color }}>{count}</span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                      <motion.div className="h-full rounded-full" style={{ background: meta.color }} initial={{ width: 0 }} animate={{ width: `${width}%` }} transition={{ duration: 0.8, delay: index * 0.07 }} />
                    </div>
                    <div className="mt-1 text-[11px]" style={{ color: "#667085" }}>
                      {total > 0 ? Math.round((count / total) * 100) : 0}% of planned services
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>

        <section className="mb-5 rounded-[30px] border bg-white p-5 shadow-[0_16px_50px_rgba(0,0,0,.05)]" style={{ borderColor: "#e7ecf3" }}>
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp size={16} style={{ color: EUROSTAR_GOLD }} />
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "#667085" }}>Busiest routes</div>
              <div className="text-2xl font-black" style={{ color: INK }}>Passenger concentration by corridor</div>
            </div>
          </div>
          <div className="space-y-3">
            {routeTotals.map(([route, passengers], index) => {
              const max = routeTotals[0]?.[1] ?? 1
              const width = Math.max(10, Math.round((passengers / max) * 100))
              return (
                <div key={route}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-bold" style={{ color: INK }}>{route}</span>
                    <span className="tabular-nums font-black" style={{ color: EUROSTAR_BLUE }}>{passengers.toLocaleString("en-GB")}</span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                    <motion.div className="h-full rounded-full" style={{ background: `linear-gradient(90deg, ${EUROSTAR_BLUE}, ${EUROSTAR_GOLD})` }} initial={{ width: 0 }} animate={{ width: `${width}%` }} transition={{ duration: 0.8, delay: index * 0.07 }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        <section className="rounded-[30px] border bg-white p-5 shadow-[0_16px_50px_rgba(0,0,0,.05)]" style={{ borderColor: "#e7ecf3" }}>
          <div className="mb-4 flex items-center gap-2">
            <Train size={16} style={{ color: EUROSTAR_BLUE }} />
            <div>
              <div className="text-[11px] font-black uppercase tracking-[0.18em]" style={{ color: "#667085" }}>Top loaded services</div>
              <div className="text-2xl font-black" style={{ color: INK }}>Highest onboard counts</div>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {merged.slice().sort((a, b) => b.item.totalCount - a.item.totalCount).slice(0, 9).map((row, index) => (
              <motion.div key={`${row.item.serviceCode}-${index}`} className="rounded-[24px] border bg-[#fbfdff] p-4" style={{ borderColor: "#e2e8f0" }} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(index * 0.05, 0.3) }}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-lg font-black tabular-nums" style={{ color: INK }}>{row.item.serviceCode}</div>
                    <div className="text-xs" style={{ color: "#667085" }}>
                      {row.train ? `${stationName(originCode(row.train))} - ${stationName(destCode(row.train))}` : `${row.item.origin} - ${row.item.destination}`}
                    </div>
                  </div>
                  <div className="rounded-full px-3 py-1 text-xs font-black" style={{ background: "#eff6ff", color: EUROSTAR_BLUE }}>
                    {row.item.totalCount} pax
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between text-xs" style={{ color: "#667085" }}>
                  <span>{fmtTime(row.train?.departureDateTime)} - {fmtTime(row.train?.arrivalDateTime)}</span>
                  <span>{statusLabel(row.train?.status)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
      </main>
    </motion.div>
  )
}
