import "leaflet/dist/leaflet.css"
import { useState, useEffect, useRef } from "react"
import { motion, useInView } from "framer-motion"
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, useMap } from "react-leaflet"
import { Train, Clock, MapPin } from "lucide-react"
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

// ── Parser ────────────────────────────────────────────────────────────────────
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
      const lat = parseFloat(p[2] ?? "0")
      const lng = parseFloat(p[3] ?? "0")
      if (!isNaN(lat) && !isNaN(lng)) {
        cur.stations.push({ shortCode: p[0] ?? "", stopType: p[1] ?? "",
          lat, lng, dep: p[4] ?? "", arr: p[5] ?? "", name: p[6] ?? "" })
      }
    }
  }
  return plans
}

// ── Fit-bounds helper ─────────────────────────────────────────────────────────
function FitBounds({ positions }: { readonly positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 0) map.fitBounds(positions, { padding: [28, 28] })
  }, [map, positions])
  return null
}

// ── Animated station stop ─────────────────────────────────────────────────────
function StationStop({
  station, index, total, inView,
}: {
  readonly station:  MapStation
  readonly index:    number
  readonly total:    number
  readonly inView:   boolean
}) {
  const isFirst = index === 0
  const isLast  = index === total - 1
  const isTerminal = isFirst || isLast
  const delay = index * 0.12

  const time = station.dep || station.arr

  return (
    <motion.div
      className="flex items-stretch gap-3"
      initial={{ opacity: 0, x: -14 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ delay, duration: 0.3, ease: "easeOut" }}
    >
      {/* Track column */}
      <div className="flex flex-col items-center" style={{ width: 28 }}>
        {/* Station dot */}
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
          {isTerminal && <Train className="w-3 h-3 text-white" />}
          {!isTerminal && (
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ES_NAVY }} />
          )}
        </motion.div>

        {/* Connector to next stop */}
        {!isLast && (
          <motion.div
            className="flex-1 rounded-full"
            style={{ width: 2, backgroundColor: `${ES_TRACK}30`, minHeight: 20, marginTop: 3, marginBottom: 3 }}
            initial={{ scaleY: 0, originY: "top" }}
            animate={inView ? { scaleY: 1 } : {}}
            transition={{ delay: delay + 0.15, duration: 0.25 }}
          >
            {/* Moving train indicator on the first segment */}
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
        className={cn(
          "flex flex-col pb-4 min-w-0",
          isLast && "pb-0",
        )}
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ delay: delay + 0.1, duration: 0.25 }}
      >
        {/* Station name */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-sm leading-snug"
            style={{
              fontWeight: isTerminal ? 700 : 500,
              color: isTerminal ? "#111827" : "#374151",
            }}
          >
            {station.name || station.shortCode}
          </span>
          {/* Short code badge */}
          <span
            className="text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wide uppercase"
            style={{
              backgroundColor: isTerminal ? ES_NAVY : "#f3f4f6",
              color: isTerminal ? "#fff" : "#6b7280",
            }}
          >
            {station.shortCode}
          </span>
          {/* Stop type pill */}
          <span
            className={cn(
              "text-[9px] font-semibold px-1.5 py-0.5 rounded-full capitalize",
              station.stopType === "origin"      && "bg-emerald-50 text-emerald-700",
              station.stopType === "destination" && "bg-blue-50 text-blue-700",
              station.stopType === "passThrough" && "bg-gray-100 text-gray-500",
            )}
          >
            {station.stopType === "passThrough" ? "pass" : station.stopType}
          </span>
        </div>

        {/* Time row */}
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

        {/* Country flag shorthand */}
        <div className="flex items-center gap-1 mt-0.5">
          <MapPin className="w-2.5 h-2.5 text-gray-300 shrink-0" />
          <span className="text-[10px] text-gray-400 tabular-nums font-mono">
            {station.lat.toFixed(4)}, {station.lng.toFixed(4)}
          </span>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export function EuromapCard({ result }: { readonly result: string }) {
  const plans = parseResult(result)
  const [sel, setSel] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const inView  = useInView(listRef, { once: true, margin: "-40px" })

  if (plans.length === 0) return null

  const plan      = plans[Math.min(sel, plans.length - 1)]
  const positions = plan.stations.map((s): [number, number] => [s.lat, s.lng])
  const center: [number, number] = positions.length > 0
    ? [
        positions.reduce((a, p) => a + p[0], 0) / positions.length,
        positions.reduce((a, p) => a + p[1], 0) / positions.length,
      ]
    : [51.0, 0.5]

  return (
    <div className="rounded-xl overflow-hidden border border-[#003366]/20 shadow-md bg-white w-full">

      {/* ── Header ── */}
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
          {plans.length} service{plans.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Service tabs ── */}
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

      {/* ── Plan summary bar ── */}
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
        {/* ── Animated stop list ── */}
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

        {/* ── Leaflet map ── */}
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
