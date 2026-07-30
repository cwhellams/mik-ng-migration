// Short haptic tap for picker interactions — silently does nothing on platforms
// without the Vibration API (e.g. iOS Safari) or in unsupported contexts.
export const vibrate = (durationMs = 10): void => {
  try {
    navigator.vibrate?.(durationMs)
  } catch {
    // ignore — vibration is a nice-to-have, never worth failing on
  }
}
