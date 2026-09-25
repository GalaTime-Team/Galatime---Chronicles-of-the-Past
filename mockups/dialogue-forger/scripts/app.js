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
        state.selectedNodeId = Object.keys(state.model.nodes)[0] || null;
        state.lastRecorded = null;

        var previewText = Forger.draftStorage.loadPreview();
        document.getElementById('preview-state').value = previewText || Forger.templates.defaultState();
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

        document.getElementById('btn-load-fixture').addEventListener('click', loadFixture);

        document.getElementById('btn-copy').addEventListener('click', copyYaml);
        document.getElementById('btn-download').addEventListener('click', downloadYaml);

        document.getElementById('btn-validate').addEventListener('click', function () {
            renderIssues();
            flash(describeReport());
        });

        document.getElementById('btn-add-node').addEventListener('click', addNode);

        document.getElementById('btn-catalogue-import').addEventListener('click', function () {
            document.getElementById('catalogue-input').click();
        });

        document.getElementById('catalogue-input').addEventListener('change', function (event) {
            if (!event.target.files || event.target.files.length === 0) {
                return;
            }

            Forger.catalogue.importFiles(event.target.files).then(function (found) {
                renderCatalogueStatus();
                render();
                flash('Catálogo importado: ' + found.characters.length + ' personagem(ns), '
                    + found.items.length + ' item(ns), ' + found.dialogues.length + ' diálogo(s).');
            });

            event.target.value = '';
        });

        document.getElementById('btn-catalogue-reset').addEventListener('click', function () {
            Forger.catalogue.reset();
            renderCatalogueStatus();
            render();
            flash('Catálogo reposto para os valores iniciais.');
        });

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

    /* --------------------------------------------------------------- render */

    /** Rebuilds the whole UI. */
    function render() {
        renderHeader();
        renderNodeList();
        renderEditor();
        renderEntryConditions();
        renderIssues();
        renderPreview();
        renderCatalogueStatus();
    }

    /** Rebuilds only the parts that are safe to touch while typing. */
    function refresh() {
        renderNodeList();
        renderIssues();
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

        container.textContent = '';

        if (nodeIds.length === 0) {
            ui.append(container, ui.hint('Sem nós. Usa "Adicionar" para criar o primeiro.'));
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
                ui.el('div', { class: 'node-id', text: (isStart ? '▶ ' : '') + nodeId }),
                ui.el('div', { class: 'node-meta' }, [
                    (Forger.model.NODE_TYPE_LABELS[node.type] || node.type)
                        + ' · ' + Forger.model.nodeSummary(node),
                    node.auto_advance === true
                        ? ui.el('span', { class: 'badge', text: ' ⏩ auto' })
                        : null,
                    broken[nodeId] ? ui.el('span', { class: 'badge', text: ' ⚠ destino inválido' }) : null,
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
            ui.append(container, ui.hint('Escolhe um nó na lista à esquerda, ou cria um novo.'));
            return;
        }

        var node = state.model.nodes[nodeId];

        var chrome = ui.inline([
            ui.field('ID do nó', ui.text({
                value: nodeId,
                onCommit: function (value) {
                    renameNode(nodeId, value);
                },
            }), 'renomeia ao sair do campo'),
            ui.field('Tipo', ui.select({
                value: node.type,
                options: Forger.model.NODE_TYPES.map(function (type) {
                    return { value: type, label: Forger.model.NODE_TYPE_LABELS[type] };
                }),
                onChange: function (value) {
                    changeNodeType(nodeId, value);
                },
            })),
            ui.el('div', { class: 'toolbar' }, [
                ui.button({
                    label: 'Definir como início',
                    title: 'Marca este nó como o ponto de partida do diálogo',
                    onClick: function () {
                        setStartNode(nodeId);
                    },
                }),
                ui.button({
                    label: 'Duplicar',
                    onClick: function () {
                        duplicateNode(nodeId);
                    },
                }),
                ui.button({
                    label: 'Apagar',
                    variant: 'danger',
                    onClick: function () {
                        deleteNode(nodeId);
                    },
                }),
            ]),
        ]);

        ui.append(container, [chrome, Forger.nodeEditor.render({
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

    /** The entry conditions. */
    function renderEntryConditions() {
        var container = document.getElementById('entry-conditions');

        container.textContent = '';
        ui.append(container, Forger.conditionEditor.render(
            state.model.entry_conditions,
            function (next) {
                state.model.entry_conditions = next;
                autosave();
                refresh();
            },
            suggestedPaths(),
        ));
    }

    /** The validation panel. */
    function renderIssues() {
        var container = document.getElementById('issues');

        state.report = Forger.validator.validate(state.model, {
            fileName: state.fileName,
            parseErrors: state.parseErrors,
        });

        container.textContent = '';
        ui.append(container, ui.el('div', { class: 'small muted', text: describeReport() }));

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

    /** The catalogue status line. */
    function renderCatalogueStatus() {
        var container = document.getElementById('catalogue-status');
        var source = Forger.catalogue.isImported() ? 'importado' : 'valores iniciais';

        container.textContent = Forger.catalogue.characters().length + ' personagem(ns), '
            + Forger.catalogue.items().length + ' item(ns) — ' + source + '.';
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

        // Always withdrawn first: every path through this function re-arms it
        // when it still applies, and a stale timer would advance the wrong node.
        clearPreviewTimer();

        container.textContent = '';

        // There is no run before "Começar", and `render()` always draws this
        // panel, so an absent session is the normal case and not a state to
        // index into.
        if (!session) {
            ui.append(container, ui.hint('Carrega em "Começar" para jogar o diálogo.'));
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
            ui.el('div', { class: 'speaker', text: speaker || '(sem falante)' }),
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
        } else {
            ui.append(box, ui.el('div', { class: 'preview-choices' }, [
                ui.button({
                    label: 'Continuar ▸',
                    onClick: function () {
                        Forger.preview.advance(state.session);
                        renderPreview();
                    },
                }),
            ].concat(session.interactions.map(function (interaction) {
                return ui.button({
                    label: '↳ ' + interaction.label,
                    title: interaction.optional ? 'Texto clicável (opcional)' : 'Texto clicável (obrigatório)',
                    onClick: function () {
                        Forger.preview.click(state.session, interaction.interaction_id);
                        renderPreview();
                    },
                });
            }))));
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

    /** Adds a node, optionally from a template, linking it to the previous one. */
    function addNode() {
        var type = document.getElementById('node-type').value;
        var templateId = document.getElementById('node-template').value;
        var previousId = state.selectedNodeId;

        recordSnapshot();

        var newId;

        if (templateId) {
            newId = findTemplate(templateId).build(state.model);
        } else {
            newId = Forger.model.newNodeId(state.model, 'no');
            state.model.nodes[newId] = Forger.model.normalizeNode({ type: type });
        }

        // Link the node the writer was on, so building a conversation in order
        // does not require filling in "next" by hand every time.
        linkTo(previousId, newId);

        if (!state.model.start_node) {
            state.model.start_node = newId;
        }

        state.selectedNodeId = newId;

        autosave();
        render();
        flash('Nó "' + newId + '" criado.');
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

    /** Downloads the generated YAML as a `.yml` file. */
    function downloadYaml() {
        var name = (state.model.dialogue_id || 'dialogo') + '.yml';
        var blob = new Blob([currentYaml()], { type: 'text/yaml' });
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

    /**
     * Loads the real fixture from the repository.
     *
     * Only works when the page is served over http — `fetch` is blocked for
     * `file://` — so the failure is explained rather than swallowed.
     */
    function loadFixture() {
        var path = '../../apps/desktop/src/data/dialogues/test-1.yaml';

        if (!window.fetch) {
            flash('Este navegador não suporta fetch; importa o ficheiro à mão.', true);
            return;
        }

        window.fetch(path).then(function (response) {
            if (!response.ok) {
                throw new Error('HTTP ' + response.status);
            }

            return response.text();
        }).then(function (text) {
            importText(text, 'test-1');
        }).catch(function () {
            flash(
                'Não consegui ler test-1.yaml. Abre a página por http (por exemplo um servidor local) '
                + 'ou importa o ficheiro com "Importar".',
                true,
            );
        });
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

        // Characters that have entered via character_enter nodes in the model.
        // Used for the speaker field in lines/choices and for character fields
        // in enter/exit nodes, so suggestions reflect the dialogue's own cast
        // rather than the static catalogue.
        var sceneCharacters = [];
        var seen = {};

        Object.keys(state.model.nodes).forEach(function (id) {
            var node = state.model.nodes[id];

            if (node.type === 'character_enter' && node.character_id && !seen[node.character_id]) {
                seen[node.character_id] = true;
                sceneCharacters.push(node.character_id);
            }
        });

        return {
            nodes: Object.keys(state.model.nodes),
            characters: sceneCharacters,
            allCharacters: Forger.catalogue.characters(),
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

    /** Finds a template by id. */
    function findTemplate(templateId) {
        var found = Forger.templates.TEMPLATES[0];

        Forger.templates.TEMPLATES.forEach(function (template) {
            if (template.id === templateId) {
                found = template;
            }
        });

        return found;
    }

    /** The one-line validation summary. */
    function describeReport() {
        return state.report.errors.length + ' erro(s), ' + state.report.warnings.length + ' aviso(s).';
    }

    /** Writes the draft, debounced. */
    function autosave() {
        if (autosaveTimer) {
            window.clearTimeout(autosaveTimer);
        }

        autosaveTimer = window.setTimeout(function () {
            Forger.draftStorage.save(state.model);
            autosaveTimer = null;
        }, AUTOSAVE_DELAY_MS);
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
