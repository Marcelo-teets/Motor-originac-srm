import { createServer } from "node:http";

import { sendJson, getUrl } from "./lib/http";
import { InMemorySrmRepository } from "./repositories/inMemorySrmRepository";
import { CompanyFilters } from "./types";

const repository = new InMemorySrmRepository();

function parseNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsedValue = Number(value);
  return Number.isNaN(parsedValue) ? undefined : parsedValue;
}

function getCompanyIdFromPath(pathname: string): string | undefined {
  const match = pathname.match(/^\/companies\/([^/]+)(?:\/.*)?$/);
  return match?.[1];
}

const server = createServer((request, response) => {
  const url = getUrl(request);
  const { pathname, searchParams } = url;

  if (request.method === "GET" && pathname === "/health") {
    return sendJson(response, 200, {
      status: "ok",
      service: "motor-originac-srm",
      timestamp: new Date().toISOString()
    });
  }

  if (request.method === "GET" && pathname === "/companies") {
    const filters: CompanyFilters = {
      sector: searchParams.get("sector") ?? undefined,
      stage: (searchParams.get("stage") as CompanyFilters["stage"]) ?? undefined,
      thesisTag: searchParams.get("thesisTag") ?? undefined,
      minScore: parseNumber(searchParams.get("minScore"))
    };

    const companies = repository.listCompanies(filters);

    return sendJson(response, 200, {
      data: companies,
      meta: {
        filters,
        total: companies.length
      }
    });
  }

  if (request.method === "GET" && pathname === "/watchlists") {
    return sendJson(response, 200, {
      data: repository.listWatchlists()
    });
  }

  if (request.method === "GET" && pathname.startsWith("/companies/")) {
    const companyId = getCompanyIdFromPath(pathname);

    if (!companyId) {
      return sendJson(response, 400, {
        error: "invalid_company_id"
      });
    }

    try {
      if (pathname.endsWith("/signals") || pathname.endsWith("/timeline")) {
        return sendJson(response, 200, {
          data: repository.getSignals(companyId)
        });
      }

      if (pathname.endsWith("/scores")) {
        return sendJson(response, 200, {
          data: repository.getScores(companyId)
        });
      }

      return sendJson(response, 200, {
        data: repository.getCompanyDetail(companyId)
      });
    } catch (error) {
      return sendJson(response, 404, {
        error: error instanceof Error ? error.message : "unknown_error"
      });
    }
  }

  return sendJson(response, 404, {
    error: "not_found",
    availableRoutes: [
      "GET /health",
      "GET /companies",
      "GET /companies/:id",
      "GET /companies/:id/signals",
      "GET /companies/:id/timeline",
      "GET /companies/:id/scores",
      "GET /watchlists"
    ]
  });
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => {
  console.log(`Motor Originação SRM API running at http://localhost:${port}`);
});
