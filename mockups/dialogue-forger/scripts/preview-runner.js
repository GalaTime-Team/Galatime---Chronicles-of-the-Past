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
            inventory: Object.assign({}, source.inventory),
            relationship: copyRelationships(source.relationship),
            objectives: normalizeObjectives(source.objectives),
            stats: Object.assign({}, source.stats),
            time: Object.assign({ hour: 0 }, source.time),
            dialogues: {
                seen: ((source.dialogues || {}).seen || []).slice(),
                unlocked: ((source.dialogues || {}).unlocked || []).slice(),
            },
            paths: { unlocked: ((source.paths || {}).unlocked || []).slice() },
        };
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
        var existing = null;

        session.cast.forEach(function (member) {
            if (member.character_id === node.character_id) {
                existing = member;
            }
        });

        var next = {
            character_id: node.character_id,
            position: node.position || (existing && existing.position) || 'center',
            emotion: node.emotion || (existing && existing.emotion) || '',
        };

        if (existing) {
            session.cast = session.cast.map(function (member) {
                return member.character_id === next.character_id ? next : member;
            });
        } else {
            session.cast = session.cast.concat([next]);
        }

        session.log.push('Entra: ' + next.character_id + ' @ ' + next.position);
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

    /** Compares a state value against a literal, matching the engine's rules. */
    function compareValues(operator, left, right) {
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
            default:
                return null;
        }
    }

    /** Uma afinidade: o personagem e, dentro dele, o tipo de relação. */
    function readRelationship(state, characterId, relationshipKind) {
        var affinities = state.relationship[characterId];

        return affinities && relationshipKind in affinities ? affinities[relationshipKind] : null;
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

                var delta = typeof effect.value === 'number' ? effect.value : 0;
                var affinities = state.relationship[effect.character_id] || {};
                var previous = typeof affinities[kind] === 'number' ? affinities[kind] : 0;
                var next = Math.min(Math.max(previous + delta, -100), 100);

                if (next !== previous) {
                    state.relationship[effect.character_id] = affinities;
                    affinities[kind] = next;
                }

                session.log.push('relação ' + effect.character_id + ' · ' + kind + ': ' + previous + ' → ' + next);
                break;
            }

            case 'add': {
                var parts = String(effect.target || '').split('.');

                if (parts.length !== 2 || parts[0] !== 'stats') {
                    session.log.push('efeito "add" só aceita "stats.<nome>"; ignorado: ' + effect.target);
                    break;
                }

                var current = typeof state.stats[parts[1]] === 'number' ? state.stats[parts[1]] : 0;
                state.stats[parts[1]] = current + effect.value;
                session.log.push('stat ' + parts[1] + ': ' + current + ' → ' + state.stats[parts[1]]);
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

            case 'unlock_objective':
                if (!state.objectives[effect.objective_id]) {
                    state.objectives[effect.objective_id] = { status: 'locked' };
                    session.log.push('objetivo desbloqueado: ' + effect.objective_id);
                }
                break;

            case 'complete_objective':
                state.objectives[effect.objective_id] = { status: 'completed', progress: 1 };
                session.log.push('objetivo concluído: ' + effect.objective_id);
                break;

            case 'unlock_dialogue':
                if (state.dialogues.unlocked.indexOf(effect.dialogue_id) === -1) {
                    state.dialogues.unlocked.push(effect.dialogue_id);
                    session.log.push('diálogo desbloqueado: ' + effect.dialogue_id);
                }
                break;

            case 'unlock_path':
                if (state.paths.unlocked.indexOf(effect.path_id) === -1) {
                    state.paths.unlocked.push(effect.path_id);
                    session.log.push('caminho desbloqueado: ' + effect.path_id);
                }
                break;

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
        click: click,
        evaluateCondition: evaluateCondition,
        readStatePath: readStatePath,
    };
})(window.DialogueForger);
