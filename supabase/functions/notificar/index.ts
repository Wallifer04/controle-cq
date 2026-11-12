// Edge Function "notificar": roda todo dia (pg_cron) e manda push para os aparelhos inscritos.
// - No início de cada mês: lista dos testes que vencem no mês seguinte.
// - Toda segunda-feira: lembrete dos testes atrasados.
// - Em dias úteis: relatórios e assinaturas cujo prazo de 2 dias úteis vence hoje ou já passou.
// Chaves na tabela config_privada: cron_secret (criada pelo SQL) e o par vapid_public/vapid_private (criado aqui na primeira execução).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function hojeSP(): Date {
  const s = new Date().toLocaleString('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const mesIdx = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();
function soma(dataISO: string, n: number, u: string): Date {
  const [y, m, d] = dataISO.split('-').map(Number);
  const x = new Date(Date.UTC(y, m - 1, d));
  if (u === 'd') x.setUTCDate(x.getUTCDate() + n);
  else if (u === 'w') x.setUTCDate(x.getUTCDate() + 7 * n);
  else { x.setUTCDate(1); x.setUTCMonth(x.getUTCMonth() + n); }
  return x;
}

// ----- dias úteis (fins de semana e feriados nacionais) -----
const isoD = (d: Date) => d.toISOString().slice(0, 10);
function pascoa(y: number): Date {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, mes - 1, dia));
}
const FIXOS = ['01-01', '04-21', '05-01', '07-09', '09-07', '10-12', '10-28', '11-02', '11-15', '11-20', '12-25'];
function diaUtil(d: Date): boolean {
  const w = d.getUTCDay(); if (w === 0 || w === 6) return false;
  if (FIXOS.includes(isoD(d).slice(5))) return false;
  const sexta = pascoa(d.getUTCFullYear()); sexta.setUTCDate(sexta.getUTCDate() - 2);
  return isoD(sexta) !== isoD(d);
}
function somaUteis(dataISO: string, n: number): string {
  const [y, m, d] = dataISO.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, d));
  while (n > 0) { x.setUTCDate(x.getUTCDate() + 1); if (diaUtil(x)) n--; }
  return isoD(x);
}

Deno.serve(async (req) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // chaves guardadas na tabela config_privada (só o servidor lê)
  const { data: cfgL } = await sb.from('config_privada').select('chave, valor');
  const cfg = Object.fromEntries((cfgL || []).map((c) => [c.chave, c.valor]));
  if (!cfg.cron_secret || req.headers.get('x-cron-secret') !== cfg.cron_secret) return new Response('proibido', { status: 403 });
  if (!cfg.vapid_public || !cfg.vapid_private) {
    // primeira execução: cria o par de chaves do push e guarda no banco
    const k = webpush.generateVAPIDKeys();
    await sb.from('config_privada').upsert([{ chave: 'vapid_public', valor: k.publicKey }, { chave: 'vapid_private', valor: k.privateKey }]);
    cfg.vapid_public = k.publicKey; cfg.vapid_private = k.privateKey;
  }
  const url = new URL(req.url);
  const forcar = url.searchParams.get('forcar') === '1';
  webpush.setVapidDetails(cfg.vapid_subject || Deno.env.get('SUPABASE_URL')!, cfg.vapid_public, cfg.vapid_private);

  const [{ data: testes }, { data: eqs }, { data: regs }, { data: subs }] = await Promise.all([
    sb.from('testes').select('id, nome, per_n, per_u, equipamento_id, aviso_meses').eq('ativo', true),
    sb.from('equipamentos').select('id, nome'),
    sb.from('registros').select('id, teste_id, data, tipo, ref_id, usuario_nome').in('tipo', ['execucao', 'relatorio', 'concluido']),
    sb.from('push_subs').select('*'),
  ]);
  if (!testes) return Response.json({ ok: false }, { status: 500 });

  const ult = new Map<string, string>();
  // última execução de cada teste (a mais recente; no empate, a última gravada)
  const ultReg = new Map<string, { id: string; data: string; usuario_nome: string | null }>();
  for (const r of regs || []) if (r.tipo === 'execucao' && (!ultReg.has(r.teste_id) || r.data >= ultReg.get(r.teste_id)!.data)) ultReg.set(r.teste_id, r);
  for (const [k, r] of ultReg) ult.set(k, r.data);
  const nomeEq = new Map((eqs || []).map((e) => [e.id, e.nome]));
  const hoje = hojeSP();
  const proximo: string[] = [], atrasados: string[] = [], antecipar: string[] = [];
  for (const t of testes) {
    if (t.per_u !== 'm') continue; // diários/semanais não geram aviso
    const u = ult.get(t.id); if (!u) continue;
    const dm = mesIdx(soma(u, t.per_n, t.per_u)) - mesIdx(hoje);
    const rot = `${t.nome} (${nomeEq.get(t.equipamento_id)})`;
    if (dm === 1) proximo.push(rot); else if (dm < 0) atrasados.push(rot);
    // testes que pedem providência antes (ex.: calibração): avisa quando faltam exatamente aviso_meses meses
    if (t.aviso_meses > 1 && dm === t.aviso_meses) antecipar.push(`${rot}, vence em ${MESES[(hoje.getUTCMonth() + dm) % 12]}`);
  }

  // etapas com prazo vencendo hoje ou vencido
  const hojeS = isoD(hoje), etapas: string[] = [];
  for (const t of testes) {
    const ex = ultReg.get(t.id); if (!ex || ex.usuario_nome === 'Importado da planilha') continue;
    const rel = (regs || []).find((r) => r.tipo === 'relatorio' && r.ref_id === ex.id);
    const con = (regs || []).find((r) => r.tipo === 'concluido' && r.ref_id === ex.id);
    if (con) continue;
    const prazo = rel ? somaUteis(rel.data, 2) : somaUteis(ex.data, 2);
    if (prazo <= hojeS) etapas.push(`${rel ? 'Assinatura' : 'Relatório'}: ${t.nome} (${nomeEq.get(t.equipamento_id)})`);
  }

  const mesK = `${hoje.getUTCFullYear()}-${hoje.getUTCMonth() + 1}`;
  const semana = Math.floor(hoje.getTime() / 6048e5);
  const avisos: { chave: string; title: string; body: string }[] = [];
  const mesSeg = MESES[(hoje.getUTCMonth() + 1) % 12];
  if (proximo.length) avisos.push({ chave: `prox-${mesK}`, title: `${proximo.length} teste${proximo.length > 1 ? 's' : ''} para ${mesSeg}`, body: proximo.slice(0, 5).join('; ') + (proximo.length > 5 ? '…' : '') });
  if (atrasados.length && (hoje.getUTCDay() === 1 || forcar)) avisos.push({ chave: `atr-${semana}`, title: `${atrasados.length} teste${atrasados.length > 1 ? 's' : ''} atrasado${atrasados.length > 1 ? 's' : ''}`, body: atrasados.slice(0, 5).join('; ') + (atrasados.length > 5 ? '…' : '') });

  if (etapas.length && (diaUtil(hoje) || forcar)) avisos.push({ chave: `etapa-${hojeS}`, title: `${etapas.length} pendência${etapas.length > 1 ? 's' : ''} de relatório ou assinatura`, body: etapas.slice(0, 5).join('; ') + (etapas.length > 5 ? '…' : '') });

  if (antecipar.length) avisos.push({ chave: `ant-${mesK}`, title: 'Abrir chamado: calibração a vencer', body: antecipar.slice(0, 5).join('; ') + (antecipar.length > 5 ? '…' : '') });

  let enviados = 0;
  for (const a of avisos) {
    if (!forcar && (subs || []).length) {
      const { error } = await sb.from('avisos_enviados').insert({ chave: a.chave });
      if (error) continue; // já enviado
    }
    for (const s of subs || []) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: a.title, body: a.body, tag: a.chave, url: a.chave.startsWith('etapa') ? './#quadro' : './#inicio' }));
        enviados++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from('push_subs').delete().eq('endpoint', s.endpoint);
      }
    }
  }
  return Response.json({ ok: true, enviados, proximo: proximo.length, atrasados: atrasados.length, etapas: etapas.length });
});
