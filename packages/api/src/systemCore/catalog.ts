// What the scene shows, and which series each part of it reads.
//
// Separate from ./queries.ts on purpose: that file is *what we ask Prometheus*,
// this is *what the picture is made of*. A metric being renamed touches one; a
// placement being tweaked touches the other.
//
// PLACEMENT IS A LADDER, NOT A TABLE
// ----------------------------------
// Each entry carries its radius, arc and spin — the values that give the stack
// its varied silhouette — but `y` is computed from the entry's position by
// `placementFor()`. Hard-coding a height per row was the alternative, and it
// rots: adding one module means re-typing every height below it, and getting it
// wrong overlaps two bands invisibly. The ladder keeps the stack inside the
// mainframe's cap rings whatever the catalogue grows to.
//
// THREE MECHANISMS, EACH EARNING ITS KEEP
// ---------------------------------------
// `claims`  the datastore exporters (mongodb-exporter, mysql-exporter, ...) are
//           their own `up` targets. Without this, each would spawn a redundant
//           overflow module standing next to the datastore it describes.
// `expand`  one entry becomes the ten blackbox probe modules. Ten near-identical
//           hand-written rows would drift the first time a probe was added.
// `reduce`  collapses a multi-series match in TypeScript, so a per-pod figure
//           can be summed without a second round trip to Prometheus.

import type {
  SystemCoreUnit,
  SystemCoreModule,
  SystemCoreStatus,
  SystemCoreChannelId,
  SystemCorePlacement,
  SystemCoreChannelPolarity,
} from 'librechat-data-provider';
import type { SystemCoreQueryId } from './queries';
import type { ScaleRule } from './scale';

/** How a binding finds its rows. Only the labels the catalogue actually keys on. */
export interface LabelMatch {
  readonly job?: string;
  readonly namespace?: string;
  readonly pod?: string;
  /** Matches a pod whose name starts with this — pods carry a generated suffix. */
  readonly podPrefix?: string;
  readonly instance?: string;
  /** The `sc` tag on a bundle operand. */
  readonly signal?: string;
  /** Resolve against the entry's own target instance rather than a literal. */
  readonly self?: boolean;
}

export type SeriesReduce = 'first' | 'sum' | 'avg' | 'min' | 'max' | 'count';

export interface SeriesSelector {
  readonly query: SystemCoreQueryId;
  readonly match: LabelMatch;
  readonly reduce: SeriesReduce;
}

export interface ChannelBinding {
  readonly id: SystemCoreChannelId;
  readonly label: string;
  readonly unit: SystemCoreUnit;
  readonly select: SeriesSelector;
  readonly scale: ScaleRule;
  readonly polarity: SystemCoreChannelPolarity;
  /** A health channel that, when it bottoms out, makes the module a fault. */
  readonly critical?: boolean;
}

export interface CatalogEntry {
  /** Must satisfy the client's ID_RE: /^[A-Za-z0-9][A-Za-z0-9._-]*$/ */
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly dependsOn: readonly string[];
  readonly radius: number;
  readonly arc: number;
  readonly speed: number;
  readonly hz?: number | null;
  readonly level?: number;
  /** Sort position. Determines `y` and the panel list order. */
  readonly order: number;
  /** The `up` series this module *is*. null for synthetic modules. */
  readonly target: LabelMatch | null;
  /** Extra `up` series this module absorbs, so they do not overflow. */
  readonly claims?: readonly LabelMatch[];
  /** One module per distinct label value in the named query. */
  readonly expand?: {
    readonly query: SystemCoreQueryId;
    readonly label: 'instance' | 'pod';
    readonly max: number;
  };
  /** Drawn white at the centre, regardless of health. */
  readonly isController?: boolean;
  /** Status when nothing has resolved yet. */
  readonly authoredStatus: SystemCoreStatus;
  readonly channels: readonly ChannelBinding[];
}

/* ---------------------------------------------------------------- placement */

/**
 * The stack's vertical extent, taken from the bundled arrangement so a live
 * scene has the same silhouette as the fixture it replaces. Comfortably inside
 * the mainframe's cap rings at y = ±1.55.
 */
const STACK_TOP = 1.44;
const STACK_BOTTOM = -1.52;

/** The controller sits apart: a wide, slow, quiet ring around the whole stack. */
const CONTROLLER_PLACEMENT: SystemCorePlacement = {
  radius: 3.62,
  y: 0.6,
  arc: 50,
  band: 0.02,
  speed: -0.1,
  hz: 86,
  level: 0.7,
  lane: null,
  order: 0,
};

const BAND = 0.02;
const DEFAULT_LEVEL = 0.5;

/* ------------------------------------------------------------------ rotation */

// HOW FAST A STRIP TURNS, AND WHY IT IS COMPUTED
// ---------------------------------------------
// `SPIN` on the client is 2π × 0.15, so a `speed` of 1.0 is one revolution every
// 6.7 seconds and the period is 6.67/speed. The bundled fixture — the reference
// for how this is supposed to look — authors 26 modules across |0.04|..|0.15|,
// which is 44 to 167 seconds a revolution. Every one of those reads as motionless
// at a glance; what made the fixture feel alive was that no two rings were
// synchronised, not that any single one was quick.
//
// So the catalogue keeps the fixture's *shape* — the spread, the ratio, the mix
// of directions — and multiplies it up. GAIN is the one dial worth touching: at
// 2.5 the band becomes 0.1..0.375, which is 67 down to 18 seconds a revolution.
// It was 5 for one revision and read as too brisk on a real screen; halving it is
// a judgement made looking at the scene, not a derivation.
const GAIN = 1.9;

/**
 * The centre ring's own gain — a third of what the rest were given at the
 * previous value, so two thirds of the halved figure.
 *
 * Separate on purpose rather than folded into GAIN. The controller reads as the
 * frame the stack sits inside, not as a module competing with it, so it should be
 * the calmest thing on screen: wide, slow, and clearly not keeping pace. It also
 * has no throughput channel, so nothing modulates it afterwards and this figure is
 * exactly what it turns at.
 */
const CONTROLLER_GAIN = 5 / 8;

/** The band the fixture spans, before any gain. */
const FIXTURE_SLOWEST = 0.04;
const FIXTURE_FASTEST = 0.15;

/**
 * The band a given gain admits, for the tests to read rather than restate.
 *
 * Clamped to, so a hand-authored outlier cannot reintroduce a strip that laps the
 * whole stack — and exported so an assertion about how fast the scene turns
 * cannot drift from the constants that decide it.
 */
export function speedBand(controller = false): { slowest: number; fastest: number } {
  const gain = controller ? CONTROLLER_GAIN : GAIN;
  return { slowest: FIXTURE_SLOWEST * gain, fastest: FIXTURE_FASTEST * gain };
}

/**
 * A stable 0..1 from a module id.
 *
 * FNV-1a, and deterministic on purpose: the id is the only thing about an
 * expanded module that distinguishes it, and a random or index-derived value
 * would either wobble between snapshots or renumber every probe when one is
 * added. A strip's rotation is keyed by id, so a speed that moved would be a
 * visible stutter on the poll.
 */
function hash01(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * The speed one module turns at.
 *
 * The authored value carries the intent — which way a strip goes, and roughly how
 * briskly relative to its neighbours — and the gain makes it visible. An expanded
 * entry additionally spreads its instances: `placementFor` varies `y` per instance
 * but copied `speed` straight off the entry, so the ten blackbox probes came out
 * as ten rings turning at exactly the same rate in the same direction, which is
 * the single most obvious way to make a scene look frozen.
 */
export function speedFor(
  id: string,
  authored: number,
  expanded: boolean,
  controller = false,
): number {
  const gain = controller ? CONTROLLER_GAIN : GAIN;
  const sign = authored < 0 ? -1 : 1;
  const base = Math.abs(authored) * gain;
  if (!expanded) {
    return Math.round(sign * clampSpeed(base, controller) * 1000) / 1000;
  }
  // 0.55..1.45 of the entry's speed, and the direction taken from a second bit of
  // the hash so a row of instances is not a row of synchronised rings.
  const h = hash01(id);
  const spread = 0.55 + 0.9 * h;
  const flip = hash01(`${id}/dir`) < 0.5 ? -1 : 1;
  return Math.round(sign * flip * clampSpeed(base * spread, controller) * 1000) / 1000;
}

function clampSpeed(v: number, controller: boolean): number {
  const { slowest, fastest } = speedBand(controller);
  return Math.min(fastest, Math.max(slowest, v));
}

/**
 * Where the `index`-th of `count` modules sits.
 *
 * Evenly spaced across the stack's extent. With one module it sits at the top
 * rather than dividing by zero.
 */
export function placementFor(
  entry: Pick<CatalogEntry, 'radius' | 'arc' | 'speed' | 'hz' | 'level' | 'order' | 'isController'>,
  index: number,
  count: number,
  /** The module's own id, which is what gives an expanded instance its own speed. */
  id = '',
  expanded = false,
): SystemCorePlacement {
  if (entry.isController === true) {
    return {
      ...CONTROLLER_PLACEMENT,
      order: entry.order,
      speed: speedFor(id || 'controller', CONTROLLER_PLACEMENT.speed, false, true),
    };
  }
  const span = STACK_TOP - STACK_BOTTOM;
  const y = count <= 1 ? STACK_TOP : STACK_TOP - (span * index) / (count - 1);
  return {
    radius: entry.radius,
    y: Math.round(y * 1000) / 1000,
    arc: entry.arc,
    band: BAND,
    speed: speedFor(id, entry.speed, expanded),
    hz: entry.hz ?? null,
    level: entry.level ?? DEFAULT_LEVEL,
    lane: null,
    order: entry.order,
  };
}

/** Placement for a module that arrived without a catalogue entry. */
export function overflowPlacement(index: number, order: number): SystemCorePlacement {
  return {
    radius: 1.32,
    // Stacked downward from the top, independent of the curated ladder so a new
    // discovery never shifts a curated module.
    y: Math.round((STACK_TOP - index * 0.12) * 1000) / 1000,
    arc: 90,
    band: 0.04,
    // Alternating direction so a row of unknowns reads as a row, with the same
    // gain the curated ladder gets — an overflow strip that never visibly turns
    // is indistinguishable from one the scene has stopped updating.
    // Not `expanded`: the alternation is the signal here, and letting the hash
    // pick a direction would scramble it. Only the gain applies.
    speed: speedFor(`auto/${index}`, index % 2 === 0 ? 0.08 : -0.08, false),
    hz: null,
    level: DEFAULT_LEVEL,
    lane: null,
    order,
  };
}

/* ----------------------------------------------------------------- helpers */

const availability = (select: SeriesSelector, label = 'Availability'): ChannelBinding => ({
  id: 'availability',
  label,
  unit: 'boolean',
  select,
  scale: { kind: 'bool' },
  polarity: 'health',
  critical: true,
});

const self = (reduce: SeriesReduce = 'first'): SeriesSelector => ({
  query: 'up',
  match: { self: true },
  reduce,
});

const bundle = (query: SystemCoreQueryId, signal: string): SeriesSelector => ({
  query,
  match: { signal },
  reduce: 'first',
});

const podCpu = (namespace: string, podPrefix?: string): SeriesSelector => ({
  query: 'podCpu',
  match: podPrefix == null ? { namespace } : { namespace, podPrefix },
  reduce: 'sum',
});

const podMem = (namespace: string, podPrefix?: string): SeriesSelector => ({
  query: 'podMem',
  match: podPrefix == null ? { namespace } : { namespace, podPrefix },
  reduce: 'sum',
});

/** CPU and memory from cAdvisor. Available for every pod, exporter or not. */
const resourceChannels = (
  namespace: string,
  podPrefix: string | undefined,
  cpuMax: number,
  memMax: number,
): ChannelBinding[] => [
  {
    id: 'load',
    label: 'CPU',
    unit: 'cores',
    select: podCpu(namespace, podPrefix),
    scale: { kind: 'log', max: cpuMax },
    polarity: 'activity',
  },
  {
    id: 'saturation',
    label: 'Memory',
    unit: 'bytes',
    select: podMem(namespace, podPrefix),
    scale: { kind: 'linear', max: memMax },
    polarity: 'activity',
  },
];

const GB = 1_000_000_000;

/* ----------------------------------------------------------------- catalogue */

export const CATALOG: readonly CatalogEntry[] = [
  {
    id: 'controller',
    label: 'cluster - control plane',
    group: 'core',
    description: 'The node this cluster runs on.',
    tags: ['node', 'cluster'],
    dependsOn: [],
    radius: 3.62,
    arc: 50,
    speed: -0.1,
    hz: 86,
    level: 0.7,
    order: 0,
    target: null,
    isController: true,
    authoredStatus: 'controller',
    channels: [
      {
        id: 'load',
        label: 'CPU busy',
        unit: 'ratio',
        select: bundle('nodeBundle', 'cpu'),
        scale: { kind: 'ratio' },
        polarity: 'activity',
      },
      {
        id: 'saturation',
        label: 'Memory used',
        unit: 'ratio',
        select: bundle('nodeBundle', 'mem'),
        scale: { kind: 'ratio' },
        polarity: 'activity',
      },
      {
        id: 'connections',
        label: 'Pods running',
        unit: 'count',
        // Summed across every namespace, which is what makes the centre ring
        // read as the whole cluster rather than as one of its parts.
        select: { query: 'podsRunning', match: {}, reduce: 'sum' },
        scale: { kind: 'linear', max: 120 },
        polarity: 'activity',
      },
    ],
  },
  {
    id: 'kube-apiserver',
    label: 'kube-apiserver',
    group: 'core',
    description: 'The cluster API server.',
    tags: ['kubernetes'],
    dependsOn: [],
    radius: 0.72,
    arc: 210,
    speed: 0.1,
    order: 10,
    target: { job: 'kubernetes-apiserver' },
    authoredStatus: 'running',
    channels: [
      availability(self()),
      {
        id: 'throughput',
        label: 'Requests',
        unit: 'per_second',
        select: bundle('clusterBundle', 'apiserverRate'),
        scale: { kind: 'log', max: 200 },
        polarity: 'activity',
      },
      {
        id: 'errors',
        label: 'Server errors',
        unit: 'per_second',
        select: bundle('clusterBundle', 'apiserverErrors'),
        scale: { kind: 'band', good: 0, bad: 1 },
        polarity: 'health',
      },
    ],
  },
  {
    id: 'kube-nodes',
    label: 'kubelet',
    group: 'core',
    description: 'Node-level kubelet metrics.',
    tags: ['kubernetes'],
    dependsOn: ['kube-apiserver'],
    radius: 0.86,
    arc: 130,
    speed: -0.07,
    order: 20,
    target: { job: 'kubernetes-nodes' },
    claims: [{ job: 'kubernetes-cadvisor' }],
    authoredStatus: 'running',
    channels: [
      availability(self()),
      {
        id: 'load',
        label: 'Load average',
        unit: 'count',
        select: bundle('nodeBundle', 'load1'),
        scale: { kind: 'linear', max: 8 },
        polarity: 'activity',
      },
    ],
  },
  {
    id: 'node-exporter',
    label: 'node-exporter',
    group: 'observability',
    description: 'Host CPU, memory and filesystem.',
    tags: ['host'],
    dependsOn: [],
    radius: 0.89,
    arc: 95,
    speed: 0.13,
    order: 30,
    target: { job: 'node-exporter' },
    authoredStatus: 'running',
    channels: [
      availability(self()),
      {
        id: 'capacity',
        label: 'Root filesystem free',
        unit: 'ratio',
        // Inverted by the band: 50% used is fine, 95% is not.
        select: bundle('nodeBundle', 'fsroot'),
        scale: { kind: 'band', good: 0.5, bad: 0.95 },
        polarity: 'health',
        critical: true,
      },
      {
        id: 'saturation',
        // Carried in the label because the wire has no temperature unit, and
        // inventing one would mean a data-provider change for one channel.
        label: 'Temperature °C',
        unit: 'count',
        // The one physical signal in the whole catalogue, and nothing else
        // reports it: a machine cooking itself is invisible to every other
        // channel here until something falls over.
        select: bundle('nodeBundle', 'temp'),
        scale: { kind: 'band', good: 45, bad: 85 },
        polarity: 'health',
      },
      {
        id: 'load',
        label: 'Disk busy',
        unit: 'ratio',
        select: bundle('nodeBundle', 'diskio'),
        scale: { kind: 'ratio' },
        polarity: 'activity',
      },
    ],
  },
  {
    id: 'kube-state-metrics',
    label: 'kube-state-metrics',
    group: 'observability',
    description: 'Cluster object state.',
    tags: ['kubernetes'],
    dependsOn: ['kube-apiserver'],
    radius: 0.92,
    arc: 260,
    speed: -0.05,
    order: 40,
    target: { job: 'kube-state-metrics' },
    authoredStatus: 'running',
    channels: [
      availability(self()),
      {
        id: 'errors',
        label: 'Container restarts',
        // Per second now, not a running total — see the `restarts` operand in
        // ./queries. A cumulative counter on a log scale saturated the first time
        // anything restarted and never came back down.
        unit: 'per_second',
        select: bundle('clusterBundle', 'restarts'),
        // 0.05/s is three restarts a minute, which is a crash loop rather than a
        // blip. Health rather than activity: containers restarting is not the
        // cluster being busy.
        scale: { kind: 'band', good: 0, bad: 0.05 },
        polarity: 'health',
      },
      {
        id: 'capacity',
        label: 'Replicas available',
        unit: 'count',
        select: bundle('clusterBundle', 'unavailable'),
        scale: { kind: 'bool', invert: true },
        polarity: 'health',
        critical: true,
      },
    ],
  },
  {
    id: 'mongo',
    label: 'mongo',
    group: 'storage',
    description: 'MongoDB — LibreChat’s primary store.',
    tags: ['database'],
    dependsOn: [],
    radius: 0.84,
    arc: 200,
    speed: -0.06,
    order: 50,
    target: { job: 'kubernetes-pods', podPrefix: 'mongo' },
    authoredStatus: 'running',
    channels: [
      availability(self()),
      {
        id: 'throughput',
        label: 'Operations',
        unit: 'per_second',
        select: bundle('sqlBundle', 'mongoOps'),
        scale: { kind: 'log', max: 500 },
        polarity: 'activity',
      },
      {
        id: 'connections',
        label: 'Connections',
        unit: 'count',
        select: bundle('sqlBundle', 'mongoConns'),
        scale: { kind: 'linear', max: 200 },
        polarity: 'activity',
      },
      ...resourceChannels('infra', 'mongo', 2, 2 * GB),
    ],
  },
  {
    id: 'mysql',
    label: 'mysql',
    group: 'storage',
    description: 'MySQL.',
    tags: ['database'],
    dependsOn: [],
    radius: 0.91,
    arc: 145,
    speed: 0.08,
    order: 60,
    target: { job: 'kubernetes-pods', podPrefix: 'mysql' },
    authoredStatus: 'running',
    channels: [
      availability(self()),
      {
        id: 'throughput',
        label: 'Queries',
        unit: 'per_second',
        select: bundle('sqlBundle', 'mysqlQps'),
        scale: { kind: 'log', max: 500 },
        polarity: 'activity',
      },
      {
        id: 'connections',
        label: 'Threads connected',
        unit: 'count',
        select: bundle('sqlBundle', 'mysqlThreads'),
        scale: { kind: 'linear', max: 150 },
        polarity: 'activity',
      },
      ...resourceChannels('infra', 'mysql', 2, 2 * GB),
    ],
  },
  {
    id: 'pgvector',
    label: 'pgvector',
    group: 'storage',
    description: 'PostgreSQL with pgvector, backing RAG.',
    tags: ['database', 'vector'],
    dependsOn: [],
    radius: 0.94,
    arc: 175,
    speed: -0.09,
    order: 70,
    target: { job: 'kubernetes-pods', podPrefix: 'pgvector' },
    authoredStatus: 'running',
    channels: [
      availability(self()),
      {
        id: 'throughput',
        label: 'Transactions',
        unit: 'per_second',
        select: bundle('sqlBundle', 'pgCommits'),
        scale: { kind: 'log', max: 500 },
        polarity: 'activity',
      },
      {
        id: 'connections',
        label: 'Backends',
        unit: 'count',
        select: bundle('sqlBundle', 'pgBackends'),
        scale: { kind: 'linear', max: 100 },
        polarity: 'activity',
      },
      ...resourceChannels('infra', 'pgvector', 2, 2 * GB),
    ],
  },
  {
    id: 'redis',
    label: 'redis',
    group: 'core',
    description: 'Redis — cache and stream store.',
    tags: ['cache'],
    dependsOn: [],
    radius: 0.86,
    arc: 230,
    speed: -0.15,
    order: 80,
    target: { job: 'kubernetes-pods', podPrefix: 'redis' },
    authoredStatus: 'running',
    channels: [
      availability(self()),
      {
        id: 'throughput',
        label: 'Commands',
        unit: 'per_second',
        select: bundle('kvBundle', 'redisOps'),
        scale: { kind: 'log', max: 5000 },
        polarity: 'activity',
      },
      {
        id: 'saturation',
        label: 'Memory used',
        unit: 'bytes',
        select: bundle('kvBundle', 'redisMem'),
        scale: { kind: 'linear', max: 540_000_000 },
        polarity: 'activity',
      },
    ],
  },
  {
    id: 'rabbitmq',
    label: 'rabbitmq',
    group: 'network',
    description: 'RabbitMQ message broker.',
    tags: ['queue'],
    dependsOn: [],
    radius: 0.9,
    arc: 190,
    speed: -0.11,
    order: 90,
    target: { job: 'kubernetes-pods', podPrefix: 'rabbitmq' },
    authoredStatus: 'running',
    channels: [
      availability(self()),
      {
        id: 'throughput',
        label: 'Published',
        unit: 'per_second',
        // The rate, which is what `throughput` means everywhere else and what the
        // strip's rotation is modulated by. This channel used to carry the queue
        // depth, so a broker whose consumers had stalled span *faster*.
        select: bundle('kvBundle', 'rabbitPublish'),
        scale: { kind: 'log', max: 200 },
        polarity: 'activity',
      },
      {
        id: 'saturation',
        label: 'Messages ready',
        unit: 'count',
        // Still worth showing — it is simply a backlog rather than a throughput.
        select: bundle('kvBundle', 'rabbitReady'),
        scale: { kind: 'log', max: 1000 },
        polarity: 'activity',
      },
      {
        id: 'connections',
        label: 'Consumers',
        unit: 'count',
        // The other half of the pair: depth alone cannot distinguish a busy
        // broker from one nobody is draining.
        select: bundle('kvBundle', 'rabbitConsumers'),
        scale: { kind: 'linear', max: 50 },
        polarity: 'activity',
      },
    ],
  },
  {
    id: 'qdrant',
    label: 'qdrant',
    group: 'storage',
    description: 'Qdrant vector database.',
    tags: ['vector'],
    dependsOn: [],
    radius: 0.98,
    arc: 160,
    speed: 0.07,
    order: 100,
    target: { job: 'qdrant' },
    authoredStatus: 'running',
    channels: [availability(self()), ...resourceChannels('infra', 'qdrant', 2, 2 * GB)],
  },
  {
    id: 'minio',
    label: 'minio',
    group: 'storage',
    description: 'MinIO object storage.',
    tags: ['storage'],
    dependsOn: [],
    radius: 0.87,
    arc: 180,
    speed: -0.08,
    order: 110,
    target: { job: 'minio' },
    authoredStatus: 'running',
    channels: [
      availability(self()),
      {
        id: 'capacity',
        label: 'Cluster health',
        unit: 'boolean',
        select: bundle('blobBundle', 'minioHealth'),
        scale: { kind: 'bool' },
        polarity: 'health',
        critical: true,
      },
      {
        id: 'saturation',
        label: 'Bytes stored',
        unit: 'bytes',
        select: bundle('blobBundle', 'minioUsage'),
        scale: { kind: 'log', max: 1_000_000_000_000 },
        polarity: 'activity',
      },
      {
        id: 'connections',
        label: 'Drives online',
        unit: 'count',
        select: bundle('blobBundle', 'minioDrives'),
        scale: { kind: 'linear', max: 4 },
        polarity: 'activity',
      },
    ],
  },
  {
    id: 'meilisearch',
    label: 'meilisearch',
    group: 'storage',
    description: 'Meilisearch full-text index.',
    tags: ['search'],
    dependsOn: [],
    radius: 0.96,
    arc: 140,
    speed: -0.1,
    order: 120,
    target: { job: 'meilisearch' },
    authoredStatus: 'running',
    channels: [
      availability(self()),
      {
        id: 'throughput',
        label: 'Requests',
        unit: 'per_second',
        // A real rate. `throughput` reaches the strip's rotation, and a boolean
        // there gave two indistinguishable speeds ten per cent apart.
        select: bundle('kvBundle', 'meiliRequests'),
        scale: { kind: 'log', max: 200 },
        polarity: 'activity',
      },
      {
        id: 'saturation',
        label: 'Indexing',
        unit: 'boolean',
        select: bundle('kvBundle', 'meiliIndexing'),
        scale: { kind: 'bool' },
        polarity: 'activity',
      },
    ],
  },
  {
    id: 'librechat',
    label: 'librechat',
    group: 'network',
    description: 'This application.',
    tags: ['app'],
    dependsOn: ['mongo', 'redis', 'meilisearch'],
    radius: 0.81,
    arc: 120,
    speed: 0.04,
    order: 130,
    // No `up` target: the app's own /metrics is not scraped. cAdvisor still sees
    // the pod, and the app-metric channels below light up if a job is ever added.
    target: null,
    authoredStatus: 'running',
    channels: [
      {
        id: 'availability',
        label: 'Pods ready',
        unit: 'count',
        select: { query: 'podsReady', match: { namespace: 'librechat' }, reduce: 'sum' },
        scale: { kind: 'bool' },
        polarity: 'health',
        critical: true,
      },
      ...resourceChannels('librechat', undefined, 2, 2 * GB),
      {
        id: 'throughput',
        label: 'HTTP requests',
        unit: 'per_second',
        select: bundle('appBundle', 'requests'),
        scale: { kind: 'log', max: 200 },
        polarity: 'activity',
      },
      {
        id: 'errors',
        label: 'HTTP 5xx',
        unit: 'per_second',
        select: bundle('appBundle', 'errors'),
        scale: { kind: 'band', good: 0, bad: 5 },
        polarity: 'health',
      },
      {
        id: 'connections',
        label: 'Open streams',
        unit: 'count',
        select: bundle('appBundle', 'sse'),
        scale: { kind: 'linear', max: 100 },
        polarity: 'activity',
      },
    ],
  },
  {
    id: 'gitea',
    label: 'gitea',
    group: 'network',
    description: 'Gitea source hosting.',
    tags: ['app'],
    dependsOn: [],
    radius: 0.99,
    arc: 165,
    speed: 0.06,
    order: 140,
    target: { job: 'kubernetes-pods', podPrefix: 'gitea' },
    authoredStatus: 'running',
    channels: [
      availability(self()),
      {
        id: 'connections',
        label: 'Users',
        unit: 'count',
        select: bundle('blobBundle', 'giteaUsers'),
        scale: { kind: 'linear', max: 50 },
        polarity: 'activity',
      },
      ...resourceChannels('gitea', undefined, 1, GB),
    ],
  },
  {
    id: 'prometheus',
    label: 'prometheus',
    group: 'observability',
    description: 'The Prometheus this scene is drawn from.',
    tags: ['observability'],
    dependsOn: [],
    radius: 0.82,
    arc: 190,
    speed: 0.06,
    order: 150,
    target: { job: 'prometheus' },
    authoredStatus: 'running',
    channels: [
      availability(self()),
      {
        id: 'latency',
        label: 'Scrape duration',
        unit: 'seconds',
        // The feed watching itself. Every number in this scene is downstream of a
        // scrape completing inside its interval, and until now the one module
        // that could have said so reported only whether its own port answered.
        // Critical: a Prometheus taking sixteen seconds to scrape is not serving
        // current data, whatever its `up` series says.
        select: bundle('clusterBundle', 'scrapeMax'),
        scale: { kind: 'band', good: 1, bad: 25 },
        polarity: 'health',
        critical: true,
      },
      ...resourceChannels('infra', 'prometheus', 2, 4 * GB),
    ],
  },
  {
    id: 'blackbox-exporter',
    label: 'blackbox-exporter',
    group: 'observability',
    description: 'Probes the public endpoints.',
    tags: ['observability'],
    dependsOn: [],
    radius: 0.88,
    arc: 250,
    speed: 0.09,
    order: 160,
    target: null,
    authoredStatus: 'running',
    channels: [...resourceChannels('infra', 'blackbox-exporter', 1, GB)],
  },
  {
    id: 'vaultwarden',
    label: 'vaultwarden',
    group: 'security',
    description: 'Credential vault.',
    tags: ['app'],
    dependsOn: [],
    radius: 0.91,
    arc: 100,
    speed: -0.05,
    order: 170,
    target: null,
    authoredStatus: 'running',
    channels: [
      {
        id: 'availability',
        label: 'Pods ready',
        unit: 'count',
        select: { query: 'podsReady', match: { namespace: 'vaultwarden' }, reduce: 'sum' },
        scale: { kind: 'bool' },
        polarity: 'health',
        critical: true,
      },
      ...resourceChannels('vaultwarden', undefined, 1, GB),
    ],
  },
  {
    id: 'probe',
    label: 'endpoint',
    group: 'network',
    description: 'A probed public endpoint.',
    tags: ['probe'],
    dependsOn: [],
    radius: 1.15,
    arc: 60,
    speed: 0.09,
    order: 200,
    // Each probe becomes its own module. `target` is unset because the blackbox
    // exporter's `up` belongs to the exporter, not to the endpoint it probed.
    target: null,
    expand: { query: 'probeSuccess', label: 'instance', max: 12 },
    authoredStatus: 'running',
    channels: [
      {
        id: 'availability',
        label: 'Reachable',
        unit: 'boolean',
        // probe_success, never `up`: `up` only says the exporter answered.
        select: { query: 'probeSuccess', match: {}, reduce: 'first' },
        scale: { kind: 'bool' },
        polarity: 'health',
        critical: true,
      },
      {
        id: 'latency',
        label: 'Response time',
        unit: 'seconds',
        select: { query: 'probeDuration', match: {}, reduce: 'first' },
        scale: { kind: 'band', good: 0.1, bad: 1 },
        polarity: 'health',
      },
      {
        id: 'capacity',
        label: 'Certificate lifetime',
        unit: 'days',
        select: { query: 'probeCertDays', match: {}, reduce: 'first' },
        scale: { kind: 'band', good: 60, bad: 7 },
        polarity: 'health',
      },
    ],
  },
];

/** Every catalogue entry by id, for the assembler's lookups. */
export const CATALOG_BY_ID = new Map<string, CatalogEntry>(CATALOG.map((e) => [e.id, e]));

/** Hard ceiling on discovered modules, so a misconfigured Prometheus cannot
 *  turn 50,000 targets into 50,000 strips. */
export const MAX_OVERFLOW = 64;

/** The fields of an assembled module that are allowed to move the revision. */
export type RevisionInput = Pick<SystemCoreModule, 'id' | 'placement' | 'channels'>;

/**
 * A fingerprint of the module *set*, sent to the client as `catalogRevision`.
 *
 * It lets the client tell "the module list changed" from "the numbers changed",
 * so it reconciles its scene graph rarely and applies readings often.
 *
 * WHY THIS TAKES THE ASSEMBLED MODULES AND NOT `CATALOG`
 * -----------------------------------------------------
 * It used to be a pure function of the CATALOG constant, which made it a
 * compile-time constant — and CATALOG is not the module list. `expandCatalog`
 * turns the one `probe` entry into a module per blackbox target, and
 * `buildOverflow` appends whatever discovery found. So a new probe, a new scrape
 * target, or a target going away all left the revision untouched, the client's
 * reconcile ran exactly once per page load, and the scene silently stopped
 * tracking the cluster until someone reloaded the tab.
 *
 * Every term below is still something a *measurement* cannot move: ids come from
 * which targets exist, placement is derived from the entry and the module's
 * position in the set, and the channel count is static per entry. An id appearing
 * or disappearing does move it, and that is the whole point — a module arriving
 * is not a sample changing.
 */
export function revisionOf(modules: readonly RevisionInput[]): string {
  const parts: string[] = [];
  for (const m of modules) {
    const p = m.placement;
    parts.push(`${m.id}:${p.order}:${p.radius}:${p.arc}:${p.speed}:${m.channels.length}`);
  }
  return parts.join('|');
}
