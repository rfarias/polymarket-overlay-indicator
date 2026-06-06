import fs from "node:fs/promises";
import path from "node:path";
import { DistanceToBeatBucket, DistanceToBeatReport } from "../strategies/distanceToBeat/index.js";
import { getArgValue, getNumberArg } from "../utils/args.js";

type Mode = "dominant" | "reversal";
type Verdict = "STABLE" | "MIXED" | "ISOLATED";

interface Candidate {
  mode: Mode;
  bucketType: string;
  bucketKey: string;
  samples: number;
  edge: number;
  winRate: number;
  avgAsk?: number;
  avgDistanceBps: number;
  avgDistanceSigma?: number;
  avgSecondsRemaining: number;
  neighborCount: number;
  positiveNeighbors: number;
  avgNeighborEdge?: number;
  minNeighborEdge?: number;
  robustnessScore: number;
  verdict: Verdict;
  notes: string[];
}

const SECONDS_ORDER = ["180-240", "120-180", "90-120", "60-90", "30-60", "15-30", "5-15"];
const SIGNED_BPS_ORDER = ["<-50", "-50--30", "-30--15", "-15--5", "-5-0.00", "0.00-5", "5-15", "15-30", "30-50", ">=50"];
const SIGMA_ORDER = ["0.00-0.50", "0.50-1", "1-2", "2-3", "3-5", ">=5"];

const args = process.argv.slice(2);
const input = getArgValue(args, "--input");
const outputDir = path.resolve(getArgValue(args, "--output-dir", "research-output/distance-to-beat/stability")!);
const minSamples = getNumberArg(args, "--min-samples", 200);
const minEdge = getNumberArg(args, "--min-edge", 0.02);
const minPositiveNeighbors = getNumberArg(args, "--min-positive-neighbors", 2);

if (!input) {
  console.error("Uso: npm run distance-bucket-stability -- --input research-output/distance-to-beat/.../distance-to-beat-report.json [--output-dir ...]");
  process.exit(1);
}

const report = JSON.parse(await fs.readFile(path.resolve(input), "utf8")) as DistanceToBeatReport;
const candidates = analyze(report, { minSamples, minEdge, minPositiveNeighbors });

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "distance-bucket-stability.json"), JSON.stringify({
  generatedAt: new Date().toISOString(),
  input: path.resolve(input),
  options: { minSamples, minEdge, minPositiveNeighbors },
  sourceReport: {
    generatedAt: report.generatedAt,
    observations: report.observations,
    markets: report.markets,
    dataQuality: [...new Set(report.buckets.map((bucket) => bucket.dataQuality))]
  },
  notes: [
    "STABLE requires enough positive adjacent buckets, not only high edge in one bucket.",
    "Adjacency is calculated on seconds x signed-distance-bps and dominant-side x seconds x distance-sigma grids.",
    "This is a robustness filter for research triage, not an executable trading rule."
  ],
  candidates
}, null, 2));
await fs.writeFile(path.join(outputDir, "distance-bucket-stability.csv"), candidatesCsv(candidates));
await fs.writeFile(path.join(outputDir, "distance-bucket-stability.md"), markdownReport(report, candidates));

printSummary(candidates);
console.log(JSON.stringify({
  ok: true,
  input: path.resolve(input),
  outputDir,
  candidates: candidates.length,
  stable: candidates.filter((candidate) => candidate.verdict === "STABLE").length,
  mixed: candidates.filter((candidate) => candidate.verdict === "MIXED").length,
  isolated: candidates.filter((candidate) => candidate.verdict === "ISOLATED").length
}, null, 2));

function analyze(
  report: DistanceToBeatReport,
  options: { minSamples: number; minEdge: number; minPositiveNeighbors: number }
): Candidate[] {
  const byTypeAndKey = new Map(report.buckets.map((bucket) => [`${bucket.bucketType}|${bucket.bucketKey}`, bucket]));
  const candidates: Candidate[] = [];

  for (const bucket of report.buckets) {
    if (bucket.samples < options.minSamples || bucket.sampleQuality !== "OK") continue;
    for (const mode of ["dominant", "reversal"] as const) {
      const edge = edgeFor(bucket, mode);
      if (edge === undefined || edge < options.minEdge) continue;
      const neighborBuckets = neighborsFor(bucket)
        .map((neighbor) => byTypeAndKey.get(`${neighbor.bucketType}|${neighbor.bucketKey}`))
        .filter((row): row is DistanceToBeatBucket => row !== undefined && row.samples >= options.minSamples);
      const neighborEdges = neighborBuckets
        .map((neighbor) => edgeFor(neighbor, mode))
        .filter((value): value is number => value !== undefined && Number.isFinite(value));
      const positiveNeighbors = neighborEdges.filter((value) => value > 0).length;
      const avgNeighborEdge = averageOptional(neighborEdges);
      const minNeighborEdge = neighborEdges.length ? Math.min(...neighborEdges) : undefined;
      const robustnessScore = scoreCandidate(edge, neighborEdges, positiveNeighbors, options.minPositiveNeighbors);
      const verdict = verdictFor(positiveNeighbors, minNeighborEdge, options.minPositiveNeighbors);
      const notes = notesFor(verdict, neighborEdges, options.minPositiveNeighbors);

      candidates.push({
        mode,
        bucketType: bucket.bucketType,
        bucketKey: bucket.bucketKey,
        samples: bucket.samples,
        edge,
        winRate: winRateFor(bucket, mode),
        avgAsk: avgAskFor(bucket, mode),
        avgDistanceBps: bucket.avgDistanceBps,
        avgDistanceSigma: bucket.avgDistanceSigma,
        avgSecondsRemaining: bucket.avgSecondsRemaining,
        neighborCount: neighborEdges.length,
        positiveNeighbors,
        avgNeighborEdge,
        minNeighborEdge,
        robustnessScore,
        verdict,
        notes
      });
    }
  }

  return candidates.sort((a, b) =>
    verdictRank(a.verdict) - verdictRank(b.verdict) ||
    b.robustnessScore - a.robustnessScore ||
    b.edge - a.edge
  );
}

function neighborsFor(bucket: DistanceToBeatBucket): Array<{ bucketType: string; bucketKey: string }> {
  if (bucket.bucketType === "seconds_signed_distance_bps") {
    const [seconds, distance] = bucket.bucketKey.split("|");
    return adjacent2d("seconds_signed_distance_bps", seconds, distance, SECONDS_ORDER, SIGNED_BPS_ORDER);
  }
  if (bucket.bucketType === "dominant_seconds_distance_sigma") {
    const [side, seconds, sigma] = bucket.bucketKey.split("|");
    return adjacent2d("dominant_seconds_distance_sigma", seconds, sigma, SECONDS_ORDER, SIGMA_ORDER)
      .map((neighbor) => ({ bucketType: neighbor.bucketType, bucketKey: `${side}|${neighbor.bucketKey}` }));
  }
  if (bucket.bucketType === "seconds_distance_sigma") {
    const [seconds, sigma] = bucket.bucketKey.split("|");
    return adjacent2d("seconds_distance_sigma", seconds, sigma, SECONDS_ORDER, SIGMA_ORDER);
  }
  return [];
}

function adjacent2d(
  bucketType: string,
  x: string | undefined,
  y: string | undefined,
  xOrder: string[],
  yOrder: string[]
): Array<{ bucketType: string; bucketKey: string }> {
  if (!x || !y) return [];
  const xi = xOrder.indexOf(x);
  const yi = yOrder.indexOf(y);
  if (xi < 0 || yi < 0) return [];
  const neighbors: Array<{ bucketType: string; bucketKey: string }> = [];
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) {
      if (dx === 0 && dy === 0) continue;
      const nx = xOrder[xi + dx];
      const ny = yOrder[yi + dy];
      if (nx && ny) neighbors.push({ bucketType, bucketKey: `${nx}|${ny}` });
    }
  }
  return neighbors;
}

function edgeFor(bucket: DistanceToBeatBucket, mode: Mode): number | undefined {
  return mode === "dominant" ? bucket.dominantNetEdge : bucket.reversalNetEdge;
}

function winRateFor(bucket: DistanceToBeatBucket, mode: Mode): number {
  return mode === "dominant" ? bucket.dominantWinRate : bucket.reversalWinRate;
}

function avgAskFor(bucket: DistanceToBeatBucket, mode: Mode): number | undefined {
  return mode === "dominant" ? bucket.avgDominantAsk : bucket.avgReversalAsk;
}

function verdictFor(positiveNeighbors: number, minNeighborEdge: number | undefined, minPositiveNeighbors: number): Verdict {
  if (positiveNeighbors >= minPositiveNeighbors && minNeighborEdge !== undefined && minNeighborEdge > -0.02) return "STABLE";
  if (positiveNeighbors >= 1) return "MIXED";
  return "ISOLATED";
}

function scoreCandidate(edge: number, neighborEdges: number[], positiveNeighbors: number, minPositiveNeighbors: number): number {
  const avgNeighborEdge = averageOptional(neighborEdges) ?? 0;
  const supportRatio = neighborEdges.length ? positiveNeighbors / neighborEdges.length : 0;
  const supportBonus = Math.min(1, positiveNeighbors / minPositiveNeighbors) * 0.03;
  return edge + avgNeighborEdge * 0.75 + supportRatio * 0.02 + supportBonus;
}

function notesFor(verdict: Verdict, neighborEdges: number[], minPositiveNeighbors: number): string[] {
  const notes: string[] = [];
  if (neighborEdges.length === 0) notes.push("sem vizinhos avaliaveis na grade");
  if (verdict === "ISOLATED") notes.push("edge positivo isolado; alto risco de overfit");
  if (verdict === "MIXED") notes.push("ha algum suporte vizinho, mas insuficiente para robustez");
  if (verdict === "STABLE") notes.push(`suporte em pelo menos ${minPositiveNeighbors} vizinhos positivos`);
  return notes;
}

function verdictRank(verdict: Verdict): number {
  if (verdict === "STABLE") return 0;
  if (verdict === "MIXED") return 1;
  return 2;
}

function averageOptional(values: number[]): number | undefined {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined;
}

function candidatesCsv(rows: Candidate[]): string {
  const columns: Array<keyof Candidate> = [
    "verdict",
    "mode",
    "bucketType",
    "bucketKey",
    "samples",
    "edge",
    "winRate",
    "avgAsk",
    "neighborCount",
    "positiveNeighbors",
    "avgNeighborEdge",
    "minNeighborEdge",
    "robustnessScore",
    "avgSecondsRemaining",
    "avgDistanceBps",
    "avgDistanceSigma",
    "notes"
  ];
  return [columns.join(","), ...rows.map((row) => columns.map((column) => csvValue(row[column])).join(","))].join("\n");
}

function markdownReport(report: DistanceToBeatReport, candidates: Candidate[]): string {
  const top = candidates.slice(0, 25);
  return [
    "# Distance Bucket Stability",
    "",
    `Source report: ${report.generatedAt}`,
    `Observations: ${report.observations}`,
    `Markets: ${report.markets}`,
    "",
    "## Summary",
    "",
    `- Stable: ${candidates.filter((row) => row.verdict === "STABLE").length}`,
    `- Mixed: ${candidates.filter((row) => row.verdict === "MIXED").length}`,
    `- Isolated: ${candidates.filter((row) => row.verdict === "ISOLATED").length}`,
    "",
    "## Top Candidates",
    "",
    "| Verdict | Mode | Bucket | Samples | Edge | Win rate | Ask | Positive neighbors | Neighbor edge | Score |",
    "|---|---|---|---:|---:|---:|---:|---:|---:|---:|",
    ...top.map((row) =>
      `| ${row.verdict} | ${row.mode} | ${row.bucketType}:${row.bucketKey} | ${row.samples} | ${fmt(row.edge)} | ${pct(row.winRate)} | ${fmt(row.avgAsk)} | ${row.positiveNeighbors}/${row.neighborCount} | ${fmt(row.avgNeighborEdge)} | ${fmt(row.robustnessScore)} |`
    ),
    "",
    "## Notes",
    "",
    "- Use STABLE only as triage for deeper backtest; it is not a trade rule.",
    "- Data quality remains the quality of the source distance report.",
    "- Buckets with high score but MIXED/ISOLATED should be treated as overfit-prone until validated out of sample.",
    ""
  ].join("\n");
}

function printSummary(candidates: Candidate[]): void {
  console.table(candidates.slice(0, 12).map((row) => ({
    verdict: row.verdict,
    mode: row.mode,
    bucket: `${row.bucketType}:${row.bucketKey}`,
    samples: row.samples,
    edge: fmt(row.edge),
    winRate: pct(row.winRate),
    ask: fmt(row.avgAsk),
    neighbors: `${row.positiveNeighbors}/${row.neighborCount}`,
    neighborEdge: fmt(row.avgNeighborEdge),
    score: fmt(row.robustnessScore)
  })));
}

function csvValue(value: unknown): string {
  if (Array.isArray(value)) return csvValue(value.join("; "));
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll("\"", "\"\"")}"` : text;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function fmt(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? "" : value.toFixed(4);
}
