/* ─────────────────────────────────────────
   config.js — configuração pública do site

   A Publishable Key do Supabase pode ficar no navegador, desde que as tabelas
   estejam protegidas por RLS. Nunca coloque service_role ou secret key aqui.
───────────────────────────────────────── */
window.APP_CONFIG = {
  SUPABASE_URL: 'https://jrpdxvmikxhupculeyyy.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpycGR4dm1pa3hodXBjdWxleXl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MjA5MjAsImV4cCI6MjEwMTQ5NjkyMH0.uTIniG9luPghcVKKuelSkyrJaY2k0S0sUy4uRbakU78',

  /* Mantido para a separação visual entre Operador e PCM.
     Não substitui o login nem as políticas RLS do Supabase. */
  PCM_PASSWORD: 'troque-esta-senha'
};
