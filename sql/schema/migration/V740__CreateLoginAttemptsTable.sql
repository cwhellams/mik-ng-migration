-- Stores server-side state for each magic link / PWA code login attempt.
-- The raw code is NEVER stored; only a bcrypt hash is kept.
-- The magic-link JWT token is likewise never sent to the client — the
-- client verifies by submitting the plain-text code to /login/verify-code,
-- which checks it against the stored hash.

CREATE TABLE member.login_attempts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(100) NOT NULL,
    code_hash       TEXT         NOT NULL,
    link_token_hash TEXT,
    expires_at      TIMESTAMP    NOT NULL,
    used_at         TIMESTAMP,
    failed_attempts INT          NOT NULL DEFAULT 0,
    ip_address      VARCHAR(45),
    created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast look-ups by email when a user submits their code
CREATE INDEX idx_login_attempts_email ON member.login_attempts (email);

-- Automatically clean up rows older than 1 day to keep the table small
-- (rows expire naturally; this is a belt-and-suspenders clean-up index)
CREATE INDEX idx_login_attempts_expires_at ON member.login_attempts (expires_at);

-- Unique partial index: fast lookup and prevents hash collisions, but still
-- allows NULL on legacy rows where no email link was generated.
CREATE UNIQUE INDEX idx_login_attempts_link_token_hash
    ON member.login_attempts (link_token_hash)
    WHERE link_token_hash IS NOT NULL;