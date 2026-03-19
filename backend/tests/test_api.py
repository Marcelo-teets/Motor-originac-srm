from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_healthcheck() -> None:
    response = client.get('/api/v1/health')
    assert response.status_code == 200
    assert response.json()['status'] == 'ok'


def test_sources_list() -> None:
    response = client.get('/api/v1/sources')
    assert response.status_code == 200
    assert response.json()['total'] >= 5


def test_company_creation_and_duplicate_by_cnpj() -> None:
    first = client.post('/api/v1/companies', json={
        'name': 'Alpha Logistica', 'cnpj': '12.345.678/0001-90', 'sector': 'logistics', 'stage': 'lead'
    })
    duplicate = client.post('/api/v1/companies', json={
        'name': 'Alpha Logistica 2', 'cnpj': '12345678000190', 'sector': 'logistics', 'stage': 'lead'
    })
    assert first.status_code == 201
    assert duplicate.status_code == 409


def test_company_creation_and_duplicate_by_normalized_name() -> None:
    first = client.post('/api/v1/companies', json={
        'name': 'Beta Foods', 'sector': 'food', 'stage': 'prospect'
    })
    duplicate = client.post('/api/v1/companies', json={
        'name': '  beta   foods  ', 'sector': 'food', 'stage': 'prospect'
    })
    assert first.status_code == 201
    assert duplicate.status_code == 409


def test_signal_validation_and_end_to_end_flow() -> None:
    company = client.post('/api/v1/companies', json={
        'name': 'Gamma Energia', 'cnpj': '11222333000181', 'sector': 'energy', 'stage': 'qualified'
    }).json()

    invalid = client.post('/api/v1/signals', json={
        'company_id': company['id'], 'source_id': 'invalid', 'signal_type': 'expansion', 'strength': 80, 'summary': 'Nova expansão regional'
    })
    assert invalid.status_code == 404

    valid = client.post('/api/v1/signals', json={
        'company_id': company['id'], 'source_id': 'cvm', 'signal_type': 'expansion', 'strength': 80, 'summary': 'Nova expansão regional confirmada'
    })
    assert valid.status_code == 201

    score = client.get(f"/api/v1/companies/{company['id']}/score")
    history = client.get(f"/api/v1/companies/{company['id']}/score/history")
    thesis = client.get(f"/api/v1/companies/{company['id']}/thesis")
    signals = client.get(f"/api/v1/signals?company_id={company['id']}")
    market_map = client.get('/api/v1/market-map')

    assert score.status_code == 200
    assert score.json()['score'] >= 30
    assert history.status_code == 200
    assert history.json()['total'] >= 2
    assert thesis.status_code == 200
    assert thesis.json()['company_id'] == company['id']
    assert signals.status_code == 200
    assert signals.json()['total'] == 1
    assert market_map.status_code == 200
    assert any(item['sector'] == 'energy' for item in market_map.json()['items'])
