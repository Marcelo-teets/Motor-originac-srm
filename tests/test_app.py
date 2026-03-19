def create_company(client, nome: str = "Empresa XPTO", cnpj: str | None = "12.345.678/0001-90"):
    return client.post("/companies", json={"nome": nome, "cnpj": cnpj})


def first_source_id(client):
    response = client.get("/sources")
    assert response.status_code == 200
    return response.json()[0]["id"]


def test_healthcheck(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_company(client):
    response = create_company(client)
    assert response.status_code == 200
    body = response.json()
    assert body["nome"] == "Empresa XPTO"
    assert body["normalized_nome"] == "empresa xpto"
    assert body["normalized_cnpj"] == "12345678000190"


def test_deduplicate_company_by_cnpj(client):
    first = create_company(client, nome="Empresa A", cnpj="12.345.678/0001-90")
    second = create_company(client, nome="Empresa B", cnpj="12345678000190")
    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["id"] == second.json()["id"]
    listing = client.get("/companies")
    assert len(listing.json()) == 1


def test_deduplicate_company_by_normalized_name(client):
    first = create_company(client, nome="Árvore S.A.", cnpj=None)
    second = create_company(client, nome="arvore sa", cnpj=None)
    assert first.json()["id"] == second.json()["id"]
    listing = client.get("/companies")
    assert len(listing.json()) == 1


def test_list_seeded_sources(client):
    response = client.get("/sources")
    assert response.status_code == 200
    payload = response.json()
    assert len(payload) >= 6
    assert {item["categoria"] for item in payload} >= {"cadastro", "regulatoria", "noticias"}


def test_create_valid_signal_and_recalculate_score(client):
    company = create_company(client).json()
    source_id = first_source_id(client)
    response = client.post(
        "/signals",
        json={
            "company_id": company["id"],
            "source_id": source_id,
            "tipo": "positivo",
            "titulo": "Receita sem restrições relevantes",
            "descricao": "Cadastro íntegro e sem pendências.",
            "intensidade": 4,
        },
    )
    assert response.status_code == 201
    score = client.get(f"/scores/{company['id']}")
    assert score.status_code == 200
    assert score.json()["current_score"] > 50


def test_reject_signal_with_unknown_company(client):
    source_id = first_source_id(client)
    response = client.post(
        "/signals",
        json={
            "company_id": "cmp_missing",
            "source_id": source_id,
            "tipo": "positivo",
            "titulo": "Cadastro íntegro",
            "intensidade": 3,
        },
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Empresa não encontrada."


def test_reject_signal_with_unknown_source(client):
    company = create_company(client).json()
    response = client.post(
        "/signals",
        json={
            "company_id": company["id"],
            "source_id": "src_missing",
            "tipo": "positivo",
            "titulo": "Cadastro íntegro",
            "intensidade": 3,
        },
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Fonte não encontrada."


def test_score_history_tracks_multiple_recalculations(client):
    company = create_company(client).json()
    source_id = first_source_id(client)

    client.post(
        "/signals",
        json={
            "company_id": company["id"],
            "source_id": source_id,
            "tipo": "positivo",
            "titulo": "Receita operacional cresce",
            "intensidade": 5,
        },
    )
    client.post(
        "/signals",
        json={
            "company_id": company["id"],
            "source_id": source_id,
            "tipo": "risco",
            "titulo": "Ação judicial relevante",
            "intensidade": 2,
        },
    )

    history = client.get(f"/scores/{company['id']}/history")
    assert history.status_code == 200
    payload = history.json()
    assert len(payload) == 2
    assert payload[-1]["score"] != payload[0]["score"]


def test_generate_thesis(client):
    company = create_company(client, nome="Companhia Sol", cnpj=None).json()
    source_id = first_source_id(client)
    client.post(
        "/signals",
        json={
            "company_id": company["id"],
            "source_id": source_id,
            "tipo": "crescimento",
            "titulo": "Expansão comercial",
            "descricao": "Abertura de novas frentes.",
            "intensidade": 4,
        },
    )
    response = client.get(f"/thesis/{company['id']}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["company_id"] == company["id"]
    assert payload["resumo"]
    assert payload["drivers"]
    assert payload["riscos"]


def test_integrated_flow_company_signal_score_and_thesis(client):
    company = create_company(client, nome="Núcleo Financeiro", cnpj="45.987.111/0001-10").json()
    sources = client.get("/sources").json()

    client.post(
        "/signals",
        json={
            "company_id": company["id"],
            "source_id": sources[0]["id"],
            "tipo": "positivo",
            "titulo": "Cadastro atualizado",
            "descricao": "Sem apontamentos relevantes.",
            "intensidade": 3,
        },
    )
    client.post(
        "/signals",
        json={
            "company_id": company["id"],
            "source_id": sources[1]["id"],
            "tipo": "alerta",
            "titulo": "Mudança regulatória setorial",
            "descricao": "Exige adaptação de compliance.",
            "intensidade": 2,
        },
    )

    score = client.get(f"/scores/{company['id']}")
    thesis = client.get(f"/thesis/{company['id']}")
    market_map = client.get(f"/market-map/{company['id']}")
    company_signals = client.get(f"/companies/{company['id']}/signals")

    assert score.status_code == 200
    assert thesis.status_code == 200
    assert market_map.status_code == 200
    assert company_signals.status_code == 200
    assert len(company_signals.json()) == 2
    assert score.json()["snapshot_count"] == 2
    assert "score" in market_map.json()["score_resumo"].lower()
