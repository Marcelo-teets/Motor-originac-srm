export type FidcProviderRole =
  | 'administrator'
  | 'manager'
  | 'custodian'
  | 'asset_controller'
  | 'liability_controller'
  | 'auditor'
  | 'other';

export type NormalizedFidcProvider = {
  providerName: string;
  providerCnpj?: string;
  role: FidcProviderRole;
  isPrincipal?: boolean;
  sourceId: string;
};

export type NormalizedFidcClass = {
  codigoAnbima?: string;
  isin?: string;
  className?: string;
  className2?: string;
  tipoClasseCota?: string;
  situacaoAtual?: string;
  dataPrimeiroAporte?: string;
  dataInicio?: string;
  dataInicioDivulgacaoCota?: string;
  dataEncerramento?: string;
  restrito?: boolean;
  investidorQualificado?: boolean;
  fundoAdaptadoIcvm175?: boolean;
  dataFundoAdaptadoIcvm175?: string;
  responsabilidadeLtda?: boolean;
  sourceId: string;
};

export type NormalizedFidcFund = {
  cnpjFundo?: string;
  nomeFundo: string;
  razaoSocial?: string;
  sourceId: string;
  sourceRecordId?: string;
  referenceDate?: string;
  status?: string;
  fundType?: string;
  classes: NormalizedFidcClass[];
  providers: NormalizedFidcProvider[];
  rawPayload: Record<string, unknown>;
};

export type FidcProviderExposure = {
  providerCnpj: string;
  contractsCount: number;
  paymentsCount: number;
  sourceId: string;
  lastCheckedAt: string;
};
