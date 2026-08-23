// Every PromQL expression the feed will ever run.
//
// THE SECURITY PROPERTY
// ---------------------
// Every `expr` below is a string literal with no interpolation, and there is no
// code path that builds one. Combined with `getSystemCoreSnapshot()` taking zero
// parameters (see ./snapshot.ts), that makes "the client cannot influence the
// query" a property of the type system rather than a validation step somebody
// could forget to call. `queries.spec.ts` fails the build on any backtick or
// `${` appearing in an expression, so it stays that way.
//
// Only instant queries. `/api/v1/query_range` is never called, so the classic
// way to melt a Prometheus — a long range at a fine step — is not reachable from
// here at all.
//
// TWO SHAPES, AND WHY THE BUNDLES EXIST
// -------------------------------------
// Prometheus accepts one expression per request, so a naive catalogue would be
// one HTTP call per number. Instead:
//
//   'labelled'  Prometheus' own labels do the fan-out: one query returns a
//               series per target, and the catalogue picks rows out of it.
//   'bundle'    many unrelated single-value aggregates unioned with `or`, each
//               tagged with a distinct `sc` label by label_replace.
//
// The distinct `sc` value is what makes `or` safe. `or` drops right-hand samples
// whose label set already exists on the left, so operands that all carried the
// same (empty) label set would silently swallow everything after the first.
//
// Every bundle operand is wrapped in sum()/avg()/max() so it yields exactly one
// sample with an empty label set before label_replace tags it. That also makes
// the shape invariant to cluster size: a second replica would otherwise
// reintroduce an `instance` label and defeat the keying.
//
// Total: 9 labelled + 6 bundles = 15 upstream calls per snapshot, a compile-time
// constant that does not grow with the number of modules or viewers.

export type QueryShape = 'labelled' | 'bundle';

export type SystemCoreQueryId =
  | 'up'
  | 'scrapeAge'
  | 'podCpu'
  | 'podMem'
  | 'podsRunning'
  | 'podsReady'
  | 'probeSuccess'
  | 'probeDuration'
  | 'probeCertDays'
  | 'nodeBundle'
  | 'clusterBundle'
  | 'sqlBundle'
  | 'kvBundle'
  | 'blobBundle'
  | 'appBundle';

export interface PromQueryDef {
  readonly id: SystemCoreQueryId;
  readonly shape: QueryShape;
  /** Always a literal. Never built, never interpolated. */
  readonly expr: string;
  /** For 'bundle': the `sc` values the expression tags its operands with. */
  readonly signals?: readonly string[];
}

/**
 * The label the bundle operands are tagged with.
 *
 * Short and unlikely to collide with a real label from any exporter — if an
 * exporter ever emitted `sc` itself, label_replace would overwrite it on that
 * operand only, which is harmless because the operands are aggregates with their
 * labels already dropped.
 */
export const BUNDLE_LABEL = 'sc';

// EVERY RATE WINDOW IS 5m, WRITTEN OUT
// ------------------------------------
// Two scrape intervals is the floor for a usable rate at a 30s scrape; 5m gives
// ten samples, which rides out a single missed scrape without going flat.
//
// It is spelled out in each expression rather than interpolated from a constant.
// A template literal here would be harmless today — the operand would be a
// module-level constant — but it would cost the bright line that `queries.spec.ts`
// draws, which is that no expression in this file contains a backtick or `${` at
// all. A rule with no exceptions is one nobody has to reason about.

export const QUERIES: readonly PromQueryDef[] = [
  /* ---------------- labelled: one query, many targets ---------------- */
  {
    id: 'up',
    shape: 'labelled',
    // The spine of the whole snapshot: this is the set of things that exist.
    // Anything here without a catalogue entry becomes an overflow module.
    expr: 'up',
  },
  {
    id: 'scrapeAge',
    shape: 'labelled',
    // Seconds since the sample backing each target was taken. Bounded by the
    // scrape interval in healthy operation, so anything much larger is silence.
    expr: 'time() - timestamp(up)',
  },
  {
    id: 'podCpu',
    shape: 'labelled',
    // Deliberately unfiltered by namespace. It costs nothing at this scale, it
    // serves the namespaces that have no exporter of their own, and — the real
    // reason — it removes the last expression that would have wanted a config
    // value spliced into PromQL.
    expr: 'sum by (namespace, pod) (rate(container_cpu_usage_seconds_total{container!=""}[5m]))',
  },
  {
    id: 'podMem',
    shape: 'labelled',
    expr: 'sum by (namespace, pod) (container_memory_working_set_bytes{container!=""})',
  },
  {
    id: 'podsRunning',
    shape: 'labelled',
    expr: 'sum by (namespace) (kube_pod_status_phase{phase="Running"})',
  },
  {
    id: 'podsReady',
    shape: 'labelled',
    expr: 'sum by (namespace) (kube_pod_status_ready{condition="true"})',
  },
  {
    id: 'probeSuccess',
    shape: 'labelled',
    // NOT `up`. For a blackbox target, `up` says the exporter answered; only
    // probe_success says the probed thing did. Using `up` here would paint every
    // probe green while one of them served a 502.
    expr: 'probe_success',
  },
  {
    id: 'probeDuration',
    shape: 'labelled',
    expr: 'probe_duration_seconds',
  },
  {
    id: 'probeCertDays',
    shape: 'labelled',
    expr: '(probe_ssl_earliest_cert_expiry - time()) / 86400',
  },

  /* ---------------- bundles: many values, one request ---------------- */
  {
    id: 'nodeBundle',
    shape: 'bundle',
    signals: ['cpu', 'mem', 'load1', 'fsroot'],
    expr:
      'label_replace(1 - avg(rate(node_cpu_seconds_total{mode="idle"}[5m])), "sc", "cpu", "", "")' +
      ' or label_replace(1 - (sum(node_memory_MemAvailable_bytes) / sum(node_memory_MemTotal_bytes)), "sc", "mem", "", "")' +
      ' or label_replace(avg(node_load1), "sc", "load1", "", "")' +
      ' or label_replace(1 - avg(node_filesystem_avail_bytes{mountpoint="/"} / node_filesystem_size_bytes{mountpoint="/"}), "sc", "fsroot", "", "")',
  },
  {
    id: 'clusterBundle',
    shape: 'bundle',
    signals: ['apiserverRate', 'apiserverErrors', 'restarts', 'unavailable'],
    expr:
      'label_replace(sum(rate(apiserver_request_total[5m])), "sc", "apiserverRate", "", "")' +
      ' or label_replace((sum(rate(apiserver_request_total{code=~"5.."}[5m])) or vector(0)), "sc", "apiserverErrors", "", "")' +
      ' or label_replace(sum(kube_pod_container_status_restarts_total), "sc", "restarts", "", "")' +
      ' or label_replace((sum(kube_deployment_status_replicas_unavailable) or vector(0)), "sc", "unavailable", "", "")',
  },
  {
    id: 'sqlBundle',
    shape: 'bundle',
    signals: ['mongoOps', 'mongoConns', 'mysqlQps', 'mysqlThreads', 'pgCommits', 'pgBackends'],
    expr:
      'label_replace(sum(rate(mongodb_ss_opcounters[5m])), "sc", "mongoOps", "", "")' +
      ' or label_replace(sum(mongodb_ss_connections{conn_type="current"}), "sc", "mongoConns", "", "")' +
      ' or label_replace(sum(rate(mysql_global_status_queries[5m])), "sc", "mysqlQps", "", "")' +
      ' or label_replace(sum(mysql_global_status_threads_connected), "sc", "mysqlThreads", "", "")' +
      ' or label_replace(sum(rate(pg_stat_database_xact_commit[5m])), "sc", "pgCommits", "", "")' +
      ' or label_replace(sum(pg_stat_database_numbackends), "sc", "pgBackends", "", "")',
  },
  {
    id: 'kvBundle',
    shape: 'bundle',
    signals: ['redisOps', 'redisMem', 'rabbitQueues', 'rabbitReady', 'meiliIndexing'],
    expr:
      'label_replace(sum(rate(redis_commands_processed_total[5m])), "sc", "redisOps", "", "")' +
      ' or label_replace(sum(redis_memory_used_bytes), "sc", "redisMem", "", "")' +
      ' or label_replace(sum(rabbitmq_queues), "sc", "rabbitQueues", "", "")' +
      ' or label_replace(sum(rabbitmq_queue_messages_ready), "sc", "rabbitReady", "", "")' +
      ' or label_replace(max(meilisearch_is_indexing), "sc", "meiliIndexing", "", "")',
  },
  {
    id: 'blobBundle',
    shape: 'bundle',
    // No `minioFree` operand. The free-space gauge is a fine number and it is
    // cheap to carry, but nothing in ./catalog reads it, and a signal with no
    // consumer is drift — `queries.spec.ts` fails on one. Whoever wants free
    // space adds the operand and the channel that displays it together.
    signals: ['minioDrives', 'minioUsage', 'minioHealth', 'giteaUsers'],
    expr:
      'label_replace(sum(minio_cluster_drive_online_total), "sc", "minioDrives", "", "")' +
      ' or label_replace(sum(minio_cluster_usage_total_bytes), "sc", "minioUsage", "", "")' +
      ' or label_replace(max(minio_cluster_health_status), "sc", "minioHealth", "", "")' +
      // gitea_users splits by `state` (active/inactive); un-aggregated it returns
      // two series and there is no single value to bind.
      ' or label_replace(sum(gitea_users), "sc", "giteaUsers", "", "")',
  },
  {
    id: 'appBundle',
    shape: 'bundle',
    signals: ['requests', 'errors', 'sse'],
    // LibreChat's own metrics. Nothing scrapes them today, so every selector
    // matches nothing and this query returns success with an empty result — which
    // lands the channels as 'missing' rather than 'error', and lights them up the
    // day a scrape job appears, with no change here or on the cluster.
    expr:
      'label_replace(sum(rate(http_requests_total{job="librechat"}[5m])), "sc", "requests", "", "")' +
      ' or label_replace(sum(rate(http_requests_total{job="librechat",status=~"5.."}[5m])), "sc", "errors", "", "")' +
      ' or label_replace(sum(sse_streams_in_flight{job="librechat"}), "sc", "sse", "", "")',
  },
] as const;

const BY_ID = new Map<SystemCoreQueryId, PromQueryDef>(QUERIES.map((q) => [q.id, q]));

export function queryById(id: SystemCoreQueryId): PromQueryDef | undefined {
  return BY_ID.get(id);
}
