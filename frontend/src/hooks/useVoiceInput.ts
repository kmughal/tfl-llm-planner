import { useCallback, useEffect, useRef, useState } from "react"

type SpeechRecognitionCtor = new () => SpeechRecognition

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null
  return (
    window.SpeechRecognition ??
    (window as Window & { webkitSpeechRecognition?: SpeechRecognitionCtor }).webkitSpeechRecognition ??
    null
  )
}

export function useVoiceInput(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const recognitionRef                = useRef<SpeechRecognition | null>(null)
  const isSupported                   = !!getSpeechRecognitionCtor()

  // Clean up on unmount
  useEffect(() => () => recognitionRef.current?.abort(), [])

  const start = useCallback(() => {
    const SR = getSpeechRecognitionCtor()
    if (!SR) return

    setError(null)
    const recognition = new SR()
    recognitionRef.current = recognition

    recognition.continuous     = false
    recognition.interimResults = false
    recognition.lang           = "en-GB"

    recognition.onstart = () => setIsListening(true)
    recognition.onend   = () => setIsListening(false)

    recognition.onerror = (e: SpeechRecognitionErrorEvent) => {
      setIsListening(false)
      if (e.error === "not-allowed") {
        setError("Microphone permission denied")
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setError(`Voice error: ${e.error}`)
      }
    }

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const transcript = Array.from(e.results)
        .map(r => r[0].transcript)
        .join(" ")
        .trim()
      if (transcript) onTranscript(transcript)
    }

    recognition.start()
  }, [onTranscript])

  const stop = useCallback(() => recognitionRef.current?.stop(), [])

  return { isSupported, isListening, error, start, stop }
}
