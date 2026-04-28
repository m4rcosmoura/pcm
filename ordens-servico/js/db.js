/* ─────────────────────────────────────────
   db.js — camada de acesso ao banco de dados
   Hoje usa Supabase via REST API.
   Para trocar de banco no futuro, basta reescrever este arquivo.
   O resto da aplicação não precisa mudar.
   Idealizado e desenvolvido por Marcos Moura
───────────────────────────────────────── */

/* Lê as credenciais do config.js carregado antes deste arquivo */
const SUPABASE_URL =
  (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL) ||
  (typeof window.SUPABASE_URL !== 'undefined' ? window.SUPABASE_URL : '') ||
  '';

const SUPABASE_ANON_KEY =
  (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_ANON_KEY) ||
  (typeof window.SUPABASE_ANON_KEY !== 'undefined' ? window.SUPABASE_ANON_KEY : '') ||
  '';

/* Nome do canal usado para avisar outras abas quando os dados mudam */
const CHANNEL_NAME = 'pcm_operador_channel';

/* Tag que identifica a versão da estrutura do banco — muda se o schema mudar */
const STRUCTURE_TAG = 'base_online_supabase_v1';

/* Intervalo de polling: a cada 4 segundos busca atualizações do banco */
const POLL_INTERVAL_MS = 4000;

/*
  BroadcastChannel permite que duas abas do mesmo browser se comuniquem.
  Quando uma aba salva uma OS, ela avisa as outras para recarregar.
  O `typeof` protege caso o browser não suporte (ex: Safari antigo).
*/
const channel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel(CHANNEL_NAME)
  : null;

/* ── helpers internos ── */

/*
  As funções nowBR, parseBR, elapsedHHMM, escapeHtml e priorityClass
  já estão disponíveis globalmente via utils.js — não precisam ser redeclaradas.
*/

/*
  Faz uma cópia profunda do objeto para evitar que alterações externas
  modifiquem os dados antes de serem enviados ao banco.
*/
function structured(v){
  return JSON.parse(JSON.stringify(v));
}

/* ── listas padrão ── */

/*
  Valores iniciais das listas de seleção do sistema.
  São gravados no banco na primeira vez que o sistema é iniciado.
  Depois disso, o usuário pode editar pelo painel de cadastros.
*/
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
  executores: [],  /* preenchido pelo painel de cadastros */
  solicitante: [] /* preenchido pelo painel de cadastros */
};

/*
  Estrutura padrão para listas inativas.
  Cada chave é um array de valores que estão desativados.
  Itens inativos não aparecem nos dropdowns, mas o histórico é preservado.
*/
const DEFAULT_INACTIVE = {
  local: [],
  equipamento: [],
  componente: [],
  executores: [],
  tipo_manutencao: [],
  solicitante: []
};

/* ── infraestrutura HTTP ── */

/* Lança um erro claro se o config.js não foi preenchido */
function requireConfig(){
  if(!SUPABASE_URL || !SUPABASE_ANON_KEY){
    throw new Error('Configuração ausente. Preencha o arquivo config/config.js.');
  }
}

/* Monta os headers padrão para todas as requisições ao Supabase */
function baseHeaders(extra = {}){
  return { 'apikey': SUPABASE_ANON_KEY, ...extra };
}

/*
  Lê o corpo da resposta HTTP e trata erros.
  Retorna os dados parseados ou lança um erro com a mensagem do servidor.
*/
async function parseResponse(res){
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch(_) { data = text; }
  if(!res.ok){
    const message = data && data.message ? data.message : `Erro HTTP ${res.status}`;
    throw new Error(message);
  }
  return data;
}

/*
  Faz uma requisição REST ao Supabase.
  `path` é o endpoint (ex: "ordens?id_os=eq.5&select=*")
  `options` aceita method, headers e body.
*/
async function rest(path, options = {}){
  requireConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: options.method || 'GET',
    headers: baseHeaders(options.headers || {}),
    body: options.body
  });
  return parseResponse(res);
}

/*
  Chama uma função armazenada no banco (Postgres function via RPC).
  Usado para operações que precisam de lógica no servidor,
  como gerar o próximo número de OS de forma segura.
*/
async function rpc(name, payload = {}){
  requireConfig();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: baseHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  });
  return parseResponse(res);
}

/* ── inicialização ── */

/*
  Ponto de entrada do banco. Chamado uma vez ao abrir a página.
  Garante que a estrutura e as listas padrão existam no banco.
*/
async function initDB(){
  requireConfig();
  await ensureStructure();
  await ensureLists();
}

/*
  Verifica se a versão da estrutura do banco está atualizada.
  Se o STRUCTURE_TAG mudou, atualiza o registro no banco.
  Útil para detectar quando uma migração precisa ser aplicada.
*/
async function ensureStructure(){
  const structure = await getMetaRecord('structure_version');
  if(!structure){
    await upsertMeta({ id: 'structure_version', value: STRUCTURE_TAG, updated_at: nowBR(), mode: 'online' });
  } else if(structure.value !== STRUCTURE_TAG){
    await upsertMeta({ ...structure, value: STRUCTURE_TAG, updated_at: nowBR(), mode: 'online' });
  }
}

/*
  Garante que as listas padrão existam no banco.
  Só insere se ainda não houver nenhum registro — nunca sobrescreve edições do usuário.
*/
async function ensureLists(){
  const rec = await getListRecord();
  if(!rec){
    await rest('listas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify({ id: 'default', lists: structured(DEFAULT_LISTS), updated_at: nowBR() })
    });
  }
  /* Garante que o registro de inativos também existe */
  const inactiveRec = await getInactiveRecord();
  if(!inactiveRec){
    await rest('listas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates' },
      body: JSON.stringify({ id: 'inactive', lists: structured(DEFAULT_INACTIVE), updated_at: nowBR() })
    });
  }
}

/* ── meta ── */

/* Busca um registro da tabela `meta` pelo id. Retorna null se não existir. */
async function getMetaRecord(id){
  const rows = await rest(`meta?id=eq.${encodeURIComponent(id)}&select=*`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/* Insere ou atualiza um registro na tabela `meta` (upsert). */
async function upsertMeta(record){
  const rows = await rest('meta', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(record)
  });
  return rows && rows[0] ? rows[0] : null;
}

/* ── listas ── */

/* Busca o registro único de listas do banco. Retorna null se não existir. */
async function getListRecord(){
  const rows = await rest('listas?id=eq.default&select=*');
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/* Busca o registro de listas inativas. Retorna null se não existir. */
async function getInactiveRecord(){
  const rows = await rest('listas?id=eq.inactive&select=*');
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/*
  Retorna as listas de seleção do banco (local, equipamento, executores, etc.).
  Se o banco não tiver o registro ainda, retorna os DEFAULT_LISTS como fallback.
*/
async function getLists(){
  const rec = await getListRecord();
  return structured(rec?.lists || DEFAULT_LISTS);
}

/*
  Retorna o objeto de listas inativas.
  Cada chave é um array de valores desativados.
*/
async function getInactiveLists(){
  const rec = await getInactiveRecord();
  return structured(rec?.lists || DEFAULT_INACTIVE);
}

/*
  Salva as listas no banco e notifica outras abas para recarregar.
  Chamado pelo painel de cadastros ao adicionar ou remover itens.
*/
async function setLists(lists){
  const rows = await rest('listas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'default', lists: structured(lists), updated_at: nowBR() })
  });
  notifyChange();
  return rows && rows[0] ? rows[0] : null;
}

/*
  Salva as listas inativas no banco e notifica outras abas.
  Chamado pelo painel de cadastros ao ativar/desativar um item.
*/
async function setInactiveLists(inactive){
  const rows = await rest('listas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({ id: 'inactive', lists: structured(inactive), updated_at: nowBR() })
  });
  notifyChange();
  return rows && rows[0] ? rows[0] : null;
}

/*
  Alterna o estado ativo/inativo de um item de uma lista.
  `listKey`: chave da lista (ex: 'local', 'equipamento', 'executores')
  `value`: valor do item a ser alternado
  Retorna o novo objeto de inativas atualizado.
*/
async function toggleInactiveItem(listKey, value){
  const inactive = await getInactiveLists();
  if(!inactive[listKey]) inactive[listKey] = [];
  const idx = inactive[listKey].findIndex(
    v => String(v).trim().toUpperCase() === String(value).trim().toUpperCase()
  );
  if(idx >= 0){
    inactive[listKey].splice(idx, 1); /* reativa */
  } else {
    inactive[listKey].push(value);    /* desativa */
  }
  await setInactiveLists(inactive);
  return inactive;
}

/* ── ordens de serviço ── */

/* Retorna todas as OS ordenadas da mais recente para a mais antiga. */
async function getAllOrders(){
  const rows = await rest('ordens?select=*&order=id_os.desc');
  return Array.isArray(rows) ? rows : [];
}

/* Busca uma OS específica pelo id. Retorna null se não existir. */
async function getOrder(id){
  const rows = await rest(`ordens?id_os=eq.${Number(id)}&select=*`);
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/*
  Cria uma nova OS no banco.
  O número da OS é gerado pelo banco via RPC para evitar duplicatas
  quando duas abas tentam criar uma OS ao mesmo tempo.
  `silent=true` suprime o notifyChange — usado no importBackup para não
  disparar um evento por OS importada.
*/
async function addOrder(data, silent = false){
  const next = await rpc('next_os_number');
  const ordem = {
    id_os:                Number(next),
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
    os_origem:            data.os_origem || null, /* id da OS que originou esta, se for continuação */
    pendente:             !!data.pendente          /* true quando criada como continuação de turno */
  };
  const rows = await rest('ordens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify(ordem)
  });
  if(!silent) notifyChange();
  return rows && rows[0] ? rows[0] : ordem;
}

/*
  Atualiza qualquer campo de uma OS existente.
  `silent=true` suprime o notifyChange — usado internamente pelo finishOrder
  para evitar dois eventos seguidos.
*/
async function updateOrder(ordem, silent = false){
  const rows = await rest(`ordens?id_os=eq.${Number(ordem.id_os)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
    body: JSON.stringify(structured(ordem))
  });
  if(!silent) notifyChange();
  return rows && rows[0] ? rows[0] : ordem;
}

/*
  Muda o status da OS para ANDAMENTO e registra a data/hora de início.
  Se `dataInicio` não for informado, usa o momento atual.
*/
async function startOrder(id, dataInicio){
  const ordem = await getOrder(id);
  if(!ordem) throw new Error('OS não encontrada.');
  ordem.status      = 'ANDAMENTO';
  ordem.data_inicio = dataInicio || nowBR();
  return updateOrder(ordem);
}

/*
  Finaliza uma OS preenchendo os campos de encerramento.
  `payload` pode conter: status, data_fim, causa_raiz, componente,
  observacao_fechamento, o_que_feito, o_que_falta, pendente, os_origem.
  Campos não informados no payload mantêm o valor que já estava na OS.
*/
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

/* Remove uma OS permanentemente do banco. Ação irreversível. */
async function deleteOrder(id){
  await rest(`ordens?id_os=eq.${Number(id)}`, { method: 'DELETE' });
  notifyChange();
}

/* ── backup ── */

/*
  Exporta todos os dados do sistema em um objeto JSON:
  listas + ordens + metadados de versão e data de exportação.
  Usado para gerar o arquivo de backup pelo painel do PCM.
*/
async function exportBackup(){
  return {
    exported_at: nowBR(),
    structure:   STRUCTURE_TAG,
    lists:       await getLists(),
    inactive:    await getInactiveLists(),
    ordens:      await getAllOrders()
  };
}

/*
  Importa um backup gerado pelo exportBackup.
  Para cada OS: atualiza se já existir, insere se não existir.
  Só dispara um notifyChange ao final, não um por OS — por isso usa silent=true.
*/
async function importBackup(backup){
  if(backup?.lists) await setLists(backup.lists);
  if(backup?.inactive) await setInactiveLists(backup.inactive);
  if(Array.isArray(backup?.ordens)){
    for(const ordem of backup.ordens){
      const exists = await getOrder(ordem.id_os);
      if(exists){
        await updateOrder(ordem, true);
      } else {
        await rest('ordens', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
          body: JSON.stringify(ordem)
        });
      }
    }
    notifyChange();
  }
}

/* ── sincronização ── */

/*
  Avisa outras abas abertas do sistema que os dados mudaram.
  As outras abas escutam esse evento e recarregam automaticamente.
  O try/catch protege caso o canal tenha sido fechado.
*/
function notifyChange(){
  if(channel){
    try { channel.postMessage({ type: 'changed', at: Date.now() }); } catch(_) {}
  }
}

/*
  Registra um callback que será chamado sempre que os dados mudarem,
  seja por outra aba (BroadcastChannel) ou pelo polling periódico.
  Retorna um objeto `ctrl` com pause() e resume() — usado para parar
  o polling enquanto um modal está aberto e evitar atualizações inesperadas.
*/
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
  /* Polling como fallback: garante sincronização mesmo sem BroadcastChannel */
  setInterval(() => { if(!ctrl._paused) cb?.(); }, POLL_INTERVAL_MS);
  return ctrl;
}

/* ── API pública ── */

/*
  Tudo que os HTMLs precisam está aqui.
  Nada além deste objeto deve ser acessado diretamente de fora deste arquivo.
*/
window.PCMDB = {
  initDB,
  getLists, setLists,
  getInactiveLists, setInactiveLists, toggleInactiveItem,
  getAllOrders, getOrder, addOrder, updateOrder, startOrder, finishOrder, deleteOrder,
  exportBackup, importBackup,
  notifyChange, onExternalChange,
  subscribeChanges: onExternalChange, /* alias mantido por compatibilidade */
  nowBR, elapsedHHMM, escapeHtml, priorityClass
};
