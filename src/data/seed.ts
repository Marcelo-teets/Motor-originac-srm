import { Company, MonitoringSignal, Score, Watchlist } from "../types";

export const companies: Company[] = [
  {
    id: "cmp-neofin",
    legalName: "Neofin Tecnologia Financeira S.A.",
    tradingName: "Neofin",
    cnpj: "12.345.678/0001-01",
    sector: "Fintech",
    subsector: "Infra de crédito",
    headquarters: "São Paulo, SP",
    stage: "late_stage",
    website: "https://neofin.example.com",
    thesisTags: ["embedded-finance", "credito-pj", "saas-b2b"],
    dcmThesis:
      "Empresa com base recorrente B2B, forte crescimento de carteira e potencial para funding estruturado.",
    fundingNeedIndicators: [
      "expansão da carteira de crédito",
      "captação para alongamento de passivo",
      "crescimento comercial acelerado"
    ],
    governanceHighlights: [
      "conselho consultivo ativo",
      "reporting mensal estruturado",
      "indicadores operacionais recorrentes"
    ],
    lastRefreshedAt: "2026-03-15T10:30:00.000Z"
  },
  {
    id: "cmp-logtek",
    legalName: "LogTek Sistemas de Logística Ltda.",
    tradingName: "LogTek",
    cnpj: "23.456.789/0001-12",
    sector: "Logística",
    subsector: "Supply chain SaaS",
    headquarters: "Curitiba, PR",
    stage: "growth",
    website: "https://logtek.example.com",
    thesisTags: ["logtech", "supply-chain", "recorrencia"],
    dcmThesis:
      "Negócio com receita recorrente e expansão nacional, ainda em fase de estruturação para instrumentos de dívida.",
    fundingNeedIndicators: [
      "expansão de produto",
      "abertura de novas filiais",
      "investimento em vendas enterprise"
    ],
    governanceHighlights: [
      "auditoria externa em implantação",
      "ERP financeiro consolidado"
    ],
    lastRefreshedAt: "2026-03-14T16:00:00.000Z"
  },
  {
    id: "cmp-greenbyte",
    legalName: "GreenByte Eficiência Energética S.A.",
    tradingName: "GreenByte",
    cnpj: "34.567.890/0001-23",
    sector: "Energy Tech",
    subsector: "Eficiência energética",
    headquarters: "Belo Horizonte, MG",
    stage: "middle_market",
    website: "https://greenbyte.example.com",
    thesisTags: ["energy-tech", "infra", "capex"],
    dcmThesis:
      "Operação com contratos corporativos e necessidade de capex financiável, aderente a teses de dívida para expansão.",
    fundingNeedIndicators: [
      "capex para novos projetos",
      "pipeline de contratos corporativos",
      "financiamento de equipamentos"
    ],
    governanceHighlights: [
      "estrutura societária simplificada",
      "comitê financeiro formalizado",
      "histórico de relacionamento com bancos"
    ],
    lastRefreshedAt: "2026-03-16T08:00:00.000Z"
  }
];

export const scores: Record<string, Score[]> = {
  "cmp-neofin": [
    {
      type: "fit_dcm",
      value: 87,
      rationale: "Escala, recorrência B2B e necessidade de funding estruturado tornam o caso aderente.",
      confidence: 0.88,
      updatedAt: "2026-03-15T10:35:00.000Z"
    },
    {
      type: "momentum",
      value: 81,
      rationale: "Sinais recentes de expansão comercial e evolução de carteira.",
      confidence: 0.79,
      updatedAt: "2026-03-15T10:35:00.000Z"
    },
    {
      type: "readiness",
      value: 74,
      rationale: "Governança razoável, com reporting recorrente e disciplina operacional.",
      confidence: 0.76,
      updatedAt: "2026-03-15T10:35:00.000Z"
    },
    {
      type: "relationship",
      value: 62,
      rationale: "Há sponsor inicial, mas relacionamento ainda em estágio intermediário.",
      confidence: 0.67,
      updatedAt: "2026-03-15T10:35:00.000Z"
    }
  ],
  "cmp-logtek": [
    {
      type: "fit_dcm",
      value: 68,
      rationale: "Boa recorrência, mas menor maturidade para emissão no curto prazo.",
      confidence: 0.73,
      updatedAt: "2026-03-14T16:05:00.000Z"
    },
    {
      type: "momentum",
      value: 76,
      rationale: "Contratações e expansão geográfica sustentam interesse comercial.",
      confidence: 0.75,
      updatedAt: "2026-03-14T16:05:00.000Z"
    },
    {
      type: "readiness",
      value: 58,
      rationale: "Ainda precisa amadurecer governança e documentação financeira.",
      confidence: 0.69,
      updatedAt: "2026-03-14T16:05:00.000Z"
    },
    {
      type: "relationship",
      value: 49,
      rationale: "Relacionamento inicial e pouca interação registrada.",
      confidence: 0.64,
      updatedAt: "2026-03-14T16:05:00.000Z"
    }
  ],
  "cmp-greenbyte": [
    {
      type: "fit_dcm",
      value: 91,
      rationale: "Capex financiável, contratos corporativos e perfil de middle market elevam o fit.",
      confidence: 0.9,
      updatedAt: "2026-03-16T08:05:00.000Z"
    },
    {
      type: "momentum",
      value: 72,
      rationale: "Pipeline comercial aquecido e novos contratos em negociação.",
      confidence: 0.7,
      updatedAt: "2026-03-16T08:05:00.000Z"
    },
    {
      type: "readiness",
      value: 83,
      rationale: "Governança e estrutura financeira mais maduras que a média da base.",
      confidence: 0.84,
      updatedAt: "2026-03-16T08:05:00.000Z"
    },
    {
      type: "relationship",
      value: 71,
      rationale: "Relacionamento ativo e histórico positivo com instituições financeiras.",
      confidence: 0.77,
      updatedAt: "2026-03-16T08:05:00.000Z"
    }
  ]
};

export const signals: MonitoringSignal[] = [
  {
    id: "sig-001",
    companyId: "cmp-neofin",
    type: "debt",
    title: "Estruturação de funding para carteira PJ",
    description:
      "Empresa sinalizou interesse em diversificar funding e alongar passivo para sustentar crescimento da carteira.",
    severity: "high",
    createdAt: "2026-03-12T11:00:00.000Z",
    evidence: [
      {
        summary: "Executivos mencionaram novas alternativas de funding em evento do setor.",
        sourceName: "Evento setorial fintech",
        sourceType: "manual",
        collectedAt: "2026-03-12T11:00:00.000Z"
      }
    ]
  },
  {
    id: "sig-002",
    companyId: "cmp-neofin",
    type: "hiring",
    title: "Expansão de time comercial enterprise",
    description:
      "Abertura de vagas para vendas enterprise e operações de crédito.",
    severity: "medium",
    createdAt: "2026-03-10T09:00:00.000Z",
    evidence: [
      {
        summary: "Página de carreiras listou novas posições para expansão comercial.",
        sourceName: "Carreiras Neofin",
        sourceType: "public_web",
        collectedAt: "2026-03-10T09:00:00.000Z",
        url: "https://neofin.example.com/careers"
      }
    ]
  },
  {
    id: "sig-003",
    companyId: "cmp-logtek",
    type: "expansion",
    title: "Nova operação regional no Nordeste",
    description:
      "A companhia passou a atender clientes enterprise em nova praça regional.",
    severity: "medium",
    createdAt: "2026-03-11T15:20:00.000Z",
    evidence: [
      {
        summary: "Release institucional anunciou reforço de cobertura regional.",
        sourceName: "Site institucional LogTek",
        sourceType: "public_web",
        collectedAt: "2026-03-11T15:20:00.000Z",
        url: "https://logtek.example.com/news/expansao-nordeste"
      }
    ]
  },
  {
    id: "sig-004",
    companyId: "cmp-greenbyte",
    type: "funding",
    title: "Pipeline de projetos exige capex adicional",
    description:
      "Novos contratos corporativos aumentaram a necessidade de financiamento para equipamentos e implantação.",
    severity: "high",
    createdAt: "2026-03-13T12:45:00.000Z",
    evidence: [
      {
        summary: "Diretoria destacou crescimento do backlog de projetos e necessidade de investimento.",
        sourceName: "Entrevista executiva",
        sourceType: "news",
        collectedAt: "2026-03-13T12:45:00.000Z"
      }
    ]
  }
];

export const watchlists: Watchlist[] = [
  {
    id: "wl-energy",
    name: "Pipeline energia e infraestrutura",
    owner: "time-dcm",
    companyIds: ["cmp-greenbyte"],
    createdAt: "2026-03-16T09:00:00.000Z"
  },
  {
    id: "wl-top-priority",
    name: "Top prioridade semanal",
    owner: "banker-srm",
    companyIds: ["cmp-neofin", "cmp-greenbyte"],
    createdAt: "2026-03-16T09:10:00.000Z"
  }
];
