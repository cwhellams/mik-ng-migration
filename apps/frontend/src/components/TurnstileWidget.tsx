import { Turnstile, TurnstileInstance } from '@marsidev/react-turnstile'
import { useRef } from 'react'

interface TurnstileWidgetProps {
  onSuccess: (token: string) => void
  onError?: () => void
  disabled?: boolean
}

/**
 * Cloudflare Turnstile widget wrapper component
 * For local development, uses test site key that always passes
 */
export const TurnstileWidget = ({
  onSuccess,
  onError,
  disabled = false,
}: TurnstileWidgetProps) => {
  const turnstileRef = useRef<TurnstileInstance>(null)
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

  // If no site key is configured, don't render the widget
  if (!siteKey) {
    return null
  }

  return (
    <Turnstile
      ref={turnstileRef}
      siteKey={siteKey}
      onSuccess={onSuccess}
      onError={() => {
        onError?.()
      }}
      onExpire={() => {
        // Auto-reset on expiration
        turnstileRef.current?.reset()
      }}
      options={{
        theme: 'light',
        size: 'normal',
      }}
      style={{
        marginTop: '16px',
        marginBottom: '16px',
        opacity: disabled ? 0.5 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    />
  )
}
