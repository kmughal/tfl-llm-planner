import { cn } from "../lib/utils"
import type { ChatMessage, ToolEvent } from "../lib/types"
import { ToolCallBadge } from "./ToolCallBadge"

export function MessageBubble({ message }: { readonly message: ChatMessage }) {
  const isUser = message.role === "user"
  const toolEvents: ToolEvent[] = message.toolEvents ?? []

  return (
    <div className={cn("flex flex-col gap-2 animate-fade-in", isUser ? "items-end" : "items-start")}>
      {!isUser && toolEvents.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          {toolEvents.map((ev) => (
            <ToolCallBadge key={`${ev.type}-${ev.name}`} event={ev} />
          ))}
        </div>
      )}

      <div
        className={cn(
          "px-4 py-2.5 text-sm leading-relaxed",
          isUser
            ? "bg-claude-accent text-white rounded-3xl rounded-br-md max-w-[75%]"
            : "bg-white border border-claude-border rounded-3xl rounded-bl-md max-w-[85%] shadow-sm text-claude-text",
        )}
      >
        {message.content
          ? <MessageText text={message.content} />
          : message.streaming && <span className="inline-block w-1.5 h-4 bg-claude-muted rounded-sm animate-blink" />
        }
      </div>
    </div>
  )
}

function MessageText({ text }: { readonly text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={part}>{part.slice(2, -2)}</strong>
        }
        return part.split("\n").map((line) => (
          <span key={line}>
            {line}
          </span>
        ))
      })}
    </>
  )
}
