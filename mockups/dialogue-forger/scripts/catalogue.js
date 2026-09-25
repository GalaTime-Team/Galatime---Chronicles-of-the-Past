/**
 * The external catalogue.
 *
 * The plan is explicit that a dialogue only ever names a `character_id`, and
 * that the picker's options come from outside the dialogue. A page opened from
 * disk cannot glob a folder, so the catalogue works two ways:
 *
 *  - a small built-in seed list, so a fresh open still autocompletes;
 *  - "Importar catálogo", which reads the real `.yaml` files through the File
 *    API (no server needed) and replaces the seed with what actually exists.
 *
 * Everything is a `datalist`, never a closed `<select>`: an id that is not in the
 * catalogue can still be typed, which matches the engine, where an unknown
 * character is a warning rather than a failure.
 */
(function (Forger) {
    'use strict';

    var KEY = 'galatime.forger.catalogue.v1';

    /**
     * Seed values taken from the project as it stands.
     *
     * Items in particular are only a guess — importing the real folders is the
     * supported way to get an accurate list.
     */
    var SEED = {
        characters: [
            'alice', 'annah', 'arthur', 'barasturon', 'duha', 'ttelion',
            'neven', 'noelia', 'pacci', 'raphael', 'nicima', 'kelly'
        ],
        items: ['herb', 'ancient_key', 'hp_potion'],
        dialogues: [],
    };

    var state = null;

    /** Loads the catalogue once, from storage when available. */
    function load() {
        if (state) {
            return state;
        }

        var stored = readStored();

        state = stored && Array.isArray(stored.characters)
            ? {
                characters: stored.characters.slice(),
                items: (stored.items || []).slice(),
                dialogues: (stored.dialogues || []).slice(),
                imported: !!stored.imported,
            }
            : {
                characters: SEED.characters.slice(),
                items: SEED.items.slice(),
                dialogues: [],
                imported: false,
            };

        return state;
    }

    function readStored() {
        try {
            var raw = window.localStorage.getItem(KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    function persist() {
        try {
            window.localStorage.setItem(KEY, JSON.stringify(load()));
        } catch (error) {
            // Storage may be unavailable; the catalogue still works for this session.
        }
    }

    function characters() {
        return load().characters.slice();
    }

    function items() {
        return load().items.slice();
    }

    function dialogues() {
        return load().dialogues.slice();
    }

    /** Whether a real catalogue has been imported (as opposed to the seed). */
    function isImported() {
        return load().imported;
    }

    function hasCharacter(id) {
        return load().characters.indexOf(id) !== -1;
    }

    function hasItem(id) {
        return load().items.indexOf(id) !== -1;
    }

    /** Only meaningful once a dialogues folder has been imported. */
    function hasDialogue(id) {
        var list = load().dialogues;
        return list.length === 0 || list.indexOf(id) !== -1;
    }

    /** Adds an id the catalogue does not know about yet. */
    function remember(kind, id) {
        if (!id) {
            return;
        }

        var list = load()[kind];

        if (list.indexOf(id) === -1) {
            list.push(id);
            persist();
        }
    }

    /**
     * Reads a folder (or a selection) of YAML files and merges what it finds.
     *
     * Resolves with a summary of the ids discovered, so the UI can report
     * something concrete rather than "done".
     */
    function importFiles(fileList) {
        var files = Array.prototype.slice.call(fileList || []).filter(function (file) {
            return /\.(ya?ml)$/i.test(file.name);
        });

        return Promise.all(files.map(readFile)).then(function (entries) {
            var found = { characters: [], items: [], dialogues: [] };

            entries.forEach(function (entry) {
                if (entry) {
                    collect(entry.path, entry.stem, entry.value, found);
                }
            });

            var current = load();

            current.characters = merge(current.characters, found.characters);
            current.items = merge(current.items, found.items);
            current.dialogues = merge(current.dialogues, found.dialogues);
            current.imported = true;
            persist();

            return found;
        });
    }

    /** Reads and parses one file, resolving to null when it is not YAML we can use. */
    function readFile(file) {
        return new Promise(function (resolve) {
            var reader = new FileReader();

            reader.onload = function () {
                var parsed = Forger.yaml.parse(String(reader.result || ''));

                if (!parsed.ok) {
                    resolve(null);
                    return;
                }

                var path = file.webkitRelativePath || file.name;

                resolve({
                    path: path,
                    stem: file.name.replace(/\.(ya?ml)$/i, ''),
                    value: parsed.value,
                });
            };

            reader.onerror = function () {
                resolve(null);
            };

            reader.readAsText(file);
        });
    }

    /** Sorts one parsed file into the catalogue by path, then by shape. */
    function collect(path, stem, value, found) {
        var lower = String(path || '').toLowerCase();
        var kind = classify(lower, value);

        if (!kind) {
            return;
        }

        idsFrom(value, kind, stem).forEach(function (id) {
            if (id && found[kind].indexOf(id) === -1) {
                found[kind].push(id);
            }
        });
    }

    /** Decides what a file describes. */
    function classify(lowerPath, value) {
        if (lowerPath.indexOf('characters') !== -1) {
            return 'characters';
        }

        if (lowerPath.indexOf('dialogues') !== -1) {
            return 'dialogues';
        }

        if (lowerPath.indexOf('items') !== -1) {
            return 'items';
        }

        if (Array.isArray(value)) {
            return 'items';
        }

        if (value && typeof value === 'object') {
            if (value.base_stats) {
                return 'characters';
            }

            if (value.dialogue_id) {
                return 'dialogues';
            }
        }

        return null;
    }

    /** Pulls the ids out of a parsed file. */
    function idsFrom(value, kind, stem) {
        if (Array.isArray(value)) {
            return value.map(function (entry) {
                return entry && entry.id;
            }).filter(Boolean);
        }

        if (!value || typeof value !== 'object') {
            return [];
        }

        if (kind === 'dialogues') {
            // The loader resolves a dialogue by its file name, so both the stem
            // and the declared id are worth offering.
            return value.dialogue_id ? [stem, value.dialogue_id] : [stem];
        }

        return value.id ? [value.id] : [];
    }

    /** Union of two id lists, preserving order. */
    function merge(existing, additions) {
        var output = existing.slice();

        additions.forEach(function (id) {
            if (output.indexOf(id) === -1) {
                output.push(id);
            }
        });

        return output;
    }

    /** Forgets everything and goes back to the seed. */
    function reset() {
        state = null;

        try {
            window.localStorage.removeItem(KEY);
        } catch (error) {
            // Nothing to do.
        }

        load();
    }

    Forger.catalogue = {
        characters: characters,
        items: items,
        dialogues: dialogues,
        isImported: isImported,
        hasCharacter: hasCharacter,
        hasItem: hasItem,
        hasDialogue: hasDialogue,
        remember: remember,
        importFiles: importFiles,
        reset: reset,
    };
})(window.DialogueForger);
