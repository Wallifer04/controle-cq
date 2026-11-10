// Catálogo de equipamentos e testes de CQ do setor.
// Base: Norma CNEN/ANSN 3.05 (Resolução CNEN/CD nº 159/2013), Anexos II a V e Arts. 20 e 26.
// Periodicidade: { n: número, u: 'd' (dia) | 'w' (semana) | 'm' (mês) }.
// Testes só de aceitação (após instalação/manutenção) não entram no controle periódico.
// Testes diários e semanais ficam fora por decisão do setor: o controle é dos mensais em diante.

export const NORMA = 'CNEN/ANSN 3.05 (Res. CNEN/CD 159/2013)';

export const EQUIPAMENTOS = [
  { id: 'nm630', nome: 'Discovery NM 630', tipo: 'Gama câmara', modelo: 'GE Discovery NM 630 (SPECT)', icone: 'camera' },
  { id: 'nm670', nome: 'Discovery NM/CT 670', tipo: 'Gama câmara', modelo: 'GE Discovery NM/CT 670 (SPECT/CT)', icone: 'camera' },
  { id: 'petct', nome: 'Biograph TruePoint', tipo: 'PET/CT', modelo: 'Siemens Biograph TruePoint PET/CT', icone: 'pet' },
  { id: 'ativ', nome: 'Ativímetro', tipo: 'Medidor de atividade', modelo: 'Medidor de atividade', icone: 'ativ' },
  { id: 'captus', nome: 'Captus 3000', tipo: 'Captador', modelo: 'Sonda de captação Captus 3000', icone: 'captus' },
  { id: 'gm-insp', nome: 'Inspector V2', tipo: 'Geiger-Müller', modelo: 'Monitor de taxa de dose e contaminação', icone: 'gm' },
  { id: 'gm-redeye', nome: 'RedEye B20', tipo: 'Geiger-Müller', modelo: 'Monitor de taxa de dose e contaminação', icone: 'gm' },
  { id: 'probe-nova', nome: 'Gama probe nova', tipo: 'Gama probe', modelo: 'Sonda intraoperatória', icone: 'probe' },
  { id: 'probe-antiga', nome: 'Gama probe antiga', tipo: 'Gama probe', modelo: 'Sonda intraoperatória', icone: 'probe' },
];

const D = { n: 1, u: 'd' }, W = { n: 1, u: 'w' }, M = { n: 1, u: 'm' }, T = { n: 3, u: 'm' },
  S = { n: 6, u: 'm' }, A = { n: 12, u: 'm' }, B = { n: 24, u: 'm' };

function gama(id, comCT) {
  const t = (slug, nome, per, extra = {}) => ({ id: `${id}.${slug}`, eq: id, nome, per, anexo: 'Anexo II', ...extra });
  const lista = [
    t('unif-alta', 'Uniformidade intrínseca (alta contagem)', M, { nota: 'Se disponível no equipamento.' }),
    t('res-int', 'Resolução e linearidade espacial intrínsecas', M),
    t('cor', 'Centro de rotação SPECT', M, { nota: 'Desvio, alinhamento com o eixo Y e inclinação do detector.' }),
    t('res-energ', 'Resolução energética', S),
    t('resp-ga', 'Resolução espacial multienergética – Gálio', S),
    t('resp-tl', 'Resolução espacial multienergética – Tálio', S),
    t('correg-ga', 'Corregistro multienergético – Gálio', S),
    t('correg-tl', 'Corregistro multienergético – Tálio', S),
    t('sens-tc', 'Sensibilidade planar – Tecnécio', S),
    t('sens-ga', 'Sensibilidade planar – Gálio', S),
    t('sens-i', 'Sensibilidade planar – Iodo', S),
    t('sens-tl', 'Sensibilidade planar – Tálio', S),
    t('taxa', 'Taxa máxima de contagem', S),
    t('tempo-morto', 'Tempo morto', S, { anexo: 'Rotina do setor', nota: 'Não aparece com esse nome na norma; mantido da planilha do setor.' }),
    t('furos', 'Angulação dos furos dos colimadores', S, { nota: 'Todos os colimadores.' }),
    t('mesa', 'Velocidade da mesa (corpo inteiro)', S),
    t('unif-ext', 'Uniformidade extrínseca (todos os colimadores)', S, { nota: 'Também após dano ao colimador.' }),
    t('res-ext', 'Resolução e linearidade espacial extrínsecas', S, { nota: 'Na planilha era anual. A tabela da norma está ilegível nessa linha, mas a nota do Anexo II manda fazer os testes extrínsecos a cada 6 meses.' }),
    t('spect', 'Desempenho geral SPECT (tomográfico)', S),
    t('unif-ga', 'Uniformidade intrínseca – Gálio', A),
    t('unif-tl', 'Uniformidade intrínseca – Tálio', A),
    t('unif-i', 'Uniformidade intrínseca – Iodo', A),
    t('janela-assim', 'Uniformidade com janela assimétrica', A),
  ];
  if (comCT) lista.splice(3, 0, t('spect-ct', 'Corregistro SPECT/CT', T));
  return lista;
}

function pet() {
  const t = (slug, nome, per, extra = {}) => ({ id: `petct.${slug}`, eq: 'petct', nome, per, anexo: 'Anexo IV', ...extra });
  return [
    t('norm', 'Normalização (eficiência dos detectores)', T, { nota: 'Trimestral ou conforme o fabricante.' }),
    t('calib', 'Verificação da calibração do sistema', T),
    t('correg', 'Corregistro PET/CT', T),
    t('suv', 'Calibração da concentração radioativa (SUV)', T),
    t('res-energ', 'Resolução energética', S, { nota: 'Se disponível.' }),
    t('res-esp', 'Resolução espacial transversal e axial', S),
    t('sens', 'Sensibilidade', A),
    t('espalh', 'Fração de espalhamento', A),
    t('janela', 'Largura da janela de coincidência', A),
    t('corte', 'Espessura de corte', A),
    t('nec', 'Desempenho da taxa de contagem (NEC)', A),
    t('verd', 'Taxa de eventos verdadeiros', A),
    t('aleat', 'Taxa de eventos aleatórios', A),
    t('desemp-pet', 'Desempenho geral PET (simulador)', A),
    t('desemp-petct', 'Desempenho geral PET/CT (simulador)', A),
    t('mec', 'Partes mecânicas do equipamento', A),
  ];
}

function ativimetro() {
  const t = (slug, nome, per, tol, extra = {}) => ({ id: `ativ.${slug}`, eq: 'ativ', nome, per, tol, anexo: 'Anexo V', ...extra });
  return [
    t('exat', 'Exatidão', S, '±10%'),
    t('prec', 'Precisão', S, '±5%'),
    t('linear', 'Linearidade', A, '±10%'),
    t('geom', 'Geometria (fatores de calibração)', A),
  ];
}

function gm(id) {
  return [
    { id: `${id}.reprod`, eq: id, nome: 'Reprodutibilidade', per: M, tol: 'até 20%', anexo: 'Art. 26' },
    { id: `${id}.calib`, eq: id, nome: 'Calibração em laboratório acreditado', per: B, anexo: 'Art. 20 §5º',
      nota: 'A cada 2 anos e após conserto. O monitor principal e o reserva devem ser calibrados em datas diferentes.' },
  ];
}

const probe = id => [{ id: `${id}.repet`, eq: id, nome: 'Repetibilidade', per: S, tol: 'desvio padrão < 10%', anexo: 'Anexo III' }];

export const TESTES = [
  ...gama('nm630', false),
  ...gama('nm670', true),
  ...pet(),
  ...ativimetro(),
  { id: 'captus.qui', eq: 'captus', nome: 'Teste do qui-quadrado', per: S, tol: 'χ² entre 5% e 95%', anexo: 'Anexo III' },
  ...gm('gm-insp'),
  ...gm('gm-redeye'),
  ...probe('probe-nova'),
  ...probe('probe-antiga'),
].map((t, i) => ({ ativo: true, ordem: i, tol: null, nota: null, ...t }));

// Histórico importado da planilha Controle_Periodicidade_Gama_Camaras.xlsx (dia 1 de cada mês).
// 'acomp' = acompanhamento.
const H = {
  nm630: {
    'mesa': ['2026-04', '2026-10'], 'unif-ext': ['2026-04'], 'tempo-morto': ['2026-04'], 'taxa': ['2026-03', '2026-09'],
    'sens-ga': ['2026-02', '2026-08'], 'sens-i': ['2026-04', '2026-09'], 'sens-tl': ['2026-04'], 'sens-tc': ['2026-01', '2026-08'],
    'resp-ga': ['2026-02', '2026-08'], 'resp-tl': ['2026-05'], 'res-energ': ['2026-06'], 'spect': ['2026-03', '2026-09'],
    'correg-ga': ['2026-02', '2026-08'], 'correg-tl': ['2025-10', '2026-05'], 'furos': ['2026-01', '2026-08'],
    'unif-ga': ['2026-02', '2026-04', '2026-08', '2026-09'], 'unif-tl': ['2026-04', 'acomp:2026-07'], 'unif-i': ['2026-04'],
    'res-ext': ['2026-05'], 'janela-assim': ['2026-09'],
  },
  nm670: {
    'spect-ct': ['2026-04', '2026-06', '2026-09'], 'mesa': ['2026-04'], 'unif-ext': ['2026-04'], 'tempo-morto': ['2026-05'],
    'taxa': ['2026-03', '2026-09'], 'sens-ga': ['2026-08'], 'sens-i': ['2026-04', '2026-09'], 'sens-tl': ['2026-04'],
    'sens-tc': ['2026-01', '2026-08'], 'resp-ga': ['2026-02', '2026-08'], 'resp-tl': ['2026-05'], 'res-energ': ['2026-06'],
    'spect': ['2026-03', '2026-09'], 'correg-ga': ['2026-02', '2026-09'], 'correg-tl': ['2025-10'], 'furos': ['2026-01', '2026-07'],
    'unif-ga': ['2026-02', 'acomp:2026-02', '2026-04', '2026-08'], 'unif-tl': ['2026-04'], 'unif-i': ['2026-04'],
    'res-ext': ['2026-05'], 'janela-assim': ['2026-07'],
  },
};

const OBS = {
  'nm630.unif-ext': '2º semestre: relatório não encontrado na planilha.',
  'nm670.unif-ext': '2º semestre: relatório não encontrado na planilha.',
  'nm630.correg-tl': 'Depois de out/25: relatório não encontrado na planilha.',
  'nm670.correg-tl': 'Depois de out/25: relatório não encontrado na planilha.',
  'nm670.mesa': '2º semestre não realizado ("–" na planilha).',
  'nm670.sens-ga': '1º semestre marcado como "VERIFICAR" na planilha.',
};

export function historicoImportado() {
  const out = [];
  for (const [eq, testes] of Object.entries(H)) {
    for (const [slug, datas] of Object.entries(testes)) {
      const tid = `${eq}.${slug}`;
      datas.forEach((d, i) => {
        const acomp = d.startsWith('acomp:');
        const mes = acomp ? d.slice(6) : d;
        const ultimo = i === datas.length - 1;
        out.push({
          id: `imp-${tid}-${i}`, teste_id: tid, data: `${mes}-01`, tipo: 'execucao', resultado: 'conforme',
          observacao: [acomp ? 'Acompanhamento.' : '', ultimo && OBS[tid] ? OBS[tid] : ''].filter(Boolean).join(' ') || null,
          justificativa: null, atrasado: false, usuario_nome: 'Importado da planilha', created_at: `${mes}-01T12:00:00Z`,
        });
      });
    }
  }
  return out;
}
