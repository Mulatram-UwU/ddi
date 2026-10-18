export interface MyVote {
  value: number;
  created_at: string;
  next_vote_at: string;
}

export interface ModelJson {
  id: number;
  slug: string;
  name: string;
  provider: string;
  description: string | null;
  homepage_url: string | null;
  score: number;
  net: number;
  weight: number;
  up: number;
  down: number;
  recent_up: number;
  recent_down: number;
  sparkline: number[];
  change_24h: number | null;
  last_vote_at: string | null;
  my_vote: MyVote | null;
}

export interface MeJson {
  id: number;
  login: string;
  name: string | null;
  avatar_url: string | null;
  is_admin: boolean;
  can_vote: boolean;
  vote_blocked_reason: 'ACCOUNT_TOO_NEW' | null;
  age_eligible_at: string | null;
}

export interface ConfigJson {
  half_life_hours: number;
  score_alpha: number;
  k_min: number;
  vote_cooldown_hours: number;
  min_github_age_days: number;
  session_ttl_days: number;
  snapshot_bucket_minutes: number;
  snapshot_retention_days: number;
  softmax_temp: number;
  turnstile_site_key: string;
  turnstile_required: boolean;
  dev_login_enabled: boolean;
}

export interface HistoryPoint {
  t: number;
  score: number;
}

export interface HistoryJson {
  slug: string;
  range: string;
  bucket_seconds: number;
  points: HistoryPoint[];
}

export interface AdminModelJson {
  id: number;
  slug: string;
  name: string;
  provider: string;
  description: string | null;
  homepage_url: string | null;
  is_active: number;
  created_at: string;
}

export type AuthResult = { token: string | null; authError: string | null };
