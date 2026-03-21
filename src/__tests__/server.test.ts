import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import test from "node:test";

import { JsonFileSrmRepository } from "../repositories/JsonFileSrmRepository";
import { createAppHandler } from "../app";

async function createTestServer() {
  const directory = mkdtempSync("./tmp-srm-server-");
  const repository = new JsonFileSrmRepository(join(directory, "srm-db.json"));
  const server = createServer(createAppHandler(repository));

  await new Promise<void>((resolve) => {
    server.listen(0, () => resolve());
  });

  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Could not resolve test server address");
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
      rmSync(directory, { recursive: true, force: true });
    }
  };
}

test("server creates company and allows lookup", async () => {
  const app = await createTestServer();

  try {
    const createResponse = await fetch(`${app.baseUrl}/companies`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        legalName: "Radar API S.A.",
        tradingName: "RadarAPI",
        cnpj: "56.789.012/0001-56",
        sector: "Developer Tools",
        subsector: "APIs",
        headquarters: "Florianópolis, SC",
        stage: "growth",
        website: "https://radarapi.example.com",
        thesisTags: ["apis", "developer-tools"],
        dcmThesis: "Expansão de base enterprise com potencial de funding para crescimento.",
        fundingNeedIndicators: ["expansão internacional"],
        governanceHighlights: ["board mensal"]
      })
    });

    assert.equal(createResponse.status, 201);
    const createdPayload = (await createResponse.json()) as {
      data: { id: string; tradingName: string };
    };

    assert.equal(createdPayload.data.id, "cmp-radarapi");

    const lookupResponse = await fetch(`${app.baseUrl}/companies?q=radarapi`);
    const lookupPayload = (await lookupResponse.json()) as {
      data: Array<{ id: string }>;
      meta: { total: number };
    };

    assert.equal(lookupResponse.status, 200);
    assert.equal(lookupPayload.meta.total, 1);
    assert.equal(lookupPayload.data[0]?.id, "cmp-radarapi");
  } finally {
    await app.close();
  }
});

test("server creates watchlist and refreshes company", async () => {
  const app = await createTestServer();

  try {
    const watchlistResponse = await fetch(`${app.baseUrl}/watchlists`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Fintech priorizadas",
        owner: "banker-dcm",
        companyIds: ["cmp-neofin", "cmp-neofin", "cmp-greenbyte"]
      })
    });

    assert.equal(watchlistResponse.status, 201);
    const watchlistPayload = (await watchlistResponse.json()) as {
      data: { companyIds: string[] };
    };
    assert.deepEqual(watchlistPayload.data.companyIds, ["cmp-neofin", "cmp-greenbyte"]);

    const refreshResponse = await fetch(`${app.baseUrl}/companies/cmp-neofin/refresh`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        summary: "Atualização manual após reunião com CFO."
      })
    });

    assert.equal(refreshResponse.status, 200);
    const refreshPayload = (await refreshResponse.json()) as {
      data: { signals: Array<{ title: string; description: string }> };
    };

    assert.equal(refreshPayload.data.signals[0]?.title, "Refresh manual executado");
    assert.match(refreshPayload.data.signals[0]?.description ?? "", /CFO/);
  } finally {
    await app.close();
  }
});
