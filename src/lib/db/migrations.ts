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
];
