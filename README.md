# Controle de CQ · Medicina Nuclear

Site (celular e computador, instalável como app) para registrar os testes de controle de qualidade dos equipamentos
e acompanhar os vencimentos conforme a **Norma CNEN/ANSN 3.05** (Resolução CNEN/CD nº 159/2013).

## O que faz
- Lista todos os testes periódicos dos 9 equipamentos do setor, com a periodicidade da norma.
- Ao registrar um teste, calcula o próximo vencimento.
- Registro feito depois do vencimento exige **justificativa escrita**. Também dá para justificar um atraso sem executar.
- Resultado "Não conforme" exige descrição.
- Painel com atrasados, o que vence no mês e no mês seguinte; agenda dos próximos 12 meses; histórico com busca e exportação em planilha (CSV).
- Cada teste tem 3 etapas: teste realizado, relatório realizado e relatório assinado. O vencimento conta a partir do teste realizado.
- Prazos das etapas: 2 dias úteis após o teste para o relatório e 2 dias úteis após o relatório para a assinatura (pula fins de semana e feriados nacionais). Etapa marcada fora do prazo exige justificativa.
- Quadro no estilo Trello com as colunas A fazer, Teste realizado, Relatório realizado e Relatório assinado.
- No quadro, dá para arrastar o cartão para a coluna seguinte (no celular, segurar e arrastar). Voltar etapa é bloqueado.
- Testes diários e semanais ficam fora do controle, por decisão do setor.
- Avisos no celular e no computador: no início de cada mês, os testes que vencem no mês seguinte; às segundas, os atrasados; em dias úteis, relatórios e assinaturas com prazo vencendo.
- Login só para e-mails autorizados pelo administrador. Registros não podem ser apagados nem editados (trilha de auditoria).

## Regra de vencimento
Os testes vencem no **mês** em que completam a periodicidade (como na planilha antiga).

## Estrutura
- `index.html`, `styles.css`, `js/` — o site (HTML/JS puro, sem build).
- `config.js` — vazio = modo demonstração (dados só no navegador). Preenchido = modo nuvem.
- `sw.js`, `manifest.webmanifest`, `icons/` — app instalável e notificações push.
- `supabase/schema.sql` — tabelas, segurança por linha e bloqueio de e-mails não autorizados.
- `supabase/seed.sql` — equipamentos, testes e histórico importado da planilha.
- `supabase/functions/notificar` — função que envia os avisos push.
- `supabase/cron.sql` — agenda a função todo dia às 8h (Brasília).

## Situação (10/11/2026)
- Banco na nuvem: projeto Supabase `controle-cq-medicina-nuclear` (ref `mgvtfpwercpypspaaaod`, São Paulo), com tabelas, 74 testes e o histórico da planilha.
- Função `notificar` publicada e agendada todo dia às 8h. As chaves do push ficam na tabela `config_privada` (só o servidor lê); nenhum segredo fica neste repositório.
- `config.js` já aponta para o banco (a chave que está ali é a pública).
- `.github/workflows/manter-ativo.yml`: acesso diário ao banco e cópia semanal dos registros em `backups/` (a cópia precisa do segredo `SUPABASE_SERVICE_KEY` no repositório).
- Falta: cadastrar os e-mails em `autorizados`, desligar "Confirm email" no Supabase (o envio de e-mail do plano gratuito só entrega para membros do projeto) e publicar a pasta em um host com HTTPS (GitHub Pages).

No iPhone, os avisos só funcionam com o site instalado: Compartilhar › Adicionar à Tela de Início (iOS 16.4 ou mais novo).

## Pontos da norma a confirmar
- **Resolução e linearidade espacial extrínsecas (gama câmaras):** a planilha usava anual. A célula da tabela do Anexo II está ilegível ("A A"), mas a nota do anexo diz que os testes extrínsecos são semestrais. Ficou **semestral**.
- **Tempo morto:** não aparece com esse nome na norma; mantido como semestral por estar na planilha.
- **Testes mensais das gama câmaras** (uniformidade de alta contagem, resolução/linearidade intrínsecas, centro de rotação) não estavam na planilha e foram incluídos como a norma pede.
- **PET/CT:** a norma não lista testes do tomógrafo (CT) separadamente; só o corregistro PET/CT e o desempenho PET/CT. Os testes do CT seguem a regulação da Anvisa (RDC 611/2022 e IN 93/2021) e não estão aqui. O teste de resolução temporal TOF foi omitido porque o Biograph TruePoint não tem TOF (confirmar).
- **Geiger-Müller:** reprodutibilidade mensal (até 20%) e calibração a cada 2 anos em laboratório acreditado, principal e reserva em datas diferentes (Arts. 20 e 26).
- **Testes só de aceitação** (após instalação ou manutenção) não entram no controle periódico.
