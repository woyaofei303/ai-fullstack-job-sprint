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

CREATE TABLE IF NOT EXISTS knowledge_bases (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO knowledge_bases (id, name, description)
VALUES ('00000000-0000-4000-8000-000000000001', '默认知识库', '从原知识库迁移的内容')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS knowledge_base_id uuid REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'file',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE documents
SET knowledge_base_id = '00000000-0000-4000-8000-000000000001'
WHERE knowledge_base_id IS NULL;

ALTER TABLE documents ALTER COLUMN knowledge_base_id SET NOT NULL;

ALTER TABLE chunks
  ADD COLUMN IF NOT EXISTS qdrant_point_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS chunks_document_id_idx ON chunks(document_id);
CREATE INDEX IF NOT EXISTS documents_knowledge_base_id_idx ON documents(knowledge_base_id);

CREATE TABLE IF NOT EXISTS faq_entries (
  id uuid PRIMARY KEY,
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  document_id uuid NOT NULL UNIQUE REFERENCES documents(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('upsert', 'delete')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ingestion_jobs_pending_idx
  ON ingestion_jobs(status, next_run_at);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'agent')),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS ai_agents (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  avatar_url text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  system_prompt text NOT NULL,
  tone text NOT NULL DEFAULT 'friendly',
  language text NOT NULL DEFAULT 'auto' CHECK (language IN ('auto', 'zh-CN', 'en')),
  model text NOT NULL,
  temperature real NOT NULL DEFAULT 0.2 CHECK (temperature >= 0 AND temperature <= 1),
  fallback_message text NOT NULL,
  handoff_keywords jsonb NOT NULL DEFAULT '["人工","human"]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO ai_agents (
  id, name, description, system_prompt, model, fallback_message
) VALUES (
  '00000000-0000-4000-8000-000000000002',
  '默认客服',
  '严格基于知识库回答的默认 AI 客服',
  '你是跨境电商客服。只能根据提供的知识回答，不得编造政策、订单状态或承诺。',
  'gpt-4.1-mini',
  '暂时没有找到可靠答案，已为你转接人工客服。'
) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_agent_knowledge_bases (
  ai_agent_id uuid NOT NULL REFERENCES ai_agents(id) ON DELETE CASCADE,
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  PRIMARY KEY (ai_agent_id, knowledge_base_id)
);

INSERT INTO ai_agent_knowledge_bases (ai_agent_id, knowledge_base_id)
VALUES (
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001'
) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS channel_connections (
  id uuid PRIMARY KEY,
  type text NOT NULL CHECK (type IN ('web', 'telegram')),
  name text NOT NULL,
  public_id text NOT NULL UNIQUE,
  default_ai_agent_id uuid NOT NULL REFERENCES ai_agents(id),
  encrypted_secret text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS service_entries (
  id uuid PRIMARY KEY,
  channel_connection_id uuid NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  ai_agent_id uuid NOT NULL REFERENCES ai_agents(id),
  public_id text NOT NULL UNIQUE,
  label_zh text NOT NULL,
  label_en text NOT NULL,
  description_zh text NOT NULL DEFAULT '',
  description_en text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS service_entries_channel_idx
  ON service_entries(channel_connection_id, sort_order);

CREATE TABLE IF NOT EXISTS contacts (
  id uuid PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS channel_identities (
  id uuid PRIMARY KEY,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  channel_connection_id uuid NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  visitor_token_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_connection_id, external_id)
);

CREATE INDEX IF NOT EXISTS channel_identities_contact_idx ON channel_identities(contact_id);
CREATE UNIQUE INDEX IF NOT EXISTS channel_identities_visitor_token_idx
  ON channel_identities(visitor_token_hash)
  WHERE visitor_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY,
  channel_connection_id uuid NOT NULL REFERENCES channel_connections(id),
  channel_identity_id uuid NOT NULL REFERENCES channel_identities(id),
  service_entry_id uuid REFERENCES service_entries(id),
  ai_agent_id uuid NOT NULL REFERENCES ai_agents(id),
  status text NOT NULL DEFAULT 'ai_active'
    CHECK (status IN ('ai_active', 'waiting_human', 'human_active', 'closed')),
  assigned_user_id uuid REFERENCES users(id),
  handoff_reason text,
  ai_resolved boolean NOT NULL DEFAULT false,
  first_response_at timestamptz,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_one_open_identity_idx
  ON conversations(channel_connection_id, channel_identity_id)
  WHERE status <> 'closed';
CREATE INDEX IF NOT EXISTS conversations_status_idx ON conversations(status, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('visitor', 'ai', 'agent', 'system')),
  sender_user_id uuid REFERENCES users(id),
  text text NOT NULL DEFAULT '',
  platform_message_id text,
  delivery_status text NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('pending', 'sent', 'failed')),
  source_chunk_ids bigint[] NOT NULL DEFAULT '{}',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (conversation_id, platform_message_id)
);

CREATE INDEX IF NOT EXISTS messages_conversation_idx ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY,
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  mime_type text NOT NULL,
  size integer NOT NULL CHECK (size >= 0 AND size <= 5242880),
  storage_path text NOT NULL UNIQUE,
  original_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS telegram_updates (
  channel_connection_id uuid NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  update_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_connection_id, update_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text NOT NULL DEFAULT '',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO system_settings (key, value) VALUES
  ('general', '{"brandName":"Support Desk","privacyUrl":"","retentionDays":180}'::jsonb),
  ('ai', '{"baseUrl":"https://api.openai.com/v1","embeddingModel":"text-embedding-3-small"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

UPDATE documents SET status = 'pending' WHERE status IS DISTINCT FROM 'ready';
