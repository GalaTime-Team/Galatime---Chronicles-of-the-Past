/**
 * The dialogue model.
 *
 * The model is deliberately the same shape as the YAML: a parsed file becomes
 * the model with defaults filled in, and export is a direct mapping back. No
 * intermediate representation means nothing can be silently dropped on the way
 * through, and the plan's rule — the model is the source of truth, YAML is only
 * produced on export — is easy to honour.
 */
(function (Forger) {
    'use strict';

    /** Node kinds the engine can resolve. Mirrors the backend validator. */
    var NODE_TYPES = [
        'character_enter',
        'character_action',
        'line',
        'choice',
        'player_input',
        'conditional',
        'character_exit',
        'end',
    ];

    /**
     * Node kinds an earlier version of this tool wrote.
     *
     * The staging change node was called `character_change` before it became an
     * action; a draft or file written by that version opens as the kind it is
     * now, so nothing a writer already saved is lost to a rename.
     */
    var TYPE_ALIASES = { character_change: 'character_action' };

    /**
     * Node kinds an earlier version of the format had.
     *
     * Only the scene node: the dialogue keeps its own cast, but it no longer owns
     * a scene. Still recognised on import, so an old file gets an explanation
     * instead of being quietly reshaped into something it never was.
     */
    var REMOVED_NODE_TYPES = ['scene'];

    /** Portuguese labels for the node type picker. */
    var NODE_TYPE_LABELS = {
        character_enter: 'Entrada de personagem',
        character_action: 'Ação do personagem',
        line: 'Fala',
        choice: 'Escolha',
        player_input: 'Pergunta ao jogador',
        conditional: 'Ramificação',
        character_exit: 'Saída de personagem',
        end: 'Fim',
    };

    /** How many undo steps are kept. */
    var HISTORY_LIMIT = 100;

    /**
     * The stage, movement and relationship vocabularies live in `lists.js`.
     *
     * They are referenced rather than copied so there is exactly one place to
     * add a position, a pose or a kind of movement; the model keeps only what
     * it does with them.
     */
    var POSITIONS = Forger.lists.POSITIONS;
    var POSES = Forger.lists.POSES;
    var DEPTHS = Forger.lists.DEPTHS;
    var VOCABULARY_LABELS = Forger.lists.VOCABULARY_LABELS;
    var ANIMATION_PHASES = Forger.lists.ANIMATION_PHASES;
    var ANIMATION_KINDS = Forger.lists.ANIMATION_KINDS;
    var ANIMATION_DIRECTIONS = Forger.lists.ANIMATION_DIRECTIONS;
    var ANIMATION_SPEEDS = Forger.lists.ANIMATION_SPEEDS;
    var ANIMATION_DEFAULTS = Forger.lists.ANIMATION_DEFAULTS;
    var POSE_ACTIONS = Forger.lists.POSE_ACTIONS;
    var RELATIONSHIP_KINDS = Forger.lists.RELATIONSHIP_KINDS;

    /** Used when a caller has no kind to hand and needs a sensible one. */
    var DEFAULT_RELATIONSHIP_KIND = RELATIONSHIP_KINDS[0];

    /** An empty document. */
    function createEmpty() {
        return {
            // The file name is the dialogue's identity: the engine reads it from
            // the YAML's file name, so the document itself no longer carries an id.
            start_node: '',
            entry_conditions: null,
            // Not authored any more — staging belongs to the scene system — but an
            // old file's block is carried verbatim so saving cannot trim it away.
            scenes: {},
            nodes: {},
        };
    }

    /** Deep copy, used for history snapshots. */
    function clone(model) {
        return JSON.parse(JSON.stringify(model));
    }

    /**
     * Builds a complete model from parsed YAML.
     *
     * Every node is reshaped to the fields its type supports, so the editors can
     * assume the shape is present and the serializer never has to guess. The
     * document's order is the file's own: a parsed file opens with the nodes in
     * the order they were written, which is what makes the first of them the
     * start node.
     */
    function normalize(raw) {
        var model = createEmpty();

        if (!raw || typeof raw !== 'object') {
            return model;
        }

        // Read, then dropped: the start node is the first step of the list, so
        // whatever the file declared is not what the editor keeps. `app.js`
        // compares the two and tells the writer when they disagree, which is the
        // one place the file's own choice can still be seen.
        model.start_node = typeof raw.start_node === 'string' ? raw.start_node : '';
        model.entry_conditions = raw.entry_conditions || null;

        // Kept exactly as found, and never edited here: the forger no longer
        // authors scenes, so all it may do with one is hand it back unchanged.
        if (raw.scenes && typeof raw.scenes === 'object') {
            model.scenes = JSON.parse(JSON.stringify(raw.scenes));
        }

        if (raw.nodes && typeof raw.nodes === 'object') {
            Object.keys(raw.nodes).forEach(function (nodeId) {
                model.nodes[nodeId] = normalizeNode(raw.nodes[nodeId]);
            });
        }

        model.start_node = startNodeId(model);

        return model;
    }

    /**
     * The node the conversation starts at: the first one in the list.
     *
     * The order of `nodes` is the author's — it is the order the file was
     * written in and the order the list shows — so the first entry is where the
     * player is dropped. Reordering the list is therefore how the start node
     * changes, which is why nothing else in the tool writes this field: `app.js`
     * keeps it in step after every structural change.
     */
    function startNodeId(model) {
        return Object.keys((model || {}).nodes || {})[0] || '';
    }

    /** Whether a node type is one the format still has. */
    function isSupportedNodeType(type) {
        return NODE_TYPES.indexOf(type) !== -1;
    }

    /**
     * Reshapes one node to the fields its type supports.
     *
     * A node of a kind the format dropped is passed through **untouched**. The
     * editor cannot show its fields and the game will not play it, but a writer
     * who opens an old file and saves it must not lose what is in it: the node is
     * reported as a problem and written back exactly as it was found.
     */
    function normalizeNode(raw) {
        var node = (raw && typeof raw === 'object') ? raw : {};

        // A kind this tool renamed: the file means what the new kind means.
        if (TYPE_ALIASES[node.type]) {
            node = Object.assign({}, node, { type: TYPE_ALIASES[node.type] });
        }

        if (REMOVED_NODE_TYPES.indexOf(node.type) !== -1) {
            return JSON.parse(JSON.stringify(node));
        }

        var type = NODE_TYPES.indexOf(node.type) === -1 ? 'line' : node.type;
        var result = { type: type };

        switch (type) {
            case 'line':
                result.speaker_id = node.speaker_id || '';
                result.emotion = node.emotion || '';
                result.animation_id = node.animation_id || '';
                // How the line is delivered: an empty value is spoken, which is
                // what a file that never heard of thoughts already says. Only a
                // thought writes itself down, so exporting a plain line adds
                // nothing it did not have.
                result.delivery = node.delivery || '';
                // A real boolean passes through and absence means "wait for the
                // player". Anything else is kept **verbatim** rather than coerced,
                // so the validator can report the typo: collapsing `auto_advance:
                // sim` to `false` would turn a mistake into a silent "no".
                result.auto_advance = node.auto_advance === undefined || node.auto_advance === null
                    ? false
                    : node.auto_advance;
                result.text = normalizeText(node.text);
                result.next = node.next || '';
                break;

            case 'choice':
                result.prompt = normalizePrompt(node.prompt);
                result.choices = normalizeChoices(node.choices);
                break;

            case 'player_input':
                // A "call to action": the dialogue stops and asks the player for
                // a value — free text or a pick from a list. Either way it stores
                // one entry under `input.<variable>`, spoken back with
                // `{input.<variable>}`. The value lives in the preview only; the
                // engine keeps it in the real save.
                result.question = typeof node.question === 'string' ? node.question : '';
                result.variable = node.variable || '';
                result.input_type = node.input_type === 'choice' ? 'choice' : 'text';
                result.placeholder = node.placeholder || '';
                result.options = Array.isArray(node.options)
                    ? node.options.filter(function (option) { return typeof option === 'string'; }).slice()
                    : [];
                result.next = node.next || '';
                break;

            case 'character_enter':
                result.character_id = node.character_id || '';
                result.position = node.position || 'center';
                result.pose = node.pose || '';
                result.depth = node.depth || '';
                result.depth_of = node.depth_of || '';
                result.animation_id = node.animation_id || '';
                result.emotion = node.emotion || '';
                result.next = node.next || '';
                break;

            case 'character_action':
                // Someone already on stage doing something: standing up,
                // sitting down, stepping across or moving behind someone. No
                // entrance animation belongs to it — they never left.
                result.character_id = node.character_id || '';
                result.position = node.position || '';
                result.pose = node.pose || '';
                result.depth = node.depth || '';
                result.depth_of = node.depth_of || '';
                result.emotion = node.emotion || '';
                result.animation_id = node.animation_id || '';
                result.next = node.next || '';
                break;

            case 'character_exit':
                result.character_id = node.character_id || '';
                result.animation_id = node.animation_id || '';
                result.direction = node.direction || '';
                result.next = node.next || '';
                break;

            case 'conditional':
                result.branches = normalizeBranches(node.branches);
                break;

            case 'end':
                result.result = node.result || '';
                result.effects = Array.isArray(node.effects) ? node.effects.slice() : [];
                break;
        }

        if (supportsEffectsAfter(type)) {
            result.effects_after = Array.isArray(node.effects_after) ? node.effects_after.slice() : [];
        }

        return result;
    }

    /**
     * Reshapes a choice node's question.
     *
     * A question is a line that happens to be answered by a list, so it carries
     * the same fields a line does — including the emotion that drives the sprite.
     */
    function normalizePrompt(raw) {
        var prompt = (raw && typeof raw === 'object') ? raw : {};

        return {
            speaker_id: prompt.speaker_id || '',
            emotion: prompt.emotion || '',
            text: normalizeText(prompt.text),
        };
    }

    /**
     * Text, always as segments.
     *
     * The format allows a bare string as shorthand for a single plain segment.
     * Normalising once here means every editor and the serializer see one shape.
     */
    function normalizeText(raw) {
        if (Array.isArray(raw)) {
            return raw.slice();
        }

        if (typeof raw === 'string' && raw !== '') {
            return [{ type: 'text', value: raw }];
        }

        return [];
    }

    /** Node kinds that can carry `effects_after`. */
    function supportsEffectsAfter(type) {
        return type === 'line'
            || type === 'character_enter'
            || type === 'character_action'
            || type === 'character_exit'
            || type === 'player_input';
    }

    /**
     * The three parts of an animation, composed into the id the file carries.
     *
     * Only what differs from the phase's default writes itself down, so the
     * common case stays the short id an author would have typed: `step_in`. An
     * exit leaves its side out of the id — the side of an exit is the node's own
     * `direction` field, and writing it twice says the same thing twice.
     */
    function composeAnimation(phase, parts) {
        var source = parts || {};

        // "Nenhum" is the one kind that writes nothing: a node that says the
        // character does not move carries no animation_id at all, which is
        // exactly what the engine does when nothing names a motion.
        if (source.kind === 'none') {
            return '';
        }

        var defaults = ANIMATION_DEFAULTS[phase] || ANIMATION_DEFAULTS.enter;
        var kind = source.kind || defaults.kind;
        var direction = source.direction || defaults.direction;
        var speed = source.speed || defaults.speed;
        var id = kind;

        if (direction && direction !== 'center' && phase !== 'exit') {
            id += '_from_' + direction;
        }

        if (speed && speed !== 'normal') {
            id += '_' + speed;
        }

        return id;
    }

    /**
     * Reads an animation id back into the three parts.
     *
     * The words are read in the order the engine reads them — the most specific
     * first — so an id written by hand (`enter_surprised`) still lands on a
     * sensible set of controls. An id the words say nothing about keeps an
     * empty kind, and the control falls back to the phase's default rather
     * than inventing what the author meant.
     */
    function parseAnimation(id) {
        var value = String(id || '').toLowerCase();
        var parts = { kind: '', direction: 'center', speed: 'normal' };

        if (!value) {
            return parts;
        }

        if (/left/.test(value)) {
            parts.direction = 'left';
        } else if (/right/.test(value)) {
            parts.direction = 'right';
        }

        if (/slow/.test(value)) {
            parts.speed = 'slow';
        } else if (/fast/.test(value)) {
            parts.speed = 'fast';
        }

        // The words are read in the order the engine reads them, most specific
        // first: `leave` is an exit, `run` follows the direction it names, and a
        // word that says nothing leaves the kind empty for the default to fill.
        if (/fade/.test(value)) {
            parts.kind = /out/.test(value) ? 'fade_out' : 'fade_in';
        } else if (/run|leave/.test(value)) {
            parts.kind = /out|leave/.test(value) ? 'run_out' : 'run_in';
        } else if (/shake/.test(value)) {
            parts.kind = 'idle_shake';
        } else if (/wave/.test(value)) {
            parts.kind = 'idle_wave';
        } else if (/stand/.test(value)) {
            parts.kind = 'stand_up';
        } else if (/sit/.test(value)) {
            parts.kind = 'sit_down';
        } else if (/across|step_across|move/.test(value)) {
            parts.kind = 'step_across';
        } else if (/step_out|leave/.test(value)) {
            parts.kind = 'step_out';
        } else if (/step|walk|enter/.test(value)) {
            parts.kind = 'step_in';
        } else if (/idle/.test(value)) {
            parts.kind = 'idle';
        }

        return parts;
    }

    /** The movement an action's own pose implies, if the pose implies one. */
    function actionForPose(pose) {
        return (pose && POSE_ACTIONS[pose]) || '';
    }

    /** Node kinds that can carry `next`. */
    function supportsNext(type) {
        return supportsEffectsAfter(type);
    }

    /** Reshapes one choice. */
    function normalizeChoice(raw) {
        var choice = (raw && typeof raw === 'object') ? raw : {};
        var result = {
            choice_id: choice.choice_id || '',
            text: choice.text || '',
            next: choice.next || '',
            // Kept from a file that had one, because an export must not delete
            // what a writer wrote; the editor no longer offers the field.
            disabled_reason: choice.disabled_reason || '',
            visible_if: choice.visible_if || null,
            enabled_if: choice.enabled_if || null,
            effects_before: Array.isArray(choice.effects_before) ? choice.effects_before.slice() : [],
        };

        return result;
    }

    /**
     * The options of a choice node, each with an id it can be referred to by.
     *
     * The id is bookkeeping, so it is derived from the option's own text when
     * the file does not carry one — an option nobody would type by hand gets a
     * stable name instead of an empty field the engine would refuse.
     */
    function normalizeChoices(raw) {
        if (!Array.isArray(raw)) {
            return [];
        }

        var used = [];

        return raw.map(function (choice, index) {
            var normalized = normalizeChoice(choice);

            if (!normalized.choice_id) {
                normalized.choice_id = uniqueId(used, normalized.text || 'opcao_' + (index + 1));
            }

            used.push(normalized.choice_id);

            return normalized;
        });
    }

    /** Reshapes one conditional branch. */
    function normalizeBranch(raw) {
        var branch = (raw && typeof raw === 'object') ? raw : {};

        return {
            branch_id: branch.branch_id || '',
            if: branch.if || null,
            next: branch.next || '',
        };
    }

    /**
     * The branches of a conditional node, each with an id of its own.
     *
     * Same rule as the options: an id is derived when the file has none, so the
     * branch is addressable in the export without the writer ever naming it.
     */
    function normalizeBranches(raw) {
        if (!Array.isArray(raw)) {
            return [];
        }

        var used = [];

        return raw.map(function (branch, index) {
            var normalized = normalizeBranch(branch);

            if (!normalized.branch_id) {
                normalized.branch_id = uniqueId(used, 'ramo_' + (index + 1));
            }

            used.push(normalized.branch_id);

            return normalized;
        });
    }


    /** A fresh node of the requested kind, with sane defaults. */
    function createNode(type, id) {
        var node = normalizeNode({ type: type });
        node.__id = id;
        return node;
    }

    /**
     * Reads a value the user typed in a single-line field.
     *
     * `true`, `false`, `null` and plain numbers become their real types, because
     * conditions and effects are compared strictly — `'2'` would never equal
     * `2`. Anything else stays a string. An empty field means "absent" (`null`),
     * which is how a condition asks "this state entry does not exist".
     */
    function parseLiteral(raw) {
        var trimmed = String(raw == null ? '' : raw).trim();

        if (trimmed === '') return null;
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
        if (trimmed === 'null') return null;
        if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);

        return raw;
    }

    /** Renders a literal for editing, keeping `null` visually empty. */
    function formatLiteral(value) {
        return value === null || value === undefined ? '' : String(value);
    }

    /** Slugifies a label into a usable id. */
    function slug(value) {
        var slugged = String(value || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '');

        return slugged || 'no';
    }

    /** A node id that is not taken yet, derived from a label. */
    function uniqueId(existing, base) {
        var stem = slug(base);
        var candidate = stem;
        var index = 2;

        while (existing.indexOf(candidate) !== -1) {
            candidate = stem + '_' + index;
            index += 1;
        }

        return candidate;
    }

    /** A node id that is not taken yet within the model. */
    function newNodeId(model, base) {
        return uniqueId(Object.keys(model.nodes), base);
    }

    /** A choice id that is not taken yet within a node. */
    function newChoiceId(node, base) {
        var taken = (node.choices || []).map(function (choice) {
            return choice.choice_id;
        });

        return uniqueId(taken, base);
    }

    /** A branch id that is not taken yet within a node. */
    function newBranchId(node, base) {
        var taken = (node.branches || []).map(function (branch) {
            return branch.branch_id;
        });

        return uniqueId(taken, base);
    }

    /** Short label for the node list. */
    function nodeSummary(node) {
        switch (node.type) {
            case 'line':
                return node.speaker_id || '(sem falante)';
            case 'choice':
                return (node.choices || []).length + ' opção(ões)';
            case 'player_input':
                return '? ' + (node.variable || '(sem variável)')
                    + (node.input_type === 'choice'
                        ? ' (' + (node.options || []).length + ' opções)'
                        : ' · texto');
            case 'character_enter':
                return '+ ' + (node.character_id || '?') + stagingSuffix(node);
            case 'character_action':
                return '~ ' + (node.character_id || '?') + stagingSuffix(node);
            case 'character_exit':
                return '− ' + (node.character_id || '?');
            case 'conditional':
                return (node.branches || []).length + ' ramo(s)';
            case 'end':
                return node.result || '(fim)';
            default:
                // A node kept from an older file: say so rather than showing nothing.
                return String(node.type || '?') + ' (não suportado)';
        }
    }

    /**
     * What a staging node says about the character, in reading order.
     *
     * The same sentence serves the node list, the map card and the preview's
     * cast, so the three never disagree about where someone is standing.
     */
    function describeStaging(node) {
        var parts = [];
        var source = node || {};

        if (source.position) {
            parts.push(vocabularyLabel('position', source.position));
        }

        if (source.pose) {
            parts.push(vocabularyLabel('pose', source.pose));
        }

        if (source.depth) {
            parts.push(vocabularyLabel('depth', source.depth)
                + (source.depth_of ? ' de ' + source.depth_of : ''));
        }

        return parts.join(' · ');
    }

    /** The node list's suffix, only when there is staging to describe. */
    function stagingSuffix(node) {
        var staging = describeStaging(node);

        return staging ? ' · ' + staging : '';
    }

    /** A Portuguese label for a free-form value, falling back to the value. */
    function vocabularyLabel(kind, value) {
        var labels = VOCABULARY_LABELS[kind] || {};

        return labels[value] || String(value || '');
    }

    /** Node ids a node can move to, including interactive text destinations. */
    function outgoingNodeIds(node) {
        var ids = [];

        if (node.next) {
            ids.push(node.next);
        }

        if (node.type === 'line' && Array.isArray(node.text)) {
            node.text.forEach(function (segment) {
                if (segment.type === 'interactive_text' && segment.on_click && segment.on_click.next) {
                    ids.push(segment.on_click.next);
                }
            });
        }

        if (node.type === 'choice') {
            (node.choices || []).forEach(function (choice) {
                if (choice.next) {
                    ids.push(choice.next);
                }
            });
        }

        if (node.type === 'conditional') {
            (node.branches || []).forEach(function (branch) {
                if (branch.next) {
                    ids.push(branch.next);
                }
            });
        }

        return ids;
    }

    /** Every effect in the document, with the path it lives at. */
    function collectEffects(model) {
        var located = [];

        Object.keys(model.nodes || {}).forEach(function (nodeId) {
            var node = model.nodes[nodeId];

            (node.effects_after || []).forEach(function (effect, index) {
                located.push({ effect: effect, path: 'nodes.' + nodeId + '.effects_after[' + index + ']' });
            });

            if (node.type === 'end') {
                (node.effects || []).forEach(function (effect, index) {
                    located.push({ effect: effect, path: 'nodes.' + nodeId + '.effects[' + index + ']' });
                });
            }

            if (node.type === 'choice') {
                (node.choices || []).forEach(function (choice) {
                    (choice.effects_before || []).forEach(function (effect, index) {
                        located.push({
                            effect: effect,
                            path: 'nodes.' + nodeId + '.choices.' + choice.choice_id + '.effects_before[' + index + ']',
                        });
                    });
                });
            }
        });

        return located;
    }

    /** Character ids the document mentions. */
    function collectCharacterIds(model) {
        var ids = [];

        function add(id) {
            if (id && ids.indexOf(id) === -1) {
                ids.push(id);
            }
        }

        Object.keys(model.nodes || {}).forEach(function (nodeId) {
            var node = model.nodes[nodeId];

            if (node.type === 'line') {
                add(node.speaker_id);
            }

            if (node.type === 'choice' && node.prompt) {
                add(node.prompt.speaker_id);
            }

            if (node.type === 'character_enter'
                || node.type === 'character_action'
                || node.type === 'character_exit') {
                add(node.character_id);
                // A depth is relative to whoever is already on stage, so the
                // reference is a character the document mentions too.
                add(node.depth_of);
            }
        });

        collectEffects(model).forEach(function (located) {
            if (located.effect.type === 'add_relationship') {
                add(located.effect.character_id);
            }
        });

        return ids;
    }

    /** The `input.<name>` variables every call-to-action node collects. */
    function collectInputVariables(model) {
        var names = [];

        Object.keys(model.nodes || {}).forEach(function (nodeId) {
            var node = model.nodes[nodeId];

            if (node.type === 'player_input' && node.variable && names.indexOf(node.variable) === -1) {
                names.push(node.variable);
            }
        });

        return names;
    }

    /**
     * Undo/redo stack.
     *
     * Holds snapshots of the state *before* each change, so `undo` restores the
     * previous state and hands the current one to the redo stack.
     */
    function createHistory() {
        var past = [];
        var future = [];

        return {
            /** Records the state a change is about to replace. */
            record: function (snapshot) {
                past.push(snapshot);

                if (past.length > HISTORY_LIMIT) {
                    past.shift();
                }

                future.length = 0;
            },
            undo: function (current) {
                if (past.length === 0) {
                    return null;
                }

                future.push(current);
                return past.pop();
            },
            redo: function (current) {
                if (future.length === 0) {
                    return null;
                }

                past.push(current);
                return future.pop();
            },
            canUndo: function () {
                return past.length > 0;
            },
            canRedo: function () {
                return future.length > 0;
            },
            clear: function () {
                past.length = 0;
                future.length = 0;
            },
        };
    }

    Forger.model = {
        NODE_TYPES: NODE_TYPES,
        REMOVED_NODE_TYPES: REMOVED_NODE_TYPES,
        NODE_TYPE_LABELS: NODE_TYPE_LABELS,
        POSITIONS: POSITIONS,
        POSES: POSES,
        DEPTHS: DEPTHS,
        ANIMATION_PHASES: ANIMATION_PHASES,
        ANIMATION_KINDS: ANIMATION_KINDS,
        ANIMATION_DIRECTIONS: ANIMATION_DIRECTIONS,
        ANIMATION_SPEEDS: ANIMATION_SPEEDS,
        ANIMATION_DEFAULTS: ANIMATION_DEFAULTS,
        VOCABULARY_LABELS: VOCABULARY_LABELS,
        RELATIONSHIP_KINDS: RELATIONSHIP_KINDS,
        DEFAULT_RELATIONSHIP_KIND: DEFAULT_RELATIONSHIP_KIND,
        createEmpty: createEmpty,
        clone: clone,
        normalize: normalize,
        normalizeNode: normalizeNode,
        createNode: createNode,
        startNodeId: startNodeId,
        isSupportedNodeType: isSupportedNodeType,
        supportsEffectsAfter: supportsEffectsAfter,
        supportsNext: supportsNext,
        newNodeId: newNodeId,
        newChoiceId: newChoiceId,
        newBranchId: newBranchId,
        uniqueId: uniqueId,
        slug: slug,
        parseLiteral: parseLiteral,
        formatLiteral: formatLiteral,
        nodeSummary: nodeSummary,
        describeStaging: describeStaging,
        vocabularyLabel: vocabularyLabel,
        composeAnimation: composeAnimation,
        parseAnimation: parseAnimation,
        actionForPose: actionForPose,
        outgoingNodeIds: outgoingNodeIds,
        collectEffects: collectEffects,
        collectCharacterIds: collectCharacterIds,
        collectInputVariables: collectInputVariables,
        createHistory: createHistory,
    };
})(window.DialogueForger);
