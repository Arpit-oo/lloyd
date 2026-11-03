/**
 * Append-only list. Index i upgrades user_version i -> i+1. Never edit a shipped entry.
 */
export const MIGRATIONS: string[] = [
  // v1: LLM call log. Every model call, with the exact request, lands here.
  `
  CREATE TABLE llm_calls (
    id                 TEXT PRIMARY KEY,
    run_id             TEXT,
    campaign_id        TEXT,
    asset_id           TEXT,
    step               TEXT NOT NULL,
    model              TEXT NOT NULL,
    request_json       TEXT NOT NULL,
    response_text      TEXT,
    status             TEXT NOT NULL,          -- ok | error
    error              TEXT,
    input_tokens       INTEGER NOT NULL DEFAULT 0,
    cached_tokens      INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens      INTEGER NOT NULL DEFAULT 0,
    reasoning_tokens   INTEGER NOT NULL DEFAULT 0,
    cost_usd           REAL NOT NULL DEFAULT 0,
    latency_ms         INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX llm_calls_campaign ON llm_calls(campaign_id, created_at);
  CREATE INDEX llm_calls_run ON llm_calls(run_id);
  `,

  // v2: campaigns, chat, assets with versions, memory.
  `
  CREATE TABLE campaigns (
    id          TEXT PRIMARY KEY,
    brand_hash  TEXT NOT NULL,
    title       TEXT NOT NULL,
    state       TEXT NOT NULL,             -- see lib/agent/state.ts
    data_json   TEXT NOT NULL DEFAULT '{}', -- brief, brand check, questions, plan
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );

  CREATE TABLE messages (
    id          TEXT PRIMARY KEY,
    campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,             -- user | assistant
    kind        TEXT NOT NULL,             -- text | brand_check | questions | plan | assets | edit | memory
    content_json TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX messages_campaign ON messages(campaign_id, created_at);

  CREATE TABLE assets (
    id           TEXT PRIMARY KEY,
    campaign_id  TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    plan_item_id TEXT NOT NULL,
    ord          INTEGER NOT NULL,
    type         TEXT NOT NULL,
    title        TEXT NOT NULL,
    status       TEXT NOT NULL,            -- writing | ready | error
    current_version INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE asset_versions (
    id           TEXT PRIMARY KEY,
    asset_id     TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    version      INTEGER NOT NULL,
    content_json TEXT NOT NULL,
    guard_json   TEXT,
    sources_json TEXT,
    instruction  TEXT,                     -- null for the first draft, the edit request otherwise
    created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    UNIQUE (asset_id, version)
  );

  -- Durable memory. Campaign-scoped brief overrides never live here (see campaign data_json).
  CREATE TABLE memories (
    id                 TEXT PRIMARY KEY,
    brand_hash         TEXT,               -- null = applies to every brand (user preference)
    type               TEXT NOT NULL,      -- preference | decision | fact | correction
    text               TEXT NOT NULL,
    evidence           TEXT,
    source_campaign_id TEXT,
    status             TEXT NOT NULL,      -- proposed | active | archived
    pinned             INTEGER NOT NULL DEFAULT 0,
    use_count          INTEGER NOT NULL DEFAULT 0,
    embedding          BLOB,
    created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    last_used_at       TEXT
  );
  `,

  // v3: files the marketer attaches in chat (text extracted on upload).
  `
  CREATE TABLE attachments (
    id          TEXT PRIMARY KEY,
    campaign_id TEXT,
    name        TEXT NOT NULL,
    size        INTEGER NOT NULL,
    text        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  `,
];
