import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { seedDatabase } from "../data/seed";
import {
  Company,
  CompanyDetail,
  CompanyFilters,
  CreateCompanyInput,
  CreateWatchlistInput,
  MonitoringSignal,
  RefreshCompanyInput,
  Score,
  SrmDatabase,
  WatchlistDetail
} from "../types";

function cloneDatabase(database: SrmDatabase): SrmDatabase {
  return JSON.parse(JSON.stringify(database)) as SrmDatabase;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function makeId(prefix: string, value: string): string {
  return `${prefix}-${normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")}`;
}

export class JsonFileSrmRepository {
  private database: SrmDatabase;

  constructor(private readonly filePath: string) {
    this.database = this.load();
  }

  listCompanies(filters: CompanyFilters = {}): CompanyDetail[] {
    const normalizedQuery = filters.q ? normalizeText(filters.q) : undefined;

    return this.database.companies
      .filter((company) => {
        if (filters.sector && company.sector !== filters.sector) {
          return false;
        }

        if (filters.stage && company.stage !== filters.stage) {
          return false;
        }

        if (
          filters.thesisTag &&
          !company.thesisTags.some((tag) => tag === filters.thesisTag)
        ) {
          return false;
        }

        if (normalizedQuery) {
          const haystack = [
            company.legalName,
            company.tradingName,
            company.sector,
            company.subsector,
            company.headquarters,
            company.dcmThesis,
            ...company.thesisTags
          ]
            .join(" ")
            .toLowerCase();

          if (!haystack.includes(normalizedQuery)) {
            return false;
          }
        }

        if (typeof filters.minScore === "number") {
          const fitScore = this.getScores(company.id).find(
            (score) => score.type === "fit_dcm"
          );

          if (!fitScore || fitScore.value < filters.minScore) {
            return false;
          }
        }

        return true;
      })
      .map((company) => this.getCompanyDetail(company.id))
      .sort((left, right) => this.getFitScore(right.id) - this.getFitScore(left.id));
  }

  getCompanyDetail(companyId: string): CompanyDetail {
    const company = this.database.companies.find((item) => item.id === companyId);

    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }

    return {
      ...company,
      scores: this.getScores(companyId),
      signals: this.getSignals(companyId)
    };
  }

  getSignals(companyId: string): MonitoringSignal[] {
    return this.database.signals
      .filter((signal) => signal.companyId === companyId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getScores(companyId: string): Score[] {
    return this.database.scores[companyId] ?? [];
  }

  listWatchlists(): WatchlistDetail[] {
    return this.database.watchlists.map((watchlist) => ({
      ...watchlist,
      companies: watchlist.companyIds
        .map((companyId) => this.database.companies.find((company) => company.id === companyId))
        .filter((company): company is Company => Boolean(company))
    }));
  }

  createCompany(input: CreateCompanyInput): CompanyDetail {
    const cnpjAlreadyExists = this.database.companies.some(
      (company) => company.cnpj === input.cnpj
    );

    if (cnpjAlreadyExists) {
      throw new Error(`Company already exists for CNPJ: ${input.cnpj}`);
    }

    const company: Company = {
      ...input,
      id: makeId("cmp", input.tradingName),
      lastRefreshedAt: new Date().toISOString()
    };

    this.database.companies.push(company);
    this.database.scores[company.id] = [
      {
        type: "fit_dcm",
        value: 50,
        rationale: "Empresa recém-cadastrada, aguardando classificação analítica.",
        confidence: 0.35,
        updatedAt: company.lastRefreshedAt
      },
      {
        type: "momentum",
        value: 50,
        rationale: "Empresa recém-cadastrada, sem sinais monitorados suficientes.",
        confidence: 0.35,
        updatedAt: company.lastRefreshedAt
      },
      {
        type: "readiness",
        value: 50,
        rationale: "Empresa recém-cadastrada, sem assessment completo de governança.",
        confidence: 0.35,
        updatedAt: company.lastRefreshedAt
      },
      {
        type: "relationship",
        value: 50,
        rationale: "Empresa recém-cadastrada, relacionamento inicial sem histórico.",
        confidence: 0.35,
        updatedAt: company.lastRefreshedAt
      }
    ];

    this.database.signals.unshift({
      id: makeId("sig", `${company.id}-created`),
      companyId: company.id,
      type: "news",
      title: "Empresa cadastrada manualmente",
      description: "Novo target adicionado à base SRM para avaliação inicial.",
      severity: "low",
      createdAt: company.lastRefreshedAt,
      evidence: [
        {
          summary: "Cadastro criado via API do MVP.",
          sourceName: "SRM API",
          sourceType: "internal",
          collectedAt: company.lastRefreshedAt
        }
      ]
    });

    this.persist();
    return this.getCompanyDetail(company.id);
  }

  createWatchlist(input: CreateWatchlistInput): WatchlistDetail {
    const uniqueCompanyIds = [...new Set(input.companyIds)];
    const invalidCompanyIds = uniqueCompanyIds.filter(
      (companyId) => !this.database.companies.some((company) => company.id === companyId)
    );

    if (invalidCompanyIds.length > 0) {
      throw new Error(`Unknown company ids: ${invalidCompanyIds.join(", ")}`);
    }

    const watchlist = {
      id: makeId("wl", `${input.owner}-${input.name}`),
      ...input,
      companyIds: uniqueCompanyIds,
      createdAt: new Date().toISOString()
    };

    this.database.watchlists.push(watchlist);
    this.persist();

    return this.listWatchlists().find((item) => item.id === watchlist.id) as WatchlistDetail;
  }

  refreshCompany(companyId: string, input: RefreshCompanyInput = {}): CompanyDetail {
    const company = this.database.companies.find((item) => item.id === companyId);

    if (!company) {
      throw new Error(`Company not found: ${companyId}`);
    }

    const refreshedAt = new Date().toISOString();
    company.lastRefreshedAt = refreshedAt;

    this.database.signals.unshift({
      id: makeId("sig", `${companyId}-${refreshedAt}`),
      companyId,
      type: "news",
      title: "Refresh manual executado",
      description:
        input.summary ??
        "Empresa revisada manualmente para atualizar freshness e histórico de monitoramento.",
      severity: "low",
      createdAt: refreshedAt,
      evidence: [
        {
          summary: "Refresh disparado manualmente via API.",
          sourceName: "SRM API",
          sourceType: "internal",
          collectedAt: refreshedAt
        }
      ]
    });

    this.database.scores[companyId] = this.getScores(companyId).map((score) => ({
      ...score,
      updatedAt: refreshedAt
    }));

    this.persist();
    return this.getCompanyDetail(companyId);
  }

  reset(): void {
    this.database = cloneDatabase(seedDatabase);
    this.persist();
  }

  private getFitScore(companyId: string): number {
    return (
      this.getScores(companyId).find((score) => score.type === "fit_dcm")?.value ?? 0
    );
  }

  private load(): SrmDatabase {
    if (!existsSync(this.filePath)) {
      this.ensureDirectory();
      const initialState = cloneDatabase(seedDatabase);
      writeFileSync(this.filePath, JSON.stringify(initialState, null, 2), "utf8");
      return initialState;
    }

    const fileContents = readFileSync(this.filePath, "utf8");
    return JSON.parse(fileContents) as SrmDatabase;
  }

  private persist(): void {
    this.ensureDirectory();
    writeFileSync(this.filePath, JSON.stringify(this.database, null, 2), "utf8");
  }

  private ensureDirectory(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
  }
}
