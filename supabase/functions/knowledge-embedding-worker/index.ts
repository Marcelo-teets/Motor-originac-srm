import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RUNTIME = "knowledge-embedding-worker-v10-disabled";

Deno.serve(() => new Response(
  JSON.stringify({
    status: "disabled",
    error: "worker_moved_to_vercel",
    reason: "VOYAGE_API_KEY remains Vercel-only by project policy.",
    runtime: RUNTIME,
    syntheticEmbedding: false,
  }),
  {
    status: 410,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  },
));
