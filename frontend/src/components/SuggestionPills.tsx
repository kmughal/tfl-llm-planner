const SUGGESTIONS = [
  "How do I get from Paddington to London Bridge?",
  "Is the Central line running normally?",
  "Plan a journey from Paris Gare du Nord to Lyon Part-Dieu",
  "Are there any disruptions on SNCF today?",
]

export function SuggestionPills({ onSelect }: { onSelect: (s: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 justify-center">
      {SUGGESTIONS.map(s => (
        <button
          key={s}
          onClick={() => onSelect(s)}
          className="text-xs text-claude-muted border border-claude-border rounded-full px-3 py-1.5 hover:border-claude-accent hover:text-claude-accent transition-colors bg-white"
        >
          {s}
        </button>
      ))}
    </div>
  )
}
