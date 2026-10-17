CREATE TABLE IF NOT EXISTS applications (
 id text PRIMARY KEY,
 origins jsonb NOT NULL,
 nullifier_seed text NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS challenges (
 id uuid PRIMARY KEY,
 payload jsonb NOT NULL,
 expires_at timestamptz NOT NULL,
 consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS challenge_expiry ON challenges(expires_at);
CREATE TABLE IF NOT EXISTS assertion_redemptions (
 app_id text NOT NULL,
 jti text NOT NULL,
 expires_at timestamptz NOT NULL,
 PRIMARY KEY (app_id, jti)
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY,
 app_id text NOT NULL,
 claims jsonb NOT NULL,
 expires_at timestamptz NOT NULL
);
