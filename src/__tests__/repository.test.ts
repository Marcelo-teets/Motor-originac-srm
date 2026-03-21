import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { JsonFileSrmRepository } from "../repositories/JsonFileSrmRepository";

function createTestRepository(): {
  filePath: string;
  repository: JsonFileSrmRepository;
  cleanup: () => void;
} {
  const directory = mkdtempSync("./tmp-srm-repository-");
  const filePath = join(directory, "srm-db.json");
  const repository = new JsonFileSrmRepository(filePath);

  return {
    filePath,
    repository,
    cleanup: () => rmSync(directory, { recursive: true, force: true })
  };
}

test("repository filters companies by query and minimum score", () => {
  const { repository, cleanup } = createTestRepository();

  try {
    const companies = repository.listCompanies({ q: "capex", minScore: 80 });

    assert.equal(companies.length, 1);
    assert.equal(companies[0]?.id, "cmp-greenbyte");
  } finally {
    cleanup();
  }
});

test("repository creates company and persists default scores", () => {
  const { filePath, repository, cleanup } = createTestRepository();

  try {
    const created = repository.createCompany({
      legalName: "Nova Infra Dados S.A.",
      tradingName: "NovaData",
      cnpj: "45.678.901/0001-45",
      sector: "Data Infrastructure",
      subsector: "Observability",
      headquarters: "São Paulo, SP",
      stage: "growth",
      website: "https://novadata.example.com",
      thesisTags: ["data", "observability"],
      dcmThesis: "Empresa com expansão de base enterprise e necessidade de financiar crescimento.",
      fundingNeedIndicators: ["expansão comercial"],
      governanceHighlights: ["closing mensal"]
    });

    const reloaded = new JsonFileSrmRepository(filePath);
    const persisted = reloaded.getCompanyDetail("cmp-novadata");

    assert.equal(created.id, "cmp-novadata");
    assert.equal(persisted.scores.length, 4);
    assert.equal(
      reloaded.getSignals(created.id)[0]?.title,
      "Empresa cadastrada manualmente"
    );
  } finally {
    cleanup();
  }
});

test("repository refresh updates company freshness and appends signal", () => {
  const { repository, cleanup } = createTestRepository();

  try {
    const before = repository.getCompanyDetail("cmp-neofin");
    const refreshed = repository.refreshCompany("cmp-neofin", {
      summary: "Revisão manual da empresa após contato com fundador."
    });

    assert.notEqual(refreshed.lastRefreshedAt, before.lastRefreshedAt);
    assert.equal(refreshed.signals[0]?.title, "Refresh manual executado");
    assert.match(refreshed.signals[0]?.description ?? "", /fundador/);
  } finally {
    cleanup();
  }
});
