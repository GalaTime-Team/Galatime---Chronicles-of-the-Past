/**
 * Local draft storage.
 *
 * Keeps the work-in-progress in `localStorage` so closing the tab does not lose
 * a conversation. Versioned key: bump the suffix if the model shape ever
 * changes in a way an old draft could not survive.
 */
(function (Forger) {
    'use strict';

    var KEY = 'galatime.forger.draft.v1';
    var PREVIEW_KEY = 'galatime.forger.preview-state.v1';

    /** Stores the model. Returns false when storage is unavailable or full. */
    function save(model) {
        try {
            window.localStorage.setItem(KEY, JSON.stringify(model));
            return true;
        } catch (error) {
            return false;
        }
    }

    /** Reads the stored model, or null when there is none or it is unusable. */
    function load() {
        try {
            var raw = window.localStorage.getItem(KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            return null;
        }
    }

    /** Stores the preview's initial state, which is worth keeping between visits. */
    function savePreview(text) {
        try {
            window.localStorage.setItem(PREVIEW_KEY, text);
        } catch (error) {
            // Nothing to do.
        }
    }

    /** Reads the stored preview state, or null. */
    function loadPreview() {
        try {
            return window.localStorage.getItem(PREVIEW_KEY);
        } catch (error) {
            return null;
        }
    }

    /** Forgets the stored model. */
    function clear() {
        try {
            window.localStorage.removeItem(KEY);
        } catch (error) {
            // Storage can be unavailable in restricted contexts; nothing to do.
        }
    }

    Forger.draftStorage = {
        KEY: KEY,
        PREVIEW_KEY: PREVIEW_KEY,
        save: save,
        load: load,
        savePreview: savePreview,
        loadPreview: loadPreview,
        clear: clear,
    };
})(window.DialogueForger);
