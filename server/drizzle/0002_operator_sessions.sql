CREATE TABLE operator_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  secret_hash text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX operator_sessions_user_idx ON operator_sessions(user_id);
CREATE INDEX operator_sessions_expiry_idx ON operator_sessions(expires_at);
