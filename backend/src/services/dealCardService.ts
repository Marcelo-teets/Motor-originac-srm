import { createHash, randomUUID } from 'node:crypto';
import { getDataClient } from '../lib/dataClient.js';
import {
  assembleDealCard, normalizeCapture, type CaptureInput, type DealClaim,
  type DealEvent, type DealSource, type Opportunity, type Originator,
} from '../modules/dealCardIntelligence.js';
import { normalizeProduct } from '../modules/originationAiFlow.js';

/**
 * Authenticated Neon service. No mailbox scanning or third-party credentials here:
 * provider adapters pass explicit source records through capture(); unstructured
 * content is hashed and discarded (unless retained in its upstream source).
 */
export class DealCardService {
  private db() {
    const db = getDataClient();
    if (!db) throw Object.assign(new Error('Neon indisponível.'), { statusCode: 503 });
    return db;
  }
  private fail(message: string, statusCode = 400): never {
    throw Object.assign(new Error(message), { statusCode });
  }
  private async member(dealId: string, actor: string, write = false) {
    const members = await this.db().select('dcm_opportunity_members', {
      filters: [{ column: 'opportunity_id', value: dealId }, { column: 'user_id', value: actor }],
      limit: 1,
    });
    const membership = members?.[0] as any;
    if (!membership) this.fail('Usuário não autorizado para esta oportunidade.', 403);
    if (write && membership.role === 'viewer') this.fail('Permissão de leitura apenas.', 403);
    return membership as { role: 'owner' | 'editor' | 'viewer' };
  }
  private async opportunity(dealId: string) {
    const rows = await this.db().select('dcm_opportunities', {
      filters: [{ column: 'id', value: dealId }], limit: 1,
    });
    if (!rows?.[0]) this.fail('Oportunidade não encontrada.', 404);
    return rows[0] as any;
  }
  async list(actor: string, companyId?: string) {
    const values: unknown[] = [actor];
    const companySql = companyId ? 'and o.company_id = $2' : '';
    if (companyId) values.push(companyId);
    return this.db().query(`
      select o.* from public.dcm_opportunities o
      join public.dcm_opportunity_members m on m.opportunity_id = o.id
      where m.user_id = $1 ${companySql}
      order by o.updated_at desc limit 200
    `, values);
  }
  async create(actor: string, body: { companyId: string; title: string; product?: string; revisitOf?: string | null }) {
    if (!body.companyId || !body.title?.trim()) this.fail('companyId e title são obrigatórios.');
    const product = normalizeProduct(body.product);
    if (body.product && product === 'UNDEFINED') this.fail('Produto fora do escopo da SRM.');
    if (body.revisitOf) {
      await this.member(body.revisitOf, actor);
      const previous = await this.opportunity(body.revisitOf);
      if (previous.company_id !== body.companyId) this.fail('A revisita deve pertencer à mesma empresa.');
    }
    const rows = await this.db().query(`
      with found as (select id from public.companies where id = $1),
      created as (
        insert into public.dcm_opportunities
          (id, company_id, title, product, owner_user_id, revisit_of)
        select $2::uuid, id, $3, $4, $5, $6::uuid from found
        returning *
      ), member as (
        insert into public.dcm_opportunity_members(opportunity_id,user_id,role)
        select id, $5, 'owner' from created returning opportunity_id
      ) select created.* from created join member on created.id = member.opportunity_id
    `, [body.companyId, randomUUID(), body.title.trim(), product, actor, body.revisitOf ?? null]);
    if (!rows[0]) this.fail('Empresa não encontrada.', 404);
    return rows[0];
  }
  async addMember(dealId: string, actor: string, body: { userId: string; role?: string }) {
    const current = await this.member(dealId, actor);
    if (current.role !== 'owner') this.fail('Somente o responsável pode liberar acesso.', 403);
    if (!body.userId || !['editor','viewer'].includes(body.role ?? 'viewer')) this.fail('Usuário ou papel inválido.');
    // App identity must already exist and be active; do not invite by raw email.
    const users = await this.db().select('user_profiles', {
      select: 'id,status', filters: [{ column: 'id', value: body.userId }], limit: 1,
    });
    if (users[0]?.status !== 'active') this.fail('Usuário institucional ativo não encontrado.', 404);
    return this.db().upsert('dcm_opportunity_members', [{
      opportunity_id: dealId, user_id: body.userId, role: body.role ?? 'viewer',
    }], 'opportunity_id,user_id');
  }
  async capture(dealId: string, actor: string, input: CaptureInput) {
    await this.member(dealId, actor, true);
    if (input.opportunityId && input.opportunityId !== dealId) this.fail('Vínculo com outra oportunidade proibido.');
    const normalized = normalizeCapture({ ...input, opportunityId: dealId });
    if (normalized.state === 'quarantine' || !normalized.source) {
      return { status: 'quarantined', reason: normalized.reason, stored: false };
    }
    const record = normalized.source;
    const filter = [
      { column: 'opportunity_id', value: dealId },
      { column: 'provider', value: record.provider },
      { column: 'external_id', value: record.externalId },
      { column: 'content_sha256', value: record.contentHash },
    ];
    let [persisted] = await this.db().select('dcm_source_items', { filters: filter, limit: 1 });
    if (!persisted) {
      const rows = await this.db().insert('dcm_source_items', [{
        id: randomUUID(), opportunity_id: dealId, provider: record.provider,
        external_id: record.externalId, title: record.title, source_ref: record.sourceRef,
        content_sha256: record.contentHash, occurred_at: record.occurredAt,
        match_method: record.matchMethod, reviewed_by: actor,
      }]);
      persisted = rows[0];
    }
    let added = 0;
    for (const evidence of normalized.claims) {
      const existing = await this.db().select('dcm_evidence_claims', {
        filters: [{ column: 'evidence_key', value: evidence.evidenceKey }], limit: 1,
      });
      if (existing.length) continue; // Do not overwrite human reviews on repeated imports.
      await this.db().insert('dcm_evidence_claims', [{
        id: randomUUID(), opportunity_id: dealId, source_id: persisted.id,
        evidence_key: evidence.evidenceKey, field_key: evidence.field,
        reference_period: evidence.period, value_json: evidence.value,
        claim_type: evidence.claimType, materiality: evidence.materiality,
        confidence: evidence.confidence, status: 'proposed',
        effective_at: record.occurredAt,
      }]);
      added++;
    }
    return { status: 'ingested', sourceId: persisted.id, newClaims: added, reviewRequired: true };
  }
  async reviewClaim(dealId: string, actor: string, body: { claimId: string; status: string; note: string }) {
    await this.member(dealId, actor, true);
    if (!body.claimId || !['validated','disputed','superseded'].includes(body.status)
      || !body.note?.trim()) this.fail('claimId, status e justificativa são obrigatórios.');
    const rows = await this.db().update('dcm_evidence_claims', {
      status: body.status, reviewed_by: actor, reviewed_at: new Date().toISOString(),
      resolution_note: body.note.trim(), updated_at: new Date().toISOString(),
    }, [{ column: 'id', value: body.claimId }, { column: 'opportunity_id', value: dealId }]);
    if (!rows[0]) this.fail('Evidência não encontrada.', 404);
    return rows[0];
  }
  async addEvent(dealId: string, actor: string, body: {
    type: string; title: string; happenedAt?: string; owner?: string; dueAt?: string; state?: string; sourceId?: string;
  }) {
    await this.member(dealId, actor, true);
    if (!body.title?.trim() || !['meeting','decision','action','risk','stage_change','note'].includes(body.type))
      this.fail('Evento inválido.');
    if (body.state && !['open','done','blocked'].includes(body.state)) this.fail('Estado inválido.');
    const rows = await this.db().insert('dcm_deal_events', [{
      id: randomUUID(), opportunity_id: dealId, type: body.type, title: body.title.trim(),
      happened_at: body.happenedAt ?? new Date().toISOString(),
      owner_user_id: body.owner ?? null, due_at: body.dueAt ?? null,
      state: body.state ?? null, source_id: body.sourceId ?? null, recorded_by: actor,
    }]);
    return rows[0];
  }
  async linkOriginator(dealId: string, actor: string, body: {
    originatorId: string; contributionType?: string; attributionNote?: string;
  }) {
    await this.member(dealId, actor, true);
    if (!body.originatorId) this.fail('originatorId obrigatório.');
    return this.db().upsert('dcm_opportunity_originators', [{
      opportunity_id: dealId, originator_id: body.originatorId,
      contribution_type: body.contributionType ?? 'introduction',
      attribution_note: body.attributionNote ?? null, linked_by: actor,
    }], 'opportunity_id,originator_id,contribution_type');
  }
  private async buildPayload(dealId: string) {
    const opportunity = await this.opportunity(dealId);
    const [sources, claims, events, partners] = await Promise.all([
      this.db().select('dcm_source_items', { filters: [{ column: 'opportunity_id', value: dealId }], limit: 1000 }),
      this.db().select('dcm_evidence_claims', { filters: [{ column: 'opportunity_id', value: dealId }], limit: 3000 }),
      this.db().select('dcm_deal_events', { filters: [{ column: 'opportunity_id', value: dealId }], limit: 1000 }),
      this.db().query(`select p.id,p.display_name,p.contribution_type from
        (select o.id, o.display_name, l.contribution_type from public.dcm_originators o
        join public.dcm_opportunity_originators l on l.originator_id=o.id
        where l.opportunity_id=$1) p order by p.display_name`, [dealId]),
    ]);
    const sourceData: DealSource[] = sources.map((s: any) => ({
      id: s.id, opportunityId: s.opportunity_id, provider: s.provider,
      externalId: s.external_id, title: s.title, sourceRef: s.source_ref,
      contentHash: s.content_sha256, occurredAt: s.occurred_at,
      ingestedAt: s.ingested_at, matchMethod: s.match_method,
    })).sort((a,b)=>a.id.localeCompare(b.id));
    const claimData: DealClaim[] = claims.map((c: any) => ({
      id: c.id, opportunityId: c.opportunity_id, sourceId: c.source_id,
      field: c.field_key, value: c.value_json, period: c.reference_period,
      claimType: c.claim_type, materiality: c.materiality, status: c.status,
      confidence: Number(c.confidence), effectiveAt: c.effective_at, reviewedBy: c.reviewed_by,
    })).sort((a,b)=>a.id.localeCompare(b.id));
    const eventData: DealEvent[] = events.map((e: any)=>({
      id:e.id, opportunityId:e.opportunity_id, type:e.type, title:e.title,
      happenedAt:e.happened_at, owner:e.owner_user_id, dueAt:e.due_at, state:e.state,sourceId:e.source_id,
    }));
    const originators: Originator[] = partners.map((p:any)=>({id:p.id,displayName:p.display_name,attribution:p.contribution_type}));
    const deal: Opportunity = {
      id:opportunity.id,companyId:opportunity.company_id,title:opportunity.title,
      product:opportunity.product,stage:opportunity.stage,status:opportunity.status,
      revisitOf:opportunity.revisit_of,ownerUserId:opportunity.owner_user_id,
    };
    return assembleDealCard({opportunity:deal,sources:sourceData,claims:claimData,events:eventData,originators});
  }
  async getCard(dealId: string, actor: string) {
    await this.member(dealId, actor);
    const snapshots = await this.db().select('dcm_card_snapshots', {
      filters: [{ column: 'opportunity_id', value: dealId }],
      orderBy: { column: 'version', ascending: false }, limit: 1,
    });
    return snapshots[0] ?? { state: 'not_built', opportunityId: dealId };
  }
  async getEvidence(dealId: string, actor: string) {
    await this.member(dealId, actor);
    return this.db().select('dcm_evidence_claims', {
      filters: [{ column: 'opportunity_id', value: dealId }], limit: 3000,
    });
  }
  async rebuild(dealId: string, actor: string) {
    await this.member(dealId, actor, true);
    const card = await this.buildPayload(dealId);
    // Exclude generatedAt from content hash; reruns with identical data are idempotent.
    const { generatedAt, ...stable } = card;
    const hash = createHash('sha256').update(JSON.stringify(stable)).digest('hex');
    const latest = await this.getCard(dealId, actor) as any;
    if (latest.content_sha256 === hash) return { unchanged: true, snapshot: latest };
    const version = Number(latest.version ?? 0) + 1;
    const rows = await this.db().insert('dcm_card_snapshots', [{
      id: randomUUID(), opportunity_id: dealId, version,
      schema_version: card.schemaVersion, payload: card, content_sha256: hash,
      state: 'draft', generated_by: actor,
    }]);
    return { unchanged: false, snapshot: rows[0] };
  }
}
