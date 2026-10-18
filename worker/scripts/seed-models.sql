-- Placeholder models. Administrators edit/rename/add through #/admin or PATCH /api/admin/models/:slug.
INSERT OR IGNORE INTO models (slug, name, provider, description, homepage_url, is_active, created_at)
VALUES
  ('gpt-5-1',        'GPT-5.1',        'OpenAI',    'Placeholder row - edit me.', 'https://openai.com',    1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('claude-opus-4-6','Claude Opus 4.6','Anthropic', 'Placeholder row - edit me.', 'https://anthropic.com', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('gemini-3-pro',   'Gemini 3 Pro',   'Google',    'Placeholder row - edit me.', 'https://ai.google',     1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('grok-5',         'Grok 5',         'xAI',       'Placeholder row - edit me.', 'https://x.ai',          1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('deepseek-v4',    'DeepSeek V4',    'DeepSeek',  'Placeholder row - edit me.', 'https://deepseek.com',  1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('qwen-3-max',     'Qwen 3 Max',     'Alibaba',   'Placeholder row - edit me.', 'https://qwen.ai',       1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR IGNORE INTO model_scores (model_id, net, weight, up, down, computed_at)
SELECT id, 0, 0, 0, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM models;
