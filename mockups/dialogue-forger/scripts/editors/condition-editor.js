/**
 * Condition editor.
 *
 * Conditions are split into structured dropdowns so the writer picks each part
 * instead of typing a raw path. Every leaf is composed of:
 *
 *   root → key → (subKey for relationship) → operator → value
 *
 * For example:
 *   dialogue.seen = fala_47        → dialogue + seen + = + fala_47
 *   dialogue.not_seen = fala_47    → dialogue + seen + ≠ + fala_47
 *   relationship.pacci.friendship > 10
 *     → relationship + pacci + friendship + > + 10
 *   inventory.herb has             → inventory + herb + = true
 *   inventory.herb > 1             → inventory + herb + > + 1
 *
 * The available options adapt to what was chosen, keeping the writer inside
 * valid combinations. An inventory item defaults to a "has" (= true) check
 * and switches to a count comparison when the operator changes.
 */
(function (Forger) {
    'use strict';

    var ui = Forger.ui;

    // The operator and root tables are vocabularies, so they live in `lists.js`
    // with the rest of them; only the rules that read them stay here.
    var OPERATORS = Forger.lists.CONDITION_OPERATORS;
    var MODES = Forger.lists.CONDITION_MODES;
    var ROOTS = Forger.lists.CONDITION_ROOTS;
    var ROOT_KEYS = Forger.lists.CONDITION_ROOT_KEYS;
    var DIALOGUE_OPERATORS = Forger.lists.CONDITION_OPERATORS_DIALOGUE;
    var INVENTORY_HAS_OPERATORS = Forger.lists.CONDITION_OPERATORS_INVENTORY_HAS;
    var INVENTORY_COUNT_OPERATORS = Forger.lists.CONDITION_OPERATORS_INVENTORY_COUNT;
    var RELATIONSHIP_OPERATORS = Forger.lists.CONDITION_OPERATORS_RELATIONSHIP;

    var MODE_GROUPS = { all: 'all', notAll: 'all', any: 'any', notAny: 'any' };
    var MODE_NEGATED = { notAll: true, notAny: true };

    var EXAMPLES = 'ex.: dialogue.seen = fala_47 · relationship.pacci.friendship > 10 · inventory.herb = true (tem)';

    var ROOT_ALIASES = {
        dialogues: 'dialogue',
    };

    function normalizeRoot(root) {
        return ROOT_ALIASES[root] || root;
    }

    function operatorsFor(root) {
        if (root === 'dialogue') return DIALOGUE_OPERATORS;
        if (root === 'inventory') return INVENTORY_HAS_OPERATORS.concat(INVENTORY_COUNT_OPERATORS);
        if (root === 'relationship') return RELATIONSHIP_OPERATORS;
        if (root === 'skill' || root === 'element' || root === 'elements') return INVENTORY_HAS_OPERATORS;
        return OPERATORS;
    }

    function defaultOperatorFor(root) {
        if (root === 'dialogue') return 'equals';
        if (root === 'inventory') return 'equals';
        if (root === 'relationship') return 'greater_than';
        if (root === 'skill' || root === 'element' || root === 'elements') return 'equals';
        return 'equals';
    }

    function isBooleanContext(root) {
        return root === 'dialogue' || root === 'flags'
            || root === 'skill' || root === 'element' || root === 'elements';
    }

    function buildPath(root, key, subKey) {
        if (root === 'relationship') return 'relationship.' + key + '.' + subKey;
        return root + '.' + key;
    }

    function parsePath(left) {
        if (!left || typeof left !== 'string') return null;
        var parts = left.split('.');
        if (parts.length < 2) return null;
        var rawRoot = parts[0];
        var root = normalizeRoot(rawRoot);
        var key = parts[1];
        var subKey = parts.length > 2 ? parts[2] : null;
        return { root: root, key: key, subKey: subKey };
    }

    function render(value, onChange, suggestedPaths) {
        return renderNode(value, onChange, suggestedPaths || [], 0);
    }

    function renderNode(node, onChange, paths, depth) {
        return isLeaf(node)
            ? renderLeaf(node, onChange, paths)
            : renderGroup(node, onChange, paths, depth);
    }

    function isLeaf(node) {
        return !!node && typeof node.condition === 'string';
    }

    function readGroup(initial) {
        var source = initial || {};
        if (!source) return { mode: 'all', children: [] };

        var negated = !!source.not;
        var inner = negated ? (source.not || {}) : source;

        if (isLeaf(inner)) {
            return { mode: negated ? 'notAll' : 'all', children: [inner] };
        }

        var group = Array.isArray(inner.any) ? 'any' : 'all';
        var mode = negated ? (group === 'any' ? 'notAny' : 'notAll') : group;

        return {
            mode: mode,
            children: (Array.isArray(inner[group]) ? inner[group] : []).slice(),
        };
    }

    function renderLeaf(initial, onChange, paths) {
        var parsed = parsePath(initial.left);
        var root = parsed ? parsed.root : 'inventory';
        var key = parsed ? parsed.key : '';
        var subKey = parsed ? parsed.subKey : '';
        var right = initial.right !== undefined ? initial.right : true;

        var current = {
            condition: initial.condition || defaultOperatorFor(root),
            left: initial.left || '',
            right: right,
        };

        var container = ui.el('div', { class: 'condition-leaf' });

        // A key picked from a closed menu (a character, or the dialogue's
        // "Visto") changes the shape of what follows it, so it resets the
        // operator and rebuilds the leaf.
        function pickKey(value) {
            key = value;
            if (root === 'relationship') {
                subKey = Forger.model.DEFAULT_RELATIONSHIP_KIND;
            }
            current.condition = defaultOperatorFor(root);
            current.left = buildPath(root, key, subKey);
            rebuild();
            publish();
        }

        // A key typed into a free text box (an item, a flag) must not rebuild:
        // the box keeps the focus, and rebuilding after every keystroke would
        // make typing unusable. The operator already picked is left alone.
        function typeKey(value) {
            key = value;
            current.left = buildPath(root, key, subKey);
            publish();
        }

        // The key control follows the root: a character or a fixed entry is a
        // closed menu; anything else is a name the writer types - an item being
        // the one free-form key with a vocabulary of ids to suggest.
        function keyControl() {
            if (root === 'relationship') {
                return ui.select({
                    value: key,
                    options: Forger.catalogue.characters().map(function (c) {
                        return { value: c, label: c };
                    }),
                    onChange: pickKey,
                });
            }

            var predefined = ROOT_KEYS[root];
            if (predefined) {
                return ui.select({ value: key, options: predefined, onChange: pickKey });
            }

            if (root === 'inventory') {
                return ui.listInput('items', {
                    value: key,
                    placeholder: 'ex.: item_id',
                    extra: Forger.catalogue.items(),
                    onInput: typeKey,
                });
            }

            return ui.text({ value: key, placeholder: 'ex.: nome', onInput: typeKey });
        }

        function keyLabel(theRoot) {
            if (theRoot === 'relationship') return 'Personagem';
            if (theRoot === 'inventory') return 'Item';
            if (theRoot === 'input') return 'Variável';
            return 'Tipo';
        }

        // A relationship reads as five fields on one line and keeps them there.
        function inlineClass(theRoot) {
            return theRoot === 'relationship' ? 'inline-5' : undefined;
        }

        // The amount a comparison is measured against. Whether the player has
        // an item already answers a yes/no check on the item, so only a count
        // comparison needs a box to type into.
        function valueField(theRoot) {
            var isInventory = theRoot === 'inventory';

            return ui.field(isInventory ? 'Quantidade' : 'Valor', ui.text({
                value: Forger.model.formatLiteral(current.right),
                placeholder: isBooleanContext(theRoot) ? 'true' : '1',
                onInput: function (raw) {
                    current.right = Forger.model.parseLiteral(raw);
                    publish();
                },
            }), literalHint(theRoot));
        }

        function rebuild() {
            while (container.firstChild) {
                container.removeChild(container.firstChild);
            }

            var rootSelect = ui.select({
                value: root,
                options: ROOTS,
                onChange: function (value) {
                    root = value;
                    key = '';
                    subKey = '';
                    current.condition = defaultOperatorFor(root);
                    current.left = '';
                    current.right = true;
                    rebuild();
                    publish();
                },
            });

            var fields = [
                ui.field('Estado', rootSelect),
                ui.field(keyLabel(root), keyControl()),
            ];

            if (root === 'relationship') {
                fields.push(ui.field('Relação', ui.select({
                    value: subKey,
                    options: Forger.lists.RELATIONSHIP_KINDS.map(function (k) { return { value: k, label: k }; }),
                    onChange: function (value) {
                        subKey = value;
                        current.left = buildPath(root, key, subKey);
                        publish();
                    },
                })));
            }

            if (root !== 'dialogue') {
                fields.push(ui.field('Condição', ui.select({
                    value: current.condition,
                    options: operatorsFor(root),
                    onChange: function (value) {
                        current.condition = value;
                        if (root === 'inventory') {
                            if (value === 'equals') current.right = true;
                            else if (value === 'not_equals') current.right = false;
                            else if (typeof current.right !== 'number') current.right = 1;
                            // Rebuild so a count shows its quantity box and the
                            // "tem"/"nao tem" cases drop the box they never used.
                            rebuild();
                        }
                        publish();
                    },
                })));
            } else {
                current.condition = 'equals';
            }

            // An item's yes/no checks ("tem", "nao tem") are answered by the
            // item itself, so they carry no quantity box; a count comparison does.
            if (!(root === 'inventory'
                && (current.condition === 'equals' || current.condition === 'not_equals'))) {
                fields.push(valueField(root));
            }

            ui.append(container, ui.inline(fields, inlineClass(root)));
        }

        function publish() {
            onChange({
                condition: current.condition,
                left: current.left,
                right: current.right,
            });
        }

        function literalHint(root) {
            if (root === 'dialogue') return 'ex.: fala_47';
            if (root === 'inventory') return 'quantidade (ex.: 3)';
            if (root === 'input') return 'o valor guardado (ex.: Fogo, 3, true)';
            if (root === 'skill' || root === 'element' || root === 'elements')
                return 'true = tem · false = não tem';
            if (root === 'relationship') return 'número (ex.: 10)';
            return 'true / false / número';
        }

        rebuild();

        return container;
    }

    function renderGroup(initial, onChange, paths, depth) {
        var container = ui.el('div', {});
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

    function paintGroup(initial, onChange, paths, depth, rebuild) {
        var source = initial || {};
        var read = readGroup(source);

        var current = {
            mode: read.mode,
            children: read.children,
        };

        function publish() {
            var group = {};
            group[MODE_GROUPS[current.mode]] = current.children;
            onChange(MODE_NEGATED[current.mode] ? { not: group } : group);
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
            rows.push(ui.hint('Sem condições — o grupo passa sempre. ' + EXAMPLES));
        }

        var controls = current.children.length > 0
            ? [ui.field('Grupo', ui.select({
                value: current.mode,
                options: MODES,
                onChange: function (value) {
                    current.mode = value;
                    publish();
                },
            }))]
            : [];

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

        var body = ui.el('div', { class: 'condition-children' }, rows);

        return ui.el('div', {}, [
            ui.inline(controls),
            depth >= 2 ? [ui.hint('Nível ' + (depth + 1) + ' de aninhamento.'), body] : [body],
            adders,
        ]);
    }

    Forger.conditionEditor = {
        OPERATORS: OPERATORS,
        render: render,
        isLeaf: isLeaf,
    };
})(window.DialogueForger);
