import { useState, useEffect, useCallback, useRef } from "react"

const DURATION_S  = 10 * 60 // 10 minutes
const STORAGE_KEY = "rail-live-memory-expiry"

export interface MemoryTimerState {
  secondsLeft: number | null // null = timer not active
  isActive:    boolean
  isExpiring:  boolean       // true when < 60 s left
  start:       () => void    // start or reset to full 10 min
  clear:       () => void    // stop without triggering expiry callback
}

export function useMemoryTimer(onExpire: () => void): MemoryTimerState {
  const [expiryTime, setExpiryTime] = useState<number | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const t = Number(stored)
    return t > Date.now() ? t : null
  })

  // Tick counter — incremented every second when active, forces display re-render
  // without changing expiryTime (which would re-create the interval).
  const [, setTick] = useState(0)

  const onExpireRef = useRef(onExpire)
  useEffect(() => { onExpireRef.current = onExpire }, [onExpire])

  useEffect(() => {
    if (expiryTime === null) return
    const id = setInterval(() => {
      const remaining = Math.floor((expiryTime - Date.now()) / 1000)
      if (remaining <= 0) {
        setExpiryTime(null)
        localStorage.removeItem(STORAGE_KEY)
        onExpireRef.current()
      } else {
        setTick(n => n + 1)
      }
    }, 1000)
    return () => clearInterval(id)
  }, [expiryTime])

  const start = useCallback(() => {
    const expiry = Date.now() + DURATION_S * 1000
    localStorage.setItem(STORAGE_KEY, String(expiry))
    setExpiryTime(expiry)
  }, [])

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setExpiryTime(null)
  }, [])

  const secondsLeft = expiryTime
    ? Math.max(0, Math.floor((expiryTime - Date.now()) / 1000))
    : null

  return {
    secondsLeft,
    isActive:   expiryTime !== null,
    isExpiring: secondsLeft !== null && secondsLeft <= 60,
    start,
    clear,
  }
}
