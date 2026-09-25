/**
 * Condition editor.
 *
 * Conditions are a tree, so the editor is a tree too: a group has a mode
 * (`all` / `any`), an optional negation, and children that are either single
 * comparisons or nested groups. That covers everything the engine can evaluate
 * without exposing the raw structure.
 *
 * Every field keeps a mutable working copy and publishes a fresh object on each
 * change. The editor is not re-rendered while the user types — re-rendering
 * would destroy the focused input — so reading from a captured value instead of
 * the working copy would silently undo the previous field's edit.
 */
(function (Forger) {
    'use strict';

    var ui = Forger.ui;

    var OPERATORS = [
        { value: 'equals', label: '=' },
        { value: 'not_equals', label: '≠' },
        { value: 'greater_than', label: '>' },
        { value: 'greater_or_equal', label: '≥' },
        { value: 'less_than', label: '<' },
        { value: 'less_or_equal', label: '≤' },
    ];

    var MODES = [
        { value: 'all', label: 'todas (E)' },
        { value: 'any', label: 'alguma (OU)' },
    ];

    /** Renders a condition tree. A null value renders an empty group. */
    function render(value, onChange, suggestedPaths) {
        return renderNode(value, onChange, suggestedPaths || [], 0);
    }

    /** Renders whichever kind of node this is. */
    function renderNode(node, onChange, paths, depth) {
        return isLeaf(node)
            ? renderLeaf(node, onChange, paths)
            : renderGroup(node, onChange, paths, depth);
    }

    /** A comparison, as opposed to a group. */
    function isLeaf(node) {
        return !!node && typeof node.condition === 'string';
    }

    /** A single `path op value` comparison. */
    function renderLeaf(initial, onChange, paths) {
        var current = {
            condition: initial.condition,
            left: initial.left || '',
            right: initial.right,
        };

        function publish() {
            onChange({
                condition: current.condition,
                left: current.left,
                right: current.right,
            });
        }

        return ui.inline([
            ui.field('Caminho', ui.listInput('paths', {
                value: current.left,
                placeholder: 'flags.exemplo',
                extra: paths,
                onInput: function (value) {
                    current.left = value;
                    publish();
                },
            }), 'relação: personagem.tipo, ex.: relationship.pacci.friendship'),
            ui.field('Operador', ui.select({
                value: current.condition,
                options: OPERATORS,
                onChange: function (value) {
                    current.condition = value;
                    publish();
                },
            })),
            ui.field('Valor', ui.text({
                value: Forger.model.formatLiteral(current.right),
                placeholder: 'true',
                onInput: function (value) {
                    current.right = Forger.model.parseLiteral(value);
                    publish();
                },
            }), 'vazio = ausente'),
        ]);
    }

    /** A group of conditions, possibly negated. */
    function renderGroup(initial, onChange, paths, depth) {
        var source = initial || {};
        var negate = !!source.not;
        var inner = negate ? (source.not || {}) : source;
        var mode = Array.isArray(inner.any) ? 'any' : 'all';

        var current = {
            negate: negate,
            mode: mode,
            children: (Array.isArray(inner[mode]) ? inner[mode] : []).slice(),
        };

        function publish() {
            var built = {};
            built[current.mode] = current.children;

            onChange(current.negate ? { not: built } : built);
        }

        function replaceChild(index, next) {
            current.children = current.children.slice();
            current.children[index] = next;
            publish();
        }

        function removeChild(index) {
            current.children = current.children.slice();
            current.children.splice(index, 1);
            publish();
        }

        function addChild(child) {
            current.children = current.children.concat([child]);
            publish();
        }

        var rows = current.children.map(function (child, index) {
            return ui.row(
                [renderNode(child, function (next) {
                    replaceChild(index, next);
                }, paths, depth + 1)],
                function () {
                    removeChild(index);
                },
            );
        });

        if (rows.length === 0) {
            rows.push(ui.hint('Sem condições — o grupo passa sempre.'));
        }

        var controls = [
            ui.field('Grupo', ui.select({
                value: current.mode,
                options: MODES,
                onChange: function (value) {
                    current.mode = value;
                    publish();
                },
            })),
            ui.checkbox({
                checked: current.negate,
                label: 'negar',
                onChange: function (value) {
                    current.negate = value;
                    publish();
                },
            }),
        ];

        var adders = ui.el('div', { class: 'repeater-actions' }, [
            ui.button({
                label: '+ Condição',
                tiny: true,
                onClick: function () {
                    addChild({ condition: 'equals', left: paths[0] || 'flags.', right: true });
                },
            }),
            ui.button({
                label: '+ Grupo',
                tiny: true,
                onClick: function () {
                    addChild({ all: [{ condition: 'equals', left: paths[0] || 'flags.', right: true }] });
                },
            }),
        ]);

        // Beyond one level of nesting the indentation stops helping, so the
        // deeper levels are labelled rather than pushed further right.
        var body = depth >= 2
            ? [ui.hint('Nível ' + (depth + 1) + ' de aninhamento.'), ui.el('div', {}, rows)]
            : ui.el('div', {}, rows);

        return ui.el('div', {}, [
            ui.inline(controls),
            body,
            adders,
        ]);
    }

    Forger.conditionEditor = {
        OPERATORS: OPERATORS,
        render: render,
        isLeaf: isLeaf,
    };
})(window.DialogueForger);
