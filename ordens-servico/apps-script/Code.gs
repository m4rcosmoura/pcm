/**
 * ─────────────────────────────────────────
 * Code.gs — backend PCM para Google Sheets
 * Cole todo este código no Apps Script da sua planilha.
 * Menu: Extensões → Apps Script
 *
 * Abas criadas automaticamente:
 *   ordens  — uma linha por OS
 *   meta    — registros chave/valor (contador, versão)
 *   listas  — JSON das listas de seleção
 *
 * ATUALIZAÇÃO: adicionada a ação "getInitialData", que devolve init + listas +
 * inativos + ordens em UMA ÚNICA execução. O front-end usava até 4 chamadas
 * separadas pra carregar a página (e mais 3 a cada poll de 30s) — com várias
 * pessoas usando ao mesmo tempo, isso gerava muitas execuções simultâneas e
 * estourava o limite de concorrência do Apps Script, causando fila/demora
 * mesmo com cada chamada individual sendo rápida (<3s). Reduzir para 1
 * chamada por carregamento ataca isso na raiz. As ações antigas continuam
 * funcionando (usadas em outros pontos do app que só precisam atualizar
 * uma coisa por vez).
 *
 * ATUALIZAÇÃO 2: cache (CacheService) no getInitialData_ + LockService nas
 * escritas que ainda não tinham. Ver comentários abaixo, na seção "CACHE" e
 * nas funções addOrder_/updateOrder_/deleteOrder_/importOrdens_.
 * ─────────────────────────────────────────
 */

/* ── Nomes das abas ── */
const SH_ORDENS  = 'ordens';
const SH_META    = 'meta';
const SH_LISTAS  = 'listas';

/* Colunas da aba ordens (ordem importa — não mude sem migrar os dados) */
const COLS = [
  'id_os','status','data_abertura','data_inicio','data_fim',
  'prioridade','local','equipamento','tipo_manutencao','executores',
  'solicitante','observacao_abertura','causa_raiz','componente',
  'observacao_fechamento','o_que_feito','o_que_falta','os_origem','pendente'
];

/* ── Ponto de entrada GET ── */
function doGet(e){
  const action = (e && e.parameter && e.parameter.action) || '';
  try {
    let data;
    if(action === 'init')             data = init_();
    else if(action === 'getInitialData') data = getInitialData_();
    else if(action === 'getVersion')     data = getDataVersion_();
    else if(action.startsWith('getMeta'))   data = getMeta_(e.parameter.id);
    else if(action === 'getLists')    data = getLists_();
    else if(action === 'getInactiveLists') data = getInactiveLists_();
    else if(action === 'getAllOrders') data = getAllOrders_();
    else if(action.startsWith('getOrder'))  data = getOrder_(Number(e.parameter.id));
    else throw new Error('Ação GET desconhecida: ' + action);
    return jsonOk_(data);
  } catch(err){
    return jsonErr_(err.message);
  }
}

/* ── Ponto de entrada POST ── */
function doPost(e){
  try {
    const body = JSON.parse(e.postData.contents);
    const { action } = body;
    let data;

    if     (action === 'init')           data = init_();
    else if(action === 'getInitialData') data = getInitialData_();
    else if(action === 'getVersion')     data = getDataVersion_();
    else if(action === 'upsertMeta')     data = upsertMeta_(body.record);
    else if(action === 'setLists')       data = setLists_(body.lists);
    else if(action === 'setInactiveLists') data = setInactiveLists_(body.inactive);
    else if(action === 'addOrder')       data = addOrder_(body.ordem);
    else if(action === 'updateOrder')    data = updateOrder_(body.ordem);
    else if(action === 'deleteOrder')    data = deleteOrder_(body.id);
    else if(action === 'importOrdens')   data = importOrdens_(body.ordens);
    else if(action === 'getMeta')      data = getMeta_(body.id);
    else if(action === 'getLists')     data = getLists_();
    else if(action === 'getInactiveLists') data = getInactiveLists_();
    else if(action === 'getAllOrders') data = getAllOrders_();
    else if(action === 'getOrder')     data = getOrder_(Number(body.id));
    else throw new Error('Ação POST desconhecida: ' + action);

    return jsonOk_(data);
  } catch(err){
    return jsonErr_(err.message);
  }
}

/* ── Helpers de resposta ── */
function jsonOk_(data){
  const out = ContentService.createTextOutput(JSON.stringify({ ok: true, data: data ?? null }));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}
function jsonErr_(msg){
  const out = ContentService.createTextOutput(JSON.stringify({ ok: false, error: msg }));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

/* ── Acesso às abas ── */
function ss_(){ return SpreadsheetApp.getActiveSpreadsheet(); }

function getOrCreateSheet_(name, headers){
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  if(!sh){
    sh = ss.insertSheet(name);
    if(headers && headers.length){
      sh.appendRow(headers);
      sh.setFrozenRows(1);
    }
  }
  return sh;
}

function shOrdens_(){ return getOrCreateSheet_(SH_ORDENS, COLS); }
function shMeta_()  { return getOrCreateSheet_(SH_META,   ['id','value','mode','updated_at']); }
function shListas_(){ return getOrCreateSheet_(SH_LISTAS, ['id','json','updated_at']); }

/* ── Inicialização ── */
function init_(){
  shOrdens_(); shMeta_(); shListas_();
  return true;
}

/*
  ── CACHE de getInitialData_ ──
  O CacheService do Apps Script só aceita até 100KB por chave, e o conjunto
  de dados hoje passa de 700KB — por isso o JSON é dividido em pedaços
  ("chunks") menores e remontado na leitura. Guardamos por CACHE_TTL_SECONDS
  como rede de segurança, mas a atualização real acontece por INVALIDAÇÃO:
  toda escrita (criar/editar/excluir OS, mudar cadastros) limpa o cache na
  hora — então ninguém fica vendo dado desatualizado por causa do cache, só
  evitamos reler a planilha inteira quando NADA mudou (o caso mais comum,
  já que o front-end faz poll a cada 30s mesmo sem nenhuma alteração).
  Qualquer falha no cache (limite excedido, erro do serviço, etc.) cai de
  volta pra ler a planilha normalmente — nunca impede o carregamento.
*/
const DATA_VERSION_KEY = 'pcm_data_version_v2';

function getDataVersion_(){
  const props = PropertiesService.getScriptProperties();
  let version = props.getProperty(DATA_VERSION_KEY);
  if(!version){
    version = String(Date.now());
    props.setProperty(DATA_VERSION_KEY, version);
  }
  return version;
}

function bumpDataVersion_(){
  const version = String(Date.now());
  PropertiesService.getScriptProperties().setProperty(DATA_VERSION_KEY, version);
  return version;
}

/* A versão muda somente depois que o cache antigo foi removido. */
function markInitialDataChanged_(){
  invalidateInitialDataCache_();
  return bumpDataVersion_();
}

const CACHE_PREFIX       = 'initial_data_v2_chunk_';
const CACHE_META_KEY     = 'initial_data_v2_meta';
const CACHE_TTL_SECONDS  = 600;
const CACHE_CHUNK_SIZE   = 20000; /* caracteres por pedaço — margem segura abaixo do limite de 100KB (bytes) do CacheService */

function readInitialDataCache_(){
  try {
    const cache = CacheService.getScriptCache();
    const metaRaw = cache.get(CACHE_META_KEY);
    if(!metaRaw) return null;
    const meta = JSON.parse(metaRaw);
    let json = '';
    for(let i = 0; i < meta.chunks; i++){
      const part = cache.get(CACHE_PREFIX + i);
      if(part == null) return null; /* pedaço expirou/faltando — trata como cache-miss */
      json += part;
    }
    return JSON.parse(json);
  } catch(e){
    return null;
  }
}

function writeInitialDataCache_(data){
  try {
    const json = JSON.stringify(data);
    const cache = CacheService.getScriptCache();
    const chunks = {};
    let count = 0;
    for(let i = 0; i < json.length; i += CACHE_CHUNK_SIZE){
      chunks[CACHE_PREFIX + count] = json.slice(i, i + CACHE_CHUNK_SIZE);
      count++;
    }
    cache.putAll(chunks, CACHE_TTL_SECONDS);
    /* meta é escrito por último — funciona como "commit": se alguém ler o cache
       entre os chunks serem gravados e o meta ser gravado, encontra cache-miss
       (comportamento seguro) em vez de dados parciais. */
    cache.put(CACHE_META_KEY, JSON.stringify({ chunks: count }), CACHE_TTL_SECONDS);
  } catch(e){
    /* Se o cache falhar por qualquer motivo, apenas ignora — não deve derrubar o carregamento normal */
  }
}

function invalidateInitialDataCache_(){
  try {
    const cache = CacheService.getScriptCache();
    const metaRaw = cache.get(CACHE_META_KEY);
    if(metaRaw){
      const meta = JSON.parse(metaRaw);
      for(let i = 0; i < meta.chunks; i++) cache.remove(CACHE_PREFIX + i);
    }
    cache.remove(CACHE_META_KEY);
  } catch(e){}
}

/*
  Devolve init + listas + inativos + ordens numa única execução.
  Substitui, no carregamento da página e no poll, as 4 chamadas separadas
  (init, getLists, getInactiveLists, getAllOrders) por 1 só — reduz o número
  de execuções simultâneas no Apps Script quando várias pessoas usam o
  sistema ao mesmo tempo. Agora também passa pelo cache acima antes de
  tocar a planilha.
*/
function getInitialData_(){
  init_();
  const cached = readInitialDataCache_();
  if(cached) return cached;

  /* Evita que vários usuários reconstruam o mesmo cache ao mesmo tempo. */
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const cachedAfterLock = readInitialDataCache_();
    if(cachedAfterLock) return cachedAfterLock;

    const data = {
      version:       getDataVersion_(),
      lists:         getLists_(),
      inactiveLists: getInactiveLists_(),
      ordens:        getAllOrders_()
    };
    writeInitialDataCache_(data);
    return data;
  } finally {
    lock.releaseLock();
  }
}

/* ── Meta ── */
function getMeta_(id){
  const sh = shMeta_();
  const rows = sh.getDataRange().getValues();
  for(let i = 1; i < rows.length; i++){
    if(String(rows[i][0]) === String(id)){
      return { id: rows[i][0], value: rows[i][1], mode: rows[i][2], updated_at: rows[i][3] };
    }
  }
  return null;
}

function upsertMeta_(record){
  const sh = shMeta_();
  const rows = sh.getDataRange().getValues();
  for(let i = 1; i < rows.length; i++){
    if(String(rows[i][0]) === String(record.id)){
      sh.getRange(i+1, 1, 1, 4).setValues([[
        record.id, record.value, record.mode || '', record.updated_at || ''
      ]]);
      return record;
    }
  }
  sh.appendRow([record.id, record.value, record.mode || '', record.updated_at || '']);
  return record;
}

/* ── Contador de OS (equivale ao next_os_number() do Postgres) ── */
function nextOsNumberUnlocked_(){
  const sh = shMeta_();
  const rows = sh.getDataRange().getValues();
  let rowIdx = -1;
  let current = 0;
  for(let i = 1; i < rows.length; i++){
    if(String(rows[i][0]) === 'os_counter'){
      rowIdx = i + 1;
      current = parseInt(rows[i][1], 10) || 0;
      break;
    }
  }
  const next = current + 1;
  const now  = nowBR_();
  if(rowIdx > 0){
    sh.getRange(rowIdx, 1, 1, 4).setValues([['os_counter', String(next), 'online', now]]);
  } else {
    sh.appendRow(['os_counter', String(next), 'online', now]);
  }
  return next;
}

function nextOsNumber_(){
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    return nextOsNumberUnlocked_();
  } finally {
    lock.releaseLock();
  }
}

/* ── Listas ── */
function getLists_(){
  const sh = shListas_();
  const rows = sh.getDataRange().getValues();
  for(let i = 1; i < rows.length; i++){
    if(rows[i][0] === 'default') return JSON.parse(rows[i][1]);
  }
  return null;
}

function getInactiveLists_(){
  const sh = shListas_();
  const rows = sh.getDataRange().getValues();
  for(let i = 1; i < rows.length; i++){
    if(rows[i][0] === 'inactive') return JSON.parse(rows[i][1]);
  }
  return null;
}

function setLists_(lists){
  upsertLista_('default', lists);
  return true;
}

function setInactiveLists_(inactive){
  upsertLista_('inactive', inactive);
  return true;
}

function upsertLista_(id, obj){
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = shListas_();
    const json = JSON.stringify(obj);
    const now  = nowBR_();
    const rows = sh.getDataRange().getValues();
    for(let i = 1; i < rows.length; i++){
      if(rows[i][0] === id){
        sh.getRange(i+1, 1, 1, 3).setValues([[id, json, now]]);
        markInitialDataChanged_();
        return;
      }
    }
    sh.appendRow([id, json, now]);
    markInitialDataChanged_();
  } finally {
    lock.releaseLock();
  }
}

/* ── Ordens ── */

/* Converte data ISO (2026-04-28T13:41:00.000Z) para formato BR (28/04/2026 13:41) */
function isoToBR_(v){
  if(!v) return '';
  const s = String(v);
  /* Já está no formato BR — não mexe */
  if(/^\d{2}\/\d{2}\/\d{4}/.test(s)) return s;
  /* Tenta converter ISO */
  const d = new Date(s);
  if(isNaN(d.getTime())) return s;
  const pad = n => String(n).padStart(2,'0');
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* Converte linha da planilha em objeto JS */
function rowToOrdem_(row){
  const o = {};
  const dateCols = ['data_abertura','data_inicio','data_fim'];
  COLS.forEach((col, idx) => {
    let v = row[idx];
    if(col === 'executores'){
      try { v = typeof v === 'string' ? JSON.parse(v) : v; } catch(_){ v = []; }
      if(!Array.isArray(v)) v = [];
    } else if(col === 'pendente'){
      v = v === true || v === 'true' || v === 1;
    } else if(col === 'id_os' || col === 'os_origem'){
      v = v === '' || v === null || v === undefined ? (col === 'os_origem' ? null : 0) : Number(v);
    } else if(dateCols.includes(col)){
      v = isoToBR_(v);
    } else {
      v = v ?? '';
    }
    o[col] = v;
  });
  return o;
}

/* Converte objeto JS em linha da planilha */
function ordemToRow_(ordem){
  return COLS.map(col => {
    const v = ordem[col];
    if(col === 'executores') return JSON.stringify(Array.isArray(v) ? v : []);
    if(col === 'pendente')   return v ? 'true' : 'false';
    if(col === 'os_origem')  return v == null ? '' : String(v);
    return v ?? '';
  });
}

function getAllOrders_(){
  const sh = shOrdens_();
  const data = sh.getDataRange().getValues();
  if(data.length <= 1) return [];
  const ordens = [];
  for(let i = data.length - 1; i >= 1; i--){ /* mais recente primeiro */
    ordens.push(rowToOrdem_(data[i]));
  }
  return ordens;
}

function getOrder_(id){
  const sh = shOrdens_();
  const rows = sh.getDataRange().getValues();
  for(let i = 1; i < rows.length; i++){
    if(Number(rows[i][0]) === id) return rowToOrdem_(rows[i]);
  }
  return null;
}

function addOrder_(ordem){
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const id = nextOsNumberUnlocked_();
    ordem.id_os = id;
    shOrdens_().appendRow(ordemToRow_(ordem));
    markInitialDataChanged_();
    return ordem;
  } finally {
    lock.releaseLock();
  }
}

function updateOrder_(ordem){
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh   = shOrdens_();
    const rows = sh.getDataRange().getValues();
    const id   = Number(ordem.id_os);
    for(let i = 1; i < rows.length; i++){
      if(Number(rows[i][0]) === id){
        sh.getRange(i+1, 1, 1, COLS.length).setValues([ordemToRow_(ordem)]);
        markInitialDataChanged_();
        return ordem;
      }
    }
    /* Não encontrou: insere (não deve acontecer em uso normal) */
    sh.appendRow(ordemToRow_(ordem));
    markInitialDataChanged_();
    return ordem;
  } finally {
    lock.releaseLock();
  }
}

function deleteOrder_(id){
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh   = shOrdens_();
    const rows = sh.getDataRange().getValues();
    for(let i = 1; i < rows.length; i++){
      if(Number(rows[i][0]) === id){
        sh.deleteRow(i + 1);
        markInitialDataChanged_();
        return true;
      }
    }
    return false;
  } finally {
    lock.releaseLock();
  }
}

/* Importa um lote de OS (usado pelo importBackup) */
function importOrdens_(ordens){
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh   = shOrdens_();
    const rows = sh.getDataRange().getValues();

    /* Índice dos ids já existentes → número de linha (1-based) */
    const idxMap = {};
    for(let i = 1; i < rows.length; i++){
      idxMap[Number(rows[i][0])] = i + 1;
    }

    /* Sincroniza o contador com o maior id_os do backup */
    let maxId = 0;
    ordens.forEach(o => { if(Number(o.id_os) > maxId) maxId = Number(o.id_os); });
    if(maxId > 0){
      const sh2  = shMeta_();
      const rows2 = sh2.getDataRange().getValues();
      let rowIdx = -1;
      let current = 0;
      for(let i = 1; i < rows2.length; i++){
        if(rows2[i][0] === 'os_counter'){ rowIdx = i+1; current = parseInt(rows2[i][1],10)||0; break; }
      }
      if(maxId > current){
        const now = nowBR_();
        if(rowIdx > 0) sh2.getRange(rowIdx,1,1,4).setValues([['os_counter',String(maxId),'online',now]]);
        else sh2.appendRow(['os_counter',String(maxId),'online',now]);
      }
    }

    ordens.forEach(ordem => {
      const id   = Number(ordem.id_os);
      const row  = ordemToRow_(ordem);
      if(idxMap[id]){
        sh.getRange(idxMap[id], 1, 1, COLS.length).setValues([row]);
      } else {
        sh.appendRow(row);
      }
    });
    markInitialDataChanged_();
    return true;
  } finally {
    lock.releaseLock();
  }
}

/* ── Utilitário de data/hora no formato brasileiro ── */
function nowBR_(){
  const d = new Date();
  const p = n => String(n).padStart(2,'0');
  return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}