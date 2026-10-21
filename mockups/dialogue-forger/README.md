# Dialogue Forger

Uma página HTML para criar e editar diálogos do *Galatime - Chronicles of the Past*.

Objetivo: escrever diálogos sem mexer em YAML manualmente e com o mínimo de inputs.

---

### Como usar
Abre o `index.html` no navegador. Não precisa de servidor nem de uma cópia da pasta do jogo.

- **YAML:** Importa ficheiros `.yml` / `.yaml` e exporta o diálogo em `.yaml`.
- **Pasta de importação:** com a página servida por `http://` (por exemplo `npx http-server`), importar e exportar usam o diálogo nativo do browser, e a exportação abre na pasta de onde o último YAML foi importado. Em `file://` o browser bloqueia a API de ficheiros: a exportação volta a ser um download normal, para a pasta de transferências.
- **Rascunho:** O diálogo e o estado da pré-visualização são guardados neste navegador.
- **Sem rede:** A página e os campos continuam disponíveis; o YAML requer que `js-yaml` tenha carregado. Para uso totalmente offline, guarda uma cópia local de `js-yaml.min.js` e aponta o `<script>` para essa cópia.

---

### Funcionalidades

**Áreas:**
- **Cabeçalho:** Estado de gravação local, vistas «Editar» / «Testar diálogo», importar e exportar YAML.
- **Início:** O nó inicial é o primeiro passo da lista em «Estrutura» — não há campo nem botão para o escolher. A lista da barra lateral diz qual é, e é informativa: para mudar o início, arrasta outro nó para o topo. Um ficheiro importado que dizia outro nó em `start_node` avisa que o início passou a ser o primeiro da lista. O diálogo já não tem id próprio — o nome do ficheiro é a sua identidade, e é por ele que os outros diálogos o referenciam.
- **Estrutura:** Escolhe um tipo de nó, adiciona-o e edita os campos no painel principal. A ordem da lista é a tua: arrasta um passo, ou usa Ctrl + setas com um passo focado, para a reorganizar.
- **Editor:** Os campos do nó estão agrupados pelo papel que têm nele — «Quem», «Cena», «Conversa», «Como se move», «Percurso» e «Efeitos» — para a forma de um nó ler-se de uma vez. Todas as secções estão à vista; as que se abrem raramente (efeitos, marcação) é que estão recolhidas.
- **Verificação:** Erros e avisos atualizados durante a edição, com ligação ao nó problemático. Cada problema diz o que está errado **e** o que fazer.
- **Testar diálogo:** Percurso gráfico ligado à execução, teste interativo e estado inicial configurável. O elenco em cima do registo mostra onde cada personagem está na cena.
- **Estado inicial do jogo:** Escreve-se uma entrada por linha — o caminho do estado, um ponto, e o valor — e não o YAML: `relationship.pacci.friendship.5`, `inventory.caixa.1`, `flags.conheceu_pacci.true`. O painel mostra por baixo o que entendeu de cada linha, e diz o que está errado quando uma linha não dá para ler. Um YAML colado de um ficheiro antigo continua a ser lido.
- **Ajuda:** Onde havia comentários escritos há agora um «i» que abre um tooltip ao passar o rato (ou com o teclado), com a mesma explicação. O tooltip vira-se sozinho para não cair fora da janela.

**Tipos de nó:**
Entrada de personagem, Ação do personagem, Fala, Escolha, Ramificação, Saída de personagem e Fim. Ao adicionar um nó, o editor liga-o ao anterior quando esse nó aceita um único destino e ainda não tem um.

**Elenco:**
Os nós `character_enter` / `character_exit` dizem quem está na conversa. O palco mostra até 4 personagens, escurece quem não está a falar, e uma fala com `emotion` sobrepõe-se à emoção com que o personagem entrou. O fundo e a composição da cena não são do diálogo — isso é do sistema de cenas.

**Cena (posições, poses e profundidade):**
Uma entrada declara onde o personagem aparece; uma alteração muda quem já está em cena. Os três campos são os mesmos nos dois nós:

```yaml
- type: character_enter
  character_id: pacci
  position: center_left    # left · center_left · center · center_right · right
  pose: sit                # stand · sit — o personagem entra sentado
  depth: back              # back · front — quem é desenhado à frente de quem
  depth_of: neven          # opcional: «atrás de neven». Sem isto, vale para todo o elenco.
  animation_id: step_in
  emotion: relaxed
```

- **Posição** é a ordem no palco, da esquerda para a direita. As distâncias são do palco, que se organiza pelo número de personagens em cena.
- **Pose** é o que o corpo faz nesse lugar: de pé ou sentado.
- **Profundidade** diz quem é desenhado à frente de quem. Com um personagem em «Em relação a» é relativo a ele; sozinha, vale para todo o elenco.
- Uma **ação** (`character_action`) só declara o que mudou: o que deixas em branco fica como estaba. Levantar-se, sentar-se, dar um passo para o lado ou ficar atrás de alguém são todos o mesmo nó. A pose escolhida leva o movimento consigo — «sentado» implica «sentar-se» — até escolheres outro.
- O que a entrada e a alteração dizem usa as mesmas palavras na lista de nós, no mapa e na pré-visualização, para os três nunca discordarem.

**Animações:**
Uma animação não é um nome para decorar: escolhes três coisas e o editor compõe o `animation_id` que o ficheiro leva.
| O que escolhes | Valores | Onde aparece |
|---|---|---|
| **Movimento** | nenhum (em qualquer momento); andar · correr · aparecer (na entrada); repousar · tremer · ondular (na fala); levantar-se · sentar-se · dar um passo (na ação); mover · desaparecer (na saída) | sempre |
| **De que lado / Para que lado** | esquerda · direita · centro | entrada, ação e saída |
| **Velocidade** | lenta · normal · rápida | sempre |

Só o que difere do habitual se escreve, por isso o caso comum continua curto:

```yaml
animation_id: step_in              # andar, do centro, a velocidade normal
animation_id: run_in_from_left_fast # correr, da esquerda, depressa
animation_id: idle_shake_slow      # tremer devagar, durante a fala
animation_id: sit_down            # sentar-se
animation_id: step_out_slow       # mover para fora, devagar
```

Um id escrito à mão também se lê: as palavras são lidas pelas mesmas regras do motor (a mais específico primeiro), por isso `enter_surprised` abre nos controlos como «andar». Uma saída tem o seu lado no campo `direction` do nó, e não no id — dizê-lo duas vez seria dizer a mesma coisa duas vezes.

Os campos começam sempre com um valor: um nó sem animação fica com a do seu momento (`step_in` numa entrada, `idle` numa fala, `step_out` numa saída), e a pose de uma ação escolhe o movimento que lhe corresponde. «Nenhum» é a excepção: não escreve `animation_id` nenhum, e é assim que um nó diz que não se move — quem o escolher, e voltar ao nó depois, continua a vê-lo escolhido.

**Ramificações (nó `conditional`):**
Os ramos são avaliados por ordem e o primeiro que passa ganha; um ramo sem condição é o caso padrão.

Uma condição é um caminho de estado, um operador e um literal:

```yaml
if:
  all:
    - condition: equals
      left: inventory.caixa
      right: true
```

- **Caminhos:** `flags.<nome>`, `inventory.<item>`, `stats.<nome>`, `time.hour`, `time.day`, `objectives.<id>` e `relationship.<personagem>.<tipo>` (três segmentos, obrigatórios).
- **Um booleano é uma pergunta de sim ou não**, não um valor a igualar.
  - Numa **flag**, o valor é a verdade: `flags.escolheu_o_joelho = true`.
  - Num **item**, o valor é sempre uma contagem (1 chave, 0 chaves), por isso `inventory.caixa = true` quer dizer «a contagem está acima de zero» e `= false` cobre `0`, um item já gasto e um item que nunca foi dado. Serve `inventory.caixa >= 1` — é a mesma pergunta.
- `>` `≥` `<` `≤` só fazem sentido com números (itens, afinidades, contadores, stats).
- Texto é exato: `flags.mood = "brave"` nunca é igual a `flags.mood = true`.
- Uma lista (`dialogues.seen`, `paths.unlocked`) compara por pertença: `equals: test_3` quer dizer «já viu este diálogo».
- Grupos: um grupo lê-se de quatro maneiras — «Todas verdadeiras (E)», «Pelo menos 1 verdadeira (OU)», «Pelo menos 1 falsa (NÃO E)» e «Todas falsas (NÃO OU)». As duas últimas escrevem o grupo debaixo de um `not`. Também servem em `visible_if` / `enabled_if` de uma escolha e em `entry_conditions`. Um grupo sem condições não oferece escolha: não há nada para combinar.

No editor, cada ramo lê-se como uma frase — **«Vai para X se Y»** — com o destino na primeira linha e a condição logo abaixo, dentro do mesmo cartão. Numa folha, **Inventário** pede o item e depois a condição (tem, não tem, mais que, pelo menos, menos que, no máximo), e só ganha uma caixa de quantidade quando a condição compara números — «tem» e «não tem» respondem-se com a existência do item; **Relação** mantém os seus cinco campos — Estado, Personagem, Relação, Condição, Valor — numa só linha, em cinco colunas, mesmo num painel estreito. Os grupos encolhem à esquerda com uma linha de guia, por isso vê-se o que está dentro de um grupo e o que está fora.

Não há ids para escrever: o `branch_id` de um ramo é gerado a partir da posição (`ramo_1`, `ramo_2`, …), como o `choice_id` de uma opção. A lista acaba **sempre** num caso padrão — o ramo sem condição, que recebe o que nenhum dos outros recebeu — e esse ramo não se elimina. Acrescentar um ramo mete-o acima do caso padrão, que é o que o mantém no fim.

**Escolhas (nó `choice`):**
Cada opção é um cartão que se abre: o resumo diz «① Fico. → fala_2» e por dentro ficam o texto, o destino, as condições («Visível só se…», «Escolhível só se…») e os efeitos. O `choice_id` é gerado a partir do texto da opção e volta a ser gerado quando o texto muda, por isso não há id para manter em dia. Não há campo de «motivo de estar bloqueada»; as condições de visibilidade e de escolha dizem tudo o que o jogador precisa de ver.
No painel **Estado inicial do jogo**, cada entrada é uma linha — o caminho, um ponto, e o valor: `relationship.pacci.friendship.5`, `inventory.caixa.1` (o inventário é uma contagem), `flags.conheceu_pacci.true`.

**Falar e pensar:**
Uma linha pode ser dita em voz alta ou apenas pensada. Há duas maneiras de o dizer, e uma linha pode usar as duas:

- **A linha inteira** — o campo «Como é dito» na secção «Conversa»: «Fala» (o habitual, que não escreve nada no ficheiro) ou «Pensamento», que escreve `delivery: thought`.
- **Uma parte da linha** — `{thought|texto}` dentro do texto, para um personagem dizer uma coisa e pensar a seguinte.

```yaml
- type: line
  speaker_id: pacci
  delivery: thought          # a linha inteira é pensada; sem isto, é falada
  text:
    - type: text
      value: Claro que sim.
    - type: thought
      value: Não digas nada.
```

O motor ainda não conhece `delivery` nem o segmento `thought`: são a proposta desta versão para o que a caixa de texto passa a distinguir. Um ficheiro com estes campos continua a abrir e a exportar sem os perder.

**Perguntas ao jogador (entrada do jogador):**
Um nó «Pergunta ao jogador» é uma chamada à ação: o diálogo para e pede um valor ao jogador antes de continuar. Há dois tipos de resposta — **texto livre** (o jogador escreve, por exemplo o nome da sua personagem) e **escolha de opções** (o jogador escolhe de uma lista, por exemplo um elemento). Dá-se um nome à variável, e o valor fica em `input.<nome>`.

```yaml
- type: player_input
  question: Como te chamas?
  variable: name              # o valor fica em input.name
  input_type: text            # text · choice
  placeholder: o teu nome     # text: a dica na caixa
  next: fala_2
```

- O campo «Pergunta ao jogador» é o que se mostra antes de o jogador responder; «Variável» é o nome onde o valor fica — com letras e números, como `name` ou `elemento`.
- No forger o valor **só existe durante o teste**, no estado local. O objetivo é que, no jogo, o motor o guarde em `input.<nome>` e o mantenha entre diálogos.
- Lê-se o valor em qualquer texto com `{input.<nome>}` (ver «Sintaxe do texto»). Até o jogador responder, a referência aparece na pré-visualização sem valor.
- Uma condição pode comparar com ele — `input.elemento = "Fogo"` — a partir da raiz «Entrada do jogador» no editor de condições. Escrever `{input.algo}` que nenhuma pergunta preenche é um aviso, não um erro: o texto ficaria sem valor.
- O motor ainda não conhece o nó `player_input` nem a raiz `input`: são a proposta desta versão, como `pose` e `delivery`. Um ficheiro com eles continua a abrir e a exportar sem os perder.

**Onde mexer nas listas:**
Todas as listas que os editores oferecem — personagens, itens, emoções, posições, poses, profundidades, movimentos, velocidades, tipos de relação, tipos de resposta do jogador, etiquetas de resultado, operadores e raízes das condições, catálogo de efeitos e raízes do estado — estão em `scripts/lists.js`. Acrescentar ou alterar um valor é editar esse ficheiro e mais nenhum: os dropdowns, as sugestões, a validação e a composição dos `animation_id` leem todos daí. Nenhum outro módulo guarda uma lista sua.

**Sintaxe do texto:**
- `{pause:400}` → pausa de 400 ms.
- `{click id|texto|no_destino}` → texto clicável (opcional).
- `{click! id|texto|no_destino}` → texto clicável (obrigatório).
- `{thought|texto}` → pensamento: o personagem pensa em vez de falar.
- `{whisper|texto}` → sussurro.
- `{shout|texto}` → berro.
- `{input.<nome>}` → o valor que o jogador deu a essa variável numa «Pergunta ao jogador» (ex.: `{input.name}`).
- `{name}` → nome do protagonista; lê a variável `name` do jogador.
- `{elements}` → elementos do protagonista; lê a variável `elements` do jogador.
- `{style bold italic color=#D88CFF speed=0.8|texto}` → texto com estilo.
- `{style wave=normal wave_speed=0.8|texto}` → ondulação lenta.
- `{style shake=light shake_speed=1.2|texto}` → vibração leve e rápida.
- `{style jitter=normal jitter_speed=0.8|texto}` → tremor lento.
- `\{` → chaveta literal.

A ajudinha «i» da «Marcação», por baixo da caixa de texto, lista esta sintaxe completa — e o dropdown ao lado insere a marcação escolhida na posição do cursor.

---

### Personagens integradas
As listas de personagens usam estes IDs fixos: `alice`, `annah`, `arthur`, `barasturon`, `duha`, `ttelion`, `neven`, `noelia`, `pacci`, `raphael`, `nicima` e `kelly`. Um ID desconhecido num YAML importado é preservado e assinalado pela verificação. A lista vive em `scripts/lists.js`, com todas as outras.

---

### Limites
- A pré-visualização não reproduz sprites nem áudio.
- O diálogo trata do **elenco** (quem entra, quem sai, quem fala, onde está), mas não da **cena**: um ficheiro antigo com `scenes:` ou nós `scene` abre com um aviso, e esses nós são ignorados pelo jogo mas preservados no export.
- Comentários no YAML não são preservados ao exportar.
- O diálogo não escreve id próprio: o nome do ficheiro é o identificador. Um ficheiro com `dialogue_id` continua a abrir, mas o id não é escrito de volta — o efeito `unlock_dialogue` guarda o id que lhe deres.
- O motor ainda não conhece `pose`, `depth`/`depth_of`, o nó `character_action`, `delivery`, o segmento `thought`, o nó `player_input` nem a raiz `input`: são a proposta desta versão para o que o palco, a caixa de texto e as perguntas ao jogador passam a ler. Uma entrada ou ação que o motor ignore continua a jogar — o personagem fica na posição que o motor calhar; um valor de `input.<nome>` vive só no teste até o motor o guardar.
- O nó inicial é sempre o primeiro da lista: um ficheiro que declara outro em `start_node` começa no primeiro, e o aviso de importação diz qual era o declarado.

---

### Testar alterações
1. Abre `index.html`.
2. Arrasta um passo na lista de nós e confirma que a ordem muda; desfaz para voltar atrás. Com um passo focado, Ctrl + setas move-o.
3. Confirma que os «i» da barra lateral e dos campos abrem o tooltip com o rato e com o teclado, e que um campo encostado à direita abre o tooltip para a esquerda.
4. Adiciona uma entrada de personagem e confirma as secções «Quem», «Cena», «Como se move», «Percurso» e «Efeitos»; escolhe a pose «sentado» e uma profundidade «atrás» de outro personagem e vê o resumo na lista de nós.
5. Adiciona um nó «Ação do personagem» para o mesmo personagem levantar-se: escolhe a pose «de pé» e confirma que o movimento passou a «Levantar-se». Muda a velocidade para «rápida», exporta e confirma `animation_id: stand_up_fast` no ficheiro.
6. Confirma que o nó inicial é sempre o primeiro da lista: arrasta outro nó para o topo e vê a lista «Nó inicial» da barra lateral a acompanhá-lo. A lista não se deixa mudar, e o nó selecionado mostra «▶ Início» só quando é o primeiro.
7. Adiciona uma Ramificação: confirma que há sempre um «Caso padrão» no fim, que não tem botão de remover, e que um ramo novo entra acima dele. Confirma que não há campo de id de ramo.
8. Adiciona uma Escolha com duas opções e confirma os cartões expansíveis, a ausência de id e de «motivo de estar bloqueada», e que o id da opção se gerou a partir do texto (exporta e procura `choice_id`).
9. Dentro de uma condição, junta um grupo a uma condição e confirma a indentação com a linha de guia. Com o grupo vazio não há seletor de modo; com lá uma condição, escolhe «Pelo menos 1 falsa (NÃO E)» e confirma o YAML.
10. Escreve uma fala e confirma o compositor da animação: «repousar» com velocidade «lenta» escreve `animation_id: idle_slow` (exporta para o ver). Não há leitura do id no editor — as três escolhas dizem o que o ficheiro leva.
11. Numa fala, escolhe «Como é dito → Pensamento» e escreve `Claro que sim. {thought|Não digas nada.}`: confirma que a pré-visualização dos segmentos lista o pensamento e que, no teste, a linha aparece como pensamento.
12. Em «Testar diálogo», escreve no estado inicial `relationship.pacci.friendship.5` e `raiz.estragada.1`: confirma que a primeira é lida como `relationship.pacci.friendship = 5` e que a segunda dá erro na linha 2. Um YAML antigo continuava a ser lido.
13. Alterna entre «Editar» e «Testar diálogo»; confirma que os chips do elenco mostram posição, pose e profundidade.
14. Exporta e importa o YAML para confirmar que os dados são preservados. Importa um ficheiro cujo `start_node` não é o primeiro nó e confirma o aviso de que o início passou a ser o primeiro da lista.
15. Numa fala, escolhe «Como se move → Nenhum»: confirma que «Velocidade» fica desativada, que o nó deixa de escrever `animation_id`, e que continua «Nenhum» quando voltas a selecionar o nó. Numa saída, confirma que «Movimento» oferece Nenhum, Mover e Desaparecer.
16. Numa entrada de personagem, confirma que «Posição» lista esquerda · centro-esquerda · centro · centro-direita · direita. Numa Ramificação, confirma que **Inventário** pede o item antes da condição e que só mostra «Quantidade» quando a condição compara números; confirma também que uma **Relação** mantém os seus cinco campos numa só linha, em cinco colunas, mesmo com a janela estreita.
17. Adiciona uma «Pergunta ao jogador»: escreve a pergunta, dá o nome `name` à variável e liga-a a uma fala com o texto `Olá, {input.name}!`. Em «Testar diálogo», confirma que a pergunta aparece com uma caixa de texto, que escrever um nome e confirmar guarda `input.name` e que a fala seguinte o mostra no lugar do `{input.name}`. Muda o tipo para «Escolha de opções», acrescenta opções, e confirma que o teste passa a mostrá-las como botões. Exporta e confirma `type: player_input`, `variable:`, `input_type:` e as `options:`.

---
