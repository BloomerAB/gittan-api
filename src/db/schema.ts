export const KEYSPACE = "gittan"

export const CREATE_KEYSPACE = `
  CREATE KEYSPACE IF NOT EXISTS ${KEYSPACE}
  WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
`

export const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.orgs (
    id text PRIMARY KEY,
    name text,
    display_name text,
    oidc_issuer text,
    oidc_client_id text,
    created_at timestamp,
    updated_at timestamp
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.orgs_by_name (
    name text PRIMARY KEY,
    org_id text
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.teams (
    id text,
    org_id text,
    name text,
    display_name text,
    slack_channel text,
    created_at timestamp,
    updated_at timestamp,
    PRIMARY KEY (org_id, id)
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.teams_by_name (
    org_id text,
    name text,
    team_id text,
    PRIMARY KEY (org_id, name)
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.team_members (
    team_id text,
    user_id text,
    role text,
    added_at timestamp,
    added_by text,
    PRIMARY KEY (team_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.repos (
    id text,
    org_id text,
    team_id text,
    name text,
    forgejo_full_name text,
    clone_url text,
    ssh_url text,
    tags list<text>,
    gated_branches list<text>,
    created_at timestamp,
    updated_at timestamp,
    PRIMARY KEY (org_id, id)
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.repos_by_team (
    team_id text,
    id text,
    org_id text,
    name text,
    forgejo_full_name text,
    clone_url text,
    ssh_url text,
    tags list<text>,
    gated_branches list<text>,
    created_at timestamp,
    updated_at timestamp,
    PRIMARY KEY (team_id, id)
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.repos_by_forgejo_name (
    forgejo_full_name text PRIMARY KEY,
    org_id text,
    repo_id text
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.pipeline_runs (
    id text,
    repo_id text,
    push_event_id text,
    org_id text,
    team_id text,
    branch text,
    status text,
    steps text,
    started_at timestamp,
    finished_at timestamp,
    resolved_from text,
    PRIMARY KEY (repo_id, id)
  ) WITH CLUSTERING ORDER BY (id DESC)`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.pipeline_runs_by_team (
    team_id text,
    started_at timestamp,
    run_id text,
    repo_id text,
    branch text,
    status text,
    PRIMARY KEY (team_id, started_at, run_id)
  ) WITH CLUSTERING ORDER BY (started_at DESC, run_id DESC)`,
] as const
