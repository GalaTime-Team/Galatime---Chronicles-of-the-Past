/**
 * Model → YAML.
 *
 * The model already mirrors the file format, so this is mostly about *pruning*:
 * dropping the empty strings and empty lists the editors keep around for
 * convenience, and fixing the field order so the output reads like the
 * hand-written files in the project.
 */
(function (Forger) {
    'use strict';

    /**
     * Serialises the model into the final YAML text.
     *
     * Dumping the whole document in one call would be shorter, but it writes the
     * nodes back to back. Each node is instead dumped as its own mapping and then
     * shifted right by the two spaces `nodes:` nests by — YAML is indentation, so
     * that is all "put it under `nodes:`" takes, and it gives the blank line the
     * eye needs to find where one node ends and the next begins.
     */
    function serialize(model) {
        var document = toYamlObject(model);
        var nodes = document.nodes;

        delete document.nodes;

        var blocks = [dumpBlock(document)];
        var nodeIds = Object.keys(nodes);

        if (nodeIds.length === 0) {
            blocks.push('nodes: {}');
        } else {
            blocks.push('nodes:');
            nodeIds.forEach(function (nodeId, index) {
                // A blank line *between* nodes, never before the first one.
                if (index > 0) {
                    blocks.push('');
                }

                var pair = {};
                pair[nodeId] = nodes[nodeId];

                blocks.push(indentBlock(dumpBlock(pair), 2));
            });
        }

        return '# Diálogo: ' + (model.dialogue_id || '(sem id)') + '\n'
            + '# Gerado pelo Dialogue Forger. Comentários do ficheiro original não são preservados.\n'
            + '\n'
            + blocks.join('\n') + '\n';
    }

    /** One mapping as YAML, without the trailing newline the joining adds back. */
    function dumpBlock(value) {
        return String(Forger.yaml.dump(value)).replace(/\n+$/, '');
    }

    /**
     * Shifts a dumped block right, so a node can be nested under `nodes:`.
     *
     * Empty lines are left empty rather than padded: trailing whitespace is
     * invisible in the tool and noise in every diff.
     */
    function indentBlock(text, spaces) {
        var padding = new Array(spaces + 1).join(' ');

        return text.split('\n').map(function (line) {
            return line.length > 0 ? padding + line : line;
        }).join('\n');
    }

    /** The plain object that gets dumped, with empty fields removed. */
    function toYamlObject(model) {
        var output = {
            dialogue_id: model.dialogue_id || '',
            start_node: model.start_node || '',
        };

        if (model.entry_conditions && Object.keys(model.entry_conditions).length > 0) {
            output.entry_conditions = pruneCondition(model.entry_conditions);
        }

        // A block from before staging left the dialogue. Written back verbatim —
        // pruning it would be the forger deciding what an old file meant.
        if (model.scenes && Object.keys(model.scenes).length > 0) {
            output.scenes = JSON.parse(JSON.stringify(model.scenes));
        }

        output.nodes = {};
        Object.keys(model.nodes || {}).forEach(function (nodeId) {
            output.nodes[nodeId] = pruneNode(model.nodes[nodeId]);
        });

        return output;
    }

    /**
     * A node.
     *
     * Required fields are written even when empty — an empty `text` or a missing
     * `next` is a real authoring mistake the validator reports, and hiding it
     * would make the file look complete when it is not.
     */
    function pruneNode(node) {
        // A node of a kind the format no longer has is written back exactly as it
        // was found. The editor cannot show it, but dropping it would destroy the
        // writer's content without asking.
        if (!Forger.model.isSupportedNodeType(node.type)) {
            var preserved = Forger.model.clone(node);
            delete preserved.__id;
            return preserved;
        }

        var output = { type: node.type };

        switch (node.type) {
            case 'line':
                output.speaker_id = node.speaker_id || '';
                addIf(output, 'emotion', node.emotion);
                addIf(output, 'animation_id', node.animation_id);

                // Written only when on, and spelled out rather than left to
                // `addIf`: that helper is about empty strings and lists, and a
                // `false` that fell through it would put `auto_advance: false` on
                // every line in the file — noise that says nothing.
                if (node.auto_advance === true) {
                    output.auto_advance = true;
                }

                output.text = pruneSegments(node.text);
                addIf(output, 'next', node.next);
                break;

            case 'character_enter':
                output.character_id = node.character_id || '';
                addIf(output, 'position', node.position);
                addIf(output, 'animation_id', node.animation_id);
                addIf(output, 'emotion', node.emotion);
                addIf(output, 'next', node.next);
                break;

            case 'character_exit':
                output.character_id = node.character_id || '';
                addIf(output, 'animation_id', node.animation_id);
                addIf(output, 'direction', node.direction);
                addIf(output, 'next', node.next);
                break;

            case 'choice':
                if (hasPrompt(node.prompt)) {
                    output.prompt = prunePrompt(node.prompt);
                }

                output.choices = (node.choices || []).map(pruneChoice);
                break;

            case 'conditional':
                output.branches = (node.branches || []).map(pruneBranch);
                break;

            case 'end':
                addIf(output, 'result', node.result);
                break;

            default:
                break;
        }

        if ((node.effects_after || []).length > 0) {
            output.effects_after = node.effects_after.map(pruneEffect);
        }

        if (node.type === 'end' && (node.effects || []).length > 0) {
            output.effects = node.effects.map(pruneEffect);
        }

        return output;
    }

    /** Whether a question has anything worth writing. */
    function hasPrompt(prompt) {
        return Boolean(prompt && (prompt.speaker_id
            || prompt.emotion
            || (prompt.text || []).length > 0));
    }

    /** A question: the same fields a line has, in the same order. */
    function prunePrompt(prompt) {
        var output = { speaker_id: prompt.speaker_id || '' };

        addIf(output, 'emotion', prompt.emotion);
        output.text = pruneSegments(prompt.text);

        return output;
    }

    /** A choice, with its optional condition and effect blocks removed when empty. */
    function pruneChoice(choice) {
        var output = {
            choice_id: choice.choice_id || '',
            text: choice.text || '',
        };

        if (choice.visible_if && Object.keys(choice.visible_if).length > 0) {
            output.visible_if = pruneCondition(choice.visible_if);
        }

        if (choice.enabled_if && Object.keys(choice.enabled_if).length > 0) {
            output.enabled_if = pruneCondition(choice.enabled_if);
        }

        addIf(output, 'disabled_reason', choice.disabled_reason);

        if ((choice.effects_before || []).length > 0) {
            output.effects_before = choice.effects_before.map(pruneEffect);
        }

        addIf(output, 'next', choice.next);

        return output;
    }

    /** A conditional branch. A branch without `if` is the default. */
    function pruneBranch(branch) {
        var output = { branch_id: branch.branch_id || '' };

        if (branch.if && Object.keys(branch.if).length > 0) {
            output.if = pruneCondition(branch.if);
        }

        addIf(output, 'next', branch.next);

        return output;
    }

    /** A line's segments. */
    function pruneSegments(segments) {
        return (segments || []).map(function (segment) {
            switch (segment.type) {
                case 'pause':
                    return {
                        type: 'pause',
                        duration_ms: segment.duration_ms == null ? 0 : segment.duration_ms,
                    };

                case 'interactive_text':
                    return {
                        type: 'interactive_text',
                        interaction_id: segment.interaction_id || '',
                        value: segment.value || '',
                        optional: segment.optional !== false,
                        on_click: { next: (segment.on_click && segment.on_click.next) || '' },
                    };

                case 'styled_text':
                    var styled = { type: 'styled_text', value: segment.value || '' };
                    var style = pruneStyle(segment.style);

                    if (Object.keys(style).length > 0) {
                        styled.style = style;
                    }

                    return styled;

                default:
                    // Unknown segment kinds are written back untouched so an
                    // export never silently discards part of a line.
                    return segment;
            }
        });
    }

    /** A styled text style, with falsy entries removed. */
    function pruneStyle(style) {
        var output = {};

        Object.keys(style || {}).forEach(function (key) {
            var value = style[key];

            if (value === undefined || value === null || value === '' || value === false) {
                return;
            }

            output[key] = value;
        });

        return output;
    }

    /** An effect, with `type` first and empty fields dropped. */
    function pruneEffect(effect) {
        var output = { type: effect.type };

        Object.keys(effect || {}).forEach(function (key) {
            if (key === 'type') {
                return;
            }

            var value = effect[key];

            if (value === undefined || value === null || value === '') {
                return;
            }

            if (Array.isArray(value) && value.length === 0) {
                return;
            }

            output[key] = value;
        });

        return output;
    }

    /** A condition tree, with empty groups removed. */
    function pruneCondition(node) {
        if (!node || typeof node !== 'object') {
            return node;
        }

        if (typeof node.condition === 'string') {
            var leaf = { condition: node.condition, left: node.left };

            // `null` is meaningful here: it means "absent".
            if (node.right !== undefined) {
                leaf.right = node.right;
            }

            return leaf;
        }

        var output = {};

        if (Array.isArray(node.all) && node.all.length > 0) {
            output.all = node.all.map(pruneCondition);
        }

        if (Array.isArray(node.any) && node.any.length > 0) {
            output.any = node.any.map(pruneCondition);
        }

        if (node.not) {
            output.not = pruneCondition(node.not);
        }

        return output;
    }

    /** Copies a non-empty value onto the target. */
    function addIf(target, key, value) {
        if (value === undefined || value === null || value === '') {
            return;
        }

        if (Array.isArray(value) && value.length === 0) {
            return;
        }

        target[key] = value;
    }

    Forger.serializer = {
        serialize: serialize,
        toYamlObject: toYamlObject,
    };
})(window.DialogueForger);
