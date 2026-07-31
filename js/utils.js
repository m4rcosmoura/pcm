/* ─────────────────────────────────────────
   utils.js — funções auxiliares gerais
   Usadas tanto pelo db.js quanto pelos HTMLs.
   Idealizado e desenvolvido por Marcos Moura
───────────────────────────────────────── */

/* Garante que um número sempre tenha 2 dígitos. Ex: 7 → "07" */
function pad2(n){
  return String(n).padStart(2, '0');
}

/* Retorna a data e hora atual no formato brasileiro: "DD/MM/AAAA HH:MM" */
function nowBR(){
  const d = new Date();
  return `${pad2(d.getDate())}/${pad2(d.getMonth()+1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/*
  Converte uma string no formato "DD/MM/AAAA HH:MM" para um objeto Date.
  O horário é opcional — se ausente, usa 00:00.
  Retorna null se a string for inválida ou vazia.
*/
function parseBR(str){
  if(!str) return null;
  const m = String(str).match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?/);
  if(!m) return null;
  return new Date(+m[3], +m[2]-1, +m[1], +(m[4]||0), +(m[5]||0));
}

/*
  Calcula o tempo decorrido entre `start` (string BR) e `end` (Date, padrão: agora).
  Retorna uma string no formato "HH:MM". Ex: "02:35"
  Retorna "-" se `start` for inválido.
*/
function elapsedHHMM(start, end = new Date()){
  const s = parseBR(start);
  if(!s) return '-';
  const diff = Math.max(0, Math.floor((end - s) / 60000));
  return `${String(Math.floor(diff/60)).padStart(2,'0')}:${String(diff%60).padStart(2,'0')}`;
}

/*
  Escapa caracteres especiais de HTML para evitar injeção de código.
  Sempre usar antes de inserir dados do banco no innerHTML.
*/
function escapeHtml(v){
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/*
  Retorna a classe CSS de cor conforme a prioridade da OS.
  Usado para colorir as pills na tabela.
  Valores possíveis: "high", "medium", "low"
*/
function priorityClass(p){
  return p === 'ALTA' ? 'high' : p === 'MÉDIA' ? 'medium' : 'low';
}

/* Expõe todas as funções em window.PCMUtils para uso nos HTMLs e no db.js */
window.PCMUtils = { pad2, nowBR, parseBR, elapsedHHMM, escapeHtml, priorityClass };
