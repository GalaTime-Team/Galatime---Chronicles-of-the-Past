/**
 * Every list the editors offer, in one file.
 *
 * Adding a character, an item, a pose or a kind of movement is a matter of
 * editing this file and nothing else: the dropdowns, the suggestion lists, the
 * validation and the composition of animation ids all read from here, so a new
 * entry shows up everywhere at once. No other module keeps a vocabulary of its
 * own — a list found anywhere else is a bug.
 *
 * The values are the engine's own words wherever the engine has words. A value
 * the engine does not know is still *read* by the same rules (an animation id
 * is parsed word by word, a position is matched by the words in it), so a list
 * that falls behind the engine costs suggestions, never correctness: a
 * hand-written id keeps working and is only missing from the menu.
 *
 * What stays out of this file is anything with behaviour attached: node kinds,
 * the rules that compose an animation, the parsing of a condition tree. Those
 * live next to the code that applies them.
 */
window.DialogueForger = window.DialogueForger || {};

(function (Forger) {
    'use strict';

    /* ------------------------------------------------------------ elenco */

    /**
     * The character ids the shipped cast uses.
     *
     * Fixed on purpose: the forger is a standalone page and does not read the
     * repository, so the list is what makes an id suggestable. An id outside it
     * is not refused — the validator warns, exactly like the engine tolerates
     * one — so a character created later is written by hand until it lands here.
     */
    var CHARACTER_IDS = [
        'alice', 'annah', 'arthur', 'barasturon', 'duha', 'ttelion',
        'neven', 'noelia', 'pacci', 'raphael', 'nicima', 'kelly',
    ];

    /** Item ids, offered where an effect names an item. */
    var ITEM_IDS = ['item_id'];

    /**
     * Dialogue ids.
     *
     * Empty because the file name **is** the dialogue's identity: there is no
     * registry of ids to suggest, and a half-guessed one would only mislead.
     */
    var DIALOGUE_IDS = [];

    /* ----------------------------------------------------------- emoções */

    /**
     * The sprite a line (or a choice question) asks for.
     *
     * The game matches these against the character's own art and falls back to
     * neutral, so this is a hint rather than a gate: a name it does not know is
     * ignored by the engine, not an error. The emotions the shipped dialogue
     * files actually use are all here, so a writer never has to invent a
     * spelling the art does not have.
     */
    var EMOTIONS = [
        'neutral', 'surprised', 'stressed', 'happy', 'annoyed',
        'afraid', 'frustrated', 'suspicious', 'thinking', 'unsure', 'angry',
        'concerned', 'kyun', 'like', 'nervous', 'relaxed', 'relaxing',
        'serious', 'trusting',
    ];

    /* --------------------------------------------------------------- cena */

    /**
     * Where a character stands on the stage, as a left-to-right hint.
     *
     * A position is an ordering hint, not a coordinate: the stage lays itself
     * out from the cast size and reads this only to decide who stands to whose
     * left. The halves between two slots (`center_left`, `center_right`) are
     * accepted content, not a second class of value.
     */
    var POSITIONS = ['left', 'center_left', 'center', 'center_right', 'right'];

    /** What a character is doing with their body while standing in a slot. */
    var POSES = ['stand', 'sit'];

    /** Which side of the cast a character is drawn on. */
    var DEPTHS = ['back', 'front'];

    /**
     * Portuguese labels for the free-form vocabularies.
     *
     * The same word is used in the node list, on the map and in the preview, so
     * the three never disagree about where someone is standing.
     */
    var VOCABULARY_LABELS = {
        pose: { stand: 'de pé', sit: 'sentado' },
        depth: { back: 'atrás', front: 'à frente' },
        position: {
            left: 'esquerda',
            center_left: 'centro-esquerda',
            center: 'centro',
            center_right: 'centro-direita',
            right: 'direita',
        },
    };

    /* ---------------------------------------------------------- movimento */

    /**
     * How a character moves, by the moment it belongs to.
     *
     * An author picks three things — what the body does, from or to which side,
     * and how fast — and the editor composes them into the one `animation_id`
     * the format carries. Composing keeps the file readable without asking a
     * writer to memorise a table of names, and the words used are the engine's
     * own, so a movement the engine has never seen is still read by them.
     */
    var ANIMATION_PHASES = {
        enter: 'a chegar',
        idle: 'enquanto fala',
        action: 'na ação',
        exit: 'a sair',
    };

    /**
     * How a character moves, by the moment it belongs to.
     *
     * An author picks three things - what the body does, from or to which side,
     * and how fast - and the editor composes them into the one `animation_id`
     * the format carries. Composing keeps the file readable without asking a
     * writer to memorise a table of names, and the words used are the engine's
     * own, so a movement the engine has never seen is still read by them.
     *
     * "none" writes nothing at all: it is how a node says "this one does not
     * move", so a character can stand still without an entrance, idle or exit
     * motion being implied. An exit carries a single "Mover" - walking off and
     * running off are the same motion at different tempos, so the speed choice
     * already tells them apart, and one button beats two.
     */
    var ANIMATION_KINDS = {
        enter: [
            { value: 'none', label: 'Nenhum' },
            { value: 'step_in', label: 'Andar' },
            { value: 'run_in', label: 'Correr' },
            { value: 'fade_in', label: 'Aparecer' },
        ],
        idle: [
            { value: 'none', label: 'Nenhum' },
            { value: 'idle', label: 'Repousar' },
            { value: 'idle_shake', label: 'Tremer' },
            { value: 'idle_wave', label: 'Ondular' },
        ],
        action: [
            { value: 'none', label: 'Nenhum' },
            { value: 'stand_up', label: 'Levantar-se' },
            { value: 'sit_down', label: 'Sentar-se' },
            { value: 'step_across', label: 'Dar um passo' },
        ],
        exit: [
            { value: 'none', label: 'Nenhum' },
            { value: 'step_out', label: 'Mover' },
            { value: 'fade_out', label: 'Desaparecer' },
        ],
    };

    /** The side a movement starts from or ends on. */
    var ANIMATION_DIRECTIONS = [
        { value: 'left', label: 'esquerda' },
        { value: 'right', label: 'direita' },
        { value: 'center', label: 'centro' },
    ];

    /** How fast a movement plays. `normal` writes nothing: it is the tempo the
     * engine gives to a movement nobody timed. */
    var ANIMATION_SPEEDS = [
        { value: 'slow', label: 'lenta' },
        { value: 'normal', label: 'normal' },
        { value: 'fast', label: 'rápida' },
    ];

    /** What a phase starts from when nobody has picked anything yet. */
    var ANIMATION_DEFAULTS = {
        enter: { kind: 'step_in', direction: 'center', speed: 'normal' },
        idle: { kind: 'idle', direction: 'center', speed: 'normal' },
        action: { kind: 'step_across', direction: 'center', speed: 'normal' },
        exit: { kind: 'step_out', direction: 'right', speed: 'normal' },
    };

    /** The kinds an action's own pose already implies. */
    var POSE_ACTIONS = { stand: 'stand_up', sit: 'sit_down' };

    /* ------------------------------------------------------------ relação */

    /**
     * The affinities a dialogue may read or change.
     *
     * A relationship path is three segments — `relationship.pacci.friendship` —
     * because affinity towards someone only means something once the *kind* of
     * affinity is named. This list is the menu the editors offer; the validator
     * treats a kind as a free-form key, exactly like a flag, so a new kind needs
     * no change here beyond making it suggestable.
     */
    var RELATIONSHIP_KINDS = ['friendship'];

    /* --------------------------------------------------------- como se diz */

    /**
     * Whether a line is spoken out loud or only thought.
     *
     * The empty value is the common case and writes nothing: a line is spoken
     * unless the file says otherwise, so a file that never heard of thoughts
     * exports exactly as it was written.
     */
    var DELIVERIES = [
        { value: '', label: 'Fala' },
        { value: 'thought', label: 'Pensamento' },
    ];

    /**
     * The kinds of input a "call to action" node asks the player for.
     *
     * A text input is free typing (the player's name, a nickname); a choice is a
     * pick from a short list (an element, a stance). Both write one entry under
     * `input.<nome>` — text as a string, choice as the chosen option's label.
     */
    var INPUT_TYPES = [
        { value: 'text', label: 'Texto livre' },
        { value: 'choice', label: 'Escolha de opções' },
    ];

    /* ------------------------------------------------------------ resultados */

    /** Outcome labels offered on an `end` node. Free text is still accepted. */
    var RESULTS = ['good', 'neutral', 'bad'];

    /* ------------------------------------------------------------ condições */

    /** Every comparison a condition leaf may use. */
    var CONDITION_OPERATORS = [
        { value: 'equals', label: '=' },
        { value: 'not_equals', label: '≠' },
        { value: 'greater_than', label: '>' },
        { value: 'greater_or_equal', label: '≥' },
        { value: 'less_than', label: '<' },
        { value: 'less_or_equal', label: '≤' },
    ];

    /** How a group of conditions reads. */
    var CONDITION_MODES = [
        { value: 'all', label: 'Todas verdadeiras (E)' },
        { value: 'any', label: 'Pelo menos 1 verdadeira (OU)' },
        { value: 'notAll', label: 'Pelo menos 1 falsa (NÃO E)' },
        { value: 'notAny', label: 'Todas falsas (NÃO OU)' },
    ];

    /** The state slices a condition may read. */
    var CONDITION_ROOTS = [
        { value: 'dialogue', label: 'Diálogo' },
        { value: 'relationship', label: 'Relação' },
        { value: 'input', label: 'Entrada do jogador' },
        { value: 'inventory', label: 'Inventário' },
        { value: 'flags', label: 'Flags' },
        { value: 'skill', label: 'Skill' },
        { value: 'element', label: 'Elemento' },
        { value: 'elements', label: 'Elementos do protagonista' },
        { value: 'name', label: 'Nome do protagonista' },
    ];

    /** The named entries a root has below it, where it does not take a free key. */
    var CONDITION_ROOT_KEYS = {
        dialogue: [
            { value: 'seen', label: 'Visto' },
        ],
    };

    var CONDITION_OPERATORS_DIALOGUE = [
        { value: 'equals', label: '= (foi visto)' },
        { value: 'not_equals', label: '≠ (não foi visto)' },
    ];

    var CONDITION_OPERATORS_INVENTORY_HAS = [
        { value: 'equals', label: 'tem (= true)' },
        { value: 'not_equals', label: 'não tem (= false)' },
    ];

    var CONDITION_OPERATORS_INVENTORY_COUNT = [
        { value: 'greater_than', label: '> (mais que)' },
        { value: 'greater_or_equal', label: '≥ (pelo menos)' },
        { value: 'less_than', label: '< (menos que)' },
        { value: 'less_or_equal', label: '≤ (no máximo)' },
    ];

    var CONDITION_OPERATORS_RELATIONSHIP = [
        { value: 'greater_than', label: '>' },
        { value: 'greater_or_equal', label: '≥' },
        { value: 'less_than', label: '<' },
        { value: 'less_or_equal', label: '≤' },
        { value: 'equals', label: '=' },
        { value: 'not_equals', label: '≠' },
    ];

    /* -------------------------------------------------------------- efeitos */

    /**
     * Every effect a node may carry, with the fields each one needs.
     *
     * A new effect is one entry here: the picker, the row and the export all
     * follow it. The `kind` of a field says which control draws it — a
     * character, an item, a flag, a literal — so the values stay in the
     * vocabularies above instead of being spelled out twice.
     */
    var EFFECTS = {
        set_flag: {
            label: 'Definir flag',
            fields: [
                { key: 'flag', label: 'Flag', kind: 'flag', placeholder: 'ex.: conheceu_pacci' },
                { key: 'value', label: 'Valor', kind: 'literal' },
            ],
        },
        add_relationship: {
            label: 'Relação',
            fields: [
                { key: 'character_id', label: 'Personagem', kind: 'character' },
                { key: 'relationship_kind', label: 'Tipo', kind: 'relationshipKind' },
                { key: 'direction', label: 'Direção', kind: 'direction' },
                { key: 'value', label: 'Quantidade', kind: 'positiveNumber' },
            ],
        },
        add_item: {
            label: 'Dar item',
            fields: [
                { key: 'item_id', label: 'Item', kind: 'item' },
                { key: 'quantity', label: 'Qtd', kind: 'number', optional: true },
            ],
        },
        remove_item: {
            label: 'Tirar item',
            fields: [
                { key: 'item_id', label: 'Item', kind: 'item' },
                { key: 'quantity', label: 'Qtd', kind: 'number', optional: true },
            ],
        },
        play_music: {
            label: 'Tocar música',
            fields: [
                { key: 'music_id', label: 'Faixa', kind: 'plain', placeholder: 'ex.: floresta_misterio' },
                { key: 'loop', label: 'Repetir', kind: 'boolean', optional: true },
            ],
        },
    };

    /* ------------------------------------------------------ estado inicial */

    /**
     * The roots a state entry may sit under, and how many segments name the
     * entry before its value.
     *
     * A flag, an item, a stat, an objective and a clock reading are all one
     * name deep. A relationship is two, because an affinity only means
     * something once its kind is named — which is why
     * `relationship.pacci.5` is refused and `relationship.pacci.friendship.5`
     * is not.
     */
    var STATE_ROOTS = {
        flags: 1,
        inventory: 1,
        stats: 1,
        objectives: 1,
        time: 1,
        relationship: 2,
        dialogues: 1,
        paths: 1,
        // A player input a "call to action" node collected. In the forger it only
        // lives in the preview; the goal is that the game keeps it, one name deep.
        input: 1,
        skill: 1,
        element: 1,
        elements: 1,
        name: 1,
    };

    /**
     * The roots whose entries are lists of names.
     *
     * `dialogues.seen` and `paths.unlocked` hold a set, so an entry under them
     * adds a member rather than setting a value: `dialogues.seen.teste_1` says
     * the player has already seen that dialogue.
     */
    var STATE_LIST_KEYS = {
        dialogues: ['seen', 'unlocked'],
        paths: ['unlocked'],
    };

    /** One entry per root, for the placeholder and for the error messages. */
    var STATE_EXAMPLES = [
        'input.name.Galatime',
        'relationship.pacci.friendship.5',
        'inventory.caixa.1',
        'flags.conheceu_pacci.true',
        'objectives.falar_pacci.active',
        'time.hour.9',
        'dialogues.seen.teste_1',
    ];

    /* ----------------------------------------------------------- sugestões */

    /**
     * Values offered for the free-text fields that have a natural vocabulary.
     *
     * These feed `datalist`s, so every one of them is a suggestion and never a
     * gate: the writer can always type something the list does not have.
     */
    var SUGGESTIONS = {
        emotions: EMOTIONS.slice(),
        positions: POSITIONS.slice(),
        poses: POSES.slice(),
        depths: DEPTHS.slice(),
        directions: ['left', 'right'],
        results: RESULTS.slice(),
        flags: ['flags.'],
        stats: ['stats.'],
        objectives: ['objectives.'],
        // The kinds of affinity a relationship path may name. `relationship.`
        // is deliberately absent: on its own it is not a path — the character
        // and the kind are both required — and a half-written path in the menu
        // is worse than none at all.
        relationshipKinds: RELATIONSHIP_KINDS.slice(),
        // The two words that answer "does the player have this?" — offered so a
        // boolean is a pick from a list rather than four remembered keystrokes.
        literals: ['true', 'false'],
        paths: [
            'flags.', 'inventory.', 'stats.', 'objectives.',
            'time.hour', 'time.day', 'dialogues.seen', 'dialogues.unlocked',
            'paths.unlocked', 'skill.', 'element.', 'elements.', 'name.',
        ],
    };

    Forger.lists = {
        CHARACTER_IDS: CHARACTER_IDS,
        ITEM_IDS: ITEM_IDS,
        DIALOGUE_IDS: DIALOGUE_IDS,
        EMOTIONS: EMOTIONS,
        POSITIONS: POSITIONS,
        POSES: POSES,
        DEPTHS: DEPTHS,
        VOCABULARY_LABELS: VOCABULARY_LABELS,
        ANIMATION_PHASES: ANIMATION_PHASES,
        ANIMATION_KINDS: ANIMATION_KINDS,
        ANIMATION_DIRECTIONS: ANIMATION_DIRECTIONS,
        ANIMATION_SPEEDS: ANIMATION_SPEEDS,
        ANIMATION_DEFAULTS: ANIMATION_DEFAULTS,
        POSE_ACTIONS: POSE_ACTIONS,
        RELATIONSHIP_KINDS: RELATIONSHIP_KINDS,
        DELIVERIES: DELIVERIES,
        INPUT_TYPES: INPUT_TYPES,
        RESULTS: RESULTS,
        CONDITION_OPERATORS: CONDITION_OPERATORS,
        CONDITION_MODES: CONDITION_MODES,
        CONDITION_ROOTS: CONDITION_ROOTS,
        CONDITION_ROOT_KEYS: CONDITION_ROOT_KEYS,
        CONDITION_OPERATORS_DIALOGUE: CONDITION_OPERATORS_DIALOGUE,
        CONDITION_OPERATORS_INVENTORY_HAS: CONDITION_OPERATORS_INVENTORY_HAS,
        CONDITION_OPERATORS_INVENTORY_COUNT: CONDITION_OPERATORS_INVENTORY_COUNT,
        CONDITION_OPERATORS_RELATIONSHIP: CONDITION_OPERATORS_RELATIONSHIP,
        EFFECTS: EFFECTS,
        STATE_ROOTS: STATE_ROOTS,
        STATE_LIST_KEYS: STATE_LIST_KEYS,
        STATE_EXAMPLES: STATE_EXAMPLES,
        SUGGESTIONS: SUGGESTIONS,
    };
})(window.DialogueForger);
