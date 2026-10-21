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
 *
 * The fields are grouped by the **role** they play in the node — who is in it,
 * where they stand, what is said, how they move and where it goes next — because
 * a flat list of inputs says nothing about how the node works. Every section is
 * visible; the ones a writer opens rarely are collapsible.
 */
(function (Forger) {
    'use strict';

    var ui = Forger.ui;

    /**
     * The markup the text areas understand, in one table.
     *
     * The inserter's dropdown and the tooltip that explains it both read from
     * here, so the two can never disagree about what the syntax offers — a
     * directive missing from the dropdown is a directive nobody finds. Each
     * entry is the text that goes into the box and the name it goes by.
     */
    var MARKUP = [
        { value: '{input.nome}', label: 'Variável do jogador' },
        { value: '{pause:400}', label: 'Pausa' },
        { value: '{thought|texto}', label: 'Pensamento' },
        { value: '{whisper|texto}', label: 'Sussurro' },
        { value: '{shout|texto}', label: 'Berro' },
        { value: '{style bold color=#D88CFF speed=0.8|texto}', label: 'Estilo' },
        { value: '{style wave=normal wave_speed=0.8|texto}', label: 'Ondulação' },
        { value: '{style shake=light shake_speed=1.2|texto}', label: 'Vibração' },
        { value: '{style jitter=normal jitter_speed=0.8|texto}', label: 'Tremor' },
        { value: '{click id|texto|destino}', label: 'Clicável' },
        { value: '{click! id|texto|destino}', label: 'Clicável obrigatório' },
        { value: '{name}', label: 'Nome do protagonista' },
        { value: '{elements}', label: 'Elementos do protagonista' },
        { value: '\\{', label: 'Chaveta literal' },
    ];

    /** Renders the body of the editor. */
    function render(options) {
        switch (options.node.type) {
            case 'line':
                return renderLine(options);
            case 'choice':
                return renderChoice(options);
            case 'player_input':
                return renderPlayerInput(options);
            case 'character_enter':
                return renderCharacterEnter(options);
            case 'character_action':
                return renderCharacterAction(options);
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
     * at a time, and only `auto_advance` removes that wait.
     */
    function autoAdvanceField(options) {
        var node = options.node;

        return ui.field('Avanço automático', ui.checkbox({
            checked: node.auto_advance === true,
            label: 'auto skip',
            onChange: function (checked) {
                options.patch({ auto_advance: checked });
            },
        }), 'A fala passa sozinha, sem esperar pelo jogador.');
    }

    /**
     * The markup inserter that sits under the text area.
     *
     * One picker, one button, one line: the picker says what goes in and the
     * button puts it at the cursor, so nobody has to type the braces by hand.
     * They are held together as one bar rather than as a field beside a loose
     * button, because the label explains the pair and not the picker alone.
     *
     * The syntax itself lives in the bar's own "i": what can be written in the
     * box is the picker's business, not the text field's.
     */
    function markupInserter(area) {
        var tooltipId = 'forger-markup-syntax';
        var tips = MARKUP.map(function (entry) {
            return ui.el('div', { class: 'syntax-tip-row' }, [
                ui.el('code', { text: entry.value }),
                ui.el('span', { text: entry.label }),
            ]);
        });

        var picker = ui.select({
            value: '{thought|texto}',
            options: MARKUP,
            onChange: function () {},
        });

        return ui.el('div', { class: 'markup-toolbar' }, [
            ui.el('span', { class: 'markup-toolbar-label', text: 'Marcação' }),
            picker,
            ui.el('span', { class: 'syntax-help' }, [
                ui.el('button', {
                    type: 'button',
                    class: 'info-button',
                    'aria-label': 'Ajuda para a marcação do texto',
                    'aria-describedby': tooltipId,
                    title: 'Ver a marcação suportada',
                    text: 'i',
                }),
                ui.el('div', { id: tooltipId, class: 'syntax-popover', role: 'tooltip' }, [
                    ui.el('h4', { text: 'Marcação suportada' }),
                    ui.el('div', { class: 'syntax-tip-list' }, tips),
                    ui.el('p', {
                        class: 'syntax-popover-note',
                        text: 'A marcação escolhida entra na posição do cursor, dentro da caixa de texto.',
                    }),
                ]),
            ]),
            ui.button({
                label: 'Inserir',
                tiny: true,
                title: 'Inserir a marcação escolhida na posição do cursor',
                onClick: function () {
                    insertMarkupAtCursor(area, picker.value);
                },
            }),
        ]);
    }

    /** A spoken line: who says it, what they say, how they move, where it goes. */
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
        var movement = animationField({
            phase: 'idle',
            node: node,
            value: node.animation_id,
            onChange: function (value) {
                options.patch({ animation_id: value });
            },
        });

        return ui.el('div', { class: 'node-body' }, [
            ui.section('Quem', [
                ui.inline([
                    characterField('Falante', node.speaker_id, function (value) {
                        options.patch({ speaker_id: value });
                    }),
                    emotionField('Emoção', node.emotion, lists, function (value) {
                        options.patch({ emotion: value });
                    }),
                ], 'pair'),
            ]),
            ui.section('Conversa', [
                textField('Texto da fala', text.area),
                markupInserter(text.area),
                text.errorBox,
                ui.inline([
                    deliveryField('Como é dito', node.delivery, function (value) {
                        options.patch({ delivery: value });
                    }),
                    autoAdvanceField(options),
                ], 'pair'),
            ]),
            ui.section('Como se move', [
                movement.el,
            ]),
            ui.section('Percurso', [
                destinationField(options),
            ]),
            ui.section('Efeitos', [
                effectsAfterBlock(options, 'Efeitos depois desta fala'),
            ], { collapsible: true, open: (node.effects_after || []).length > 0 }),
            ui.section('Marcação', [
                text.previewBlock,
            ], { collapsible: true }),
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
            ui.section('Quem', [
                ui.inline([
                    characterField('Falante da pergunta', prompt.speaker_id, function (value) {
                        prompt.speaker_id = value;
                        publish();
                    }),
                    emotionField('Emoção', prompt.emotion, options.lists, function (value) {
                        prompt.emotion = value;
                        publish();
                    }),
                ], 'pair'),
            ]),
            ui.section('Conversa', [
                textField('Pergunta', text.area),
                markupInserter(text.area),
                text.errorBox,
                ui.block('Opções de resposta', [
                    Forger.choiceEditor.render(node, function (next) {
                        options.patch({ choices: next });
                    }, {
                        nodeIds: options.lists.nodes,
                        suggestedPaths: options.suggestedPaths,
                        settings: Forger.effectEditor.settings(options.lists),
                    }),
                ], { open: true }),
                text.previewBlock,
            ]),
        ]);
    }

    /**
     * A "call to action": the dialogue stops and asks the player for a value.
     *
     * One variable is filled and spoken back later as {input.<variavel>}. The
     * answer is either free text or a pick from a short list; the writer names
     * the variable once and everything else follows from the type. In the forger
     * the value only lives during the test - the engine is expected to keep it
     * in the real save.
     */
    function renderPlayerInput(options) {
        // The face that depends on the type - a placeholder for text, the list
        // for a choice - repaints when the type changes, so switching never
        // leaves the old control sitting behind the new one.
        var typeFace = ui.el('div', {});

        function paintTypeFace() {
            while (typeFace.firstChild) {
                typeFace.removeChild(typeFace.firstChild);
            }

            if (options.node.input_type === 'choice') {
                ui.append(typeFace, optionsListEditor(options));
            } else {
                ui.append(typeFace, ui.field('Dica do campo', ui.text({
                    value: options.node.placeholder,
                    placeholder: 'ex.: o teu nome',
                    onInput: function (value) {
                        options.patch({ placeholder: value });
                    },
                }), 'O que a caixa mostra antes de o jogador escrever.'));
            }
        }

        var typeSelect = ui.select({
            value: options.node.input_type,
            options: Forger.lists.INPUT_TYPES,
            onChange: function (value) {
                options.patch({ input_type: value });
                paintTypeFace();
            },
        });

        paintTypeFace();

        return ui.el('div', { class: 'node-body' }, [
            ui.section('Pergunta', [
                ui.field('Pergunta ao jogador', ui.textarea({
                    value: options.node.question,
                    rows: 2,
                    placeholder: 'ex.: Como te chamas?',
                    onInput: function (value) {
                        options.patch({ question: value });
                    },
                }), 'O texto mostrado ao jogador antes de ele responder.', { required: true }),
            ]),
            ui.section('Variável', [
                ui.inline([
                    ui.field('Nome da variável', ui.listInput('inputVariables', {
                        value: options.node.variable,
                        placeholder: 'ex.: name',
                        extra: options.lists.inputVariables || [],
                        onInput: function (value) {
                            var trimmed = String(value).trim();
                            options.patch({ variable: trimmed ? Forger.model.slug(trimmed) : '' });
                        },
                    }), 'Fica guardada em input.<nome> e lê-se no texto com {input.<nome>}.', { required: true }),
                    ui.field('Tipo de resposta', typeSelect, 'Texto livre deixa o jogador escrever; escolha oferece uma lista.'),
                ], 'pair'),
                typeFace,
                ui.el('div', { class: 'inline-help' }, [
                    ui.info({
                        label: 'Onde o valor fica',
                        title: 'Onde o valor fica',
                        body: 'No forger o valor só existe durante o teste. No jogo fica '
                            + 'guardado em input.<nome>, persiste entre diálogos, e lê-se '
                            + 'em qualquer texto com {input.<nome>}.',
                    }),
                ]),
            ]),
            ui.section('Percurso', [
                destinationField(options),
            ]),
            ui.section('Efeitos', [
                effectsAfterBlock(options, 'Efeitos depois da resposta'),
            ], { collapsible: true, open: (options.node.effects_after || []).length > 0 }),
        ]);
    }

    /** The option list of a "choice"-type call to action: rows that add and remove. */
    function optionsListEditor(options) {
        var container = ui.el('div', { class: 'stack' });
        var list = (options.node.options || []).slice();

        function rebuild() {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            if (list.length === 0) {
                ui.append(container, ui.hint('Sem opções. Acrescenta pelo menos uma.'));
            }

            list.forEach(function (option, index) {
                ui.append(container, ui.row([
                    ui.field('Opção ' + (index + 1), ui.text({
                        value: option,
                        placeholder: 'ex.: Fogo',
                        onInput: function (value) {
                            list[index] = value;
                            options.patch({ options: list.slice() });
                        },
                    })),
                ], function () {
                    list.splice(index, 1);
                    options.patch({ options: list.slice() });
                    rebuild();
                }));
            });

            ui.append(container, ui.el('div', { class: 'repeater-actions' }, [
                ui.button({
                    label: '+ Opção',
                    tiny: true,
                    onClick: function () {
                        list.push('');
                        options.patch({ options: list.slice() });
                        rebuild();
                    },
                }),
            ]));
        }

        rebuild();

        return container;
    }

    /**
     * A character walking on screen.
     *
     * The dialogue stages itself: these nodes are how it says who is in the
     * conversation, where they stand and how they arrive. `position` is an
     * ordering hint rather than a coordinate, `pose` is what the body does in
     * that slot — sitting tracks the "the character can enter sitting" case —
     * and `emotion` is the sprite they arrive with, which a line's own
     * `emotion` may override.
     */
    function renderCharacterEnter(options) {
        var node = options.node;
        var lists = options.lists;
        var movement = animationField({
            phase: 'enter',
            node: node,
            value: node.animation_id,
            direction: 'De que lado vem',
            directionHint: 'De que lado do palco o personagem aparece.',
            onChange: function (value) {
                options.patch({ animation_id: value });
            },
        });

        return ui.el('div', { class: 'node-body' }, [
            ui.section('Quem', [
                ui.inline([
                    characterField('Personagem', node.character_id, function (value) {
                        options.patch({ character_id: value });
                    }),
                    emotionField('Emoção', node.emotion, lists, function (value) {
                        options.patch({ emotion: value });
                    }),
                ], 'pair'),
            ]),
            ui.section('Cena', [
                ui.inline([
                    positionField('Posição', node.position || 'center', lists, function (value) {
                        options.patch({ position: value });
                    }),
                    poseField('Pose', node.pose || 'stand', function (value) {
                        options.patch({ pose: value });
                    }),
                    depthField('Profundidade', node.depth || 'front', function (value) {
                        options.patch({ depth: value });
                    }),
                ], 'entry-fields'),
                ui.inline([
                    depthOfField('Em relação a', node.depth_of, lists, function (value) {
                        options.patch({ depth_of: value });
                    }),
                ]),
            ]),
            ui.section('Como se move', [
                movement.el,
            ]),
            ui.section('Percurso', [
                destinationField(options),
            ]),
            ui.section('Efeitos', [
                effectsAfterBlock(options, 'Efeitos depois da entrada'),
            ], { collapsible: true, open: (node.effects_after || []).length > 0 }),
        ]);
    }

    /**
     * Someone already on stage doing something.
     *
     * Standing up, sitting down, stepping to another slot or moving behind
     * another character all end here. Nothing about the entrance belongs to it:
     * the character never left, so the node only states what changed.
     */
    function renderCharacterAction(options) {
        var node = options.node;
        var lists = options.lists;
        var movement = animationField({
            phase: 'action',
            node: node,
            value: node.animation_id,
            defaultKind: Forger.model.actionForPose(node.pose),
            direction: 'Para que lado',
            directionHint: 'Para que lado do palco a ação se faz.',
            onChange: function (value) {
                options.patch({ animation_id: value });
            },
        });

        return ui.el('div', { class: 'node-body' }, [
            ui.section('Quem', [
                ui.inline([
                    characterField('Personagem', node.character_id, function (value) {
                        options.patch({ character_id: value });
                    }),
                    emotionField('Nova emoção', node.emotion, lists, function (value) {
                        options.patch({ emotion: value });
                    }),
                ], 'pair'),
            ]),
            ui.section('Cena', [
                ui.inline([
                    positionField('Nova posição', node.position, lists, function (value) {
                        options.patch({ position: value });
                    }),
                    poseField('Nova pose', node.pose, function (value) {
                        options.patch({ pose: value });

                        // A pose implies its own movement, so the pose carries
                        // the motion with it — until the writer picks a
                        // different one, which the check below leaves alone.
                        var implied = Forger.model.actionForPose(value);
                        var current = node.animation_id || '';

                        if (implied && (!current || isImplicitActionAnimation(current))) {
                            options.patch({ animation_id: implied });
                            movement.show(implied);
                        }
                    }),
                    depthField('Profundidade', node.depth || 'front', function (value) {
                        options.patch({ depth: value });
                    }),
                ], 'entry-fields'),
                ui.inline([
                    depthOfField('Em relação a', node.depth_of, lists, function (value) {
                        options.patch({ depth_of: value });
                    }),
                ]),
                stagingHelp('O que este nó deixar em branco fica como estava.'),
            ]),
            ui.section('Como se move', [
                movement.el,
            ]),
            ui.section('Percurso', [
                destinationField(options),
            ]),
            ui.section('Efeitos', [
                effectsAfterBlock(options, 'Efeitos depois da ação'),
            ], { collapsible: true, open: (node.effects_after || []).length > 0 }),
        ]);
    }

    /** A character walking off screen. */
    function renderCharacterExit(options) {
        var node = options.node;
        var lists = options.lists;
        var movement = animationField({
            phase: 'exit',
            node: node,
            value: node.animation_id,
            direction: 'Para que lado',
            directionHint: 'Para onde vira ao sair — a cena lê esta direção.',
            onChange: function (value) {
                options.patch({ animation_id: value });
            },
            onDirection: function (value) {
                options.patch({ direction: value });
            },
        });

        return ui.el('div', { class: 'node-body' }, [
            ui.section('Quem', [
                characterField('Personagem', node.character_id, function (value) {
                    options.patch({ character_id: value });
                }),
            ]),
            ui.section('Como se move', [
                movement.el,
            ]),
            ui.section('Percurso', [
                destinationField(options),
            ]),
            ui.section('Efeitos', [
                effectsAfterBlock(options, 'Efeitos depois da saída'),
            ], { collapsible: true, open: (node.effects_after || []).length > 0 }),
        ]);
    }

    /** An automatic branch, resolved without player input. */
    function renderConditional(options) {
        var container = ui.el('div', {});

        function rebuild(branches) {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            ui.append(container, buildBranches(branches, rebuild, options));
        }

        rebuild(options.node.branches || []);

        return ui.el('div', { class: 'node-body' }, [
            ui.section('Ramos', [
                ui.el('div', { class: 'inline-help' }, [
                    ui.info({
                        label: 'Como os ramos são avaliados',
                        title: 'Como os ramos são avaliados',
                        body: 'Os ramos são avaliados por ordem e o primeiro que passar ganha. '
                            + 'O último é sempre o caso padrão: recebe o que nenhum dos outros recebeu.',
                    }),
                ]),
                container,
            ]),
        ]);
    }

    /**
     * The branches of a conditional node, as sentences.
     *
     * A branch reads "Vai para X se Y": the destination sits in the lead line and
     * its condition underneath, inside one card. The list always ends in the
     * default — a branch with no condition, which catches whatever the others
     * did not — so it is never missing and never deletable.
     */
    function buildBranches(branches, rebuild, options) {
        var slots = branchSlots(branches);
        var nodes = [];

        /** Writes a new branch list, keeping the default last. */
        function publish(conditionals, fallback) {
            options.patch({ branches: conditionals.concat([fallback]) });
        }

        slots.conditionals.forEach(function (branch, position) {
            nodes.push(ui.el('div', { class: 'branch-card' }, [
                ui.el('div', { class: 'branch-question' }, [
                    ui.el('label', { class: 'branch-destination' }, [
                        ui.el('span', { class: 'branch-lead', text: 'Vai para' }),
                        ui.listInput('nodes', {
                            value: branch.next,
                            placeholder: 'id_do_no',
                            extra: options.lists.nodes,
                            onInput: function (value) {
                                var copy = slots.conditionals.slice();
                                copy[position] = Object.assign({}, branch, { next: value });
                                publish(copy, slots.fallback);
                            },
                        }),
                    ]),
                    ui.el('span', { class: 'branch-lead', text: 'se' }),
                    ui.button({
                        label: '×',
                        title: 'Remover ramo',
                        variant: 'danger',
                        tiny: true,
                        onClick: function () {
                            var copy = slots.conditionals.slice();
                            copy.splice(position, 1);

                            publish(copy, slots.fallback);
                            rebuild(copy.concat([slots.fallback]));
                        },
                    }),
                ]),
                ui.el('div', { class: 'branch-condition' }, [
                    Forger.conditionEditor.render(branch.if, function (next) {
                        var copy = slots.conditionals.slice();
                        copy[position] = Object.assign({}, branch, { if: next });
                        publish(copy, slots.fallback);
                    }, options.suggestedPaths),
                ]),
            ]));
        });

        nodes.push(ui.el('div', { class: 'branch-card is-default' }, [
            ui.el('div', { class: 'branch-question' }, [
                ui.el('label', { class: 'branch-destination' }, [
                    ui.el('span', { class: 'branch-lead', text: 'Caso padrão · vai para' }),
                    ui.listInput('nodes', {
                        value: slots.fallback.next,
                        placeholder: 'id_do_no',
                        extra: options.lists.nodes,
                        onInput: function (value) {
                            publish(slots.conditionals, Object.assign({}, slots.fallback, { next: value }));
                        },
                    }),
                ]),
            ]),
            ui.el('p', {
                class: 'branch-note',
                text: 'Se nenhuma das condições acima corresponder, a conversa segue por aqui.',
            }),
        ]));

        nodes.push(ui.el('div', { class: 'repeater-actions' }, [
            ui.button({
                label: '+ Ramo',
                tiny: true,
                onClick: function () {
                    var taken = slots.conditionals.map(function (branch) {
                        return branch.branch_id;
                    });
                    var added = {
                        branch_id: Forger.model.uniqueId(taken, 'ramo'),
                        if: null,
                        next: '',
                    };

                    // Inserted above the default, which is what keeps the default
                    // last and therefore the one that catches the rest.
                    var copy = slots.conditionals.concat([added]);
                    var published = copy.concat(Object.assign({}, slots.fallback));

                    options.patch({ branches: published });
                    rebuild(published);
                },
            }),
        ]));

        return nodes;
    }

    /**
     * Splits a branch list into the conditional branches and the default.
     *
     * The default is the first branch with no condition. Any further branch
     * without one stays in the conditional list, where it can be given a
     * condition — the engine would never reach it where it stands, and hiding
     * it would hide a real problem in the file.
     */
    function branchSlots(branches) {
        var conditionals = [];
        var fallback = null;

        (branches || []).forEach(function (branch) {
            if (!branch.if && !fallback) {
                fallback = branch;
                return;
            }

            conditionals.push(branch);
        });

        if (!fallback) {
            fallback = { branch_id: '', if: null, next: '' };
        }

        return { conditionals: conditionals, fallback: fallback };
    }

    /** A terminal node. */
    function renderEnd(options) {
        var node = options.node;

        return ui.el('div', { class: 'node-body' }, [
            ui.section('Resultado', [
                ui.field('Resultado', ui.listInput('results', {
                    value: node.result,
                    extra: options.lists.results,
                    onInput: function (value) {
                        options.patch({ result: value });
                    },
                }), 'etiqueta livre, ex.: good / neutral / bad'),
            ]),
            ui.section('Efeitos ao terminar', [
                Forger.effectEditor.render(node.effects || [], function (next) {
                    options.patch({ effects: next });
                }, Forger.effectEditor.settings(options.lists)),
            ], { collapsible: true, open: (node.effects || []).length > 0 }),
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
     * Where on the stage the character stands.
     *
     * Still a free-text field: the engine reads a position it does not know by
     * the words in it, and a closed menu would refuse a name a stage could
     * place anyway.
     */
    function positionField(label, value, lists, onChange) {
        return ui.field(label, ui.select({
            value: value || 'center',
            options: lists.positions.map(function (position) {
                return { value: position, label: Forger.model.vocabularyLabel('position', position) };
            }),
            onChange: onChange,
        }), 'A ordem no palco, da esquerda para a direita. As distâncias são do palco, que se organiza pelos personagens que estão em cena.');
    }

    /**
     * What the character's body is doing in their slot.
     *
     * A closed menu: the stage draws one body per entry, so an invented pose
     * would only ever fall back to the standing one.
     */
    function poseField(label, value, onChange) {
        return ui.field(label, ui.select({
            value: value || '',
            options: [{ value: '', label: '—' }].concat(Forger.lists.POSES.map(function (pose) {
                return { value: pose, label: Forger.model.vocabularyLabel('pose', pose) };
            })),
            onChange: onChange,
        }), 'Um personagem pode entrar no diálogo sentado, e levantar-se a meio dele.');
    }

    /**
     * Which side of the cast the character is drawn on.
     *
     * Paired with the character it names, when it names one: relative depth is
     * what "atrás de outro personagem" means.
     */
    function depthField(label, value, onChange) {
        return ui.field(label, ui.select({
            value: value || '',
            options: [{ value: '', label: '—' }].concat(Forger.lists.DEPTHS.map(function (depth) {
                return { value: depth, label: Forger.model.vocabularyLabel('depth', depth) };
            })),
            onChange: onChange,
        }), 'Quem é desenhado à frente de quem. Indica junto de quem em «Em relação a»; sozinho, vale para todo o elenco.');
    }

    /** The character a depth is measured against. */
    function depthOfField(label, value, lists, onChange) {
        return ui.field(label, ui.characterSelect({
            value: value,
            placeholder: 'personagem',
            onChange: onChange,
        }), 'Só usado em conjunto com a profundidade.');
    }

    /**
     * Whether the line is spoken out loud or only thought.
     *
     * A whole line is one or the other, and the empty value is the common case:
     * the box reads «Fala» and nothing is written to the file. A single thought
     * inside a spoken line is a segment instead — `{thought|texto}` — so a
     * character can say one thing and think the next.
     */
    function deliveryField(label, value, onChange) {
        return ui.field(label, ui.select({
            value: value || '',
            options: Forger.lists.DELIVERIES,
            onChange: onChange,
        }), 'Um personagem pode falar ou pensar. «Pensamento» apresenta a linha como pensamento; uma parte só usa {thought|texto}.');
    }

    /**
     * How the character moves, as three choices.
     *
     * Instead of a table of animation names, the writer picks what the body
     * does, from or to which side, and at what tempo; the editor composes those
     * into the single `animation_id` the file carries. An id that came from a
     * file is read back into the same three choices.
     *
     * Returns the control and a `show(id)` the callers use when something else
     * wrote the animation — a pose carrying its own movement — so the controls
     * and the file say the same thing.
     */
    function animationField(config) {
        var phase = config.phase;
        var defaults = Forger.lists.ANIMATION_DEFAULTS[phase];

        // An action's pose carries its own movement, so a node that already
        // states one starts from it rather than from the plain default.
        if (config.defaultKind) {
            defaults = Object.assign({}, defaults, { kind: config.defaultKind });
        }

        var parts = Forger.model.parseAnimation(config.value);

        // "Nenhum" a writer chose earlier is remembered on the node out-of-band
        // (it is never serialised): an empty animation_id alone cannot tell a
        // deliberate "no movement" from a node nobody has opened yet, and the
        // difference is whether the phase default gets seeded further down.
        var explicitNone = config.node && config.node.__animationNone === true && !config.value;

        var state = {
            kind: explicitNone ? 'none' : (parts.kind || defaults.kind),
            // An id never writes «centro», so a parsed centre is the phase's own
            // default speaking — and an exit's default side is not the centre.
            direction: parts.direction === 'center' ? defaults.direction : parts.direction,
            speed: parts.speed === 'normal' ? defaults.speed : parts.speed,
        };

        var kindSelect = ui.select({
            value: state.kind,
            options: Forger.lists.ANIMATION_KINDS[phase].map(function (kind) {
                return { value: kind.value, label: kind.label };
            }),
            onChange: function (value) {
                state.kind = value;

                // Remembered so a node re-opened later still reads "Nenhum"
                // instead of being re-seeded with the phase default. Any other
                // choice clears it: the node moves again.
                if (config.node) {
                    if (value === 'none') {
                        config.node.__animationNone = true;
                    } else {
                        delete config.node.__animationNone;
                    }
                }

                publish();
            },
        });

        var directionSelect = ui.select({
            value: state.direction,
            options: Forger.lists.ANIMATION_DIRECTIONS.map(function (direction) {
                return { value: direction.value, label: direction.label };
            }),
            onChange: function (value) {
                state.direction = value;
                publish();
            },
        });

        var speedSelect = ui.select({
            value: state.speed,
            options: Forger.lists.ANIMATION_SPEEDS.map(function (speed) {
                return { value: speed.value, label: speed.label };
            }),
            onChange: function (value) {
                state.speed = value;
                publish();
            },
        });

        function publish() {
            config.onChange(Forger.model.composeAnimation(phase, state));

            // An exit's side is a field of its own, so the same choice feeds
            // both: the movement reads it and the engine field keeps it.
            if (config.onDirection) {
                config.onDirection(state.direction === 'center' ? '' : state.direction);
            }

            syncDisabled();
        }

        /** Shows an animation written from somewhere else, without publishing. */
        function show(id) {
            var read = Forger.model.parseAnimation(id);

            state.kind = read.kind || defaults.kind;
            state.direction = read.direction === 'center' ? defaults.direction : read.direction;
            state.speed = read.speed === 'normal' ? defaults.speed : read.speed;

            // A motion arriving from elsewhere — a pose carrying its own — is a
            // real movement, so the node is no longer "does not move".
            if (config.node) {
                delete config.node.__animationNone;
            }

            kindSelect.value = state.kind;
            directionSelect.value = state.direction;
            speedSelect.value = state.speed;
            syncDisabled();
        }

        // "Nenhum" has no side and no tempo, so its two companions go quiet: a
        // control that cannot change anything is worse than one plainly off.
        function syncDisabled() {
            speedSelect.disabled = state.kind === 'none';
            directionSelect.disabled = state.kind === 'none';
        }

        var controls = [ui.field('Movimento', kindSelect)];

        if (config.direction) {
            controls.push(ui.field(config.direction, directionSelect, config.directionHint));
        }

        controls.push(ui.field('Velocidade', speedSelect,
            'A velocidade escreve-se no id: «slow» e «fast» mudam o tempo, «normal» não escreve nada.'));

        syncDisabled();

        // A node with no animation yet gets its phase's own: an empty control
        // would read as "nothing happens", which is never what a node means.
        // A writer who chose "Nenhum" is the one exception — that empty is on
        // purpose, and seeding a default here would undo their choice the
        // moment they came back to the node.
        if (!config.value && !explicitNone) {
            publish();
        }

        return {
            el: ui.el('div', { class: 'animation-field' }, [ui.inline(controls)]),
            show: show,
        };
    }

    /**
     * Whether an animation id is one a pose would have picked on its own.
     *
     * The pose carries its movement with it, so a motion that is still the pose's
     * own gives way when the pose changes; one the writer chose does not.
     */
    function isImplicitActionAnimation(id) {
        var kind = Forger.model.parseAnimation(id).kind;

        return Forger.lists.ANIMATION_KINDS.action.some(function (entry) {
            return entry.value === kind;
        });
    }

    /** Where a node hands the conversation over to. */
    function destinationField(options) {
        return ui.field('Próximo nó', ui.listInput('nodes', {
            value: options.node.next,
            placeholder: 'id_do_no',
            extra: options.lists.nodes,
            onInput: function (value) {
                options.patch({ next: value });
            },
        }), 'O passo mostrado a seguir. Liga-se sozinho ao nó anterior quando este ainda não tem destino.');
    }

    /**
     * The "i" of a staging editor.
     *
     * The staging fields are the ones an author meets for the first time here,
     * so their explanation stays one hover away instead of printed between the
     * fields and the rest of the node.
     */
    function stagingHelp(extra) {
        return ui.el('div', { class: 'inline-help' }, [
            ui.info({
                label: 'Como o palco lê a cena',
                title: 'Como o palco lê a cena',
                body: [
                    'Posição — a ordem da esquerda para a direita: esquerda, centro-esquerda, centro, centro-direita, direita.',
                    'Pose — o que o corpo faz nesse lugar: de pé ou sentado.',
                    'Profundidade — quem é desenhado à frente de quem, em relação a um personagem ou a todo o elenco.',
                    extra || '',
                ],
            }),
        ]);
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

    /**
     * The text box of a line or of a choice's question.
     *
     * The markup the box understands is not explained here: it has an inserter
     * of its own right below, whose "i" carries the whole syntax. A tooltip on
     * the box would only repeat what the writer is about to read anyway.
     */
    function textField(label, area, hint) {
        var hintId = 'forger-node-text-hint';

        area.id = 'forger-node-text';

        if (hint) {
            area.setAttribute('aria-describedby', hintId);
        }

        var node = ui.el('div', { class: 'field text-field' }, [
            ui.el('div', { class: 'field-label-row' }, [
                ui.el('label', { class: 'field-label', for: area.id, text: label }),
            ]),
            area,
            hint ? ui.el('span', { id: hintId, class: 'field-hint', text: hint }) : null,
        ]);

        // A line or a question with no text is an error, not a preference.
        return ui.markRequired(node);
    }

    /** The "effects after this node" block, shared by the auto nodes. */
    function effectsAfterBlock(options, title) {
        return Forger.effectEditor.render(options.node.effects_after || [], function (next) {
            options.patch({ effects_after: next });
        }, Forger.effectEditor.settings(options.lists));
    }

    /** One line describing a generated segment, for the live preview. */
    function describeSegment(segment) {
        switch (segment.type) {
            case 'text':
                return 'texto · ' + segment.value;

            case 'variable':
                return 'variável · ' + segment.value;

            case 'thought':
                return 'pensamento · ' + segment.value;
            case 'whisper':
                return 'sussurro · ' + segment.value;
            case 'shout':
                return 'berro · ' + segment.value;
            case 'variable':
                return 'variável · ' + segment.value;

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

    function insertMarkupAtCursor(area, token) {
        var start = area.selectionStart || 0;
        var end = area.selectionEnd || 0;
        var value = area.value || '';
        area.value = value.slice(0, start) + token + value.slice(end);
        area.selectionStart = area.selectionEnd = start + token.length;
        area.focus();
        area.dispatchEvent(new Event('input', { bubbles: true }));
    }

    Forger.nodeEditor = {
        render: render,
    };
})(window.DialogueForger);
