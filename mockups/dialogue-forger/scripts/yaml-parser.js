/**
 * YAML reading and writing.
 *
 * A thin wrapper over js-yaml so the rest of the tool never touches the library
 * directly. js-yaml is loaded from a CDN by `index.html`; if that fails (the
 * page was opened offline) `available()` reports false and the UI disables
 * import/export with an explanation instead of throwing.
 */
window.DialogueForger = window.DialogueForger || {};

(function (Forger) {
    'use strict';

    /** Whether the YAML library is present. */
    function available() {
        return typeof window.jsyaml !== 'undefined'
            && typeof window.jsyaml.load === 'function'
            && typeof window.jsyaml.dump === 'function';
    }

    /**
     * Parses YAML (or JSON, which YAML is a superset of).
     *
     * Never throws: the editor shows the message instead of dying.
     */
    function parse(text) {
        if (!available()) {
            return { ok: false, error: 'A biblioteca js-yaml não foi carregada.' };
        }

        try {
            return { ok: true, value: window.jsyaml.load(text) };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }

    /**
     * Serialises a value to YAML.
     *
     * `lineWidth: -1` is deliberate: the default folds long lines, which would
     * break a sentence of dialogue across two lines and make the exported file
     * much harder to read and diff.
     */
    function dump(value) {
        if (!available()) {
            return '';
        }

        return window.jsyaml.dump(value, {
            indent: 2,
            lineWidth: -1,
            noRefs: true,
            sortKeys: false,
            quotingType: '"',
        });
    }

    Forger.yaml = {
        available: available,
        parse: parse,
        dump: dump,
    };
})(window.DialogueForger);
