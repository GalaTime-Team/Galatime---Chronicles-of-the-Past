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
 * the working copy would silently undo the previous field's edit. For the same
 * reason the operator dropdown is repopulated in place rather than rebuilt.
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

    /** Só estas comparações fazem sentido contra um literal que não é número. */
    var EQUALITY_ONLY = ['equals', 'not_equals'];

    /**
     * Os operadores que dizem algo contra o valor escolhido.
     *
     * Um `>` contra `true` é ruído: o motor compara números e um literal
     * booleano nunca chega a essa comparação. Esconder as opções que não têm
     * efeito deixa a linha mais curta e o operador legível sem acrescentar
     * nenhum campo — a lista encolhe sozinha conforme o valor muda.
     *
     * Só o que se pode escolher a partir daqui. Um operador que o ficheiro já
     * traz continua listado, marcado como desconhecido, para a comparação não
     * desaparecer em silêncio enquanto se escreve o valor.
     */
    function operatorsFor(right) {
        if (typeof right === 'boolean' || typeof right === 'string') {
            return OPERATORS.filter(function (operator) {
                return EQUALITY_ONLY.indexOf(operator.value) !== -1;
            });
        }

        return OPERATORS;
    }

    /**
 * As duas formas em que um ramo se escreve.
     *
     * Aparece só num grupo ainda vazio. Ter um item e ter uma afinidade são as
     * únicas coisas que um ramo pergunta normalmente, e a grafia de cada uma é a
     * parte que dá para errar — mas repetida em cada ramo de cada nó deixa de
     * ajudar e passa a ser ruído.
     */
    var EXAMPLES = 'ex.: inventory.<item> = true (tem) · = false (não tem)'
        + ' · relationship.<personagem>.<tipo> > 10';

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

        var operatorSelect = ui.select({
            value: current.condition,
            options: operatorsFor(current.right),
            onChange: function (value) {
                current.condition = value;
                publish();
            },
        });

        var hint = ui.el('span', { class: 'field-hint', text: literalHint(current.right) });

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
                placeholder: 'inventory.caixa',
                extra: paths,
                onInput: function (value) {
                    current.left = value;
                    publish();
                },
            }), 'ex.: flags.escolheu_a_mão · relationship.pacci.friendship', { required: true }),
            ui.field('Operador', operatorSelect),
            // One text field for every literal type: a number, a word and `true`
            // all have to be writable here, so the control stays and the
            // suggestions do the work instead. `true`/`false` are offered because
            // they are the two words that answer "does the player have this?".
            ui.field('Valor', ui.listInput('literals', {
                value: Forger.model.formatLiteral(current.right),
                placeholder: 'true',
                onInput: function (value) {
                    current.right = Forger.model.parseLiteral(value);

                    // The offered operators and the hint follow the literal's
                    // shape. Repopulated in place rather than by re-rendering the
                    // row, because the writer's cursor is in this field and
                    // replacing it would throw them out of what they were typing.
                    //
                    // The operator already in the file is never overwritten: if it
                    // is not one of the meaningful ones it stays listed as
                    // unknown, and the validator says why it cannot pass. Quietly
                    // rewriting a comparison the writer did choose would hide a
                    // mistake instead of surfacing it.
                    ui.fillSelect(operatorSelect, operatorsFor(current.right), current.condition);
                    hint.textContent = literalHint(current.right);

                    publish();
                },
            }), hint),
        ]);
    }

    /** Says what the current literal can be, in place of a type error later. */
    function literalHint(right) {
        if (typeof right === 'boolean') {
            return 'sim = tem · não = não tem';
        }

        if (typeof right === 'string') {
            return 'texto exato';
        }

        return typeof right === 'number' ? 'número' : 'vazio = ausente';
    }

    /**
     * A group of conditions, possibly negated.
     *
     * The group owns a container it can repaint. Adding or removing a child
     * changes how many rows exist, and publishing alone left the old rows on
     * screen while the model had already moved on — the writer had to reload
     * the page to see the condition go. Structural changes therefore repaint
     * this group from the tree it just published; typing does not repaint,
     * because replacing the input under the cursor would steal the focus.
     */
    function renderGroup(initial, onChange, paths, depth) {
        var container = ui.el('div', {});

        // What this group currently holds. Repainting reads from here, so every
        // publish keeps it in step with what the caller stored.
        var latest = initial || null;

        function publish(built) {
            latest = built;
            onChange(built);
        }

        function rebuild() {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            ui.append(container, paintGroup(latest, publish, paths, depth, rebuild));
        }

        rebuild();

        return container;
    }

    /** The group's controls, children and adders. Painted by `renderGroup`. */
    function paintGroup(initial, onChange, paths, depth, rebuild) {
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

        // A removal or an addition changes the number of rows, so the group is
        // repainted after the publish: the fresh rows come from the tree the
        // caller now holds, empty-state hint included when the last one goes.
        function removeChild(index) {
            current.children = current.children.slice();
            current.children.splice(index, 1);
            publish();
            rebuild();
        }

        function addChild(child) {
            current.children = current.children.concat([child]);
            publish();
            rebuild();
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
            // Doubles as the empty-state note: a group with nothing in it always
            // passes, and this is where somebody writing their first condition
            // learns the two shapes a branch is written in.
            rows.push(ui.hint('Sem condições — o grupo passa sempre. ' + EXAMPLES));
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

        // The path is left for the writer to choose. Pre-filling the first
        // suggestion used to drop an unrelated state path into the file — and
        // because it was a valid path, nothing reported it — so the condition
        // silently tested something nobody asked about. An empty path is
        // reported instead, which is the truth about an unfinished condition.
        // A fresh object per click, so two new conditions cannot share one.
        function newLeaf() {
            return { condition: 'equals', left: '', right: true };
        }

        var adders = ui.el('div', { class: 'repeater-actions' }, [
            ui.button({
                label: '+ Condição',
                tiny: true,
                onClick: function () {
                    addChild(newLeaf());
                },
            }),
            ui.button({
                label: '+ Grupo',
                tiny: true,
                onClick: function () {
                    addChild({ all: [newLeaf()] });
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
