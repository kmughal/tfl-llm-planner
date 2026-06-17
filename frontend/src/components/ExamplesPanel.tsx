import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ChevronDown, Pencil, Zap, X } from "lucide-react"
import { cn } from "../lib/utils"

interface Example {
  text:      string
  tool:      string
  template?: boolean
  divider?:  string
}

interface Section {
  key:      string
  label:    string
  sub:      string
  color:    string
  bg:       string
  border:   string
  examples: Example[]
}

const SECTIONS: Section[] = [
  {
    key:    "EUROSTAR",
    label:  "Eurostar",
    sub:    "Cross-Channel",
    color:  "#003366",
    bg:     "#f0f4ff",
    border: "#c7d2fe",
    examples: [
      { text: "Show live Eurostar trains on the map",         tool: "get_eurostar_live_map" },
      { text: "Where are trains right now?",                  tool: "get_eurostar_live_map" },
      { text: "Full departure board for today",               tool: "get_eurostar_dashboard" },
      { text: "Which services are cancelled today?",          tool: "get_eurostar_dashboard" },
      { text: "London → Paris trains today",                  tool: "get_euromap_plans" },
      { text: "Last train Paris → London tonight",            tool: "get_euromap_plans" },
      { text: "All Brussels → London services today",         tool: "get_euromap_plans" },
      { text: "First Eurostar of the day from London",        tool: "get_euromap_plans" },
      { text: "Stop times for service {number} on {date}",    tool: "get_euromap_plan_by_id",            template: true },
      { text: "Where does Eurostar {number} stop?",           tool: "get_euromap_plan_by_id",            template: true },
      { text: "All technical plans for today",                tool: "get_euromap_technical_plans" },
      { text: "Technical plan for {number} on {date}",        tool: "get_euromap_technical_plan_by_id",  template: true },
      { text: "How busy is service 9005 today?",              tool: "get_traveler_summary" },
      { text: "Passenger load for all services today",        tool: "get_traveler_summary" },
      { text: "Passenger load for service {number}",          tool: "get_traveler_summary",              template: true },
      { text: "Class breakdown for train {number}",           tool: "get_traveler_summary",              template: true },
      { text: "", tool: "", divider: "Crew & Drivers" },
      { text: "Who is driving Eurostar trains today?",        tool: "get_crew_activities" },
      { text: "Crew for service 9113 today",                  tool: "get_crew_activities" },
      { text: "Show crew for service {number} today",         tool: "get_crew_activities",       template: true },
      { text: "Show crew for service {number} on {date}",     tool: "get_crew_activities",       template: true },
      { text: "Monthly schedule for crew {crewId}",           tool: "get_crew_monthly_schedule", template: true },
      { text: "Driver schedule for {crewId} in {month}",      tool: "get_crew_monthly_schedule", template: true },
    ],
  },
  {
    key:    "SNCF",
    label:  "SNCF",
    sub:    "France",
    color:  "#c00014",
    bg:     "#fff5f5",
    border: "#fca5a5",
    examples: [
      { text: "Next trains from Paris Gare de Lyon",          tool: "get_sncf_departures" },
      { text: "Departures from {station}",                    tool: "get_sncf_departures",  template: true },
      { text: "Next 15 departures from Lyon Part-Dieu",       tool: "get_sncf_departures" },
      { text: "Arrivals board at Paris Montparnasse",         tool: "get_sncf_arrivals" },
      { text: "Arrivals at {station}",                        tool: "get_sncf_arrivals",    template: true },
      { text: "Full schedule for TGV {number}",               tool: "get_sncf_train",       template: true },
      { text: "Where does train {number} stop?",              tool: "get_sncf_train",       template: true },
      { text: "Paris Montparnasse → Bordeaux trains",         tool: "plan_sncf_journey" },
      { text: "Journey from {origin} to {destination}",       tool: "plan_sncf_journey",    template: true },
      { text: "SNCF disruptions today?",                      tool: "get_sncf_disruptions" },
      { text: "Strikes or delays on French trains?",          tool: "get_sncf_disruptions" },
    ],
  },
  {
    key:    "TFL",
    label:  "TFL",
    sub:    "London",
    color:  "#e32017",
    bg:     "#fff1f0",
    border: "#fca5a5",
    examples: [
      { text: "Paddington to Canary Wharf route",             tool: "plan_journey" },
      { text: "Journey from {origin} to {destination}",       tool: "plan_journey",         template: true },
      { text: "Best route from King's Cross to Heathrow",     tool: "plan_journey" },
      { text: "Is the Elizabeth line running?",               tool: "get_line_status" },
      { text: "Status of the {line} line",                    tool: "get_line_status",      template: true },
      { text: "All tube line status right now",               tool: "get_status_by_mode" },
      { text: "Any Underground delays today?",                tool: "get_status_by_mode" },
      { text: "Which lines have good service?",               tool: "get_status_by_mode" },
      { text: "Stops near King's Cross",                      tool: "search_stops" },
      { text: "Tube stations near {place}",                   tool: "search_stops",         template: true },
    ],
  },
  {
    key:    "WEATHER",
    label:  "Weather",
    sub:    "London · Paris · Brussels",
    color:  "#0284c7",
    bg:     "#f0f9ff",
    border: "#bae6fd",
    examples: [
      { text: "What's the weather in London today?",          tool: "get_weather" },
      { text: "Will it rain in Paris today?",                 tool: "get_weather" },
      { text: "Weather in Brussels right now",                tool: "get_weather" },
      { text: "Weather in Lille today",                       tool: "get_weather" },
      { text: "Weather at both ends of my Eurostar trip",     tool: "get_weather" },
      { text: "Should I pack an umbrella for Paris?",         tool: "get_weather" },
      { text: "Is it cold in London this afternoon?",         tool: "get_weather" },
    ],
  },
  {
    key:    "NRAIL",
    label:  "National Rail",
    sub:    "UK Connections",
    color:  "#003C71",
    bg:     "#f0f4ff",
    border: "#c7d2fe",
    examples: [
      { text: "Trains from St Pancras right now",             tool: "get_national_rail_departures" },
      { text: "Departures from King's Cross",                 tool: "get_national_rail_departures" },
      { text: "Connecting trains from Ashford International", tool: "get_national_rail_departures" },
      { text: "Trains from Ebbsfleet after my Eurostar",      tool: "get_national_rail_departures" },
      { text: "Next trains from {station}",                   tool: "get_national_rail_departures", template: true },
      { text: "Is the St Pancras to Sheffield train on time?",tool: "get_national_rail_departures" },
      { text: "What platform are trains from St Pancras?",    tool: "get_national_rail_departures" },
    ],
  },
  {
    key:    "RATP",
    label:  "Paris RER",
    sub:    "RER · Transilien",
    color:  "#009A44",
    bg:     "#f0fdf4",
    border: "#bbf7d0",
    examples: [
      { text: "How do I get into Paris from Gare du Nord?",   tool: "get_paris_metro_departures" },
      { text: "Next RER from Gare du Nord",                   tool: "get_paris_metro_departures" },
      { text: "RER B departures from Gare du Nord",           tool: "get_paris_metro_departures" },
      { text: "Paris transit from Chatelet les Halles",       tool: "get_paris_metro_departures" },
      { text: "RER from {station}",                           tool: "get_paris_metro_departures", template: true },
      { text: "Connecting transit from Gare du Nord",         tool: "get_paris_metro_departures" },
      { text: "Next trains from Gare de Lyon",                tool: "get_paris_metro_departures" },
    ],
  },
]

interface Props {
  readonly onSend:     (text: string) => void
  readonly onTemplate: (text: string) => void
  readonly onClose:    () => void
}

export function ExamplesPanel({ onSend, onTemplate, onClose }: Props) {
  const [open, setOpen] = useState<Set<string>>(new Set(["EUROSTAR"]))

  function toggle(key: string) {
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="h-full flex flex-col bg-white" style={{ borderLeft: "1px solid #f1f5f9" }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid #f1f5f9" }}>
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5" style={{ color: "#6b7280" }} />
          <span className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-500">Examples</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-lg transition-colors hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          aria-label="Close examples panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* ── Sections ── */}
      <div className="flex-1 overflow-y-auto py-1.5">
        {SECTIONS.map(section => {
          const isOpen = open.has(section.key)
          return (
            <div key={section.key}>

              {/* Section toggle row */}
              <button
                type="button"
                onClick={() => toggle(section.key)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 transition-colors hover:bg-gray-50"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="text-[9px] font-black tracking-[0.16em] uppercase px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: section.bg, color: section.color, border: `1px solid ${section.border}` }}
                  >
                    {section.label}
                  </span>
                  <span className="text-[10px] text-gray-400 font-medium">{section.sub}</span>
                </div>
                <motion.div animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.18 }}>
                  <ChevronDown className="w-3 h-3 text-gray-400" />
                </motion.div>
              </button>

              {/* Example rows */}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key="content"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: "easeInOut" }}
                    className="overflow-hidden"
                  >
                    <div className="px-2.5 pb-3 flex flex-col gap-0.5">
                      {section.examples.map((ex, i) => ex.divider ? (
                        <div
                          key={`${section.key}-div-${i}`}
                          className="flex items-center gap-2 mt-2.5 mb-1 px-1"
                        >
                          <span
                            className="text-[9px] font-black uppercase tracking-[0.16em]"
                            style={{ color: section.color, opacity: 0.6 }}
                          >
                            {ex.divider}
                          </span>
                          <div className="flex-1 h-px" style={{ background: `${section.color}20` }} />
                        </div>
                      ) : (
                        <button
                          key={`${section.key}-${i}`}
                          type="button"
                          onClick={() => ex.template ? onTemplate(ex.text) : onSend(ex.text)}
                          className={cn(
                            "w-full text-left rounded-lg px-2.5 py-2 transition-all group",
                            "border",
                          )}
                          style={{
                            borderColor:     ex.template ? `${section.color}35` : `${section.color}15`,
                            borderStyle:     ex.template ? "dashed" : "solid",
                            backgroundColor: "transparent",
                          }}
                          onMouseEnter={e => {
                            e.currentTarget.style.backgroundColor = section.bg
                            e.currentTarget.style.borderColor = section.color + "50"
                          }}
                          onMouseLeave={e => {
                            e.currentTarget.style.backgroundColor = "transparent"
                            e.currentTarget.style.borderColor = ex.template ? section.color + "35" : section.color + "15"
                          }}
                        >
                          <div className="flex items-start gap-1.5">
                            {ex.template
                              ? <Pencil className="w-2.5 h-2.5 mt-[3px] shrink-0" style={{ color: section.color, opacity: 0.65 }} />
                              : <span
                                  className="w-1 h-1 rounded-full mt-[6px] shrink-0 inline-block"
                                  style={{ backgroundColor: section.color, opacity: 0.35 }}
                                />
                            }
                            <span className="text-[11px] leading-snug font-medium text-gray-700">
                              {ex.text}
                            </span>
                          </div>
                          <span
                            className="block mt-1 text-[9px] font-mono tracking-tight"
                            style={{ color: section.color, opacity: 0.5 }}
                          >
                            {ex.tool}
                          </span>
                        </button>
                      ))}
                    </div>

                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* ── Footer legend ── */}
      <div className="px-4 py-2.5 shrink-0" style={{ borderTop: "1px solid #f1f5f9" }}>
        <p className="text-[9px] text-gray-400 leading-snug">
          <span className="font-semibold text-gray-500">Click</span> to send instantly ·{" "}
          <span style={{ borderBottom: "1px dashed #9ca3af" }}>Dashed</span> = fill {"{template}"} first
        </p>
      </div>
    </div>
  )
}
