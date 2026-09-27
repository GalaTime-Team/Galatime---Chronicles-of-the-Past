/**
 * Application wiring.
 *
 * Owns the document state, the undo history and every DOM hook. The editors are
 * stateless: they are handed the current value and a callback, and they never
 * reach back into this module.
 *
 * The one rule that shapes everything here is **render granularity**:
 *
 *   - `render()`      rebuilds the whole UI. Only for changes that alter the
 *                     shape of the document (add/remove/rename/retype a node,
 *                     import, undo/redo).
 *   - `refresh()`     rebuilds only the node list and the issue panel. Safe to
 *                     call on every keystroke, because neither of those holds
 *                     focus while the writer types.
 *
 * Calling `render()` from a text field's `input` handler is the classic way to
 * make an editor lose focus on every character, so the editors are careful to
 * ask for `refresh()` and this module is careful to honour it.
 */
(function (Forger) {
    'use strict';

    var ui = Forger.ui;

    /** Autosave is debounced so typing does not hammer localStorage. */
    var AUTOSAVE_DELAY_MS = 600;

    /**
     * How long the preview holds a self-advancing line before moving on.
     *
     * Longer than the game's own hold on purpose: in the preview the writer is
     * reading a node they may just have written, not playing.
     */
    var PREVIEW_AUTO_ADVANCE_MS = 1000;
    var DEFAULT_PREVIEW_STATE = [
        'flags: {}',
        'inventory: {}',
        'relationship: {}',
        'objectives: {}',
        'stats: {}',
    ].join('\n');

    /** Card box the layout is built around; branching cards grow taller. */
    var FLOW_CARD_WIDTH = 205;
    var FLOW_CARD_HEIGHT = 92;
    /** Each option printed inside a branching card adds this much height. */
    var FLOW_OPTION_ROW = 18;
    /** Options listed before the card falls back to a "+N ramo(s)…" row. */
    var FLOW_OPTION_LIMIT = 6;
    var FLOW_COLUMN_GAP = 130;
    var FLOW_ROW_GAP = 26;
    /** Room above the first card for the column caption. */
    var FLOW_HEADER_OFFSET = 40;
    var FLOW_PADDING = 30;
    /** Room below the tallest column before the first back-edge lane. */
    var FLOW_LANE_GAP = 30;
    var FLOW_LANE_STEP = 25;
    var NODE_ID_BASES = {
        character_enter: 'entra',
        line: 'fala',
        choice: 'escolha',
        conditional: 'ramificacao',
        character_exit: 'sai',
        end: 'fim',
    };

    var state = {
        model: null,
        selectedNodeId: null,
        history: null,
        lastRecorded: null,
        parseErrors: {},
        fileName: null,
        report: { errors: [], warnings: [] },
        session: null,
        previewState: null,
    };

    var autosaveTimer = null;

    /**
     * The pending "this line moves on by itself" timeout.
     *
     * One at a time, and always cancelled before a new one is armed: a manual
     * "Continuar" landing while the timer is pending would otherwise advance
     * twice — once for the click and once for the timeout nobody withdrew.
     */
    var previewTimer = null;

    /* ------------------------------------------------------------- history */

    /**
     * Records the state a change is about to replace.
     *
     * Called from a `focusin` handler, so one snapshot covers everything typed
     * into a single field. Structural changes call it explicitly before they
     * mutate.
     *
     * `lastRecorded` starts as null — "nothing recorded yet" — so the very first
     * change is undoable. Once something has been recorded, a repeated call with
     * an unchanged model is skipped, which is what stops a click that changes
     * nothing from pushing a useless entry onto the stack.
     */
    function recordSnapshot() {
        var current = JSON.stringify(state.model);

        if (current === state.lastRecorded) {
            return;
        }

        state.history.record(JSON.parse(current));
        state.lastRecorded = current;
    }

    /** Resets the history, for a document that has just been replaced. */
    function resetHistory() {
        state.history.clear();
        state.lastRecorded = null;
    }

    /* ------------------------------------------------------------ lifecycle */

    /** Loads the saved draft, or an empty document on a first visit. */
    function boot() {
        state.history = Forger.model.createHistory();

        var draft = Forger.draftStorage.load();

        state.model = draft ? Forger.model.normalize(draft) : Forger.model.createEmpty();
        state.selectedNodeId = state.model.nodes[state.model.start_node]
            ? state.model.start_node
            : (Object.keys(state.model.nodes)[0] || null);
        state.lastRecorded = null;
        setSaveStatus(draft ? 'Rascunho recuperado neste dispositivo' : 'Pronto a guardar neste dispositivo');

        var previewText = Forger.draftStorage.loadPreview();
        document.getElementById('preview-state').value = previewText || DEFAULT_PREVIEW_STATE;
        updatePreviewState();

        if (!Forger.yaml.available()) {
            document.getElementById('banner').appendChild(ui.notice(
                'warning',
                'A biblioteca js-yaml não carregou (a página foi aberta sem rede?). '
                + 'Importar e exportar YAML ficam indisponíveis até ela carregar.',
            ));
        }

        wireEvents();
        render();
    }

    /** Registers every event handler once. */
    function wireEvents() {
        // One snapshot per field visit, rather than one per keystroke.
        //
        // Restricted to editable controls on purpose. A button also receives
        // focus, and snapshotting on it would push the current state right
        // before Undo popped it — making Undo restore the state it just left.
        // Button-driven structural edits call `recordSnapshot()` themselves.
        document.addEventListener('focusin', function (event) {
            var target = event.target;

            if (!target || !target.matches || !target.matches('input, textarea, select')) {
                return;
            }

            recordSnapshot();
        });

        document.getElementById('dialogue-id').addEventListener('input', function (event) {
            state.model.dialogue_id = event.target.value;
            autosave();
            refresh();
        });

        document.getElementById('start-node').addEventListener('change', function (event) {
            recordSnapshot();
            state.model.start_node = event.target.value;
            autosave();
            refresh();
        });

        document.getElementById('btn-undo').addEventListener('click', undo);
        document.getElementById('btn-redo').addEventListener('click', redo);

        document.getElementById('tab-edit').addEventListener('click', function () {
            switchView('edit');
        });
        document.getElementById('tab-test').addEventListener('click', function () {
            switchView('test');
        });

        document.querySelector('.workspace-tabs').addEventListener('keydown', function (event) {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                return;
            }

            event.preventDefault();
            var next = event.key === 'ArrowRight' ? 'test' : 'edit';
            switchView(next);
            document.getElementById(next === 'test' ? 'tab-test' : 'tab-edit').focus();
        });

        document.getElementById('btn-new').addEventListener('click', function () {
            replaceDocument(Forger.model.createEmpty(), null, 'Documento novo.');
        });

        document.getElementById('btn-import').addEventListener('click', function () {
            document.getElementById('file-input').click();
        });

        document.getElementById('file-input').addEventListener('change', function (event) {
            var file = event.target.files && event.target.files[0];

            if (!file) {
                return;
            }

            var reader = new FileReader();

            reader.onload = function () {
                importText(String(reader.result || ''), file.name.replace(/\.(ya?ml)$/i, ''));
            };

            reader.readAsText(file);
            event.target.value = '';
        });

        document.getElementById('btn-copy').addEventListener('click', copyYaml);
        document.getElementById('btn-copy-export').addEventListener('click', copyYaml);
        document.getElementById('btn-download').addEventListener('click', downloadYaml);

        document.querySelector('.action-menu').addEventListener('click', function (event) {
            if (event.target.closest('button')) {
                event.currentTarget.closest('details').open = false;
            }
        });

        function validateFromButton() {
            renderIssues();
            flash(describeReport());
            document.getElementById('validation-details').open = true;
        }

        document.getElementById('btn-validate').addEventListener('click', validateFromButton);
        document.getElementById('btn-validate-panel').addEventListener('click', validateFromButton);

        document.getElementById('btn-add-node').addEventListener('click', addNode);

        document.getElementById('preview-state').addEventListener('input', function (event) {
            updatePreviewState();
            Forger.draftStorage.savePreview(event.target.value);
        });

        document.getElementById('btn-preview-start').addEventListener('click', startPreview);

        document.getElementById('btn-preview-reset').addEventListener('click', function () {
            state.session = null;
            renderPreview();
        });

        document.getElementById('btn-preview-continue').addEventListener('click', function () {
            if (state.session) {
                Forger.preview.advance(state.session);
                renderPreview();
            }
        });
    }

    /** Switches between the authoring surface and the interactive test surface. */
    function switchView(view) {
        var editing = view !== 'test';
        var editTab = document.getElementById('tab-edit');
        var testTab = document.getElementById('tab-test');

        document.getElementById('view-edit').hidden = !editing;
        document.getElementById('view-test').hidden = editing;
        editTab.setAttribute('aria-selected', editing ? 'true' : 'false');
        testTab.setAttribute('aria-selected', editing ? 'false' : 'true');
        editTab.tabIndex = editing ? 0 : -1;
        testTab.tabIndex = editing ? -1 : 0;
        editTab.classList.toggle('is-active', editing);
        testTab.classList.toggle('is-active', !editing);

        if (!editing) {
            renderPreview();
        }
    }

    /* --------------------------------------------------------------- render */

    /** Rebuilds the whole UI. */
    function render() {
        renderHeader();
        renderNodeList();
        renderEditor();
        renderIssues();
        renderPreview();
    }

    /** Rebuilds only the parts that are safe to touch while typing. */
    function refresh() {
        renderNodeList();
        renderIssues();
        renderFlowGraph();
    }

    /** The dialogue id, the start node picker and the undo/redo buttons. */
    function renderHeader() {
        var idInput = document.getElementById('dialogue-id');

        // Do not clobber the field the writer is currently in.
        if (document.activeElement !== idInput) {
            idInput.value = state.model.dialogue_id;
        }

        var startSelect = document.getElementById('start-node');
        var nodeIds = Object.keys(state.model.nodes);

        startSelect.textContent = '';

        if (nodeIds.length === 0) {
            startSelect.appendChild(ui.el('option', { value: '', text: '(sem nós)' }));
        }

        nodeIds.forEach(function (nodeId) {
            startSelect.appendChild(ui.el('option', { value: nodeId, text: nodeId }));
        });

        startSelect.value = state.model.start_node || '';

        document.getElementById('btn-undo').disabled = !state.history.canUndo();
        document.getElementById('btn-redo').disabled = !state.history.canRedo();
    }

    /** The node list, with a marker for the start node and for broken links. */
    function renderNodeList() {
        var container = document.getElementById('node-list');
        var nodeIds = Object.keys(state.model.nodes);

        if (state.model.start_node && state.model.nodes[state.model.start_node]) {
            nodeIds = [state.model.start_node].concat(nodeIds.filter(function (nodeId) {
                return nodeId !== state.model.start_node;
            }));
        }

        container.textContent = '';

        var countLabel = nodeIds.length + (nodeIds.length === 1 ? ' passo' : ' passos');
        document.getElementById('node-count').textContent = countLabel;

        if (nodeIds.length === 0) {
            ui.append(container, ui.el('div', { class: 'list-empty' }, [
                ui.el('p', { text: 'Ainda não há nós. Escolhe um tipo e adiciona o primeiro à conversa.' }),
            ]));
            return;
        }

        var broken = collectBrokenNodes();

        nodeIds.forEach(function (nodeId) {
            var node = state.model.nodes[nodeId];
            var isStart = nodeId === state.model.start_node;

            container.appendChild(ui.el('button', {
                type: 'button',
                class: 'node-item' + (nodeId === state.selectedNodeId ? ' is-selected' : ''),
                on: {
                    click: function () {
                        selectNode(nodeId);
                    },
                },
            }, [
                ui.el('div', { class: 'node-item-copy' }, [
                    ui.el('div', { class: 'node-id', text: (isStart ? '▶ ' : '') + nodeId }),
                    ui.el('div', { class: 'node-meta' }, [
                        (Forger.model.NODE_TYPE_LABELS[node.type] || node.type)
                            + ' · ' + Forger.model.nodeSummary(node),
                        node.auto_advance === true
                            ? ui.el('span', { class: 'badge', text: ' ⏩ automático' })
                            : null,
                        broken[nodeId] ? ui.el('span', { class: 'badge', text: ' ⚠ destino inválido' }) : null,
                    ]),
                ]),
            ]));
        });
    }

    /** The editor for the selected node. */
    function renderEditor() {
        var container = document.getElementById('editor');
        var nodeId = state.selectedNodeId;

        container.textContent = '';

        if (!nodeId || !state.model.nodes[nodeId]) {
            document.getElementById('node-actions').textContent = '';
            ui.append(container, ui.el('div', { class: 'empty-state' }, [
                ui.el('h3', { text: 'O conteúdo aparece aqui' }),
                ui.el('p', { text: 'Escolhe um tipo de nó na Estrutura e seleciona «Adicionar nó» para começar.' }),
            ]));
            return;
        }

        var node = state.model.nodes[nodeId];

        var primaryFields = [
            ui.field('ID do nó', ui.text({
                value: nodeId,
                onCommit: function (value) {
                    renameNode(nodeId, value);
                },
            }), undefined, { required: true }),
            ui.field('Tipo', ui.select({
                value: node.type,
                options: Forger.model.NODE_TYPES.map(function (type) {
                    return { value: type, label: Forger.model.NODE_TYPE_LABELS[type] };
                }),
                onChange: function (value) {
                    changeNodeType(nodeId, value);
                },
            })),
        ];

        if (Forger.model.supportsNext(node.type)) {
            var nextField = ui.field('Próximo nó', ui.listInput('nodes', {
                value: node.next,
                placeholder: 'id_do_no',
                extra: Object.keys(state.model.nodes),
                onInput: function (value) {
                    patchNode({ next: value });
                },
            }));
            nextField.classList.add('node-destination');
            primaryFields.push(nextField);
        }

        var primaryInfo = ui.el('div', { class: 'node-primary-info' }, primaryFields);

        var actions = [];

        actions.push(ui.checkbox({
            checked: state.model.start_node === nodeId,
            label: 'Inicial',
            onChange: function (checked) {
                if (checked && state.model.start_node !== nodeId) {
                    setStartNode(nodeId);
                } else if (!checked) {
                    render();
                }
            },
        }));

        actions.push(ui.button({
            label: 'Duplicar',
            onClick: function () {
                duplicateNode(nodeId);
            },
        }));
        actions.push(ui.button({
            label: 'Eliminar',
            variant: 'danger',
            onClick: function () {
                deleteNode(nodeId);
            },
        }));

        var actionsContainer = document.getElementById('node-actions');
        actionsContainer.textContent = '';
        ui.append(actionsContainer, actions);

        ui.append(container, [
            ui.el('div', { class: 'node-chrome' }, [
                primaryInfo,
            ]),
            Forger.nodeEditor.render({
            nodeId: nodeId,
            node: node,
            lists: buildLists(),
            suggestedPaths: suggestedPaths(),
            patch: patchNode,
            reportTextErrors: function (errors, path) {
                // The path travels with the problem so a malformed question is not
                // reported as if it were a line's text.
                state.parseErrors[nodeId] = (errors || []).map(function (error) {
                    return { message: error.message, raw: error.raw, path: path };
                });
                renderIssues();
            },
        })]);
    }

    /** The validation panel. */
    function renderIssues() {
        var container = document.getElementById('issues');

        state.report = Forger.validator.validate(state.model, {
            fileName: state.fileName,
            parseErrors: state.parseErrors,
        });

        document.getElementById('validation-count').textContent = describeReport();
        container.textContent = '';

        if (state.report.errors.length === 0 && state.report.warnings.length === 0) {
            ui.append(container, ui.el('p', {
                class: 'validation-empty',
                text: 'Sem problemas detetados. O diálogo está pronto para exportar.',
            }));
            return;
        }

        state.report.errors.concat(state.report.warnings).forEach(function (issue) {
            var target = nodeIdFromPath(issue.path);

            ui.append(container, ui.el('div', { class: 'issue issue-' + issue.severity }, [
                ui.el('span', {
                    class: 'issue-kind',
                    text: issue.severity === 'error' ? 'erro' : 'aviso',
                }),
                ui.el('div', { class: 'issue-body' }, [
                    target
                        ? ui.el('a', {
                            href: '#',
                            text: issue.message,
                            on: {
                                click: function (event) {
                                    event.preventDefault();
                                    selectNode(target);
                                },
                            },
                        })
                        : ui.el('div', { text: issue.message }),
                    issue.path ? ui.el('div', { class: 'issue-path', text: issue.path }) : null,
                ]),
            ]));
        });
    }

    /* -------------------------------------------------------------- preview */

    /** Re-reads the preview's initial state from the textarea. */
    function updatePreviewState() {
        var textarea = document.getElementById('preview-state');
        var parsed = Forger.yaml.parse(textarea.value);

        state.previewState = parsed.ok && parsed.value && typeof parsed.value === 'object'
            ? parsed.value
            : null;
    }

    /** Starts a preview run from the current document. */
    function startPreview() {
        updatePreviewState();

        if (!state.previewState) {
            flash('O estado inicial não é YAML válido.', true);
            return;
        }

        state.session = Forger.preview.start(
            state.model,
            Forger.preview.createState(state.previewState),
        );

        renderPreview();
    }

    /** Renders the preview panel. */
    function renderPreview() {
        var container = document.getElementById('preview-output');
        var session = state.session;
        var continueButton = document.getElementById('btn-preview-continue');
        var resetButton = document.getElementById('btn-preview-reset');

        // Always withdrawn first: every path through this function re-arms it
        // when it still applies, and a stale timer would advance the wrong node.
        clearPreviewTimer();

        continueButton.disabled = !session
            || session.completed
            || !session.node
            || !Forger.model.supportsNext(session.node.type);
        resetButton.disabled = !session;
        container.textContent = '';
        renderFlowGraph();
        renderFlowStatus(session);

        if (!session) {
            ui.append(container, ui.el('div', { class: 'preview-empty' }, [
                ui.el('strong', { text: 'Pronto para começar' }),
                ui.el('span', { text: 'Inicia o teste para acompanhar a conversa. As escolhas e os segmentos clicáveis são interativos.' }),
            ]));
            return;
        }

        var speakerId = session.node ? session.node.speaker_id : null;

        // Who the dialogue has in the conversation, and which of them is talking.
        ui.append(container, ui.el('div', { class: 'cast-chips' }, session.cast.map(function (member) {
            return ui.el('span', {
                class: 'chip' + (member.character_id === speakerId ? ' chip-on' : ''),
                text: member.character_id + ' @ ' + member.position,
            });
        })));

        if (session.completed) {
            ui.append(container, ui.el('div', { class: 'preview-node', text: 'Fim · ' + (session.result || '—') }));
        } else if (session.node) {
            ui.append(container, renderPreviewNode(session));
        } else {
            ui.append(container, ui.hint('Sem nó atual — vê o registo abaixo.'));
        }

        ui.append(container, ui.el('div', { class: 'log' }, session.log.map(function (line) {
            return ui.el('div', { text: line });
        })));

        schedulePreviewAutoAdvance(session);
    }

    /** Updates the live graph and its current-node label from the preview session. */
    function renderFlowStatus(session) {
        var label = document.getElementById('flow-current-label');

        if (session && session.nodeId) {
            label.textContent = 'Em teste · ' + session.nodeId;
            label.classList.add('is-active');
        } else if (session && session.completed) {
            label.textContent = 'Teste concluído';
            label.classList.remove('is-active');
        } else if (session) {
            label.textContent = 'Sem nó atual';
            label.classList.remove('is-active');
        } else {
            label.textContent = 'Sem teste ativo';
            label.classList.remove('is-active');
        }
    }

    /**
     * Draws a deterministic layered map. Reachable nodes use their shortest
     * breadth-first depth, except `end` nodes, which are pushed one column past
     * the deepest node that reaches them so they close the branch that calls
     * them. Unreachable nodes occupy a final column. Back-edges and cycles route
     * through distinct lanes below the cards, and a branching card prints its
     * options as a numbered legend that the edge chips point back to.
     */
    function renderFlowGraph() {
        var viewport = document.getElementById('flow-map');
        var nodeIds = Object.keys(state.model.nodes || {});

        if (nodeIds.length === 0) {
            viewport.textContent = '';
            ui.append(viewport, ui.el('div', { class: 'flow-empty' }, [
                ui.el('strong', { text: 'O mapa está vazio' }),
                ui.el('span', { text: 'Adiciona nós no separador «Editar» para construir o percurso.' }),
            ]));
            return;
        }

        var depthById = Object.create(null);
        var startId = state.model.start_node;
        var queue = [];
        var queueIndex = 0;
        var maxReachableDepth = -1;

        if (startId && state.model.nodes[startId]) {
            depthById[startId] = 0;
            queue.push(startId);
        }

        while (queueIndex < queue.length) {
            var currentId = queue[queueIndex];
            queueIndex += 1;
            var currentDepth = depthById[currentId];
            maxReachableDepth = Math.max(maxReachableDepth, currentDepth);

            Forger.model.outgoingNodeIds(state.model.nodes[currentId]).forEach(function (targetId) {
                if (!state.model.nodes[targetId] || Object.prototype.hasOwnProperty.call(depthById, targetId)) {
                    return;
                }

                depthById[targetId] = currentDepth + 1;
                queue.push(targetId);
            });
        }

        var isUnreachable = Object.create(null);

        // The graph, inverted: an `end` node needs to know who points at it
        // before it can be told where it belongs.
        var predecessors = Object.create(null);

        nodeIds.forEach(function (sourceId) {
            var seen = Object.create(null);

            Forger.model.outgoingNodeIds(state.model.nodes[sourceId]).forEach(function (targetId) {
                if (!state.model.nodes[targetId] || seen[targetId]) {
                    return;
                }

                seen[targetId] = true;
                predecessors[targetId] = predecessors[targetId] || [];
                predecessors[targetId].push(sourceId);
            });
        });

        // An `end` node is a destination, not a step. Its shortest-path depth can
        // leave it level with a mid-dialogue branch while the branch that really
        // reaches it runs much further right, and every remaining edge then has
        // to route backwards into it. Anchor it one column past the deepest node
        // that points at it instead, so the map closes where the dialogue does.
        // Ends nobody reaches keep the "fora do percurso" column.
        nodeIds.forEach(function (nodeId) {
            if (state.model.nodes[nodeId].type !== 'end'
                || !Object.prototype.hasOwnProperty.call(depthById, nodeId)) {
                return;
            }

            var deepest = -1;

            (predecessors[nodeId] || []).forEach(function (predecessorId) {
                if (Object.prototype.hasOwnProperty.call(depthById, predecessorId)) {
                    deepest = Math.max(deepest, depthById[predecessorId]);
                }
            });

            if (deepest >= 0) {
                depthById[nodeId] = deepest + 1;
            }
        });

        // Only now is the unreachable column placed. Deriving it from the BFS
        // depth instead would land it exactly on a pushed `end` node and label a
        // perfectly reachable card as "fora do percurso".
        var maxAssignedDepth = -1;

        nodeIds.forEach(function (nodeId) {
            if (Object.prototype.hasOwnProperty.call(depthById, nodeId)) {
                maxAssignedDepth = Math.max(maxAssignedDepth, depthById[nodeId]);
            }
        });

        var unreachableDepth = maxAssignedDepth < 0 ? 0 : maxAssignedDepth + 1;
        var layers = [];

        nodeIds.forEach(function (nodeId) {
            var depth = Object.prototype.hasOwnProperty.call(depthById, nodeId)
                ? depthById[nodeId]
                : unreachableDepth;

            if (!Object.prototype.hasOwnProperty.call(depthById, nodeId)) {
                isUnreachable[nodeId] = true;
            }

            layers[depth] = layers[depth] || [];
            layers[depth].push(nodeId);
        });

        var maxLayer = layers.length - 1;
        var positions = Object.create(null);
        var reachableLayers = maxReachableDepth < 0 ? -1 : maxReachableDepth;

        // Cards are stacked by cumulative height rather than on a fixed row
        // pitch, because a branching card is taller than a plain one. Each
        // column is also ordered by the average position of the nodes feeding
        // it, which stops a fan-out from tangling on its way across.
        var rowById = Object.create(null);
        var columnBottom = 0;

        layers.forEach(function (layer, depth) {
            if (!layer || layer.length === 0) {
                return;
            }

            if (depth > 0) {
                layer.sort(function (a, b) {
                    return flowBarycentre(a, rowById, predecessors) - flowBarycentre(b, rowById, predecessors);
                });
            }

            var cursor = FLOW_PADDING + FLOW_HEADER_OFFSET;

            layer.forEach(function (nodeId) {
                var height = flowCardHeight(state.model.nodes[nodeId]);

                positions[nodeId] = {
                    x: FLOW_PADDING + depth * (FLOW_CARD_WIDTH + FLOW_COLUMN_GAP),
                    y: cursor,
                    height: height,
                    depth: depth,
                };
                rowById[nodeId] = cursor;
                cursor += height + FLOW_ROW_GAP;
            });

            columnBottom = Math.max(columnBottom, cursor - FLOW_ROW_GAP);
        });

        var edges = [];
        nodeIds.forEach(function (sourceId) {
            collectFlowEdges(sourceId, state.model.nodes[sourceId]).forEach(function (edge) {
                edges.push(edge);
            });
        });

        var backEdgeCount = edges.filter(function (edge) {
            return positions[edge.to].depth <= positions[edge.from].depth;
        }).length;
        var laneTop = columnBottom + FLOW_LANE_GAP;
        var canvasWidth = Math.max(860, FLOW_PADDING * 2 + maxLayer * (FLOW_CARD_WIDTH + FLOW_COLUMN_GAP) + FLOW_CARD_WIDTH);
        var canvasHeight = Math.max(520, laneTop + backEdgeCount * FLOW_LANE_STEP + FLOW_PADDING);
        var currentNodeId = state.session && state.session.nodeId;
        var canvas = ui.el('div', { class: 'flow-canvas' });

        canvas.style.width = canvasWidth + 'px';
        canvas.style.height = canvasHeight + 'px';

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'flow-edges');
        svg.setAttribute('width', canvasWidth);
        svg.setAttribute('height', canvasHeight);
        svg.setAttribute('viewBox', '0 0 ' + canvasWidth + ' ' + canvasHeight);
        svg.setAttribute('aria-hidden', 'true');

        var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        var marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
        marker.setAttribute('id', 'flow-arrow');
        marker.setAttribute('viewBox', '0 0 10 10');
        marker.setAttribute('refX', '9');
        marker.setAttribute('refY', '5');
        marker.setAttribute('markerWidth', '6');
        marker.setAttribute('markerHeight', '6');
        marker.setAttribute('orient', 'auto');

        var arrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        arrow.setAttribute('class', 'flow-arrowhead');
        arrow.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
        marker.appendChild(arrow);
        defs.appendChild(marker);
        svg.appendChild(defs);

        // A branching edge carries a number, not a sentence: the chip points at
        // the matching row in the source card's option list. Chips from one card
        // are fanned around the midpoint so four options read as four tokens
        // instead of four overlapping lines of text.
        var chipTotals = Object.create(null);

        edges.forEach(function (edge) {
            if (edge.numbers.length > 0) {
                chipTotals[edge.from] = (chipTotals[edge.from] || 0) + 1;
            }
        });

        var chipSeen = Object.create(null);
        var backLane = 0;

        edges.forEach(function (edge) {
            var from = positions[edge.from];
            var to = positions[edge.to];
            var startX = from.x + FLOW_CARD_WIDTH;
            var startY = from.y + from.height / 2;
            var endX = to.x;
            var endY = to.y + to.height / 2;
            var backEdge = to.depth <= from.depth;
            var highlighted = edge.from === currentNodeId || edge.to === currentNodeId;
            var laneY = 0;
            var pathData;

            if (backEdge) {
                laneY = laneTop + backLane * FLOW_LANE_STEP;
                backLane += 1;
                pathData = 'M ' + startX + ' ' + startY
                    + ' C ' + (startX + 46) + ' ' + startY + ', ' + (startX + 46) + ' ' + laneY + ', ' + (startX + 20) + ' ' + laneY
                    + ' L ' + (endX - 20) + ' ' + laneY
                    + ' C ' + (endX - 46) + ' ' + laneY + ', ' + (endX - 46) + ' ' + endY + ', ' + endX + ' ' + endY;
            } else {
                var middleX = startX + (endX - startX) / 2;
                pathData = 'M ' + startX + ' ' + startY
                    + ' C ' + middleX + ' ' + startY + ', ' + middleX + ' ' + endY + ', ' + endX + ' ' + endY;
            }

            var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('class', 'flow-edge'
                + (backEdge ? ' is-back-edge' : '')
                + (highlighted ? ' is-highlighted' : ''));
            path.setAttribute('d', pathData);
            path.setAttribute('marker-end', 'url(#flow-arrow)');
            svg.appendChild(path);

            if (edge.numbers.length > 0) {
                var total = chipTotals[edge.from] || 1;
                var seen = chipSeen[edge.from] || 0;
                chipSeen[edge.from] = seen + 1;
                drawFlowEdgeChip(svg, {
                    x: (startX + endX) / 2,
                    y: backEdge
                        ? laneY - 12
                        : (startY + endY) / 2 + (seen - (total - 1) / 2) * 20,
                    text: edge.numbers.join('·'),
                    label: edge.labels.join(' / '),
                    highlighted: highlighted,
                });
            } else if (edge.labels.length > 0) {
                var fullLabel = edge.labels.join(' / ');
                var edgeLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                edgeLabel.setAttribute('class', 'flow-edge-label' + (highlighted ? ' is-highlighted' : ''));
                edgeLabel.setAttribute('text-anchor', 'middle');
                edgeLabel.setAttribute('x', (startX + endX) / 2);
                edgeLabel.setAttribute('y', backEdge ? laneY - 6 : (startY + endY) / 2 - 9);
                edgeLabel.setAttribute('aria-label', fullLabel);
                edgeLabel.textContent = shortenFlowLabel(fullLabel, 30);
                var title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
                title.textContent = fullLabel;
                edgeLabel.appendChild(title);
                svg.appendChild(edgeLabel);
            }
        });

        canvas.appendChild(svg);
        var nodeLayer = ui.el('div', { class: 'flow-nodes' });
        var cardsById = Object.create(null);

        layers.forEach(function (layer, depth) {
            if (!layer || layer.length === 0) {
                return;
            }

            var label = ui.el('span', {
                class: 'flow-column-label',
                text: depth === unreachableDepth && (depth > reachableLayers || maxReachableDepth < 0)
                    ? (maxReachableDepth < 0 ? 'Sem nó inicial' : 'Fora do percurso')
                    : (depth === 0 ? 'Início' : 'Passo ' + (depth + 1)),
            });
            label.style.left = (FLOW_PADDING + depth * (FLOW_CARD_WIDTH + FLOW_COLUMN_GAP)) + 'px';
            label.style.top = '9px';
            nodeLayer.appendChild(label);

            layer.forEach(function (nodeId) {
                var node = state.model.nodes[nodeId];
                var options = flowNodeOptions(node);
                var isStart = nodeId === state.model.start_node;
                var isCurrent = nodeId === currentNodeId;
                var unreachable = !!isUnreachable[nodeId];
                var stateText = isCurrent ? 'EM TESTE' : (isStart ? 'INÍCIO' : (unreachable ? 'INALCANÇÁVEL' : ''));
                var dialogueText = nodeDialogueText(node);
                var card = ui.el('article', {
                    class: 'flow-node is-type-' + node.type
                        + (isStart ? ' is-start' : '')
                        + (isCurrent ? ' is-current' : '')
                        + (unreachable ? ' is-unreachable' : '')
                        + (options.length > 0 ? ' has-options' : ''),
                    'data-node-id': nodeId,
                    'data-dialogue-text': dialogueText || null,
                    tabindex: dialogueText ? '0' : null,
                    'aria-current': isCurrent ? 'step' : null,
                    'aria-label': (Forger.model.NODE_TYPE_LABELS[node.type] || node.type)
                        + ' · ' + nodeId
                        + (dialogueText ? ' · ' + dialogueText : '')
                        + (options.length > 0 ? ' · ' + options.length + ' opção(ões) numeradas' : '')
                        + (isCurrent ? ' · nó atual do teste' : '')
                        + (isStart ? ' · nó inicial' : '')
                        + (unreachable ? ' · fora do percurso inicial' : ''),
                }, [
                    ui.el('div', { class: 'flow-node-topline' }, [
                        ui.el('span', { class: 'flow-node-type', text: Forger.model.NODE_TYPE_LABELS[node.type] || node.type }),
                        stateText ? ui.el('span', { class: 'flow-node-state', text: stateText }) : null,
                    ]),
                    ui.el('strong', { class: 'flow-node-title', text: nodeId }),
                    ui.el('span', { class: 'flow-node-summary', text: Forger.model.nodeSummary(node) }),
                    options.length > 0 ? buildFlowOptionList(options) : null,
                ]);

                card.style.left = positions[nodeId].x + 'px';
                card.style.top = positions[nodeId].y + 'px';
                card.style.height = positions[nodeId].height + 'px';
                nodeLayer.appendChild(card);
                cardsById[nodeId] = card;
            });
        });

        canvas.appendChild(nodeLayer);
        viewport.textContent = '';
        viewport.appendChild(canvas);

        var visibleTarget = cardsById[currentNodeId] || cardsById[startId];
        if (visibleTarget) {
            keepFlowNodeVisible(viewport, visibleTarget);
        }
    }

    /** Plain spoken text used by the map card's hover preview. */
    function nodeDialogueText(node) {
        var segments = node.type === 'choice'
            ? (node.prompt && node.prompt.text)
            : node.text;

        if (!Array.isArray(segments)) return '';

        return segments.filter(function (segment) {
            return segment && ['text', 'styled_text', 'interactive_text'].includes(segment.type);
        }).map(function (segment) {
            return segment.value || '';
        }).join('').trim();
    }

    /**
     * The options a branching card lists, in author order.
     *
     * A `conditional` yields one entry per branch (its id plus a compact reading
     * of the condition), a `choice` one per choice. Everything else yields none:
     * a plain `next` is not an option, it is the only way forward.
     */
    function flowNodeOptions(node) {
        if (node.type === 'choice') {
            return (node.choices || []).map(function (choice) {
                var text = choice.text || choice.choice_id || 'Opção';
                return { text: text, short: text, target: choice.next || null };
            });
        }

        if (node.type === 'conditional') {
            return (node.branches || []).map(function (branch) {
                var text = branch.if
                    ? (branch.branch_id ? branch.branch_id + ' · ' : '') + shortConditionLabel(branch.if)
                    : (branch.branch_id || 'Caso padrão');
                return { text: text, short: compactFlowLabel(text), target: branch.next || null };
            });
        }

        return [];
    }

    /**
     * Drops the namespace a state path is already obvious without.
     *
     * A card is 205px wide, so `relationship.pacci.friendship > 10` pushing the
     * interesting part off the end is a real cost. The tooltip keeps the path the
     * author actually typed.
     */
    function compactFlowLabel(value) {
        return String(value || '').replace(/(relationship|inventory|objectives|dialogues|paths|stats|flags)\./g, '');
    }

    /** Card height grows with the option list a branching node has to print. */
    function flowCardHeight(node) {
        var optionCount = flowNodeOptions(node).length;

        if (optionCount === 0) {
            return FLOW_CARD_HEIGHT;
        }

        return FLOW_CARD_HEIGHT
            + Math.min(optionCount, FLOW_OPTION_LIMIT) * FLOW_OPTION_ROW
            + (optionCount > FLOW_OPTION_LIMIT ? FLOW_OPTION_ROW : 0);
    }

    /** The numbered option list printed inside a branching card. */
    function buildFlowOptionList(options) {
        // The text is not shortened here: the row ellipsises itself to whatever
        // the card has room for, and the full wording stays in the tooltip.
        var rows = options.slice(0, FLOW_OPTION_LIMIT).map(function (option, index) {
            return ui.el('li', { class: 'flow-node-option' }, [
                ui.el('span', { class: 'opt-num', text: String(index + 1) }),
                ui.el('span', { class: 'opt-text', text: option.short, title: option.text }),
            ]);
        });

        if (options.length > FLOW_OPTION_LIMIT) {
            rows.push(ui.el('li', {
                class: 'flow-node-option is-more',
                text: '+' + (options.length - FLOW_OPTION_LIMIT) + ' ramo(s)…',
            }));
        }

        return ui.el('ol', { class: 'flow-node-options' }, rows);
    }

    /**
     * Mean position of a node's already-placed predecessors.
     *
     * Used as the sort key within a column. Unknown predecessors report
     * `Infinity` so those nodes settle at the bottom in document order.
     */
    function flowBarycentre(nodeId, rowById, predecessors) {
        var rows = (predecessors[nodeId] || []).filter(function (predecessorId) {
            return Object.prototype.hasOwnProperty.call(rowById, predecessorId);
        }).map(function (predecessorId) {
            return rowById[predecessorId];
        });

        if (rows.length === 0) {
            return Infinity;
        }

        return rows.reduce(function (sum, row) {
            return sum + row;
        }, 0) / rows.length;
    }

    /** A small numbered token on an edge, pointing at the card's option list. */
    function drawFlowEdgeChip(svg, chip) {
        var width = chip.text.length > 2 ? 34 : 24;
        var group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        group.setAttribute('class', 'flow-edge-chip' + (chip.highlighted ? ' is-highlighted' : ''));

        var rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', chip.x - width / 2);
        rect.setAttribute('y', chip.y - 9);
        rect.setAttribute('width', width);
        rect.setAttribute('height', 18);
        rect.setAttribute('rx', 9);
        group.appendChild(rect);

        var text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', chip.x);
        text.setAttribute('y', chip.y + 4);
        text.setAttribute('text-anchor', 'middle');
        text.textContent = chip.text;
        group.appendChild(text);

        if (chip.label) {
            var title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
            title.textContent = chip.label;
            group.appendChild(title);
        }

        svg.appendChild(group);
    }

    /**
     * Outgoing map edges with the author's option wording and its 1-based
     * position attached, so the map can number an option instead of printing the
     * whole condition across the line.
     */
    function collectFlowEdges(sourceId, node) {
        var byTarget = Object.create(null);

        function add(targetId, label, optionNumber) {
            if (!targetId || !state.model.nodes[targetId]) {
                return;
            }

            byTarget[targetId] = byTarget[targetId]
                || { from: sourceId, to: targetId, labels: [], numbers: [] };

            if (label && byTarget[targetId].labels.indexOf(label) === -1) {
                byTarget[targetId].labels.push(label);
            }

            if (optionNumber && byTarget[targetId].numbers.indexOf(optionNumber) === -1) {
                byTarget[targetId].numbers.push(optionNumber);
            }
        }

        // Two options may share a destination; the edge keeps both numbers and
        // the card still lists both rows.
        flowNodeOptions(node).forEach(function (option, index) {
            add(option.target, option.text, index + 1);
        });

        if (node.type === 'line') {
            add(node.next, null, null);
            (node.text || []).forEach(function (segment) {
                if (segment.type === 'interactive_text' && segment.on_click) {
                    add(segment.on_click.next, segment.value || segment.interaction_id || 'Texto clicável', null);
                }
            });
        } else if (node.type !== 'choice' && node.type !== 'conditional') {
            add(node.next, null, null);
        }

        // Preserve forward references that may be carried by a node kind the
        // editor does not currently author, without assuming its shape.
        Forger.model.outgoingNodeIds(node).forEach(function (targetId) {
            add(targetId, null, null);
        });

        return Object.keys(byTarget).map(function (targetId) {
            return byTarget[targetId];
        });
    }

    /** A compact condition caption for a conditional branch edge. */
    function shortConditionLabel(condition, depth) {
        var nesting = depth || 0;

        if (nesting > 4) {
            return 'condição…';
        }

        if (!condition) {
            return 'caso padrão';
        }

        if (typeof condition.condition === 'string') {
            var operators = {
                equals: '=',
                not_equals: '≠',
                greater_than: '>',
                greater_or_equal: '≥',
                less_than: '<',
                less_or_equal: '≤',
            };
            var right = condition.right === true
                ? 'sim'
                : (condition.right === false ? 'não' : (condition.right === null ? 'vazio' : String(condition.right)));

            return String(condition.left || '?') + ' ' + (operators[condition.condition] || condition.condition) + ' ' + right;
        }

        if (Array.isArray(condition.all) && condition.all.length > 0) {
            return condition.all.slice(0, 2).map(function (child) {
                return shortConditionLabel(child, nesting + 1);
            }).join(' + ')
                + (condition.all.length > 2 ? ' + …' : '');
        }

        if (Array.isArray(condition.any) && condition.any.length > 0) {
            return condition.any.slice(0, 2).map(function (child) {
                return shortConditionLabel(child, nesting + 1);
            }).join(' / ')
                + (condition.any.length > 2 ? ' / …' : '');
        }

        if (condition.not) {
            return 'não ' + shortConditionLabel(condition.not, nesting + 1);
        }

        return 'condição';
    }

    function shortenFlowLabel(value, maxLength) {
        var text = String(value || '').trim();
        return text.length > maxLength ? text.slice(0, maxLength - 1) + '…' : text;
    }

    /** Scrolls only as far as needed to keep a live node card fully in view. */
    function keepFlowNodeVisible(viewport, card) {
        var width = viewport.clientWidth;
        var height = viewport.clientHeight;
        var margin = 22;

        if (!width || !height) {
            return;
        }

        var left = card.offsetLeft;
        var top = card.offsetTop;
        var right = left + card.offsetWidth;
        var bottom = top + card.offsetHeight;
        var nextLeft = viewport.scrollLeft;
        var nextTop = viewport.scrollTop;

        if (left < nextLeft + margin) {
            nextLeft = Math.max(0, left - margin);
        } else if (right > nextLeft + width - margin) {
            nextLeft = right - width + margin;
        }

        if (top < nextTop + margin) {
            nextTop = Math.max(0, top - margin);
        } else if (bottom > nextTop + height - margin) {
            nextTop = bottom - height + margin;
        }

        viewport.scrollLeft = nextLeft;
        viewport.scrollTop = nextTop;
    }

    /** Withdraws the pending self-advance, if there is one. */
    function clearPreviewTimer() {
        if (previewTimer !== null) {
            window.clearTimeout(previewTimer);
            previewTimer = null;
        }
    }

    /**
     * Plays a self-advancing line the way the game does.
     *
     * A node marked `auto_advance` does not wait for the player, so the preview
     * must not either: a writer checks a cutscene by watching it run, not by
     * clicking "Continuar" through every line of it. Choices never carry the
     * flag, so the walk still stops wherever a decision is needed.
     */
    function schedulePreviewAutoAdvance(session) {
        if (!session || session.completed || !session.node) {
            return;
        }

        if (session.node.auto_advance !== true) {
            return;
        }

        previewTimer = window.setTimeout(function () {
            previewTimer = null;

            if (state.session !== session) {
                return;
            }

            Forger.preview.advance(session);
            renderPreview();
        }, PREVIEW_AUTO_ADVANCE_MS);
    }

    /** The current preview node, its options and its clickable segments. */
    function renderPreviewNode(session) {
        var node = session.node;
        var box = ui.el('div', {});
        var isChoice = node.type === 'choice';
        var prompt = isChoice ? (node.prompt || {}) : null;
        var speaker = isChoice ? (prompt.speaker_id || '(sem falante)') : (node.speaker_id || '(sem falante)');
        var emotion = isChoice ? prompt.emotion : node.emotion;

        // A question is a line, so it is read from the same place a line's text
        // is. Clickable segments are part of the sentence the player reads, so
        // they are inlined here as well as being offered as buttons below.
        var text = (isChoice ? (prompt.text || []) : (node.text || []))
            .filter(function (segment) {
                return segment.type === 'text'
                    || segment.type === 'styled_text'
                    || segment.type === 'interactive_text';
            }).map(function (segment) {
                return segment.value;
            }).join('');

        ui.append(box, ui.el('div', { class: 'preview-node' }, [
            ui.el('div', { class: 'speaker', text: (speaker || '(sem falante)') + (emotion ? ' · ' + emotion : '') }),
            ui.el('div', { text: text }),
        ]));

        // The line will move on by itself, so say so: a writer watching the panel
        // should not be left wondering whether their click was needed.
        if (!isChoice && node.auto_advance === true) {
            ui.append(box, ui.el('div', {
                class: 'small muted',
                text: '⏩ Avanço automático — segue sozinho.',
            }));
        }

        if (isChoice) {
            ui.append(box, ui.el('div', { class: 'preview-choices' }, session.choices.map(function (choice) {
                return ui.el('button', {
                    type: 'button',
                    class: 'btn preview-choice',
                    disabled: !choice.enabled,
                    title: choice.disabled_reason || '',
                    text: choice.text + (choice.enabled ? '' : '  (bloqueada)'),
                    on: {
                        click: function () {
                            Forger.preview.choose(state.session, choice.choice_id);
                            renderPreview();
                        },
                    },
                });
            })));
        } else if (session.interactions.length > 0) {
            ui.append(box, ui.el('div', { class: 'preview-choices' }, session.interactions.map(function (interaction) {
                return ui.button({
                    label: '↳ ' + interaction.label,
                    title: interaction.optional ? 'Texto clicável (opcional)' : 'Texto clicável (obrigatório)',
                    onClick: function () {
                        Forger.preview.click(state.session, interaction.interaction_id);
                        renderPreview();
                    },
                });
            })));
        }

        return box;
    }

    /* ------------------------------------------------------- document edits */

    /** Applies a soft patch to the selected node and refreshes the side panels. */
    function patchNode(partial) {
        var node = state.model.nodes[state.selectedNodeId];

        if (!node) {
            return;
        }

        Object.keys(partial).forEach(function (key) {
            node[key] = partial[key];
        });

        autosave();
        refresh();
    }

    /** Adds a normalized node of the selected type and links it when possible. */
    function addNode() {
        var type = document.getElementById('node-type').value;
        var newId = Forger.model.newNodeId(state.model, NODE_ID_BASES[type] || 'no');

        recordSnapshot();
        state.model.nodes[newId] = Forger.model.normalizeNode({ type: type });
        finishAddingNode(newId);
    }

    /** Selects, links and persists a newly created node. */
    function finishAddingNode(newId) {
        var previousId = state.selectedNodeId;

        // Link the node the writer was on, so building a conversation in order
        // does not require filling in "next" by hand every time.
        linkTo(previousId, newId);

        if (!state.model.start_node) {
            state.model.start_node = newId;
        }

        state.selectedNodeId = newId;

        autosave();
        render();
        flash('Nó "' + newId + '" adicionado.');
    }

    /** Points a node at another one, when it has nowhere to go yet. */
    function linkTo(fromId, toId) {
        if (!fromId || fromId === toId) {
            return;
        }

        var node = state.model.nodes[fromId];

        if (node && Forger.model.supportsNext(node.type) && !node.next) {
            node.next = toId;
        }
    }

    /** Duplicates a node, placing the copy at the end of the list. */
    function duplicateNode(nodeId) {
        recordSnapshot();

        var newId = Forger.model.newNodeId(state.model, nodeId);

        state.model.nodes[newId] = Forger.model.clone(state.model.nodes[nodeId]);
        state.selectedNodeId = newId;

        autosave();
        render();
    }

    /** Deletes a node. References to it become validation errors, which is correct. */
    function deleteNode(nodeId) {
        recordSnapshot();

        delete state.model.nodes[nodeId];

        if (state.selectedNodeId === nodeId) {
            state.selectedNodeId = Object.keys(state.model.nodes)[0] || null;
        }

        autosave();
        render();
    }

    /** Renames a node, keeping the map order and fixing the start node. */
    function renameNode(oldId, newId) {
        if (!newId || newId === oldId) {
            return;
        }

        if (state.model.nodes[newId]) {
            flash('Já existe um nó chamado "' + newId + '".', true);
            return;
        }

        recordSnapshot();

        var rebuilt = {};

        Object.keys(state.model.nodes).forEach(function (key) {
            rebuilt[key === oldId ? newId : key] = state.model.nodes[key];
        });

        state.model.nodes = rebuilt;

        if (state.model.start_node === oldId) {
            state.model.start_node = newId;
        }

        state.selectedNodeId = newId;

        autosave();
        render();
    }

    /** Changes a node's kind, keeping the fields the new kind also uses. */
    function changeNodeType(nodeId, type) {
        recordSnapshot();

        var node = state.model.nodes[nodeId];

        state.model.nodes[nodeId] = Forger.model.normalizeNode(
            Object.assign({}, node, { type: type }),
        );

        autosave();
        render();
    }

    /** Marks a node as the conversation's entry point. */
    function setStartNode(nodeId) {
        recordSnapshot();

        state.model.start_node = nodeId;

        autosave();
        render();
        flash('"' + nodeId + '" é agora o nó inicial.');
    }

    /** Selects a node and rebuilds the editor. */
    function selectNode(nodeId) {
        state.selectedNodeId = nodeId;
        render();
    }

    /** Swaps the whole document, for New / Import. */
    function replaceDocument(model, fileName, message) {
        state.model = model;
        state.fileName = fileName || null;
        state.selectedNodeId = Object.keys(model.nodes)[0] || null;
        state.parseErrors = {};
        state.session = null;

        resetHistory();
        autosave();
        render();
        flash(message);
    }

    /* ------------------------------------------------------ import / export */

    /** Parses YAML text into the editor. */
    function importText(text, fileName) {
        var parsed = Forger.yaml.parse(text);

        if (!parsed.ok) {
            flash('YAML inválido: ' + parsed.error, true);
            return;
        }

        if (!parsed.value || typeof parsed.value !== 'object') {
            flash('O ficheiro não contém um diálogo.', true);
            return;
        }

        replaceDocument(
            Forger.model.normalize(parsed.value),
            fileName || null,
            'Diálogo importado' + (fileName ? ' de "' + fileName + '"' : '') + '.',
        );
    }

    /** Copies the generated YAML to the clipboard, with a visible fallback. */
    function copyYaml() {
        var text = currentYaml();

        showExport(text);

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                flash('YAML copiado para a área de transferência.');
            }, function () {
                flash('Não consegui usar a área de transferência; o YAML está em baixo para copiar à mão.', true);
            });

            return;
        }

        flash('A área de transferência não está disponível; o YAML está em baixo para copiar à mão.', true);
    }

    /** Downloads the generated YAML as a `.yaml` file. */
    function downloadYaml() {
        var name = (state.model.dialogue_id || 'dialogo') + '.yaml';
        var blob = new Blob([currentYaml()], { type: 'application/yaml;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');

        link.href = url;
        link.download = name;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        flash('Descarregado como ' + name + '.');
    }

    /** The YAML for the current document. */
    function currentYaml() {
        return Forger.serializer.serialize(state.model);
    }

    /** Shows the generated YAML in the export box. */
    function showExport(text) {
        var box = document.getElementById('export-output');

        box.value = text;
        document.getElementById('export-details').setAttribute('open', 'open');
    }

    /* ------------------------------------------------------------- undo/redo */

    function undo() {
        var previous = state.history.undo(Forger.model.clone(state.model));

        if (!previous) {
            return;
        }

        state.model = previous;
        state.lastRecorded = JSON.stringify(state.model);

        ensureSelection();
        autosave();
        render();
    }

    function redo() {
        var next = state.history.redo(Forger.model.clone(state.model));

        if (!next) {
            return;
        }

        state.model = next;
        state.lastRecorded = JSON.stringify(state.model);

        ensureSelection();
        autosave();
        render();
    }

    /* --------------------------------------------------------------- helpers */

    /** Keeps the selection pointing at a node that still exists. */
    function ensureSelection() {
        if (state.selectedNodeId && state.model.nodes[state.selectedNodeId]) {
            return;
        }

        state.selectedNodeId = Object.keys(state.model.nodes)[0] || null;
    }

    /** Nodes with an outgoing reference that does not resolve. */
    function collectBrokenNodes() {
        var broken = {};

        Object.keys(state.model.nodes).forEach(function (nodeId) {
            Forger.model.outgoingNodeIds(state.model.nodes[nodeId]).forEach(function (target) {
                if (!state.model.nodes[target]) {
                    broken[nodeId] = true;
                }
            });
        });

        return broken;
    }

    /** The node id an issue path belongs to, if any. */
    function nodeIdFromPath(path) {
        var match = /^nodes\.([^.]+)/.exec(path || '');

        return match && state.model.nodes[match[1]] ? match[1] : null;
    }

    /** The suggestion lists handed to the editors. */
    function buildLists() {
        var preview = state.previewState || {};
        var flags = [];
        var stats = [];
        var objectives = [];

        Object.keys(preview.flags || {}).forEach(function (key) {
            flags.push('flags.' + key);
        });

        Object.keys(preview.stats || {}).forEach(function (key) {
            stats.push('stats.' + key);
        });

        Object.keys(preview.objectives || {}).forEach(function (key) {
            objectives.push(key);
        });

        var characters = Forger.catalogue.characters();

        return {
            nodes: Object.keys(state.model.nodes),
            characters: characters,
            allCharacters: characters,
            items: Forger.catalogue.items(),
            dialogues: Forger.catalogue.dialogues(),
            objectives: objectives,
            stats: stats,
            flags: flags,
            animations: [],
            emotions: [],
            positions: [],
            directions: [],
            results: [],
        };
    }

    /** Full state paths the preview state actually contains, for autocomplete. */
    function suggestedPaths() {
        var preview = state.previewState || {};
        var paths = [];

        ['flags', 'inventory', 'stats'].forEach(function (root) {
            Object.keys(preview[root] || {}).forEach(function (key) {
                paths.push(root + '.' + key);
            });
        });

        // A relationship path is three segments, so a character on its own is not
        // a path — only each of its kinds is. Duck-typed rather than validated: a
        // flat number has no keys, so a state still in the old shape simply
        // suggests nothing instead of throwing.
        Object.keys(preview.relationship || {}).forEach(function (characterId) {
            Object.keys(preview.relationship[characterId] || {}).forEach(function (kind) {
                paths.push('relationship.' + characterId + '.' + kind);
            });
        });

        Object.keys(preview.objectives || {}).forEach(function (key) {
            paths.push('objectives.' + key);
        });

        paths.push('dialogues.seen', 'paths.unlocked');

        return paths;
    }

    /** The one-line validation summary. */
    function describeReport() {
        var errors = state.report.errors.length;
        var warnings = state.report.warnings.length;

        return errors + (errors === 1 ? ' erro' : ' erros')
            + ' · ' + warnings + (warnings === 1 ? ' aviso' : ' avisos');
    }

    /** Writes the draft, debounced. */
    function autosave() {
        if (autosaveTimer) {
            window.clearTimeout(autosaveTimer);
        }

        setSaveStatus('A guardar neste dispositivo…', 'saving');

        autosaveTimer = window.setTimeout(function () {
            var saved = Forger.draftStorage.save(state.model);
            setSaveStatus(saved
                ? 'Guardado neste dispositivo'
                : 'Não foi possível guardar neste dispositivo', saved ? '' : 'error');
            autosaveTimer = null;
        }, AUTOSAVE_DELAY_MS);
    }

    /** Updates the persistent save indicator without replacing action feedback. */
    function setSaveStatus(message, status) {
        var wrapper = document.querySelector('.save-state');

        document.getElementById('save-label').textContent = message;
        wrapper.classList.toggle('is-saving', status === 'saving');
        wrapper.classList.toggle('is-error', status === 'error');
    }

    /** Shows a short status message. */
    function flash(message, isError) {
        var status = document.getElementById('status');

        status.textContent = message || '';
        status.style.color = isError ? 'var(--error)' : 'var(--muted)';
    }

    /**
     * A small scripting surface.
     *
     * Lets the tool be driven from the console — or from a browser-automation
     * run — without reaching into the DOM or the private state. Handy for
     * checking that import → export → import is lossless.
     */
    Forger.app = {
        getModel: function () {
            return Forger.model.clone(state.model);
        },
        importText: importText,
        currentYaml: currentYaml,
        validate: function () {
            return Forger.validator.validate(state.model, {
                fileName: state.fileName,
                parseErrors: state.parseErrors,
            });
        },
    };

    document.addEventListener('DOMContentLoaded', boot);
})(window.DialogueForger);
