/**
 * DOM helpers.
 *
 * Small builders so the editors read as structure rather than as
 * `createElement` noise. Everything returns a detached node; the caller decides
 * where it goes.
 *
 * Suggestion lists are `datalist`s rather than `<select>`s on purpose: an id the
 * catalogue does not know about can still be typed, which matches the engine,
 * where an unknown character or a forward reference to a node is a warning and
 * not a failure.
 */
(function (Forger) {
    'use strict';

    /** One datalist per kind, refreshed in place so re-renders do not leak. */
    var lists = {};

    /** Values offered for the free-text fields that have a natural vocabulary. */
    var SUGGESTIONS = {
        // The sprite a line (or a choice question) asks for. The game matches
        // these against the character's own art, so the list is a hint rather
        // than a gate — a name it does not know falls back to neutral.
        emotions: [
            'neutral', 'surprised', 'stressed', 'happy', 'annoyed',
            'afraid', 'frustrated', 'suspicious', 'thinking', 'unsure', 'angry',
        ],
        // How a `character_enter` places someone. A position is an ordering hint,
        // not a coordinate: the stage lays itself out from the cast size.
        positions: ['left', 'center_left', 'center', 'center_right', 'right'],
        directions: ['left', 'right'],
        results: ['good', 'neutral', 'bad'],
        flags: ['flags.'],
        stats: ['stats.'],
        objectives: ['objectives.'],
        // The kinds of affinity a relationship path may name. `relationship.` is
        // deliberately absent: on its own it is not a path — the character and
        // the kind are both required — and a half-written path in the menu is
        // worse than none at all.
        relationshipKinds: Forger.model.RELATIONSHIP_KINDS.slice(),
        paths: [
            'flags.', 'inventory.', 'stats.', 'objectives.',
            'time.hour', 'dialogues.seen', 'paths.unlocked',
        ],
    };

    /** Creates an element. `on` takes an object of event handlers. */
    function el(tag, props, children) {
        var node = document.createElement(tag);

        Object.keys(props || {}).forEach(function (key) {
            var value = props[key];

            if (value === undefined || value === null) {
                return;
            }

            if (key === 'class') {
                node.className = value;
            } else if (key === 'text') {
                node.textContent = value;
            } else if (key === 'on') {
                Object.keys(value).forEach(function (eventName) {
                    node.addEventListener(eventName, value[eventName]);
                });
            } else if (key === 'value' || key === 'checked') {
                node[key] = value;
            } else if (value === false) {
                // A boolean attribute is on when present, so `false` must mean
                // absent rather than `disabled="false"`.
                return;
            } else {
                node.setAttribute(key, value);
            }
        });

        append(node, children);

        return node;
    }

    /** Appends children, flattening arrays and skipping empty entries. */
    function append(parent, children) {
        if (children === undefined || children === null || children === false) {
            return;
        }

        if (Array.isArray(children)) {
            children.forEach(function (child) {
                append(parent, child);
            });
            return;
        }

        if (children instanceof window.Node) {
            parent.appendChild(children);
            return;
        }

        parent.appendChild(document.createTextNode(String(children)));
    }

    /** A labelled control. */
    function field(label, control, hint) {
        return el('label', { class: 'field' }, [
            el('span', { class: 'field-label', text: label }),
            control,
            hint ? el('span', { class: 'field-hint', text: hint }) : null,
        ]);
    }

    /** A wrapping flex row of fields. */
    function inline(children) {
        return el('div', { class: 'inline' }, children);
    }

    /**
     * A single-line text input.
     *
     * `onCommit` is for fields where every keystroke must not act — renaming a
     * scene key, for instance — so the change is applied on blur or Enter.
     */
    function text(options) {
        var handlers = {};

        if (options.onInput) {
            handlers.input = function (event) {
                options.onInput(event.target.value);
            };
        }

        if (options.onCommit) {
            handlers.change = function (event) {
                options.onCommit(event.target.value);
            };
        }

        return el('input', {
            type: 'text',
            class: 'input',
            value: options.value == null ? '' : options.value,
            placeholder: options.placeholder || '',
            list: options.list || null,
            on: handlers,
        });
    }

    /** A multi-line text input. */
    function textarea(options) {
        var node = el('textarea', {
            class: 'input',
            rows: options.rows || 4,
            placeholder: options.placeholder || '',
            on: {
                input: function (event) {
                    options.onInput(event.target.value);
                },
            },
        });

        node.value = options.value == null ? '' : options.value;

        return node;
    }

    /** A checkbox with an inline label. */
    function checkbox(options) {
        return el('label', { class: 'checkbox' }, [
            el('input', {
                type: 'checkbox',
                checked: !!options.checked,
                on: {
                    change: function (event) {
                        options.onChange(event.target.checked);
                    },
                },
            }),
            el('span', { text: options.label || '' }),
        ]);
    }

    /**
     * A dropdown.
     *
     * When the current value is not among the options it is added as a marked
     * entry, so the control shows what the file actually says instead of
     * silently jumping to the first option.
     */
    function select(options) {
        var choices = options.options || [];
        var values = choices.map(function (choice) {
            return typeof choice === 'string' ? choice : choice.value;
        });

        var node = el('select', {
            class: 'input',
            on: {
                change: function (event) {
                    options.onChange(event.target.value);
                },
            },
        });

        var current = options.value == null ? '' : options.value;

        if (current && values.indexOf(current) === -1) {
            node.appendChild(el('option', {
                value: current,
                text: current + ' (desconhecido)',
            }));
        }

        choices.forEach(function (choice) {
            node.appendChild(el('option', {
                value: typeof choice === 'string' ? choice : choice.value,
                text: typeof choice === 'string' ? choice : choice.label,
            }));
        });

        node.value = current;

        return node;
    }

    /** A button. */
    function button(options) {
        return el('button', {
            type: 'button',
            class: 'btn'
                + (options.variant ? ' btn-' + options.variant : '')
                + (options.tiny ? ' btn-tiny' : ''),
            title: options.title || '',
            text: options.label,
            on: { click: options.onClick },
        });
    }

    /** A removable row. */
    function row(children, onRemove) {
        return el('div', { class: 'row' }, [
            el('div', { class: 'row-body' }, children),
            onRemove
                ? button({
                    label: '×',
                    title: 'Remover',
                    variant: 'danger',
                    tiny: true,
                    onClick: onRemove,
                })
                : null,
        ]);
    }

    /** A titled section, optionally collapsible and collapsed by default. */
    function block(title, children, options) {
        var settings = options || {};

        if (settings.collapsible) {
            var details = el('details', { class: 'block' });

            if (settings.open) {
                details.setAttribute('open', 'open');
            }

            details.appendChild(el('summary', { text: title }));
            details.appendChild(el('div', {}, children));

            return details;
        }

        return el('div', { class: 'block' }, [
            el('h3', { text: title }),
            el('div', {}, children),
        ]);
    }

    /** A text input backed by a shared suggestion list. */
    function listInput(kind, options) {
        var values = (SUGGESTIONS[kind] || []).concat(options.extra || []);
        var listId = ensureList(kind, values);

        return text({
            value: options.value,
            placeholder: options.placeholder,
            list: listId,
            onInput: options.onInput,
        });
    }

    /** Creates or refreshes the datalist for a kind, returning its id. */
    function ensureList(kind, values) {
        var listId = 'forger-dl-' + kind;

        if (!lists[kind]) {
            lists[kind] = el('datalist', { id: listId });
            document.body.appendChild(lists[kind]);
        }

        var list = lists[kind];

        while (list.firstChild) {
            list.removeChild(list.firstChild);
        }

        values.forEach(function (value) {
            list.appendChild(el('option', { value: value }));
        });

        return listId;
    }

    /** A short explanatory paragraph. */
    function hint(message) {
        return el('p', { class: 'muted small', text: message });
    }

    /** A coloured banner. */
    function notice(kind, message) {
        return el('div', { class: 'banner', style: 'border-color: var(--' + kind + '); color: var(--' + kind + ');', text: message });
    }

    Forger.ui = {
        SUGGESTIONS: SUGGESTIONS,
        el: el,
        append: append,
        field: field,
        inline: inline,
        text: text,
        textarea: textarea,
        checkbox: checkbox,
        select: select,
        button: button,
        row: row,
        block: block,
        listInput: listInput,
        hint: hint,
        notice: notice,
    };
})(window.DialogueForger);
