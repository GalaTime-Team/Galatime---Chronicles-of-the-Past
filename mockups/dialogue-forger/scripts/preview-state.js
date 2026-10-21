/**
 * The test panel's initial state, written as one entry per line.
 *
 * The old panel asked for the YAML itself — six roots, the right nesting, a
 * count where a boolean was expected. It is the format the engine reads, but it
 * is a lot of ceremony for "the player has one box and likes Pacci".
 *
 * So the panel takes one entry per line instead: the state path, a dot, and the
 * value.
 *
 *   relationship.pacci.friendship.5
 *   inventory.caixa.1
 *   flags.conheceu_pacci.true
 *
 * The last segment is always the value and everything before it is the path,
 * which is why `relationship` — the only root three segments deep — needs its
 * kind spelled out: `relationship.pacci.friendship.5` names the affinity,
 * `relationship.pacci.5` does not and is refused rather than guessed.
 *
 * Values are read by the same rule as a condition's literal: `true`, `false`,
 * `null` and plain numbers become their real types, and anything else stays
 * text. That matters because comparisons are strict — `'2'` never equals `2`.
 *
 * A text that parses as YAML instead (an old draft, a block pasted from a file)
 * is still accepted, read by the YAML reader: nothing a writer already had stops
 * working, it just is not what the panel asks for any more.
 */
(function (Forger) {
    'use strict';

    var lists = Forger.lists;

    /**
     * Reads the panel's text into a state object.
     *
     * Never throws. `errors` carries one entry per line that could not be read,
     * with its 1-based number and the raw text, so the panel can point at the
     * line instead of blaming the whole box. A state with errors is still
     * returned — half of it may be fine — but the caller refuses to test with
     * one rather than silently testing against a state the writer did not mean.
     */
    function parse(text) {
        var source = String(text == null ? '' : text);
        var lines = source.split(/\r?\n/);
        var entries = [];
        var errors = [];
        var dotted = 0;

        lines.forEach(function (line, index) {
            var trimmed = line.trim();

            if (trimmed === '' || trimmed.charAt(0) === '#') {
                return;
            }

            dotted += 1;

            var entry = parseLine(trimmed);

            if (entry.error) {
                errors.push({ line: index + 1, message: entry.error, raw: trimmed });
                return;
            }

            entries.push(entry);
        });

        // Every line read as an entry: this is the format the panel asks for.
        if (errors.length === 0) {
            return {
                ok: true,
                state: buildState(entries),
                entries: entries,
                errors: [],
            };
        }

        // Nothing read — and nothing dotted to begin with — so this is either
        // empty or something else entirely. An empty panel is a valid empty
        // state, not a mistake.
        if (dotted === 0) {
            return { ok: true, state: {}, entries: [], errors: [] };
        }

        // A YAML block pasted from an old draft or a file: accept it, because
        // refusing it would throw away work the writer can see on screen.
        var yaml = Forger.yaml.parse(source);

        if (yaml.ok && yaml.value && typeof yaml.value === 'object' && !Array.isArray(yaml.value)) {
            return {
                ok: true,
                state: yaml.value,
                entries: [],
                errors: [],
                legacy: true,
            };
        }

        return { ok: false, state: buildState(entries), entries: entries, errors: errors };
    }

    /** One line: the path, then the value. */
    function parseLine(line) {
        var parts = line.split('.');

        if (parts.length < 3) {
            return { error: tooFewSegments() };
        }

        var root = parts[0];
        var depth = lists.STATE_ROOTS[root];

        if (!depth) {
            return { error: unknownRoot(root) };
        }

        if (parts.length !== depth + 2) {
            return { error: wrongDepth(root, depth) };
        }

        var path = parts.slice(0, depth + 1).join('.');
        var value = Forger.model.parseLiteral(parts[depth + 1]);
        var key = parts[1];
        var listKeys = lists.STATE_LIST_KEYS[root];

        if (listKeys) {
            if (listKeys.indexOf(key) === -1) {
                return { error: '"' + root + '" guarda listas: usa ' + listKeys.join(' ou ') + '.' };
            }

            return { path: path, value: value, list: true, raw: line };
        }

        return { path: path, value: value, list: false, raw: line };
    }

    /** Turns the entries into the nested object the engine reads. */
    function buildState(entries) {
        var state = {};

        entries.forEach(function (entry) {
            if (entry.list) {
                addMember(state, entry.path, entry.value);
                return;
            }

            setValue(state, entry.path, entry.value);
        });

        return state;
    }

    /** Writes a value at a dotted path, creating the levels it names. */
    function setValue(state, path, value) {
        var parts = path.split('.');
        var node = state;

        for (var i = 0; i < parts.length - 1; i += 1) {
            if (!node[parts[i]] || typeof node[parts[i]] !== 'object') {
                node[parts[i]] = {};
            }

            node = node[parts[i]];
        }

        node[parts[parts.length - 1]] = value;
    }

    /** Adds a member to the list at a dotted path, without repeating it. */
    function addMember(state, path, value) {
        var parts = path.split('.');
        var node = state;

        for (var i = 0; i < parts.length - 1; i += 1) {
            if (!node[parts[i]] || typeof node[parts[i]] !== 'object') {
                node[parts[i]] = {};
            }

            node = node[parts[i]];
        }

        var key = parts[parts.length - 1];

        if (!Array.isArray(node[key])) {
            node[key] = [];
        }

        if (node[key].indexOf(value) === -1) {
            node[key].push(value);
        }
    }

    function tooFewSegments() {
        return 'Cada linha precisa de caminho e valor, ex.: flags.conheceu_pacci.true.';
    }

    function unknownRoot(root) {
        return 'Não sei ler "' + root + '": usa um de '
            + Object.keys(lists.STATE_ROOTS).join(', ') + '.';
    }

    /** Why a line's path is the wrong shape, with an example of the right one. */
    function wrongDepth(root, depth) {
        var names = depth === 1 ? '1 nome' : depth + ' nomes';

        return '"' + root + '" precisa de ' + names
            + ' antes do valor, ex.: ' + exampleFor(root) + '.';
    }

    /** An example line for a root, from the shared table. */
    function exampleFor(root) {
        var prefix = root + '.';

        for (var i = 0; i < lists.STATE_EXAMPLES.length; i += 1) {
            if (lists.STATE_EXAMPLES[i].indexOf(prefix) === 0) {
                return lists.STATE_EXAMPLES[i];
            }
        }

        return root + '.nome.valor';
    }

    Forger.previewState = {
        EXAMPLES: lists.STATE_EXAMPLES.slice(),
        parse: parse,
    };
})(window.DialogueForger);
