// Motor Originação — Neon Free Plan conservative, fail-closed quota gate.
// No dependencies or secrets in source. Invoke "report" or "preflight".
// The Free Plan consumption-history API is NOT available; never infer CU-hours
// or egress from database size, uptime or GitHub Actions duration.
import { execFileSync } from "node:child_process";

export const LIMITS = Object.freeze({
  storageBytes: 500_000_000,
  cuHours: 100,
  branchCount: 10,
  publicEgressBytes: 5_000_000_000,
  computeCu: 2,
});
export const POLICY = Object.freeze({
  hardRatio: 0.96,
  stopRatio: 0.80,
  minFreeStorageBytes: 80_000_000,
  maxBranches: 9,             // floor(0.96 * 10) = 9
  recommendedMaxCu: 1,        // less than 96% of 2 CU
  maxSnapshotAgeHours: 2,
});
const isNumber = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const nowIso = () => new Date().toISOString();

function observation(value, limit, stop, name) {
  if (!isNumber(value)) return { metric: name, state: "unknown", value: null, limit, stop };
  return {
    metric: name,
    state: value >= limit * POLICY.hardRatio ? "at_or_above_96_percent" :
      value >= stop ? "write_stop" : "ok",
    value, limit, stop, percent: Math.round(10000 * value / limit) / 100,
  };
}

export function assessBudget(input, options = {}) {
  const maxAgeHours = options.maxAgeHours ?? POLICY.maxSnapshotAgeHours;
  const age = input.observedAt ? (Date.now() - Date.parse(input.observedAt)) / 3_600_000 : Infinity;
  const snapshotFresh = Number.isFinite(age) && age >= -0.1 && age <= maxAgeHours;
  // The SQL pg_database_size() result is only a lower bound for the project:
  // other DBs, branches, storage history and provider accounting are excluded.
  const storage = observation(
    snapshotFresh ? input.projectStorageBytes : null,
    LIMITS.storageBytes, 400_000_000, "project_storage_bytes",
  );
  const database = observation(
    input.databaseBytes, LIMITS.storageBytes, 350_000_000, "single_database_bytes",
  );
  const compute = observation(
    snapshotFresh ? input.cuHoursUsed : null,
    LIMITS.cuHours, 80, "monthly_cu_hours",
  );
  const egress = observation(
    snapshotFresh ? input.publicEgressBytes : null,
    LIMITS.publicEgressBytes, 4_000_000_000, "monthly_public_egress_bytes",
  );
  const branches = observation(input.branchCount, LIMITS.branchCount,
    POLICY.maxBranches, "branch_count");
  const maxCu = observation(input.maxCu, LIMITS.computeCu,
    POLICY.recommendedMaxCu + 0.00001, "endpoint_max_cu");
  // Warn and block if the actual configured max exceeds 1 CU, even though
  // the platform permits 2 CU. This reserve reduces CU-hour burn.
  const metrics = [storage, database, compute, egress, branches, maxCu];
  const blockers = metrics.filter(m => m.state !== "ok").map(m => m.metric + ":" + m.state);
  if (isNumber(input.databaseBytes) && input.databaseBytes > POLICY.minFreeStorageBytes
      && isNumber(input.projectStorageBytes) && snapshotFresh
      && input.projectStorageBytes - input.databaseBytes > POLICY.minFreeStorageBytes) {
    // Other branch/storage bytes are considerable; not a blocker by itself.
  }
  return {
    projectId: "steep-poetry-38942951",
    checkedAt: nowIso(),
    snapshotFresh,
    result: blockers.length ? "BLOCK_WRITES" : "ALLOW_BOUNDED_WRITES",
    blockers,
    metrics,
    guarantee: "Preflight only. Other clients, large transactions, billing lag and provider usage remain outside this gate.",
  };
}

async function neonGet(path, apiKey, signal) {
  const response = await fetch("https://console.neon.tech/api/v2" + path,
    { headers: { Authorization: "Bearer " + apiKey }, signal });
  if (!response.ok) throw Error("Neon API " + response.status + " on " + path);
  return response.json();
}

export async function collectBudget(env = process.env) {
  const result = { observedAt: null, projectStorageBytes: null, cuHoursUsed: null,
    publicEgressBytes: null, databaseBytes: null, branchCount: null, maxCu: null };
  const warnings = [];
  const snapshotRaw = env.NEON_FREE_USAGE_JSON;
  if (snapshotRaw) {
    try {
      const snapshot = JSON.parse(snapshotRaw);
      result.observedAt = snapshot.observedAt ?? null;
      for (const name of ["projectStorageBytes", "cuHoursUsed", "publicEgressBytes"]) {
        if (isNumber(snapshot[name])) result[name] = snapshot[name];
      }
    } catch {
      warnings.push("NEON_FREE_USAGE_JSON is not valid JSON");
    }
  } else {
    warnings.push("Monthly CU-hours/egress and project storage require a fresh verified dashboard snapshot on Free");
  }

  if (env.NEON_API_KEY) {
    try {
      const pid = "steep-poetry-38942951";
      const ctl = new AbortController();
      const timeout = setTimeout(() => ctl.abort(), 12000);
      try {
        const [project, branches, endpoints] = await Promise.all([
          neonGet("/projects/" + pid, env.NEON_API_KEY, ctl.signal),
          neonGet("/projects/" + pid + "/branches", env.NEON_API_KEY, ctl.signal),
          neonGet("/projects/" + pid + "/endpoints", env.NEON_API_KEY, ctl.signal),
        ]);
        if (project.project?.id !== pid) throw Error("Neon project ID mismatch");
        if (Array.isArray(branches.branches)) result.branchCount = branches.branches.length;
        if (Array.isArray(endpoints.endpoints)) {
          const production = branches.branches?.find(b => b.name === "production");
          const active = endpoints.endpoints.filter(e => e.branch_id === production?.id);
          if (active.length === 1 && isNumber(active[0].autoscaling_limit_max_cu)) {
            result.maxCu = active[0].autoscaling_limit_max_cu;
          } else {
            warnings.push("Production endpoint/max CU not unambiguously measurable");
          }
        }
      } finally { clearTimeout(timeout); }
    } catch (e) {
      warnings.push("Neon control-plane read failed: " + String(e.message ?? e));
    }
  } else warnings.push("NEON_API_KEY unavailable: branch count and max CU unverified");

  if (env.MOTOR_NEON_DATABASE_URL) {
    try {
      const output = execFileSync("psql", ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1",
        "-c", "SELECT pg_database_size(current_database())"],
        { encoding: "utf8", timeout: 15000,
          env: { ...env, PGDATABASE: env.MOTOR_NEON_DATABASE_URL, PGCONNECT_TIMEOUT: "8" } });
      const value = Number(output.trim());
      if (isNumber(value)) result.databaseBytes = value;
      else warnings.push("Database size returned invalid value");
    } catch {
      warnings.push("Read-only database size query unavailable");
    }
  } else warnings.push("MOTOR_NEON_DATABASE_URL unavailable: database size unverified");
  return { result, warnings };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll("\\", "/"))) {
  const mode = process.argv[2] ?? "report";
  if (!["report", "preflight"].includes(mode)) {
    process.stderr.write("Usage: node scripts/neon-free-budget.mjs report|preflight\n");
    process.exitCode = 64;
  } else {
    const collected = await collectBudget();
    const report = assessBudget(collected.result);
    process.stdout.write(JSON.stringify({ ...report, warnings: collected.warnings }, null, 2) + "\n");
    if (mode === "preflight" && report.result !== "ALLOW_BOUNDED_WRITES") process.exitCode = 2;
  }
}
