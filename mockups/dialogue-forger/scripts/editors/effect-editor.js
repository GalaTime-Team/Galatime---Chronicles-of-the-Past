/**
 * Effect editor.
 *
 * The plan asks for "three inputs: type, target, value". Rather than showing all
 * possible fields and letting the writer ignore the irrelevant ones, each effect
 * type declares exactly the fields it needs, and the row renders only those.
 * That is the smallest number of inputs that can still express the effect.
 */
(function (Forger) {
    'use strict';

    var ui = Forger.ui;

    /** Per-type labels and the fields each type actually uses. */
    var EFFECTS = {
        set_flag: {
            label: 'Definir flag',
            fields: [
                { key: 'flag', label: 'Flag', kind: 'flag', placeholder: 'conheceu_pacci' },
                { key: 'value', label: 'Valor', kind: 'literal' },
            ],
        },
        add_relationship: {
            label: 'Relação',
            fields: [
                { key: 'character_id', label: 'Personagem', kind: 'character' },
                // The kind is required: `relationship.pacci` alone would not say
                // which affinity is meant.
                { key: 'relationship_kind', label: 'Tipo', kind: 'relationshipKind' },
                { key: 'value', label: 'Delta', kind: 'number' },
            ],
        },
        add: {
            label: 'Somar a stat',
            fields: [
                { key: 'target', label: 'Stat', kind: 'stat', placeholder: 'stats.suspeita' },
                { key: 'value', label: 'Delta', kind: 'number' },
            ],
        },
        add_item: {
            label: 'Dar item',
            fields: [
                { key: 'item_id', label: 'Item', kind: 'item' },
                { key: 'quantity', label: 'Qtd', kind: 'number', optional: true },
            ],
        },
        remove_item: {
            label: 'Tirar item',
            fields: [
                { key: 'item_id', label: 'Item', kind: 'item' },
                { key: 'quantity', label: 'Qtd', kind: 'number', optional: true },
            ],
        },
        unlock_objective: {
            label: 'Desbloquear objetivo',
            fields: [{ key: 'objective_id', label: 'Objetivo', kind: 'objective' }],
        },
        complete_objective: {
            label: 'Concluir objetivo',
            fields: [{ key: 'objective_id', label: 'Objetivo', kind: 'objective' }],
        },
        unlock_dialogue: {
            label: 'Desbloquear diálogo',
            fields: [{ key: 'dialogue_id', label: 'Diálogo', kind: 'dialogue' }],
        },
        unlock_path: {
            label: 'Desbloquear caminho',
            fields: [{ key: 'path_id', label: 'Caminho', kind: 'plain', placeholder: 'caminho_secreto' }],
        },
        play_music: {
            label: 'Tocar música',
            fields: [
                { key: 'music_id', label: 'Faixa', kind: 'plain', placeholder: 'floresta_misterio' },
                { key: 'loop', label: 'Repetir', kind: 'boolean', optional: true },
            ],
        },
    };

    var TYPE_OPTIONS = Object.keys(EFFECTS).map(function (type) {
        return { value: type, label: EFFECTS[type].label };
    });

    /** Renders an editable list of effects. */
    function render(effects, onChange, options) {
        var settings = options || {};
        var container = ui.el('div', {});

        // Structural changes (add, remove, change type) rebuild the list, which
        // is safe because no text field is focused while they happen.
        function rebuild(list) {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            ui.append(container, buildRows(list, rebuild, onChange, settings));
        }

        rebuild(effects || []);

        return container;
    }

    /** Builds one row per effect, plus the add button. */
    function buildRows(effects, rebuild, onChange, settings) {
        var nodes = [];

        if (effects.length === 0) {
            nodes.push(ui.hint('Sem efeitos.'));
        }

        effects.forEach(function (effect, index) {
            nodes.push(renderRow(effect, function (next) {
                var copy = effects.slice();
                copy[index] = next;

                // Publishing only: rebuilding the list here would destroy the very
                // input the writer is typing into, and every character would need
                // a fresh click to get the focus back. Adding, removing and
                // changing type are the changes that rebuild.
                onChange(copy);
            }, function () {
                var copy = effects.slice();
                copy.splice(index, 1);

                onChange(copy);
                rebuild(copy);
            }, settings));
        });

        nodes.push(ui.el('div', { class: 'repeater-actions' }, [
            ui.button({
                label: '+ Efeito',
                tiny: true,
                onClick: function () {
                    var copy = effects.concat([defaultEffect('set_flag')]);

                    onChange(copy);
                    rebuild(copy);
                },
            }),
        ]));

        return nodes;
    }

    /** One effect row: the type picker plus only that type's fields. */
    function renderRow(effect, onReplace, onRemove, settings) {
        var current = {};

        Object.keys(effect || {}).forEach(function (key) {
            current[key] = effect[key];
        });

        function publish() {
            // A JSON round-trip drops the `undefined` a cleared optional field
            // leaves behind, so the key disappears from the file entirely.
            onReplace(JSON.parse(JSON.stringify(current)));
        }

        var spec = EFFECTS[current.type] || EFFECTS.set_flag;

        var fields = spec.fields.map(function (field) {
            return renderField(field, current, publish, settings);
        });

        return ui.row([
            ui.inline([
                ui.field('Efeito', ui.select({
                    value: current.type,
                    options: TYPE_OPTIONS,
                    onChange: function (value) {
                        // A new type needs a different field set, so the row is
                        // replaced rather than patched.
                        onReplace(defaultEffect(value));
                    },
                })),
                fields,
            ]),
        ], onRemove);
    }

    /** Renders one field of an effect. */
    function renderField(field, current, publish, settings) {
        var value = current[field.key];

        switch (field.kind) {
            case 'number':
                return ui.field(field.label, ui.text({
                    value: value == null ? '' : String(value),
                    onInput: function (raw) {
                        if (raw === '') {
                            // An omitted optional number keeps the engine default.
                            current[field.key] = field.optional ? undefined : 0;
                        } else if (/^-?\d+(\.\d+)?$/.test(raw.trim())) {
                            current[field.key] = Number(raw);
                        } else {
                            // Keep the raw text so validation can point at it,
                            // instead of turning a typo into NaN.
                            current[field.key] = raw;
                        }

                        publish();
                    },
                }), field.optional ? 'opcional' : undefined);

            case 'literal':
                return ui.field(field.label, ui.text({
                    value: Forger.model.formatLiteral(value),
                    placeholder: 'true',
                    onInput: function (raw) {
                        current[field.key] = Forger.model.parseLiteral(raw);
                        publish();
                    },
                }), 'vazio = nulo');

            case 'boolean':
                return ui.field(field.label, ui.checkbox({
                    checked: value !== false,
                    label: 'sim',
                    onChange: function (next) {
                        current[field.key] = next;
                        publish();
                    },
                }));

            case 'character':
                return ui.field(field.label, ui.listInput('characters', {
                    value: value || '',
                    extra: settings.characters,
                    onInput: function (raw) {
                        current[field.key] = raw;
                        publish();
                    },
                }));

            // No `extra`: the kinds come from the shared suggestion list, so
            // there is one place to add one.
            case 'relationshipKind':
                return ui.field(field.label, ui.listInput('relationshipKinds', {
                    value: value || '',
                    placeholder: Forger.model.DEFAULT_RELATIONSHIP_KIND,
                    onInput: function (raw) {
                        current[field.key] = raw;
                        publish();
                    },
                }), 'ex.: friendship');

            case 'item':
                return ui.field(field.label, ui.listInput('items', {
                    value: value || '',
                    extra: settings.items,
                    onInput: function (raw) {
                        current[field.key] = raw;
                        publish();
                    },
                }));

            case 'dialogue':
                return ui.field(field.label, ui.listInput('dialogues', {
                    value: value || '',
                    extra: settings.dialogues,
                    onInput: function (raw) {
                        current[field.key] = raw;
                        publish();
                    },
                }));

            case 'objective':
                return ui.field(field.label, ui.listInput('objectives', {
                    value: value || '',
                    extra: settings.objectives,
                    onInput: function (raw) {
                        current[field.key] = raw;
                        publish();
                    },
                }));

            case 'stat':
                return ui.field(field.label, ui.listInput('stats', {
                    value: value || '',
                    placeholder: field.placeholder,
                    extra: settings.stats,
                    onInput: function (raw) {
                        current[field.key] = raw;
                        publish();
                    },
                }));

            case 'flag':
                return ui.field(field.label, ui.listInput('flags', {
                    value: value || '',
                    placeholder: field.placeholder,
                    extra: settings.flags,
                    onInput: function (raw) {
                        current[field.key] = raw;
                        publish();
                    },
                }));

            default:
                return ui.field(field.label, ui.text({
                    value: value == null ? '' : String(value),
                    placeholder: field.placeholder || '',
                    onInput: function (raw) {
                        current[field.key] = raw;
                        publish();
                    },
                }));
        }
    }

    /** A new effect of the given type, with usable starting values. */
    function defaultEffect(type) {
        switch (type) {
            case 'add_relationship':
                return {
                    type: type,
                    character_id: '',
                    relationship_kind: Forger.model.DEFAULT_RELATIONSHIP_KIND,
                    value: 1,
                };
            case 'add':
                return { type: type, target: 'stats.', value: 1 };
            case 'add_item':
                return { type: type, item_id: '', quantity: 1 };
            case 'remove_item':
                return { type: type, item_id: '', quantity: 1 };
            case 'unlock_objective':
                return { type: type, objective_id: '' };
            case 'complete_objective':
                return { type: type, objective_id: '' };
            case 'unlock_dialogue':
                return { type: type, dialogue_id: '' };
            case 'unlock_path':
                return { type: type, path_id: '' };
            case 'play_music':
                return { type: type, music_id: '', loop: true };
            default:
                return { type: type, flag: '', value: true };
        }
    }

    /**
     * The subset of the catalogue the effect fields need.
     *
     * Built here rather than by each caller, so the list of ids an effect may
     * reference stays next to the fields that read them.
     */
    function settings(lists) {
        var source = lists || {};

        return {
            characters: source.characters,
            items: source.items,
            dialogues: source.dialogues,
            objectives: source.objectives,
            stats: source.stats,
            flags: source.flags,
        };
    }

    Forger.effectEditor = {
        EFFECTS: EFFECTS,
        TYPE_OPTIONS: TYPE_OPTIONS,
        render: render,
        settings: settings,
        defaultEffect: defaultEffect,
    };
})(window.DialogueForger);
