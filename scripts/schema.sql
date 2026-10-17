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
CREATE TABLE IF NOT EXISTS student_enrollments (
 roll text PRIMARY KEY,
 email text NOT NULL UNIQUE,
 expires_at bigint NOT NULL,
 active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS student_email_challenges (
 id uuid PRIMARY KEY,
 payload jsonb NOT NULL,
 code_hash text NOT NULL,
 expires_at timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 consumed_at timestamptz
);
CREATE TABLE IF NOT EXISTS student_credentials (
 roll text PRIMARY KEY REFERENCES student_enrollments(roll),
 leaf text NOT NULL UNIQUE,
 wallet text NOT NULL,
 expires_at bigint NOT NULL,
 created_at timestamptz NOT NULL DEFAULT NOW()
);
ALTER TABLE student_credentials ADD COLUMN IF NOT EXISTS expires_at bigint NOT NULL DEFAULT 0;
