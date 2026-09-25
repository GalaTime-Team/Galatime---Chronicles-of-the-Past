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
        'line',
        'choice',
        'character_enter',
        'character_exit',
        'conditional',
        'end',
    ];

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
        line: 'Fala',
        choice: 'Escolha',
        character_enter: 'Entrada de personagem',
        character_exit: 'Saída de personagem',
        conditional: 'Condição',
        end: 'Fim',
    };

    /** How many undo steps are kept. */
    var HISTORY_LIMIT = 100;

    /**
     * The affinities a dialogue may read or change.
     *
     * A relationship path is three segments — `relationship.pacci.friendship` —
     * because affinity towards someone only means something once the *kind* of
     * affinity is named. This list is the menu the editors offer; the validator
     * treats a kind as a free-form key, exactly like a flag, so a new kind needs
     * no change here beyond making it suggestable. Mirrors
     * `DIALOGUE_RELATIONSHIP_KINDS` in the backend.
     */
    var RELATIONSHIP_KINDS = ['friendship'];

    /** Used when a caller has no kind to hand and needs a sensible one. */
    var DEFAULT_RELATIONSHIP_KIND = RELATIONSHIP_KINDS[0];

    /** An empty document. */
    function createEmpty() {
        return {
            dialogue_id: '',
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
     * assume the shape is present and the serializer never has to guess.
     */
    function normalize(raw) {
        var model = createEmpty();

        if (!raw || typeof raw !== 'object') {
            return model;
        }

        model.dialogue_id = typeof raw.dialogue_id === 'string' ? raw.dialogue_id : '';
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

        return model;
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
                result.choices = Array.isArray(node.choices) ? node.choices.map(normalizeChoice) : [];
                break;

            case 'character_enter':
                result.character_id = node.character_id || '';
                result.position = node.position || '';
                result.animation_id = node.animation_id || '';
                result.emotion = node.emotion || '';
                result.next = node.next || '';
                break;

            case 'character_exit':
                result.character_id = node.character_id || '';
                result.animation_id = node.animation_id || '';
                result.direction = node.direction || '';
                result.next = node.next || '';
                break;

            case 'conditional':
                result.branches = Array.isArray(node.branches)
                    ? node.branches.map(normalizeBranch)
                    : [];
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
            || type === 'character_exit';
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
            disabled_reason: choice.disabled_reason || '',
            visible_if: choice.visible_if || null,
            enabled_if: choice.enabled_if || null,
            effects_before: Array.isArray(choice.effects_before) ? choice.effects_before.slice() : [],
        };

        return result;
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
            case 'character_enter':
                return '+ ' + (node.character_id || '?');
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

            if (node.type === 'character_enter' || node.type === 'character_exit') {
                add(node.character_id);
            }
        });

        collectEffects(model).forEach(function (located) {
            if (located.effect.type === 'add_relationship') {
                add(located.effect.character_id);
            }
        });

        return ids;
    }

    /** Dialogue ids the document unlocks. */
    function collectUnlockedDialogueIds(model) {
        var ids = [];

        collectEffects(model).forEach(function (located) {
            var effect = located.effect;

            if (effect.type === 'unlock_dialogue' && effect.dialogue_id && ids.indexOf(effect.dialogue_id) === -1) {
                ids.push(effect.dialogue_id);
            }
        });

        return ids;
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
        RELATIONSHIP_KINDS: RELATIONSHIP_KINDS,
        DEFAULT_RELATIONSHIP_KIND: DEFAULT_RELATIONSHIP_KIND,
        createEmpty: createEmpty,
        clone: clone,
        normalize: normalize,
        normalizeNode: normalizeNode,
        createNode: createNode,
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
        outgoingNodeIds: outgoingNodeIds,
        collectEffects: collectEffects,
        collectCharacterIds: collectCharacterIds,
        collectUnlockedDialogueIds: collectUnlockedDialogueIds,
        createHistory: createHistory,
    };
})(window.DialogueForger);
