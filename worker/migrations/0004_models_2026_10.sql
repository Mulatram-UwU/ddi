-- Replace the seeded placeholder registry with the current model list.
-- Old rows are deactivated rather than deleted: historical votes and snapshots stay valid, and
-- administrators can still see and re-activate them on #/admin.
--
-- Descriptions are left NULL on purpose: the registry stores administrator-written copy, not
-- marketing text. Homepages point at the provider's model/platform site.

UPDATE models SET is_active = 0
WHERE slug IN (
  'gpt-5-1', 'claude-opus-4-6', 'gemini-3-pro', 'grok-5', 'deepseek-v4', 'qwen-3-max'
);

INSERT OR IGNORE INTO models (slug, name, provider, description, homepage_url, is_active, created_at)
VALUES
  ('deepseek-v4-1-flash',  'DeepSeek v4.1 Flash',  'DeepSeek',  NULL, 'https://www.deepseek.com',  1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('gpt-6-luna',           'GPT-6 Luna',           'OpenAI',    NULL, 'https://openai.com',        1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('gpt-6-sol',            'GPT-6 Sol',            'OpenAI',    NULL, 'https://openai.com',        1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('gpt-6-astra',          'GPT-6 Astra',          'OpenAI',    NULL, 'https://openai.com',        1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('gpt-6-1-sol',          'GPT-6.1 Sol',          'OpenAI',    NULL, 'https://openai.com',        1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('claude-opus-5',        'Claude Opus 5',        'Anthropic', NULL, 'https://www.anthropic.com', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('claude-opus-5-1',      'Claude Opus 5.1',      'Anthropic', NULL, 'https://www.anthropic.com', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('claude-opus-5-5',      'Claude Opus 5.5',      'Anthropic', NULL, 'https://www.anthropic.com', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('claude-sonnet-5',      'Claude Sonnet 5',      'Anthropic', NULL, 'https://www.anthropic.com', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('claude-sonnet-5-5',    'Claude Sonnet 5.5',    'Anthropic', NULL, 'https://www.anthropic.com', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('claude-haiku-5-5',     'Claude Haiku 5.5',     'Anthropic', NULL, 'https://www.anthropic.com', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('claude-fable-5',       'Claude Fable 5',       'Anthropic', NULL, 'https://www.anthropic.com', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('claude-fable-5-1',     'Claude Fable 5.1',     'Anthropic', NULL, 'https://www.anthropic.com', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('step-5-preview',       'Step 5 Preview',       'StepFun',   NULL, 'https://stepfun.ai',        1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('hy4-preview',          'Hy4 Preview',          'Tencent',   NULL, 'https://hy.tencent.ai',     1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('mimo-v2-6-pro',        'Mimo v2.6 Pro',        'Xiaomi',    NULL, 'https://mimo.xiaomi.com',   1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('muse-wonder',          'Muse Wonder',          'Meta',      NULL, 'https://ai.meta.com',       1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('muse-wonder-full',     'Muse Wonder Full',     'Meta',      NULL, 'https://ai.meta.com',       1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('glm-5-3',              'GLM 5.3',              'Zhipu AI',  NULL, 'https://z.ai',              1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('glm-5-3-flash',        'GLM 5.3 Flash',        'Zhipu AI',  NULL, 'https://z.ai',              1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('qwen3-8-max',          'Qwen3.8 Max',          'Alibaba',   NULL, 'https://qwen.ai',           1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('qwen3-8-flash-next',   'Qwen3.8 Flash Next',   'Alibaba',   NULL, 'https://qwen.ai',           1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO model_scores (model_id, net, weight, up, down, computed_at)
SELECT id, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM models;
