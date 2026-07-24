import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const RUNTIME = "knowledge-hybrid-search-v9";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const VOYAGE_API_KEY = Deno.env.get("VOYAGE_API_KEY") ?? "";
const VOYAGE_MODEL = "voyage-3.5";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const respond = (status: number, body: Record<string, unknown>) => new Response(
  JSON.stringify({ ...body, runtime: RUNTIME }),
  {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  },
);

const isUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const parseLimit = (value: unknown) => {
  const parsed = Number(value ?? 12);
  if (!Number.isFinite(parsed)) return 12;
  return Math.min(30, Math.max(1, Math.trunc(parsed)));
};

const generateQueryEmbedding = async (query: string): Promise<{
  embedding: number[] | null;
  fallbackReason: string | null;
}> => {
  if (!VOYAGE_API_KEY) {
    return { embedding: null, fallbackReason: "voyage_api_key_unavailable" };
  }

  try {
    const response = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        authorization: `Bearer ${VOYAGE_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        input: query,
        model: VOYAGE_MODEL,
        input_type: "query",
        output_dimension: 1024,
        truncation: true,
      }),
    });

    if (!response.ok) {
      console.warn(`[${RUNTIME}] voyage_http_${response.status}`);
      return { embedding: null, fallbackReason: `voyage_http_${response.status}` };
    }

    const payload = await response.json() as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = payload.data?.[0]?.embedding;
    if (!Array.isArray(embedding) || embedding.length !== 1024 || embedding.some((item) => !Number.isFinite(item))) {
      console.warn(`[${RUNTIME}] invalid_voyage_embedding`);
      return { embedding: null, fallbackReason: "invalid_voyage_embedding" };
    }

    return { embedding, fallbackReason: null };
  } catch (error) {
    console.warn(`[${RUNTIME}] voyage_unavailable`, error instanceof Error ? error.message : String(error));
    return { embedding: null, fallbackReason: "voyage_unavailable" };
  }
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond(405, { status: "error", error: "method_not_allowed" });

  const authorization = req.headers.get("authorization")?.trim() ?? "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return respond(401, { status: "error", error: "authentication_required" });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return respond(500, { status: "error", error: "supabase_runtime_not_configured" });
  }

  try {
    const body = await req.json() as {
      query?: unknown;
      companyId?: unknown;
      limit?: unknown;
    };
    const query = String(body.query ?? "").trim();
    const companyId = body.companyId ? String(body.companyId).trim() : null;
    const limit = parseLimit(body.limit);

    if (query.length < 2 || query.length > 500) {
      return respond(400, { status: "error", error: "query_length_invalid" });
    }
    if (companyId && !isUuid(companyId)) {
      return respond(400, { status: "error", error: "company_id_invalid" });
    }

    const semantic = await generateQueryEmbedding(query);
    const rpcResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/knowledge_hybrid_search`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        authorization,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        p_query_text: query,
        p_query_embedding: semantic.embedding ? `[${semantic.embedding.join(",")}]` : null,
        p_company_id: companyId,
        p_match_count: limit,
        p_rrf_k: 60,
      }),
    });

    const raw = await rpcResponse.text();
    const payload = raw ? JSON.parse(raw) as Record<string, unknown> : {};
    if (!rpcResponse.ok) {
      console.error(`[${RUNTIME}] rpc_http_${rpcResponse.status}`, payload);
      return respond(rpcResponse.status, {
        status: "error",
        error: String(payload.message ?? payload.details ?? "knowledge_hybrid_search_failed"),
      });
    }

    return respond(200, {
      status: "real",
      ...payload,
      semantic: {
        available: Boolean(semantic.embedding),
        model: semantic.embedding ? VOYAGE_MODEL : null,
        dimensions: semantic.embedding?.length ?? null,
        fallbackReason: semantic.fallbackReason,
        syntheticEmbedding: false,
      },
    });
  } catch (error) {
    console.error(`[${RUNTIME}] request_failed`, error);
    return respond(500, {
      status: "error",
      error: error instanceof Error ? error.message : "unexpected_error",
    });
  }
});
