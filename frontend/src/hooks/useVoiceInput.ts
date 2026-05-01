import { useCallback, useEffect, useRef, useState } from "react"

type SpeechRecognitionCtor = new () => SpeechRecognition

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (globalThis.window === undefined) return null
  return (
    globalThis.window.SpeechRecognition ??
    (globalThis.window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition ??
    null
  )
}

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false)
  const [interim, setInterim]         = useState("")
  const [error, setError]             = useState<string | null>(null)
  const recognitionRef                = useRef<SpeechRecognition | null>(null)
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

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      setIsListening(false)
      setInterim("")
      if (e.error === "not-allowed") {
        setError("Microphone permission denied")
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setError(`Voice error: ${e.error}`)
      }
    }

    recognition.onresult = (e: SpeechRecognitionEvent) => {
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
