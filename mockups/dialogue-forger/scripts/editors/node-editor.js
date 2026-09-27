/**
 * Node editor.
 *
 * Renders the body of the editor for one node, dispatching on the node's type so
 * each kind shows only the fields it actually has. The surrounding chrome (id,
 * type, duplicate/delete) lives in `app.js`, which owns the node list.
 *
 * Every field writes straight into the model and asks for a *soft* refresh
 * (validation and the node list), never a re-render of this panel. Re-rendering
 * while typing would destroy the focused input, which is the single easiest way
 * to make an editor unusable.
 */
(function (Forger) {
    'use strict';

    var ui = Forger.ui;

    /** The syntax the text textareas understand, shown next to them. */
    var TEXT_LEGEND = [
        '{pause:400} — pausa de 400 ms',
        '{click id|texto|no_destino} — texto clicável (opcional)',
        '{click! id|texto|no_destino} — texto clicável (obrigatório)',
        '{style bold italic color=#D88CFF speed=0.8|texto} — texto com estilo; speed ajusta a velocidade da escrita.',
        '{style wave=normal wave_speed=0.8|texto} — ondulação lenta; níveis off / light / normal / strong, com wave_speed próprio.',
        '{style shake=light shake_speed=1.2|texto} — vibração leve e rápida.',
        '{style jitter=normal jitter_speed=0.8|texto} — tremor normal, mais lento.',
        '\\{ — chaveta literal',
    ];

    /** Renders the body of the editor. */
    function render(options) {
        switch (options.node.type) {
            case 'line':
                return renderLine(options);
            case 'choice':
                return renderChoice(options);
            case 'character_enter':
                return renderCharacterEnter(options);
            case 'character_exit':
                return renderCharacterExit(options);
            case 'conditional':
                return renderConditional(options);
            case 'end':
                return renderEnd(options);
            default:
                // A node kept from an older file. It is written back on export, so
                // explain it rather than showing an empty panel.
                return ui.hint(
                    'Este nó é do tipo "' + options.node.type + '", que o diálogo já não trata. '
                    + 'Ficou no ficheiro para não se perder nada: o jogo ignora-o e segue para o "next". '
                    + 'O fundo e a composição da cena passaram a ser do sistema de cenas.',
                );
        }
    }

    /**
     * The segment textarea, its error list and its live preview.
     *
     * Shared by a line and a choice node's question, because a question **is** a
     * line: it may be styled, it may be clicked, and it is parsed the same way.
     * The pieces are built together because their callbacks are wired to each
     * other — an edit has to republish the segments, re-list the problems and
     * redraw the preview, all from the same parse.
     *
     * `errorPath` is where the problems are reported from, so a problem in a
     * question does not claim to be in a line's text.
     */
    function buildTextEditor(options, segments, errorPath, onSegments) {
        var errorBox = ui.el('div', {});
        var preview = ui.el('div', { class: 'legend' });
        var source = Forger.segments.format(segments);
        var initial = Forger.segments.parse(source);

        var area = ui.textarea({
            id: 'forger-node-text',
            value: source,
            rows: 6,
            placeholder: 'Escreve aqui.',
            onInput: function (value) {
                var parsed = Forger.segments.parse(value);

                onSegments(parsed.segments);
                showErrors(parsed.errors);
                showPreview(parsed.segments);
            },
        });

        function showErrors(errors) {
            while (errorBox.firstChild) {
                errorBox.removeChild(errorBox.firstChild);
            }

            errors.forEach(function (error) {
                ui.append(errorBox, ui.notice('error', error.message + ' → ' + error.raw));
            });

            options.reportTextErrors(errors, errorPath);
        }

        function showPreview(parsed) {
            while (preview.firstChild) {
                preview.removeChild(preview.firstChild);
            }

            if (parsed.length === 0) {
                ui.append(preview, ui.hint('Sem segmentos.'));
                return;
            }

            parsed.forEach(function (segment) {
                ui.append(preview, ui.el('div', { class: 'small', text: describeSegment(segment) }));
            });
        }

        showErrors(initial.errors);
        showPreview(initial.segments);

        return {
            area: area,
            errorBox: errorBox,
            previewBlock: ui.block('Pré-visualização dos segmentos', [preview], { collapsible: true }),
        };
    }

    /**
     * The opt-in that lets a line drive itself.
     *
     * Off unless the author says otherwise: a line waits for the player, one page
     * at a time, and only `auto_advance` removes that wait. The checkbox is shown
     * rather than hidden in a collapsed block, because "this line moves on by
     * itself" is exactly the sort of thing that should be visible at a glance.
     */
    function autoAdvanceField(options) {
        var node = options.node;

        return ui.field('Avanço automático', ui.checkbox({
            checked: node.auto_advance === true,
            label: 'auto skip',
            onChange: function (checked) {
                options.patch({ auto_advance: checked });
            },
        }));
    }

    /** A spoken line: speaker, delivery, text, destination, effects. */
    function renderLine(options) {
        var node = options.node;
        var lists = options.lists;
        var text = buildTextEditor(
            options,
            node.text,
            'nodes.' + options.nodeId + '.text',
            function (segments) {
                options.patch({ text: segments });
            },
        );

        return ui.el('div', { class: 'node-body' }, [
            ui.el('div', { class: 'node-core' }, [
                ui.inline([
                    characterField('Falante', node.speaker_id, function (value) {
                        options.patch({ speaker_id: value });
                    }),
                    emotionField('Emoção', node.emotion, lists, function (value) {
                        options.patch({ emotion: value });
                    }),
                ]),
                textField('Texto da fala', text.area),
                text.errorBox,
            ]),
            advancedSection('Animação, avanço e efeitos', [
                ui.inline([
                    ui.field('Animação tsp', ui.listInput('animations', {
                        value: node.animation_id,
                        extra: lists.animations,
                        onInput: function (value) {
                            options.patch({ animation_id: value });
                        },
                    })),
                    autoAdvanceField(options),
                ]),
                effectsAfterBlock(options, 'Efeitos depois desta fala'),
                text.previewBlock,
            ]),
        ]);
    }

    /**
     * A branch point.
     *
     * The question is a line that is answered by a list, so it carries a line's
     * fields — including the emotion that drives the speaker's sprite — and is
     * edited with the same textarea.
     */
    function renderChoice(options) {
        var node = options.node;
        var prompt = {
            speaker_id: node.prompt.speaker_id || '',
            emotion: node.prompt.emotion || '',
            text: (node.prompt.text || []).slice(),
        };

        function publish() {
            options.patch({
                prompt: {
                    speaker_id: prompt.speaker_id,
                    emotion: prompt.emotion,
                    text: prompt.text,
                },
            });
        }

        var text = buildTextEditor(
            options,
            prompt.text,
            'nodes.' + options.nodeId + '.prompt.text',
            function (segments) {
                prompt.text = segments;
                publish();
            },
        );

        return ui.el('div', { class: 'node-body' }, [
            ui.el('div', { class: 'node-core' }, [
                ui.inline([
                    characterField('Falante da pergunta', prompt.speaker_id, function (value) {
                        prompt.speaker_id = value;
                        publish();
                    }),
                    emotionField('Emoção', prompt.emotion, options.lists, function (value) {
                        prompt.emotion = value;
                        publish();
                    }),
                ]),
                textField('Pergunta', text.area, 'Obrigatória.'),
                text.errorBox,
                ui.block('Opções de resposta', [
                    Forger.choiceEditor.render(node, function (next) {
                        options.patch({ choices: next });
                    }, {
                        nodeIds: options.lists.nodes,
                        suggestedPaths: options.suggestedPaths,
                        settings: Forger.effectEditor.settings(options.lists),
                    }),
                ]),
            ]),
            advancedSection('Formato da pergunta', [
                text.previewBlock,
            ]),
        ]);
    }

    /**
     * A character walking on screen.
     *
     * The dialogue stages itself: these nodes are how it says who is in the
     * conversation. `position` is an ordering hint rather than a coordinate — the
     * stage lays itself out from how many characters are on it — and `emotion` is
     * the sprite they arrive with, which a line's own `emotion` may override.
     */
    function renderCharacterEnter(options) {
        var node = options.node;
        var lists = options.lists;
        var entryFields = ui.inline([
            characterField('Personagem', node.character_id, function (value) {
                options.patch({ character_id: value });
            }),
            emotionField('Emoção', node.emotion, lists, function (value) {
                options.patch({ emotion: value });
            }),
        ]);

        return ui.el('div', { class: 'node-body' }, [
            ui.el('div', { class: 'node-core' }, [
                entryFields,
            ]),
            advancedSection('Animação, avanço e efeitos', [
                ui.inline([
                    ui.field('Animação tsp', ui.listInput('animations', {
                        value: node.animation_id,
                        extra: lists.animations,
                        onInput: function (value) {
                            options.patch({ animation_id: value });
                        },
                    })),
                    ui.field('Posição', ui.listInput('positions', {
                        value: node.position || 'center',
                        extra: lists.positions,
                        onInput: function (value) {
                            options.patch({ position: value });
                        },
                    })),
                ]),
                effectsAfterBlock(options, 'Efeitos depois da entrada'),
            ]),
        ]);
    }

    /** A character walking off screen. */
    function renderCharacterExit(options) {
        var node = options.node;
        var lists = options.lists;

        return ui.el('div', { class: 'node-body' }, [
            ui.el('div', { class: 'node-core' }, [
                characterField('Personagem', node.character_id, function (value) {
                    options.patch({ character_id: value });
                }),
            ]),
            advancedSection('Animação, direção e efeitos', [
                ui.inline([
                    ui.field('Animação tsp', ui.listInput('animations', {
                        value: node.animation_id,
                        extra: lists.animations,
                        onInput: function (value) {
                            options.patch({ animation_id: value });
                        },
                    })),
                    ui.field('Direção', ui.listInput('directions', {
                        value: node.direction,
                        extra: lists.directions,
                        onInput: function (value) {
                            options.patch({ direction: value });
                        },
                    })),
                ]),
                effectsAfterBlock(options, 'Efeitos depois da saída'),
            ]),
        ]);
    }

    /** An automatic branch, resolved without player input. */
    function renderConditional(options) {
        var node = options.node;
        var container = ui.el('div', {});

        function rebuild(branches) {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            ui.append(container, buildBranches(branches, rebuild, options));
        }

        rebuild(node.branches || []);

        return ui.el('div', { class: 'node-body' }, [
            ui.el('div', { class: 'node-core' }, [
                ui.hint('Os ramos são avaliados por ordem. O primeiro que passar ganha; um ramo sem condição é o caso padrão.'),
                container,
            ]),
        ]);
    }

    /** The branches of a conditional node. */
    function buildBranches(branches, rebuild, options) {
        var nodes = [];

        if (branches.length === 0) {
            nodes.push(ui.hint('Sem ramos.'));
        }

        branches.forEach(function (branch, index) {
            var current = {
                branch_id: branch.branch_id || '',
                if: branch.if || null,
                next: branch.next || '',
            };

            function publish() {
                var copy = branches.slice();
                copy[index] = current;

                options.patch({ branches: copy });
            }

            nodes.push(ui.row([
                ui.inline([
                    ui.field('ID do ramo', ui.text({
                        value: current.branch_id,
                        placeholder: 'caso_padrao',
                        onInput: function (value) {
                            current.branch_id = value;
                            publish();
                        },
                    }), undefined, { required: true }),
                    ui.field('Destino', ui.listInput('nodes', {
                        value: current.next,
                        extra: options.lists.nodes,
                        onInput: function (value) {
                            current.next = value;
                            publish();
                        },
                    }), undefined, { required: true }),
                ]),
                ui.block('Condição (vazio = caso padrão)', [
                    Forger.conditionEditor.render(current.if, function (next) {
                        current.if = next;
                        publish();
                    }, options.suggestedPaths),
                ], { collapsible: true }),
            ], function () {
                var copy = branches.slice();
                copy.splice(index, 1);

                options.patch({ branches: copy });
                rebuild(copy);
            }));
        });

        nodes.push(ui.el('div', { class: 'repeater-actions' }, [
            ui.button({
                label: '+ Ramo',
                tiny: true,
                onClick: function () {
                    var copy = branches.concat([{
                        branch_id: Forger.model.uniqueId(branches.map(function (branch) {
                            return branch.branch_id;
                        }), 'ramo'),
                        if: null,
                        next: '',
                    }]);

                    options.patch({ branches: copy });
                    rebuild(copy);
                },
            }),
        ]));

        return nodes;
    }

    /** A terminal node. */
    function renderEnd(options) {
        var node = options.node;

        return ui.el('div', { class: 'node-body' }, [
            ui.el('div', { class: 'node-core' }, [
                ui.field('Resultado', ui.listInput('results', {
                    value: node.result,
                    extra: options.lists.results,
                    onInput: function (value) {
                        options.patch({ result: value });
                    },
                }), 'etiqueta livre, ex.: good / neutral / bad'),
            ]),
            advancedSection('Efeitos ao terminar', [
                Forger.effectEditor.render(node.effects || [], function (next) {
                    options.patch({ effects: next });
                }, Forger.effectEditor.settings(options.lists)),
            ]),
        ]);
    }

    /**
     * A character id with the built-in list as suggestions.
     *
     * Nothing stops a free-typed id: a character created outside the tool is
     * written by hand, and the validator warns about it rather than the control
     * refusing it.
     */
    function characterField(label, value, onChange) {
        // Required in every node that has one: the validator refuses a line
        // without a speaker and an enter/exit without a character.
        return ui.field(label, ui.characterSelect({
            value: value,
            onChange: onChange,
        }), undefined, { required: true });
    }

    /**
     * An emotion, offered as suggestions rather than as a closed list.
     *
     * The game matches the value against the character's own art and falls back
     * to neutral, so an emotion it does not know is a hint the engine ignores,
     * not an error worth blocking.
     */
    function emotionField(label, value, lists, onInput, hint) {
        return ui.field(label, ui.listInput('emotions', {
            value: value,
            extra: lists ? lists.emotions : [],
            onInput: onInput,
        }), hint);
    }

    /** A visually emphasized essential field. */
    function emphasisField(label, control, hint) {
        var field = ui.field(label, control, hint);
        field.classList.add('field-primary');
        return field;
    }

    /** Text input with accessible, always-discoverable syntax help. */
    function textField(label, area, hint) {
        var tooltipId = 'forger-text-syntax-tooltip';
        var hintId = 'forger-node-text-hint';
        var tips = TEXT_LEGEND.map(function (line) {
            var separator = line.indexOf(' — ');

            return ui.el('div', { class: 'syntax-tip-row' }, [
                ui.el('code', { text: separator === -1 ? line : line.slice(0, separator) }),
                ui.el('span', { text: separator === -1 ? '' : line.slice(separator + 3) }),
            ]);
        });

        area.id = 'forger-node-text';
        area.setAttribute('aria-describedby', tooltipId + (hint ? ' ' + hintId : ''));

        var node = ui.el('div', { class: 'field text-field' }, [
            ui.el('div', { class: 'field-label-row' }, [
                ui.el('label', { class: 'field-label', for: area.id, text: label }),
                ui.el('div', { class: 'syntax-help' }, [
                    ui.el('button', {
                        type: 'button',
                        class: 'info-button',
                        'aria-label': 'Ajuda para a sintaxe do texto',
                        'aria-describedby': tooltipId,
                        title: 'Ver exemplos de formatação',
                        text: 'i',
                    }),
                    ui.el('div', { id: tooltipId, class: 'syntax-popover', role: 'tooltip' }, [
                        ui.el('h4', { text: 'Marcação suportada' }),
                        ui.el('div', { class: 'syntax-tip-list' }, tips),
                    ]),
                ]),
            ]),
            area,
            hint ? ui.el('span', { id: hintId, class: 'field-hint', text: hint }) : null,
        ]);

        // A line or a question with no text is an error, not a preference.
        return ui.markRequired(node);
    }

    /** A labelled disclosure for optional node configuration. */
    function advancedSection(title, children) {
        return ui.el('details', { class: 'node-advanced' }, [
            ui.el('summary', {}, [
                ui.el('span', { text: title }),
                ui.el('span', { class: 'summary-note', text: 'Opcional' }),
            ]),
            ui.el('div', { class: 'node-advanced-content' }, children),
        ]);
    }

    /** The "effects after this node" block, shared by the auto nodes. */
    function effectsAfterBlock(options, title) {
        return ui.block(title, [
            Forger.effectEditor.render(options.node.effects_after || [], function (next) {
                options.patch({ effects_after: next });
            }, Forger.effectEditor.settings(options.lists)),
        ], { collapsible: true });
    }

    /** One line describing a generated segment, for the live preview. */
    function describeSegment(segment) {
        switch (segment.type) {
            case 'text':
                return 'texto · ' + segment.value;

            case 'pause':
                return 'pausa · ' + segment.duration_ms + ' ms';

            case 'styled_text':
                return 'estilo (' + describeStyle(segment.style) + ') · ' + segment.value;

            case 'interactive_text':
                return 'clicável · ' + segment.interaction_id
                    + ' → ' + segment.on_click.next
                    + (segment.optional === false ? ' (obrigatório)' : ' (opcional)');

            default:
                return String(segment.type);
        }
    }

    /**
     * A readable summary of a style object.
     *
     * The live preview is the only place the forger shows what a `{style …}`
     * directive actually produced, so it names every part rather than a generic
     * "styled" — which is what makes a mistyped level obvious at a glance.
     */
    function describeStyle(style) {
        var source = style || {};
        var parts = [];

        if (source.bold) parts.push('bold');
        if (source.italic) parts.push('italic');
        if (source.underline) parts.push('underline');
        if (source.color) parts.push('cor ' + source.color);
        if (source.shake) parts.push('shake ' + source.shake + tempo(source.shake_speed));
        if (source.wave) parts.push('wave ' + source.wave + tempo(source.wave_speed));
        if (source.jitter) parts.push('jitter ' + source.jitter + tempo(source.jitter_speed));
        if (source.speed_multiplier != null) parts.push('velocidade ' + source.speed_multiplier);
        if (source.pause_after_ms != null) parts.push('pausa ' + source.pause_after_ms + ' ms');

        return parts.length > 0 ? parts.join(', ') : 'sem estilo';
    }

    /**
     * The tempo of a movement, when the author changed it.
     *
     * Named `ritmo` and not `velocidade` because `velocidade` already means the
     * *typing* speed in this same summary — two different numbers must not share
     * one word.
     */
    function tempo(multiplier) {
        return multiplier == null ? '' : ' (ritmo ' + multiplier + ')';
    }

    Forger.nodeEditor = {
        TEXT_LEGEND: TEXT_LEGEND,
        render: render,
    };
})(window.DialogueForger);
