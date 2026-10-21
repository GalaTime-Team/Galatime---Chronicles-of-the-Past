/**
 * The built-in suggestions, read from the vocabulary file.
 *
 * Character ids, items and dialogues are deliberately fixed in `lists.js`: they
 * are not loaded from the repository, a folder picker, a network request or
 * browser storage. This module is only the accessor the rest of the tool talks
 * to, so adding a value is an edit to `lists.js` and nothing else.
 */
(function (Forger) {
    'use strict';

    var lists = Forger.lists;

    function characters() {
        return lists.CHARACTER_IDS.slice();
    }

    function items() {
        return lists.ITEM_IDS.slice();
    }

    function dialogues() {
        return lists.DIALOGUE_IDS.slice();
    }

    function hasCharacter(id) {
        return lists.CHARACTER_IDS.indexOf(id) !== -1;
    }

    function hasItem(id) {
        return lists.ITEM_IDS.indexOf(id) !== -1;
    }

    function hasDialogue() {
        return true;
    }

    Forger.catalogue = {
        CHARACTER_IDS: lists.CHARACTER_IDS.slice(),
        characters: characters,
        items: items,
        dialogues: dialogues,
        hasCharacter: hasCharacter,
        hasItem: hasItem,
        hasDialogue: hasDialogue,
    };
})(window.DialogueForger);
