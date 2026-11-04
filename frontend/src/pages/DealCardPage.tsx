import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { Card, EmptyState, ErrorState, LoadingState, PageIntro, Pill } from '../components/UI';
import type { CompanyListItem } from '../lib/types';

type Deal = { id: string; company_id: string; title: string; product: string; stage: string; status: string; revisit_of?: string | null };
type Evidence = { id: string; source_id: string; field_key: string; reference_period?: string | null; value_json: unknown;
  claim_type: string; materiality: string; status: string; confidence: number; resolution_note?: string | null };
type Snapshot = { id: string; version: number; state: string; payload: {
  opportunity: { title: string; product: string; stage: string; status: string; revisitOf?: string | null };
  readiness: { status: string; missing: string[] };
  executiveSummary: string;
  glossary: Array<{term:string;definition:string}>;
  fields: Record<string,{value:unknown;status:string;period:string|null;confidence:number;sourceIds:string[]}>;
  conflicts: Array<{field:string;period:string|null;action:string}>;
  sources: Array<{id:string;provider:string;title:string;sourceRef?:string|null;occurredAt?:string|null}>;
  actions: Array<{id:string;title:string;owner?:string|null;dueAt?:string|null;state?:string|null}>;
  history: Array<{id:string;title:string;type:string;happenedAt:string}>;
  coverage: Array<{provider:string;count:number}>;
} };

const products = ['FIDC','CRI','CRA','DEBENTURE','DEBENTURE_INCENTIVADA'];
const providers = ['manual','fireflies','teams','outlook_email','outlook_calendar','sharepoint','client_folder','crm'];
const renderValue = (value: unknown) => {
  if (value === undefined || value === null || value === '') return 'Não informado';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};
const validLink = (value: string | null | undefined) =>
  value && /^https:\/\//i.test(value) ? value : null;
const statusName = (value: string) => ({
  proposed:'Pendente de revisão',validated:'Validado',disputed:'Conflito',superseded:'Substituído',
  BLOCKED:'Bloqueado',REVIEW_REQUIRED:'Revisão necessária',INFORMATIONAL:'Pronto para aprovação',
  approved:'Aprovado',draft:'Rascunho',
} as Record<string,string>)[value] ?? value;
export function DealCardPage() {
  const {session} = useAuth();
  const [params,setParams] = useSearchParams();
  const [companies,setCompanies] = useState<CompanyListItem[]>([]);
  const [deals,setDeals] = useState<Deal[]>([]);
  const [selected,setSelected] = useState(params.get('dealId') ?? '');
  const [snapshot,setSnapshot] = useState<Snapshot|null>(null);
  const [evidence,setEvidence] = useState<Evidence[]>([]);
  const [loading,setLoading] = useState(true);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const [notice,setNotice] = useState('');
  const [companyId,setCompanyId] = useState(params.get('companyId') ?? '');
  const [title,setTitle] = useState('');
  const [product,setProduct] = useState('FIDC');
  const [revisitOf,setRevisitOf] = useState('');
  const [provider,setProvider] = useState('manual');
  const [connectedProvider,setConnectedProvider] = useState('fireflies');
  const [externalSourceId,setExternalSourceId] = useState('');
  const [sourceChatId,setSourceChatId] = useState('');
  const [sourceDriveId,setSourceDriveId] = useState('');
  const [sourceTitle,setSourceTitle] = useState('');
  const [sourceUrl,setSourceUrl] = useState('');
  const [field,setField] = useState('financialNeed');
  const [fieldValue,setFieldValue] = useState('');
  const [period,setPeriod] = useState('');
  const [materiality,setMateriality] = useState('medium');
  const [actionTitle,setActionTitle] = useState('');
  const [actionType,setActionType] = useState('action');
  const [actionOwner,setActionOwner] = useState('');
  const [actionDue,setActionDue] = useState('');
  const [reviewNotes,setReviewNotes] = useState<Record<string,string>>({});

  const loadDeals = async () => {
    const [list, companiesState] = await Promise.all([api.listDealCards(session),api.getCompanies(session)]);
    setDeals(list);
    setCompanies(companiesState.data);
    return list as Deal[];
  };
  const loadDetails = async (id: string) => {
    if (!id) {setSnapshot(null);setEvidence([]);return;}
    const [card, claims] = await Promise.all([api.getDealCard(session,id),api.getDealEvidence(session,id)]);
    setSnapshot(card?.payload ? card as Snapshot : null);
    setEvidence(claims);
  };
  useEffect(() => {
    let live = true;
    setLoading(true);setError('');
    Promise.all([api.listDealCards(session),api.getCompanies(session)])
      .then(async ([list,state]) => {
        if (!live) return;
        setDeals(list);setCompanies(state.data);
        const id = params.get('dealId') || '';
        if (id) await loadDetails(id);
      }).catch(e => {if(live)setError(e instanceof Error?e.message:String(e));})
      .finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[session?.access_token]);

  const selectDeal = async (id: string) => {
    setSelected(id);
    const next=new URLSearchParams(params);
    if(id)next.set('dealId',id);else next.delete('dealId');
    setParams(next);
    setError('');setNotice('');
    try {await loadDetails(id);}catch(e){setError(e instanceof Error?e.message:String(e));}
  };
  const execute = async (operation: () => Promise<unknown>, message: string, refresh=true) => {
    setBusy(true);setError('');setNotice('');
    try {
      await operation();
      if(refresh && selected) await loadDetails(selected);
      setNotice(message);
    } catch(e) {setError(e instanceof Error?e.message:String(e));}
    finally {setBusy(false);}
  };
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!companyId || !title.trim()) return;
    setBusy(true);setError('');setNotice('');
    try {
      const deal=await api.createDealCard(session,{companyId,title:title.trim(),product,
        ...(revisitOf?{revisitOf}:{})});
      await loadDeals();
      setTitle('');setRevisitOf('');
      await selectDeal(deal.id);
      setNotice('Oportunidade cadastrada, sem documentos ou dados inferidos.');
    }catch(err){setError(err instanceof Error?err.message:String(err));}
    finally{setBusy(false);}
  };
  const capture = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!selected || !sourceTitle.trim() || !fieldValue.trim())return;
    await execute(async()=>{
      const result=await api.captureDealSource(session,selected,{
        opportunityId:selected,mappingApproved:true,provider,
        externalId:crypto.randomUUID(),title:sourceTitle.trim(),
        ...(validLink(sourceUrl)?{sourceRef:sourceUrl}:{}),
        claims:[{field,value:fieldValue,period:period||undefined,
          materiality,confidence:0.6,claimType:'fact'}],
      });
      if(result?.status!=='ingested')throw new Error(result?.reason||'Fonte não vinculada.');
      await api.rebuildDealCard(session,selected);
      setSourceTitle('');setSourceUrl('');setFieldValue('');setPeriod('');
    },'Fonte registrada como evidência pendente. A afirmação ainda precisa ser validada.');
  };
  const importConnected = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !externalSourceId.trim()) return;
    await execute(async () => {
      if (connectedProvider === 'fireflies') {
        await api.importFirefliesDealSource(session,selected,externalSourceId.trim());
      } else {
        await api.importMicrosoftDealSource(session,{
          dealId:selected,provider:connectedProvider,externalId:externalSourceId.trim(),
          ...(connectedProvider === 'teams'?{chatId:sourceChatId.trim()}:{}),
          ...(connectedProvider === 'sharepoint'?{driveId:sourceDriveId.trim()}:{}),
        });
      }
      setExternalSourceId('');
    },'Fonte consultada e associada à operação. Eventuais informações financeiras permanecem pendentes de revisão.');
  };
  const addEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if(!selected||!actionTitle.trim())return;
    await execute(async()=>{
      await api.addDealEvent(session,selected,{
        type:actionType,title:actionTitle.trim(),
        ...(actionOwner?{owner:actionOwner}:{}),
        ...(actionDue?{dueAt:new Date(actionDue+'T12:00:00').toISOString()}:{}),
        ...(actionType==='action'?{state:'open'}:{}),
      });
      setActionTitle('');setActionOwner('');setActionDue('');
      await api.rebuildDealCard(session,selected);
    },'Evento registrado e nova versão preparada.');
  };
  if(loading)return <LoadingState title="Deal Cards" subtitle="Carregando oportunidades com acesso autorizado." />;
  return <div className="page">
    <PageIntro eyebrow="Origination Intelligence" title="Deal Cards"
      description="Uma ficha viva por operação. Fontes externas ainda exigem conexão e autorização; registros aqui são revisados por evidência."
    />
    {error?<ErrorState title="Não foi possível completar a operação" error={error}/>:null}
    {notice?<div className="table-helper" role="status">{notice}</div>:null}
    <section className="grid cols-2 detail-layout">
      <Card title="Oportunidades" subtitle="Uma empresa pode ter vários deals independentes">
        {deals.length ? <div className="stack-blocks">{deals.map(deal=><button
          key={deal.id} type="button" className="secondary" disabled={busy}
          style={{display:'flex',width:'100%',justifyContent:'space-between',textAlign:'left',marginBottom:8}}
          aria-pressed={selected===deal.id}
          onClick={()=>void selectDeal(deal.id)}>
          <span>{deal.title}<small style={{display:'block'}}>{companies.find(c=>c.id===deal.company_id)?.name??deal.company_id}</small></span>
          <span>{deal.product} · {deal.status}</span>
        </button>)}</div>:<EmptyState title="Nenhuma operação cadastrada." description="Cadastre uma oportunidade abaixo sem alterar o Company Master."/>}
      </Card>
      <Card title="Nova oportunidade" subtitle="Cadastro inicial, revisão ou revisita">
        <form onSubmit={e=>void create(e)} style={{display:'grid',gap:10}}>
          <label>Empresa
            <select value={companyId} required onChange={e=>setCompanyId(e.target.value)}>
              <option value="">Selecione a empresa</option>
              {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Nome da operação
            <input required maxLength={180} value={title} onChange={e=>setTitle(e.target.value)}
              placeholder="Ex.: FIDC para expansão de carteira" />
          </label>
          <label>Produto
            <select value={product} onChange={e=>setProduct(e.target.value)}>
              {products.map(p=><option key={p} value={p}>{p.replace(/_/g,' ')}</option>)}
            </select>
          </label>
          <label>Revisita de (opcional)
            <select value={revisitOf} onChange={e=>setRevisitOf(e.target.value)}>
              <option value="">Nova oportunidade</option>
              {deals.filter(d=>d.company_id===companyId).map(d=><option value={d.id} key={d.id}>{d.title}</option>)}
            </select>
          </label>
          <button disabled={busy||!companyId||!title.trim()} type="submit">Criar Deal</button>
        </form>
      </Card>
    </section>
    {selected ? <section className="stack-blocks">
      <Card title={snapshot?.payload?.opportunity.title??'Deal Card ainda não gerado'}
        subtitle={`Oportunidade ${selected} · ${snapshot ? 'Versão '+snapshot.version+' · '+snapshot.state:'Sem snapshot'}`}>
        <div className="pill-row">
          {snapshot?.payload?<Pill tone={snapshot.payload.readiness.status==='BLOCKED'?'warning':'info'}>
            {statusName(snapshot.payload.readiness.status)}</Pill>:null}
          <button className="secondary" disabled={busy} type="button"
            onClick={()=>void execute(()=>api.rebuildDealCard(session,selected),'Card recalculado sem alteração automática de fatos.')}>
            Reconstruir card
          </button>
          {snapshot?.state==='draft'?<button disabled={busy||snapshot.payload.readiness.status!=='INFORMATIONAL'} type="button"
            onClick={()=>void execute(()=>api.approveDealCard(session,selected,snapshot.id),'Snapshot aprovado para consulta interna.')}>
            Aprovar conteúdo
          </button>:null}
        </div>
        {snapshot?.payload ? <>
          <div className="mini-metric-grid top-gap">
            <div className="mini-panel"><strong>Produto</strong><span>{snapshot.payload.opportunity.product}</span></div>
            <div className="mini-panel"><strong>Estágio</strong><span>{snapshot.payload.opportunity.stage}</span></div>
            <div className="mini-panel"><strong>Evidências</strong><span>{evidence.length}</span></div>
            <div className="mini-panel"><strong>Fontes</strong><span>{snapshot.payload.sources.length}</span></div>
          </div>
          {snapshot.payload.readiness.missing.length?<p><strong>Informações necessárias para revisão:</strong> {snapshot.payload.readiness.missing.join(', ')}.</p>:null}
          {snapshot.payload.conflicts.length?<div className="state-box state-error"><strong>Conflitos materiais: </strong>
            {snapshot.payload.conflicts.map((c,i)=><div key={i}>{c.field} ({c.period??'sem período'}) — {c.action}</div>)}
          </div>:null}
          <h3>Resumo executivo</h3>
          <p>{snapshot.payload.executiveSummary}</p>
          <h3>Sumário dos fatos e hipóteses</h3>
          {Object.keys(snapshot.payload.fields).length?<table className="dense-table"><thead><tr><th>Campo</th><th>Valor</th><th>Revisão</th></tr></thead>
            <tbody>{Object.entries(snapshot.payload.fields).map(([key,value])=><tr key={key}>
              <td>{key}</td><td>{renderValue(value.value)}</td><td>{statusName(value.status)}</td></tr>)}</tbody>
          </table>:<p>Sem informações materiais validadas. Use a coleta manual ou a futura sincronização com as fontes.</p>}
          <h3>Fontes rastreáveis</h3>
          {snapshot.payload.sources.length? <ul className="list">{snapshot.payload.sources.map(s=><li key={s.id}>
            <span>{s.provider}: {s.title}</span>{validLink(s.sourceRef)?<a href={s.sourceRef!} target="_blank" rel="noopener noreferrer">Abrir fonte</a>:null}
          </li>)}</ul>:<p>Sem fontes associadas.</p>}
          <details><summary>Glossário desta operação</summary>
            <dl>{snapshot.payload.glossary?.map(entry=><div key={entry.term} style={{marginBottom:10}}>
              <dt><strong>{entry.term}</strong></dt><dd>{entry.definition}</dd>
            </div>)}</dl>
          </details>
          <h3>Pendências e linha do tempo</h3>
          {snapshot.payload.actions.length?<ul className="list">{snapshot.payload.actions.map(a=><li key={a.id}>{a.title}
            {a.dueAt?` · até ${new Date(a.dueAt).toLocaleDateString('pt-BR')}`:''}</li>)}</ul>:<p>Sem pendências abertas registradas.</p>}
          <div className="table-helper">{snapshot.payload.history.slice(0,12).map(e=>
            <div key={e.id}>{new Date(e.happenedAt).toLocaleDateString('pt-BR')} · {e.type} · {e.title}</div>)}</div>
        </>:<p>Registre fontes e gere a primeira versão do Deal Card.</p>}
      </Card>
      <Card title="Consultar fonte conectada" subtitle="Busque uma reunião, mensagem ou arquivo específico, com permissão da conta institucional">
        <form onSubmit={e=>void importConnected(e)} style={{display:'grid',gap:10,maxWidth:650}}>
          <p className="table-helper">
            Importação sob demanda por ID. O Motor não percorre toda a sua caixa de e-mail ou as reuniões do workspace.
            O acesso dependerá da autorização da SRM e dos escopos concedidos no Microsoft 365 ou no Fireflies.
          </p>
          <label>Fonte
            <select value={connectedProvider} onChange={e=>setConnectedProvider(e.target.value)}>
              {['fireflies','outlook_email','outlook_calendar','teams','sharepoint'].map(p=>
                <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label>ID exato da fonte
            <input required value={externalSourceId} onChange={e=>setExternalSourceId(e.target.value)}
              placeholder="Identificador da reunião, e-mail, evento, mensagem ou arquivo" maxLength={400}/>
          </label>
          {connectedProvider==='teams'?<label>ID do chat
            <input required value={sourceChatId} onChange={e=>setSourceChatId(e.target.value)}
              maxLength={400} placeholder="chatId do Teams" /></label>:null}
          {connectedProvider==='sharepoint'?<label>ID da biblioteca (drive)
            <input required value={sourceDriveId} onChange={e=>setSourceDriveId(e.target.value)}
              maxLength={400} placeholder="driveId da biblioteca" /></label>:null}
          <button type="submit" disabled={busy||!externalSourceId.trim()||
            (connectedProvider==='teams'&&!sourceChatId.trim())||
            (connectedProvider==='sharepoint'&&!sourceDriveId.trim())}>
            Consultar e registrar fonte
          </button>
        </form>
      </Card>
      <section className="grid cols-2 detail-layout">
        <Card title="Coleta assistida" subtitle="Registre a referência e a informação; nada é validado automaticamente">
          <form onSubmit={e=>void capture(e)} style={{display:'grid',gap:10}}>
            <label>Tipo de fonte<select value={provider} onChange={e=>setProvider(e.target.value)}>
              {providers.map(p=><option key={p} value={p}>{p}</option>)}</select></label>
            <label>Título/reunião/documento<input required value={sourceTitle} onChange={e=>setSourceTitle(e.target.value)} placeholder="Identificação da origem"/></label>
            <label>Link HTTPS (opcional)<input value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://..." /></label>
            <label>Campo<select value={field} onChange={e=>setField(e.target.value)}>
              {['financialNeed','requestedAmount','probableProduct','receivables','loanTape',
                'contract','assignmentEligibility','financials','debtStructure','cashflow',
                'collateral','incentiveEligibility','context','timing','nextAction']
                .map(p=><option key={p} value={p}>{p}</option>)}</select></label>
            <label>Informação obtida<input required value={fieldValue} onChange={e=>setFieldValue(e.target.value)}
              placeholder="Copie apenas o dado relevante, não o documento integral" /></label>
            <label>Período (opcional)<input value={period} onChange={e=>setPeriod(e.target.value)} placeholder="Ex.: 2026-09"/></label>
            <label>Materialidade<select value={materiality} onChange={e=>setMateriality(e.target.value)}>
              {['low','medium','high','critical'].map(p=><option key={p} value={p}>{p}</option>)}</select></label>
            <button type="submit" disabled={busy||!sourceTitle.trim()||!fieldValue.trim()}>Adicionar evidência pendente</button>
          </form>
        </Card>
        <Card title="Próximos passos / decisões" subtitle="Histórico compartilhado do deal">
          <form onSubmit={e=>void addEvent(e)} style={{display:'grid',gap:10}}>
            <label>Tipo<select value={actionType} onChange={e=>setActionType(e.target.value)}>
              {['action','decision','meeting','risk','note','stage_change'].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
            <label>Descrição<input required value={actionTitle} onChange={e=>setActionTitle(e.target.value)} /></label>
            <label>Responsável (texto)<input value={actionOwner} onChange={e=>setActionOwner(e.target.value)} /></label>
            <label>Prazo<input type="date" value={actionDue} onChange={e=>setActionDue(e.target.value)} /></label>
            <button type="submit" disabled={busy||!actionTitle.trim()}>Registrar e atualizar card</button>
          </form>
        </Card>
      </section>
      <Card title="Fila de revisão de evidências" subtitle="Autorize ou conteste cada afirmação relevante, com justificativa">
        {evidence.length?<div className="stack-blocks">{evidence.map(ev=><div key={ev.id} className="mini-panel">
          <div className="row-between"><strong>{ev.field_key}{ev.reference_period?` · ${ev.reference_period}`:''}</strong>
            <Pill tone={ev.status==='validated'?'success':ev.status==='disputed'?'warning':'info'}>{statusName(ev.status)}</Pill></div>
          <p style={{overflowWrap:'anywhere'}}>{renderValue(ev.value_json)}</p>
          {ev.status==='proposed'||ev.status==='disputed'?<div style={{display:'grid',gap:8}}>
            <input placeholder="Justificativa de validação ou contestação" value={reviewNotes[ev.id]??''}
              onChange={e=>setReviewNotes(s=>({...s,[ev.id]:e.target.value}))}/>
            <div className="pill-row">
              <button type="button" disabled={busy||!(reviewNotes[ev.id]??'').trim()}
                onClick={()=>void execute(async()=>{
                  await api.reviewDealEvidence(session,selected,{claimId:ev.id,status:'validated',note:reviewNotes[ev.id]});
                  await api.rebuildDealCard(session,selected);
                },'Revisão registrada. Hipóteses permanecem pendentes de confirmação documental.')}>{ev.claim_type==='hypothesis'?'Validar hipótese':'Validar'}</button>
              {ev.claim_type === 'hypothesis' ? <button type="button" className="secondary"
                disabled={busy || (reviewNotes[ev.id]??'').trim().length < 30}
                title="Confirme apenas após conferir uma fonte primária e justificar a decisão."
                onClick={()=>void execute(async()=>{
                  await api.reviewDealEvidence(session,selected,{
                    claimId:ev.id,status:'validated',claimType:'fact',note:reviewNotes[ev.id],
                  });
                  await api.rebuildDealCard(session,selected);
                },'Hipótese confirmada como fato, com revisão humana documentada.')}>
                Confirmar como fato
              </button> : null}
              <button type="button" className="secondary" disabled={busy||!(reviewNotes[ev.id]??'').trim()}
                onClick={()=>void execute(async()=>{
                  await api.reviewDealEvidence(session,selected,{claimId:ev.id,status:'disputed',note:reviewNotes[ev.id]});
                  await api.rebuildDealCard(session,selected);
                },'Evidência contestada; conflito preservado.')}>Contestar</button>
              <button type="button" className="secondary" disabled={busy||!(reviewNotes[ev.id]??'').trim()}
                onClick={()=>void execute(async()=>{
                  await api.reviewDealEvidence(session,selected,{claimId:ev.id,status:'superseded',note:reviewNotes[ev.id]});
                  await api.rebuildDealCard(session,selected);
                },'Evidência substituída e histórico preservado.')}>Substituir</button>
            </div>
          </div>:ev.resolution_note?<small>{ev.resolution_note}</small>:null}
        </div>)}</div>:<EmptyState title="Sem afirmações capturadas." description="Adicione evidências ou conecte futuramente os provedores autorizados." />}
      </Card>
    </section>:null}
  </div>;
}
