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
import { sharedApi, type ExtendedAxiosConfig } from '../hooks/useApi'

export const passkeySupported = (): boolean => browserSupportsWebAuthn()

/**
 * Returns true when the page is loaded in a secure context (HTTPS or
 * localhost).  WebAuthn / passkeys are only available in secure contexts, so
 * when this returns false the browser hides `PublicKeyCredential` entirely and
 * `passkeySupported()` will also return false.  The two helpers together let
 * the UI show a more actionable error message to the user.
 */
export const isSecureContextForPasskeys = (): boolean =>
  typeof globalThis?.isSecureContext === 'boolean'
    ? globalThis.isSecureContext
    : false

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
      message: 'member.passkeys.unsupportedBrowser',
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
    }>('auth/passkey/authentication/options', { email }, {
      allowUnauthenticated: true,
    } as ExtendedAxiosConfig)
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
    await sharedApi.post(
      'auth/passkey/authentication/verify',
      { email, response: assertion },
      { allowUnauthenticated: true } as ExtendedAxiosConfig
    )
  } catch {
    return { ok: false, reason: 'failed' }
  }

  return { ok: true }
}

/**
 * Attempt to log in with a passkey without requiring the user to type their
 * email first (discoverable-credential / usernameless flow).
 *
 * The backend issues authentication options with an empty `allowCredentials`
 * list, which tells the browser to show all stored passkeys for this RP.
 * After the user selects one the credential is verified server-side exactly
 * the same way as the email-scoped flow.
 */
export async function loginWithPasskeyDiscoverable(): Promise<PasskeyLoginResult> {
  if (!browserSupportsWebAuthn()) {
    return {
      ok: false,
      reason: 'failed',
      message: 'member.passkeys.unsupportedBrowser',
    }
  }

  let optionsResp: {
    options: PublicKeyCredentialRequestOptionsJSON
    sessionId: string
  }
  try {
    const r = await sharedApi.post<{
      options: PublicKeyCredentialRequestOptionsJSON
      sessionId?: string
    }>('auth/passkey/authentication/options', {}, {
      allowUnauthenticated: true,
    } as ExtendedAxiosConfig)
    if (!r.data.sessionId) {
      return { ok: false, reason: 'options-failed' }
    }
    optionsResp = r.data as {
      options: PublicKeyCredentialRequestOptionsJSON
      sessionId: string
    }
  } catch {
    return { ok: false, reason: 'options-failed' }
  }

  let assertion
  try {
    assertion = await startAuthentication({ optionsJSON: optionsResp.options })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: 'cancelled', message }
  }

  try {
    await sharedApi.post(
      'auth/passkey/authentication/verify',
      { sessionId: optionsResp.sessionId, response: assertion },
      { allowUnauthenticated: true } as ExtendedAxiosConfig
    )
  } catch {
    return { ok: false, reason: 'failed' }
  }

  return { ok: true }
}

export type PasskeyRegisterResult =
  | { ok: true }
  | {
      ok: false
      reason:
        | 'unsupported-browser'
        | 'options-failed'
        | 'cancelled'
        | 'verify-failed'
      /** Raw browser/server message for cases where the browser already provides a localized string. */
      message?: string
    }

/**
 * Register a new passkey for the currently-authenticated member.
 */
export async function registerPasskey(
  name: string | null
): Promise<PasskeyRegisterResult> {
  if (!browserSupportsWebAuthn()) {
    return { ok: false, reason: 'unsupported-browser' }
  }

  let options: PublicKeyCredentialCreationOptionsJSON
  try {
    const r = await sharedApi.post<PublicKeyCredentialCreationOptionsJSON>(
      'auth/passkey/registration/options'
    )
    options = r.data
  } catch {
    return { ok: false, reason: 'options-failed' }
  }

  let attResp
  try {
    attResp = await startRegistration({ optionsJSON: options })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // The browser provides a localized cancellation/error message, use it as-is.
    return { ok: false, reason: 'cancelled', message }
  }

  try {
    await sharedApi.post('auth/passkey/registration/verify', {
      response: attResp,
      name,
    })
  } catch {
    return { ok: false, reason: 'verify-failed' }
  }
  return { ok: true }
}
