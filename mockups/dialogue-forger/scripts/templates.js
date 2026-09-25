/**
 * Node templates and the starter document.
 *
 * Templates exist to cut down the number of inputs: instead of building a choice
 * node and its two destinations by hand, the writer picks "Escolha com 2 opções"
 * and gets a working, connected shape to edit.
 *
 * Each `build` receives the model, adds whatever nodes it needs, and returns the
 * id of the node the user should land on.
 */
(function (Forger) {
    'use strict';

    /** Builds an `end` node and returns its id. */
    function addEnd(model, result) {
        var id = Forger.model.newNodeId(model, result === 'good' ? 'fim_bom' : 'fim');

        model.nodes[id] = Forger.model.normalizeNode({ type: 'end', result: result || 'neutral' });

        return id;
    }

    /** Ready-made node shapes. */
    var TEMPLATES = [
        {
            id: 'line',
            label: 'Fala simples',
            build: function (model) {
                var endId = addEnd(model, 'neutral');
                var id = Forger.model.newNodeId(model, 'fala');

                model.nodes[id] = Forger.model.normalizeNode({
                    type: 'line',
                    speaker_id: '',
                    text: [{ type: 'text', value: 'Escreve aqui a fala.' }],
                    next: endId,
                });

                return id;
            },
        },
        {
            id: 'interactive',
            label: 'Fala com texto clicável',
            build: function (model) {
                var endId = addEnd(model, 'neutral');
                var detourId = Forger.model.newNodeId(model, 'desvio');
                var id = Forger.model.newNodeId(model, 'fala');

                model.nodes[detourId] = Forger.model.normalizeNode({
                    type: 'line',
                    speaker_id: '',
                    text: [{ type: 'text', value: 'Escolheste seguir o detalhe.' }],
                    next: endId,
                });

                model.nodes[id] = Forger.model.normalizeNode({
                    type: 'line',
                    speaker_id: '',
                    text: [
                        { type: 'text', value: 'Reparo que ' },
                        {
                            type: 'interactive_text',
                            interaction_id: 'detalhe',
                            value: 'algo chama a atenção',
                            optional: true,
                            on_click: { next: detourId },
                        },
                        { type: 'text', value: '.' },
                    ],
                    next: endId,
                });

                return id;
            },
        },
        {
            id: 'choice2',
            label: 'Escolha com 2 opções',
            build: function (model) {
                var endId = addEnd(model, 'neutral');
                var id = Forger.model.newNodeId(model, 'escolha');

                model.nodes[id] = Forger.model.normalizeNode({
                    type: 'choice',
                    prompt: { speaker_id: '', emotion: '', text: 'O que queres fazer?' },
                    choices: [
                        { choice_id: 'opcao_a', text: 'Opção A', next: endId },
                        { choice_id: 'opcao_b', text: 'Opção B', next: endId },
                    ],
                });

                return id;
            },
        },
        {
            id: 'character_enter',
            label: 'Entrada de personagem',
            build: function (model) {
                var endId = addEnd(model, 'neutral');
                var id = Forger.model.newNodeId(model, 'entra');

                model.nodes[id] = Forger.model.normalizeNode({
                    type: 'character_enter',
                    character_id: '',
                    position: 'right',
                    animation_id: '',
                    next: endId,
                });

                return id;
            },
        },
        {
            id: 'character_exit',
            label: 'Saída de personagem',
            build: function (model) {
                var endId = addEnd(model, 'neutral');
                var id = Forger.model.newNodeId(model, 'sai');

                model.nodes[id] = Forger.model.normalizeNode({
                    type: 'character_exit',
                    character_id: '',
                    animation_id: '',
                    direction: 'right',
                    next: endId,
                });

                return id;
            },
        },
        {
            id: 'conditional',
            label: 'Condição (2 ramos)',
            build: function (model) {
                var endId = addEnd(model, 'neutral');
                var id = Forger.model.newNodeId(model, 'condicao');

                model.nodes[id] = Forger.model.normalizeNode({
                    type: 'conditional',
                    branches: [
                        {
                            branch_id: 'caso_verdadeiro',
                            if: { all: [{ condition: 'equals', left: 'flags.exemplo', right: true }] },
                            next: endId,
                        },
                        { branch_id: 'caso_padrao', if: null, next: endId },
                    ],
                });

                return id;
            },
        },
        {
            id: 'end',
            label: 'Fim de conversa',
            build: function (model) {
                var id = addEnd(model, 'neutral');

                return id;
            },
        },
    ];

    /**
     * The starting state the preview parses when the writer has no draft.
     *
     * Deliberately empty slices rather than a filled-in sample: the preview reads
     * whatever paths the conditions name, and inventing values would quietly open
     * branches the writer never set. The slices are listed so the textarea shows
     * the shape of a state instead of a bare `{}`; `relationship` is the one slice
     * whose two levels a bare `{}` cannot show, so the panel explains it beside
     * the field.
     */
    function defaultState() {
        return [
            'flags: {}',
            'inventory: {}',
            'relationship: {}',
            'objectives: {}',
            'stats: {}',
        ].join('\n');
    }

    Forger.templates = {
        TEMPLATES: TEMPLATES,
        defaultState: defaultState,
    };
})(window.DialogueForger);
