/**
 * Built-in suggestions for the standalone dialogue editor.
 *
 * Character ids are deliberately fixed in this file: they are not loaded from
 * the repository, a folder picker, a network request or browser storage. Old
 * catalogue values saved by earlier versions are ignored.
 */
(function (Forger) {
    'use strict';

    var CHARACTER_IDS = [
        'alice', 'annah', 'arthur', 'barasturon', 'duha', 'ttelion',
        'neven', 'noelia', 'pacci', 'raphael', 'nicima', 'kelly',
    ];

    // These are optional hints only; writers can still enter any item or dialogue id.
    var ITEM_IDS = ['herb', 'ancient_key', 'hp_potion'];

    function characters() {
        return CHARACTER_IDS.slice();
    }

    function items() {
        return ITEM_IDS.slice();
    }

    function dialogues() {
        return [];
    }

    function hasCharacter(id) {
        return CHARACTER_IDS.indexOf(id) !== -1;
    }

    function hasItem(id) {
        return ITEM_IDS.indexOf(id) !== -1;
    }

    // Without an imported dialogue catalogue, a free-form id is intentional.
    function hasDialogue() {
        return true;
    }

    Forger.catalogue = {
        CHARACTER_IDS: CHARACTER_IDS.slice(),
        characters: characters,
        items: items,
        dialogues: dialogues,
        hasCharacter: hasCharacter,
        hasItem: hasItem,
        hasDialogue: hasDialogue,
    };
})(window.DialogueForger);
