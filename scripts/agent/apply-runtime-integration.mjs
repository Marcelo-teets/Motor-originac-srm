import fs from 'node:fs';

const replaceOnce = (path, before, after) => {
  const current = fs.readFileSync(path, 'utf8');
  if (!current.includes(before)) throw new Error(`Anchor not found in ${path}`);
  fs.writeFileSync(path, current.replace(before, after));
};

replaceOnce(
  'backend/src/services/platformService.ts',
  "import { env } from '../lib/env.js';\nimport { isoNow } from '../lib/helpers.js';",
  "import { env } from '../lib/env.js';\nimport { getSupabaseClient } from '../lib/supabase.js';\nimport { isoNow } from '../lib/helpers.js';",
);

replaceOnce(
  'backend/src/services/platformService.ts',
  `    const rankingRows = companies\n      .map((company) => buildRankingRow({\n        companyId: company.id,\n        companyName: company.tradeName,\n        qualification: latestQualifications.get(company.id)!,\n        lead: latestLeads.get(company.id)!,\n        patterns: patternByCompany.get(company.id) ?? [],\n      }))\n      .sort((a, b) => b.rankingScore - a.rankingScore)\n      .map((row, index) => ({ ...row, position: index + 1 }));`,
  `    const computedRankingRows = companies\n      .map((company) => buildRankingRow({\n        companyId: company.id,\n        companyName: company.tradeName,\n        qualification: latestQualifications.get(company.id)!,\n        lead: latestLeads.get(company.id)!,\n        patterns: patternByCompany.get(company.id) ?? [],\n      }))\n      .sort((a, b) => b.rankingScore - a.rankingScore)\n      .map((row, index) => ({ ...row, position: index + 1 }));\n\n    let rankingRows = computedRankingRows;\n    if (env.useSupabase) {\n      const client = getSupabaseClient();\n      if (client) {\n        try {\n          const persistedRows = await client.select('ranking_v2', {\n            select: '*',\n            orderBy: { column: 'created_at', ascending: false },\n            limit: Math.max(companies.length * 3, 50),\n          });\n          const latestSnapshotAt = persistedRows?.[0]?.created_at;\n          const latestSnapshot = latestSnapshotAt\n            ? (persistedRows ?? []).filter((row: any) => row.created_at === latestSnapshotAt)\n            : [];\n          const fallbackByCompany = new Map(computedRankingRows.map((row) => [row.companyId, row]));\n          const mapped = latestSnapshot\n            .map((row: any) => {\n              const fallback = fallbackByCompany.get(row.company_id);\n              if (!fallback) return null;\n              return {\n                ...fallback,\n                position: Number(row.position),\n                qualificationScore: Number(row.qualification_score),\n                leadScore: Number(row.lead_score),\n                rankingScore: Number(row.ranking_score),\n                rationale: row.rationale ?? fallback.rationale,\n              } satisfies RankingRow;\n            })\n            .filter((row): row is RankingRow => Boolean(row))\n            .sort((a, b) => a.position - b.position);\n\n          if (mapped.length === companies.length) rankingRows = mapped;\n        } catch (error) {\n          console.warn('Ranking V2 persistence fallback:', error instanceof Error ? error.message : error);\n        }\n      }\n    }`,
);

replaceOnce(
  'backend/src/server.ts',
  `app.post('/search-profiles/candidates/:id/promote', wrap(async (req, res) => {\n  res.json(ok(platformMode, await searchCaptureService.promoteCandidate(param(req.params.id))));\n}));\napp.get('/companies',`,
  `app.post('/search-profiles/candidates/:id/promote', wrap(async (req, res) => {\n  res.json(ok(platformMode, await searchCaptureService.promoteCandidate(param(req.params.id))));\n}));\napp.get('/search-profile-runs', wrap(async (req, res) => {\n  const profileId = req.query?.searchProfileId ? String(req.query.searchProfileId) : undefined;\n  const rows = await searchCaptureRuntime.listRuns(profileId);\n  res.json(ok(platformMode, rows.map((row: any) => ({\n    id: row.id,\n    searchProfileId: row.searchProfileId ?? row.search_profile_id,\n    runStatus: row.runStatus ?? row.run_status,\n    triggerMode: row.triggerMode ?? row.trigger_mode,\n    sourceCount: Number(row.sourceCount ?? row.source_count ?? 0),\n    candidatesFound: Number(row.candidatesFound ?? row.candidates_found ?? 0),\n    candidatesInserted: Number(row.candidatesInserted ?? row.candidates_inserted ?? 0),\n    candidatesPromoted: Number(row.candidatesPromoted ?? row.candidates_promoted ?? 0),\n    startedAt: row.startedAt ?? row.started_at,\n    finishedAt: row.finishedAt ?? row.finished_at,\n    createdAt: row.createdAt ?? row.created_at,\n  }))));\n}));\napp.get('/discovered-candidates', wrap(async (req, res) => {\n  const profileId = req.query?.searchProfileId ? String(req.query.searchProfileId) : undefined;\n  const rows = await searchCaptureRuntime.listCandidates(profileId);\n  res.json(ok(platformMode, rows.map((row: any) => ({\n    id: row.id,\n    searchProfileId: row.searchProfileId ?? row.search_profile_id,\n    companyName: row.companyName ?? row.company_name,\n    website: row.website,\n    sourceRef: row.sourceRef ?? row.source_ref,\n    sourceUrl: row.sourceUrl ?? row.source_url,\n    evidenceSummary: row.evidenceSummary ?? row.evidence_summary,\n    confidence: Number(row.confidence ?? 0),\n    candidateStatus: row.candidateStatus ?? row.candidate_status,\n    companyId: row.companyId ?? row.company_id,\n    capturedAt: row.capturedAt ?? row.captured_at,\n  }))));\n}));\napp.post('/discovered-candidates/:id/promote', wrap(async (req, res) => {\n  res.json(ok(platformMode, await searchCaptureService.promoteCandidate(param(req.params.id))));\n}));\napp.get('/companies',`,
);

replaceOnce(
  'frontend/src/pages/CaptureInboxPage.tsx',
  `        fetch(buildApiUrl('/search-profile-runs'), { headers }),\n        fetch(buildApiUrl('/discovered-candidates'), { headers }),`,
  `        fetch(buildApiUrl('/search-profile-runs'), { headers, credentials: 'include' }),\n        fetch(buildApiUrl('/discovered-candidates'), { headers, credentials: 'include' }),`,
);

replaceOnce(
  'frontend/src/pages/CaptureInboxPage.tsx',
  `        method: 'POST',\n        headers,`,
  `        method: 'POST',\n        headers,\n        credentials: 'include',`,
);
