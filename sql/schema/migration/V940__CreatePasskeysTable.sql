-- WebAuthn / passkey support.
--
-- Stores public-key credentials (passkeys) registered by members.
-- Both platform authenticators (Windows Hello, Face ID, Touch ID, Android
-- biometrics) and roaming/cross-platform authenticators (YubiKey and other
-- security keys) are supported — the backend does not constrain
-- authenticatorAttachment, so any WebAuthn-compatible authenticator works.

CREATE TABLE member.passkeys (
    -- Internal opaque ID used in management URLs
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Owning member; cascade so removing a member also drops their passkeys
    member_id       VARCHAR(9)   NOT NULL REFERENCES member.register (member_id) ON DELETE CASCADE,

    -- Base64URL-encoded credential ID returned by the authenticator. Globally
    -- unique by spec; we enforce that to detect duplicate registrations.
    credential_id   TEXT         NOT NULL UNIQUE,

    -- The authenticator's public key (COSE-encoded bytes).
    public_key      BYTEA        NOT NULL,

    -- Signature counter used by the relying party to detect cloned authenticators.
    counter         BIGINT       NOT NULL DEFAULT 0,

    -- WebAuthn-reported transports (usb, ble, nfc, internal, hybrid). Stored as a
    -- text array so the relying party can hint which transports to try on
    -- subsequent authentication ceremonies.
    transports      TEXT[]       NOT NULL DEFAULT '{}',

    -- Authenticator metadata reported during attestation
    device_type     VARCHAR(32),
    backed_up       BOOLEAN      NOT NULL DEFAULT FALSE,

    -- Human-readable nickname so users can distinguish "MacBook Touch ID"
    -- from "YubiKey 5C". May be NULL until the user names it.
    name            VARCHAR(100),

    last_used_at    TIMESTAMP,
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Most queries are "all passkeys for a member"
CREATE INDEX idx_passkeys_member_id ON member.passkeys (member_id);

-- Ephemeral WebAuthn challenges (registration + authentication).
-- Stored server-side rather than in a session cookie so the flow works in
-- multi-instance deployments. Rows expire after a few minutes and are pruned
-- by the application when claimed.
CREATE TABLE member.webauthn_challenges (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

    -- For registration challenges this is the authenticated member.
    -- For authentication challenges it is the email the user typed; left NULL
    -- if the email is not known (e.g. usernameless authentication).
    member_id   VARCHAR(9)  REFERENCES member.register (member_id) ON DELETE CASCADE,
    email       VARCHAR(100),

    -- 'registration' or 'authentication'
    purpose     VARCHAR(16) NOT NULL
                  CHECK (purpose IN ('registration', 'authentication')),

    -- Random base64url-encoded challenge sent to the authenticator
    challenge   TEXT        NOT NULL,

    expires_at  TIMESTAMP   NOT NULL,
    created_at  TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- At least one principal must be known so the challenge can be claimed.
    CONSTRAINT webauthn_challenges_principal_required
      CHECK (member_id IS NOT NULL OR email IS NOT NULL)
);

-- Enforce at most one active challenge per (member_id, purpose) and
-- (email, purpose) so storeChallenge can use ON CONFLICT … DO UPDATE.
CREATE UNIQUE INDEX idx_webauthn_challenges_member_purpose
  ON member.webauthn_challenges (member_id, purpose)
  WHERE member_id IS NOT NULL;

CREATE UNIQUE INDEX idx_webauthn_challenges_email_purpose
  ON member.webauthn_challenges (email, purpose)
  WHERE email IS NOT NULL;

CREATE INDEX idx_webauthn_challenges_expires ON member.webauthn_challenges (expires_at);

-- Add the new authentication event types so passkey logins/registrations are
-- captured in the existing login_events audit log.
ALTER TYPE auth_event_type ADD VALUE IF NOT EXISTS 'passkey_registered';
ALTER TYPE auth_event_type ADD VALUE IF NOT EXISTS 'passkey_removed';
ALTER TYPE auth_event_type ADD VALUE IF NOT EXISTS 'passkey_login_success';
ALTER TYPE auth_event_type ADD VALUE IF NOT EXISTS 'passkey_login_failed';
