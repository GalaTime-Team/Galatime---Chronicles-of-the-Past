/**
 * Choice editor.
 *
 * Each option is a card whose summary says what it is — "① Fico. → fala_2" —
 * and opens onto the fields a writer reaches for only when the option needs
 * them: conditions and effects. The common case is therefore two inputs (the
 * label and the destination) behind one click.
 *
 * The choice id is bookkeeping: it is derived from the label, and derived again
 * whenever the label changes, so the option never carries an id the writer had
 * to invent or keep in step.
 */
(function (Forger) {
    'use strict';

    var ui = Forger.ui;

    /** Renders the options of a choice node. */
    function render(node, onChange, context) {
        var container = ui.el('div', { class: 'choice-list' });

        function rebuild(choices) {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            ui.append(container, buildRows(choices, rebuild, onChange, context));
        }

        rebuild(node.choices || []);

        return container;
    }

    /** One card per option, plus the add button. */
    function buildRows(choices, rebuild, onChange, context) {
        var nodes = [];

        if (choices.length === 0) {
            nodes.push(ui.hint('Sem opções.'));
        }

        choices.forEach(function (choice, index) {
            nodes.push(renderCard(choice, function (next) {
                var copy = choices.slice();
                copy[index] = next;

                // Publishing only: rebuilding the list here would destroy the very
                // input the writer is typing into, and every character would need
                // a fresh click to get the focus back. Structural changes below
                // are the only ones that rebuild.
                onChange(copy);
            }, function () {
                var copy = choices.slice();
                copy.splice(index, 1);

                onChange(copy);
                rebuild(copy);
            }, context, idsExcept(choices, index), index));
        });

        nodes.push(ui.el('div', { class: 'repeater-actions' }, [
            ui.button({
                label: '+ Opção',
                tiny: true,
                onClick: function () {
                    var copy = choices.concat([{
                        choice_id: '',
                        text: '',
                        next: '',
                        disabled_reason: '',
                        visible_if: null,
                        enabled_if: null,
                        effects_before: [],
                    }]);

                    onChange(copy);
                    rebuild(copy);
                },
            }),
        ]));

        return nodes;
    }

    /** The ids of every option but the one being edited. */
    function idsExcept(choices, index) {
        return (choices || []).filter(function (choice, position) {
            return position !== index;
        }).map(function (choice) {
            return choice.choice_id;
        }).filter(Boolean);
    }

    /** One option, as a card that opens onto its conditions and effects. */
    function renderCard(choice, onReplace, onRemove, context, siblingIds, index) {
        var current = {
            choice_id: choice.choice_id || '',
            text: choice.text || '',
            next: choice.next || '',
            // Preserved for a file that carries one, never offered for editing.
            disabled_reason: choice.disabled_reason || '',
            visible_if: choice.visible_if || null,
            enabled_if: choice.enabled_if || null,
            effects_before: (choice.effects_before || []).slice(),
        };

        function publish() {
            onReplace({
                choice_id: current.choice_id,
                text: current.text,
                next: current.next,
                disabled_reason: current.disabled_reason,
                visible_if: current.visible_if,
                enabled_if: current.enabled_if,
                effects_before: current.effects_before,
            });
        }

        // The summary is the option's public face, so it is kept in step with
        // the fields underneath instead of waiting for a re-render.
        var title = ui.el('span', {
            class: 'choice-title' + (current.text ? '' : ' is-empty'),
            text: current.text || '(sem texto)',
        });
        var target = ui.el('span', {
            class: 'choice-target',
            text: current.next ? '→ ' + current.next : '→ sem destino',
        });
        var badges = [];

        function badge(label) {
            var node = ui.el('span', { class: 'badge', text: label });
            badges.push(node);
            return node;
        }

        var visibleBadge = badge(' visível só se…');
        var enabledBadge = badge(' escolhível só se…');

        visibleBadge.style.display = current.visible_if ? '' : 'none';
        enabledBadge.style.display = current.enabled_if ? '' : 'none';

        function refreshSummary() {
            title.textContent = current.text || '(sem texto)';
            title.classList.toggle('is-empty', !current.text);
            target.textContent = current.next ? '→ ' + current.next : '→ sem destino';
            visibleBadge.style.display = current.visible_if ? '' : 'none';
            enabledBadge.style.display = current.enabled_if ? '' : 'none';
        }

        var labelInput = ui.text({
            value: current.text,
            placeholder: 'Texto mostrado ao jogador',
            onInput: function (value) {
                current.text = value;

                // The id follows the label: an option is referred to by what it
                // says, and an id that stopped matching it would only mislead.
                current.choice_id = Forger.model.uniqueId(siblingIds, value || 'opcao');

                publish();
                refreshSummary();
            },
        });

        var advanced = [
            ui.block('Visível só se…', [
                Forger.conditionEditor.render(current.visible_if, function (next) {
                    current.visible_if = next;
                    publish();
                    refreshSummary();
                }, context.suggestedPaths),
                ui.el('div', { class: 'inline-help' }, [
                    ui.info({
                        label: 'Sobre «Visível só se»',
                        title: 'Visível só se',
                        body: 'Escondida quando falha: a opção não aparece de todo.',
                    }),
                ]),
            ], { collapsible: true }),

            ui.block('Escolhível só se…', [
                Forger.conditionEditor.render(current.enabled_if, function (next) {
                    current.enabled_if = next;
                    publish();
                    refreshSummary();
                }, context.suggestedPaths),
                ui.el('div', { class: 'inline-help' }, [
                    ui.info({
                        label: 'Sobre «Escolhível só se»',
                        title: 'Escolhível só se',
                        body: 'Quando falha, a opção aparece mas não pode ser escolhida.',
                    }),
                ]),
            ], { collapsible: true }),

            ui.block('Efeitos antes de avançar', [
                Forger.effectEditor.render(current.effects_before, function (next) {
                    current.effects_before = next;
                    publish();
                }, context.settings),
            ], { collapsible: true }),
        ];

        var card = ui.el('details', { class: 'choice-card' }, [
            ui.el('summary', {}, [
                ui.el('span', { class: 'choice-index', text: String(index + 1) }),
                title,
                badges,
                target,
                // Inside a <summary> a click would also toggle the card, so the
                // removal says it has handled the event and stops there.
                ui.button({
                    label: '×',
                    title: 'Remover opção',
                    variant: 'danger',
                    tiny: true,
                    onClick: function (event) {
                        event.preventDefault();
                        event.stopPropagation();
                        onRemove();
                    },
                }),
            ]),
            ui.el('div', { class: 'choice-card-body' }, [
                ui.inline([
                    ui.field('Texto', labelInput),
                    ui.field('Destino', ui.listInput('nodes', {
                        value: current.next,
                        placeholder: 'id_do_no',
                        extra: context.nodeIds,
                        onInput: function (value) {
                            current.next = value;
                            publish();
                            refreshSummary();
                        },
                    }), undefined, { required: true }),
                ]),
                advanced,
            ]),
        ]);

        // An option that already carries a condition opens on it: the writer
        // came back to it for a reason, and a closed card would hide it.
        if (current.visible_if || current.enabled_if) {
            card.setAttribute('open', 'open');
        }

        return card;
    }

    Forger.choiceEditor = {
        render: render,
    };
})(window.DialogueForger);
