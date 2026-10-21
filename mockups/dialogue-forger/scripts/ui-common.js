/**
 * DOM helpers.
 *
 * Small builders so the editors read as structure rather than as
 * `createElement` noise. Everything returns a detached node; the caller decides
 * where it goes.
 *
 * Free-form suggestions use `datalist`s so ids and forward node references can
 * still be typed. `characterSelect` follows the same rule over the built-in
 * character list: those ids are suggestions, not a gate, so an id the tool does
 * not know can still be written by hand.
 */
(function (Forger) {
    'use strict';

    /** One datalist per kind, refreshed in place so re-renders do not leak. */
    var lists = {};

    /** Every tooltip gets its own id, so `aria-describedby` never says more than it means. */
    var infoCount = 0;

    /**
     * Values offered for the free-text fields that have a natural vocabulary.
     *
     * The whole table lives in `lists.js`, next to the vocabularies it draws
     * from, so adding a value is one edit in one file.
     */
    var SUGGESTIONS = Forger.lists.SUGGESTIONS;

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

    /**
     * Keeps a tooltip on screen.
     *
     * Below its "i", opening rightwards, is the default — that is where the
     * reader's eye already is. A tooltip that would fall past the bottom of the
     * window opens above instead, and one past the right edge opens leftwards:
     * a field near the right of a three-column row would otherwise push its
     * explanation off screen. A flip only happens when it actually helps — one
     * too tall for the room above stays below it.
     *
     * Whichever side it opens on, the box never grows past it: a list too long
     * for the window scrolls inside itself rather than falling off it.
     *
     * Measured in a frame, so the hover style that reveals the popover has
     * already been applied, and only while it is actually open — `offsetParent`
     * is null while it is hidden. The bar is always measured from the default
     * spot, so where the popover already sits never decides where it goes next.
     */
    function flipPopover(help) {
        if (!help) {
            return;
        }

        window.requestAnimationFrame(function () {
            var popover = help.querySelector('.info-popover, .syntax-popover');

            if (!popover || !popover.offsetParent) {
                return;
            }

            popover.classList.remove('is-above', 'is-right');

            var margin = 8;
            var anchor = help.getBoundingClientRect();
            var box = popover.getBoundingClientRect();

            var above = anchor.top - 7 - box.height >= margin
                && anchor.bottom + 7 + box.height > window.innerHeight - margin;

            popover.classList.toggle('is-above', above);
            popover.classList.toggle('is-right',
                anchor.left + box.width > window.innerWidth - margin
                && anchor.right - box.width >= margin);

            var room = above
                ? anchor.top - 7 - margin
                : window.innerHeight - margin - (anchor.bottom + 7);

            popover.style.maxHeight = Math.max(160, room) + 'px';
        });
    }

    // Both events bubble, unlike `mouseenter`, so one pair of listeners covers
    // every "i" on the page however many the editors have painted.
    document.addEventListener('mouseover', function (event) {
        flipPopover(event.target && event.target.closest
            ? event.target.closest('.info-help, .syntax-help')
            : null);
    });

    document.addEventListener('focusin', function (event) {
        flipPopover(event.target && event.target.closest
            ? event.target.closest('.info-help, .syntax-help')
            : null);
    });

    // A window resized under an open tooltip moves the edge it was measured
    // against, so an open one is measured again — it is the same promise the
    // hover makes, kept after the fact.
    window.addEventListener('resize', function () {
        document.querySelectorAll('.info-help, .syntax-help').forEach(function (help) {
            var popover = help.querySelector('.info-popover, .syntax-popover');

            if (popover && popover.offsetParent) {
                flipPopover(help);
            }
        });
    });

    /**
     * An "i" that explains a control without sitting under it.
     *
     * The explanation is written once and offered on hover or focus, so the
     * panels stay readable for someone who already knows the format and still
     * answer the first-time question in place. Replaces the long helper
     * paragraphs that used to be printed under every heading and field.
     *
     * `body` is a string, an array of paragraphs, or an already-built node for
     * a tooltip with structure of its own.
     */
    function info(options) {
        infoCount += 1;

        var tooltipId = 'forger-info-' + infoCount;
        var title = options.title || options.label || 'Mais informação';
        var body = options.body instanceof window.Node
            ? options.body
            : el('div', { class: 'info-body' }, (Array.isArray(options.body) ? options.body : [options.body || ''])
                .filter(function (line) {
                    return line;
                })
                .map(function (line) {
                    return el('p', { text: line });
                }));

        return el('span', { class: 'info-help' }, [
            el('button', {
                type: 'button',
                class: 'info-button',
                'aria-label': options.label || title,
                'aria-describedby': tooltipId,
                title: title,
                text: 'i',
            }),
            el('div', { id: tooltipId, class: 'info-popover', role: 'tooltip' }, [
                el('h4', { text: title }),
                body,
            ]),
        ]);
    }

    /**
     * A labelled control.
     *
     * `hint` may be a string or an already-built node. A string becomes the
     * field's "i" tooltip, so the reading order stays label → control. A node is
     * appended as given: the condition editor hands over a hint that rewrites
     * itself while the writer types, and a tooltip that only opens on hover
     * could not follow along.
     *
     * `options.required` marks it with the same `*` the identity panel shows,
     * via `markRequired` so both paths look identical.
     */
    function field(label, control, hint, options) {
        var hintNode = hint instanceof window.Node
            ? hint
            : (typeof hint === 'string' && hint
                ? info({ label: 'Sobre «' + label + '»', title: label, body: hint })
                : null);

        var node = el('label', { class: 'field' }, [
            el('div', { class: 'field-label-row' }, [
                el('span', { class: 'field-label', text: label }),
                hintNode,
            ]),
            control,
        ]);

        return options && options.required ? markRequired(node) : node;
    }

    /**
     * Marks an already-built `.field` as required.
     *
     * The `*` is decorative (`aria-hidden`, exactly like the static identity
     * fields); the control itself gets `aria-required`, so the marker still
     * means something to a screen reader.
     */
    function markRequired(node) {
        var label = node.querySelector('.field-label');
        var control = node.querySelector('.input');

        if (label && !label.querySelector('b')) {
            // The space mirrors the static `ID do diálogo <b>` in index.html.
            append(label, ' ');
            label.appendChild(el('b', { 'aria-hidden': 'true', text: '*' }));
        }

        if (control) {
            control.setAttribute('aria-required', 'true');
        }

        return node;
    }

    /** A wrapping flex row of fields. */
    function inline(children, extraClass) {
        return el('div', { class: 'inline' + (extraClass ? ' ' + extraClass : '') }, children);
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
     * Fills a dropdown, keeping a value it does not offer as a marked entry.
     *
     * So the control shows what the file actually says instead of silently
     * jumping to the first option. Shared with the callers that repopulate a
     * dropdown in place, so that rule is spelled the same way everywhere.
     */
    function fillSelect(node, options, current) {
        var values = options.map(function (choice) {
            return typeof choice === 'string' ? choice : choice.value;
        });

        node.textContent = '';

        if (current && values.indexOf(current) === -1) {
            node.appendChild(el('option', {
                value: current,
                text: current + ' (desconhecido)',
            }));
        }

        options.forEach(function (choice) {
            node.appendChild(el('option', {
                value: typeof choice === 'string' ? choice : choice.value,
                text: typeof choice === 'string' ? choice : choice.label,
            }));
        });

        node.value = current || '';

        return node;
    }

    /**
     * A dropdown.
     *
     * When the current value is not among the options it is added as a marked
     * entry, so the control shows what the file actually says instead of
     * silently jumping to the first option.
     */
    function select(options) {
        return fillSelect(
            el('select', {
                class: 'input',
                on: {
                    change: function (event) {
                        options.onChange(event.target.value);
                    },
                },
            }),
            options.options || [],
            options.value == null ? '' : options.value,
        );
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

    /**
     * A titled section of the node editor.
     *
     * Visible by default: the sections are how a node explains its own shape.
     * `options.collapsible` folds a section away — used for the parts a writer
     * opens rarely, like effects — and `options.open` leaves one of those open
     * when it already has something in it.
     */
    function section(title, children, options) {
        var settings = options || {};
        var body = el('div', { class: 'node-section-body' }, children);

        if (!settings.collapsible) {
            return el('section', { class: 'node-section' }, [
                el('h3', { class: 'node-section-title', text: title }),
                body,
            ]);
        }

        var details = el('details', { class: 'node-section' });

        if (settings.open) {
            details.setAttribute('open', 'open');
        }

        details.appendChild(el('summary', { class: 'node-section-title', text: title }));
        details.appendChild(body);

        return details;
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

    /**
     * A character picker over the built-in ids that still accepts free typing.
     *
     * The built-in list arrives as datalist suggestions rather than as a closed
     * `<select>`, so a character created outside the tool can be written by
     * hand; the validator is what flags an id it does not recognise, not the
     * control.
     */
    function characterSelect(options) {
        var node = listInput('characters', {
            value: options.value,
            placeholder: 'ex.: pacci',
            extra: Forger.catalogue.characters(),
            onInput: options.onChange,
        });
        node.classList.add('character-select');

        return node;
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
        markRequired: markRequired,
        info: info,
        section: section,
        inline: inline,
        text: text,
        textarea: textarea,
        checkbox: checkbox,
        select: select,
        fillSelect: fillSelect,
        button: button,
        row: row,
        block: block,
        listInput: listInput,
        characterSelect: characterSelect,
        hint: hint,
        notice: notice,
    };
})(window.DialogueForger);
