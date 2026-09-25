/**
 * Dialogue validator.
 *
 * Mirrors the checks in the backend's `validatorService` so the Forger reports
 * the same problems, with the same codes, before a file is ever handed to the
 * game. The two implementations are independent — a browser page cannot import
 * the TypeScript service — so **when a rule changes in one, change it in the
 * other**.
 *
 * Errors block; warnings describe something suspicious that still works. Unknown
 * characters are warnings on purpose, matching the engine, which tolerates a
 * character the catalogue has not caught up with.
 */
(function (Forger) {
    'use strict';

    var OPERATORS = [
        'equals', 'not_equals',
        'greater_than', 'greater_or_equal',
        'less_than', 'less_or_equal',
    ];

    var STATE_ROOTS = [
        'flags', 'inventory', 'relationship', 'objectives',
        'stats', 'time', 'dialogues', 'paths',
    ];

    /** Effect type → the string fields it must declare. */
    var EFFECT_STRING_FIELDS = {
        set_flag: ['flag'],
        add_relationship: ['character_id', 'relationship_kind'],
        add: ['target'],
        add_item: ['item_id'],
        remove_item: ['item_id'],
        unlock_objective: ['objective_id'],
        complete_objective: ['objective_id'],
        unlock_dialogue: ['dialogue_id'],
        unlock_path: ['path_id'],
        play_music: ['music_id'],
    };

    /** Effect type → the numeric fields it must declare. */
    var EFFECT_NUMBER_FIELDS = {
        set_flag: [],
        add_relationship: ['value'],
        add: ['value'],
        add_item: [],
        remove_item: [],
        unlock_objective: [],
        complete_objective: [],
        unlock_dialogue: [],
        unlock_path: [],
        play_music: [],
    };

    /** The known segment kinds. */
    var SEGMENT_TYPES = ['text', 'styled_text', 'pause', 'interactive_text'];

    /**
     * Validates a model.
     *
     * `options` may carry:
     *   - `fileName`: the file the model was imported from, used to flag a
     *     `dialogue_id` that does not match it;
     *   - `parseErrors`: per-node segment problems from the text editor, which
     *     cannot be recovered from the model because a malformed directive never
     *     becomes a segment.
     */
    function validate(model, options) {
        var settings = options || {};
        var errors = [];
        var warnings = [];

        function error(code, message, path) {
            errors.push({ severity: 'error', code: code, message: message, path: path });
        }

        function warn(code, message, path) {
            warnings.push({ severity: 'warning', code: code, message: message, path: path });
        }

        if (!model.dialogue_id) {
            error('missing_dialogue_id', 'Falta o "dialogue_id".', 'dialogue_id');
        } else if (settings.fileName && settings.fileName !== model.dialogue_id) {
            warn(
                'dialogue_id_mismatch',
                'O ficheiro chama-se "' + settings.fileName + '" mas o diálogo declara "' + model.dialogue_id + '". '
                + 'O nome do ficheiro é o identificador que os outros diálogos usam.',
                'dialogue_id',
            );
        }

        var nodeIds = Object.keys(model.nodes || {});

        if (nodeIds.length === 0) {
            error('missing_nodes', 'O diálogo não tem nós.', 'nodes');
        }

        if (!model.start_node) {
            error('missing_start_node', 'Falta o "start_node".', 'start_node');
        } else if (!model.nodes[model.start_node]) {
            error('unknown_start_node', 'O nó inicial "' + model.start_node + '" não existe.', 'start_node');
        }

        validateCondition(model.entry_conditions, 'entry_conditions', error, warn);

        // Scene definitions belong to the scene system now. They are still
        // recognised so an old file is told what happened to them instead of
        // silently losing them on the next export.
        var sceneIds = Object.keys(model.scenes || {});

        if (sceneIds.length > 0) {
            warn(
                'ignored_scene_definitions',
                'O diálogo define ' + sceneIds.length + ' cena(s) em "scenes". '
                + 'A cena já não é tratada pelo diálogo, por isso são ignoradas.',
                'scenes',
            );
        }

        Forger.model.collectEffects(model).forEach(function (located) {
            validateEffect(located.effect, located.path, error, warn);
        });

        nodeIds.forEach(function (nodeId) {
            validateNode(model, nodeId, error, warn);
        });

        if (model.start_node && model.nodes[model.start_node]) {
            validateReachability(model, nodeIds, warn);
        }

        // Segment problems the text editor saw, which the model cannot show. The
        // editor records the path with each one, because a question's text is not
        // a line's text and the two should not be reported as if they were.
        Object.keys(settings.parseErrors || {}).forEach(function (nodeId) {
            (settings.parseErrors[nodeId] || []).forEach(function (problem) {
                error(
                    'invalid_segment',
                    problem.message + ' → ' + problem.raw,
                    problem.path || 'nodes.' + nodeId + '.text',
                );
            });
        });

        return { errors: errors, warnings: warnings };
    }

    /** Checks one node's required fields and outgoing references. */
    function validateNode(model, nodeId, error, warn) {
        var node = model.nodes[nodeId];
        var path = 'nodes.' + nodeId;

        // A node kept from an older file. It is passed through on export, so it is
        // a warning rather than an error: the file still plays, minus the staging.
        if (node && Forger.model.REMOVED_NODE_TYPES.indexOf(node.type) !== -1) {
            warn(
                'removed_node_type',
                'O nó "' + nodeId + '" é do tipo "' + node.type + '", que o diálogo já não trata. '
                + 'É ignorado pelo jogo; a encenação passou a ser do sistema de cenas.',
                path + '.type',
            );
            return;
        }

        if (!node || Forger.model.NODE_TYPES.indexOf(node.type) === -1) {
            error('unknown_node_type', 'O nó "' + nodeId + '" tem um tipo não suportado.', path + '.type');
            return;
        }

        if (Forger.model.supportsNext(node.type)) {
            if (node.next && !model.nodes[node.next]) {
                error('unknown_next_node', 'O nó "' + nodeId + '" aponta para "' + node.next + '", que não existe.', path + '.next');
            }
        }

        switch (node.type) {
            case 'line':
                validateLine(model, nodeId, node, error, warn);
                break;

            case 'choice':
                validateChoices(model, nodeId, node, error, warn);
                break;

            case 'character_enter':
            case 'character_exit':
                if (!node.character_id) {
                    error('missing_character_id', 'O nó "' + nodeId + '" não define "character_id".', path + '.character_id');
                } else {
                    warnIfUnknownCharacter(node.character_id, path + '.character_id', warn);
                }
                break;

            case 'conditional':
                validateBranches(model, nodeId, node, error, warn);
                break;

            case 'end':
                break;

            default:
                break;
        }
    }

    /** A line needs a speaker, text, and valid interactive destinations. */
    function validateLine(model, nodeId, node, error, warn) {
        var path = 'nodes.' + nodeId;

        if (!node.speaker_id) {
            error('missing_speaker_id', 'A fala "' + nodeId + '" não define "speaker_id".', path + '.speaker_id');
        } else {
            warnIfUnknownCharacter(node.speaker_id, path + '.speaker_id', warn);
        }

        // O campo decide se o jogador é sequer convidado a avançar, por isso um
        // valor que não seja verdadeiro/falso transformar-se-ia em silêncio num
        // "não". Vale mais dizê-lo do que deixar passar um erro de escrita.
        if (node.auto_advance !== undefined && typeof node.auto_advance !== 'boolean') {
            error(
                'invalid_auto_advance',
                'A fala "' + nodeId + '" tem "auto_advance" que não é verdadeiro/falso.',
                path + '.auto_advance',
            );
        }

        if (!Array.isArray(node.text) || node.text.length === 0) {
            error('missing_text', 'A fala "' + nodeId + '" não tem texto.', path + '.text');
            return;
        }

        validateSegments(model, nodeId, node.text, path + '.text', error);
    }

    /**
     * Checks a list of segments and the destinations of their clickable text.
     *
     * Shared with a choice node's question, because a question is a line: it may
     * be styled and it may be clicked, so it is checked the same way.
     */
    function validateSegments(model, nodeId, segments, pathPrefix, error) {
        var seenInteractions = [];

        segments.forEach(function (segment, index) {
            var segmentPath = pathPrefix + '[' + index + ']';

            if (!segment || SEGMENT_TYPES.indexOf(segment.type) === -1) {
                error('invalid_segment', 'O segmento ' + index + ' de "' + nodeId + '" tem um tipo não suportado.', segmentPath);
                return;
            }

            if (segment.type === 'pause') {
                if (typeof segment.duration_ms !== 'number' || segment.duration_ms < 0) {
                    error('invalid_segment', 'A pausa ' + index + ' de "' + nodeId + '" precisa de "duration_ms".', segmentPath);
                }
                return;
            }

            if (segment.type !== 'interactive_text') {
                return;
            }

            if (!segment.interaction_id) {
                error('missing_interaction_id', 'O segmento clicável ' + index + ' de "' + nodeId + '" não tem "interaction_id".', segmentPath);
            } else if (seenInteractions.indexOf(segment.interaction_id) !== -1) {
                error('duplicate_interaction_id', 'O id de interação "' + segment.interaction_id + '" repete-se em "' + nodeId + '".', segmentPath);
            } else {
                seenInteractions.push(segment.interaction_id);
            }

            var destination = segment.on_click && segment.on_click.next;

            if (!destination) {
                error('missing_interaction_destination', 'O segmento clicável de "' + nodeId + '" não tem destino.', segmentPath);
            } else if (!model.nodes[destination]) {
                error('unknown_next_node', 'O segmento clicável de "' + nodeId + '" aponta para "' + destination + '", que não existe.', segmentPath);
            }
        });
    }

    /**
     * A choice node needs a well-formed question and unique, reachable options.
     *
     * The question is checked exactly like a line, because that is what it is.
     */
    function validateChoices(model, nodeId, node, error, warn) {
        var path = 'nodes.' + nodeId;

        if (node.prompt) {
            if (!node.prompt.speaker_id) {
                error('missing_speaker_id', 'A pergunta de "' + nodeId + '" não define "speaker_id".', path + '.prompt.speaker_id');
            } else {
                warnIfUnknownCharacter(node.prompt.speaker_id, path + '.prompt.speaker_id', warn);
            }

            if (!Array.isArray(node.prompt.text) || node.prompt.text.length === 0) {
                error('missing_text', 'A pergunta de "' + nodeId + '" não tem texto.', path + '.prompt.text');
            } else {
                validateSegments(model, nodeId, node.prompt.text, path + '.prompt.text', error);
            }
        }

        if (!Array.isArray(node.choices) || node.choices.length === 0) {
            error('missing_choices', 'O nó de escolha "' + nodeId + '" não tem opções.', path + '.choices');
            return;
        }

        var seen = [];

        node.choices.forEach(function (choice, index) {
            var choicePath = path + '.choices[' + index + ']';

            if (!choice.choice_id) {
                error('missing_choice_id', 'A opção ' + index + ' de "' + nodeId + '" não tem "choice_id".', choicePath);
            } else if (seen.indexOf(choice.choice_id) !== -1) {
                error('duplicate_choice_id', 'O id de opção "' + choice.choice_id + '" repete-se em "' + nodeId + '".', choicePath);
            } else {
                seen.push(choice.choice_id);
            }

            if (!choice.text) {
                warn('missing_choice_text', 'A opção "' + choice.choice_id + '" de "' + nodeId + '" não tem texto.', choicePath);
            }

            if (!choice.next) {
                error('missing_choice_destination', 'A opção "' + choice.choice_id + '" de "' + nodeId + '" não tem destino.', choicePath + '.next');
            } else if (!model.nodes[choice.next]) {
                error('unknown_next_node', 'A opção "' + choice.choice_id + '" de "' + nodeId + '" aponta para "' + choice.next + '", que não existe.', choicePath + '.next');
            }

            validateCondition(choice.visible_if, choicePath + '.visible_if', error, warn);
            validateCondition(choice.enabled_if, choicePath + '.enabled_if', error, warn);
        });
    }

    /** A conditional node needs unique branches, a default, and it must be last. */
    function validateBranches(model, nodeId, node, error, warn) {
        var path = 'nodes.' + nodeId;

        if (!Array.isArray(node.branches) || node.branches.length === 0) {
            error('missing_branches', 'O nó condicional "' + nodeId + '" não tem ramos.', path + '.branches');
            return;
        }

        var seen = [];
        var defaultIndex = -1;

        node.branches.forEach(function (branch, index) {
            var branchPath = path + '.branches[' + index + ']';

            if (!branch.branch_id) {
                error('missing_branch_id', 'O ramo ' + index + ' de "' + nodeId + '" não tem "branch_id".', branchPath);
            } else if (seen.indexOf(branch.branch_id) !== -1) {
                error('duplicate_branch_id', 'O id de ramo "' + branch.branch_id + '" repete-se em "' + nodeId + '".', branchPath);
            } else {
                seen.push(branch.branch_id);
            }

            if (!branch.next) {
                error('missing_branch_destination', 'O ramo "' + branch.branch_id + '" de "' + nodeId + '" não tem destino.', branchPath + '.next');
            } else if (!model.nodes[branch.next]) {
                error('unknown_next_node', 'O ramo "' + branch.branch_id + '" de "' + nodeId + '" aponta para "' + branch.next + '", que não existe.', branchPath + '.next');
            }

            if (!branch.if) {
                if (defaultIndex === -1) {
                    defaultIndex = index;
                }
            } else {
                validateCondition(branch.if, branchPath + '.if', error, warn);
            }
        });

        if (defaultIndex === -1) {
            warn('no_default_branch', 'O nó condicional "' + nodeId + '" não tem caso padrão: falha quando nada corresponde.', path + '.branches');
        } else if (defaultIndex !== node.branches.length - 1) {
            warn('default_branch_not_last', 'O nó condicional "' + nodeId + '" tem um ramo sem condição que não é o último; os seguintes nunca são alcançados.', path + '.branches[' + defaultIndex + ']');
        }

        // A ordem decide o vencedor, por isso um ramo que não pede nada que um
        // ramo anterior já não peça nunca pode ser escolhido: o anterior
        // corresponde primeiro. É assim que um "caso mais específico" fica
        // inalcançável por acidente, por ficar abaixo do caso geral.
        var reasoned = [];

        node.branches.forEach(function (branch, index) {
            var keys = collectRequiredConditionKeys(branch.if);

            if (keys !== null) {
                reasoned.push({ branch: branch, index: index, keys: keys });
            }
        });

        reasoned.forEach(function (later, position) {
            var shadowing = null;

            reasoned.slice(0, position).forEach(function (earlier) {
                if (!shadowing && isConditionSubset(earlier.keys, later.keys)) {
                    shadowing = earlier;
                }
            });

            if (shadowing) {
                warn(
                    'shadowed_branch',
                    'O ramo "' + branchLabel(later) + '" do nó condicional "' + nodeId + '" nunca é alcançado: '
                    + 'o ramo "' + branchLabel(shadowing) + '" é avaliado primeiro e corresponde sempre que este corresponderia.',
                    path + '.branches[' + later.index + ']',
                );
            }
        });
    }

    /** Como um ramo é identificado no aviso: o id, ou a posição quando não tem. */
    function branchLabel(entry) {
        return entry.branch.branch_id || entry.index;
    }

    /**
     * As condições que um ramo exige, ou `null` quando não são dedutíveis.
     *
     * Só se descrevem árvores `all`: não se prova que uma condição corresponde
     * pelo menos tantas vezes como outra através de um `any` ou de um `not`, e um
     * aviso errado é pior do que um aviso em falta. Os grupos `all` aninhados são
     * achatados, por isso uma folha identifica-se pelo que compara e não pelo
     * sítio onde está.
     */
    function collectRequiredConditionKeys(node) {
        if (!node) {
            return null;
        }

        if (typeof node.condition === 'string') {
            return [node.condition + '|' + node.left + '|' + JSON.stringify(node.right === undefined ? null : node.right)];
        }

        // Um "all" malformado já é reportado pela validação da condição; aqui não
        // há nada em que se possa raciocinar.
        if (node.any || node.not || (node.all !== undefined && !Array.isArray(node.all))) {
            return null;
        }

        var keys = [];

        for (var i = 0; i < (node.all || []).length; i += 1) {
            var childKeys = collectRequiredConditionKeys(node.all[i]);

            if (childKeys === null) {
                return null;
            }

            keys = keys.concat(childKeys);
        }

        return keys;
    }

    /** Se "earlier" corresponde sempre que "later" corresponde, "later" nunca é escolhido. */
    function isConditionSubset(earlier, later) {
        return earlier.every(function (key) {
            return later.indexOf(key) !== -1;
        });
    }

    /** Checks a condition tree's operators, paths and literals. */
    function validateCondition(node, path, error, warn) {
        if (!node) {
            return;
        }

        if (typeof node.condition === 'string') {
            if (OPERATORS.indexOf(node.condition) === -1) {
                error('invalid_condition', 'Comparação não suportada: "' + node.condition + '".', path + '.condition');
            }

            if (!parseStatePath(node.left)) {
                var pathProblem = describeConditionPathProblem(node.left);

                error(pathProblem.code, pathProblem.message, path + '.left');
            }

            if (!isComparableLiteral(node.right)) {
                error('invalid_condition_value', 'O "right" tem de ser booleano, texto, número ou nulo.', path + '.right');
            }

            return;
        }

        var known = ['all', 'any', 'not'];

        Object.keys(node).forEach(function (key) {
            if (known.indexOf(key) === -1) {
                error('invalid_condition', 'Chave de condição desconhecida: "' + key + '". Esperado "all", "any" ou "not".', path + '.' + key);
            }
        });

        if (!node.all && !node.any && !node.not) {
            warn('empty_condition_group', 'Grupo de condições vazio: passa sempre.', path);
        }

        ['all', 'any'].forEach(function (mode) {
            if (!node[mode]) {
                return;
            }

            if (!Array.isArray(node[mode])) {
                error('invalid_condition', '"' + mode + '" tem de ser uma lista de condições.', path + '.' + mode);
                return;
            }

            node[mode].forEach(function (child, index) {
                validateCondition(child, path + '.' + mode + '[' + index + ']', error, warn);
            });
        });

        if (node.not) {
            validateCondition(node.not, path + '.not', error, warn);
        }
    }

    /** Checks an effect's shape and the ids it references. */
    function validateEffect(effect, path, error, warn) {
        var problem = describeEffectProblem(effect);

        if (problem) {
            error('invalid_effect', problem, path);
            return;
        }

        if (effect.type === 'add_relationship') {
            warnIfUnknownCharacter(effect.character_id, path, warn);
        }

        if (effect.type === 'add' && (!parseStatePath(effect.target) || parseStatePath(effect.target).root !== 'stats')) {
            error('invalid_effect_target', 'O efeito "add" só aceita destinos "stats.<nome>"; recebeu "' + effect.target + '".', path);
        }

        if (effect.type === 'unlock_dialogue' && !Forger.catalogue.hasDialogue(effect.dialogue_id)) {
            warn('unknown_dialogue', 'O efeito desbloqueia o diálogo "' + effect.dialogue_id + '", que não está no catálogo carregado.', path);
        }
    }

    /** Describes what is wrong with an effect, or null when it is well formed. */
    function describeEffectProblem(effect) {
        var type = effect && effect.type;

        if (!EFFECT_STRING_FIELDS[type] && !EFFECT_NUMBER_FIELDS[type]) {
            return 'Tipo de efeito não suportado: "' + String(type) + '".';
        }

        var stringFields = EFFECT_STRING_FIELDS[type] || [];

        for (var i = 0; i < stringFields.length; i += 1) {
            var field = stringFields[i];

            if (typeof effect[field] !== 'string' || !effect[field]) {
                return 'O efeito "' + type + '" precisa de "' + field + '".';
            }
        }

        var numberFields = EFFECT_NUMBER_FIELDS[type] || [];

        for (var j = 0; j < numberFields.length; j += 1) {
            var numeric = numberFields[j];

            if (typeof effect[numeric] !== 'number' || !isFinite(effect[numeric])) {
                return 'O efeito "' + type + '" precisa de um número em "' + numeric + '".';
            }
        }

        if (type === 'set_flag' && !isScalar(effect.value)) {
            return 'O efeito "set_flag" precisa de um "value" booleano, texto ou número.';
        }

        if ((type === 'add_item' || type === 'remove_item') && effect.quantity !== undefined) {
            if (typeof effect.quantity !== 'number' || !isFinite(effect.quantity)
                || effect.quantity <= 0 || effect.quantity % 1 !== 0) {
                return 'O efeito "' + type + '" precisa de uma "quantity" inteira positiva.';
            }
        }

        return null;
    }

    /** Warns about nodes nothing reaches, and nodes that cannot finish. */
    function validateReachability(model, nodeIds, warn) {
        var reachable = collectReachable(model);
        var canExit = collectCanReachEnd(model);

        nodeIds.forEach(function (nodeId) {
            if (!reachable[nodeId]) {
                warn('unreachable_node', 'O nó "' + nodeId + '" não é alcançável a partir de "' + model.start_node + '".', 'nodes.' + nodeId);
                return;
            }

            if (!canExit[nodeId]) {
                warn('path_without_exit', 'O nó "' + nodeId + '" não consegue chegar a um nó de fim.', 'nodes.' + nodeId);
            }
        });
    }

    /** Nodes reachable from the start node. */
    function collectReachable(model) {
        var reachable = {};

        if (!model.start_node) {
            return reachable;
        }

        var queue = [model.start_node];

        while (queue.length > 0) {
            var nodeId = queue.pop();

            if (reachable[nodeId] || !model.nodes[nodeId]) {
                continue;
            }

            reachable[nodeId] = true;
            queue = queue.concat(Forger.model.outgoingNodeIds(model.nodes[nodeId]));
        }

        return reachable;
    }

    /** Nodes from which an `end` node can be reached. */
    function collectCanReachEnd(model) {
        var parents = {};

        Object.keys(model.nodes || {}).forEach(function (nodeId) {
            Forger.model.outgoingNodeIds(model.nodes[nodeId]).forEach(function (target) {
                parents[target] = (parents[target] || []).concat([nodeId]);
            });
        });

        var canExit = {};
        var queue = Object.keys(model.nodes || {}).filter(function (nodeId) {
            return model.nodes[nodeId].type === 'end';
        });

        while (queue.length > 0) {
            var nodeId = queue.pop();

            if (canExit[nodeId]) {
                continue;
            }

            canExit[nodeId] = true;
            queue = queue.concat(parents[nodeId] || []);
        }

        return canExit;
    }

    /** Splits a state path, rejecting anything the engine could not read. */
    function parseStatePath(path) {
        if (typeof path !== 'string') {
            return null;
        }

        var segments = path.split('.');

        if (segments.length < 2 || segments.length > 3 || !segments[0] || !segments[1]) {
            return null;
        }

        if (STATE_ROOTS.indexOf(segments[0]) === -1) {
            return null;
        }

        // Only `relationship` has a third segment, and it needs it: a path that
        // stops at the character does not say which affinity it means.
        if (segments[0] === 'relationship') {
            return segments.length === 3 && segments[2]
                ? { root: segments[0], key: segments[1], subKey: segments[2] }
                : null;
        }

        return segments.length === 2 ? { root: segments[0], key: segments[1] } : null;
    }

    /**
     * Porque é que um caminho de condição não serve.
     *
     * O caso interessante é o da relação: precisa de um terceiro segmento a
     * dizer qual a afinidade, e dizê-lo é mais útil do que "não é um caminho".
     */
    function describeConditionPathProblem(left) {
        if (isRelationshipPathMissingKind(left)) {
            var characterId = left.split('.')[1] || '';

            return {
                code: 'missing_relationship_kind',
                message: 'O caminho "' + left + '" tem de dizer qual a relação: "'
                    + 'relationship.' + characterId + '.' + Forger.model.DEFAULT_RELATIONSHIP_KIND + '".',
            };
        }

        return {
            code: 'invalid_condition_path',
            message: 'O caminho "' + String(left) + '" não é um caminho de estado com no máximo 3 segmentos.',
        };
    }

    /** Um caminho que nomeia a relação mas para antes do tipo. */
    function isRelationshipPathMissingKind(path) {
        if (typeof path !== 'string') {
            return false;
        }

        var segments = path.split('.');

        return segments.length === 2 && segments[0] === 'relationship' && Boolean(segments[1]);
    }

    /** Warns when a character is not in the loaded catalogue. */
    function warnIfUnknownCharacter(characterId, path, warn) {
        if (Forger.catalogue.hasCharacter(characterId)) {
            return;
        }

        warn(
            'unknown_character',
            'O personagem "' + characterId + '" não está no catálogo carregado. '
            + 'Importa a pasta do catálogo, ou adiciona o id à mão, se ele existir mesmo.',
            path,
        );
    }

    /** Conditions compare against a scalar or an explicit null. */
    function isComparableLiteral(value) {
        return value === null
            || typeof value === 'boolean'
            || typeof value === 'string'
            || typeof value === 'number';
    }

    function isScalar(value) {
        return typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number';
    }

    Forger.validator = {
        OPERATORS: OPERATORS,
        STATE_ROOTS: STATE_ROOTS,
        parseStatePath: parseStatePath,
        describeEffectProblem: describeEffectProblem,
        validate: validate,
    };
})(window.DialogueForger);
