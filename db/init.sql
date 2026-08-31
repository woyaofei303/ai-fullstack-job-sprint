CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  size integer NOT NULL CHECK (size >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chunks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position >= 0),
  content text NOT NULL,
  UNIQUE (document_id, position)
);

CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks(document_id);
