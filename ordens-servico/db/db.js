/* ─────────────────────────────────────────
   db.js — camada de acesso ao banco de dados
   Backend: Google Sheets via Apps Script Web App
   Substitui o Supabase mantendo a mesma API pública (window.PCMDB).
   O resto da aplicação (pcm.html, operador.html) não precisa mudar.
   Idealizado e desenvolvido por Marcos Moura
   Migração para Google Sheets por Claude (Anthropic)
───────────────────────────────────────── */

/* Lê a URL do Web App do config.js carregado antes deste arquivo */
const GS_URL =
  (window.APP_CONFIG && window.APP_CONFIG.GS_URL) || '';

/* Nome do canal usado para avisar outras abas quando os dados mudam */
const CHANNEL_NAME = 'pcm_operador_channel';

/* Tag que identifica a versão da estrutura — muda se o schema mudar */
const STRUCTURE_TAG = 'base_google_sheets_v1';

/* Intervalo de polling: a cada 5 segundos busca atualizações do banco */
const POLL_INTERVAL_MS = 5000;

/*
  BroadcastChannel permite que duas abas do mesmo browser se comuniquem.
  Quando uma aba salva uma OS, ela avisa as outras para recarregar.
*/
const channel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel(CHANNEL_NAME)
  : null;

/* ── helpers internos ── */

function structured(v){
  return JSON.parse(JSON.stringify(v));
}

function requireConfig(){
  if(!GS_URL){
    throw new Error('Configuração ausente. Preencha GS_URL no arquivo config/config.js.');
  }
}

/*
  Chamada genérica ao Apps Script Web App.
  Todas as operações passam por aqui — GET ou POST em JSON.
  O Apps Script sempre responde com { ok: true, data: ... } ou { ok: false, error: "..." }
*/
async function call(action, payload = null){
  requireConfig();

  let res;
  if(payload === null){
    /* Leitura: usa GET com parâmetro action */
    res = await fetch(`${GS_URL}?action=${encodeURIComponent(action)}`, {
      method: 'GET',
      redirect: 'follow'
    });
  } else {
    /* Escrita: usa POST com JSON */
    res = await fetch(GS_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain' }, /* text/plain evita preflight CORS */
      body: JSON.stringify({ action, ...payload })
    });
  }

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch(_) { data = { ok: false, error: text }; }

  if(!data.ok){
    throw new Error(data.error || `Erro na ação "${action}"`);
  }
  return data.data;
}

/* ── listas padrão ── */

const DEFAULT_LISTS = {
  prioridade: ['ALTA','MÉDIA','BAIXA'],
  local: [
    'GRAO 02','SECADOR 01','GRAO 01','UBS 02','UBS 03','OFICINA','SECADOR 06','BALANCA',
    'FATURAMENTO','UBS 01','UBS 04','SECADOR 07','SECADOR 03','SECADOR 04','SECADOR 02',
    'LIMPEZA DE BAG','GRAO','SECADOR 09','CLASSIFICACAO','SECADOR 05','SECADOR 08','SEDE',
    'LABORATORIO','TRILHADEIRA','PORTARIA','UBS 06','AR 06','LAVADOR EMPILHADEIRA','LOGISTICA',
    'AR 01','AR 02','SUBSTACAO','REFEITORIO','AR 05','AR 14','AR 13','UBS 05','ARMAZEM REFRIGERADOS',
    'AR 09','AR 20','AR 03','AR 04','SECADORES','ALMOXARIFADO','GALPAO DE LONA','AR 07','AR 24',
    'TSI','PMS','AR 17','SECADOR 11','AR 23','POSTO DE COMBUSTIVEL','LIMPEZA DE CACAMBA','AR 21',
    'PATIO','SALA DE PRODUCAO','AR TSI','AR 12','PIT STOP','SALA CAMPO','PRODUCAO','CONTROLE DE QUALIDADE',
    'ESCOLA','ALOJAMENTO','AR 19','SALA DE CAMPO','SERRALHERIA','SALA DE REUNIAO','AR 22','AMBULATORIO',
    'AR 10','PCP','LAVADOR DE EPIS','SALA BRIGADA','AR 15','AR 11','AR 18','AR 16','DOIS MARCOS',
    'ADMINISTRATIVO','COMERCIAL','ARMAZENS ANTI CAMARA','AR 08','SECADOR 10','SUCATA','HIDRANTE','SALA TI'
  ],
  equipamento: [
    'MOEGA','PRE LIMPEZA','ELEVADOR 01','ELEVADOR 02','ELEVADOR 03','ELEVADOR 04','ELEVADOR 05',
    'ELEVADOR 06','ELEVADOR 07','ELEVADOR 08','ELEVADOR 09','ELEVADOR 10','SILO PULMAO 01',
    'SILO PULMAO 02','SILO PULMAO 03','SILO PULMAO 04','SECADOR MEGA','SILO SECADOR 01',
    'SILO SECADOR 02','SILO SECADOR 03','SILO SECADOR 04','SILO SECADOR 05','SILO SECADOR 06',
    'SILO EXPEDICAO 01','SILO EXPEDICAO 02','SILO EXPEDICAO 03','SILO EXPEDICAO 04',
    'FITA TRANSPORTADORA 01','FITA TRANSPORTADORA 02','FITA TRANSPORTADORA 03','FITA TRANSPORTADORA 04',
    'FITA TRANSPORTADORA 05','ROSCA 01','ROSCA 02','ROSCA 03','ROSCA 04','ROSCA 05','ROSCA 06',
    'ROSCA 07','ROSCA 08','ROSCA 09','ROSCA 10','PAINEL ELETRICO','ESPIRAIS','PADRONIZADOR 01',
    'PADRONIZADOR 02','PADRONIZADOR 03','PADRONIZADOR 04','MESA DENSIMETRICA 01','MESA DENSIMETRICA 02',
    'MESA DENSIMETRICA 03','MESA DENSIMETRICA 04','MESA DENSIMETRICA 05','MESA DENSIMETRICA 06',
    'MESA DENSIMETRICA 07','MESA DENSIMETRICA 08','MESA DENSIMETRICA 09','MESA DENSIMETRICA 10',
    'MESA DENSIMETRICA 11','MESA DENSIMETRICA 12','CAIXA DE ENSAQUE 01','CAIXA DE ENSAQUE 02',
    'ENSACADEIRA 01','ENSACADEIRA 02','BALANCA DE PISO'
  ],
  componente: [
    'EIXO','POLIA','MANCAL','MANGOTE','ROLAMENTO','CORREIA','CORRENTE','ENGRENAGEM','REDUTOR','MOTOR',
    'ACOPLAMENTO','RETENTOR','PINHAO','CHAVETA','BUCHA','PARAFUSO','PORCA','ARRUELA','CANECA','TAMBOR',
    'ROLETE','SENSOR','CONTATOR','DISJUNTOR','CABO','VALVULA','CILINDRO','PISTAO','VEDACAO','JUNTA',
    'EMENDA','TENSIONADOR','PENEIRA','HELICE','VENTILADOR','SUPORTE','MOLA','MANGUEIRA','TERMINAL',
    'FUSIVEL','BOTAO','RELE','INVERSOR'
  ],
  tipo: ['PREVENTIVA','CORRETIVA','MELHORIA'],
  executores: [],
  solicitante: []
};

const DEFAULT_INACTIVE = {
  local: [], equipamento: [], componente: [],
  executores: [], tipo_manutencao: [], solicitante: []
};

/* ── inicialização ── */

async function initDB(){
  requireConfig();
  /* O Apps Script cuida de criar as abas na primeira execução */
  await call('init');
}

/* ── meta ── */

async function getMetaRecord(id){
  return call(`getMeta&id=${encodeURIComponent(id)}`);
}

async function upsertMeta(record){
  return call('upsertMeta', { record });
}

/* ── listas ── */

async function getLists(){
  const data = await call('getLists');
  return structured(data || DEFAULT_LISTS);
}

async function getInactiveLists(){
  const data = await call('getInactiveLists');
  return structured(data || DEFAULT_INACTIVE);
}

async function setLists(lists){
  await call('setLists', { lists: structured(lists) });
  notifyChange();
}

async function setInactiveLists(inactive){
  await call('setInactiveLists', { inactive: structured(inactive) });
  notifyChange();
}

async function toggleInactiveItem(listKey, value){
  const inactive = await getInactiveLists();
  if(!inactive[listKey]) inactive[listKey] = [];
  const idx = inactive[listKey].findIndex(
    v => String(v).trim().toUpperCase() === String(value).trim().toUpperCase()
  );
  if(idx >= 0){
    inactive[listKey].splice(idx, 1);
  } else {
    inactive[listKey].push(value);
  }
  await setInactiveLists(inactive);
  return inactive;
}

/* ── ordens de serviço ── */

async function getAllOrders(){
  const rows = await call('getAllOrders');
  return Array.isArray(rows) ? rows : [];
}

async function getOrder(id){
  const row = await call(`getOrder&id=${Number(id)}`);
  return row || null;
}

async function addOrder(data, silent = false){
  const ordem = {
    status:               'ABERTA',
    data_abertura:        data.data_abertura || nowBR(),
    data_inicio:          '',
    data_fim:             '',
    prioridade:           data.prioridade,
    local:                data.local,
    equipamento:          data.equipamento,
    tipo_manutencao:      data.tipo_manutencao,
    executores:           structured(data.executores || []),
    solicitante:          data.solicitante,
    observacao_abertura:  data.observacao_abertura || '',
    causa_raiz:           '',
    componente:           '',
    observacao_fechamento:'',
    o_que_feito:          '',
    o_que_falta:          data.o_que_falta || '',
    os_origem:            data.os_origem || null,
    pendente:             !!data.pendente
  };
  const result = await call('addOrder', { ordem });
  if(!silent) notifyChange();
  return result;
}

async function updateOrder(ordem, silent = false){
  const result = await call('updateOrder', { ordem: structured(ordem) });
  if(!silent) notifyChange();
  return result;
}

async function startOrder(id, dataInicio){
  const ordem = await getOrder(id);
  if(!ordem) throw new Error('OS não encontrada.');
  ordem.status      = 'ANDAMENTO';
  ordem.data_inicio = dataInicio || nowBR();
  return updateOrder(ordem);
}

async function finishOrder(id, payload = {}){
  const ordem = await getOrder(id);
  if(!ordem) throw new Error('OS não encontrada.');
  ordem.status                = payload.status               || 'FINALIZADA';
  ordem.data_fim              = payload.data_fim             || nowBR();
  ordem.causa_raiz            = payload.causa_raiz           || ordem.causa_raiz           || '';
  ordem.componente            = payload.componente           || ordem.componente           || '';
  ordem.observacao_fechamento = payload.observacao_fechamento|| ordem.observacao_fechamento|| '';
  ordem.o_que_feito           = payload.o_que_feito          || ordem.o_que_feito          || '';
  ordem.o_que_falta           = payload.o_que_falta          || ordem.o_que_falta          || '';
  ordem.pendente              = !!payload.pendente;
  ordem.os_origem             = payload.os_origem            || ordem.os_origem            || null;
  if(payload.data_inicio) ordem.data_inicio = payload.data_inicio;
  if(payload.data_fim)    ordem.data_fim    = payload.data_fim;
  return updateOrder(ordem);
}

async function deleteOrder(id){
  await call('deleteOrder', { id: Number(id) });
  notifyChange();
}

/* ── backup ── */

async function exportBackup(){
  return {
    exported_at: nowBR(),
    structure:   STRUCTURE_TAG,
    lists:       await getLists(),
    inactive:    await getInactiveLists(),
    ordens:      await getAllOrders()
  };
}

async function importBackup(backup){
  if(backup?.lists)   await setLists(backup.lists);
  if(backup?.inactive) await setInactiveLists(backup.inactive);
  if(Array.isArray(backup?.ordens)){
    /* Envia o lote inteiro em uma única chamada para ser mais rápido */
    await call('importOrdens', { ordens: backup.ordens });
    notifyChange();
  }
}

/* ── sincronização ── */

function notifyChange(){
  if(channel){
    try { channel.postMessage({ type: 'changed', at: Date.now() }); } catch(_) {}
  }
}

function onExternalChange(cb){
  const ctrl = {
    _paused: false,
    pause(){  this._paused = true;  },
    resume(){ this._paused = false; }
  };
  if(channel){
    channel.onmessage = (event) => {
      if(event?.data?.type === 'changed' && !ctrl._paused) cb?.();
    };
  }
  setInterval(() => { if(!ctrl._paused) cb?.(); }, POLL_INTERVAL_MS);
  return ctrl;
}

/* ── API pública — idêntica ao db.js original ── */

window.PCMDB = {
  initDB,
  getLists, setLists,
  getInactiveLists, setInactiveLists, toggleInactiveItem,
  getAllOrders, getOrder, addOrder, updateOrder, startOrder, finishOrder, deleteOrder,
  exportBackup, importBackup,
  notifyChange, onExternalChange,
  subscribeChanges: onExternalChange,
  nowBR, elapsedHHMM, escapeHtml, priorityClass
};
