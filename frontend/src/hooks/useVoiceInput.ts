import { useCallback, useEffect, useRef, useState } from "react"

interface SpeechRecognitionAlternative {
  transcript: string
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  0: SpeechRecognitionAlternative
}

interface SpeechRecognitionResultListLike {
  [index: number]: SpeechRecognitionResultLike
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: SpeechRecognitionResultListLike
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  onstart: ((this: SpeechRecognitionLike, ev: Event) => void) | null
  onend: ((this: SpeechRecognitionLike, ev: Event) => void) | null
  onerror: ((this: SpeechRecognitionLike, ev: SpeechRecognitionErrorEventLike) => void) | null
  onresult: ((this: SpeechRecognitionLike, ev: SpeechRecognitionEventLike) => void) | null
  start(): void
  stop(): void
  abort(): void
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (globalThis.window === undefined) return null
  return (
    globalThis.window.SpeechRecognition ??
    globalThis.window.webkitSpeechRecognition ??
    null
  )
}

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false)
  const [interim, setInterim]         = useState("")
  const [error, setError]             = useState<string | null>(null)
  const recognitionRef                = useRef<SpeechRecognitionLike | null>(null)
  const isSupported                   = !!getSpeechRecognitionCtor()

  useEffect(() => () => recognitionRef.current?.abort(), [])

  const start = useCallback(() => {
    const SR = getSpeechRecognitionCtor()
    if (!SR) return

    setError(null)
    setInterim("")
    const recognition = new SR()
    recognitionRef.current = recognition

    recognition.continuous     = false
    recognition.interimResults = true
    recognition.lang           = "en-GB"

    recognition.onstart = () => setIsListening(true)
    recognition.onend   = () => { setIsListening(false); setInterim("") }

    recognition.onerror = (e: SpeechRecognitionErrorEventLike) => {
      setIsListening(false)
      setInterim("")
      if (e.error === "not-allowed") {
        setError("Microphone permission denied")
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setError(`Voice error: ${e.error}`)
      }
    }

    recognition.onresult = (e: SpeechRecognitionEventLike) => {
      // Only look at the current result, not the entire accumulated list.
      // With continuous=false there is always exactly one result index.
      const result = e.results[e.resultIndex]
      if (result.isFinal) {
        const text = result[0].transcript.trim()
        if (text) onTranscript(text)
        setInterim("")
      } else {
        setInterim(result[0].transcript)
      }
    }

    recognition.start()
  }, [onTranscript])

  const stop = useCallback(() => recognitionRef.current?.stop(), [])

  return { isSupported, isListening, interim, error, start, stop }
}
