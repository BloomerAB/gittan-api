export const KEYSPACE = "gittan"

export const CREATE_KEYSPACE = `
  CREATE KEYSPACE IF NOT EXISTS ${KEYSPACE}
  WITH replication = {'class': 'SimpleStrategy', 'replication_factor': 1}
`

export const CREATE_TABLES = [
  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.users (
    id text PRIMARY KEY,
    email text,
    name text,
    org_id text,
    role text,
    is_active boolean,
    forgejo_username text,
    created_at timestamp,
    updated_at timestamp
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.users_by_email (
    email text PRIMARY KEY,
    user_id text
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.users_by_org (
    org_id text,
    user_id text,
    email text,
    name text,
    PRIMARY KEY (org_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.orgs (
    id text PRIMARY KEY,
    name text,
    display_name text,
    pipeline_scope text,
    oidc_issuer text,
    oidc_client_id text,
    oidc_client_secret text,
    mandatory_sso boolean,
    sso_email_domain text,
    slack_client_id text,
    slack_client_secret text,
    slack_bot_token text,
    slack_team_name text,
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

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.repo_dependencies (
    repo_id text,
    depends_on_repo_id text,
    depends_on_repo_name text,
    cascade boolean,
    contract_test boolean,
    created_at timestamp,
    PRIMARY KEY (repo_id, depends_on_repo_id)
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.repo_dependents (
    depends_on_repo_id text,
    dependent_repo_id text,
    dependent_repo_name text,
    cascade boolean,
    contract_test boolean,
    PRIMARY KEY (depends_on_repo_id, dependent_repo_id)
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.repos_by_forgejo_name (
    forgejo_full_name text PRIMARY KEY,
    org_id text,
    repo_id text
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.step_definitions (
    org_id text,
    name text,
    image text,
    run text,
    defaults text,
    cache list<text>,
    description text,
    created_at timestamp,
    updated_at timestamp,
    PRIMARY KEY (org_id, name)
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.pipeline_runs (
    id text,
    repo_id text,
    push_event_id text,
    org_id text,
    team_id text,
    branch text,
    commit_sha text,
    commit_message text,
    pusher text,
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
  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.org_plans (
    org_id text PRIMARY KEY,
    plan text,
    spending_cap_eur int,
    billing_email text,
    created_at timestamp,
    updated_at timestamp
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.usage_events (
    org_id text,
    month text,
    event_id text,
    type text,
    pipeline_run_id text,
    team_id text,
    repo_id text,
    duration_ms bigint,
    ci_minutes int,
    created_at timestamp,
    PRIMARY KEY ((org_id, month), event_id)
  ) WITH CLUSTERING ORDER BY (event_id DESC)`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.org_usage_monthly (
    org_id text,
    month text,
    ci_minutes_used int,
    storage_bytes bigint,
    updated_at timestamp,
    PRIMARY KEY (org_id, month)
  ) WITH CLUSTERING ORDER BY (month DESC)`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.org_policies (
    org_id text,
    id text,
    name text,
    description text,
    match_files text,
    match_team text,
    match_name text,
    steps text,
    created_at timestamp,
    updated_at timestamp,
    PRIMARY KEY (org_id, id)
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.org_members (
    org_id text,
    user_id text,
    role text,
    joined_at timestamp,
    PRIMARY KEY (org_id, user_id)
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.user_orgs (
    user_id text,
    org_id text,
    role text,
    joined_at timestamp,
    PRIMARY KEY (user_id, org_id)
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.org_invites (
    org_id text,
    id text,
    email text,
    invite_role text,
    invite_token text,
    invited_by text,
    created_at timestamp,
    expires_at timestamp,
    PRIMARY KEY (org_id, id)
  )`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.invites_by_token (
    invite_token text PRIMARY KEY,
    invite_id text,
    org_id text
  )`,


  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.audit_log (
    org_id text,
    id timeuuid,
    actor_id text,
    actor_email text,
    action text,
    resource_type text,
    resource_id text,
    detail text,
    created_at timestamp,
    PRIMARY KEY (org_id, id)
  ) WITH CLUSTERING ORDER BY (id DESC)`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.receipts (
    org_id text,
    id text,
    month text,
    amount_eur int,
    plan text,
    description text,
    items text,
    created_at timestamp,
    PRIMARY KEY (org_id, id)
  ) WITH CLUSTERING ORDER BY (id DESC)`,

  `CREATE TABLE IF NOT EXISTS ${KEYSPACE}.usage_alerts (
    org_id text,
    month text,
    resource text,
    threshold int,
    sent_at timestamp,
    PRIMARY KEY ((org_id, month), resource, threshold)
  )`,
] as const

export const MIGRATIONS = [
  `ALTER TABLE ${KEYSPACE}.pipeline_runs ADD commit_sha text`,
  `ALTER TABLE ${KEYSPACE}.pipeline_runs ADD commit_message text`,
  `ALTER TABLE ${KEYSPACE}.pipeline_runs ADD pusher text`,
] as const
