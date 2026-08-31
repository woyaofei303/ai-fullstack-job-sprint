INSERT INTO channel_connections (
  id, type, name, public_id, default_ai_agent_id, config
) VALUES (
  '00000000-0000-4000-8000-000000000003',
  'web',
  '官网客服',
  'wgt_demo',
  '00000000-0000-4000-8000-000000000002',
  '{"allowedOrigins":["http://localhost:3000","http://localhost:8787"]}'::jsonb
) ON CONFLICT (id) DO NOTHING;
INSERT INTO service_entries (
  id, channel_connection_id, ai_agent_id, public_id,
  label_zh, label_en, description_zh, description_en
) VALUES (
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000002',
  'general',
  '通用咨询',
  'General support',
  '产品、配送与售后问题',
  'Product, delivery and after-sales questions'
) ON CONFLICT (id) DO NOTHING;
