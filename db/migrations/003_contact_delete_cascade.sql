ALTER TABLE conversations
  DROP CONSTRAINT IF EXISTS conversations_channel_identity_id_fkey;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_channel_identity_id_fkey
  FOREIGN KEY (channel_identity_id) REFERENCES channel_identities(id) ON DELETE CASCADE;
