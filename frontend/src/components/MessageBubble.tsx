import { cn } from "../lib/utils"
import type { ChatMessage, ToolEvent } from "../lib/types"
import { ToolCallBadge } from "./ToolCallBadge"
import { Train, Bus, MapPin } from "lucide-react"

// ── TFL line colours ──────────────────────────────────────────────────────────
const LINE_COLOURS: Record<string, { bg: string; fg: string }> = {
  central:      { bg: "#E32017", fg: "#fff" },
  circle:       { bg: "#FFD300", fg: "#1a1a1a" },
  district:     { bg: "#00782A", fg: "#fff" },
  jubilee:      { bg: "#A0A5A9", fg: "#fff" },
  metropolitan: { bg: "#9B0056", fg: "#fff" },
  northern:     { bg: "#1C1C1C", fg: "#fff" },
  piccadilly:   { bg: "#003688", fg: "#fff" },
  victoria:     { bg: "#0098D4", fg: "#fff" },
  bakerloo:     { bg: "#B36305", fg: "#fff" },
  elizabeth:    { bg: "#6950A1", fg: "#fff" },
  hammersmith:  { bg: "#F3A9BB", fg: "#1a1a1a" },
  overground:   { bg: "#EE7C0E", fg: "#fff" },
  dlr:          { bg: "#00A4A7", fg: "#fff" },
}

// ── Block-level parser ────────────────────────────────────────────────────────
type Block =
  | { kind: "para";    lines: string[] }
  | { kind: "steps";   items: string[] }
  | { kind: "bullets"; items: string[] }
  | { kind: "h3";      text: string }

function prep(text: string): string {
  return text
    // Insert newline before numbered items that follow a sentence end
    .replace(/([.!?;:])\s*(\d+\.)\s+/g, "$1\n$2 ")
    // Insert blank line before transition phrases
    .replace(/([.!?])\s+(Here'?s|Alternatively|The journey|Note:|Please check)/g, "$1\n\n$2")
}

function parseBlocks(raw: string): Block[] {
  const blocks: Block[] = []
  let cur: Block | null = null
  const flush = () => { if (cur) { blocks.push(cur); cur = null } }

  for (const line of prep(raw).split("\n")) {
    const t = line.trim()
    if (!t) { flush(); continue }

    const nm = t.match(/^(\d+)\.\s+(.+)/)
    const bm = t.match(/^[-*•]\s+(.+)/)
    const hm = t.match(/^#{1,3}\s+(.+)/)

    if (nm) {
      if (cur?.kind !== "steps")   { flush(); cur = { kind: "steps",   items: [] } }
      cur.items.push(nm[2])
    } else if (bm) {
      if (cur?.kind !== "bullets") { flush(); cur = { kind: "bullets", items: [] } }
      cur.items.push(bm[1])
    } else if (hm) {
      flush()
      blocks.push({ kind: "h3", text: hm[1] })
    } else {
      if (cur?.kind !== "para")    { flush(); cur = { kind: "para",    lines: [] } }
      cur.lines.push(t)
    }
  }
  flush()
  return blocks
}

// ── Inline span tokeniser ─────────────────────────────────────────────────────
type Span =
  | { k: "text";  v: string }
  | { k: "bold";  v: string }
  | { k: "tube";  v: string; line: string }
  | { k: "bus";   v: string }

const SPAN_RE = new RegExp(
  [
    /\*\*[^*]+\*\*/,
    /(?:central|circle|district|jubilee|metropolitan|northern|piccadilly|victoria|bakerloo|elizabeth|overground|dlr|hammersmith(?: & city| and city)?)(?: line)?/,
    /(?:bus(?:es)? )?[A-Z][0-9]{2,3}(?:[,/\s]+(?:or\s+)?[A-Z]?[0-9]{2,3})*/,
  ].map(r => r.source).join("|"),
  "gi"
)

function tokenize(text: string): Span[] {
  const spans: Span[] = []
  let last = 0
  let m: RegExpExecArray | null
  const re = new RegExp(SPAN_RE.source, "gi")

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) spans.push({ k: "text", v: text.slice(last, m.index) })
    const raw = m[0]

    if (raw.startsWith("**")) {
      spans.push({ k: "bold", v: raw.slice(2, -2) })
    } else if (/^(?:buses?\s+)?[A-Z]\d/i.test(raw)) {
      spans.push({ k: "bus", v: raw })
    } else {
      const lineKey = raw.toLowerCase()
        .replace(/ line$/, "")
        .replace(/ & city.*/, "")
        .replace(/ and city.*/, "")
        .split(" ")[0]
      spans.push({ k: "tube", v: raw, line: lineKey })
    }
    last = re.lastIndex
  }

  if (last < text.length) spans.push({ k: "text", v: text.slice(last) })
  return spans
}

// ── Inline content renderer ───────────────────────────────────────────────────
function Inline({ text }: { readonly text: string }) {
  return (
    <>
      {tokenize(text).map((span, i) => {
        if (span.k === "bold") {
          return <strong key={i} className="font-semibold text-claude-text">{span.v}</strong>
        }
        if (span.k === "tube") {
          const colour = LINE_COLOURS[span.line] ?? { bg: "#003688", fg: "#fff" }
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold mx-0.5 align-middle whitespace-nowrap"
              style={{ backgroundColor: colour.bg, color: colour.fg }}
            >
              <Train className="w-2.5 h-2.5 shrink-0" />
              {span.v}
            </span>
          )
        }
        if (span.k === "bus") {
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold mx-0.5 align-middle whitespace-nowrap bg-[#E1251B] text-white"
            >
              <Bus className="w-2.5 h-2.5 shrink-0" />
              {span.v}
            </span>
          )
        }
        // plain text — preserve newlines within a paragraph line
        return <span key={i}>{span.v}</span>
      })}
    </>
  )
}

// ── Step icon ─────────────────────────────────────────────────────────────────
function StepIcon({ text }: { readonly text: string }) {
  if (/\bwalk|foot|pedestrian/i.test(text)) {
    return <MapPin className="w-3 h-3" />
  }
  if (/\bbus|coach/i.test(text)) {
    return <Bus className="w-3 h-3" />
  }
  return <Train className="w-3 h-3" />
}

// ── Block renderers ───────────────────────────────────────────────────────────
function StepList({ items }: { readonly items: string[] }) {
  return (
    <div className="flex flex-col mt-1">
      {items.map((item, i) => (
        <div key={i} className="flex gap-3">
          {/* step number + connector */}
          <div className="flex flex-col items-center shrink-0">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm"
              style={{ backgroundColor: "#003688" }}
            >
              {i + 1}
            </div>
            {i < items.length - 1 && (
              <div className="w-px flex-1 bg-[#003688]/20 my-1" />
            )}
          </div>
          {/* content */}
          <div className={cn("text-sm text-claude-text leading-relaxed", i < items.length - 1 ? "pb-3" : "pb-0")}>
            <span className="inline-flex items-center gap-1 text-[#003688] mr-1 align-middle">
              <StepIcon text={item} />
            </span>
            <Inline text={item} />
          </div>
        </div>
      ))}
    </div>
  )
}

function BulletList({ items }: { readonly items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5 mt-1">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 items-start text-sm text-claude-text leading-relaxed">
          <div className="w-1.5 h-1.5 rounded-full bg-[#003688] mt-1.5 shrink-0" />
          <Inline text={item} />
        </li>
      ))}
    </ul>
  )
}

function RichMessage({ text }: { readonly text: string }) {
  const blocks = parseBlocks(text)
  return (
    <div className="flex flex-col gap-2.5">
      {blocks.map((block, i) => {
        if (block.kind === "h3") {
          return (
            <p key={i} className="text-xs font-semibold uppercase tracking-wide text-[#003688] mt-1">
              {block.text}
            </p>
          )
        }
        if (block.kind === "steps") {
          return (
            <div key={i} className="bg-[#f5f7fc] rounded-xl px-3 py-2.5 border border-[#003688]/10">
              <StepList items={block.items} />
            </div>
          )
        }
        if (block.kind === "bullets") {
          return <BulletList key={i} items={block.items} />
        }
        // paragraph
        return (
          <p key={i} className="text-sm text-claude-text leading-relaxed">
            {block.lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                <Inline text={line} />
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────
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
          "px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-claude-accent text-white rounded-3xl rounded-br-md max-w-[75%]"
            : "bg-white border border-claude-border rounded-3xl rounded-bl-md max-w-[90%] shadow-sm text-claude-text",
        )}
      >
        {message.content
          ? isUser
            ? <span>{message.content}</span>
            : <RichMessage text={message.content} />
          : message.streaming && <span className="inline-block w-1.5 h-4 bg-claude-muted rounded-sm animate-blink" />
        }
      </div>
    </div>
  )
}
