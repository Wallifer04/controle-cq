// Exporta a planilha de controle no formato dos quadros do mural do setor:
// uma aba por quadro (NM 630, NM/CT 670, PET/CT, instrumentos e ativímetro) e uma aba com o histórico.
// Gera um .xlsx de verdade (zip sem compressão), sem bibliotecas externas.
import { somaPer, nomePer, fmtData } from './regras.js';

const MES = ['Jan.', 'Fev.', 'Mar.', 'Abr.', 'Mai.', 'Jun.', 'Jul.', 'Ago.', 'Set.', 'Out.', 'Nov.', 'Dez.'];
const NORMA_QUADRO = 'Controle de Qualidade conforme as Normas ANSN 3.05 e Anvisa RDC 38/2008';

// Dados de identificação que estão nos quadros de papel.
const QUADROS = {
  nm630: { aba: 'NM 630', titulo: 'DISCOVERY NM 630  - Nº SÉRIE: 22538 - PATRIMÔNIO: 016886', cor: 6 },
  nm670: { aba: 'NM-CT 670', titulo: 'DISCOVERY NM/CT 670  - Nº SÉRIE: 21351 - PATRIMÔNIO: 005988', cor: 7 },
  petct: { aba: 'PET-CT', titulo: 'PET/CT Siemens Biograph 16 TruePoint  - Nº SÉRIE: 72540 - PATRIMÔNIO: 005751', cor: 8,
    extras: [{ grupo: 'SEMANAL', nome: 'UNIFORMIDADE' }] },
};
const ATIV = { aba: 'Ativímetro', titulo: 'CAPINTEC - CRC-25R - Nº SÉRIE: 251911 - PATRIMÔNIO: 7487',
  extras: [{ nome: 'REPRODUTIBILIDADE', per: 'AQ. MENSAL - ANÁLISE ANUAL' }, { nome: 'REPETIBILIDADE', per: 'DIÁRIO' }, { nome: 'BG', per: 'DIÁRIO' }] };
const INSTRUMENTOS = [
  ['Gama Probe', 'EuroProbe', '3', '13001', '2894'],
  ['Sonda de Captação', 'Capintec', 'Captus 3000', '901558', '2893'],
  ['GM 1', 'Victoreen', '490 Thyac III', '2743', '7563'],
  ['GM 2', 'Victoreen', '190', '107665', '7468'],
  ['GM 3', 'Thermo Scientific', 'RadEye B20', '30756', '3181'],
  ['GM 4', 'Medcom', 'IA-V2', 'I06611', '28917'],
];
const TIPO_QUADRO = { 'Gama probe': 'GAMA PROBE', 'Captador': 'SONDA DE CAPTAÇÃO', 'Geiger-Müller': 'GEIGER-MÜLLER' };

// estilos (índices de cellXfs em styles.xml)
const E = { titulo: 1, cab: 2, grupo: 3, teste: 4, cel: 5, amarelo: 6, azul: 7, rosa: 8, verde: 9, lado: 10, nota: 11, negrito: 12, texto: 13 };

// ---------- conteúdo das células dos meses ----------
const ordemPer = per => per.u === 'd' ? 0 : per.u === 'w' ? 0.5 : per.n;
const letraPer = per => per.u === 'd' ? 'D' : per.u === 'w' ? 'Sem.' : ({ 1: 'M', 3: 'T', 6: 'S', 12: 'A', 24: 'B' })[per.n] || `${per.n}m`;

function meses(t, regs, ano, hoje, corE) {
  const execs = regs.filter(r => r.teste_id === t.id && r.tipo === 'execucao' && !r.anulado_em);
  const mesAtual = hoje.slice(0, 4) > String(ano) ? 12 : hoje.slice(0, 4) < String(ano) ? -1 : +hoje.slice(5, 7) - 1;
  // meses previstos: cada execução marca o vencimento seguinte (execução + periodicidade)
  const previstos = new Set();
  if (t.per.u === 'm' && t.per.n > 1) for (const r of execs) { const v = somaPer(r.data, t.per); if (v.slice(0, 4) === String(ano)) previstos.add(+v.slice(5, 7) - 1); }
  return MES.map((_, m) => {
    const chave = `${ano}-${String(m + 1).padStart(2, '0')}`;
    const doMes = execs.filter(r => r.data.slice(0, 7) === chave);
    const acomp = doMes.length && doMes.every(r => /^Acompanhamento/.test(r.observacao || ''));
    // mensais ficam em branco quando não há registro (o setor preenche à mão); os demais levam traço nos meses passados
    const v = doMes.length ? (acomp ? 'A' : 'OK') : (m < mesAtual && !previstos.has(m) && !(t.per.u === 'm' && t.per.n === 1) ? '–' : '');
    return { v, s: previstos.has(m) ? corE : E.cel };
  });
}

// ---------- montagem de uma aba ----------
function novaAba(nome, larguras) { return { nome, larguras, cel: new Map(), mesclas: [], alturas: {}, linhas: 0 }; }
const ref = (l, c) => { let s = ''; for (let n = c; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + (n - 1) % 26) + s; return s + l; };
function por(a, l, c, v, s) { a.cel.set(`${l},${c}`, { l, c, v, s }); a.linhas = Math.max(a.linhas, l); }
function mesclar(a, l1, c1, l2, c2, v, s) {
  for (let l = l1; l <= l2; l++) for (let c = c1; c <= c2; c++) por(a, l, c, l === l1 && c === c1 ? v : '', s);
  if (l1 !== l2 || c1 !== c2) a.mesclas.push(`${ref(l1, c1)}:${ref(l2, c2)}`);
}

function abaEquipamento(q, testes, regs, ano, hoje) {
  // colunas: A lado, B periodicidade, C teste, D..O meses
  const a = novaAba(q.aba, [4, 17, 46, ...MES.map(() => 6.5)]);
  mesclar(a, 1, 1, 1, 15, `${q.titulo} - ANO ${ano}`, E.titulo); a.alturas[1] = 26;
  mesclar(a, 2, 1, 2, 2, 'PERIODICIDADE', E.cab); por(a, 2, 3, 'TESTE', E.cab); MES.forEach((m, i) => por(a, 2, 4 + i, m, E.cab));
  const linhas = [
    ...(q.extras || []).map(x => ({ grupo: x.grupo, ord: -1, nome: x.nome, meses: MES.map(() => ({ v: '', s: E.cel })) })),
    ...testes.map(t => ({ grupo: nomePer(t.per).toUpperCase(), ord: ordemPer(t.per), nome: t.nome.toUpperCase(), meses: meses(t, regs, ano, hoje, q.cor) })),
  ].map((x, i) => ({ ...x, i })).sort((x, y) => x.ord - y.ord || x.i - y.i);
  let l = 3;
  for (let i = 0; i < linhas.length;) {
    let j = i; while (j < linhas.length && linhas[j].grupo === linhas[i].grupo) j++;
    mesclar(a, l, 2, l + (j - i) - 1, 2, linhas[i].grupo, E.grupo);
    for (; i < j; i++, l++) { por(a, l, 3, linhas[i].nome, E.teste); linhas[i].meses.forEach((m, k) => por(a, l, 4 + k, m.v, m.s)); a.alturas[l] = 21; }
  }
  if (l > 3) mesclar(a, 3, 1, l - 1, 1, NORMA_QUADRO, E.lado);
  return a;
}

function abaAtivimetro(testes, regs, ano, hoje) {
  // colunas: A lado, B teste, C periodicidade, D..O meses
  const a = novaAba(ATIV.aba, [4, 34, 24, ...MES.map(() => 6.5)]);
  mesclar(a, 1, 1, 1, 15, NORMA_QUADRO, E.negrito);
  mesclar(a, 2, 1, 2, 15, `${ATIV.titulo} - ${ano}`, E.titulo); a.alturas[2] = 24;
  mesclar(a, 3, 1, 3, 2, 'TESTE', E.cab); por(a, 3, 3, 'PERIODICIDADE', E.cab); MES.forEach((m, i) => por(a, 3, 4 + i, m, E.cab));
  const linhas = [
    ...ATIV.extras.map(x => ({ nome: x.nome, per: x.per, meses: MES.map(() => ({ v: '', s: E.cel })) })),
    ...testes.map(t => ({ nome: t.nome.toUpperCase(), per: nomePer(t.per).toUpperCase(), meses: meses(t, regs, ano, hoje, E.verde) })),
  ];
  let l = 4;
  for (const x of linhas) { por(a, l, 2, x.nome, E.teste); por(a, l, 3, x.per, E.grupo); x.meses.forEach((m, k) => por(a, l, 4 + k, m.v, m.s)); a.alturas[l] = 26; l++; }
  mesclar(a, 4, 1, l - 1, 1, 'MEDIDOR DE ATIVIDADE', E.lado);
  return a;
}

function abaInstrumentos(eqs, testes, regs, ano, hoje) {
  // colunas: A tipo, B instrumento, C teste, D period., E..P meses
  const a = novaAba('Probe, sonda e GM', [16, 20, 30, 9, ...MES.map(() => 6.5)]);
  mesclar(a, 1, 1, 1, 16, 'Controle de Qualidade conforme as Normas CNEN NN 3.05 e RDC 38 de 2008', E.negrito);
  mesclar(a, 2, 1, 2, 16, String(ano), E.negrito);
  mesclar(a, 3, 1, 3, 2, 'INSTRUMENTO', E.cab); por(a, 3, 3, 'TESTE', E.cab); por(a, 3, 4, 'PERIOD.', E.cab); MES.forEach((m, i) => por(a, 3, 5 + i, m, E.cab)); a.alturas[3] = 24;
  let l = 4;
  const tipos = [...new Set(eqs.map(e => e.tipo))];
  for (const tipo of tipos) {
    const ini = l;
    for (const e of eqs.filter(x => x.tipo === tipo)) {
      const ts = testes.filter(t => t.eq === e.id); if (!ts.length) continue;
      mesclar(a, l, 2, l + ts.length - 1, 2, e.nome, E.negrito);
      for (const t of ts) { por(a, l, 3, t.nome, E.grupo); por(a, l, 4, letraPer(t.per), E.grupo); meses(t, regs, ano, hoje, E.verde).forEach((m, k) => por(a, l, 5 + k, m.v, m.s)); a.alturas[l] = 26; l++; }
    }
    if (l > ini) mesclar(a, ini, 1, l - 1, 1, TIPO_QUADRO[tipo] || tipo.toUpperCase(), E.negrito);
  }
  por(a, l, 1, 'Period.: M = mensal, T = trimestral, S = semestral, A = anual, B = a cada 2 anos.', E.nota); l += 2;
  // tabela de identificação dos instrumentos, como no quadro
  const faixa = [[1, 2], [3, 3], [4, 8], [9, 12], [13, 16]];
  [['INSTRUMENTO', 'MARCA', 'MODELO', 'Nº SÉRIE', 'PATRIMÔNIO'], ...INSTRUMENTOS].forEach((lin, i) => {
    lin.forEach((v, k) => mesclar(a, l, faixa[k][0], l, faixa[k][1], v, i ? E.grupo : E.cab)); l++;
  });
  return a;
}

function abaHistorico(eqs, testes, regs) {
  const a = novaAba('Histórico', [12, 24, 46, 14, 22, 14, 11, 40, 40, 26]);
  ['Data', 'Equipamento', 'Teste', 'Periodicidade', 'Etapa', 'Resultado', 'Com atraso', 'Justificativa', 'Observação', 'Responsável'].forEach((v, i) => por(a, 1, i + 1, v, E.cab));
  const etapa = { execucao: 'Teste realizado', relatorio: 'Relatório realizado', concluido: 'Relatório assinado' };
  let l = 2;
  for (const r of [...regs].filter(r => !r.anulado_em).sort((x, y) => y.data.localeCompare(x.data))) {
    const t = testes.find(x => x.id === r.teste_id); if (!t) continue;
    [fmtData(r.data), eqs.find(e => e.id === t.eq)?.nome || '', t.nome, nomePer(t.per), etapa[r.tipo] || r.tipo,
      r.resultado === 'nao_conforme' ? 'Não conforme' : r.resultado ? 'Conforme' : '', r.atrasado ? 'Sim' : 'Não', r.justificativa || '', r.observacao || '', r.usuario_nome || '']
      .forEach((v, i) => por(a, l, i + 1, v, E.texto));
    l++;
  }
  return a;
}

// ---------- xlsx ----------
const x = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function xmlAba(a, paisagem = true) {
  const porLinha = new Map();
  for (const c of a.cel.values()) { if (!porLinha.has(c.l)) porLinha.set(c.l, []); porLinha.get(c.l).push(c); }
  const linhas = [...porLinha.keys()].sort((p, q) => p - q).map(l => {
    const cs = porLinha.get(l).sort((p, q) => p.c - q.c).map(c => c.v === '' || c.v == null
      ? `<c r="${ref(c.l, c.c)}" s="${c.s}"/>` : `<c r="${ref(c.l, c.c)}" s="${c.s}" t="inlineStr"><is><t xml:space="preserve">${x(c.v)}</t></is></c>`).join('');
    return `<row r="${l}"${a.alturas[l] ? ` ht="${a.alturas[l]}" customHeight="1"` : ''}>${cs}</row>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>
<cols>${a.larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${linhas}</sheetData>${a.mesclas.length ? `<mergeCells count="${a.mesclas.length}">${a.mesclas.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : ''}
<printOptions horizontalCentered="1"/><pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/>
<pageSetup paperSize="9" orientation="${paisagem ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="${a.nome === 'Histórico' ? 0 : 1}"/></worksheet>`;
}

const ESTILOS = (() => {
  const borda = '<border><left style="thin"><color auto="1"/></left><right style="thin"><color auto="1"/></right><top style="thin"><color auto="1"/></top><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>';
  const fill = rgb => `<fill><patternFill patternType="solid"><fgColor rgb="${rgb}"/><bgColor indexed="64"/></patternFill></fill>`;
  const xf = (font, fillId, bordaId, alin) => `<xf numFmtId="0" fontId="${font}" fillId="${fillId}" borderId="${bordaId}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment ${alin}/></xf>`;
  const centro = 'horizontal="center" vertical="center" wrapText="1"';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><b/><sz val="13"/><name val="Arial"/></font><font><b/><sz val="11"/><color rgb="FF1F3A93"/><name val="Arial"/></font><font><sz val="9"/><name val="Arial"/></font></fonts>
<fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>${fill('FFE7E6E6')}${fill('FFFFF066')}${fill('FF7FD4F0')}${fill('FFF8C4C8')}${fill('FFC6E9B5')}</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>${borda}</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="14"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
${xf(2, 0, 1, centro)}${xf(1, 2, 1, centro)}${xf(0, 0, 1, centro)}${xf(0, 0, 1, 'horizontal="left" vertical="center" wrapText="1"')}
${xf(3, 0, 1, centro)}${xf(3, 3, 1, centro)}${xf(3, 4, 1, centro)}${xf(3, 5, 1, centro)}${xf(3, 6, 1, centro)}
${xf(4, 0, 1, 'horizontal="center" vertical="center" wrapText="1" textRotation="90"')}${xf(4, 0, 0, 'horizontal="left" vertical="center"')}${xf(1, 0, 1, centro)}${xf(0, 0, 1, 'horizontal="left" vertical="top" wrapText="1"')}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
})();

// zip sem compressão (método "stored")
const TAB = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = TAB[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function zip(arquivos) {
  const enc = new TextEncoder(), partes = [], central = []; let pos = 0;
  const d = new Date(), hora = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), dia = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  for (const [nome, texto] of arquivos) {
    const n = enc.encode(nome), dados = enc.encode(texto), crc = crc32(dados);
    const cab = new DataView(new ArrayBuffer(30));
    cab.setUint32(0, 0x04034b50, true); cab.setUint16(4, 20, true); cab.setUint16(6, 0x0800, true); cab.setUint16(8, 0, true); cab.setUint16(10, hora, true); cab.setUint16(12, dia, true);
    cab.setUint32(14, crc, true); cab.setUint32(18, dados.length, true); cab.setUint32(22, dados.length, true); cab.setUint16(26, n.length, true); cab.setUint16(28, 0, true);
    const cen = new DataView(new ArrayBuffer(46));
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, 0, true); cen.setUint16(12, hora, true); cen.setUint16(14, dia, true);
    cen.setUint32(16, crc, true); cen.setUint32(20, dados.length, true); cen.setUint32(24, dados.length, true); cen.setUint16(28, n.length, true); cen.setUint32(42, pos, true);
    partes.push(new Uint8Array(cab.buffer), n, dados); central.push(new Uint8Array(cen.buffer), n);
    pos += 30 + n.length + dados.length;
  }
  const tamCentral = central.reduce((s, p) => s + p.length, 0), fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); fim.setUint16(8, arquivos.length, true); fim.setUint16(10, arquivos.length, true); fim.setUint32(12, tamCentral, true); fim.setUint32(16, pos, true);
  return new Blob([...partes, ...central, new Uint8Array(fim.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Monta o arquivo. eqs/testes/regs no formato usado pelo site; hoje em AAAA-MM-DD.
export function gerarPlanilha({ eqs, testes, regs, hoje, ano = +hoje.slice(0, 4) }) {
  const ativos = testes.filter(t => t.ativo !== false);
  const abas = [];
  for (const id of ['nm630', 'nm670', 'petct']) if (eqs.some(e => e.id === id)) abas.push(abaEquipamento(QUADROS[id], ativos.filter(t => t.eq === id), regs, ano, hoje));
  const outros = eqs.filter(e => !QUADROS[e.id] && e.id !== 'ativ');
  if (outros.length) abas.push(abaInstrumentos(outros, ativos, regs, ano, hoje));
  if (eqs.some(e => e.id === 'ativ')) abas.push(abaAtivimetro(ativos.filter(t => t.eq === 'ativ'), regs, ano, hoje));
  abas.push(abaHistorico(eqs, testes, regs));
  const P = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  return zip([
    ['[Content_Types].xml', `${P}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${abas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
    ['_rels/.rels', `${P}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml', `${P}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${abas.map((a, i) => `<sheet name="${x(a.nome)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', `${P}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${abas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${abas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', ESTILOS],
    ...abas.map((a, i) => [`xl/worksheets/sheet${i + 1}.xml`, xmlAba(a)]),
  ]);
}
