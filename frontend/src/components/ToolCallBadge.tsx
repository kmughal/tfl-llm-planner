import { Wrench, CheckCircle } from "lucide-react"
import type { ToolEvent } from "../lib/types"

interface ToolMeta {
  label:   string
  network: "tfl" | "sncf" | "eurostar" | "weather" | "nrail" | "ratp" | "default"
}

const TOOL_META: Record<string, ToolMeta> = {
  // TFL
  plan_journey:                     { label: "Planning London journey",          network: "tfl" },
  get_line_status:                  { label: "Checking TFL line status",         network: "tfl" },
  get_status_by_mode:               { label: "Checking TFL service status",      network: "tfl" },
  search_stops:                     { label: "Searching TFL stops",              network: "tfl" },
  get_tfl_roads:                    { label: "Checking TFL roads",               network: "tfl" },
  get_road_disruptions:             { label: "Checking road disruptions",        network: "tfl" },
  get_bus_arrivals:                 { label: "Fetching bus arrivals",            network: "tfl" },
  get_all_bus_lines:                { label: "Loading bus lines",                network: "tfl" },
  // SNCF
  plan_sncf_journey:                { label: "Planning SNCF journey",            network: "sncf" },
  search_sncf_stations:             { label: "Searching SNCF stations",          network: "sncf" },
  get_sncf_disruptions:             { label: "Checking SNCF disruptions",        network: "sncf" },
  get_sncf_departures:              { label: "Fetching SNCF departures",         network: "sncf" },
  get_sncf_arrivals:                { label: "Fetching SNCF arrivals",           network: "sncf" },
  get_sncf_train:                   { label: "Looking up SNCF train",            network: "sncf" },
  get_sncf_dashboard:               { label: "Loading SNCF network dashboard",   network: "sncf" },
  // Eurostar / Euromap
  get_euromap_plans:                { label: "Fetching Eurostar schedule",       network: "eurostar" },
  get_euromap_technical_plans:      { label: "Fetching Eurostar tech plans",     network: "eurostar" },
  get_euromap_plan_by_id:           { label: "Fetching Eurostar service",        network: "eurostar" },
  get_euromap_technical_plan_by_id: { label: "Fetching Eurostar tech plan",      network: "eurostar" },
  get_eurostar_dashboard:           { label: "Loading Eurostar dashboard",       network: "eurostar" },
  get_eurostar_live_map:            { label: "Loading Eurostar live map",        network: "eurostar" },
  get_traveler_summary:             { label: "Fetching passenger load",          network: "eurostar" },
  operations_wall:                  { label: "Building operations wall",         network: "default" },
  // Weather
  get_weather:                      { label: "Fetching weather",                 network: "weather" },
  // National Rail
  get_national_rail_departures:     { label: "Fetching National Rail trains",    network: "nrail" },
  get_national_rail_arrivals:       { label: "Fetching National Rail arrivals",  network: "nrail" },
  get_national_rail_dashboard:      { label: "Loading National Rail dashboard",  network: "nrail" },
  // Paris RER / RATP
  get_paris_metro_departures:       { label: "Fetching Paris RER departures",    network: "ratp" },
}

const NETWORK_STYLES: Record<string, { dot: string; bg: string; border: string; text: string; tag: string }> = {
  tfl:      { dot: "#e32017", bg: "#fff8f8", border: "#fca5a5", text: "#7f1d1d", tag: "TFL"          },
  sncf:     { dot: "#c00014", bg: "#fff0f1", border: "#fbb6bc", text: "#7f1d1d", tag: "SNCF"         },
  eurostar: { dot: "#003366", bg: "#eff6ff", border: "#93c5fd", text: "#1e3a8a", tag: "Eurostar"     },
  weather:  { dot: "#0284c7", bg: "#f0f9ff", border: "#bae6fd", text: "#0c4a6e", tag: "Weather"      },
  nrail:    { dot: "#003C71", bg: "#f0f4ff", border: "#c7d2fe", text: "#1e3a8a", tag: "Nat Rail"     },
  ratp:     { dot: "#009A44", bg: "#f0fdf4", border: "#bbf7d0", text: "#14532d", tag: "Paris RER"    },
  default:  { dot: "#9ca3af", bg: "#f9fafb", border: "#e5e7eb", text: "#374151", tag: ""             },
}

export function ToolCallBadge({ event }: { readonly event: ToolEvent }) {
  const meta   = TOOL_META[event.name] ?? { label: event.name, network: "default" as const }
  const styles = NETWORK_STYLES[meta.network]

  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs rounded-full px-2.5 py-1 animate-fade-in border font-medium"
      style={{ backgroundColor: styles.bg, borderColor: styles.border, color: styles.text }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: styles.dot }} />

      {styles.tag && (
        <span className="font-bold opacity-60 shrink-0">{styles.tag}</span>
      )}

      {event.type === "tool_call" ? (
        <>
          <Wrench className="w-3 h-3 animate-pulse shrink-0" />
          <span>{meta.label}…</span>
        </>
      ) : (
        <>
          <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
          <span>{meta.label}</span>
        </>
      )}
    </span>
  )
}
