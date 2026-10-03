# Kadenai's Style

Mods pessoais para deixar o **Claude Code Desktop** mais próximo do seu jeito de trabalhar.

**v0.1.0 · Claude Code 2.1.287+ · Windows para o iniciador de chats livres.**

## O que está implementado

| Recurso | Comportamento |
| --- | --- |
| Contexto | Percentual e tokens usados / tamanho da janela |
| Sessão | Uso da cota de 5 horas da conta e tempo até renovar |
| Semana | Uso da cota semanal e tempo até renovar |
| API equivalente | “Quanto esta conversa teria custado?” em USD |
| Controles | Quatro switches independentes, com preferências persistentes |
| Recentes | Painel próprio com abas Projetos e Conversas, ordenadas por uso |
| Chat sem projeto | Cria uma pasta para a conversa e abre Claude Desktop nela |

A barra usa **`SessionMode`**, o ponto de extensão documentado para o rodapé, e mantém a interface original de modos. A posição e o espaço final são decididos pelo Desktop. A API não oferece acesso direto ao contêiner inteiro da barra da imagem de referência.

Os switches são botões de dois estados (`●━ ON` / `OFF ━○`), porque a API de elementos não oferece um componente `Switch`. Há um botão por indicador.

```text
Contexto 42% · 84.0k/200.0k   Sessão 23%   Semana 61%   API ≈ US$ 1.2345
                       ⚙ Style   Recentes   + Chat livre
```

Acima está um exemplo textual; os valores reais vêm da sessão.

## Instalar

Atualize o Claude Code e o aplicativo Claude Desktop. No terminal:

```powershell
claude update
claude plugin marketplace add Kadenai/kadenais-style
claude plugin install kadenais-style@kadenais-style --scope user
```

Inicie uma nova conversa local na aba **Code** do Desktop ou execute `/reload-plugins` na sessão aberta, quando disponível. A CLI e as sessões locais do Desktop leem a instalação no escopo do usuário.

Se preferir a interface: adicione o marketplace e use **+ → Plugins → Add plugin**, escolhendo `kadenais-style`. As opções podem variar conforme a versão do Desktop.

Para desenvolvimento, sem instalar:

```powershell
git clone https://github.com/Kadenai/kadenais-style.git
claude --plugin-dir ./kadenais-style
```

Para carregar uma cópia local no Desktop, o mecanismo oficial é `CLAUDE_CODE_PLUGIN_DIRS`, com caminho absoluto em `env` nas configurações do Claude Code. A instalação via marketplace costuma ser mais simples.

## Usar

- **⚙ Style** ou `/kadenai`: painel de configuração dos quatro indicadores.
- **Recentes** ou `/kadenai-recent`: projetos e conversas recentes.
- **+ Chat livre** ou `/kadenai-new`: nova conversa sem projeto no Desktop.

Todos os indicadores começam ligados. “—” significa **dado indisponível**, não consumo zero. Cotas podem aparecer somente após uma resposta da API e podem não existir em contas que usam chave de API.

A cota de sessão é a janela de **5 horas da conta**, compartilhada com o uso relevante do plano; não é uma cota exclusiva deste chat. O contador de contexto é o tamanho atual da janela, e não a soma de todos os tokens já processados.

## Conversas sem projeto

O botão usa `claude --desktop`, um comando oficial. No Windows, ele cria automaticamente:

```text
Documentos/Claude/Kadenai Chats/2026-10-03-123456-ab12cd34/
├── CLAUDE.md
├── outputs/
└── work/
```

A pasta é obtida pelo Windows, incluindo Documentos redirecionado para OneDrive. Não precisa escolher um projeto Git e não usa sua pasta pessoal inteira como espaço de trabalho. O Claude continua tendo uma pasta nos bastidores: a API não oferece uma sessão literalmente sem diretório.

Para começar mesmo antes de abrir uma sessão com o mod, clone o repositório e dê dois cliques em **`Novo-Chat.cmd`**, ou execute:

```powershell
.\scripts\new-chat.ps1
```

O iniciador não envia prompt, não consulta modelo e não altera o modo de permissões. Os arquivos da conversa ficam preservados. Ele não substitui o botão **Novo** do Desktop.

O iniciador e os botões de abrir/retomar são para **sessões locais em Windows**, com uma assinatura Claude e Desktop instalado. Não use esses botões para sessões SSH: o processo executaria no host remoto. Em outros sistemas, os indicadores continuam úteis; o iniciador mostra uma mensagem explicativa.

## Projetos e conversas recentes

O painel registra as sessões em que **este mod esteve ativo**. A aba Projetos reúne as pastas por último uso, sem repetir a mesma pasta. A aba Conversas lista cada chat, incluindo chats livres. Abrir um projeto abre a pasta no Desktop; abrir uma conversa solicita retomada pelo ID, sujeito ao suporte do Desktop para essa sessão.

Os títulos são os primeiros 100 caracteres da primeira mensagem, guardados **apenas localmente**. Não importamos bancos privados do Desktop nem toda a sua história anterior. A lista principal de projetos da lateral esquerda não tem ponto de extensão documentado; este mod oferece um painel próprio ao lado da conversa. Isso é uma adaptação do requisito, não uma alteração da sidebar nativa.

## Como o custo é calculado

1. Quando existe, usamos `$.session.usage().cost.usd`, o total que o Claude Code calcula para a sessão. Ele inclui histórico anterior, cache e as modalidades que o próprio mecanismo contabiliza.
2. Sem esse total, calculamos uma **estimativa de reserva** a cada resposta de `turn.step`, usando o modelo efetivo e os preços oficiais publicados. Inclui chamadas dos subagentes e preserva o valor nas retomadas e recarregamentos.
3. Somamos separadamente entrada sem cache, saída, gravação de cache e leitura de cache. Não somamos outra vez os totais de `turn.complete`.

**Tabela oficial conferida em 2026-10-03:** [preços Anthropic](https://platform.claude.com/docs/en/about-claude/pricing). Valores por milhão de tokens estão em [`hooks/prices.js`](hooks/prices.js), incluindo Opus 5.5 ($4 entrada / $20 saída / $0.20 leitura de cache).

A estimativa de reserva usa API padrão, roteamento global e cache de 5 minutos por padrão. O painel permite mudar o cache futuro para 1 hora, porque os eventos de mods não informam o TTL por resposta. Ela não inclui Fast mode, tarifas de ferramentas no servidor, impostos, descontos negociados ou preços de AWS/Google/Microsoft. Trocar o TTL não recalcula respostas anteriores.

Quando há histórico anterior à ativação, modelos sem preço cadastrado ou respostas sem contagens, o total de reserva é indicado como **parcial**. Para modelos desconhecidos, mostramos a indisponibilidade em vez de inventar um preço. Esse valor é uma simulação equivalente à API, **não uma cobrança adicional do seu plano**.

Atualizações da tabela são feitas no código e distribuídas com o plugin; não baixamos preços nem enviamos dados de sessões em segundo plano.

## Compatibilidade e limites

- Barra e painel: sites documentados para terminal e Desktop. O desenho final no seu Desktop precisa ser conferido visualmente após instalar.
- WSL no Desktop: plugins não estão disponíveis.
- Cloud, SDK e execução sem interface: sem garantia de renderização visual.
- Sidebar principal e fluxo nativo de “Novo”: não expostos pela API atual.
- A ordem dos mods pode afetar componentes compartilhados com outros plugins.
- O total do mecanismo é preferido à tabela de reserva para cobrir Fast mode e histórico.

## Desenvolvimento e verificação

Sem dependências de npm, sem compilação e sem necessidade de Node para usar o mod. Claude Code carrega JavaScript diretamente.

```powershell
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin validate .claude-plugin/marketplace.json --strict
claude plugin test .
```

Os testes usam **`claude-code/testing`**, o kit oficial: renderização e controles em Desktop/terminal, persistência, retomada após `/clear`, respostas em streaming, subagentes, preços, dados ausentes, recentes e falhas ao abrir o Desktop. Eles validam as árvores de interface e os eventos; não substituem a inspeção visual no aplicativo.

## Referências

- [Anúncio dos mods](https://claude.com/blog/claude-code-mods)
- [API e sites de renderização](https://code.claude.com/docs/en/plugins/mods/reference)
- [Interface de mods](https://code.claude.com/docs/en/plugins/mods/interface)
- [Testes oficiais](https://code.claude.com/docs/en/plugins/mods/test)
- [Abrir sessões no Desktop](https://code.claude.com/docs/en/desktop#continue-in-another-surface)
- [Código dos mods incorporados](https://github.com/anthropics/claude-code/tree/main/mods)

## Privacidade

Preferências, pequenos títulos, caminhos e somas de custos são guardados no store local do plugin do Claude Code. O código não faz requisições HTTP, não lê credenciais, não envia conversas ao GitHub e não altera decisões de permissão. Inicia processos somente quando você pede para criar, abrir ou retomar um chat. Mods executam com os privilégios do usuário; revise o código antes de instalar.

Licença MIT.
