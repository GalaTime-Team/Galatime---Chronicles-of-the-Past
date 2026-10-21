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

    /**
     * Every effect a node may carry, with the fields each one needs.
     *
     * The catalogue lives in `lists.js`, next to the vocabularies its fields
     * draw from, so a new effect type is one entry there and nothing here.
     */
    var EFFECTS = Forger.lists.EFFECTS;

    var TYPE_OPTIONS = Object.keys(EFFECTS).map(function (type) {
        return { value: type, label: EFFECTS[type].label };
    });

    function render(effects, onChange, options) {
        var settings = options || {};
        var container = ui.el('div', {});

        function rebuild(list) {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }
            ui.append(container, buildRows(list, rebuild, onChange, settings));
        }

        rebuild(effects || []);

        return container;
    }

    function buildRows(effects, rebuild, onChange, settings) {
        var nodes = [];

        if (effects.length === 0) {
            nodes.push(ui.hint('Sem efeitos.'));
        }

        effects.forEach(function (effect, index) {
            nodes.push(renderRow(effect, function (next) {
                var copy = effects.slice();
                copy[index] = next;
                onChange(copy);
            }, function () {
                var copy = effects.slice();
                copy.splice(index, 1);
                onChange(copy);
                rebuild(copy);
            }, function (next) {
                var copy = effects.slice();
                copy[index] = next;
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

    function renderRow(effect, onReplace, onRemove, onRetype, settings) {
        var current = {};

        Object.keys(effect || {}).forEach(function (key) {
            current[key] = effect[key];
        });

        function publish() {
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
                        onRetype(defaultEffect(value));
                    },
                })),
                fields,
            ], 'inline-effect'),
        ], onRemove);
    }

    function renderField(field, current, publish, settings) {
        var node = buildField(field, current, publish, settings);

        return field.optional ? node : ui.markRequired(node);
    }

    function buildField(field, current, publish, settings) {
        var value = current[field.key];

        switch (field.kind) {
            case 'number':
                return ui.field(field.label, ui.text({
                    value: value == null ? '' : String(value),
                    onInput: function (raw) {
                        if (raw === '') {
                            current[field.key] = field.optional ? undefined : 0;
                        } else if (/^-?\d+(\.\d+)?$/.test(raw.trim())) {
                            current[field.key] = Number(raw);
                        } else {
                            current[field.key] = raw;
                        }
                        publish();
                    },
                }), field.optional ? 'opcional' : undefined);

            case 'positiveNumber':
                return ui.field(field.label, ui.text({
                    value: value == null ? '' : String(value),
                    onInput: function (raw) {
                        if (raw === '') {
                            current[field.key] = 1;
                        } else if (/^\d+$/.test(raw.trim()) && Number(raw) >= 1) {
                            current[field.key] = Number(raw);
                        } else {
                            current[field.key] = raw;
                        }
                        publish();
                    },
                }), 'mínimo 1');

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
                return ui.field(field.label, ui.characterSelect({
                    value: value || '',
                    onChange: function (selected) {
                        current[field.key] = selected;
                        publish();
                    },
                }));

            case 'relationshipKind':
                return ui.field(field.label, ui.listInput('relationshipKinds', {
                    value: value || '',
                    placeholder: Forger.model.DEFAULT_RELATIONSHIP_KIND,
                    onInput: function (raw) {
                        current[field.key] = raw;
                        publish();
                    },
                }), 'ex.: friendship');

            case 'direction':
                return ui.field(field.label, ui.select({
                    value: value || 'increase',
                    options: [
                        { value: 'increase', label: 'Aumentar' },
                        { value: 'decrease', label: 'Diminuir' },
                    ],
                    onChange: function (selected) {
                        current[field.key] = selected;
                        publish();
                    },
                }));

            case 'item':
                return ui.field(field.label, ui.listInput('items', {
                    value: value || '',
                    placeholder: 'ex.: item_id',
                    extra: settings.items,
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

    function defaultEffect(type) {
        switch (type) {
            case 'add_relationship':
                return {
                    type: type,
                    character_id: '',
                    relationship_kind: Forger.model.DEFAULT_RELATIONSHIP_KIND,
                    direction: 'increase',
                    value: 1,
                };
            case 'add_item':
                return { type: type, item_id: '', quantity: 1 };
            case 'remove_item':
                return { type: type, item_id: '', quantity: 1 };
            case 'play_music':
                return { type: type, music_id: '', loop: true };
            default:
                return { type: type, flag: '', value: true };
        }
    }

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
