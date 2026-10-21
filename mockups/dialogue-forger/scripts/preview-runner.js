/**
 * Preview runner.
 *
 * Walks the dialogue the way the engine does — crossing automatic nodes, applying
 * effects to a throwaway state, and stopping at lines, choices and endings — so
 * a writer can play a conversation before it exists as a file.
 *
 * This is a re-implementation, not a call into the game: a page opened from disk
 * cannot import the TypeScript services. It follows the same rules deliberately
 * (auto nodes, `effects_after` on `continue` only, list membership comparisons,
 * scene diffing), so a divergence is a bug in one of the two.
 *
 * Nothing here touches real game data — the state is built from whatever the
 * writer puts in the preview panel.
 */
(function (Forger) {
    'use strict';

    /** How many automatic nodes may be crossed before the walk is considered stuck. */
    var MAX_STEPS = 256;

    var COMPARISONS = {
        equals: function (left, right) { return left === right; },
        not_equals: function (left, right) { return left !== right; },
        greater_than: function (left, right) { return left > right; },
        greater_or_equal: function (left, right) { return left >= right; },
        less_than: function (left, right) { return left < right; },
        less_or_equal: function (left, right) { return left <= right; },
    };

    /** Builds a world state from a plain object, filling in what is missing. */
    function createState(input) {
        var source = input || {};

        return {
            flags: Object.assign({}, source.flags),
            inventory: normalizeInventory(source.inventory),
            relationship: copyRelationships(source.relationship),
            objectives: normalizeObjectives(source.objectives),
            stats: Object.assign({}, source.stats),
            time: Object.assign({ hour: 0 }, source.time),
            dialogues: {
                seen: ((source.dialogues || {}).seen || []).slice(),
                unlocked: ((source.dialogues || {}).unlocked || []).slice(),
            },
            paths: { unlocked: ((source.paths || {}).unlocked || []).slice() },
            // What the player typed or picked at a call-to-action node. Local to
            // the run: the game would carry it in its save, the forger only holds
            // it long enough to play the conversation back.
            input: Object.assign({}, source.input),
        };
    }

    /**
     * O inventário é sempre uma contagem.
     *
     * O YAML do painel de pré-visualização não é verificado, por isso um `true`
     * escrito à mão chega aqui como valor. O motor converte-o para `1` ou `0` e
     * este caminho faz o mesmo, para a pré-visualização não aceitar um estado
     * que o jogo jamais produziria.
     */
    function normalizeInventory(input) {
        var output = {};

        Object.keys(input || {}).forEach(function (itemId) {
            var value = input[itemId];

            output[itemId] = typeof value === 'boolean'
                ? (value ? 1 : 0)
                : (typeof value === 'number' && isFinite(value) ? value : 0);
        });

        return output;
    }

    /**
     * Copies the relationship slice, which is two levels deep.
     *
     * The inner level is copied too, so the preview cannot write back into the
     * caller's object. A flat number is copied as an empty object on purpose: the
     * engine reads the nested shape only, so a legacy value must read as absent
     * rather than be quietly promoted into a kind the writer never named.
     */
    function copyRelationships(input) {
        var output = {};

        Object.keys(input || {}).forEach(function (characterId) {
            output[characterId] = Object.assign({}, input[characterId]);
        });

        return output;
    }

    /** Accepts the `status` shorthand the engine also accepts. */
    function normalizeObjectives(input) {
        var output = {};

        Object.keys(input || {}).forEach(function (id) {
            var value = input[id];
            output[id] = typeof value === 'string' ? { status: value } : Object.assign({}, value);
        });

        return output;
    }

    /** Starts a session and resolves the first player-facing node. */
    function start(model, state) {
        var session = {
            model: model,
            state: state,
            /** Who is in the conversation. The enter/exit nodes maintain it. */
            cast: [],
            nodeId: null,
            node: null,
            choices: [],
            interactions: [],
            completed: false,
            result: null,
            log: [],
        };

        if (!model.start_node) {
            session.log.push('Sem nó inicial.');
            return session;
        }

        // The engine refuses to start a dialogue whose entry conditions do not
        // hold, so the preview must too — otherwise it would happily play a
        // conversation the game would never open.
        if (!evaluateCondition(model.entry_conditions, state)) {
            session.log.push('As condições de entrada não passam com este estado inicial.');
            return session;
        }

        walk(session, model.start_node);

        return session;
    }

    /** Advances past the current line. */
    function advance(session) {
        if (session.completed || !session.nodeId) {
            return session;
        }

        var node = session.model.nodes[session.nodeId];

        if (!node || !Forger.model.supportsNext(node.type)) {
            return session;
        }

        // `effects_after` belongs to the moment the player leaves the line, which
        // is exactly here — and only here.
        applyEffects(session, node.effects_after, 'nodes.' + session.nodeId + '.effects_after');

        if (!node.next) {
            session.log.push('O nó "' + session.nodeId + '" não tem destino.');
            return session;
        }

        walk(session, node.next);

        return session;
    }

    /** Applies the selected option. */
    function choose(session, choiceId) {
        if (session.completed || !session.nodeId) {
            return session;
        }

        var node = session.model.nodes[session.nodeId];
        var choice = null;

        (node.choices || []).forEach(function (candidate) {
            if (candidate.choice_id === choiceId) {
                choice = candidate;
            }
        });

        if (!choice) {
            session.log.push('Opção "' + choiceId + '" não existe neste nó.');
            return session;
        }

        applyEffects(session, choice.effects_before, 'nodes.' + session.nodeId + '.choices.' + choiceId);

        if (!choice.next) {
            session.log.push('A opção "' + choiceId + '" não tem destino.');
            return session;
        }

        walk(session, choice.next);

        return session;
    }

    /**
     * Stores the player's answer at a call-to-action node and moves on.
     *
     * Text is stored exactly as typed; a choice stores the option's own label.
     * Either way it lands at `input.<variable>`, which is what a later
     * `{input.<variable>}` speaks back and what a condition compares against.
     */
    function submitInput(session, value) {
        if (session.completed || !session.nodeId) {
            return session;
        }

        var node = session.model.nodes[session.nodeId];

        if (!node || node.type !== 'player_input') {
            return session;
        }

        if (!node.variable) {
            session.log.push('A pergunta "' + session.nodeId + '" não diz em que variável guardar.');
            return session;
        }

        session.state.input[node.variable] = value;
        session.log.push(node.variable + ' = ' + JSON.stringify(value));

        applyEffects(session, node.effects_after, 'nodes.' + session.nodeId + '.effects_after');

        if (!node.next) {
            session.log.push('O nó "' + session.nodeId + '" não tem destino.');
            return session;
        }

        walk(session, node.next);

        return session;
    }

    /** Follows a clickable segment. */
    function click(session, interactionId) {
        if (session.completed || !session.nodeId) {
            return session;
        }

        var node = session.model.nodes[session.nodeId];
        var destination = null;

        (node.text || []).forEach(function (segment) {
            if (segment.type === 'interactive_text' && segment.interaction_id === interactionId) {
                destination = segment.on_click && segment.on_click.next;
            }
        });

        if (!destination) {
            session.log.push('Segmento clicável "' + interactionId + '" não existe nesta fala.');
            return session;
        }

        walk(session, destination);

        return session;
    }

    /**
     * Walks from a node until something the player can see is reached.
     *
     * Automatic nodes have no visual of their own, so they apply their side
     * effects and hand over immediately.
     */
    function walk(session, startNodeId) {
        var currentId = startNodeId;
        var steps = 0;

        session.choices = [];
        session.interactions = [];
        session.prompt = null;

        while (currentId) {
            if (steps >= MAX_STEPS) {
                session.log.push('Demasiados nós automáticos seguidos: verifica se há um ciclo sem saída.');
                session.nodeId = null;
                session.node = null;
                return;
            }

            steps += 1;

            var node = session.model.nodes[currentId];

            if (!node) {
                session.log.push('O nó "' + currentId + '" não existe.');
                session.nodeId = null;
                session.node = null;
                return;
            }

            markNodeSeen(session, currentId);

            switch (node.type) {
                case 'line':
                    session.nodeId = currentId;
                    session.node = node;
                    session.interactions = collectInteractions(node);
                    return;

                case 'choice':
                    session.nodeId = currentId;
                    session.node = node;
                    session.choices = buildChoices(session, node);
                    return;

                case 'player_input':
                    session.nodeId = currentId;
                    session.node = node;
                    session.prompt = {
                        variable: node.variable,
                        input_type: node.input_type,
                        question: node.question,
                        placeholder: node.placeholder,
                        options: (node.options || []).slice(),
                    };
                    return;

                case 'end':
                    applyEffects(session, node.effects, 'nodes.' + currentId + '.effects');
                    session.completed = true;
                    session.result = node.result || null;
                    session.nodeId = null;
                    session.node = null;
                    return;

                case 'character_enter':
                    enterCast(session, node);
                    applyEffects(session, node.effects_after, 'nodes.' + currentId + '.effects_after');
                    currentId = node.next;
                    break;

                case 'character_action':
                    changeCast(session, node);
                    applyEffects(session, node.effects_after, 'nodes.' + currentId + '.effects_after');
                    currentId = node.next;
                    break;

                case 'character_exit':
                    exitCast(session, node);
                    applyEffects(session, node.effects_after, 'nodes.' + currentId + '.effects_after');
                    currentId = node.next;
                    break;

                case 'conditional': {
                    var branch = pickBranch(node, session.state);

                    if (!branch) {
                        session.log.push('O nó condicional "' + currentId + '" não encontrou nenhum ramo.');
                        session.nodeId = null;
                        session.node = null;
                        return;
                    }

                    currentId = branch.next;
                    break;
                }

                default:
                    // The `scene` node: a kind the format no longer has. It is skipped
                    // rather than rejected so an old file still previews; the validator
                    // has already warned about it.
                    if (node.next) {
                        session.log.push('Nó "' + currentId + '" (' + node.type + ') ignorado.');
                        currentId = node.next;
                        break;
                    }

                    session.log.push('Tipo de nó desconhecido em "' + currentId + '".');
                    session.nodeId = null;
                    session.node = null;
                    return;
            }
        }

        session.log.push('O diálogo acabou sem chegar a um nó de fim.');
        session.nodeId = null;
        session.node = null;
    }

    /**
     * Brings a character into the preview's cast, or refreshes one already there.
     *
     * A field the node omits keeps its current value, so an enter node only has
     * to state what changed — the same rule the backend's cast service follows.
     */
    function enterCast(session, node) {
        var existing = castMember(session, node.character_id);

        var next = {
            character_id: node.character_id,
            position: node.position || (existing && existing.position) || 'center',
            pose: node.pose || (existing && existing.pose) || '',
            depth: node.depth || (existing && existing.depth) || '',
            depth_of: node.depth_of || (existing && existing.depth_of) || '',
            emotion: node.emotion || (existing && existing.emotion) || '',
        };

        if (existing) {
            session.cast = session.cast.map(function (member) {
                return member.character_id === next.character_id ? next : member;
            });
        } else {
            session.cast = session.cast.concat([next]);
        }

        session.log.push('Entra: ' + describeCast(next));
    }

    /**
     * Moves, poses or re-layers someone already on stage.
     *
     * No entrance animation belongs here: the character never left, so only
     * what the node actually states changes. Someone who is not on stage cannot
     * be changed — the walk says so and carries on, because what the player
     * sees next is the destination, not the staging they missed.
     */
    function changeCast(session, node) {
        var existing = castMember(session, node.character_id);

        if (!existing) {
            session.log.push('Altera: ' + node.character_id + ' (não estava em cena)');
            return;
        }

        if (node.position) {
            existing.position = node.position;
        }

        if (node.pose) {
            existing.pose = node.pose;
        }

        // A new depth redefines the pair: naming one without the other is what
        // puts a character in front of, or behind, the whole cast at once.
        if (node.depth) {
            existing.depth = node.depth;
            existing.depth_of = node.depth_of || '';
        }

        if (node.emotion) {
            existing.emotion = node.emotion;
        }

        session.log.push('Altera: ' + describeCast(existing));
    }

    /** Takes a character out of the preview's cast, saying so if they were not there. */
    function exitCast(session, node) {
        var before = session.cast.length;

        session.cast = session.cast.filter(function (member) {
            return member.character_id !== node.character_id;
        });

        session.log.push(session.cast.length === before
            ? 'Sai: ' + node.character_id + ' (não estava em cena)'
            : 'Sai: ' + node.character_id);
    }

    /** The cast member with this id, or null when they are not on stage. */
    function castMember(session, characterId) {
        for (var i = 0; i < session.cast.length; i += 1) {
            if (session.cast[i].character_id === characterId) {
                return session.cast[i];
            }
        }

        return null;
    }

    /** One line for the log, reading the same way the node list does. */
    function describeCast(member) {
        var staging = Forger.model.describeStaging(member);

        return member.character_id + (staging ? ' · ' + staging : '');
    }

    /** The first branch whose condition passes; a branch without `if` always passes. */
    function pickBranch(node, state) {
        var found = null;

        (node.branches || []).forEach(function (branch) {
            if (found) {
                return;
            }

            if (!branch.if || evaluateCondition(branch.if, state)) {
                found = branch;
            }
        });

        return found;
    }

    /** The options the player would actually see. */
    function buildChoices(session, node) {
        var choices = [];

        (node.choices || []).forEach(function (choice) {
            if (!evaluateCondition(choice.visible_if, session.state)) {
                return;
            }

            choices.push({
                choice_id: choice.choice_id,
                text: choice.text,
                enabled: evaluateCondition(choice.enabled_if, session.state),
                disabled_reason: choice.disabled_reason || null,
            });
        });

        return choices;
    }

    /** Clickable segments of the current line. */
    function collectInteractions(node) {
        var interactions = [];

        (node.text || []).forEach(function (segment) {
            if (segment.type === 'interactive_text') {
                interactions.push({
                    interaction_id: segment.interaction_id,
                    label: segment.value,
                    optional: segment.optional !== false,
                });
            }
        });

        return interactions;
    }

    /** Evaluates a condition tree against the preview state. */
    function evaluateCondition(node, state) {
        if (!node) {
            return true;
        }

        if (typeof node.condition === 'string') {
            return compareValues(node.condition, readStatePath(state, node.left), node.right);
        }

        var passes = true;

        if (node.all) {
            node.all.forEach(function (child) {
                if (!evaluateCondition(child, state)) {
                    passes = false;
                }
            });
        }

        if (node.any) {
            var anyPasses = false;

            node.any.forEach(function (child) {
                if (evaluateCondition(child, state)) {
                    anyPasses = true;
                }
            });

            if (!anyPasses) {
                passes = false;
            }
        }

        if (node.not && evaluateCondition(node.not, state)) {
            passes = false;
        }

        return passes;
    }

    /**
     * Compara um valor de estado com um literal, pelas mesmas regras do motor.
     *
     * Um literal booleano é uma pergunta de sim ou não sobre a entrada, não um
     * valor a igualar: `inventory.caixa = true` tem de valer para uma contagem de
     * `1`, e `= false` tem de cobrir `0`, um item já gasto e um item que nunca
     * existiu. Texto fica de fora de propósito — `flags.mood = true` não pode dar
     * jeito a `flags.mood = "brave"`, porque uma bandeira com nome é uma escolha
     * de palavras.
     */
    function compareValues(operator, left, right) {
        if (isBooleanQuestion(left, right)) {
            if (operator === 'equals') {
                return toStateBoolean(left) === toStateBoolean(right);
            }

            if (operator === 'not_equals') {
                return toStateBoolean(left) !== toStateBoolean(right);
            }

            // Uma ordenação não tem significado para uma resposta de sim ou não,
            // por isso cai no caminho numérico e falha num dos lados.
        }

        if (Array.isArray(left)) {
            if (operator === 'equals') {
                return right !== null && left.indexOf(String(right)) !== -1;
            }

            if (operator === 'not_equals') {
                return right === null || left.indexOf(String(right)) === -1;
            }

            return typeof right === 'number' && COMPARISONS[operator](left.length, right);
        }

        if (operator === 'equals' || operator === 'not_equals') {
            return COMPARISONS[operator](left, right);
        }

        if (typeof left !== 'number' || typeof right !== 'number') {
            return false;
        }

        return COMPARISONS[operator](left, right);
    }

    /** Se a comparação deve ser lida como pergunta de sim ou não. */
    function isBooleanQuestion(left, right) {
        if (typeof left !== 'boolean' && typeof right !== 'boolean') {
            return false;
        }

        return isAnswerable(left) && isAnswerable(right);
    }

    /** Se um valor admite resposta de sim ou não, ou seja, se não é texto livre. */
    function isAnswerable(value) {
        return typeof value === 'boolean' || typeof value === 'number' || Array.isArray(value)
            || value === null;
    }

    /** Lê uma entrada de estado como resposta de sim ou não. Espelha `toStateBoolean`. */
    function toStateBoolean(value) {
        if (value === null || value === undefined) {
            return false;
        }

        if (Array.isArray(value)) {
            return value.length > 0;
        }

        if (typeof value === 'string') {
            return value !== '';
        }

        return Boolean(value);
    }

    /**
     * Resolves a variable reference for the preview's line rendering.
     *
     * "{input.<nome>}" reads the value a call-to-action node collected; "{name}"
     * and "{elements}" read the same values they always did, as the input
     * variables "name" and "elements". Anything else falls back to a normal
     * state path, so a variable never resolves to something it does not mean.
     */
    function resolveVariable(path, state) {
        var name = String(path || '');

        if (name === 'name') return readInput(state, 'name');
        if (name === 'elements') return readInput(state, 'elements');
        if (name.indexOf('input.') === 0) return readInput(state, name.slice(6));

        return readStatePath(state, path);
    }

    /** One entry of the preview's `input` slice, or null when it is absent. */
    function readInput(state, key) {
        return state.input && Object.prototype.hasOwnProperty.call(state.input, key)
            ? state.input[key]
            : null;
    }

    /** Reads a dotted state path, or null when it is absent. */
    function readStatePath(state, path) {
        var segments = String(path || '').split('.');

        if (segments.length < 2 || segments.length > 3) {
            return null;
        }

        var root = segments[0];
        var key = segments[1];
        var subKey = segments[2];

        switch (root) {
            case 'flags':
                return key in state.flags ? state.flags[key] : null;
            case 'inventory':
                return key in state.inventory ? state.inventory[key] : null;
            case 'relationship':
                // Duas camadas: o personagem, depois qual a afinidade.
                return segments.length === 3 ? readRelationship(state, key, subKey) : null;
            case 'stats':
                return key in state.stats ? state.stats[key] : null;
            case 'objectives':
                return state.objectives[key] ? state.objectives[key].status : null;
            case 'time':
                return key in state.time ? state.time[key] : null;
            case 'dialogues':
                if (key === 'seen') return state.dialogues.seen.slice();
                if (key === 'unlocked') return state.dialogues.unlocked.slice();
                return null;
            case 'paths':
                return key === 'unlocked' ? state.paths.unlocked.slice() : null;
            case 'input':
                return key in state.input ? state.input[key] : null;
            default:
                return null;
        }
    }

    /** Uma afinidade: o personagem e, dentro dele, o tipo de relação. */
    function readRelationship(state, characterId, relationshipKind) {
        var affinities = state.relationship[characterId];

        return affinities && relationshipKind in affinities ? affinities[relationshipKind] : null;
    }

    /** Marks a node as seen so conditions on `dialogues.seen` can check it. */
    function markNodeSeen(session, nodeId) {
        if (!nodeId || session.state.dialogues.seen.indexOf(nodeId) !== -1) {
            return;
        }

        session.state.dialogues.seen.push(nodeId);
        session.log.push('nó visto: ' + nodeId);
    }

    /** Applies a list of effects, reporting anything that fails. */
    function applyEffects(session, effects, source) {
        (effects || []).forEach(function (effect) {
            applyEffect(session, effect, source);
        });
    }

    /** Applies one effect to the throwaway state. */
    function applyEffect(session, effect, source) {
        var state = session.state;

        switch (effect.type) {
            case 'set_flag':
                state.flags[effect.flag] = effect.value;
                session.log.push('flag ' + effect.flag + ' = ' + JSON.stringify(effect.value));
                break;

            case 'add_relationship': {
                var kind = effect.relationship_kind;

                if (!effect.character_id || !kind) {
                    session.log.push('relação sem personagem ou sem tipo; ignorada');
                    break;
                }

                var amount = typeof effect.value === 'number' ? effect.value : 0;
                var delta = effect.direction === 'decrease' ? -amount : amount;
                var affinities = state.relationship[effect.character_id] || {};
                var previous = typeof affinities[kind] === 'number' ? affinities[kind] : 0;
                var next = Math.min(Math.max(previous + delta, -100), 100);

                if (!(effect.character_id in state.relationship)) {
                    state.relationship[effect.character_id] = affinities;
                }

                affinities[kind] = next;

                session.log.push('relação ' + effect.character_id + ' · ' + kind + ': ' + previous + ' → ' + next);
                break;
            }


            case 'add_item':
                state.inventory[effect.item_id] = (state.inventory[effect.item_id] || 0) + (effect.quantity || 1);
                session.log.push('item +' + (effect.quantity || 1) + ' ' + effect.item_id);
                break;

            case 'remove_item': {
                var owned = state.inventory[effect.item_id] || 0;
                var quantity = effect.quantity || 1;

                if (owned < quantity) {
                    session.log.push('item insuficiente: ' + effect.item_id);
                    break;
                }

                state.inventory[effect.item_id] = owned - quantity;
                session.log.push('item −' + quantity + ' ' + effect.item_id);
                break;
            }



            case 'play_music':
                session.log.push('música: ' + effect.music_id);
                break;

            default:
                session.log.push('efeito desconhecido em ' + source + ': ' + effect.type);
                break;
        }
    }

    Forger.preview = {
        createState: createState,
        start: start,
        advance: advance,
        choose: choose,
        submitInput: submitInput,
        click: click,
        evaluateCondition: evaluateCondition,
        readStatePath: readStatePath,
        resolveVariable: resolveVariable,
    };
})(window.DialogueForger);
