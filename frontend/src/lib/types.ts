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
