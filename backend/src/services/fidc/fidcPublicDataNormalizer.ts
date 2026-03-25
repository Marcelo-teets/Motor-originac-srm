import type { AnbimaStructuredFundListItem } from '../../lib/connectors/fidc/anbimaStructuredFundsConnector.js';
import type { NormalizedFidcFund } from './fidcPublicDataTypes.js';

export function normalizeAnbimaStructuredFund(item: AnbimaStructuredFundListItem): NormalizedFidcFund {
  return {
    cnpjFundo: item.cnpj_fundo,
    nomeFundo: item.razao_social ?? item.cnpj_fundo,
    razaoSocial: item.razao_social,
    sourceId: 'src_anbima_fundos_estruturados',
    status: item.classes_serie_cota?.[0]?.situacao_atual,
    fundType: item.classe_anbima,
    classes: (item.classes_serie_cota ?? []).map((classItem) => ({
      codigoAnbima: classItem.codigo_anbima,
      isin: classItem.isin,
      className: classItem.nome_fantasia,
      className2: classItem.nome_fantasia_2,
      tipoClasseCota: classItem.tipo_classe_cota,
      situacaoAtual: classItem.situacao_atual,
      dataPrimeiroAporte: classItem.data_primeiro_aporte,
      dataInicio: classItem.data_inicio,
      dataInicioDivulgacaoCota: classItem.data_inicio_divulgacao_cota,
      dataEncerramento: classItem.data_encerramento,
      restrito: classItem.restrito,
      investidorQualificado: classItem.investidor_qualificado,
      fundoAdaptadoIcvm175: classItem.fundo_adaptado_icvm_175,
      dataFundoAdaptadoIcvm175: classItem.data_fundo_adaptado_icvm_175,
      responsabilidadeLtda: classItem.responsabilidade_ltda,
      sourceId: 'src_anbima_fundos_estruturados',
    })),
    providers: [],
    rawPayload: item as unknown as Record<string, unknown>,
  };
}
