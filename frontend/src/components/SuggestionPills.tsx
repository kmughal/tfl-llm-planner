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
      { text: "Is the Central line running normally?" },
      { text: "How are all tube lines running today?" },
      { text: "Find stops near King's Cross" },
    ],
  },
  {
    label:  "SNCF · France",
    tag:    "SNCF",
    color:  "#005f8e",
    bg:     "#eff8ff",
    border: "#93c5fd",
    icon:   <Train className="w-3.5 h-3.5" />,
    items: [
      { text: "Plan a journey from Paris Gare de Lyon to Lyon Part-Dieu" },
      { text: "Are there disruptions on French trains today?" },
      { text: "Find SNCF stations in Bordeaux" },
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
      { text: "Show me today's Eurostar services" },
      { text: "Get Eurostar plans from 2025-05-21" },
      {
        text:     "What stops does Eurostar train {service number} make on {date}?",
        template: true,
      },
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
