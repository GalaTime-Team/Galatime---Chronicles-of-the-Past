# Dialogue Forger

Uma página HTML para criar e editar diálogos do *Galatime - Chronicles of the Past*.

Objetivo: escrever diálogos sem mexer em YAML manualmente e com o mínimo de inputs.

---

### Como usar
Abre o `index.html` no navegador. Não precisa de servidor.

- **Offline:** Baixa o `js-yaml.min.js` e aponta o `<script>` para ele.
- **Ler ficheiros de exemplo:** Alguns navegadores bloqueiam a leitura em `file://`. Usa **Importar** se não funcionar.
- O progresso é guardado no `localStorage`.

---

### Funcionalidades

**Áreas:**
- **Cabeçalho:** ID, nó inicial, importar, exportar YAML, validar, desfazer/refazer.
- **Nós:** Lista de nós, criar nó a partir de modelos ou tipos simples.
- **Editor:** Campos por tipo de nó, com texto clicável e secções recolhíveis.
- **Verificação:** Erros e avisos com link direto para o nó problemático.
- **Catálogo:** Listas de personagens/itens, importáveis da pasta do projeto.
- **Pré-visualização:** Jogar o diálogo com estado inicial à escolha.

**Modelos de nó:**
Criam nós prontos a editar: fala simples, texto clicável, escolha, entrada/saída de personagem, condição, fim.
Ao adicionar um nó, se o anterior não tiver "próximo", liga automaticamente.

**Elenco:**
Os nós `character_enter` / `character_exit` dizem quem está na conversa. O palco mostra até 4 personagens, escurece quem não está a falar, e uma fala com `emotion` sobrepõe-se à emoção com que o personagem entrou. O fundo e a composição da cena não são do diálogo — isso é do sistema de cenas.

**Sintaxe do texto:**
- `{pause:400}` → pausa de 400 ms.
- `{click id|texto|no_destino}` → texto clicável (opcional).
- `{click! id|texto|no_destino}` → texto clicável (obrigatório).
- `{style bold italic color=#D88CFF speed=0.8|texto}` → texto com estilo.
- `{style wave/shake/jitter=normal|texto}` → letras animadas, aceitam `off`, `light`, `normal` ou `strong`.
- `\{` → chaveta literal.

---

### Limites
- O preview não reproduz sprites nem áudio.
- O diálogo trata do **elenco** (quem entra, quem sai, quem fala), mas não da **cena**: um ficheiro antigo com `scenes:` ou nós `scene` abre com um aviso, e esses nós são ignorados pelo jogo mas preservados no export.
- Comentários no YAML não são preservados ao exportar.
- Importar pastas grandes é lento.
- `unlock_dialogue` só é verificado após importar pastas com diálogos.

---
---
### Testar alterações
1. Abre `index.html`.
2. Verifica se há 0 erros.
3. Testa a pré-visualização.
4. Exporta e importa o YAML para confirmar que não há perdas.

---