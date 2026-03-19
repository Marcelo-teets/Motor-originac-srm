from motor_originacao.models.proposta import Proposta


def analisar_proposta(proposta: Proposta) -> dict[str, str]:
    if proposta.valor <= 0:
        return {
            "status": "rejeitada",
            "mensagem": "O valor da proposta deve ser maior que zero.",
        }

    return {
        "status": "em_analise",
        "mensagem": "Proposta recebida e pronta para regras futuras.",
    }
