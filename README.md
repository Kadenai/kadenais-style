# Kadenai's Style

**v0.2.0 · Claude Code 2.1.287+**

Contexto, limites de uso e estimativa de custo da API no rodapé do **Claude Code Desktop**, exibidos automaticamente.

```text
Contexto 42%   Sessão 23%   Semana 61%   API ≈ US$ 1.2345
```

Valores de exemplo. Os indicadores usam as medições da conversa e da conta, sem precisar abrir um painel ou clicar em um botão.

| Indicador | O que mostra |
| --- | --- |
| Contexto | Percentual usado da janela de contexto atual |
| Sessão | Percentual usado da cota de 5 horas da conta |
| Semana | Percentual usado da cota semanal da conta |
| API | Quanto a conversa teria custado em dólares pela API |

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

A integração visual reescreve os rótulos `modes` do ponto nativo `SessionMode`. Não cria uma segunda linha de elementos nem componentes clicáveis. Os controles de permissões que o Claude já oferece continuam pertencendo ao aplicativo.

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

**12 testes locais passaram** no Claude Code 2.1.288. Cobrem os quatro valores no rodapé, ausência de botões, as 16 combinações de configuração, dados indisponíveis, streaming, subagentes, retomada e cálculo de preços.

Os testes usam o kit oficial `claude-code/testing` e verificam eventos, propriedades e árvores de interface. **A aparência final desta versão no aplicativo Desktop ainda precisa de confirmação visual**; os testes não medem recorte ou espaço disponível na janela.

O posicionamento final é controlado pelo Desktop. Outros mods que alteram `SessionMode` podem interferir. A interface requer uma sessão com renderização; não há garantia de exibição no SDK, na nuvem ou em WSL.

## Mudanças em 0.2.0

- Configuração movida para os quatro campos nativos do plugin.
- Rodapé integrado por rótulos nativos, sem botões ou painéis do mod.
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
