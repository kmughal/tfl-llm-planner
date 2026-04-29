export type Role = "user" | "assistant"

export interface ChatMessage {
  id: string
  role: Role
  content: string
  toolEvents?: ToolEvent[]
  streaming?: boolean
}

export interface ToolEvent {
  type: "tool_call" | "tool_result"
  name: string
  result?: string
}

// Wire-format message sent to / received from the backend LLM loop.
// Includes tool_calls and tool results so the full context is preserved.
export interface LLMMessage {
  role: string
  content?: string
  tool_calls?: {
    id: string
    type: string
    function: { name: string; arguments: string }
  }[]
  tool_call_id?: string
  name?: string
}
