# Kadenai's Style

**v0.2.1 · Claude Code 2.1.287+**

Contexto, limites de uso e estimativa de custo da API no rodapé do **Claude Code Desktop**, exibidos automaticamente.

```text
C42% 5h23% 7d61% $1.23
```

Valores de exemplo. Os indicadores usam as medições da conversa e da conta, sem precisar abrir um painel ou clicar em um botão.

| Indicador | O que mostra |
| --- | --- |
| C | Percentual usado da janela de contexto atual |
| 5h | Percentual usado da cota de 5 horas da conta |
| 7d | Percentual usado da cota semanal da conta |
| $ | Quanto a conversa teria custado em dólares pela API |

Os percentuais são arredondados para números inteiros no rodapé. O custo se adapta ao espaço: `¢` significa centavos de dólar, `k` significa mil, `M` milhão, `B` bilhão e `T` trilhão. `*` indica uma estimativa parcial. O valor armazenado mantém sua precisão; apenas a exibição é abreviada.

## Configurar

Na aba **Plugins** das configurações do Claude, abra a configuração de **Kadenai's Style**. Há quatro opções booleanas independentes, todas ligadas por padrão:

- Mostrar contexto
- Mostrar limite da sessão
- Mostrar limite semanal
- Mostrar custo equivalente de API

São campos nativos de `userConfig`: o próprio Claude desenha e salva os controles. No terminal, esses campos também aparecem em `/config`. O mod recebe as escolhas em `register(on, options)`; uma alteração recarrega o módulo com os novos valores.

O mod não adiciona botão ao rodapé, comandos próprios, painel de configuração, lista de recentes nem iniciador de conversas. Use os recursos de pasta e histórico do próprio Claude.

## Instalar ou atualizar

Atualize o Claude Code e o aplicativo Claude Desktop. Para a primeira instalação:

```powershell
claude update
claude plugin marketplace add Kadenai/kadenais-style
claude plugin install kadenais-style@kadenais-style --scope user
```

Se já instalou:

```powershell
claude plugin marketplace update kadenais-style
claude plugin update kadenais-style@kadenais-style
```

Depois, execute `/reload-plugins` na conversa, quando disponível, ou abra uma nova conversa local na aba Code. O aplicativo precisa recarregar o plugin para deixar de usar a interface antiga.

Para desenvolvimento:

```powershell
git clone https://github.com/Kadenai/kadenais-style.git
claude --plugin-dir ./kadenais-style
```

## Como os dados funcionam

O mod atualiza as medições em `session.measure` e ao concluir respostas. As cotas podem ficar indisponíveis até a API informar os valores; contas com chave de API podem não ter cotas de assinatura. **“—” significa dado indisponível**, não consumo zero.

A cota de sessão corresponde à janela de 5 horas **da conta**, e não a um limite exclusivo do chat. O contexto corresponde à janela atual, incluindo o efeito da compactação.

A integração retorna um elemento `Text` explícito no ponto `SessionMode`. No Desktop analisado, reescrever apenas `modes` e retornar a referência ao desenho nativo não exibe os dados. O aplicativo também transforma esse ponto em uma única linha com largura máxima de `24ch`; por isso, o mod usa rótulos compactos e abrevia o custo quando necessário. Os controles de permissões que o Claude já oferece continuam pertencendo ao aplicativo.

## Custo equivalente de API

1. Quando existe, usamos `$.session.usage().cost.usd`, o total calculado pelo Claude Code para a conversa, incluindo histórico e modalidades que o mecanismo contabiliza.
2. Sem esse total, somamos os tokens de cada resposta em `turn.step`, com o modelo efetivo e a tabela oficial. Incluímos subagentes e evitamos duplicar respostas.
3. Contabilizamos separadamente entrada, saída, gravação de cache e leitura de cache. O total de reserva fica no armazenamento local do plugin para retomadas.

Tabela conferida em **2026-10-03**: [preços oficiais da Anthropic](https://platform.claude.com/docs/en/about-claude/pricing). Os valores por milhão de tokens estão em [hooks/prices.js](hooks/prices.js).

A tabela de reserva usa API padrão, roteamento global e cache de 5 minutos, pois os eventos não informam o TTL por resposta. Não inclui Fast mode, ferramentas pagas no servidor, impostos, descontos negociados ou tarifas de terceiros. Quando o mecanismo informa seu próprio total, preferimos esse total.

Histórico anterior à ativação, modelos sem preço cadastrado e respostas sem contagem tornam a estimativa de reserva **parcial**. Modelos desconhecidos não recebem preços inventados. **O indicador simula um custo de API; não representa cobrança adicional da assinatura.**

A tabela é distribuída com o plugin. Não baixamos preços em segundo plano.

## Verificação e compatibilidade

```powershell
claude plugin validate .claude-plugin/plugin.json --strict
claude plugin validate .claude-plugin/marketplace.json --strict
claude plugin test .
```

**13 testes locais passaram** no Claude Code 2.1.288 e no motor 2.1.286 distribuído com o Desktop 2.19675.0. Cobrem texto explícito no rodapé, ausência de botões, as 16 combinações de configuração, dados indisponíveis, espaço para os quatro valores, streaming, subagentes, retomada e cálculo de preços.

Os testes usam o kit oficial `claude-code/testing` e verificam eventos e árvores de interface. O desenho base do rodapé retorna `{ type: 'engine', ref: 0 }` no teste, como no Desktop, sem substituir essa referência por textos inventados. Uma regressão à integração da versão 0.2.0 faz o teste falhar.

Também verificamos a árvore retornada usando as funções de conversão do código de interface carregado pelo Desktop. Essa verificação confirma que os indicadores são reconhecidos como conteúdo visível; **não substitui uma conferência visual da conversa aberta no aplicativo**.

O posicionamento final é controlado pelo Desktop. Outros mods que alteram `SessionMode` podem interferir. A interface requer uma sessão com renderização; não há garantia de exibição no SDK, na nuvem ou em WSL.

## Mudanças em 0.2.1

- Corrigido o rodapé vazio: os indicadores agora são elementos de texto explícitos.
- Rótulos e custo compactados para o espaço disponível no Desktop.
- Removido o simulador de desenho que deixava os testes passarem sem comprovar texto real.

## Mudanças em 0.2.0

- Configuração movida para os quatro campos nativos do plugin.
- Removidos os botões e painéis do mod; a integração visual desta versão foi corrigida em 0.2.1.
- Removidos recentes, coleta de títulos e caminhos, comandos e iniciador de chat sem projeto.
- Preservado o cálculo de custo por conversa e subagentes.

## Privacidade

O código não faz requisições HTTP, não lê credenciais, não inicia processos e não registra títulos, mensagens ou caminhos das conversas. Guarda apenas a contabilidade de custos por identificador de sessão no store local do plugin. As escolhas dos quatro controles são salvas pelo próprio Claude.

## Referências

- [Anúncio dos mods](https://claude.com/blog/claude-code-mods)
- [Mods oficiais](https://github.com/anthropics/claude-code/tree/main/mods)
- [Referência de mods](https://code.claude.com/docs/en/plugins/mods/reference)
- [Configuração nativa de plugins](https://code.claude.com/docs/en/plugins/manifest-reference#user-configuration)
- [Testes de mods](https://code.claude.com/docs/en/plugins/mods/test)

Licença MIT.
