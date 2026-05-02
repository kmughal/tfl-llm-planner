import { Train, MapPin, Pencil, Zap } from "lucide-react"

interface Suggestion {
  text:      string
  template?: boolean
}

const GROUPS: {
  label:   string
  tag:     string
  color:   string
  bg:      string
  border:  string
  icon:    React.ReactNode
  items:   Suggestion[]
}[] = [
  {
    label:  "TFL · London",
    tag:    "TFL",
    color:  "#c0200f",
    bg:     "#fff1f0",
    border: "#fca5a5",
    icon:   <Train className="w-3.5 h-3.5" />,
    items: [
      { text: "How do I get from Paddington to London Bridge?" },
      { text: "Journey from {origin} to {destination}", template: true },
      { text: "Is the Central line running normally?" },
      { text: "Status of the {line} line", template: true },
      { text: "How are all tube lines running today?" },
      { text: "Any delays on the Underground right now?" },
      { text: "Find stops near King's Cross" },
      { text: "Tube stations near {place}", template: true },
    ],
  },
  {
    label:  "SNCF · France",
    tag:    "SNCF",
    color:  "#c00014",
    bg:     "#fff5f5",
    border: "#fca5a5",
    icon:   <Train className="w-3.5 h-3.5" />,
    items: [
      { text: "Next departures from Paris Gare de Lyon" },
      { text: "Departures from {station}", template: true },
      { text: "Arrivals board at Lyon Part-Dieu" },
      { text: "Arrivals at {station}", template: true },
      { text: "Full schedule for TGV {number}", template: true },
      { text: "Where does train {number} stop today?", template: true },
      { text: "Paris Montparnasse to Bordeaux trains" },
      { text: "Journey from {origin} to {destination}", template: true },
      { text: "Are there disruptions on French trains today?" },
      { text: "Strikes or delays on SNCF right now?" },
    ],
  },
  {
    label:  "Eurostar · International",
    tag:    "Eurostar",
    color:  "#003366",
    bg:     "#f0f4ff",
    border: "#a5b4fc",
    icon:   <MapPin className="w-3.5 h-3.5" />,
    items: [
      { text: "Show live map of all Eurostar trains" },
      { text: "Where are Eurostar trains right now?" },
      { text: "Full departure board for today" },
      { text: "Which Eurostar services are cancelled today?" },
      { text: "What trains run London to Paris today?" },
      { text: "Last Eurostar from Paris to London tonight?" },
      { text: "All Eurostar services Brussels to London" },
      { text: "Stop times for service {number} on {date}", template: true },
      { text: "Technical plan for train {number} on {date}", template: true },
      { text: "How busy is Eurostar service 9005 today?" },
      { text: "Passenger load for service {number} on {date}", template: true },
      { text: "Class breakdown for train {number}", template: true },
    ],
  },
]

interface Props {
  readonly onSelect:   (text: string) => void
  readonly onTemplate: (text: string) => void
}

export function SuggestionPills({ onSelect, onTemplate }: Props) {
  return (
    <div className="w-full max-w-2xl flex flex-col gap-5">
      {GROUPS.map(group => (
        <div key={group.label}>
          {/* Group label */}
          <div className="flex items-center gap-2 mb-2.5 px-0.5">
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full border"
              style={{ backgroundColor: group.bg, color: group.color, borderColor: group.border }}
            >
              {group.icon}
              {group.label}
            </span>
            <div className="flex-1 h-px" style={{ backgroundColor: group.border }} />
          </div>

          {/* Pills */}
          <div className="flex flex-wrap gap-2">
            {group.items.map(item => {
              const isTemplate = !!item.template
              return (
                <button
                  key={item.text}
                  type="button"
                  onClick={() => isTemplate ? onTemplate(item.text) : onSelect(item.text)}
                  title={isTemplate ? "Click to pre-fill — replace {placeholders} before sending" : undefined}
                  className="flex items-center gap-1.5 text-xs border rounded-full px-3.5 py-1.5 transition-all duration-150 active:scale-95 font-medium"
                  style={{
                    color:           group.color,
                    borderColor:     isTemplate ? group.color : group.border,
                    backgroundColor: "#fff",
                    borderStyle:     isTemplate ? "dashed" : "solid",
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget
                    el.style.backgroundColor = group.bg
                    el.style.borderColor     = group.color
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget
                    el.style.backgroundColor = "#fff"
                    el.style.borderColor     = isTemplate ? group.color : group.border
                  }}
                >
                  {isTemplate
                    ? <Pencil className="w-2.5 h-2.5 shrink-0" />
                    : <Zap className="w-2.5 h-2.5 shrink-0 opacity-50" />}
                  {item.text}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
