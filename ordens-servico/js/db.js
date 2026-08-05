/* ─────────────────────────────────────────
   db.js — camada de acesso ao Supabase
   Banco: PostgreSQL + Realtime + Auth

   Estratégia:
   1. Uma única chamada RPC carrega listas, inativos, versão e todas as OS.
   2. Não existe polling completo a cada 30 segundos.
   3. Realtime avisa quando o banco muda.
   4. Ao voltar para uma aba adormecida, uma versão pequena é conferida.
   5. A última carga válida permanece salva no navegador como contingência.
───────────────────────────────────────── */

const SUPABASE_URL =
  (window.APP_CONFIG && window.APP_CONFIG.SUPABASE_URL) || '';
const SUPABASE_KEY =
  (window.APP_CONFIG && (
    window.APP_CONFIG.SUPABASE_PUBLISHABLE_KEY ||
    window.APP_CONFIG.SUPABASE_ANON_KEY
  )) || '';

const CHANNEL_NAME = 'pcm_operador_channel';
const STRUCTURE_TAG = 'supabase_postgres_v1';
const LOCAL_INITIAL_DATA_KEY = 'pcm_initial_data_cache_supabase_v1';
const ORDER_FIELDS = [
  'id_os','status','data_abertura','data_inicio','data_fim','prioridade',
  'local','equipamento','tipo_manutencao','executores','solicitante',
  'observacao_abertura','causa_raiz','componente','observacao_fechamento',
  'o_que_feito','o_que_falta','os_origem','pendente'
];

const browserChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel(CHANNEL_NAME)
  : null;

let client = null;
let sessionPromise = null;
let loginPromise = null;
let latestInitialData = null;

function structured(value){
  return JSON.parse(JSON.stringify(value));
}

function requireConfig(){
  if(!window.supabase || typeof window.supabase.createClient !== 'function'){
    throw new Error('Biblioteca do Supabase não foi carregada. Verifique sua conexão com a internet.');
  }
  if(!SUPABASE_URL || !SUPABASE_KEY || SUPABASE_URL.includes('COLE_') || SUPABASE_KEY.includes('COLE_')){
    throw new Error('Preencha SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY em config/config.js.');
  }
}

function getClient(){
  requireConfig();
  if(!client){
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: { eventsPerSecond: 10 }
      }
    });

    client.auth.onAuthStateChange((event) => {
      if(event === 'SIGNED_OUT'){
        latestInitialData = null;
        try { localStorage.removeItem(LOCAL_INITIAL_DATA_KEY); } catch(_) {}
        if(document.readyState !== 'loading') window.location.reload();
      }
    });
  }
  return client;
}

function ensureLogoutButton(){
  if(document.getElementById('pcmLogoutButton')) return;
  const button = document.createElement('button');
  button.id = 'pcmLogoutButton';
  button.type = 'button';
  button.textContent = 'Sair';
  button.title = 'Encerrar sessão do Supabase';
  button.style.cssText = [
    'position:fixed','right:12px','bottom:12px','z-index:9998',
    'border:1px solid rgba(127,127,127,.45)','border-radius:8px',
    'padding:7px 11px','background:rgba(20,20,20,.82)','color:#fff',
    'font:600 12px system-ui,sans-serif','cursor:pointer','backdrop-filter:blur(5px)'
  ].join(';');
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await getClient().auth.signOut(); }
    finally { button.disabled = false; }
  });
  document.body.appendChild(button);
}

function showLogin(){
  if(loginPromise) return loginPromise;

  loginPromise = new Promise((resolve, reject) => {
    const overlay = document.createElement('div');
    overlay.id = 'pcmSupabaseLogin';
    overlay.style.cssText = [
      'position:fixed','inset:0','z-index:100000','display:flex',
      'align-items:center','justify-content:center','padding:20px',
      'background:rgba(8,15,24,.78)','backdrop-filter:blur(7px)'
    ].join(';');

    overlay.innerHTML = `
      <form style="width:min(390px,100%);background:#fff;color:#18212c;border-radius:16px;padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.38);font-family:system-ui,sans-serif">
        <h2 style="margin:0 0 6px;font-size:22px">Acesso ao sistema</h2>
        <p style="margin:0 0 18px;color:#5b6775;font-size:14px;line-height:1.45">Entre com o usuário criado no Supabase.</p>
        <label style="display:block;margin-bottom:12px;font-size:13px;font-weight:700">E-mail
          <input name="email" type="email" autocomplete="username" required style="box-sizing:border-box;width:100%;margin-top:6px;padding:11px 12px;border:1px solid #cbd3dc;border-radius:9px;font-size:15px">
        </label>
        <label style="display:block;margin-bottom:14px;font-size:13px;font-weight:700">Senha
          <input name="password" type="password" autocomplete="current-password" required minlength="6" style="box-sizing:border-box;width:100%;margin-top:6px;padding:11px 12px;border:1px solid #cbd3dc;border-radius:9px;font-size:15px">
        </label>
        <div data-error style="display:none;margin-bottom:12px;padding:9px 11px;border-radius:8px;background:#fee2e2;color:#b91c1c;font-size:13px;line-height:1.4"></div>
        <button type="submit" style="width:100%;border:0;border-radius:9px;padding:11px 14px;background:#185fa5;color:#fff;font-size:15px;font-weight:800;cursor:pointer">Entrar</button>
        <p style="margin:13px 0 0;color:#6b7280;font-size:12px;text-align:center">A criação de usuários é feita pelo administrador.</p>
      </form>`;

    const form = overlay.querySelector('form');
    const errorBox = overlay.querySelector('[data-error]');
    const submit = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      errorBox.style.display = 'none';
      submit.disabled = true;
      submit.textContent = 'Entrando...';
      const fd = new FormData(form);
      try {
        const { data, error } = await getClient().auth.signInWithPassword({
          email: String(fd.get('email') || '').trim(),
          password: String(fd.get('password') || '')
        });
        if(error) throw error;
        if(!data.session) throw new Error('O Supabase não retornou uma sessão válida.');
        overlay.remove();
        ensureLogoutButton();
        resolve(data.session);
      } catch(err){
        errorBox.textContent = err?.message || 'Não foi possível entrar.';
        errorBox.style.display = 'block';
      } finally {
        submit.disabled = false;
        submit.textContent = 'Entrar';
      }
    });

    document.body.appendChild(overlay);
    setTimeout(() => overlay.querySelector('input[name="email"]')?.focus(), 0);
  }).finally(() => { loginPromise = null; });

  return loginPromise;
}

async function ensureSession(){
  if(sessionPromise) return sessionPromise;
  sessionPromise = (async () => {
    const sb = getClient();
    const { data, error } = await sb.auth.getSession();
    if(error) throw error;
    if(data.session){
      ensureLogoutButton();
      return data.session;
    }
    return showLogin();
  })().finally(() => { sessionPromise = null; });
  return sessionPromise;
}

function friendlyError(error, operation){
  if(!error) return new Error(`Falha em ${operation}.`);
  const msg = String(error.message || error);
  if(/JWT|session|not authenticated/i.test(msg)){
    return new Error('Sua sessão expirou. Entre novamente.');
  }
  if(/row-level security|permission denied/i.test(msg)){
    return new Error('Seu usuário não tem permissão para executar esta operação.');
  }
  if(/Failed to fetch|NetworkError|fetch/i.test(msg)){
    return new Error('Não foi possível alcançar o Supabase. Verifique a internet.');
  }
  return new Error(`${operation}: ${msg}`);
}

function normalizeLists(value){
  const incoming = value && typeof value === 'object' ? value : {};
  const merged = { ...structured(DEFAULT_LISTS), ...structured(incoming) };
  merged.operador_especialidade = {
    ...(DEFAULT_LISTS.operador_especialidade || {}),
    ...(incoming.operador_especialidade || {})
  };
  return merged;
}

function normalizeInactive(value){
  const incoming = value && typeof value === 'object' ? value : {};
  return { ...structured(DEFAULT_INACTIVE), ...structured(incoming) };
}

function normalizeOrder(row){
  if(!row) return null;
  const out = {};
  ORDER_FIELDS.forEach((field) => {
    let value = row[field];
    if(field === 'executores') value = Array.isArray(value) ? value : [];
    else if(field === 'pendente') value = !!value;
    else if(field === 'id_os') value = Number(value || 0);
    else if(field === 'os_origem') value = value == null || value === '' ? null : Number(value);
    else value = value ?? '';
    out[field] = value;
  });
  return out;
}

function normalizeInitialData(data){
  const raw = Array.isArray(data) && data.length === 1 ? data[0] : data;
  const normalized = {
    version: String(raw?.version ?? ''),
    lists: normalizeLists(raw?.lists),
    inactiveLists: normalizeInactive(raw?.inactiveLists),
    ordens: Array.isArray(raw?.ordens) ? raw.ordens.map(normalizeOrder) : []
  };
  latestInitialData = structured(normalized);
  return normalized;
}

function sanitizeOrder(input, includeId = false){
  const clean = {};
  ORDER_FIELDS.forEach((field) => {
    if(field === 'id_os' && !includeId) return;
    if(!(field in input)) return;

    let value = input[field];

    if(field === 'executores'){
      clean[field] = Array.isArray(value) ? value : [];
      return;
    }

    if(field === 'pendente'){
      clean[field] = !!value;
      return;
    }

    /* bigint aceita número ou NULL, nunca string vazia. */
    if(field === 'os_origem'){
      if(value == null || value === ''){
        clean[field] = null;
      } else {
        const parsed = Number(value);
        clean[field] = Number.isFinite(parsed) ? parsed : null;
      }
      return;
    }

    if(field === 'id_os'){
      const parsed = Number(value);
      if(Number.isFinite(parsed)) clean[field] = parsed;
      return;
    }

    clean[field] = value ?? '';
  });
  return clean;
}

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
  solicitante: [],
  especialidade: ['MECANICA','ELETRICA','REFRIGERACAO'],
  /* Mapa nome do operador -> especialidade. Chaves usam o mesmo texto salvo em `executores`. */
  operador_especialidade: {}
};

const DEFAULT_INACTIVE = {
  local: [], equipamento: [], componente: [],
  executores: [], tipo_manutencao: [], solicitante: [],
  especialidade: []
};

/* ── inicialização e carga consolidada ── */

async function initDB(){
  await ensureSession();
  return true;
}

async function getInitialData(){
  await ensureSession();
  const { data, error } = await getClient().rpc('pcm_get_initial_data');
  if(error) throw friendlyError(error, 'carregar os dados');
  return normalizeInitialData(data);
}

async function getDataVersion(){
  await ensureSession();
  const { data, error } = await getClient()
    .from('pcm_state')
    .select('version')
    .eq('id', 1)
    .single();
  if(error) throw friendlyError(error, 'consultar a versão dos dados');
  return String(data?.version ?? '');
}

async function healthCheck(){
  const version = await getDataVersion();
  return { status: 'ok', version, serverTime: new Date().toISOString() };
}

function saveCachedInitialData(data){
  try {
    localStorage.setItem(LOCAL_INITIAL_DATA_KEY, JSON.stringify(data));
    latestInitialData = structured(data);
    return true;
  } catch(err){
    console.warn('Não foi possível salvar o cache local:', err);
    return false;
  }
}

function getCachedInitialData(){
  try {
    if(latestInitialData) return structured(latestInitialData);
    const raw = localStorage.getItem(LOCAL_INITIAL_DATA_KEY);
    if(!raw) return null;
    return normalizeInitialData(JSON.parse(raw));
  } catch(err){
    console.warn('Não foi possível ler o cache local:', err);
    return null;
  }
}

/* ── metadados ── */

async function getMetaRecord(id){
  await ensureSession();
  const { data, error } = await getClient()
    .from('meta')
    .select('id,value,mode,updated_at')
    .eq('id', String(id))
    .maybeSingle();
  if(error) throw friendlyError(error, 'consultar metadados');
  return data || null;
}

async function upsertMeta(record){
  await ensureSession();
  const payload = {
    id: String(record.id),
    value: record.value ?? '',
    mode: record.mode || ''
  };
  const { data, error } = await getClient()
    .from('meta')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();
  if(error) throw friendlyError(error, 'salvar metadados');
  return data;
}

/* ── listas ── */

async function readConfiguration(id){
  await ensureSession();
  const { data, error } = await getClient()
    .from('configuracoes')
    .select('data')
    .eq('id', id)
    .maybeSingle();
  if(error) throw friendlyError(error, `carregar configuração ${id}`);
  return data?.data || null;
}

async function getLists(){
  if(latestInitialData?.lists) return structured(latestInitialData.lists);
  return normalizeLists(await readConfiguration('default'));
}

async function getInactiveLists(){
  if(latestInitialData?.inactiveLists) return structured(latestInitialData.inactiveLists);
  return normalizeInactive(await readConfiguration('inactive'));
}

async function writeConfiguration(id, value){
  await ensureSession();
  const { error } = await getClient()
    .from('configuracoes')
    .upsert({ id, data: structured(value) }, { onConflict: 'id' });
  if(error) throw friendlyError(error, `salvar configuração ${id}`);
}

async function setLists(lists){
  await writeConfiguration('default', lists);
  if(latestInitialData) latestInitialData.lists = normalizeLists(lists);
  notifyChange();
  return true;
}

async function setInactiveLists(inactive){
  await writeConfiguration('inactive', inactive);
  if(latestInitialData) latestInitialData.inactiveLists = normalizeInactive(inactive);
  notifyChange();
  return true;
}

async function toggleInactiveItem(listKey, value){
  const inactive = await getInactiveLists();
  if(!Array.isArray(inactive[listKey])) inactive[listKey] = [];
  const idx = inactive[listKey].findIndex(
    item => String(item).trim().toUpperCase() === String(value).trim().toUpperCase()
  );
  if(idx >= 0) inactive[listKey].splice(idx, 1);
  else inactive[listKey].push(value);
  await setInactiveLists(inactive);
  return inactive;
}

/* ── ordens de serviço ── */

async function getAllOrders(){
  const data = await getInitialData();
  return data.ordens;
}

async function getOrder(id){
  await ensureSession();
  const { data, error } = await getClient()
    .from('ordens')
    .select(ORDER_FIELDS.join(','))
    .eq('id_os', Number(id))
    .maybeSingle();
  if(error) throw friendlyError(error, 'consultar a OS');
  return normalizeOrder(data);
}

async function addOrder(data, silent = false){
  await ensureSession();
  const ordem = sanitizeOrder({
    status: 'ABERTA',
    data_abertura: data.data_abertura || nowBR(),
    data_inicio: '',
    data_fim: '',
    prioridade: data.prioridade,
    local: data.local,
    equipamento: data.equipamento,
    tipo_manutencao: data.tipo_manutencao,
    executores: data.executores || [],
    solicitante: data.solicitante,
    observacao_abertura: data.observacao_abertura || '',
    causa_raiz: '',
    componente: data.componente || '',
    observacao_fechamento: '',
    o_que_feito: data.o_que_feito || '',
    o_que_falta: data.o_que_falta || '',
    os_origem: data.os_origem || null,
    pendente: !!data.pendente
  });

  const { data: inserted, error } = await getClient()
    .from('ordens')
    .insert(ordem)
    .select(ORDER_FIELDS.join(','))
    .single();
  if(error) throw friendlyError(error, 'criar a OS');
  if(!silent) notifyChange();
  return normalizeOrder(inserted);
}

async function updateOrder(ordem, silent = false){
  await ensureSession();
  const id = Number(ordem.id_os);
  if(!id) throw new Error('ID da OS inválido.');
  const payload = sanitizeOrder(ordem, false);
  delete payload.id_os;

  const { data, error } = await getClient()
    .from('ordens')
    .update(payload)
    .eq('id_os', id)
    .select(ORDER_FIELDS.join(','))
    .single();
  if(error) throw friendlyError(error, 'atualizar a OS');
  if(!silent) notifyChange();
  return normalizeOrder(data);
}

async function startOrder(id, dataInicio){
  const ordem = await getOrder(id);
  if(!ordem) throw new Error('OS não encontrada.');
  ordem.status = 'ANDAMENTO';
  ordem.data_inicio = dataInicio || nowBR();
  return updateOrder(ordem);
}

async function finishOrder(id, payload = {}){
  const ordem = await getOrder(id);
  if(!ordem) throw new Error('OS não encontrada.');
  ordem.status = payload.status || 'FINALIZADA';
  ordem.data_fim = payload.data_fim || nowBR();
  ordem.causa_raiz = payload.causa_raiz || ordem.causa_raiz || '';
  ordem.componente = payload.componente || ordem.componente || '';
  ordem.observacao_fechamento = payload.observacao_fechamento || ordem.observacao_fechamento || '';
  ordem.o_que_feito = payload.o_que_feito || ordem.o_que_feito || '';
  ordem.o_que_falta = payload.o_que_falta || ordem.o_que_falta || '';
  ordem.pendente = !!payload.pendente;
  ordem.os_origem = payload.os_origem || ordem.os_origem || null;
  if(payload.data_inicio) ordem.data_inicio = payload.data_inicio;
  return updateOrder(ordem);
}

async function deleteOrder(id){
  await ensureSession();
  const { error } = await getClient()
    .from('ordens')
    .delete()
    .eq('id_os', Number(id));
  if(error) throw friendlyError(error, 'excluir a OS');
  notifyChange();
  return true;
}

/* ── backup e migração ── */

async function exportBackup(){
  const data = await getInitialData();
  return {
    exported_at: nowBR(),
    structure: STRUCTURE_TAG,
    lists: data.lists,
    inactive: data.inactiveLists,
    ordens: data.ordens
  };
}

async function importBackup(backup){
  await ensureSession();
  if(!backup || !Array.isArray(backup.ordens)){
    throw new Error('Backup inválido: a lista de ordens não foi encontrada.');
  }
  const { data, error } = await getClient().rpc('pcm_import_backup', {
    p_backup: backup
  });
  if(error) throw friendlyError(error, 'importar o backup');
  latestInitialData = null;
  notifyChange();
  return data;
}

/* ── Realtime e sincronização ── */

function notifyChange(){
  if(browserChannel){
    try { browserChannel.postMessage({ type: 'changed', at: Date.now() }); } catch(_) {}
  }
}

function onExternalChange(callback){
  const ctrl = {
    _modalPaused: false,
    _hidden: typeof document !== 'undefined' && document.visibilityState === 'hidden',
    _running: false,
    _pending: false,
    _stopped: false,
    _realtimeChannel: null,
    _debounceTimer: null,
    pause(){ this._modalPaused = true; },
    resume(){
      const wasPaused = this._modalPaused;
      this._modalPaused = false;
      if(wasPaused) schedule();
    },
    stop(){
      this._stopped = true;
      clearTimeout(this._debounceTimer);
      if(this._realtimeChannel && client){
        client.removeChannel(this._realtimeChannel).catch(() => {});
      }
      if(typeof document !== 'undefined'){
        document.removeEventListener('visibilitychange', onVisibility);
      }
    }
  };

  const shouldWait = () => ctrl._stopped || ctrl._modalPaused || ctrl._hidden;

  const execute = async () => {
    if(shouldWait()) return;
    if(ctrl._running){
      ctrl._pending = true;
      return;
    }
    ctrl._running = true;
    try {
      await callback?.();
    } catch(err){
      console.error('Falha na sincronização Realtime:', err);
    } finally {
      ctrl._running = false;
      if(ctrl._pending && !shouldWait()){
        ctrl._pending = false;
        schedule();
      }
    }
  };

  const schedule = () => {
    if(shouldWait()) return;
    clearTimeout(ctrl._debounceTimer);
    ctrl._debounceTimer = setTimeout(execute, 350);
  };

  const onVisibility = () => {
    const wasHidden = ctrl._hidden;
    ctrl._hidden = document.visibilityState === 'hidden';
    if(wasHidden && !ctrl._hidden && !ctrl._modalPaused) schedule();
  };

  if(browserChannel){
    browserChannel.onmessage = (event) => {
      if(event?.data?.type === 'changed') schedule();
    };
  }

  if(typeof document !== 'undefined'){
    document.addEventListener('visibilitychange', onVisibility);
  }

  (async () => {
    try {
      await ensureSession();
      if(ctrl._stopped) return;
      let subscribedOnce = false;
      ctrl._realtimeChannel = getClient()
        .channel(`pcm-state-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'pcm_state',
          filter: 'id=eq.1'
        }, schedule)
        .subscribe((status) => {
          if(status === 'SUBSCRIBED'){
            if(subscribedOnce) schedule();
            subscribedOnce = true;
          }
          if(status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'){
            console.warn('Realtime temporariamente indisponível:', status);
          }
        });
    } catch(err){
      console.error('Não foi possível iniciar o Realtime:', err);
    }
  })();

  return ctrl;
}

async function logout(){
  await getClient().auth.signOut();
}

window.PCMDB = {
  initDB, getInitialData, getDataVersion, healthCheck,
  saveCachedInitialData, getCachedInitialData,
  getMetaRecord, upsertMeta,
  getLists, setLists,
  getInactiveLists, setInactiveLists, toggleInactiveItem,
  getAllOrders, getOrder, addOrder, updateOrder, startOrder, finishOrder, deleteOrder,
  exportBackup, importBackup,
  notifyChange, onExternalChange, subscribeChanges: onExternalChange,
  logout,
  nowBR, elapsedHHMM, escapeHtml, priorityClass
};
