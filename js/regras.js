// Regras de vencimento. Datas em texto 'AAAA-MM-DD', tratadas no fuso local.
// Testes mensais ou mais longos vencem no mês (como na planilha: sem tolerância, vence no mês em que completa
// a periodicidade). Testes diários e semanais vencem no dia.

export const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MESES_LONGOS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const parse = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d || 1); };
export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const hojeISO = () => iso(new Date());
const mesIdx = d => d.getFullYear() * 12 + d.getMonth();

export function somaPer(dataISO, per) {
  const d = parse(dataISO);
  if (per.u === 'd') d.setDate(d.getDate() + per.n);
  else if (per.u === 'w') d.setDate(d.getDate() + 7 * per.n);
  else { const dia = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + per.n); d.setDate(Math.min(dia, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  return iso(d);
}

export const porMes = per => per.u === 'm';
export const ehRotina = per => per.u === 'd';

export function nomePer(per) {
  if (per.u === 'd') return 'Diário';
  if (per.u === 'w') return 'Semanal';
  return ({ 1: 'Mensal', 3: 'Trimestral', 6: 'Semestral', 12: 'Anual', 24: 'Bienal' })[per.n] || `A cada ${per.n} meses`;
}

export function fmtData(s) { if (!s) return '—'; const d = parse(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }
export function fmtMes(s) { if (!s) return '—'; const d = parse(s); return `${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`; }
export function fmtMesLongo(s) { const d = parse(s); return `${MESES_LONGOS[d.getMonth()]} de ${d.getFullYear()}`; }
export function fmtVenc(s, per) { return porMes(per) ? fmtMes(s) : fmtData(s); }

// Última execução (justificativas não contam como execução).
export function ultimaExecucao(registros) {
  let u = null;
  for (const r of registros) if (r.tipo === 'execucao' && (!u || r.data > u.data)) u = r;
  return u;
}

// Estado do teste na data de referência.
// estados: 'sem' (nunca registrado), 'atrasado', 'mes' (vence neste mês / hoje), 'proximo' (vence no mês seguinte), 'ok'
export function situacao(teste, registros, refISO = hojeISO()) {
  const ult = ultimaExecucao(registros);
  if (!ult) return { estado: 'sem', ultima: null, venc: null, ordem: 1 };
  const venc = somaPer(ult.data, teste.per);
  const ref = parse(refISO), v = parse(venc);
  let estado, atraso = '';
  if (porMes(teste.per)) {
    const dm = mesIdx(v) - mesIdx(ref);
    if (dm < 0) { estado = 'atrasado'; const n = -dm; atraso = n === 1 ? '1 mês' : `${n} meses`; }
    else if (dm === 0) estado = 'mes';
    else if (dm === 1) estado = 'proximo';
    else estado = 'ok';
  } else {
    const dd = Math.round((v - ref) / 864e5);
    if (dd < 0) {
      estado = ehRotina(teste.per) ? 'mes' : 'atrasado';
      const n = -dd; atraso = n === 1 ? '1 dia' : `${n} dias`;
    } else if (dd === 0) estado = 'mes';
    else estado = 'ok';
  }
  // justificativa registrada para o atraso atual
  const just = registros.filter(r => r.tipo === 'justificativa' && r.data >= ult.data).sort((a, b) => b.data.localeCompare(a.data))[0] || null;
  const ordem = { atrasado: 0, mes: 2, proximo: 3, ok: 4 }[estado];
  return { estado, ultima: ult, venc, atraso, justificativa: estado === 'atrasado' ? just : null, ordem };
}

// Precisa de justificativa ao registrar uma execução na data informada?
export function exigeJustificativa(teste, registros, dataISO) {
  if (ehRotina(teste.per)) return false; // diários: "no dia de uso do equipamento"
  const ult = ultimaExecucao(registros.filter(r => r.data <= dataISO));
  if (!ult) return false;
  const venc = somaPer(ult.data, teste.per);
  if (porMes(teste.per)) return mesIdx(parse(dataISO)) > mesIdx(parse(venc));
  return dataISO > venc;
}

export const ROTULO = { atrasado: 'Atrasado', mes: 'Vence este mês', proximo: 'Próximo mês', ok: 'Em dia', sem: 'Sem registro' };

// Etapas de cada execução: 1) teste realizado, 2) relatório realizado, 3) relatório concluído (assinado).
// As etapas 2 e 3 são registros próprios (tipo 'relatorio' e 'concluido') ligados à execução por ref_id.
export const ETAPAS = [
  { k: 'execucao', nome: 'Teste realizado', curto: 'Teste' },
  { k: 'relatorio', nome: 'Relatório realizado', curto: 'Relatório' },
  { k: 'concluido', nome: 'Relatório concluído', curto: 'Concluído' },
];
// Prazos das etapas: 2 dias úteis após o teste para o relatório; 2 dias úteis após o relatório para a assinatura.
export const PRAZO_ETAPA = 2;
function pascoa(y) { const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3),
  h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(y, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1); }
// nacionais + 9 de julho (estadual de SP) + 28 de outubro (Dia do Servidor Público)
const FIXOS = ['01-01', '04-21', '05-01', '07-09', '09-07', '10-12', '10-28', '11-02', '11-15', '11-20', '12-25'];
// Feriados nacionais (fixos + Sexta-feira Santa). Feriados locais e pontos facultativos não entram.
export function ehFeriado(d) {
  if (FIXOS.includes(iso(d).slice(5))) return true;
  const sx = pascoa(d.getFullYear()); sx.setDate(sx.getDate() - 2);
  return iso(sx) === iso(d);
}
export const ehDiaUtil = d => d.getDay() !== 0 && d.getDay() !== 6 && !ehFeriado(d);
export function somaDiasUteis(dataISO, n) {
  const d = parse(dataISO); let k = 0;
  while (k < n) { d.setDate(d.getDate() + 1); if (ehDiaUtil(d)) k++; }
  return iso(d);
}

export function etapasDe(exec, registros, refISO = hojeISO()) {
  if (!exec) return { n: 0, relatorio: null, concluido: null };
  const importado = exec.usuario_nome === 'Importado da planilha';
  const rel = registros.find(r => r.tipo === 'relatorio' && r.ref_id === exec.id) || null;
  const con = registros.find(r => r.tipo === 'concluido' && r.ref_id === exec.id) || null;
  const n = importado || con ? 3 : rel ? 2 : 1;
  const prazoRel = somaDiasUteis(exec.data, PRAZO_ETAPA);
  const prazoCon = rel ? somaDiasUteis(rel.data, PRAZO_ETAPA) : null;
  const prazo = n === 1 ? prazoRel : n === 2 ? prazoCon : null; // prazo da próxima etapa
  return { n, relatorio: rel, concluido: con, importado, prazoRel, prazoCon, prazo, atrasada: !!prazo && refISO > prazo };
}
