/**
 * Choice editor.
 *
 * Each option shows the four things a writer always needs — id, label,
 * destination, and whether it is available — and hides the rest (conditions,
 * effects, a disabled explanation) behind a collapsed section. That keeps the
 * common case to three inputs.
 *
 * The choice id is derived from the label while the writer has not typed one,
 * because the id is bookkeeping rather than something to think about.
 */
(function (Forger) {
    'use strict';

    var ui = Forger.ui;

    /** Renders the options of a choice node. */
    function render(node, onChange, context) {
        var container = ui.el('div', {});

        function rebuild(choices) {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            ui.append(container, buildRows(choices, rebuild, onChange, context));
        }

        rebuild(node.choices || []);

        return container;
    }

    /** One row per option, plus the add button. */
    function buildRows(choices, rebuild, onChange, context) {
        var nodes = [];

        if (choices.length === 0) {
            nodes.push(ui.hint('Sem opções.'));
        }

        choices.forEach(function (choice, index) {
            nodes.push(renderRow(choice, function (next) {
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
            }, context, choices));
        });

        nodes.push(ui.el('div', { class: 'repeater-actions' }, [
            ui.button({
                label: '+ Opção',
                tiny: true,
                onClick: function () {
                    var copy = choices.concat([{
                        choice_id: Forger.model.uniqueId(idsOf(choices), 'opcao'),
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

    /** One option. */
    function renderRow(choice, onReplace, onRemove, context, siblings) {
        var current = {
            choice_id: choice.choice_id || '',
            text: choice.text || '',
            next: choice.next || '',
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

        var idInput = ui.text({
            value: current.choice_id,
            placeholder: 'id_da_opcao',
            onInput: function (value) {
                current.choice_id = value;
                publish();
            },
        });

        var labelInput = ui.text({
            value: current.text,
            placeholder: 'Texto mostrado ao jogador',
            onInput: function (value) {
                current.text = value;

                // Fill the id in from the label until the writer takes over.
                if (!current.choice_id && value) {
                    current.choice_id = Forger.model.uniqueId(idsOf(siblings), value);
                    idInput.value = current.choice_id;
                }

                publish();
            },
        });

        var main = ui.inline([
            ui.field('ID', idInput),
            ui.field('Texto', labelInput),
            ui.field('Destino', ui.listInput('nodes', {
                value: current.next,
                placeholder: 'id_do_no',
                extra: context.nodeIds,
                onInput: function (value) {
                    current.next = value;
                    publish();
                },
            })),
        ]);

        var advanced = [
            ui.block('Visível só se…', [
                Forger.conditionEditor.render(current.visible_if, function (next) {
                    current.visible_if = next;
                    publish();
                }, context.suggestedPaths),
                ui.hint('Escondida quando falha: a opção não aparece de todo.'),
            ], { collapsible: true }),

            ui.block('Escolhível só se…', [
                Forger.conditionEditor.render(current.enabled_if, function (next) {
                    current.enabled_if = next;
                    publish();
                }, context.suggestedPaths),
                ui.hint('Quando falha, a opção aparece mas não pode ser escolhida.'),
            ], { collapsible: true }),

            ui.block('Motivo de estar bloqueada', [
                ui.text({
                    value: current.disabled_reason,
                    placeholder: 'Ex.: Ainda não confia em ti.',
                    onInput: function (value) {
                        current.disabled_reason = value;
                        publish();
                    },
                }),
            ], { collapsible: true }),

            ui.block('Efeitos antes de avançar', [
                Forger.effectEditor.render(current.effects_before, function (next) {
                    current.effects_before = next;
                    publish();
                }, context.settings),
            ], { collapsible: true }),
        ];

        return ui.row([main, ui.el('div', {}, advanced)], onRemove);
    }

    /** Ids currently used by a list of choices. */
    function idsOf(choices) {
        return (choices || []).map(function (choice) {
            return choice.choice_id;
        });
    }

    Forger.choiceEditor = {
        render: render,
    };
})(window.DialogueForger);
