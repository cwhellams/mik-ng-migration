/**
 * Passkey (WebAuthn) login helper. Used by the login page to attempt a
 * passkey-based login before falling back to email magic-link.
 *
 * Supports both platform authenticators (Touch ID / Face ID / Windows Hello)
 * and roaming/cross-platform authenticators (YubiKey and other security
 * keys). The browser prompts the user to choose between any available
 * authenticator that matches the relying-party's allowed credentials.
 */
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser'
import { sharedApi } from '../hooks/useApi'

export const passkeySupported = (): boolean => browserSupportsWebAuthn()

export type PasskeyLoginResult =
  | { ok: true }
  | {
      ok: false
      reason: 'no-passkeys' | 'cancelled' | 'options-failed' | 'failed'
      message?: string
    }

/**
 * Attempt to log in with a passkey for the given email.
 * - Asks the backend for authentication options.
 * - If the user has no registered passkeys, returns `{ ok: false, reason: 'no-passkeys' }`
 *   so the caller can fall back to email magic-link login.
 * - Otherwise prompts the browser, verifies, and on success the backend sets
 *   the auth cookies.
 */
export async function loginWithPasskey(
  email: string
): Promise<PasskeyLoginResult> {
  if (!browserSupportsWebAuthn()) {
    return {
      ok: false,
      reason: 'failed',
      message: 'Passkeys are not supported in this browser',
    }
  }

  let optionsResp: {
    options: PublicKeyCredentialRequestOptionsJSON
    hasPasskeys: boolean
  }
  try {
    const r = await sharedApi.post<{
      options: PublicKeyCredentialRequestOptionsJSON
      hasPasskeys: boolean
    }>('/auth/passkey/authentication/options', { email })
    optionsResp = r.data
  } catch {
    return { ok: false, reason: 'options-failed' }
  }

  if (!optionsResp.hasPasskeys) {
    return { ok: false, reason: 'no-passkeys' }
  }

  let assertion
  try {
    assertion = await startAuthentication({ optionsJSON: optionsResp.options })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // The browser throws when the user cancels the prompt or no authenticator
    // is available — in both cases we should fall back to the email flow.
    return { ok: false, reason: 'cancelled', message }
  }

  try {
    await sharedApi.post('/auth/passkey/authentication/verify', {
      email,
      response: assertion,
    })
  } catch {
    return { ok: false, reason: 'failed' }
  }

  return { ok: true }
}

/**
 * Register a new passkey for the currently-authenticated member.
 */
export async function registerPasskey(
  name: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (!browserSupportsWebAuthn()) {
    return { ok: false, error: 'Passkeys are not supported in this browser' }
  }

  let options: PublicKeyCredentialCreationOptionsJSON
  try {
    const r = await sharedApi.post<PublicKeyCredentialCreationOptionsJSON>(
      '/auth/passkey/registration/options'
    )
    options = r.data
  } catch {
    return { ok: false, error: 'Could not start passkey registration' }
  }

  let attResp
  try {
    attResp = await startRegistration({ optionsJSON: options })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }

  try {
    await sharedApi.post('/auth/passkey/registration/verify', {
      response: attResp,
      name,
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Passkey registration failed'
    return { ok: false, error: message }
  }
  return { ok: true }
}
