# Skill Forger — mockup

Ferramenta autónoma para criar e editar o catálogo de skills. A árvore de
aprendizagem é sempre derivada desse catálogo. Abre `index.html` diretamente
no browser; não precisa de servidor.

## Utilização

- Os exemplos de Aqua/Ignis são rascunhos locais para demonstrar pré-requisitos
  entre árvores; são guardados apenas no `localStorage` do browser.
- O ID é gerado a partir do nome quando a skill é criada e não muda quando o
  nome é editado.
- Em **Skills**, edita identidade, custo, pré-requisitos, alvo, dano e operações
  de combate. Os efeitos podem alterar o atacante, o alvo ou uma equipa inteira.
- Os modelos abrangem ataques físicos e mágicos, golpes múltiplos, ataques em
  área, buffs, debuffs, recuperação de vida/mana/stamina, dano sequencial e
  drenagem de recursos.
- Em **Skill-trees**, escolhe o elemento: os nós são as skills desse
  `element_id`, as arestas vêm dos `learning_requirements` e o custo de cada
  nó do `learning_cost`. Um nó com pré-requisitos de outro elemento mostra
  cada ataque externo como `↗ elemento · id` (e no editor o chip correspondente
  também apresenta `elemento · id`). A árvore é organizada automaticamente de cima para
  baixo, com os pré-requisitos acima das skills dependentes; os cartões não
  podem ser movidos. Clica para selecionar, faz duplo-clique para abrir no
  editor e marca um ou vários pré-requisitos para criar automaticamente uma
  skill dependente. Arrasta o fundo para percorrer a vista. Os requisitos
  continuam editáveis no editor de skills.
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

O Backend lê `apps/desktop/src/data/combat/skills/skills.yaml` e deriva as
árvores a partir dele. O mockup descarrega o `skills.yaml`; a gravação direta
no repositório pertence a uma fase posterior do Forger.
