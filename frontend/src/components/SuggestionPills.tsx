import { Train, MapPin, Pencil } from "lucide-react"

interface Suggestion {
  text:       string
  template?:  boolean   // fills input instead of sending immediately
}

const GROUPS: {
  label:   string
  color:   string
  bg:      string
  border:  string
  icon:    React.ReactNode
  items:   Suggestion[]
}[] = [
  {
    label:  "TFL · London",
    color:  "#E32017",
    bg:     "#fff1f0",
    border: "#fca5a5",
    icon:   <Train className="w-3 h-3" />,
    items: [
      { text: "How do I get from Paddington to London Bridge?" },
      { text: "Is the Central line running normally?" },
      { text: "Search for stops near King's Cross" },
    ],
  },
  {
    label:  "SNCF · France",
    color:  "#E2001A",
    bg:     "#fff1f1",
    border: "#fca5a5",
    icon:   <Train className="w-3 h-3" />,
    items: [
      { text: "Plan a journey from Paris Gare de Lyon to Lyon Part-Dieu" },
      { text: "Are there any disruptions on SNCF today?" },
      { text: "Find trains from Marseille to Nice" },
    ],
  },
  {
    label:  "Eurostar · International",
    color:  "#003366",
    bg:     "#eff6ff",
    border: "#93c5fd",
    icon:   <MapPin className="w-3 h-3" />,
    items: [
      { text: "Show me Eurostar plans for today" },
      { text: "Get Eurostar technical plans from 2025-05-21" },
      { text: "Plan a journey from Paris to London" },
      {
        text:      "Give me plan for train {train number} running on {date}",
        template:  true,
      },
    ],
  },
]

interface Props {
  readonly onSelect:    (text: string) => void
  readonly onTemplate:  (text: string) => void
}

export function SuggestionPills({ onSelect, onTemplate }: Props) {
  return (
    <div className="w-full max-w-2xl flex flex-col gap-4">
      {GROUPS.map(group => (
        <div key={group.label}>
          {/* Group label */}
          <div className="flex items-center gap-1.5 mb-2 px-1">
            <span
              className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full"
              style={{ backgroundColor: group.bg, color: group.color, border: `1px solid ${group.border}` }}
            >
              {group.icon}
              {group.label}
            </span>
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
                  title={isTemplate ? "Click to fill in the input — replace the {placeholders}" : undefined}
                  className="flex items-center gap-1.5 text-xs border rounded-full px-3 py-1.5 transition-all duration-150 active:scale-95"
                  style={{
                    color:           group.color,
                    borderColor:     isTemplate ? group.color : group.border,
                    backgroundColor: "#fff",
                    borderStyle:     isTemplate ? "dashed" : "solid",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = group.bg
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#fff"
                  }}
                >
                  {isTemplate && <Pencil className="w-2.5 h-2.5 shrink-0" />}
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
