import { store } from './store.js';
import { CONFIG } from '../config.js';
import { NORMA } from './catalogo.js';
import { ic } from './icones.js';
import {
  situacao, exigeJustificativa, somaPer, nomePer, fmtData, fmtMes, fmtVenc, fmtMesLongo, hojeISO, parse, iso,
  porMes, ehRotina, ROTULO, MESES_LONGOS, ultimaExecucao, ETAPAS, etapasDe, somaDiasUteis, PRAZO_ETAPA,
} from './regras.js';

const $app = document.getElementById('app');
const $sheetRoot = document.getElementById('sheet-root');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const S = { user: null, eqs: [], testes: [], regs: [], porTeste: new Map(), sit: new Map(), filtroEquip: 'todos', busca: '', filtroHist: 'todos' };

// ---------------- dados ----------------
async function carregar() {
  const d = await store.carregar();
  S.eqs = d.equipamentos; S.todos = d.testes; S.testes = d.testes.filter(t => t.ativo !== false); S.regs = d.registros;
  indexar();
}
function indexar() {
  S.porTeste = new Map(S.testes.map(t => [t.id, []]));
  for (const r of S.regs) S.porTeste.get(r.teste_id)?.push(r);
  const hoje = hojeISO();
  S.sit = new Map(S.testes.map(t => [t.id, situacao(t, S.porTeste.get(t.id), hoje)]));
}
const eqDe = id => S.eqs.find(e => e.id === id);
const testeDe = id => S.testes.find(t => t.id === id) || (S.todos || []).find(t => t.id === id); // inclui os excluídos, para o histórico
const periodicos = () => S.testes.filter(t => !ehRotina(t.per));
const rotinas = eqId => S.testes.filter(t => ehRotina(t.per) && t.eq === eqId);
const etapas = t => etapasDe(S.sit.get(t.id)?.ultima, S.porTeste.get(t.id) || []);
const relPendentes = () => periodicos().filter(t => { const e = etapas(t); return e.n > 0 && e.n < 3; })
  .sort((a, b) => S.sit.get(a.id).ultima.data.localeCompare(S.sit.get(b.id).ultima.data));
const fmtDM = s => { const d = parse(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
function txtEtapa(et) {
  if (et.n === 3) return 'Relatório assinado';
  const o = et.n === 1 ? 'Relatório' : 'Assinatura';
  return et.atrasada ? `<b class="tarde">${o} atrasad${et.n === 1 ? 'o' : 'a'} (era até ${fmtDM(et.prazo)})</b>` : `${o} até ${fmtDM(et.prazo)}`;
}
function passos(n) { return `<span class="passos" role="img" aria-label="${n} de 3 etapas">${[1, 2, 3].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`; }
const feitoHoje = t => (S.porTeste.get(t.id) || []).some(r => r.tipo === 'execucao' && r.data === hojeISO());

function contagens() {
  const c = { atrasado: [], mes: [], proximo: [], sem: [] };
  for (const t of periodicos()) { const s = S.sit.get(t.id); if (c[s.estado]) c[s.estado].push(t); }
  const ord = (a, b) => (S.sit.get(a.id).venc || '').localeCompare(S.sit.get(b.id).venc || '') || a.ordem - b.ordem;
  Object.values(c).forEach(l => l.sort(ord));
  return c;
}
const mesRef = (n = 0) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + n); return d; };
const nomeMes = (n = 0) => MESES_LONGOS[mesRef(n).getMonth()];

// ---------------- roteamento ----------------
const ROTAS = [
  { id: 'inicio', nome: 'Início', ico: 'home' },
  { id: 'quadro', nome: 'Quadro', ico: 'board' },
  { id: 'equipamentos', nome: 'Equipamentos', curto: 'Aparelhos', ico: 'grid' },
  { id: 'agenda', nome: 'Agenda', ico: 'calendar' },
  { id: 'historico', nome: 'Histórico', ico: 'history' },
  { id: 'ajustes', nome: 'Ajustes', ico: 'gear' },
];
// Rotas no formato #agenda ou #equip--nm630 (só letras, números e hífens).
function rota() { const [a, b] = location.hash.replace(/^#\/?/, '').split(/--|\//); return { id: a || 'inicio', arg: b || null }; }
window.addEventListener('hashchange', () => { render(); window.scrollTo({ top: 0 }); });

// ---------- visual: cores por equipamento, anéis e gráficos ----------
const HUES = { nm630: ['#4C7BFF', '#1D3FD1'], nm670: ['#6A5CFF', '#3324C9'], petct: ['#2FB7F5', '#1560D6'], ativ: ['#5B8CFF', '#2347B8'],
  captus: ['#8A6CFF', '#4B2FD0'], 'gm-insp': ['#39A0FF', '#1B4FC4'], 'gm-redeye': ['#5E7BFF', '#2B33B5'], 'probe-nova': ['#4FC3F7', '#1F6FE0'], 'probe-antiga': ['#7C8CFF', '#3443B8'] };
const hue = id => HUES[id] || ['#5B8CFF', '#1D3FD1'];
const grad = id => `background:linear-gradient(145deg, ${hue(id)[0]}, ${hue(id)[1]})`;

function anel(pct, { tam = 120, esp = 12, cor = '#fff', trilho = 'rgba(255,255,255,.18)', centro = '', sub = '' } = {}) {
  const r = (tam - esp) / 2, c = 2 * Math.PI * r, v = Math.max(0, Math.min(1, pct));
  return `<div class="anel" style="width:${tam}px;height:${tam}px">
    <svg viewBox="0 0 ${tam} ${tam}" width="${tam}" height="${tam}" aria-hidden="true">
      <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${trilho}" stroke-width="${esp}"/>
      <circle cx="${tam / 2}" cy="${tam / 2}" r="${r}" fill="none" stroke="${cor}" stroke-width="${esp}" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - v)}" transform="rotate(-90 ${tam / 2} ${tam / 2})" class="anel-arco"/>
    </svg><div class="anel-centro">${centro}${sub ? `<small>${sub}</small>` : ''}</div></div>`;
}
function conformidade(ts) {
  const comReg = ts.filter(t => S.sit.get(t.id).estado !== 'sem');
  if (!comReg.length) return null;
  return comReg.filter(t => S.sit.get(t.id).estado !== 'atrasado').length / comReg.length;
}
// vencimentos por mês (situação atual + repetições previstas)
function agendaMeses(nMeses) {
  const meses = new Map();
  const atual = iso(mesRef(0)).slice(0, 7), limite = iso(mesRef(nMeses)).slice(0, 7);
  const add = (k, t) => { if (k < atual || k > limite) return; if (!meses.has(k)) meses.set(k, []); meses.get(k).push(t); };
  for (const t of periodicos()) {
    const s = S.sit.get(t.id); if (!s.venc || s.estado === 'atrasado') continue;
    add(s.venc.slice(0, 7), t);
    if (!porMes(t.per)) continue;
    let v = somaPer(s.venc, t.per);
    while (v.slice(0, 7) <= limite) { add(v.slice(0, 7), { ...t, _proj: true }); v = somaPer(v, t.per); }
  }
  return meses;
}

// ---------------- shell ----------------
function shell(conteudo) {
  const r = rota().id === 'equip' ? 'equipamentos' : rota().id;
  const nAtras = contagens().atrasado.length;
  const iniciais = (S.user.nome || '?').split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const badge = id => id === 'inicio' && nAtras ? `<span class="badge" aria-label="${nAtras} atrasados">${nAtras}</span>` : '';
  return `
  <div class="shell">
    <aside class="sidebar" aria-label="Navegação principal">
      <div class="brand"><div class="brand-mark">${ic('atom')}</div><div><b>Controle de CQ</b><span>${esc(CONFIG.NOME_SETOR)}</span></div></div>
      <div class="nav-label">Menu</div>
      <nav>${ROTAS.map(x => `<a class="nav-item" href="#${x.id}" ${x.id === r ? 'aria-current="page"' : ''}>${ic(x.ico)}${x.nome}${badge(x.id)}</a>`).join('')}</nav>
      <div class="side-card"><div class="side-card-t">${ic('shield')}Norma de referência</div><p>CNEN/ANSN 3.05<br>Res. CNEN/CD 159/2013</p></div>
      <div class="sidebar-foot"><div class="avatar">${esc(iniciais)}</div><div class="who"><b>${esc(S.user.nome)}</b><span>${S.user.admin ? 'Administrador' : 'Equipe'}</span></div></div>
    </aside>
    <main class="main fade-in" id="main">${conteudo}</main>
    <nav class="tabbar" aria-label="Navegação">${ROTAS.map(x => `<a class="tab" href="#${x.id}" ${x.id === r ? 'aria-current="page"' : ''}>${ic(x.ico)}<span>${x.curto || x.nome}</span>${badge(x.id)}</a>`).join('')}</nav>
  </div>`;
}

function pill(t) {
  const s = S.sit.get(t.id);
  if (ehRotina(t.per)) return feitoHoje(t) ? '<span class="pill feito">Feito hoje</span>' : '<span class="pill mes">Fazer hoje</span>';
  let txt = ROTULO[s.estado];
  if (s.estado === 'atrasado') txt += ` · ${s.atraso}`;
  return `<span class="pill ${s.estado}">${txt}</span>`;
}

function chipData(t) {
  const s = S.sit.get(t.id);
  const est = ehRotina(t.per) ? (feitoHoje(t) ? 'ok' : 'mes') : s.estado;
  if (ehRotina(t.per)) return `<div class="dchip ${est} rot"><span>hoje</span>${ic(feitoHoje(t) ? 'check' : 'clock')}</div>`;
  if (!s.venc) return `<div class="dchip sem"><b>—</b><span>sem data</span></div>`;
  const d = parse(s.venc);
  if (porMes(t.per)) return `<div class="dchip ${est}"><span>${MESES_LONGOS[d.getMonth()].slice(0, 3)}</span><b>${String(d.getFullYear()).slice(2)}</b></div>`;
  return `<div class="dchip ${est}"><span>${MESES_LONGOS[d.getMonth()].slice(0, 3)}</span><b>${d.getDate()}</b></div>`;
}

function celulaTeste(t, { mostrarEquip = true } = {}) {
  const s = S.sit.get(t.id), e = eqDe(t.eq);
  const est = ehRotina(t.per) ? (feitoHoje(t) ? 'ok' : 'mes') : s.estado;
  const sub = [mostrarEquip ? e?.nome : null, nomePer(t.per), s.justificativa ? 'atraso justificado' : null].filter(Boolean).join(' · ');
  return `<button class="cell tcell est-${est}" data-teste="${esc(t.id)}">
    <div class="cell-ico eqc" style="${grad(t.eq)}">${ic(e?.icone || 'doc')}</div>
    <div class="cell-body"><div class="cell-title">${esc(t.nome)}</div><div class="cell-sub">${esc(sub)}</div><div class="cell-pill">${pill(t)}${etapas(t).n ? `<span class="passos-wrap">${passos(etapas(t).n)}<span>${txtEtapa(etapas(t))}</span></span>` : ''}</div></div>
    <div class="cell-trail">${chipData(t)}${ic('chevR', 'i chev')}</div>
  </button>`;
}

// ---------------- telas ----------------
function telaInicio() {
  const c = contagens();
  const h = new Date().getHours();
  const saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  const dataHoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  const primeiro = esc((S.user.nome || '').split(' ')[0]);
  const notifOn = typeof Notification !== 'undefined' && Notification.permission === 'granted';
  const lista = (arr, vazio) => arr.length ? `<div class="group">${arr.map(t => celulaTeste(t)).join('')}</div>` : `<div class="group"><div class="empty">${ic('checkCircle')}<div>${vazio}</div></div></div>`;
  const rp = relPendentes();
  const per = periodicos();
  const conf = conformidade(per);
  const comReg = per.filter(t => S.sit.get(t.id).estado !== 'sem').length;
  const meses = agendaMeses(5);
  const barras = [0, 1, 2, 3, 4, 5].map(i => { const k = iso(mesRef(i)).slice(0, 7); return { k, n: (meses.get(k) || []).length, i }; });
  const maxB = Math.max(1, ...barras.map(b => b.n));

  return `
    <section class="hero-panel">
      <div class="hero-orbits" aria-hidden="true"></div>
      <div class="hero-top">
        <div class="hero-text">
          <div class="hero-eyebrow">${esc(dataHoje)}${store.modo === 'demo' ? ' · demonstração' : ''}</div>
          <h1 class="hero-title">${saud}, ${primeiro}</h1>
          <p class="hero-sub">${per.length} testes periódicos em ${S.eqs.length} equipamentos, acompanhados pela norma CNEN/ANSN 3.05.</p>
        </div>
        <div class="hero-ring">${anel(conf ?? 0, { tam: 132, esp: 12, centro: conf == null ? '—' : `${Math.round(conf * 100)}<i>%</i>`, sub: 'em dia' })}
          <div class="hero-ring-cap">${comReg} testes com registro</div></div>
      </div>
      <div class="hero-stats duo">
        <button class="hstat big" data-go="#atrasados"><span class="hdot red"></span><b>${c.atrasado.length}</b><span>Teste${c.atrasado.length === 1 ? '' : 's'} em atraso</span></button>
        <button class="hstat big" data-go="#este-mes"><span class="hdot sky"></span><b>${c.mes.length}</b><span>Vence${c.mes.length === 1 ? '' : 'm'} em ${nomeMes(0)}</span></button>
      </div>
    </section>
    ${!notifOn && 'Notification' in window ? `
    <div class="banner"><div class="banner-ico">${ic('bell')}</div><div><b>Permita as notificações neste aparelho</b><span>É por elas que avisamos o que vence no mês seguinte, os atrasos e os prazos de relatório e assinatura.</span></div><button class="btn btn-primary btn-sm" data-acao="notif">Permitir notificações</button></div>` : ''}
    <div class="dash">
      <div class="dash-main">
        <section class="section" id="atrasados"><div class="section-head"><h2 class="section-title"><span class="sdot red"></span>Em atraso</h2><span class="section-sub">Registro exige justificativa</span></div>${lista(c.atrasado, 'Nenhum teste atrasado.')}</section>
        <section class="section" id="este-mes"><div class="section-head"><h2 class="section-title"><span class="sdot sky"></span>Vencem em ${nomeMes(0)}</h2><span class="section-sub">Fazer até o fim do mês</span></div>${lista(c.mes, 'Nada mais vence neste mês.')}</section>
        ${c.sem.length ? `<div class="group quiet">
          ${c.sem.length ? `<a class="cell" href="#equipamentos"><div class="cell-ico" style="background:var(--fill);color:var(--label-2)">${ic('list')}</div><div class="cell-body"><div class="cell-title">${c.sem.length} testes ainda sem registro</div><div class="cell-sub">Registre a última execução para começar a contar o vencimento</div></div><div class="cell-trail">${ic('chevR', 'i chev')}</div></a>` : ''}
        </div>` : ''}
      </div>
      <aside class="dash-side">
        <section class="panel" id="relatorios"><div class="panel-head"><h2>Relatórios e assinaturas</h2><a href="#quadro">Abrir quadro</a></div>
          ${rp.length ? `<div class="rotina-list">${rp.slice(0, 6).map(t => { const et = etapas(t); return `
            <button class="rotina-row" data-teste="${esc(t.id)}">${anel(et.n / 3, { tam: 44, esp: 5, cor: et.atrasada ? 'var(--red)' : 'var(--royal)', trilho: 'var(--fill)', centro: `<span class="rr-n">${et.n}/3</span>` })}
              <div class="cell-body"><div class="cell-title">${esc(t.nome)}</div><div class="cell-sub">${esc(eqDe(t.eq).nome)} · ${txtEtapa(et)}</div></div>
              <span class="rr-go">${ic('chevR')}</span></button>`; }).join('')}</div>${rp.length > 6 ? `<p class="note">E mais ${rp.length - 6} no quadro.</p>` : ''}`
          : `<div class="empty" style="padding:14px 8px">${ic('checkCircle')}<div>Nenhum relatório ou assinatura em aberto.</div></div>`}</section>
        <section class="panel"><div class="panel-head"><h2>Próximos meses</h2><span>Vencimentos previstos</span></div>
          <div class="bars">${barras.map(b => `<a class="bar ${b.i === 0 ? 'now' : ''}" href="#agenda" title="${b.n} em ${MESES_LONGOS[mesRef(b.i).getMonth()]}">
            <span class="bar-n">${b.n}</span><span class="bar-col"><i style="height:${Math.max(4, (b.n / maxB) * 100)}%"></i></span><span class="bar-l">${MESES_LONGOS[mesRef(b.i).getMonth()].slice(0, 3)}</span></a>`).join('')}</div></section>
        <section class="panel"><div class="panel-head"><h2>Equipamentos</h2><a href="#equipamentos">Ver todos</a></div>
          <div class="eq-mini">${S.eqs.map(e => { const ts = periodicos().filter(t => t.eq === e.id); const cf = conformidade(ts); const a = ts.filter(t => S.sit.get(t.id).estado === 'atrasado').length; return `
            <a class="eq-mini-row" href="#equip--${e.id}"><span class="eq-mini-ico" style="${grad(e.id)}">${ic(e.icone)}</span><span class="cell-body"><span class="cell-title">${esc(e.nome)}</span>
              <span class="mini-meter"><i style="width:${cf == null ? 0 : cf * 100}%;${a ? 'background:var(--amber)' : ''}"></i></span></span>
              <span class="eq-mini-v ${a ? 'warn' : ''}">${cf == null ? '—' : Math.round(cf * 100) + '%'}</span></a>`; }).join('')}</div></section>
      </aside>
    </div>`;
}

function telaQuadro() {
  const filtro = S.filtroEquip, ok = t => filtro === 'todos' || t.eq === filtro;
  const per = periodicos().filter(ok);
  const c = contagens();
  const fazer = [...c.atrasado, ...c.mes, ...c.proximo].filter(ok);
  const e1 = per.filter(t => etapas(t).n === 1), e2 = per.filter(t => etapas(t).n === 2);
  const porPrazo = (a, b) => etapas(a).prazo.localeCompare(etapas(b).prazo);
  e1.sort(porPrazo); e2.sort(porPrazo);
  const feitos = per.filter(t => { const e = etapas(t); return e.n === 3 && !e.importado; })
    .sort((a, b) => etapas(b).concluido.data.localeCompare(etapas(a).concluido.data)).slice(0, 12);
  const card = (t, modo) => {
    const s = S.sit.get(t.id), e = eqDe(t.eq), et = etapas(t);
    let rod, cls = '';
    if (modo === 'fazer') { cls = s.estado; rod = s.estado === 'atrasado' ? `${ic('alert')}Venceu em ${fmtVenc(s.venc, t.per)} · ${s.atraso}` : `${ic('calendar')}Vence em ${fmtVenc(s.venc, t.per)}`; }
    else if (modo === 'feito') rod = `${ic('checkCircle')}Assinado em ${fmtDM(et.concluido.data)}`;
    else { cls = et.atrasada ? 'atrasado' : ''; rod = `${ic(et.atrasada ? 'alert' : 'clock')}${et.atrasada ? `Prazo era ${fmtDM(et.prazo)}` : `Até ${fmtDM(et.prazo)}`} · teste em ${fmtDM(s.ultima.data)}`; }
    return `<button class="kcard ${cls}" data-teste="${esc(t.id)}" data-col="${{ fazer: 0, etapa: et.n, feito: 3 }[modo]}">
      <span class="kcard-eq"><i style="${grad(t.eq)}">${ic(e.icone)}</i>${esc(e.nome)}</span>
      <b>${esc(t.nome)}</b>
      <span class="kcard-meta"><span class="tag">${nomePer(t.per)}</span>${passos(modo === 'fazer' ? 0 : et.n)}</span>
      <span class="kcard-foot">${rod}</span></button>`;
  };
  const col = (cor, titulo, sub, lst, modo, vazio, i) => `<section class="kcol" data-kcol="${i}"><header class="kcol-head"><span class="kdot" style="background:${cor}"></span><div><h2>${titulo}</h2><span>${sub}</span></div><b>${lst.length}</b></header>
    <div class="kcol-body">${lst.length ? lst.map(t => card(t, modo)).join('') : `<div class="kempty">${vazio}</div>`}</div></section>`;
  return `
    <div class="page-head"><div><div class="eyebrow">Etapas de cada teste</div><h1 class="large-title">Quadro</h1></div></div>
    <div class="toolbar"><div class="seg" role="group" aria-label="Filtrar por equipamento">
      <button data-filtro-eq="todos" aria-pressed="${filtro === 'todos'}">Todos</button>
      ${S.eqs.map(e => `<button data-filtro-eq="${e.id}" aria-pressed="${filtro === e.id}">${esc(e.nome)}</button>`).join('')}
    </div></div>
    <div class="kanban">
      ${col('var(--red)', 'A fazer', `Atrasados e até ${nomeMes(1)}`, fazer, 'fazer', 'Nenhum teste para fazer agora.', 0)}
      ${col('var(--amber)', 'Teste realizado', `Relatório em até ${PRAZO_ETAPA} dias úteis`, e1, 'etapa', 'Nenhum relatório a fazer.', 1)}
      ${col('var(--royal)', 'Relatório realizado', `Assinatura em até ${PRAZO_ETAPA} dias úteis`, e2, 'etapa', 'Nenhum relatório aguardando assinatura.', 2)}
      ${col('var(--green)', 'Relatório assinado', 'Concluídos recentemente', feitos, 'feito', 'Os testes concluídos aparecem aqui.', 3)}
    </div>
    <p class="note">Arraste o cartão para a coluna seguinte para avançar a etapa (no celular, segure o cartão por um instante e arraste), ou toque nele para ver os detalhes. O prazo conta em dias úteis e pula sábados, domingos e feriados nacionais.</p>`;
}

// ---------- arrastar no quadro ----------
const NOME_COL = ['A fazer', 'Teste realizado', 'Relatório realizado', 'Relatório assinado'];
let arrasto = null, ignorarClique = false;
function soltarNoQuadro(id, de, para) {
  const t = testeDe(id); if (!t) return;
  if (para === de) return;
  if (para < de) return toast('Os registros não podem ser desfeitos. Só dá para avançar a etapa.', 'alert');
  const regs = S.porTeste.get(id) || [], hoje = hojeISO(), et = etapas(t), s = S.sit.get(id);
  if (de === 0) {
    // novo teste: se está fora do prazo, precisa da justificativa no formulário
    if (exigeJustificativa(t, regs, hoje)) { toast('Teste fora do prazo: escreva a justificativa para registrar.', 'alert'); return abrirRegistro(id, para); }
    return confirmarArrasto(t, `Registrar como ${NOME_COL[para].toLowerCase()} hoje`, `Teste realizado em ${fmtData(hoje)}, conforme. Próximo vencimento: ${fmtVenc(somaPer(hoje, t.per), t.per)}.`, async () => {
      const [ex] = await store.registrar([{ teste_id: id, data: hoje, tipo: 'execucao', resultado: 'conforme', observacao: null, justificativa: null, atrasado: false }]);
      for (const tipo of ['relatorio', 'concluido'].slice(0, para - 1)) await store.registrar([{ teste_id: id, data: hoje, tipo, ref_id: ex.id, resultado: null, observacao: null, justificativa: null, atrasado: false }]);
    });
  }
  if (de === 3) return;
  const tipos = ['relatorio', 'concluido'].slice(de - 1, para - 1);
  const salvar = async just => {
    for (const [i, tipo] of tipos.entries()) await store.registrar([{ teste_id: id, data: hoje, tipo, ref_id: s.ultima.id, resultado: null, observacao: null, justificativa: i === 0 ? just : null, atrasado: i === 0 && !!just }]);
    await carregar(); render(); toast(`Movido para ${NOME_COL[para]}`);
  };
  if (et.atrasada) return abrirJustEtapa(t, et, tipos[0], salvar);
  confirmarArrasto(t, `Mover para ${NOME_COL[para]}`, `${tipos.map(x => x === 'relatorio' ? 'Relatório realizado' : 'Relatório assinado').join(' e ')} em ${fmtData(hoje)}, por ${esc(S.user.nome)}.`, () => salvar(null), true);
}
function confirmarArrasto(t, titulo, texto, acao, jaAvisa) {
  abrirSheet({ titulo: 'Confirmar', corpo: `
    <div class="sheet-hero" style="padding-bottom:12px"><div class="eq-ico" style="${grad(t.eq)}">${ic(eqDe(t.eq).icone)}</div><h2>${esc(t.nome)}</h2><p>${esc(eqDe(t.eq).nome)}</p></div>
    <div class="alert blue">${ic('checkCircle')}<div><b>${titulo}</b>${texto}</div></div>
    <p class="note" style="margin:0 4px 14px">O registro fica no histórico com seu nome e não pode ser apagado.</p>
    <div class="form-err" id="erro"></div>
    <button class="btn btn-primary btn-block" id="conf">Confirmar</button>`,
  aoAbrir: (sh, fechar) => { const b = sh.querySelector('#conf'); b.focus();
    b.onclick = async () => { b.disabled = true;
      try { await acao(); if (!jaAvisa) { await carregar(); render(); toast('Registrado'); } fechar(); }
      catch (e) { b.disabled = false; sh.querySelector('#erro').textContent = e.message; } }; } });
}
function iniciarArrasto(card, x, y) {
  const r = card.getBoundingClientRect();
  const g = card.cloneNode(true); g.classList.add('kghost'); g.style.width = r.width + 'px'; g.style.left = r.left + 'px'; g.style.top = r.top + 'px';
  document.body.appendChild(g); card.classList.add('arrastando'); document.body.classList.add('em-arrasto');
  arrasto.ghost = g; arrasto.dx = x - r.left; arrasto.dy = y - r.top; arrasto.ativo = true;
  navigator.vibrate?.(12);
}
function moverArrasto(x, y) {
  const a = arrasto; a.ghost.style.left = (x - a.dx) + 'px'; a.ghost.style.top = (y - a.dy) + 'px';
  const col = [...document.querySelectorAll('[data-kcol]')].find(c => { const r = c.getBoundingClientRect(); return x >= r.left && x <= r.right && y >= r.top - 40 && y <= r.bottom + 40; }) || null;
  document.querySelectorAll('.kcol.alvo, .kcol.nao').forEach(c => c.classList.remove('alvo', 'nao'));
  a.alvo = col ? +col.dataset.kcol : null;
  if (col && a.alvo !== a.de) col.classList.add(a.alvo > a.de ? 'alvo' : 'nao');
  // rola o quadro quando chega perto das bordas (celular)
  const k = document.querySelector('.kanban'); if (k) { const kr = k.getBoundingClientRect(); if (x > kr.right - 48) k.scrollLeft += 14; else if (x < kr.left + 48) k.scrollLeft -= 14; }
  if (y > innerHeight - 110) scrollBy(0, 12); else if (y < 90) scrollBy(0, -12);
}
function fimArrasto(soltar) {
  const a = arrasto; arrasto = null; if (!a) return;
  clearTimeout(a.timer);
  if (!a.ativo) return;
  a.ghost.remove(); a.card.classList.remove('arrastando'); document.body.classList.remove('em-arrasto');
  document.querySelectorAll('.kcol.alvo, .kcol.nao').forEach(c => c.classList.remove('alvo', 'nao'));
  ignorarClique = true; setTimeout(() => { ignorarClique = false; }, 350);
  if (soltar && a.alvo != null) soltarNoQuadro(a.id, a.de, a.alvo);
}
document.addEventListener('pointerdown', ev => {
  const card = ev.target.closest('.kanban .kcard'); if (!card || ev.button > 0 || arrasto) return;
  arrasto = { card, id: card.dataset.teste, de: +card.dataset.col, x0: ev.clientX, y0: ev.clientY, toque: ev.pointerType !== 'mouse', ativo: false, alvo: null };
  if (arrasto.toque) arrasto.timer = setTimeout(() => { if (arrasto && !arrasto.ativo) iniciarArrasto(card, arrasto.x0, arrasto.y0); }, 320);
});
document.addEventListener('pointermove', ev => {
  const a = arrasto; if (!a) return;
  const d = Math.hypot(ev.clientX - a.x0, ev.clientY - a.y0);
  if (!a.ativo) {
    if (a.toque) { if (d > 10) { clearTimeout(a.timer); arrasto = null; } return; } // dedo andou antes do tempo: é rolagem
    if (d < 6) return;
    iniciarArrasto(a.card, ev.clientX, ev.clientY);
  }
  moverArrasto(ev.clientX, ev.clientY);
});
document.addEventListener('pointerup', () => fimArrasto(true));
document.addEventListener('pointercancel', () => { if (arrasto && !arrasto.ativo) fimArrasto(false); });
// no celular, com o cartão na mão, o dedo não rola a página
document.addEventListener('touchmove', ev => { if (arrasto?.ativo) { ev.preventDefault(); const t = ev.touches[0]; moverArrasto(t.clientX, t.clientY); } }, { passive: false });
document.addEventListener('touchend', () => { if (arrasto?.ativo) fimArrasto(true); });
document.addEventListener('contextmenu', ev => { if (ev.target.closest('.kanban .kcard')) ev.preventDefault(); });

function statsEquip(id) {
  const ts = periodicos().filter(t => t.eq === id);
  const n = k => ts.filter(t => S.sit.get(t.id).estado === k).length;
  return { ts, a: n('atrasado'), m: n('mes'), p: n('proximo'), ok: n('ok'), sem: n('sem'), conf: conformidade(ts),
    prox: ts.filter(t => ['mes', 'proximo', 'ok'].includes(S.sit.get(t.id).estado)).sort((x, y) => S.sit.get(x.id).venc.localeCompare(S.sit.get(y.id).venc))[0] };
}

function telaEquipamentos() {
  return `
    <div class="page-head"><div><div class="eyebrow">${S.eqs.length} equipamentos · ${S.testes.length} testes</div><h1 class="large-title">Equipamentos</h1></div></div>
    <div class="eq-grid">${S.eqs.map(e => {
      const st = statsEquip(e.id);
      return `<a class="eq-card" href="#equip--${e.id}">
        <div class="eq-band" style="${grad(e.id)}">
          <div class="eq-band-orb" aria-hidden="true"></div>
          <div class="eq-band-ico">${ic(e.icone)}</div>
          <div class="eq-band-txt"><b>${esc(e.nome)}</b><span>${esc(e.tipo)}</span></div>
          ${anel(st.conf ?? 0, { tam: 58, esp: 6, centro: st.conf == null ? '—' : `${Math.round(st.conf * 100)}<i>%</i>` })}
        </div>
        <div class="eq-nums">
          <div><b class="${st.a ? 'red' : ''}">${st.a}</b><span>Atrasados</span></div>
          <div><b class="${st.m ? 'amber' : ''}">${st.m}</b><span>Em ${nomeMes(0).slice(0, 3)}</span></div>
          <div><b>${st.ok}</b><span>Em dia</span></div>
        </div>
        <div class="eq-foot">${st.prox ? `${ic('calendar')}<span>Próximo: <b>${esc(st.prox.nome)}</b> · ${fmtVenc(S.sit.get(st.prox.id).venc, st.prox.per)}</span>`
          : st.sem ? `${ic('list')}<span>${st.sem} teste${st.sem > 1 ? 's' : ''} aguardando o primeiro registro</span>` : `${ic('alert')}<span>Regularize os testes atrasados</span>`}</div>
      </a>`;
    }).join('')}</div>`;
}

function telaEquip(id) {
  const e = eqDe(id); if (!e) return telaEquipamentos();
  const ts = S.testes.filter(t => t.eq === id);
  const st = statsEquip(id);
  const grupos = [];
  const chave = t => `${t.per.u}${String(t.per.n).padStart(3, '0')}`;
  const ordemU = { d: 0, w: 1, m: 2 };
  [...new Set(ts.map(chave))].sort((a, b) => ordemU[a[0]] - ordemU[b[0]] || a.slice(1) - b.slice(1)).forEach(k => {
    const lst = ts.filter(t => chave(t) === k); grupos.push({ nome: nomePer(lst[0].per), lst });
  });
  const temRotina = ts.some(t => ehRotina(t.per));
  return `
    <a class="back" href="#equipamentos">${ic('chevL')}Equipamentos</a>
    <section class="hero-panel eq-hero-panel" style="${grad(id)}">
      <div class="hero-orbits" aria-hidden="true"></div>
      <div class="hero-top">
        <div class="hero-text"><div class="eq-band-ico big">${ic(e.icone)}</div>
          <h1 class="hero-title">${esc(e.nome)}</h1><p class="hero-sub">${esc(e.modelo)} · ${ts.length} testes</p>
          ${temRotina ? `<button class="btn btn-white btn-sm" data-rotina="${e.id}">${ic('checkCircle')}Registrar rotina de hoje</button>` : ''}
          ${S.user.admin ? `<button class="btn btn-white btn-sm" data-acao="novo-teste" data-eq="${e.id}">${ic('plus')}Novo teste</button><button class="btn btn-white btn-sm" data-acao="excluir-teste" data-eq="${e.id}">${ic('trash')}Excluir teste</button>` : ''}</div>
        <div class="hero-ring">${anel(st.conf ?? 0, { tam: 116, esp: 11, centro: st.conf == null ? '—' : `${Math.round(st.conf * 100)}<i>%</i>`, sub: 'em dia' })}</div>
      </div>
      <div class="hero-stats">
        <div class="hstat"><span class="hdot red"></span><b>${st.a}</b><span>Atrasados</span></div>
        <div class="hstat"><span class="hdot amber"></span><b>${st.m}</b><span>Vence${st.m === 1 ? '' : 'm'} em ${nomeMes(0)}</span></div>
        <div class="hstat"><span class="hdot green"></span><b>${st.ok}</b><span>Em dia</span></div>
      </div>
    </section>
    ${grupos.map(g => `<section class="section"><div class="section-head"><h2 class="section-title">${g.nome}</h2><span class="section-sub">${g.lst.length} teste${g.lst.length > 1 ? 's' : ''}</span></div>
      <div class="group">${g.lst.map(t => celulaTeste(t, { mostrarEquip: false })).join('')}</div></section>`).join('')}
    <p class="note">Periodicidades conforme ${NORMA}. Testes de aceitação (após instalação ou manutenção) não entram no controle periódico.</p>`;
}

function telaAgenda() {
  const c = contagens();
  const meses = agendaMeses(12);
  const chaves = [...meses.keys()].sort();
  const filtro = S.filtroEquip;
  const ok = t => filtro === 'todos' || t.eq === filtro;
  return `
    <div class="page-head"><div><div class="eyebrow">Próximos 12 meses</div><h1 class="large-title">Agenda</h1></div></div>
    <div class="toolbar"><div class="seg" role="group" aria-label="Filtrar por equipamento">
      <button data-filtro-eq="todos" aria-pressed="${filtro === 'todos'}">Todos</button>
      ${S.eqs.map(e => `<button data-filtro-eq="${e.id}" aria-pressed="${filtro === e.id}">${esc(e.nome)}</button>`).join('')}
    </div></div>
    ${c.atrasado.filter(ok).length ? `<div class="month"><div class="month-head"><h2 class="section-title" style="color:var(--red)">Atrasados</h2><span class="month-count" style="color:var(--red);background:var(--red-tint)">${c.atrasado.filter(ok).length}</span></div>
      <div class="group">${c.atrasado.filter(ok).map(t => celulaTeste(t)).join('')}</div></div>` : ''}
    ${chaves.map(k => { const lst = meses.get(k).filter(ok); if (!lst.length) return '';
      return `<div class="month"><div class="month-head"><h2 class="section-title">${fmtMesLongo(k + '-01')}</h2><span class="month-count">${lst.length}</span></div>
      <div class="group">${lst.map(t => t._proj ? celulaProj(t) : celulaTeste(t)).join('')}</div></div>`; }).join('')}`;
}
function celulaProj(t) {
  const e = eqDe(t.eq);
  return `<button class="cell" data-teste="${esc(t.id)}"><div class="cell-ico eqc" style="${grad(t.eq)};opacity:.5">${ic(e?.icone)}</div>
    <div class="cell-body"><div class="cell-title" style="color:var(--label-2)">${esc(t.nome)}</div><div class="cell-sub">${esc(e?.nome)} · ${nomePer(t.per)} · previsão</div></div>
    <div class="cell-trail">${ic('chevR', 'i chev')}</div></button>`;
}

const rotuloReg = r => r.tipo === 'justificativa' ? 'Justificativa' : r.tipo === 'relatorio' ? 'Relatório realizado' : r.tipo === 'concluido' ? 'Relatório assinado'
  : r.resultado === 'nao_conforme' ? 'Teste realizado · não conforme' : 'Teste realizado';

function telaHistorico() {
  const q = S.busca.trim().toLowerCase();
  const f = S.filtroHist;
  const regs = [...S.regs].sort((a, b) => b.data.localeCompare(a.data) || (b.created_at || '').localeCompare(a.created_at || '')).filter(r => {
    const t = testeDe(r.teste_id); if (!t) return false;
    if (f === 'atrasados' && !r.atrasado && r.tipo !== 'justificativa') return false;
    if (f === 'nc' && r.resultado !== 'nao_conforme') return false;
    if (!q) return true;
    return [t.nome, eqDe(t.eq)?.nome, r.usuario_nome, r.observacao, r.justificativa].join(' ').toLowerCase().includes(q);
  });
  const vis = regs.slice(0, 300);
  return `
    <div class="page-head"><div><div class="eyebrow">${S.regs.length} registros</div><h1 class="large-title">Histórico</h1></div>
      <button class="btn btn-tinted btn-sm" data-acao="csv">${ic('download')}Exportar planilha</button></div>
    <div class="toolbar">
      <label class="search"><span class="sr">Buscar</span>${ic('search')}<input class="input" id="busca" type="search" placeholder="Buscar teste, equipamento ou pessoa" value="${esc(S.busca)}"></label>
      <div class="seg" role="group" aria-label="Filtro">
        <button data-filtro-hist="todos" aria-pressed="${f === 'todos'}">Todos</button>
        <button data-filtro-hist="atrasados" aria-pressed="${f === 'atrasados'}">Com justificativa</button>
        <button data-filtro-hist="nc" aria-pressed="${f === 'nc'}">Não conformes</button>
      </div>
    </div>
    <div class="group" id="hist-lista">${vis.length ? vis.map(r => {
      const t = testeDe(r.teste_id), e = eqDe(t.eq);
      const just = r.tipo === 'justificativa';
      const ico = just ? `<div class="cell-ico" style="background:var(--amber-tint);color:var(--amber)">${ic('pencil')}</div>`
        : r.resultado === 'nao_conforme' ? `<div class="cell-ico" style="background:var(--red-tint);color:var(--red)">${ic('xCircle')}</div>`
        : r.tipo !== 'execucao' ? `<div class="cell-ico">${ic(r.tipo === 'concluido' ? 'shield' : 'doc')}</div>`
        : `<div class="cell-ico" style="background:var(--green-tint);color:var(--green)">${ic('check')}</div>`;
      const extra = r.justificativa || r.observacao;
      return `<button class="cell" data-teste="${esc(t.id)}">${ico}<div class="cell-body"><div class="cell-title">${esc(t.nome)}</div>
        <div class="cell-sub">${rotuloReg(r)} · ${esc(e?.nome)} · ${esc(r.usuario_nome || '')}${extra ? ' · ' + esc(extra.slice(0, 90)) : ''}</div></div>
        <div class="cell-trail"><span class="small">${fmtData(r.data)}</span>${r.atrasado && !just ? '<span class="tag">Com atraso</span>' : ''}</div></button>`;
    }).join('') : `<div class="empty">Nenhum registro encontrado.</div>`}</div>
    ${regs.length > vis.length ? `<p class="note">Mostrando os 300 mais recentes. Use a busca ou exporte a planilha para ver tudo.</p>` : ''}`;
}

function telaAjustes() {
  const perm = typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission;
  const ios = /iPhone|iPad/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches;
  return `
    <div class="page-head"><div><h1 class="large-title">Ajustes</h1></div></div>
    <div class="two-col"><div>
      <section class="section"><div class="section-head"><h2 class="section-title">Conta</h2></div>
        <div class="group">
          <div class="cell"><div class="cell-ico">${ic('user')}</div><div class="cell-body"><div class="cell-title">${esc(S.user.nome)}</div><div class="cell-sub">${esc(S.user.email)} · ${S.user.admin ? 'Administrador' : 'Equipe'}</div></div></div>
          <button class="cell" data-acao="sair"><div class="cell-ico" style="background:var(--red-tint);color:var(--red)">${ic('logout')}</div><div class="cell-body"><div class="cell-title" style="color:var(--red)">Sair</div></div></button>
        </div></section>
      <section class="section"><div class="section-head"><h2 class="section-title">Avisos</h2></div>
        <div class="group">
          <button class="cell" data-acao="notif" role="switch" aria-checked="${perm === 'granted'}" ${perm === 'denied' ? 'disabled' : ''}><div class="cell-ico">${ic('bell')}</div>
            <div class="cell-body"><div class="cell-title">Notificações neste aparelho</div><div class="cell-sub">${perm === 'granted' ? 'Ativadas' : perm === 'denied' ? 'Bloqueadas no navegador. Libere nas configurações do site.' : perm === 'indisponivel' ? 'Este navegador não suporta notificações.' : 'Toque para ativar'}</div></div><div class="switch"></div></button>
          ${perm === 'granted' ? `<button class="cell" data-acao="testar-notif"><div class="cell-ico">${ic('sparkle')}</div><div class="cell-body"><div class="cell-title">Enviar aviso de teste</div></div></button>` : ''}
        </div>
        <p class="note">Você recebe um aviso no início de cada mês com os testes que vencem no mês seguinte, e lembretes quando um teste atrasa.${ios ? ' No iPhone, toque em Compartilhar e "Adicionar à Tela de Início" para instalar o app e liberar os avisos.' : ''}</p>
      </section>
      <section class="section"><div class="section-head"><h2 class="section-title">Atualização</h2><span class="section-sub">O app se atualiza sozinho ao ser aberto</span></div>
        <div class="group">
          <button class="cell" data-acao="atualizar"><div class="cell-ico" style="background:var(--royal-tint);color:var(--royal)">${ic('download')}</div><div class="cell-body"><div class="cell-title">Atualizar agora</div><div class="cell-sub">Baixa a versão mais recente do app e os dados do banco. Seus registros não são afetados.</div></div><div class="cell-trail">${ic('chevR', 'i chev')}</div></button>
        </div></section>
      <section class="section"><div class="section-head"><h2 class="section-title">Sobre</h2></div>
        <div class="group">
          <div class="cell"><div class="cell-ico">${ic('shield')}</div><div class="cell-body"><div class="cell-title">Norma de referência</div><div class="cell-sub">${NORMA}. Anexos II (gama câmara), III (sondas), IV (PET/CT) e V (ativímetro); Arts. 20 e 26 (monitores).</div></div></div>
          <div class="cell"><div class="cell-ico">${ic('doc')}</div><div class="cell-body"><div class="cell-title">Regra de vencimento</div><div class="cell-sub">Testes mensais ou mais longos vencem no mês em que completam a periodicidade. Diários e semanais vencem no dia. Registro feito depois do vencimento exige justificativa.</div></div></div>
          <div class="cell"><div class="cell-ico">${ic('atom')}</div><div class="cell-body"><div class="cell-title">Armazenamento</div><div class="cell-sub">${store.modo === 'demo' ? 'Modo demonstração: os dados ficam só neste navegador.' : 'Nuvem: dados compartilhados com a equipe autorizada.'}</div></div></div>
          ${store.modo === 'demo' ? `<button class="cell" data-acao="reset-demo"><div class="cell-ico" style="background:var(--red-tint);color:var(--red)">${ic('trash')}</div><div class="cell-body"><div class="cell-title" style="color:var(--red)">Reiniciar demonstração</div><div class="cell-sub">Volta aos dados importados da planilha</div></div></button>` : ''}
        </div></section>
    </div><div>
      ${S.user.admin ? `<section class="section"><div class="section-head"><h2 class="section-title">Pessoas autorizadas</h2><span class="section-sub">Só esses e-mails conseguem criar conta</span></div>
        <div class="group" id="autorizados"><div class="empty">Carregando…</div></div>
        <div style="margin-top:10px"><button class="btn btn-tinted btn-sm" data-acao="autorizar">${ic('plus')}Autorizar pessoa</button></div></section>
      <section class="section"><div class="section-head"><h2 class="section-title">Periodicidades</h2></div>
        <p class="note" style="margin-top:0">Para mudar a periodicidade de um teste, abra o teste e toque em "Editar periodicidade".</p></section>` : ''}
    </div></div>`;
}

// ---------------- render ----------------
function render() {
  if (!S.user) return;
  const r = rota();
  const telas = { inicio: telaInicio, quadro: telaQuadro, equipamentos: telaEquipamentos, equip: () => telaEquip(r.arg), agenda: telaAgenda, historico: telaHistorico, ajustes: telaAjustes };
  $app.innerHTML = shell((telas[r.id] || telaInicio)());
  if (r.id === 'ajustes' && S.user.admin) carregarAutorizados();
  const b = document.getElementById('busca');
  if (b) b.addEventListener('input', () => { S.busca = b.value; const pos = b.selectionStart; render(); const nb = document.getElementById('busca'); nb.focus(); nb.setSelectionRange(pos, pos); });
}

document.addEventListener('click', async ev => {
  if (ignorarClique) return;
  const el = ev.target.closest('[data-teste],[data-rotina],[data-go],[data-acao],[data-filtro-eq],[data-filtro-hist]');
  if (!el || el.closest('#sheet-root')) return;
  if (el.dataset.teste) return abrirTeste(el.dataset.teste);
  if (el.dataset.rotina) return abrirRotina(el.dataset.rotina);
  if (el.dataset.go) return document.querySelector(el.dataset.go)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (el.dataset.filtroEq) { S.filtroEquip = el.dataset.filtroEq; return render(); }
  if (el.dataset.filtroHist) { S.filtroHist = el.dataset.filtroHist; return render(); }
  const a = el.dataset.acao;
  if (a === 'notif') return ativarNotificacoes();
  if (a === 'atualizar') { toast('Buscando a versão mais recente…'); return setTimeout(aplicarAtualizacao, 500); }
  if (a === 'testar-notif') return notificar('Controle de CQ', 'Os avisos estão funcionando neste aparelho.');
  if (a === 'sair') { await store.sair(); S.user = null; return telaLogin(); }
  if (a === 'csv') return exportarCSV();
  if (a === 'autorizar') return abrirAutorizar();
  if (a === 'novo-teste') return abrirNovoTeste(el.dataset.eq);
  if (a === 'excluir-teste') return abrirExcluirTeste(el.dataset.eq);
  if (a === 'reset-demo') { if (confirmar()) { await store.reiniciarDemo(); await store.entrar(S.user.email, '', S.user.nome); await carregar(); render(); toast('Demonstração reiniciada'); } }
  if (a === 'desautorizar') { await store.desautorizar(el.dataset.email); carregarAutorizados(); toast('Acesso removido'); }
});
function confirmar() { return true; }

// ---------------- sheets ----------------
function abrirSheet({ titulo, corpo, acao, aoAbrir }) {
  $sheetRoot.innerHTML = `<div class="backdrop"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(titulo)}">
      <div class="grabber"></div>
      <div class="sheet-head"><button class="btn-plain start link-btn" data-fechar>Cancelar</button><h3>${esc(titulo)}</h3><div class="end">${acao || ''}</div></div>
      <div class="sheet-body">${corpo}</div></div>`;
  const bd = $sheetRoot.querySelector('.backdrop'), sh = $sheetRoot.querySelector('.sheet');
  requestAnimationFrame(() => { bd.classList.add('show'); sh.classList.add('show'); });
  const fechar = () => { bd.classList.remove('show'); sh.classList.remove('show'); setTimeout(() => { if ($sheetRoot.contains(sh)) $sheetRoot.innerHTML = ''; }, 320); document.removeEventListener('keydown', esc_); };
  const esc_ = e => { if (e.key === 'Escape') fechar(); };
  document.addEventListener('keydown', esc_);
  bd.addEventListener('click', fechar);
  sh.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fechar));
  // arrastar para fechar (celular)
  let y0 = null; const gr = sh.querySelector('.grabber'), hd = sh.querySelector('.sheet-head');
  [gr, hd].forEach(h => { h.addEventListener('touchstart', e => { y0 = e.touches[0].clientY; sh.style.transition = 'none'; }, { passive: true });
    h.addEventListener('touchmove', e => { if (y0 == null) return; const dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = `translateY(${dy}px)`; }, { passive: true });
    h.addEventListener('touchend', e => { if (y0 == null) return; const dy = e.changedTouches[0].clientY - y0; sh.style.transition = ''; sh.style.transform = ''; y0 = null; if (dy > 110) fechar(); }); });
  aoAbrir?.(sh, fechar);
  return { sh, fechar };
}

function abrirTeste(id) {
  const t = testeDe(id); if (!t) return;
  const e = eqDe(t.eq), s = S.sit.get(id);
  const regs = [...(S.porTeste.get(id) || [])].sort((a, b) => b.data.localeCompare(a.data) || (b.created_at || '').localeCompare(a.created_at || ''));
  const rotina = ehRotina(t.per), et = etapas(t);
  const corpo = `
    <div class="sheet-hero"><div class="eq-ico">${ic(e.icone)}</div><h2>${esc(t.nome)}</h2><p>${esc(e.nome)} · ${esc(t.anexo || '')}</p><div style="margin-top:10px">${pill(t)}</div></div>
    <div class="facts">
      <div class="fact"><span>Periodicidade</span><b>${nomePer(t.per)}</b></div>
      <div class="fact"><span>Última</span><b>${s.ultima ? fmtVenc(s.ultima.data, porMes(t.per) ? t.per : { u: 'd' }) : '—'}</b></div>
      <div class="fact"><span>Vencimento</span><b>${s.venc ? fmtVenc(s.venc, t.per) : '—'}</b></div>
    </div>
    ${s.estado === 'atrasado' ? `<div class="alert red">${ic('alert')}<div><b>Venceu em ${fmtVenc(s.venc, t.per)} (${s.atraso} de atraso)</b>${s.justificativa ? `Justificado em ${fmtData(s.justificativa.data)}: ${esc(s.justificativa.justificativa)}` : 'Ao registrar a execução você precisará escrever a justificativa do atraso.'}</div></div>` : ''}
    ${t.tol ? `<div class="alert blue">${ic('shield')}<div><b>Tolerância</b>${esc(t.tol)}</div></div>` : ''}
    ${t.nota ? `<p class="note" style="margin:-4px 4px 14px">${esc(t.nota)}</p>` : ''}
    ${stepper(t)}
    <button class="btn ${et.n > 0 && et.n < 3 ? 'btn-tinted' : 'btn-primary'} btn-block" data-registrar>${ic('plus')}${s.ultima ? 'Registrar nova execução' : 'Registrar teste realizado'}</button>
    ${s.estado === 'atrasado' ? `<button class="btn btn-tinted btn-block" style="margin-top:8px" data-justificar>${ic('pencil')}Justificar atraso sem executar</button>` : ''}
    ${S.user.admin ? `<button class="btn btn-plain btn-block" style="margin-top:4px" data-editar>${ic('pencil')}Editar ou excluir teste</button>` : ''}
    <div class="section" style="margin-top:22px"><div class="section-head"><h2 class="section-title" style="font-size:18px">Histórico</h2><span class="section-sub">${regs.length} registro${regs.length === 1 ? '' : 's'}</span></div>
      ${regs.length ? `<div class="group" style="padding:14px 14px 2px"><ul class="timeline">${regs.slice(0, 40).map(r => `
        <li class="${r.tipo === 'justificativa' ? 'j' : r.resultado === 'nao_conforme' ? 'n' : r.tipo !== 'execucao' ? 'r' : ''}"><b>${fmtData(r.data)} · ${rotuloReg(r)}</b>
        <p>${esc(r.usuario_nome || '')}${r.atrasado ? ' · com atraso' : ''}</p>
        ${r.justificativa ? `<p><b style="font-size:13px">Justificativa:</b> ${esc(r.justificativa)}</p>` : ''}${r.observacao ? `<p>${esc(r.observacao)}</p>` : ''}</li>`).join('')}</ul></div>`
      : `<div class="group"><div class="empty">Nenhum registro ainda.</div></div>`}
    </div>`;
  abrirSheet({ titulo: rotina ? 'Teste diário' : 'Teste', corpo, aoAbrir: (sh, fechar) => {
    sh.querySelector('[data-registrar]').onclick = () => { fechar(); setTimeout(() => abrirRegistro(id), 200); };
    sh.querySelectorAll('[data-etapa]').forEach(b => b.onclick = () => {
      const tipos = b.dataset.etapa === 'ambos' ? ['relatorio', 'concluido'] : [b.dataset.etapa];
      const salvar = async just => {
        for (const [i, tipo] of tipos.entries()) await store.registrar([{ teste_id: id, data: hojeISO(), tipo, ref_id: s.ultima.id, resultado: null, observacao: null, justificativa: i === 0 ? just : null, atrasado: i === 0 && !!just }]);
        await carregar(); render();
        toast(tipos.includes('concluido') ? 'Relatório assinado. As 3 etapas estão feitas.' : `Relatório realizado. Assinatura até ${fmtDM(somaDiasUteis(hojeISO(), PRAZO_ETAPA))}`);
      };
      fechar();
      if (et.atrasada) return setTimeout(() => abrirJustEtapa(t, et, tipos[0], salvar), 220);
      b.disabled = true;
      salvar(null).then(() => setTimeout(() => abrirTeste(id), 250)).catch(e2 => toast(e2.message));
    });
    sh.querySelector('[data-justificar]')?.addEventListener('click', () => { fechar(); setTimeout(() => abrirJustificativa(id), 200); });
    sh.querySelector('[data-editar]')?.addEventListener('click', () => { fechar(); setTimeout(() => abrirEditar(id), 200); });
  } });
}

function abrirJustEtapa(t, et, tipo, salvar) {
  const o = tipo === 'relatorio' ? 'O relatório' : 'A assinatura';
  abrirSheet({ titulo: 'Fora do prazo', corpo: `
    <div class="sheet-hero" style="padding-bottom:12px"><h2>${esc(t.nome)}</h2><p>${esc(eqDe(t.eq).nome)}</p></div>
    <form id="f-je" novalidate>
      <div class="alert red">${ic('alert')}<div><b>${o} passou do prazo de ${PRAZO_ETAPA} dias úteis</b>O prazo era ${fmtData(et.prazo)}. Explique o motivo para concluir a etapa.</div></div>
      <label class="field"><span>Justificativa (obrigatória)</span><textarea class="input" name="just" placeholder="Ex.: responsável pela assinatura ausente até 13/11."></textarea></label>
      <div class="form-err" id="erro"></div><button class="btn btn-primary btn-block" type="submit">Salvar e marcar etapa</button></form>`,
  aoAbrir: (sh, fechar) => { const f = sh.querySelector('#f-je');
    f.onsubmit = async ev => { ev.preventDefault(); const j = f.just.value.trim();
      if (j.length < 10) { f.just.classList.add('err'); sh.querySelector('#erro').textContent = 'Escreva pelo menos 10 caracteres.'; return; }
      try { await salvar(j); fechar(); } catch (e2) { sh.querySelector('#erro').textContent = e2.message; } }; } });
}

function stepper(t) {
  const s = S.sit.get(t.id), et = etapas(t);
  if (!s.ultima) return `<div class="steps"><div class="steps-head"><b>Etapas</b><span>0 de 3</span></div>${ETAPAS.map((e, i) => `<div class="step"><span class="step-n">${i + 1}</span><div class="step-b"><b>${e.nome}</b><span>Pendente</span></div></div>`).join('')}</div>`;
  const quem = r => r ? `${fmtData(r.data)} · ${esc(r.usuario_nome || '')}` : '';
  const info = [quem(s.ultima), et.importado ? 'Importado da planilha' : quem(et.relatorio), et.importado ? 'Importado da planilha' : quem(et.concluido)];
  const acao = i => i === 1 && et.n === 1 ? `<button class="btn btn-primary btn-sm" data-etapa="relatorio">Marcar</button>`
    : i === 2 && et.n === 2 ? `<button class="btn btn-primary btn-sm" data-etapa="concluido">Marcar</button>` : '';
  return `<div class="steps"><div class="steps-head"><b>Etapas do teste de ${fmtMes(s.ultima.data)}</b><span>${et.n} de 3</span></div>
    ${ETAPAS.map((e, i) => `<div class="step ${i < et.n ? 'done' : i === et.n ? 'next' : ''}"><span class="step-n">${i < et.n ? ic('check', '') : i + 1}</span>
      <div class="step-b"><b>${e.nome}</b><span>${i < et.n ? info[i] : i === et.n ? (et.atrasada ? `<b class="tarde">Atrasado. O prazo era ${fmtData(et.prazo)}</b>` : `Prazo: até ${fmtData(et.prazo)}`) : `Até ${PRAZO_ETAPA} dias úteis depois do relatório`}</span></div>${acao(i)}</div>`).join('')}
    ${et.n === 1 && !et.atrasada ? `<button class="btn btn-plain btn-sm steps-all" data-etapa="ambos">Marcar relatório realizado e assinado de uma vez</button>` : ''}</div>`;
}

function abrirRegistro(id, colAlvo = 1) {
  const t = testeDe(id), e = eqDe(t.eq), regs = S.porTeste.get(id) || [];
  const hoje = hojeISO();
  const corpo = `
    <div class="sheet-hero" style="padding-bottom:12px"><h2>${esc(t.nome)}</h2><p>${esc(e.nome)} · ${nomePer(t.per)}</p></div>
    <form id="f-reg" novalidate>
      <label class="field"><span>Data da execução</span><input class="input" type="date" name="data" value="${hoje}" max="${hoje}" required></label>
      <div class="field"><span>Resultado</span><div class="choice" role="group">
        <button type="button" class="ok" data-res="conforme" aria-pressed="true">${ic('checkCircle')}Conforme</button>
        <button type="button" class="nok" data-res="nao_conforme" aria-pressed="false">${ic('xCircle')}Não conforme</button></div></div>
      <div id="bloco-just"></div>
      <label class="field"><span id="lbl-obs">Observação (opcional)</span><textarea class="input" name="obs" placeholder="Valores medidos, fonte usada, nº do relatório…"></textarea></label>
      <div class="field"><span>Etapas concluídas</span><div class="group etapas-chk">
        <div class="check-row" aria-checked="true" style="opacity:.75"><span class="check">${ic('check', '')}</span><span class="cell-body"><span class="cell-title">1. Teste realizado</span></span></div>
        <button type="button" class="check-row" role="checkbox" aria-checked="false" data-et="relatorio"><span class="check">${ic('check', '')}</span><span class="cell-body"><span class="cell-title">2. Relatório realizado</span></span></button>
        <button type="button" class="check-row" role="checkbox" aria-checked="false" data-et="concluido"><span class="check">${ic('check', '')}</span><span class="cell-body"><span class="cell-title">3. Relatório assinado</span></span></button>
      </div><p class="hint">Depois do teste há ${PRAZO_ETAPA} dias úteis para o relatório e mais ${PRAZO_ETAPA} dias úteis para a assinatura.</p></div>
      <div class="alert blue" id="prox">${ic('calendar')}<div></div></div>
      <div class="form-err" id="erro"></div>
      <button class="btn btn-primary btn-block" type="submit">Registrar</button>
    </form>`;
  abrirSheet({ titulo: 'Registrar', corpo, aoAbrir: (sh, fechar) => {
    const f = sh.querySelector('#f-reg'); let res = 'conforme';
    const atualizar = () => {
      const data = f.data.value || hoje;
      const precisa = exigeJustificativa(t, regs, data);
      const bj = sh.querySelector('#bloco-just');
      if (precisa && !bj.innerHTML) {
        const ult = ultimaExecucao(regs.filter(r => r.data <= data));
        bj.innerHTML = `<div class="alert red">${ic('alert')}<div><b>Execução fora do prazo</b>O vencimento era ${fmtVenc(somaPer(ult.data, t.per), t.per)}. Explique por que o teste não foi feito na data prevista.</div></div>
          <label class="field"><span>Justificativa do atraso (obrigatória)</span><textarea class="input" name="just" placeholder="Ex.: equipamento em manutenção de 03/10 a 20/10; fonte de Gálio indisponível…"></textarea></label>`;
      } else if (!precisa) bj.innerHTML = '';
      sh.querySelector('#lbl-obs').textContent = res === 'nao_conforme' ? 'Descreva a não conformidade (obrigatório)' : 'Observação (opcional)';
      sh.querySelector('#prox div').innerHTML = `<b>Próximo vencimento</b>${fmtVenc(somaPer(data, t.per), t.per)}`;
    };
    const bRel = sh.querySelector('[data-et=relatorio]'), bCon = sh.querySelector('[data-et=concluido]');
    const on = b => b.getAttribute('aria-checked') === 'true', set = (b, v) => b.setAttribute('aria-checked', v);
    bRel.onclick = () => { set(bRel, !on(bRel)); if (!on(bRel)) set(bCon, false); };
    bCon.onclick = () => { set(bCon, !on(bCon)); if (on(bCon)) set(bRel, true); };
    if (colAlvo >= 2) set(bRel, true); if (colAlvo >= 3) set(bCon, true);
    f.data.addEventListener('input', atualizar);
    sh.querySelectorAll('[data-res]').forEach(b => b.onclick = () => { res = b.dataset.res; sh.querySelectorAll('[data-res]').forEach(x => x.setAttribute('aria-pressed', x === b)); atualizar(); });
    atualizar();
    f.onsubmit = async ev => {
      ev.preventDefault();
      const data = f.data.value, just = f.just?.value.trim(), obs = f.obs.value.trim();
      const erro = sh.querySelector('#erro'); erro.textContent = ''; f.querySelectorAll('.err').forEach(x => x.classList.remove('err'));
      if (!data || data > hoje) { f.data.classList.add('err'); erro.textContent = 'Informe uma data até hoje.'; return; }
      const precisa = exigeJustificativa(t, regs, data);
      if (precisa && (!just || just.length < 10)) { f.just.classList.add('err'); f.just.focus(); erro.textContent = 'Escreva a justificativa do atraso (pelo menos 10 caracteres).'; return; }
      if (res === 'nao_conforme' && obs.length < 5) { f.obs.classList.add('err'); f.obs.focus(); erro.textContent = 'Descreva a não conformidade.'; return; }
      const btn = f.querySelector('[type=submit]'); btn.disabled = true; btn.textContent = 'Salvando…';
      try {
        const [ex] = await store.registrar([{ teste_id: id, data, tipo: 'execucao', resultado: res, observacao: obs || null, justificativa: precisa ? just : null, atrasado: precisa }]);
        const noPrazo = hojeISO() <= somaDiasUteis(data, PRAZO_ETAPA);
        for (const [b, tipo] of [[bRel, 'relatorio'], [bCon, 'concluido']]) if (on(b) && noPrazo) await store.registrar([{ teste_id: id, data: hojeISO(), tipo, ref_id: ex.id, resultado: null, observacao: null, justificativa: null, atrasado: false }]);
        await carregar(); render(); fechar();
        if (on(bRel) && !noPrazo) { toast('Teste registrado. O relatório está fora do prazo: marque a etapa com a justificativa.'); setTimeout(() => abrirTeste(id), 300); }
        else toast(on(bRel) ? `Registrado. Próximo vencimento: ${fmtVenc(somaPer(data, t.per), t.per)}` : `Teste registrado. Relatório até ${fmtDM(somaDiasUteis(data, PRAZO_ETAPA))}`);
      } catch (e2) { erro.textContent = e2.message; btn.disabled = false; btn.textContent = 'Registrar'; }
    };
  } });
}

function abrirJustificativa(id) {
  const t = testeDe(id), e = eqDe(t.eq), s = S.sit.get(id);
  abrirSheet({ titulo: 'Justificar atraso', corpo: `
    <div class="sheet-hero" style="padding-bottom:12px"><h2>${esc(t.nome)}</h2><p>${esc(e.nome)} · venceu em ${fmtVenc(s.venc, t.per)}</p></div>
    <form id="f-j" novalidate>
      <div class="alert amber">${ic('alert')}<div><b>O teste continua pendente</b>A justificativa fica registrada no histórico. O teste segue como atrasado até ser executado.</div></div>
      <label class="field"><span>Por que o teste não foi feito na data prevista?</span><textarea class="input" name="just" placeholder="Ex.: equipamento parado aguardando peça desde 05/11."></textarea></label>
      <div class="form-err" id="erro"></div>
      <button class="btn btn-primary btn-block" type="submit">Salvar justificativa</button></form>`,
  aoAbrir: (sh, fechar) => {
    const f = sh.querySelector('#f-j');
    f.onsubmit = async ev => { ev.preventDefault(); const j = f.just.value.trim();
      if (j.length < 10) { f.just.classList.add('err'); sh.querySelector('#erro').textContent = 'Escreva pelo menos 10 caracteres.'; return; }
      try { await store.registrar([{ teste_id: id, data: hojeISO(), tipo: 'justificativa', resultado: null, observacao: null, justificativa: j, atrasado: true }]);
        await carregar(); render(); fechar(); toast('Justificativa registrada'); } catch (e2) { sh.querySelector('#erro').textContent = e2.message; } };
  } });
}

function abrirRotina(eqId) {
  const e = eqDe(eqId), ts = rotinas(eqId), hoje = hojeISO();
  const marcados = new Set(ts.filter(t => !feitoHoje(t)).map(t => t.id));
  abrirSheet({ titulo: 'Rotina de hoje', corpo: `
    <div class="sheet-hero" style="padding-bottom:12px"><div class="eq-ico">${ic(e.icone)}</div><h2>${esc(e.nome)}</h2><p>Marque os testes diários feitos hoje</p></div>
    <div class="group" style="margin-bottom:14px">${ts.map(t => `<button type="button" class="check-row" data-chk="${t.id}" role="checkbox" aria-checked="${marcados.has(t.id)}" ${feitoHoje(t) ? 'disabled style="opacity:.55"' : ''}>
      <span class="check">${ic('check', '')}</span><span class="cell-body"><span class="cell-title" style="display:block">${esc(t.nome)}</span>${feitoHoje(t) ? '<span class="cell-sub">Já registrado hoje</span>' : t.tol ? `<span class="cell-sub">Tolerância ${esc(t.tol)}</span>` : ''}</span></button>`).join('')}</div>
    <label class="field"><span>Observação (opcional)</span><textarea class="input" id="obs-rot" placeholder="Se algum teste ficou fora da tolerância, registre-o individualmente como não conforme."></textarea></label>
    <div class="form-err" id="erro"></div>
    <button class="btn btn-primary btn-block" id="salvar-rot">Registrar <span id="n-rot"></span></button>`,
  aoAbrir: (sh, fechar) => {
    const upd = () => { sh.querySelector('#n-rot').textContent = marcados.size ? `${marcados.size} teste${marcados.size > 1 ? 's' : ''}` : ''; sh.querySelector('#salvar-rot').disabled = !marcados.size; };
    sh.querySelectorAll('[data-chk]').forEach(b => b.onclick = () => { const id = b.dataset.chk; marcados.has(id) ? marcados.delete(id) : marcados.add(id); b.setAttribute('aria-checked', marcados.has(id)); upd(); });
    upd();
    sh.querySelector('#salvar-rot').onclick = async () => {
      const obs = sh.querySelector('#obs-rot').value.trim() || null;
      try { await store.registrar([...marcados].map(id => ({ teste_id: id, data: hoje, tipo: 'execucao', resultado: 'conforme', observacao: obs, justificativa: null, atrasado: false })));
        await carregar(); render(); fechar(); toast('Rotina registrada'); } catch (e2) { sh.querySelector('#erro').textContent = e2.message; }
    };
  } });
}

const OPC_PER = [['1m', 'Mensal'], ['3m', 'Trimestral'], ['6m', 'Semestral'], ['12m', 'Anual'], ['24m', 'Bienal']];
const lerPer = v => { const m = v.match(/(\d+)(\w)/); return { n: +m[1], u: m[2] }; };
function abrirEditar(id) {
  const t = testeDe(id);
  const atual = `${t.per.n}${t.per.u}`;
  const temReg = (S.porTeste.get(id) || []).length;
  abrirSheet({ titulo: 'Editar teste', corpo: `
    <div class="sheet-hero" style="padding-bottom:12px"><h2>${esc(t.nome)}</h2><p>${esc(eqDe(t.eq).nome)}</p></div>
    <form id="f-ed"><label class="field"><span>Nome do teste</span><input class="input" name="nome" value="${esc(t.nome)}" maxlength="120"></label>
    <label class="field"><span>Periodicidade</span><select class="input" name="per">${OPC_PER.map(([v, l]) => `<option value="${v}" ${v === atual ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>Tolerância (opcional)</span><input class="input" name="tol" value="${esc(t.tol || '')}" maxlength="80"></label>
    <label class="field"><span>Nota</span><textarea class="input" name="nota">${esc(t.nota || '')}</textarea></label>
    <div class="form-err" id="erro"></div><button class="btn btn-primary btn-block">Salvar</button></form>
    <button class="btn btn-danger btn-block" style="margin-top:10px" id="excluir">${ic('trash')}Excluir teste</button>
    <div id="conf-exc" hidden><div class="alert red" style="margin-top:12px">${ic('alert')}<div><b>Excluir este teste?</b>Ele sai do painel, do quadro e da agenda.${temReg ? ` Os ${temReg} registros já feitos continuam no histórico.` : ''}</div></div>
    <button class="btn btn-danger btn-block" id="excluir-sim">Sim, excluir</button></div>`,
  aoAbrir: (sh, fechar) => { const f = sh.querySelector('#f-ed');
    f.onsubmit = async ev => { ev.preventDefault();
      const nome = f.nome.value.trim(); if (nome.length < 3) return (sh.querySelector('#erro').textContent = 'Escreva o nome do teste.');
      try { await store.atualizarTeste(id, { nome, per: lerPer(f.per.value), tol: f.tol.value.trim() || null, nota: f.nota.value.trim() || null }); await carregar(); render(); fechar(); toast('Teste atualizado'); }
      catch (e2) { sh.querySelector('#erro').textContent = e2.message; } };
    sh.querySelector('#excluir').onclick = ev => { ev.currentTarget.hidden = true; const c = sh.querySelector('#conf-exc'); c.hidden = false; c.scrollIntoView({ block: 'nearest' }); };
    sh.querySelector('#excluir-sim').onclick = async ev => { ev.currentTarget.disabled = true;
      try { await store.atualizarTeste(id, { ativo: false }); await carregar(); render(); fechar(); toast('Teste excluído'); }
      catch (e2) { ev.currentTarget.disabled = false; sh.querySelector('#erro').textContent = e2.message; } }; } });
}
function abrirExcluirTeste(eq) {
  const e = eqDe(eq), ts = S.testes.filter(t => t.eq === eq);
  abrirSheet({ titulo: 'Excluir teste', corpo: `
    <div class="sheet-hero" style="padding-bottom:12px"><div class="eq-ico" style="${grad(eq)}">${ic(e.icone)}</div><h2>${esc(e.nome)}</h2><p>Escolha o teste que será excluído</p></div>
    <div class="list" id="lista-exc" style="max-height:46vh;overflow:auto">${ts.map(t => `<label class="cell" style="cursor:pointer"><input type="radio" name="exc" value="${esc(t.id)}" style="width:20px;height:20px;accent-color:var(--red);flex:none"><div class="cell-body"><div class="cell-title">${esc(t.nome)}</div><div class="cell-sub">${nomePer(t.per)}</div></div></label>`).join('') || '<p class="note">Este equipamento não tem testes.</p>'}</div>
    <div class="alert red" id="aviso-exc" style="margin-top:12px" hidden>${ic('alert')}<div><b>Excluir este teste?</b><span id="txt-exc"></span></div></div>
    <div class="form-err" id="erro"></div>
    <button class="btn btn-danger btn-block" id="excluir-sim" style="margin-top:12px" disabled>${ic('trash')}Excluir teste selecionado</button>`,
  aoAbrir: (sh, fechar) => { const b = sh.querySelector('#excluir-sim'); let id = null;
    sh.querySelector('#lista-exc').onchange = ev => { id = ev.target.value; const n = (S.porTeste.get(id) || []).length; b.disabled = false;
      sh.querySelector('#txt-exc').textContent = `"${testeDe(id).nome}" sai do painel, do quadro e da agenda.${n ? ` Os ${n} registros já feitos continuam no histórico.` : ''}`; sh.querySelector('#aviso-exc').hidden = false; };
    b.onclick = async () => { if (!id) return; b.disabled = true;
      try { await store.atualizarTeste(id, { ativo: false }); await carregar(); render(); fechar(); toast('Teste excluído'); }
      catch (e2) { b.disabled = false; sh.querySelector('#erro').textContent = e2.message; } }; } });
}
function abrirNovoTeste(eq) {
  const e = eqDe(eq);
  abrirSheet({ titulo: 'Novo teste', corpo: `
    <div class="sheet-hero" style="padding-bottom:12px"><div class="eq-ico" style="${grad(eq)}">${ic(e.icone)}</div><h2>${esc(e.nome)}</h2><p>Novo teste periódico</p></div>
    <form id="f-novo"><label class="field"><span>Nome do teste</span><input class="input" name="nome" maxlength="120" placeholder="Ex.: Uniformidade intrínseca"></label>
    <label class="field"><span>Periodicidade</span><select class="input" name="per">${OPC_PER.map(([v, l]) => `<option value="${v}" ${v === '6m' ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <label class="field"><span>Tolerância (opcional)</span><input class="input" name="tol" maxlength="80"></label>
    <label class="field"><span>Nota (opcional)</span><textarea class="input" name="nota"></textarea></label>
    <div class="form-err" id="erro"></div><button class="btn btn-primary btn-block">Criar teste</button></form>`,
  aoAbrir: (sh, fechar) => { const f = sh.querySelector('#f-novo'); f.nome.focus();
    f.onsubmit = async ev => { ev.preventDefault();
      const nome = f.nome.value.trim(); if (nome.length < 3) return (sh.querySelector('#erro').textContent = 'Escreva o nome do teste.');
      if (S.testes.some(t => t.eq === eq && t.nome.toLowerCase() === nome.toLowerCase())) return (sh.querySelector('#erro').textContent = 'Este equipamento já tem um teste com esse nome.');
      try { await store.criarTeste({ eq, nome, per: lerPer(f.per.value), tol: f.tol.value.trim() || null, nota: f.nota.value.trim() || null }); await carregar(); render(); fechar(); toast('Teste criado'); }
      catch (e2) { sh.querySelector('#erro').textContent = e2.message; } }; } });
}

async function carregarAutorizados() {
  const box = document.getElementById('autorizados'); if (!box) return;
  try {
    const l = await store.listarAutorizados();
    box.innerHTML = l.length ? l.map(a => `<div class="cell"><div class="cell-ico">${ic(a.admin ? 'shield' : 'user')}</div><div class="cell-body"><div class="cell-title">${esc(a.nome || a.email)}</div><div class="cell-sub">${esc(a.email)}${a.admin ? ' · Administrador' : ''}</div></div>
      ${a.email !== S.user.email ? `<button class="btn btn-danger btn-sm" data-acao="desautorizar" data-email="${esc(a.email)}">Remover</button>` : ''}</div>`).join('')
      : `<div class="empty">${store.modo === 'demo' ? 'No modo demonstração qualquer e-mail entra. Na versão final, só os e-mails desta lista.' : 'Ninguém autorizado ainda.'}</div>`;
  } catch (e) { box.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
}
function abrirAutorizar() {
  abrirSheet({ titulo: 'Autorizar pessoa', corpo: `<form id="f-a" novalidate>
    <label class="field"><span>Nome</span><input class="input" name="nome" autocomplete="off" required></label>
    <label class="field"><span>E-mail</span><input class="input" name="email" type="email" autocomplete="off" required></label>
    <button type="button" class="cell" role="switch" aria-checked="false" id="adm" style="padding-left:4px"><div class="cell-body"><div class="cell-title">Administrador</div><div class="cell-sub">Pode autorizar pessoas e mudar periodicidades</div></div><div class="switch"></div></button>
    <div class="form-err" id="erro"></div><button class="btn btn-primary btn-block">Autorizar</button>
    <p class="note">Depois, a pessoa abre o site, toca em "Criar conta" e usa este e-mail.</p></form>`,
  aoAbrir: (sh, fechar) => { const f = sh.querySelector('#f-a'), adm = sh.querySelector('#adm');
    adm.onclick = () => adm.setAttribute('aria-checked', adm.getAttribute('aria-checked') !== 'true');
    f.onsubmit = async ev => { ev.preventDefault(); const email = f.email.value.trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) { sh.querySelector('#erro').textContent = 'E-mail inválido.'; return; }
      try { await store.autorizar(email, f.nome.value.trim(), adm.getAttribute('aria-checked') === 'true'); fechar(); carregarAutorizados(); toast('Pessoa autorizada'); }
      catch (e2) { sh.querySelector('#erro').textContent = e2.message; } }; } });
}

// ---------------- notificações ----------------
let swReg = null;
// ---------- atualização do app ----------
// Compara a "assinatura" dos arquivos publicados com a que estava no ar quando o app abriu.
const ARQ_VERSAO = ['index.html', 'styles.css', 'config.js', 'sw.js', 'js/app.js', 'js/store.js', 'js/regras.js', 'js/catalogo.js', 'js/icones.js'];
let versaoAberta = null, conferidoEm = 0, atualizando = false;
async function assinatura() {
  try {
    const rs = await Promise.all(ARQ_VERSAO.map(f => fetch(f, { method: 'HEAD', cache: 'no-store' })));
    if (rs.some(r => !r.ok)) return null;
    const partes = rs.map(r => r.headers.get('etag') || r.headers.get('last-modified') || r.headers.get('content-length') || '');
    return partes.every(Boolean) ? partes.join('|') : null;
  } catch { return null; }
}
async function aplicarAtualizacao() {
  if (atualizando) return; atualizando = true;
  try { await swReg?.update(); } catch {}
  try { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch {}
  location.reload();
}
function avisoAtualizacao() {
  if (document.getElementById('atualiza')) return;
  const d = document.createElement('div'); d.id = 'atualiza'; d.className = 'atualiza';
  d.innerHTML = `<span>Há uma versão nova do app.</span><button class="btn btn-white btn-sm">Atualizar</button>`;
  d.querySelector('button').onclick = aplicarAtualizacao; document.body.appendChild(d);
}
async function conferirVersao(manual) {
  if (!manual && Date.now() - conferidoEm < 60000) return;
  conferidoEm = Date.now();
  const v = await assinatura();
  if (!v) { if (manual) toast('Sem conexão para conferir. Tente de novo.', 'alert'); return; }
  if (!versaoAberta) { versaoAberta = v; if (manual) toast('Você já está na versão mais recente'); return; }
  if (v === versaoAberta) { if (manual) toast('Você já está na versão mais recente'); return; }
  // não interrompe quem está no meio de um registro
  if (!manual && document.querySelector('#sheet-root .sheet')) return avisoAtualizacao();
  if (manual) toast('Atualizando…');
  aplicarAtualizacao();
}

async function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  try { swReg = await navigator.serviceWorker.register('sw.js'); } catch {}
}
function b64ToU8(b64) { const p = '='.repeat((4 - b64.length % 4) % 4); const r = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); }
async function ativarNotificacoes() {
  if (!('Notification' in window)) return toast('Este navegador não suporta notificações');
  if (Notification.permission === 'granted' && rota().id === 'ajustes') return toast('Para desativar, use as configurações do navegador');
  const p = await Notification.requestPermission();
  if (p !== 'granted') { render(); return toast('Notificações não autorizadas'); }
  if (store.modo === 'nuvem' && swReg?.pushManager) {
    try {
      const chave = CONFIG.VAPID_PUBLIC_KEY || await store.chavePush();
      if (!chave) throw new Error('chave de push ainda não disponível');
      const sub = await swReg.pushManager.getSubscription() || await swReg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(chave) });
      await store.salvarPush(sub);
    } catch (e) { console.warn('push', e); }
  }
  render(); toast('Avisos ativados');
  avisosLocais(true);
}
async function notificar(titulo, corpo, tag) {
  const opts = { body: corpo, icon: 'icons/icon-192.png', badge: 'icons/badge-72.png', tag: tag || 'cq', data: { url: location.href.split('#')[0] + '#inicio' } };
  try { if (swReg?.showNotification) return await swReg.showNotification(titulo, opts); new Notification(titulo, opts); } catch {}
}
// Na primeira entrada em cada aparelho, pede a permissão das notificações.
function pedirNotificacoes() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
  let visto = null; try { visto = sessionStorage.getItem('cqmn.pediu'); } catch {}
  if (visto) return; try { sessionStorage.setItem('cqmn.pediu', '1'); } catch {}
  setTimeout(() => abrirSheet({ titulo: 'Notificações', corpo: `
    <div class="sheet-hero"><div class="eq-ico" style="background:linear-gradient(145deg,#FFB547,#F57C00)">${ic('bell')}</div><h2>Permita as notificações</h2>
      <p>O controle depende dos avisos neste aparelho.</p></div>
    <div class="group" style="margin-bottom:16px">
      <div class="cell"><div class="cell-ico">${ic('calendar')}</div><div class="cell-body"><div class="cell-title">Testes do mês seguinte</div><div class="cell-sub">No início de cada mês</div></div></div>
      <div class="cell"><div class="cell-ico" style="background:var(--red-tint);color:var(--red)">${ic('alert')}</div><div class="cell-body"><div class="cell-title">Testes em atraso</div><div class="cell-sub">Lembrete semanal</div></div></div>
      <div class="cell"><div class="cell-ico" style="background:var(--amber-tint);color:var(--amber)">${ic('doc')}</div><div class="cell-body"><div class="cell-title">Relatório e assinatura</div><div class="cell-sub">Prazo de ${PRAZO_ETAPA} dias úteis em cada etapa</div></div></div>
    </div>
    <button class="btn btn-primary btn-block" id="perm">Permitir notificações</button>`,
    aoAbrir: (sh, fechar) => { sh.querySelector('#perm').onclick = () => { fechar(); ativarNotificacoes(); }; sh.querySelector('[data-fechar]').textContent = 'Agora não'; } }), 700);
}
// Avisos gerados no próprio aparelho, uma vez por mês (e lembrete semanal de atrasados).
function avisosLocais(forcar = false) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const c = contagens(), mesK = iso(mesRef(0)).slice(0, 7);
  const k1 = 'cqmn.aviso.prox.' + mesK;
  let lido = null; try { lido = localStorage.getItem(k1); } catch {}
  if ((forcar || !lido) && c.proximo.length) {
    const nomes = c.proximo.slice(0, 4).map(t => `${t.nome} (${eqDe(t.eq).nome})`).join('; ');
    notificar(`${c.proximo.length} teste${c.proximo.length > 1 ? 's' : ''} para ${nomeMes(1)}`, nomes + (c.proximo.length > 4 ? '…' : ''), 'prox-' + mesK);
    try { localStorage.setItem(k1, '1'); } catch {}
  }
  const rp = relPendentes(), k3 = 'cqmn.aviso.etapa.' + hojeISO();
  let lido3 = null; try { lido3 = localStorage.getItem(k3); } catch {}
  if ((forcar || !lido3) && rp.length) {
    const atr = rp.filter(t => etapas(t).atrasada).length;
    notificar(atr ? `${atr} relatório${atr > 1 ? 's' : ''} ou assinatura${atr > 1 ? 's' : ''} fora do prazo` : `${rp.length} relatório${rp.length > 1 ? 's' : ''} ou assinatura${rp.length > 1 ? 's' : ''} em aberto`,
      rp.slice(0, 4).map(t => `${t.nome} (${eqDe(t.eq).nome}): ${txtEtapa(etapas(t)).replace(/<[^>]+>/g, '')}`).join('; '), 'etapas');
    try { localStorage.setItem(k3, '1'); } catch {}
  }
  const sem = Math.floor(Date.now() / 6048e5), k2 = 'cqmn.aviso.atr.' + sem;
  let lido2 = null; try { lido2 = localStorage.getItem(k2); } catch {}
  if ((forcar || !lido2) && c.atrasado.length) {
    notificar(`${c.atrasado.length} teste${c.atrasado.length > 1 ? 's' : ''} atrasado${c.atrasado.length > 1 ? 's' : ''}`, c.atrasado.slice(0, 4).map(t => `${t.nome} (${eqDe(t.eq).nome})`).join('; '), 'atr');
    try { localStorage.setItem(k2, '1'); } catch {}
  }
}

// ---------------- exportar ----------------
function exportarCSV() {
  const linhas = [['Data', 'Equipamento', 'Teste', 'Periodicidade', 'Tipo', 'Resultado', 'Com atraso', 'Justificativa', 'Observação', 'Responsável']];
  [...S.regs].sort((a, b) => b.data.localeCompare(a.data)).forEach(r => { const t = testeDe(r.teste_id); if (!t) return;
    linhas.push([fmtData(r.data), eqDe(t.eq).nome, t.nome, nomePer(t.per), rotuloReg(r).split(' · ')[0], r.resultado === 'nao_conforme' ? 'Não conforme' : r.resultado ? 'Conforme' : '', r.atrasado ? 'Sim' : 'Não', r.justificativa || '', r.observacao || '', r.usuario_nome || '']); });
  const csv = '﻿' + linhas.map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `historico-cq-${hojeISO()}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------- toast ----------------
let tT;
function toast(msg, icone = 'checkCircle') { const el = document.getElementById('toast'); el.classList.toggle('aviso', icone !== 'checkCircle'); el.innerHTML = `${ic(icone)}<span>${esc(msg)}</span>`; el.classList.add('show'); clearTimeout(tT); tT = setTimeout(() => el.classList.remove('show'), 3200); }

// ---------------- login ----------------
function telaLogin(modo = 'entrar', msg = '') {
  const demo = store.modo === 'demo';
  const titulos = { entrar: ['Entrar', 'Use o e-mail autorizado pelo setor.'], criar: ['Criar conta', 'Só e-mails autorizados pelo administrador.'], senha: ['Redefinir senha', 'Enviaremos um link para o seu e-mail.'] };
  $app.innerHTML = `
  <div class="login">
    <section class="login-hero">
      <div class="brand"><div class="brand-mark">${ic('atom')}</div><div><b>Controle de CQ</b><span>${esc(CONFIG.NOME_SETOR)}</span></div></div>
      <ul class="login-feats">
        <li>${ic('checkCircle')}Registro do teste em poucos toques</li>
        <li>${ic('calendar')}Vencimento calculado pela periodicidade da norma</li>
        <li>${ic('bell')}Aviso no celular e no computador do que vence no mês seguinte</li>
        <li>${ic('pencil')}Justificativa obrigatória para testes fora do prazo</li>
      </ul>
      <h1 class="login-equipe"><span>As Meninas</span> <b>Superradioativas</b></h1>
      <div class="login-marca-box" hidden><img class="login-marca" src="icons/marca.png" alt="Marca da equipe" onload="this.parentNode.hidden=false" onerror="this.parentNode.remove()"></div>
      <p>Testes dos equipamentos de Medicina Nuclear conforme a ${NORMA}.</p>
    </section>
    <section class="login-panel"><div class="login-card fade-in">
      <h2>${demo ? 'Demonstração' : titulos[modo][0]}</h2>
      <p class="sub">${demo ? 'Digite seu nome para explorar. Os dados ficam só neste navegador.' : titulos[modo][1]}</p>
      <form id="f-login" novalidate>
        ${demo || modo === 'criar' ? `<label class="field"><span>Nome</span><input class="input" name="nome" autocomplete="name" required></label>` : ''}
        <label class="field"><span>E-mail</span><input class="input" name="email" type="email" autocomplete="email" inputmode="email" required ${demo ? 'value="demo@setor.com"' : ''}></label>
        ${!demo && modo !== 'senha' ? `<label class="field"><span>Senha</span><input class="input" name="senha" type="password" autocomplete="${modo === 'criar' ? 'new-password' : 'current-password'}" minlength="8" required></label>` : ''}
        <div class="${msg.startsWith('✓') ? 'form-ok' : 'form-err'}" id="erro">${esc(msg.replace(/^✓/, ''))}</div>
        <button class="btn btn-primary btn-block" type="submit">${demo ? 'Explorar' : titulos[modo][0]}</button>
      </form>
      ${demo ? '' : `<div class="row-between" style="margin-top:10px">
        ${modo === 'entrar' ? `<button class="link-btn" data-m="criar">Criar conta</button><button class="link-btn" data-m="senha">Esqueci a senha</button>` : `<button class="link-btn" data-m="entrar">Voltar para entrar</button>`}</div>`}
    </div></section>
  </div>`;
  $app.querySelectorAll('[data-m]').forEach(b => b.onclick = () => telaLogin(b.dataset.m));
  const f = document.getElementById('f-login');
  f.onsubmit = async ev => {
    ev.preventDefault();
    const err = document.getElementById('erro'); err.className = 'form-err'; err.textContent = '';
    const email = f.email.value.trim(), nome = f.nome?.value.trim(), senha = f.senha?.value || '';
    if (!/^\S+@\S+\.\S+$/.test(email)) return err.textContent = 'Informe um e-mail válido.';
    if ((demo || modo === 'criar') && !nome) return err.textContent = 'Informe seu nome.';
    if (!demo && modo !== 'senha' && senha.length < 8) return err.textContent = 'A senha precisa ter pelo menos 8 caracteres.';
    const btn = f.querySelector('[type=submit]'); btn.disabled = true;
    try {
      if (modo === 'senha') { await store.redefinirSenha(email); return telaLogin('entrar', '✓Link enviado. Confira seu e-mail.'); }
      const u = modo === 'criar' ? await store.criarConta(email, senha, nome) : await store.entrar(email, senha, nome);
      if (!u) return telaLogin('entrar', '✓Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.');
      S.user = u; await iniciarApp();
    } catch (e) { err.textContent = e.message; btn.disabled = false; }
  };
}

async function iniciarApp() {
  await carregar();
  render();
  window.scrollTo(0, 0);
  avisosLocais();
  pedirNotificacoes();
  store.aoMudar(async () => { await carregar(); render(); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener?.('message', e => { if (e.data?.url) location.href = e.data.url; });
}

(async function boot() {
  registrarSW();
  try {
    await store.init();
    S.user = await store.sessao();
    if (S.user) await iniciarApp(); else telaLogin();
  } catch (e) {
    $app.innerHTML = `<div class="boot"><div class="login-card" style="max-width:420px;margin:16px"><h2>Não foi possível abrir</h2><p class="sub">${esc(e.message)}</p><button class="btn btn-primary btn-block" onclick="location.reload()">Tentar de novo</button></div></div>`;
  }
  // recalcula ao virar o dia / voltar ao app
  let recarregadoEm = Date.now();
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    conferirVersao();
    if (!S.user) return;
    // ao voltar para o app, busca os dados de novo (no máximo uma vez por minuto) sem atrapalhar um formulário aberto
    if (Date.now() - recarregadoEm > 60000 && !document.querySelector('#sheet-root .sheet')) { recarregadoEm = Date.now(); try { await carregar(); } catch {} }
    else indexar();
    if (!document.querySelector('#sheet-root .sheet')) render();
    avisosLocais();
  });
  conferirVersao();
  setInterval(() => { if (!document.hidden) conferirVersao(); }, 30 * 60000);
})();
