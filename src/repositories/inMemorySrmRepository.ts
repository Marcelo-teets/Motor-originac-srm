import { companies, scores, signals, watchlists } from "../data/seed";
import {
  Company,
  CompanyDetail,
  CompanyFilters,
  MonitoringSignal,
  Score,
  Watchlist
} from "../types";

export class InMemorySrmRepository {
  private readonly companies = companies;
  private readonly scores = scores;
  private readonly signals = signals;
  private readonly watchlists = watchlists;

  listCompanies(filters: CompanyFilters = {}): CompanyDetail[] {
    return this.companies
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
      .sort((left, right) => {
        const leftScore = this.getScores(left.id).find(
          (score) => score.type === "fit_dcm"
        )?.value ?? 0;
        const rightScore = this.getScores(right.id).find(
          (score) => score.type === "fit_dcm"
        )?.value ?? 0;

        return rightScore - leftScore;
      });
  }

  getCompanyDetail(companyId: string): CompanyDetail {
    const company = this.companies.find((item) => item.id === companyId);

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
    return this.signals
      .filter((signal) => signal.companyId === companyId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getScores(companyId: string): Score[] {
    return this.scores[companyId] ?? [];
  }

  listWatchlists(): Array<Watchlist & { companies: Company[] }> {
    return this.watchlists.map((watchlist) => ({
      ...watchlist,
      companies: watchlist.companyIds
        .map((companyId) => this.companies.find((company) => company.id === companyId))
        .filter((company): company is Company => Boolean(company))
    }));
  }
}
