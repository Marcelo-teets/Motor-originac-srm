import { IncomingMessage, ServerResponse } from "node:http";

import { getUrl, readJsonBody, sendJson } from "./lib/http";
import { JsonFileSrmRepository } from "./repositories/JsonFileSrmRepository";
import {
  CompanyFilters,
  CreateCompanyInput,
  CreateWatchlistInput,
  RefreshCompanyInput
} from "./types";

export function createRepository(): JsonFileSrmRepository {
  return new JsonFileSrmRepository(process.env.SRM_DATA_FILE ?? "var/srm-db.json");
}

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

async function handleCompaniesRoute(
  request: IncomingMessage,
  response: ServerResponse,
  repository: JsonFileSrmRepository,
  pathname: string,
  searchParams: URLSearchParams
): Promise<void> {
  if (request.method === "GET" && pathname === "/companies") {
    const filters: CompanyFilters = {
      q: searchParams.get("q") ?? undefined,
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

  if (request.method === "POST" && pathname === "/companies") {
    const input = await readJsonBody<CreateCompanyInput>(request);
    const company = repository.createCompany(input);

    return sendJson(response, 201, {
      data: company
    });
  }

  if (request.method === "GET" && pathname.startsWith("/companies/")) {
    const companyId = getCompanyIdFromPath(pathname);

    if (!companyId) {
      return sendJson(response, 400, {
        error: "invalid_company_id"
      });
    }

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
  }

  if (request.method === "POST" && pathname.endsWith("/refresh")) {
    const companyId = getCompanyIdFromPath(pathname);

    if (!companyId) {
      return sendJson(response, 400, {
        error: "invalid_company_id"
      });
    }

    const input = await readJsonBody<RefreshCompanyInput>(request).catch(() => ({}));

    return sendJson(response, 200, {
      data: repository.refreshCompany(companyId, input)
    });
  }

  return sendJson(response, 404, {
    error: "not_found"
  });
}

async function handleWatchlistsRoute(
  request: IncomingMessage,
  response: ServerResponse,
  repository: JsonFileSrmRepository,
  pathname: string
): Promise<void> {
  if (request.method === "GET" && pathname === "/watchlists") {
    return sendJson(response, 200, {
      data: repository.listWatchlists()
    });
  }

  if (request.method === "POST" && pathname === "/watchlists") {
    const input = await readJsonBody<CreateWatchlistInput>(request);

    return sendJson(response, 201, {
      data: repository.createWatchlist(input)
    });
  }

  return sendJson(response, 404, {
    error: "not_found"
  });
}

export function createAppHandler(repository: JsonFileSrmRepository) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const url = getUrl(request);
    const { pathname, searchParams } = url;

    try {
      if (request.method === "GET" && pathname === "/health") {
        return sendJson(response, 200, {
          status: "ok",
          service: "motor-originac-srm",
          timestamp: new Date().toISOString()
        });
      }

      if (pathname === "/companies" || pathname.startsWith("/companies/")) {
        return await handleCompaniesRoute(
          request,
          response,
          repository,
          pathname,
          searchParams
        );
      }

      if (pathname === "/watchlists") {
        return await handleWatchlistsRoute(request, response, repository, pathname);
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
          "POST /companies",
          "POST /companies/:id/refresh",
          "GET /watchlists",
          "POST /watchlists"
        ]
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown_error";
      const statusCode =
        message.startsWith("Company not found") || message.startsWith("Unknown company ids")
          ? 404
          : message.startsWith("Company already exists") || message === "empty_body"
            ? 400
            : 500;

      return sendJson(response, statusCode, {
        error: message
      });
    }
  };
}
