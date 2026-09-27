# Dialogue Forger

Uma página HTML para criar e editar diálogos do *Galatime - Chronicles of the Past*.

Objetivo: escrever diálogos sem mexer em YAML manualmente e com o mínimo de inputs.

---

### Como usar
Abre o `index.html` no navegador. Não precisa de servidor nem de uma cópia da pasta do jogo.

- **YAML:** Importa ficheiros `.yml` / `.yaml` e exporta o diálogo em `.yaml`.
- **Rascunho:** O diálogo e o estado da pré-visualização são guardados neste navegador.
- **Sem rede:** A página e os campos continuam disponíveis; o YAML requer que `js-yaml` tenha carregado. Para uso totalmente offline, guarda uma cópia local de `js-yaml.min.js` e aponta o `<script>` para essa cópia.

---

### Funcionalidades

**Áreas:**
- **Cabeçalho:** Estado de gravação local, vistas «Editar» / «Testar diálogo», importar e exportar YAML.
- **Identidade:** ID do diálogo e nó inicial na barra lateral.
- **Estrutura:** Escolhe um tipo de nó, adiciona-o e edita os campos no painel principal.
- **Editor:** Falas e campos por tipo de nó; animações e efeitos ficam nas opções avançadas.
- **Verificação:** Erros e avisos atualizados durante a edição, com ligação ao nó problemático.
- **Testar diálogo:** Percurso gráfico ligado à execução, teste interativo e estado inicial configurável.
- **Personagens:** A lista integrada de 12 personagens aparece como sugestões (datalist) em falantes e nós de entrada/saída — qualquer outro ID pode ser escrito à mão; não lê ficheiros do projeto.

**Tipos de nó:**
Entrada de personagem, Fala, Escolha, Ramificação, Saída de personagem e Fim. Ao adicionar um nó, o editor liga-o ao anterior quando esse nó aceita um único destino e ainda não tem um.

**Elenco:**
Os nós `character_enter` / `character_exit` dizem quem está na conversa. O palco mostra até 4 personagens, escurece quem não está a falar, e uma fala com `emotion` sobrepõe-se à emoção com que o personagem entrou. O fundo e a composição da cena não são do diálogo — isso é do sistema de cenas.

**Sintaxe do texto:**
- `{pause:400}` → pausa de 400 ms.
- `{click id|texto|no_destino}` → texto clicável (opcional).
- `{click! id|texto|no_destino}` → texto clicável (obrigatório).
- `{style bold italic color=#D88CFF speed=0.8|texto}` → texto com estilo.
- `{style wave=normal wave_speed=0.8|texto}` → ondulação lenta.
- `{style shake=light shake_speed=1.2|texto}` → vibração leve e rápida.
- `{style jitter=normal jitter_speed=0.8|texto}` → tremor lento.
- `\{` → chaveta literal.

---

### Personagens integradas
As listas de personagens usam estes IDs fixos: `alice`, `annah`, `arthur`, `barasturon`, `duha`, `ttelion`, `neven`, `noelia`, `pacci`, `raphael`, `nicima` e `kelly`. Um ID desconhecido num YAML importado é preservado e assinalado pela verificação.

---

### Limites
- A pré-visualização não reproduz sprites nem áudio.
- O diálogo trata do **elenco** (quem entra, quem sai, quem fala), mas não da **cena**: um ficheiro antigo com `scenes:` ou nós `scene` abre com um aviso, e esses nós são ignorados pelo jogo mas preservados no export.
- Comentários no YAML não são preservados ao exportar.
- IDs de diálogo usados por `unlock_dialogue` são livres; não há catálogo de diálogos carregado.

---
---
### Testar alterações
1. Abre `index.html`.
2. Cria um passo e confirma que o rascunho é guardado neste dispositivo.
3. Confirma a ordem dos tipos e experimenta editar emoção, posição e destino.
4. Usa a ajuda «i» da fala com rato e teclado.
5. Alterna entre «Editar» e «Testar diálogo»; experimenta uma escolha e confirma o nó ativo no mapa.
6. Confirma que o seletor de personagens mostra apenas os IDs integrados.
7. Exporta e importa o YAML para confirmar que os dados são preservados.

---
