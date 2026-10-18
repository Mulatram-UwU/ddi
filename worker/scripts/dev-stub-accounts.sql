-- LOCAL DEVELOPMENT ONLY. Two stub accounts with pre-made sessions so you can curl the API
-- without doing a real GitHub OAuth round trip:
--   devtoken-old -> github_id 900000001, GitHub account 2 years old  (may vote)
--   devtoken-new -> github_id 900000002, GitHub account 10 days old  (login + browse only)
--
-- Token hashes are hex(sha256(token)). Recompute with:
--   node -e "console.log(require('crypto').createHash('sha256').update('devtoken-old').digest('hex'))"

INSERT OR IGNORE INTO accounts (github_id, login, name, avatar_url, github_created_at, created_at, last_login_at)
VALUES
  (900000001, 'dev-old', 'Dev Old', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 years'),  strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  (900000002, 'dev-new', 'Dev New', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-10 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR REPLACE INTO sessions (token_hash, account_id, created_at, expires_at)
VALUES
  ('07947011357253234007fe70c67dc54af10983af2e350f30ec0cdb35f4a6eecc',
   (SELECT id FROM accounts WHERE github_id = 900000001),
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now','+365 days')),
  ('a7d2cb62c56b8f77100fb135a3b3ee7844e62de8db035568fb8d78b2c4f5ea9f',
   (SELECT id FROM accounts WHERE github_id = 900000002),
   strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now','+365 days'));
