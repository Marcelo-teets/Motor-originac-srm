import type { DiscoverySourceHit } from './discoveryCapture.js';

export type DiscoveryEntityNormalizationResult = {
  hits: DiscoverySourceHit[];
  rejected: number;
  rewritten: number;
  expanded: number;
};

const normalizeText = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const genericNames = new Set([
  'agencia de comunicacao',
  'conteudo patrocinado',
  'credito',
  'dcm',
  'embedded finance',
  'empresa',
  'empresas',
  'fidc',
  'fidcs',
  'fintech',
  'fintechs',
  'mercado',
  'open finance',
  'publicidade',
  'publieditorial',
  'setor',
  'startup',
  'startups',
  'tendencias',
]);

const danglingConnective = /\b(e|de|da|do|das|dos|para|com|em|por|a|o)\s*$/i;
const actionTail = /\s+\b(faz|conclui|concluiu|capta|captou|levanta|levantou|anuncia|anunciou|recebe|recebeu|cresce|cresceu|compra|comprou|vende|vendeu|estrutura|estruturou|mira|prepara|busca|amplia|acelera|expande|fecha|fechou|obt[eé]m|obteve|garante|garantiu|cria|criou|planeja|planejou|contrata|contratou|lan[cç]a|lan[cç]ou)\b.*$/i;
const appositionPrefix = /^([^,]+),\s*(?:dona|dono|controladora|controlador|ex-|antig[oa]|antes|anteriormente)\b.*$/i;
const descriptorPrefix = /^(?:fintech|startup|empresa|plataforma|healthtech|agtech|insurtech|proptech|edtech)(?:\s+[^,]{1,55})?,\s*(.+)$/i;
const genericThemeWithColon = /^(?:fidcs?|cr[eé]dito|mercado|setor|embedded finance|open finance|dcm|deb[eê]ntures?|receb[ií]veis)[^:]{0,60}:\s*(.+)$/i;
const partnershipSubject = /^(.{2,45}?)\s+e\s+(.{2,45}?)\s+(?:firmam|assinam|fecham|anunciam|lan[cç]am|fazem)\b.*$/i;

const isPlausibleCompanyName = (value: string) => {
  const name = value.replace(/\s+/g, ' ').trim().replace(/[,:;–—-]+$/g, '').trim();
  const normalized = normalizeText(name);
  const words = name.split(/\s+/).filter(Boolean);

  if (!normalized || genericNames.has(normalized)) return false;
  if (name.length < 2 || name.length > 70) return false;
  if (words.length > 7) return false;
  if (!/[A-Za-zÀ-ÿ0-9]/.test(name)) return false;
  if (danglingConnective.test(name)) return false;
  if (/[|]/.test(name)) return false;
  if (/^(como|entenda|especial|exclusivo|lista|ranking|saiba|veja|por que|porque)\b/i.test(name)) return false;
  return true;
};

const cleanSingleName = (rawName: string) => {
  let name = rawName.replace(/\s+/g, ' ').trim();

  const apposition = name.match(appositionPrefix);
  if (apposition?.[1]) name = apposition[1].trim();

  const descriptor = name.match(descriptorPrefix);
  if (descriptor?.[1]) name = descriptor[1].trim();

  const themed = name.match(genericThemeWithColon);
  if (themed?.[1]) name = themed[1].trim();

  name = name.replace(actionTail, '').replace(/[,:;–—-]+$/g, '').trim();
  return name;
};

const sourceRefFromCorroboration = (hit: DiscoverySourceHit) => {
  if (hit.sourceRef !== 'google-news-rss') return hit.sourceRef;
  const corroboratingSources = Array.isArray(hit.rawPayload.corroboratingSources)
    ? hit.rawPayload.corroboratingSources.filter((item): item is string => typeof item === 'string')
    : [];
  return corroboratingSources.find((source) => source !== 'google-news-rss' && source !== 'supabase-discovery-universe')
    ?? hit.sourceRef;
};

const withNormalizedSource = (hit: DiscoverySourceHit): DiscoverySourceHit => {
  const sourceRef = sourceRefFromCorroboration(hit);
  if (sourceRef === hit.sourceRef) return hit;
  return {
    ...hit,
    sourceRef,
    rawPayload: {
      ...hit.rawPayload,
      transportSourceRef: hit.rawPayload.transportSourceRef ?? 'google-news-rss',
      sourceIdentityPromotedFromCorroboration: true,
      originalSourceRef: hit.sourceRef,
    },
  };
};

const annotate = (
  hit: DiscoverySourceHit,
  companyName: string,
  rule: string,
  originalCompanyName: string,
): DiscoverySourceHit => ({
  ...hit,
  companyName,
  rawPayload: {
    ...hit.rawPayload,
    entityNormalization: {
      version: 'v9',
      rule,
      originalCompanyName,
      normalizedCompanyName: companyName,
    },
  },
});

export const normalizeDiscoveryEntityHits = (inputHits: DiscoverySourceHit[]): DiscoveryEntityNormalizationResult => {
  let rejected = 0;
  let rewritten = 0;
  let expanded = 0;
  const normalizedHits: DiscoverySourceHit[] = [];

  for (const input of inputHits) {
    const hit = withNormalizedSource(input);
    const originalCompanyName = hit.companyName.replace(/\s+/g, ' ').trim();
    const partnership = originalCompanyName.match(partnershipSubject);

    if (partnership?.[1] && partnership?.[2]) {
      const names = [cleanSingleName(partnership[1]), cleanSingleName(partnership[2])]
        .filter(isPlausibleCompanyName);
      if (names.length === 2) {
        expanded += 1;
        normalizedHits.push(
          ...names.map((name) => annotate(hit, name, 'split_partnership_subject', originalCompanyName)),
        );
        continue;
      }
    }

    const companyName = cleanSingleName(originalCompanyName);
    if (!isPlausibleCompanyName(companyName)) {
      rejected += 1;
      continue;
    }

    if (companyName !== originalCompanyName) rewritten += 1;
    normalizedHits.push(annotate(
      hit,
      companyName,
      companyName === originalCompanyName ? 'accepted_as_is' : 'normalized_headline_subject',
      originalCompanyName,
    ));
  }

  const byName = new Map<string, DiscoverySourceHit>();
  for (const hit of normalizedHits) {
    const key = normalizeText(hit.companyName);
    const existing = byName.get(key);
    if (!existing || hit.confidence > existing.confidence) {
      byName.set(key, hit);
      continue;
    }

    if (existing && hit.sourceRef !== existing.sourceRef) {
      const sources = new Set<string>([
        ...(Array.isArray(existing.rawPayload.corroboratingSources)
          ? existing.rawPayload.corroboratingSources.filter((item): item is string => typeof item === 'string')
          : [existing.sourceRef]),
        hit.sourceRef,
      ]);
      byName.set(key, {
        ...existing,
        confidence: Math.min(0.86, Math.max(existing.confidence, hit.confidence) + 0.04),
        rawPayload: {
          ...existing.rawPayload,
          corroboratingSources: Array.from(sources).slice(0, 6),
        },
      });
    }
  }

  return {
    hits: Array.from(byName.values()).sort((a, b) => b.confidence - a.confidence),
    rejected,
    rewritten,
    expanded,
  };
};
