# Skill Forger — mockup

Ferramenta autónoma para criar e editar o catálogo de skills. A árvore de
aprendizagem é sempre derivada desse catálogo. Abre `index.html` diretamente
no browser; não precisa de servidor.

## Utilização

- Os exemplos de Aqua/Ignis são rascunhos locais para demonstrar pré-requisitos
  entre árvores; são guardados apenas no `localStorage` do browser.
- O ID é gerado a partir do nome quando a skill é criada e não muda quando o
  nome é editado.

### Criar uma skill

O input mínimo é **o nome e o elemento**. O ecrã vazio traz uma criação rápida
(nome + elemento → criar); o Forger deriva o ID, preenche a descrição com uma
frase escrita a partir do que escolheste e deixa tudo o resto com valores por
omissão. A partir daí, o editor divide o trabalho em passos numerados:

| Passo | O que se decide |
|---|---|
| 01 · Identidade | Nome, elemento e descrição (botão **Gerar descrição**) |
| 02 · Aprendizagem | Custo em XP e skills necessárias (de qualquer elemento) |
| 03 · Combate | Alvo, resultado direto (dano, precisão, golpes), custos e efeitos |
| 04 · Traços | Hora do dia, crítico, bónus contra elementos e contra alvos enfraquecidos |

Cada campo com um `ⓘ` explica, em uma linha, o que o motor faz com ele. A
barra de resumo em cima do editor mostra, a qualquer momento, o elemento, o
alvo, o dano, a precisão, o custo e os traços da skill.

### Efeitos

Os padrões disponíveis são: recuperar recurso, regenerar por turno, buff,
debuff, dano, drenar recurso, purificar, dissipar, dano atrasado, repetir
ação, mover posição, manter carga e **retroceder o tempo**. O editor de
atributos aceita todos os stats do motor — **`accuracy`** (precisão dos
próprios ataques), **`evasion`** (esquiva: dificulta ser atingido) e
**`crit_chance`** (crítico dos próprios ataques) — e cada cartão de efeito
tem *Opções avançadas* com a polaridade, as imunidades a status, as ações
proibidas, o controlo de turno, os custos diferidos e a manutenção.

#### Retroceder o tempo (rewind)

O retrocesso tira uma ferida atrás: o alvo volta ao estado que tinha antes do
último turno (ou dos últimos *N* turnos). O motor guarda um histórico curto
de cada unidade — uma fotografia por turno — e o retrocesso lá volta.

```yaml
- effect_id: rewind_effect
  status_effect: Rewind
  apply_to: target
  turns: 1
  rewind:
    turns: 3                       # quantos turnos desfazer (sem o campo: até ao início da luta)
    resources: [hp, mana, stamina] # que recursos voltam (sem o campo: todos)
    cleanse: true                  # desfaz também os estados desses turnos
```

### O que o motor do jogo já lê

O motor (`apps/desktop/src/services/combat/`) lê os traits e os efeitos
descritos aqui. O contrato completo — com a precedência da hora do dia e o
significado de cada campo — está em `docs/combat/FORGER_MECHANICS.md`.

Em resumo:

- `solar` (×1.5 de dia, ×0.5 de noite) e `nocturnal` (o inverso), lidos contra
  a **hora do mundo** — a luta guarda a hora com que começou.
- `accuracy`, `evasion` e `crit_chance` como stats: a precisão é de *saída* (afeta
  os próprios ataques), a esquiva é de *entrada*, e o crítico multiplica o golpe
  por ×1.75.
- `ignore_accuracy`, `guaranteed_crit_vs_status`, `defense_pierce`,
  `bonus_vs_elements`, `bonus_vs_hp_below` e `flee_below_hp`.
- Os efeitos `move`, `rewind`, `cleanse`, `dispel`, `regen_per_turn`,
  `heal_block`, `untargetable`, `prevent_skills`, `status_immunities`,
  `counter`, `drain_to`, `turn_offset`, `cooldown_tick`, `self_upkeep` e
  `deferred_cost`.

Ainda não são lidos pelo motor: `deferred_damage`, `echo`,
`self_damage_per_target` e `collateral`.

### Traços por elemento

Cada elemento precisa de regras que são só suas. O Forger escreve todas, para
que a skill possa ser composta já no formato final:

| Elemento | Campos que usa |
|---|---|
| **Umbra** (noite, escuridão) | `nocturnal`, `crit_chance`, `evasion` (buff), `heal_block`, `guaranteed_crit_vs_status`, `bonus_vs_hp_below`, `drain_to` |
| **Spatium** (tempo, espaço) | `turn_offset`, `cooldown_tick`, `move`, `deferred_damage`, `echo`, `untargetable`, `ignore_accuracy`, `prevent_actions` |
| **Vetus** (poder antigo) | `costs.hp`, `deferred_cost`, `self_upkeep`, `prevent_skills`, `defense_pierce`, `cleanse`, `dispel` |
| **Lux** (dia, luz) | `solar`, `bonus_vs_elements`, `dispel`, `cleanse`, `regen_per_turn`, `status_immunities` |

### Simulador

O separador **Simulador** reproduz a cadeia de dano do motor
(`apps/desktop/src/services/combat/damageCalculator.ts`):

```
dano = (ATK / RES) × elemento × (PWR / 1) × traços × linha × defesa
```

Podes ajustar o atacante (ataques, stat `accuracy`, stat `crit_chance`, linha),
o defensor (defesas, esquiva, elementos, linha, a defender, vida restante), a
hora do dia e o nível da skill (I–V). O resultado mostra o dano por acerto, o
dano esperado por uso, a chance de acerto, os golpes esperados e a cadeia
passo a passo.

**Sem críticos e sem a variância aleatória** (0.9 … 1.1): o número mostrado é
o valor esperado de um acerto, não uma tiragem. Se o poder for sorteado, o
resultado mostra também o intervalo mínimo–máximo.

O simulador aplica as mesmas regras que as árvores de skills pedem, mesmo
quando o motor ainda não as implementa:

| Regra | Efeito na simulação |
|---|---|
| `solar` / `nocturnal` | ×1.5 de dia / ×0.5 de noite (e o inverso) |
| `accuracy` / `evasion` | A precisão do atacante menos a esquiva do alvo |
| `ignore_accuracy` | O golpe acerta sempre |
| `crit_chance` | Chance de crítico mostrada à parte (×1.75) |
| `bonus_vs_elements` | Multiplicador extra sobre a tabela de elementos |
| `bonus_vs_hp_below` | Multiplicador extra contra alvos enfraquecidos |
| `defense_pierce` | Fração da defesa do alvo que o golpe ignora |

### Árvores

Em **Skill-trees**, escolhe o elemento: os nós são as skills desse
`element_id`, as arestas vêm dos `learning_requirements` e o custo de cada nó
do `learning_cost`. Um nó com pré-requisitos de outro elemento mostra cada
ataque externo como `↗ elemento · id`. A árvore é organizada automaticamente
de cima para baixo, com os pré-requisitos acima das skills dependentes; os
cartões não podem ser movidos. Clica para selecionar, faz duplo-clique para
abrir no editor e marca um ou vários pré-requisitos para criar automaticamente
uma skill dependente. Arrasta o fundo para percorrer a vista.

### Validação

O painel da direita valida o catálogo: IDs únicos em `snake_case`, elemento
reconhecido, custos não negativos, precisão entre 0 e 100, `hit_count ≥ 1`,
pré-requisitos que resolvem e nenhum ciclo, campos dos efeitos bem formados
(polaridade, `cleanse`/`dispel`, `regen_per_turn`, `move`, `deferred_damage`,
imunidades, ações proibidas) e coerência dos bónus contra elementos e contra
alvos enfraquecidos. Os **erros** bloqueiam a exportação; os **avisos** (por
exemplo, uma skill sem descrição) apenas apontam o que falta.

### Importar / exportar

- **Exportar YAML** descarrega o ficheiro `skills.yaml`, pronto a colocar em
  `apps/desktop/src/data/combat/skills/`.
- **Importar YAML** abre o seletor de ficheiros para escolher um único
  `skills.yaml` (ou `.yml`). Valida IDs, pré-requisitos e ciclos antes de
  substituir o rascunho local; as árvores são derivadas com posição
  automática.

O CDN de `js-yaml` permite produzir e ler o YAML quando há rede. Sem ele, a
edição e o autosave continuam disponíveis.

## Formato

`skills.yaml` contém apenas a lista única de skills, ordenada por
`element_id` → `id`. O comentário índice no topo é regenerado na exportação.
É o único ficheiro do catálogo: não existem ficheiros de árvore. A árvore de
cada elemento é derivada do catálogo — pertença pelo `element_id`, arestas e
raízes pelos `learning_requirements.required_attack_ids`, custo pelo
`learning_cost.experience_points`. Efeitos sem `element_id` herdam o elemento
da skill.

### Campos por skill

| Campo | Notas |
|---|---|
| `id`, `name`, `description`, `element_id` | O ID deriva do nome e nunca muda |
| `learning_cost.experience_points` | Custo para desbloquear |
| `learning_requirements.required_attack_ids` | Pré-requisitos, de qualquer elemento |
| `targeting`, `damage`, `accuracy`, `hit_count` | Alvo e resultado direto |
| `costs` | `mana`, `stamina`, `hp`, `cooldown` |
| `solar`, `nocturnal` | ×1.5 de dia / ×0.5 de noite (e o inverso) |
| `crit_chance` | Percentagem de acertos críticos (×1.75) |
| `ignore_accuracy` | O golpe acerta sempre |
| `guaranteed_crit_vs_status` | ID do status que garante o crítico |
| `defense_pierce` | Fração da defesa do alvo que o golpe ignora |
| `bonus_vs_elements` | Multiplicador por elemento do defensor |
| `bonus_vs_hp_below` | `{ threshold, multiplier }` para alvos enfraquecidos |
| `flee_below_hp` | Fração de vida abaixo da qual o alvo foge em pânico |
| `effects` | Lista de efeitos (ver abaixo) |
| `collateral` | Dano colateral |

### Campos por efeito

| Campo | Notas |
|---|---|
| `effect_id`, `status_effect`, `apply_to`, `turns` | Identidade e duração |
| `effect_hit_chance` | Chance de o efeito pegar (0–1) |
| `buff`, `debuff` | Stats afetados (`accuracy`, `evasion`, `crit_chance`, …) |
| `resource_regen`, `regen_per_turn` | Recursos pagos agora / por turno |
| `damage`, `damage_per_turn` | Dano imediato / dano a cada turno |
| `damage_variance` | Variação do dano imediato |
| `heal`, `resource_drain`, `drain_to` | Cura plana, drenagem e para onde vai |
| `polarity` | `positive`, `negative` ou `neutral` |
| `cleanse`, `cleanse_all` | Remover estados negativos |
| `dispel`, `dispel_all`, `dispel_status` | Remover estados positivos |
| `status_immunities` | Status que o alvo não pode sofrer |
| `prevent_actions`, `prevent_skills` | Ações (ou apenas skills) que o alvo fica impedido de usar |
| `untargetable` | O alvo não pode ser escolhido |
| `heal_block` | O alvo não pode ser curado por outros |
| `counter` | Reflete o próximo golpe recebido |
| `turn_offset`, `cooldown_tick` | Adiantar/atrasar turnos, reduzir cooldowns |
| `deferred_damage`, `echo`, `move` | Golpe atrasado, repetir a última ação, mudar de posição |
| `rewind` | `{ turns, resources, cleanse }` — desfazer os últimos turnos do alvo |
| `deferred_cost`, `self_upkeep`, `self_damage_per_target` | Preços: dívida, manutenção por turno e custo por alvo |
| `can_stack`, `element_id` | Acumulação e elemento do efeito |

O Backend lê os ficheiros em `apps/desktop/src/data/combat/skills/` e deriva as
árvores a partir deles. O mockup descarrega o `skills.yaml`; a gravação direta
no repositório pertence a uma fase posterior do Forger.
