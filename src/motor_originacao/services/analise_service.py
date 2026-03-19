from motor_originacao.models.proposta import Proposta


def analisar_proposta(proposta: Proposta) -> dict[str, str]:
    return {
        "status": "em_analise",
        "mensagem": f"Proposta de {proposta.nome_cliente} recebida e pronta para regras futuras.",
    }
