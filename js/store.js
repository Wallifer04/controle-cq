// Camada de dados. Com o Supabase configurado em config.js, usa login e banco na nuvem (dados compartilhados
// pela equipe). Sem configuração, roda em modo demonstração, guardando tudo só neste navegador.
import { CONFIG } from '../config.js';
import { EQUIPAMENTOS, TESTES, historicoImportado } from './catalogo.js';

const nuvem = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_KEY);
let sb = null;

function uid() { return (crypto.randomUUID ? crypto.randomUUID() : 'r' + Date.now() + Math.random().toString(16).slice(2)); }

// ---------- modo demonstração ----------
const LS = 'cqmn.demo.v2';
function lerDemo() {
  try { const j = JSON.parse(localStorage.getItem(LS)); if (j && j.registros) return j; } catch {}
  return { registros: historicoImportado(), testes: {}, usuario: null, autorizados: [] };
}
function gravarDemo(d) { try { localStorage.setItem(LS, JSON.stringify(d)); } catch {} }

const demo = {
  modo: 'demo',
  async init() {},
  async sessao() { return lerDemo().usuario; },
  async entrar(email, _senha, nome) {
    const d = lerDemo(); d.usuario = { id: 'demo', email, nome: nome || email.split('@')[0], admin: true }; gravarDemo(d); return d.usuario;
  },
  async criarConta(email, senha, nome) { return this.entrar(email, senha, nome); },
  async redefinirSenha() {},
  async sair() { const d = lerDemo(); d.usuario = null; gravarDemo(d); },
  async carregar() {
    const d = lerDemo();
    const testes = [...TESTES, ...(d.novos || [])].map(t => ({ ...t, ...(d.testes[t.id] || {}) }));
    return { equipamentos: EQUIPAMENTOS, testes, registros: d.registros };
  },
  async registrar(regs) {
    const d = lerDemo();
    const novos = regs.map(r => ({ id: uid(), created_at: new Date().toISOString(), usuario_id: d.usuario?.id, usuario_nome: d.usuario?.nome, ...r }));
    d.registros.push(...novos); gravarDemo(d); return novos;
  },
  async criarTeste(t) { const d = lerDemo(); const novo = { ...t, id: `${t.eq}.x-${uid().slice(0, 8)}`, anexo: 'Rotina do setor', ordem: 900 + (d.novos || []).length }; d.novos = [...(d.novos || []), novo]; gravarDemo(d); return novo; },
  async anularRegistro(id, motivo) { const d = lerDemo(); const r = d.registros.find(x => x.id === id); if (!r) throw new Error('Registro não encontrado'); r.anulado_em = new Date().toISOString(); r.anulado_por = d.usuario?.nome; r.anulado_motivo = motivo; gravarDemo(d); },
  async atualizarTeste(id, patch) { const d = lerDemo(); d.testes[id] = { ...(d.testes[id] || {}), ...patch }; gravarDemo(d); },
  async listarAutorizados() { return lerDemo().autorizados; },
  async autorizar(email, nome, admin) { const d = lerDemo(); d.autorizados = d.autorizados.filter(a => a.email !== email); d.autorizados.push({ email, nome, admin }); gravarDemo(d); },
  async desautorizar(email) { const d = lerDemo(); d.autorizados = d.autorizados.filter(a => a.email !== email); gravarDemo(d); },
  async salvarPush() {},
  async chavePush() { return null; },
  aoMudar() {},
  async reiniciarDemo() { localStorage.removeItem(LS); },
};

// ---------- modo nuvem (Supabase) ----------
const cloud = {
  modo: 'nuvem',
  user: null,
  async init() {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    sb = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true } });
  },
  async perfil(u) {
    if (!u) return null;
    const { data } = await sb.from('autorizados').select('nome, admin').eq('email', u.email.toLowerCase()).maybeSingle();
    if (!data) return null;
    return { id: u.id, email: u.email, nome: data.nome || u.user_metadata?.nome || u.email.split('@')[0], admin: !!data.admin };
  },
  async sessao() { const { data } = await sb.auth.getSession(); return this.user = await this.perfil(data.session?.user); },
  async entrar(email, senha) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
    if (error) throw new Error(traduz(error.message));
    const p = await this.perfil(data.user);
    if (!p) { await sb.auth.signOut(); throw new Error('Este e-mail não está autorizado. Peça acesso ao administrador.'); }
    return this.user = p;
  },
  async criarConta(email, senha, nome) {
    const { data, error } = await sb.auth.signUp({ email, password: senha, options: { data: { nome }, emailRedirectTo: location.href.split('#')[0] } });
    if (error) throw new Error(traduz(error.message));
    if (!data.session) return null; // confirmação por e-mail
    return this.user = await this.perfil(data.user);
  },
  async redefinirSenha(email) {
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] });
    if (error) throw new Error(traduz(error.message));
  },
  async sair() { await sb.auth.signOut(); this.user = null; },
  async carregar() {
    const [e, t, r] = await Promise.all([
      sb.from('equipamentos').select('*').order('ordem'),
      sb.from('testes').select('*').order('ordem'),
      sb.from('registros').select('*').order('data', { ascending: false }).limit(20000),
    ]);
    for (const x of [e, t, r]) if (x.error) throw new Error(x.error.message);
    const testes = t.data.map(x => ({ ...x, eq: x.equipamento_id, per: { n: x.per_n, u: x.per_u } }));
    return { equipamentos: e.data, testes, registros: r.data };
  },
  async registrar(regs) {
    const linhas = regs.map(r => ({ ...r, usuario_id: this.user.id, usuario_nome: this.user.nome }));
    const { data, error } = await sb.from('registros').insert(linhas).select();
    if (error) throw new Error(error.message);
    return data;
  },
  async criarTeste(t) {
    const linha = { id: `${t.eq}.x-${crypto.randomUUID().slice(0, 8)}`, equipamento_id: t.eq, nome: t.nome, per_n: t.per.n, per_u: t.per.u, anexo: 'Rotina do setor', tol: t.tol || null, nota: t.nota || null, ordem: 900 };
    const { error } = await sb.from('testes').insert(linha); if (error) throw new Error(error.message); return linha;
  },
  async atualizarTeste(id, patch) {
    const p = { ...patch };
    if (p.per) { p.per_n = p.per.n; p.per_u = p.per.u; delete p.per; }
    const { error } = await sb.from('testes').update(p).eq('id', id);
    if (error) throw new Error(error.message);
  },
  async listarAutorizados() { const { data, error } = await sb.from('autorizados').select('*').order('nome'); if (error) throw new Error(error.message); return data; },
  async autorizar(email, nome, admin) { const { error } = await sb.from('autorizados').upsert({ email: email.toLowerCase(), nome, admin }); if (error) throw new Error(error.message); },
  async desautorizar(email) { const { error } = await sb.from('autorizados').delete().eq('email', email); if (error) throw new Error(error.message); },
  async anularRegistro(id, motivo) { const { error } = await sb.rpc('anular_registro', { p_id: id, p_motivo: motivo }); if (error) throw new Error(error.message); },
  async chavePush() { const { data } = await sb.rpc('chave_push'); return data || null; },
  async salvarPush(sub) {
    const j = sub.toJSON();
    const { error } = await sb.from('push_subs').upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: this.user.id, user_agent: navigator.userAgent.slice(0, 200) }, { onConflict: 'endpoint' });
    if (error) throw new Error(error.message);
  },
  aoMudar(cb) { sb.channel('registros').on('postgres_changes', { event: '*', schema: 'public', table: 'registros' }, cb).subscribe(); },
};

function traduz(m) {
  if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link enviado antes de entrar.';
  if (/already registered/i.test(m)) return 'Este e-mail já tem conta. Use "Entrar".';
  if (/Database error saving new user/i.test(m)) return 'Este e-mail não está autorizado. Peça acesso ao administrador.';
  if (/Password should be/i.test(m)) return 'A senha precisa ter pelo menos 8 caracteres.';
  return m;
}

export const store = nuvem ? cloud : demo;
