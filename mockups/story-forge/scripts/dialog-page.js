(function () {
  "use strict";

  const content = window.StoryForgeContent || {};
  const help = window.StoryForgeHelp || {};
  const common = window.StoryForgeCommon;

  const state = {
    dialogs: [],
    selectedDialogIndex: -1,
    dirtyDialog: false,
  };

  const refs = {
    pickDialogsBtn: document.getElementById("pickDialogsBtn"),
    newDialogBtn: document.getElementById("newDialogBtn"),
    removeDialogBtn: document.getElementById("removeDialogBtn"),
    copyDialogYamlBtn: document.getElementById("copyDialogYamlBtn"),
    downloadDialogYamlBtn: document.getElementById("downloadDialogYamlBtn"),

    dialogsFolderInput: document.getElementById("dialogsFolderInput"),

    statusText: document.getElementById("statusText"),
    dirtyFlag: document.getElementById("dirtyFlag"),
    dialogCount: document.getElementById("dialogCount"),
    selectedDialogLabel: document.getElementById("selectedDialogLabel"),

    dialogSelect: document.getElementById("dialogSelect"),
    dialogId: document.getElementById("dialogId"),
    dialogSpeaker: document.getElementById("dialogSpeaker"),
    dialogSpeakerId: document.getElementById("dialogSpeakerId"),
    dialogStartNode: document.getElementById("dialogStartNode"),
    dialogNodesList: document.getElementById("dialogNodesList"),
    addDialogNodeBtn: document.getElementById("addDialogNodeBtn"),
    dialogYamlPreview: document.getElementById("dialogYamlPreview"),

    dialogMapSvg: document.getElementById("dialogMapSvg"),
    branchTooltip: document.getElementById("branchTooltip"),

    validationBox: document.getElementById("validationBox"),
    schemaReference: document.getElementById("schemaReference"),
  };

  function setStatus(message) {
    refs.statusText.textContent = message;
  }

  function markDirty() {
    state.dirtyDialog = true;
    refs.dirtyFlag.textContent = "Pending changes";
  }

  function resetDirty() {
    state.dirtyDialog = false;
    refs.dirtyFlag.textContent = "No changes";
  }

  function getSelectedDialog() {
    if (state.selectedDialogIndex < 0 || state.selectedDialogIndex >= state.dialogs.length) return null;
    return state.dialogs[state.selectedDialogIndex];
  }

  function updateCounters() {
    refs.dialogCount.textContent = `Dialogs: ${state.dialogs.length}`;
    const dialog = getSelectedDialog();
    refs.selectedDialogLabel.textContent = `Selected: ${dialog ? dialog.id || "unnamed" : "none"}`;
  }

  function normalizeCondition(condition) {
    const out = { path: String(condition.path || ""), op: "eq", value: "" };
    ["eq", "neq", "gte", "lte", "gt", "lt", "exists", "contains", "min", "max"].some((op) => {
      if (Object.prototype.hasOwnProperty.call(condition, op)) {
        out.op = op;
        out.value = condition[op];
        return true;
      }
      return false;
    });
    return out;
  }

  function normalizeAction(action) {
    const type = String(action.type || "dialog");
    const out = { type, halt_on_fail: Boolean(action.halt_on_fail) };
    if (type === "dialog") out.tree_id = String(action.tree_id || "");
    if (type === "combat") {
      out.enemies = Array.isArray(action.enemies) ? action.enemies.map(String) : [];
      out.enemies_text = out.enemies.join(", ");
    }
    if (type === "set_flag") {
      out.path = String(action.path || "");
      out.value = action.value === undefined ? "true" : action.value;
    }
    if (type === "give_item") {
      out.item_id = String(action.item_id || "");
      out.quantity = Number.isFinite(Number(action.quantity)) ? Number(action.quantity) : 1;
    }
    if (type === "emit") {
      out.event = String(action.event || "");
      out.data_text = common.safeJsonStringify(action.data && typeof action.data === "object" ? action.data : {});
    }
    if (type === "transfer_item") {
      out.item_id = String(action.item_id || "");
      out.quantity = Number.isFinite(Number(action.quantity)) ? Number(action.quantity) : 1;
      out.from = String(action.from || "player");
      out.to = String(action.to || "player");
      out.consume = action.consume === undefined ? true : Boolean(action.consume);
    }
    if (type === "relationship_change") {
      out.target_id = String(action.target_id || "");
      out.target_ids_text = Array.isArray(action.target_ids) ? action.target_ids.join(", ") : "";
      out.axis = String(action.axis || "liking");
      out.delta = action.delta === undefined ? "" : action.delta;
      out.set_to = action.set_to === undefined ? "" : action.set_to;
    }
    if (type === "set_quest_stage") {
      out.quest_id = String(action.quest_id || "");
      out.stage = action.stage === undefined ? "" : action.stage;
    }
    if (type === "set_dialog_route") {
      out.scene_id = String(action.scene_id || "");
      out.character_id = String(action.character_id || "");
      out.dialog_id = String(action.dialog_id || "");
    }
    if (type === "clear_dialog_route") {
      out.scene_id = String(action.scene_id || "");
      out.character_id = String(action.character_id || "");
    }
    return out;
  }

  function serializeAction(action) {
    const type = String(action.type || "");
    if (!type) return null;
    const out = { type };
    if (action.halt_on_fail) out.halt_on_fail = true;

    if (type === "dialog") out.tree_id = String(action.tree_id || "").trim();
    if (type === "combat") out.enemies = String(action.enemies_text || "").split(",").map((v) => v.trim()).filter(Boolean);
    if (type === "set_flag") {
      out.path = String(action.path || "").trim();
      out.value = common.parseTypedValue(action.value);
    }
    if (type === "give_item") {
      out.item_id = String(action.item_id || "").trim();
      out.quantity = Number.isFinite(Number(action.quantity)) ? Number(action.quantity) : 1;
    }
    if (type === "emit") {
      out.event = String(action.event || "").trim();
      out.data = common.parseStructuredText(action.data_text, {});
    }
    if (type === "transfer_item") {
      out.item_id = String(action.item_id || "").trim();
      out.quantity = Number.isFinite(Number(action.quantity)) ? Number(action.quantity) : 1;
      out.from = String(action.from || "player").trim() || "player";
      out.to = String(action.to || "player").trim() || "player";
      out.consume = Boolean(action.consume);
    }
    if (type === "relationship_change") {
      const targetId = String(action.target_id || "").trim();
      const targetIds = String(action.target_ids_text || "").split(",").map((v) => v.trim()).filter(Boolean);
      if (targetId) out.target_id = targetId;
      if (targetIds.length) out.target_ids = targetIds;
      out.axis = String(action.axis || "liking").trim() || "liking";
      if (String(action.delta).trim() !== "") out.delta = common.parseTypedValue(action.delta);
      if (String(action.set_to).trim() !== "") out.set_to = common.parseTypedValue(action.set_to);
    }
    if (type === "set_quest_stage") {
      out.quest_id = String(action.quest_id || "").trim();
      out.stage = common.parseTypedValue(action.stage);
    }
    if (type === "set_dialog_route") {
      out.scene_id = String(action.scene_id || "").trim();
      out.character_id = String(action.character_id || "").trim();
      out.dialog_id = String(action.dialog_id || "").trim();
    }
    if (type === "clear_dialog_route") {
      out.scene_id = String(action.scene_id || "").trim();
      out.character_id = String(action.character_id || "").trim();
    }
    return out;
  }

  function normalizeDialogChoice(choice) {
    const source = choice && typeof choice === "object" ? choice : {};
    const out = common.deepClone(content.templates.choice);
    out.label = String(source.label || "");
    out.next = source.next === null ? null : String(source.next || "");
    out.hint = source.hint === undefined ? "" : String(source.hint || "");
    out.when_text = source.when ? common.dumpYaml(source.when).trim() : "";

    out.effects = [];
    (Array.isArray(source.effects) ? source.effects : []).forEach((effect) => {
      out.effects.push({
        path: String(effect.path || ""),
        delta: effect.delta === undefined ? "" : effect.delta,
        set_to: effect.set_to === undefined ? "" : effect.set_to,
        npc: String(effect.npc || ""),
        axis: String(effect.axis || "liking"),
      });
    });

    out.requiresMode = "requires_all";
    out.requires = [];
    if (source.requires && typeof source.requires === "object") {
      out.requiresMode = "requires";
      out.requires.push(normalizeCondition(source.requires));
    } else if (Array.isArray(source.requires_all)) {
      source.requires_all.forEach((condition) => out.requires.push(normalizeCondition(condition)));
    }

    out.actions = [];
    (Array.isArray(source.actions) ? source.actions : []).forEach((action) => {
      out.actions.push(normalizeAction(action));
    });

    return out;
  }

  function normalizeDialogTree(tree) {
    const out = common.deepClone(content.templates.dialogTree);
    const source = tree && typeof tree === "object" ? tree : {};
    out.id = String(source.id || out.id);
    out.speaker = source.speaker === undefined ? "" : String(source.speaker || "");
    out.speaker_id = source.speaker_id === undefined ? "" : String(source.speaker_id || "");
    out.start_node = String(source.start_node || "start");
    out.nodes = {};

    const inputNodes = source.nodes && typeof source.nodes === "object" ? source.nodes : {};
    const entries = Object.entries(inputNodes);
    if (!entries.length) {
      out.nodes.start = common.deepClone(content.templates.dialogTree.nodes.start);
      return out;
    }

    entries.forEach(([nodeId, nodeValue]) => {
      const node = nodeValue && typeof nodeValue === "object" ? nodeValue : {};
      const normalizedNode = {
        id: String(nodeId || ""),
        text: String(node.text || ""),
        speaker: node.speaker === undefined ? "" : String(node.speaker || ""),
        speaker_id: node.speaker_id === undefined ? "" : String(node.speaker_id || ""),
        on_enter: [],
        choices: [],
      };

      (Array.isArray(node.on_enter) ? node.on_enter : []).forEach((hook) => {
        normalizedNode.on_enter.push({
          event: String(hook.event || ""),
          data_text: common.dumpYaml(hook.data && typeof hook.data === "object" ? hook.data : {}).trim(),
        });
      });

      (Array.isArray(node.choices) ? node.choices : []).forEach((choice) => {
        normalizedNode.choices.push(normalizeDialogChoice(choice));
      });

      out.nodes[normalizedNode.id] = normalizedNode;
    });

    return out;
  }

  function buildConditionObject(condition) {
    const out = { path: String(condition.path || "").trim() };
    if (!out.path) return null;
    const op = String(condition.op || "eq");
    if (op === "exists") {
      out.exists = condition.value === true || String(condition.value).trim() === "true";
      return out;
    }
    const normalizedOp = op === "min" ? "gte" : op === "max" ? "lte" : op;
    out[normalizedOp] = common.parseTypedValue(condition.value);
    return out;
  }

  function serializeDialogTree(tree) {
    const out = {
      id: String(tree.id || "").trim(),
      nodes: {},
    };

    if (String(tree.speaker || "").trim()) out.speaker = String(tree.speaker).trim();
    if (String(tree.speaker_id || "").trim()) out.speaker_id = String(tree.speaker_id).trim();
    if (String(tree.start_node || "").trim()) out.start_node = String(tree.start_node).trim();

    Object.values(tree.nodes || {}).forEach((node) => {
      const nodeId = String(node.id || "").trim();
      if (!nodeId) return;

      const row = { text: String(node.text || "") };
      if (String(node.speaker || "").trim()) row.speaker = String(node.speaker).trim();
      if (String(node.speaker_id || "").trim()) row.speaker_id = String(node.speaker_id).trim();

      if (Array.isArray(node.on_enter) && node.on_enter.length) {
        const hooks = node.on_enter
          .filter((hook) => String(hook.event || "").trim())
          .map((hook) => ({ event: String(hook.event || "").trim(), data: common.parseStructuredText(hook.data_text, {}) }));
        if (hooks.length) row.on_enter = hooks;
      }

      row.choices = (node.choices || [])
        .filter((choice) => String(choice.label || "").trim())
        .map((choice) => {
          const c = { label: String(choice.label || "").trim() };

          if (choice.next === null || String(choice.next || "").toLowerCase() === "null" || String(choice.next || "").trim() === "") {
            c.next = null;
          } else {
            c.next = String(choice.next || "").trim();
          }

          if (String(choice.hint || "").trim()) c.hint = String(choice.hint).trim();

          const reqRows = (choice.requires || []).map(buildConditionObject).filter(Boolean);
          if (reqRows.length) {
            if (choice.requiresMode === "requires") c.requires = reqRows[0];
            else c.requires_all = reqRows;
          }

          if (String(choice.when_text || "").trim()) {
            c.when = common.parseStructuredText(choice.when_text, {});
          }

          const effectRows = (choice.effects || [])
            .map((effect) => ({
              path: String(effect.path || "").trim(),
              delta: effect.delta,
              set_to: effect.set_to,
              npc: String(effect.npc || "").trim(),
              axis: String(effect.axis || "liking").trim() || "liking",
            }))
            .filter((effect) => effect.path || effect.npc)
            .map((effect) => {
              const rowEffect = {};
              if (effect.path) rowEffect.path = effect.path;
              if (effect.npc) rowEffect.npc = effect.npc;
              if (effect.axis && effect.axis !== "liking") rowEffect.axis = effect.axis;
              if (String(effect.delta).trim() !== "") rowEffect.delta = common.parseTypedValue(effect.delta);
              if (String(effect.set_to).trim() !== "") rowEffect.set_to = common.parseTypedValue(effect.set_to);
              return rowEffect;
            });
          if (effectRows.length) c.effects = effectRows;

          const actionRows = (choice.actions || []).map(serializeAction).filter(Boolean);
          if (actionRows.length) c.actions = actionRows;

          return c;
        });

      out.nodes[nodeId] = row;
    });

    return out;
  }

  function serializeSelectedDialog() {
    const dialog = getSelectedDialog();
    if (!dialog) return null;
    return serializeDialogTree(dialog);
  }

  function renderDialogSelect() {
    refs.dialogSelect.innerHTML = "";
    if (!state.dialogs.length) {
      const option = document.createElement("option");
      option.value = "-1";
      option.textContent = "(no dialog trees)";
      refs.dialogSelect.appendChild(option);
      refs.dialogSelect.value = "-1";
      return;
    }

    state.dialogs.forEach((dialog, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = dialog.id || `dialog_${index + 1}`;
      refs.dialogSelect.appendChild(option);
    });

    if (state.selectedDialogIndex < 0) state.selectedDialogIndex = 0;
    refs.dialogSelect.value = String(state.selectedDialogIndex);
  }

  function createConditionRow(condition, onChange, onRemove) {
    const card = document.createElement("div");
    card.className = "list-card";

    const grid = document.createElement("div");
    grid.className = "inline-grid";

    const pathInput = document.createElement("input");
    pathInput.placeholder = "path";
    pathInput.value = condition.path || "";

    const opSelect = document.createElement("select");
    (content.dialogConditionOps || []).forEach((op) => {
      const option = document.createElement("option");
      option.value = op;
      option.textContent = op;
      opSelect.appendChild(option);
    });
    if (![...(content.dialogConditionOps || [])].includes(condition.op)) {
      const custom = document.createElement("option");
      custom.value = condition.op;
      custom.textContent = condition.op;
      opSelect.appendChild(custom);
    }
    opSelect.value = condition.op || "eq";

    const valueInput = document.createElement("input");
    valueInput.placeholder = "value";
    valueInput.value = condition.value === undefined ? "" : String(condition.value);
    valueInput.disabled = opSelect.value === "exists";

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn tiny danger";
    removeBtn.textContent = "Remove";

    function pushUpdate() {
      onChange({ path: pathInput.value, op: opSelect.value, value: valueInput.value });
    }

    pathInput.addEventListener("input", pushUpdate);
    opSelect.addEventListener("change", () => {
      valueInput.disabled = opSelect.value === "exists";
      if (opSelect.value === "exists" && valueInput.value === "") valueInput.value = "true";
      pushUpdate();
    });
    valueInput.addEventListener("input", pushUpdate);
    removeBtn.addEventListener("click", onRemove);

    grid.appendChild(pathInput);
    grid.appendChild(opSelect);
    grid.appendChild(valueInput);
    card.appendChild(grid);
    card.appendChild(removeBtn);
    return card;
  }

  function addField(card, labelText, value, onInput, type = "text") {
    const field = document.createElement("div");
    field.className = "field";
    const label = document.createElement("label");
    label.textContent = labelText;

    let input;
    if (type === "textarea") {
      input = document.createElement("textarea");
      input.value = value === undefined ? "" : String(value);
      input.addEventListener("input", () => onInput(input.value));
    } else if (type === "checkbox") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(value);
      input.addEventListener("change", () => onInput(input.checked));
    } else {
      input = document.createElement("input");
      input.type = type;
      input.value = value === undefined ? "" : String(value);
      input.addEventListener("input", () => onInput(input.value));
    }

    field.appendChild(label);
    field.appendChild(input);
    card.appendChild(field);
    return input;
  }

  function createActionEditor(actionList, index, onChange) {
    const action = actionList[index];
    const card = document.createElement("div");
    card.className = "list-card";

    const head = document.createElement("div");
    head.className = "list-card-head";
    const title = document.createElement("div");
    title.className = "list-card-title";
    title.textContent = `Action #${index + 1}`;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn tiny danger";
    removeBtn.textContent = "Remove action";
    removeBtn.addEventListener("click", () => {
      actionList.splice(index, 1);
      onChange();
    });
    head.appendChild(title);
    head.appendChild(removeBtn);
    card.appendChild(head);

    const typeField = document.createElement("div");
    typeField.className = "field";
    const typeLabel = document.createElement("label");
    typeLabel.textContent = "type";
    const typeSelect = document.createElement("select");
    (content.actionTypes || []).forEach((type) => {
      const option = document.createElement("option");
      option.value = type;
      option.textContent = type;
      typeSelect.appendChild(option);
    });
    typeSelect.value = action.type || "dialog";
    typeSelect.addEventListener("change", () => {
      actionList[index] = normalizeAction({ type: typeSelect.value });
      onChange();
    });
    typeField.appendChild(typeLabel);
    typeField.appendChild(typeSelect);
    card.appendChild(typeField);

    addField(card, "halt_on_fail", action.halt_on_fail, (value) => {
      action.halt_on_fail = value;
      onChange();
    }, "checkbox");

    if (action.type === "dialog") {
      const field = document.createElement("div");
      field.className = "field";
      const label = document.createElement("label");
      label.textContent = "tree_id";
      const select = document.createElement("select");
      const empty = document.createElement("option");
      empty.value = "";
      empty.textContent = "(select dialog)";
      select.appendChild(empty);
      state.dialogs.forEach((dialog) => {
        const option = document.createElement("option");
        option.value = dialog.id;
        option.textContent = dialog.id;
        select.appendChild(option);
      });
      if (!Array.from(select.options).some((o) => o.value === action.tree_id)) {
        const custom = document.createElement("option");
        custom.value = String(action.tree_id || "");
        custom.textContent = String(action.tree_id || "");
        select.appendChild(custom);
      }
      select.value = action.tree_id || "";
      select.addEventListener("change", () => {
        action.tree_id = select.value;
        onChange();
      });
      field.appendChild(label);
      field.appendChild(select);
      card.appendChild(field);
    }

    if (action.type === "combat") {
      addField(card, "enemies (comma-separated ids)", action.enemies_text || "", (value) => {
        action.enemies_text = value;
        onChange();
      });
    }

    if (action.type === "set_flag") {
      addField(card, "path", action.path || "", (value) => {
        action.path = value;
        onChange();
      });
      addField(card, "value", action.value === undefined ? "true" : String(action.value), (value) => {
        action.value = value;
        onChange();
      });
    }

    if (action.type === "give_item") {
      addField(card, "item_id", action.item_id || "", (value) => {
        action.item_id = value;
        onChange();
      });
      addField(card, "quantity", action.quantity === undefined ? 1 : action.quantity, (value) => {
        action.quantity = value;
        onChange();
      }, "number");
    }

    if (action.type === "emit") {
      addField(card, "event", action.event || "", (value) => {
        action.event = value;
        onChange();
      });
      addField(card, "data (YAML or JSON)", action.data_text || "{}", (value) => {
        action.data_text = value;
        onChange();
      }, "textarea");
    }

    if (action.type === "transfer_item") {
      addField(card, "item_id", action.item_id || "", (value) => {
        action.item_id = value;
        onChange();
      });
      addField(card, "quantity", action.quantity === undefined ? 1 : action.quantity, (value) => {
        action.quantity = value;
        onChange();
      }, "number");
      addField(card, "from", action.from || "player", (value) => {
        action.from = value;
        onChange();
      });
      addField(card, "to", action.to || "player", (value) => {
        action.to = value;
        onChange();
      });
      addField(card, "consume", action.consume, (value) => {
        action.consume = value;
        onChange();
      }, "checkbox");
    }

    if (action.type === "relationship_change") {
      addField(card, "target_id", action.target_id || "", (value) => {
        action.target_id = value;
        onChange();
      });
      addField(card, "target_ids (comma-separated)", action.target_ids_text || "", (value) => {
        action.target_ids_text = value;
        onChange();
      });
      addField(card, "axis", action.axis || "liking", (value) => {
        action.axis = value;
        onChange();
      });
      addField(card, "delta", action.delta, (value) => {
        action.delta = value;
        onChange();
      });
      addField(card, "set_to", action.set_to, (value) => {
        action.set_to = value;
        onChange();
      });
    }

    if (action.type === "set_quest_stage") {
      addField(card, "quest_id", action.quest_id || "", (value) => {
        action.quest_id = value;
        onChange();
      });
      addField(card, "stage", action.stage, (value) => {
        action.stage = value;
        onChange();
      });
    }

    if (action.type === "set_dialog_route") {
      addField(card, "scene_id", action.scene_id || "", (value) => {
        action.scene_id = value;
        onChange();
      });
      addField(card, "character_id", action.character_id || "", (value) => {
        action.character_id = value;
        onChange();
      });
      addField(card, "dialog_id", action.dialog_id || "", (value) => {
        action.dialog_id = value;
        onChange();
      });
    }

    if (action.type === "clear_dialog_route") {
      addField(card, "scene_id", action.scene_id || "", (value) => {
        action.scene_id = value;
        onChange();
      });
      addField(card, "character_id", action.character_id || "", (value) => {
        action.character_id = value;
        onChange();
      });
    }

    return card;
  }

  function renderDialogEditor() {
    const dialog = getSelectedDialog();
    refs.removeDialogBtn.disabled = !dialog;
    refs.copyDialogYamlBtn.disabled = !dialog;
    refs.downloadDialogYamlBtn.disabled = !dialog;

    if (!dialog) {
      refs.dialogId.value = "";
      refs.dialogSpeaker.value = "";
      refs.dialogSpeakerId.value = "";
      refs.dialogStartNode.value = "start";
      refs.dialogNodesList.innerHTML = "";
      refs.dialogYamlPreview.textContent = "";
      renderDialogMap();
      return;
    }

    refs.dialogId.value = dialog.id || "";
    refs.dialogSpeaker.value = dialog.speaker || "";
    refs.dialogSpeakerId.value = dialog.speaker_id || "";
    refs.dialogStartNode.value = dialog.start_node || "start";

    refs.dialogNodesList.innerHTML = "";

    Object.values(dialog.nodes || {}).forEach((node, nodeIndex) => {
      const nodeCard = document.createElement("div");
      nodeCard.className = "list-card";
      nodeCard.id = `node-editor-${node.id}`;

      const nodeHead = document.createElement("div");
      nodeHead.className = "list-card-head";
      const nodeTitle = document.createElement("div");
      nodeTitle.className = "list-card-title";
      nodeTitle.textContent = `Node #${nodeIndex + 1} - ${node.id || "unnamed"}`;
      const removeNodeBtn = document.createElement("button");
      removeNodeBtn.type = "button";
      removeNodeBtn.className = "btn tiny danger";
      removeNodeBtn.textContent = "Remove node";
      removeNodeBtn.addEventListener("click", () => {
        delete dialog.nodes[node.id];
        markDirty();
        refreshAll();
      });
      nodeHead.appendChild(nodeTitle);
      nodeHead.appendChild(removeNodeBtn);
      nodeCard.appendChild(nodeHead);

      const nodeGrid = document.createElement("div");
      nodeGrid.className = "grid two";

      const nodeIdField = document.createElement("div");
      nodeIdField.className = "field";
      const nodeIdLabel = document.createElement("label");
      nodeIdLabel.textContent = "node id";
      const nodeIdInput = document.createElement("input");
      nodeIdInput.value = node.id;
      nodeIdInput.addEventListener("input", () => {
        const newId = nodeIdInput.value.trim();
        if (!newId || newId === node.id) return;
        delete dialog.nodes[node.id];
        node.id = newId;
        dialog.nodes[newId] = node;
        markDirty();
        refreshAll();
      });
      nodeIdField.appendChild(nodeIdLabel);
      nodeIdField.appendChild(nodeIdInput);

      const nodeSpeakerField = document.createElement("div");
      nodeSpeakerField.className = "field";
      const nodeSpeakerLabel = document.createElement("label");
      nodeSpeakerLabel.textContent = "speaker";
      const nodeSpeakerInput = document.createElement("input");
      nodeSpeakerInput.value = node.speaker || "";
      nodeSpeakerInput.addEventListener("input", () => {
        node.speaker = nodeSpeakerInput.value;
        markDirty();
        renderDialogYamlPreview();
      });
      nodeSpeakerField.appendChild(nodeSpeakerLabel);
      nodeSpeakerField.appendChild(nodeSpeakerInput);

      nodeGrid.appendChild(nodeIdField);
      nodeGrid.appendChild(nodeSpeakerField);
      nodeCard.appendChild(nodeGrid);

      const nodeSpeakerIdField = document.createElement("div");
      nodeSpeakerIdField.className = "field";
      const nodeSpeakerIdLabel = document.createElement("label");
      nodeSpeakerIdLabel.textContent = "speaker_id";
      const nodeSpeakerIdInput = document.createElement("input");
      nodeSpeakerIdInput.value = node.speaker_id || "";
      nodeSpeakerIdInput.addEventListener("input", () => {
        node.speaker_id = nodeSpeakerIdInput.value;
        markDirty();
        renderDialogYamlPreview();
      });
      nodeSpeakerIdField.appendChild(nodeSpeakerIdLabel);
      nodeSpeakerIdField.appendChild(nodeSpeakerIdInput);
      nodeCard.appendChild(nodeSpeakerIdField);

      const nodeTextField = document.createElement("div");
      nodeTextField.className = "field";
      const nodeTextLabel = document.createElement("label");
      nodeTextLabel.textContent = "text";
      const nodeTextArea = document.createElement("textarea");
      nodeTextArea.value = node.text || "";
      nodeTextArea.addEventListener("input", () => {
        node.text = nodeTextArea.value;
        markDirty();
        renderDialogYamlPreview();
        renderValidation();
        renderDialogMap();
      });
      nodeTextField.appendChild(nodeTextLabel);
      nodeTextField.appendChild(nodeTextArea);
      nodeCard.appendChild(nodeTextField);

      const hooksTitle = document.createElement("div");
      hooksTitle.className = "section-title with-action";
      hooksTitle.innerHTML = "<span>on_enter hooks</span>";
      const addHookBtn = document.createElement("button");
      addHookBtn.type = "button";
      addHookBtn.className = "btn tiny";
      addHookBtn.textContent = "Add hook";
      addHookBtn.addEventListener("click", () => {
        node.on_enter.push({ event: "", data_text: "{}" });
        markDirty();
        renderDialogEditor();
      });
      hooksTitle.appendChild(addHookBtn);
      nodeCard.appendChild(hooksTitle);

      const hooksList = document.createElement("div");
      hooksList.className = "list-block";
      (node.on_enter || []).forEach((hook, hookIndex) => {
        const hookCard = document.createElement("div");
        hookCard.className = "list-card";
        addField(hookCard, "event", hook.event || "", (value) => {
          hook.event = value;
          markDirty();
          renderDialogYamlPreview();
        });
        addField(hookCard, "data (YAML or JSON)", hook.data_text || "{}", (value) => {
          hook.data_text = value;
          markDirty();
          renderDialogYamlPreview();
          renderValidation();
        }, "textarea");
        const removeHookBtn = document.createElement("button");
        removeHookBtn.type = "button";
        removeHookBtn.className = "btn tiny danger";
        removeHookBtn.textContent = "Remove hook";
        removeHookBtn.addEventListener("click", () => {
          node.on_enter.splice(hookIndex, 1);
          markDirty();
          renderDialogEditor();
        });
        hookCard.appendChild(removeHookBtn);
        hooksList.appendChild(hookCard);
      });
      nodeCard.appendChild(hooksList);

      const choicesTitle = document.createElement("div");
      choicesTitle.className = "section-title with-action";
      choicesTitle.innerHTML = "<span>choices</span>";
      const addChoiceBtn = document.createElement("button");
      addChoiceBtn.type = "button";
      addChoiceBtn.className = "btn tiny";
      addChoiceBtn.textContent = "Add choice";
      addChoiceBtn.addEventListener("click", () => {
        node.choices.push(common.deepClone(content.templates.choice));
        markDirty();
        renderDialogEditor();
      });
      choicesTitle.appendChild(addChoiceBtn);
      nodeCard.appendChild(choicesTitle);

      const choicesList = document.createElement("div");
      choicesList.className = "list-block";
      (node.choices || []).forEach((choice, choiceIndex) => {
        const choiceCard = document.createElement("div");
        choiceCard.className = "list-card";

        const choiceHead = document.createElement("div");
        choiceHead.className = "list-card-head";
        const choiceTitle = document.createElement("div");
        choiceTitle.className = "list-card-title";
        choiceTitle.textContent = `Choice #${choiceIndex + 1}`;
        const removeChoiceBtn = document.createElement("button");
        removeChoiceBtn.type = "button";
        removeChoiceBtn.className = "btn tiny danger";
        removeChoiceBtn.textContent = "Remove choice";
        removeChoiceBtn.addEventListener("click", () => {
          node.choices.splice(choiceIndex, 1);
          markDirty();
          refreshAll();
        });
        choiceHead.appendChild(choiceTitle);
        choiceHead.appendChild(removeChoiceBtn);
        choiceCard.appendChild(choiceHead);

        addField(choiceCard, "label", choice.label || "", (value) => {
          choice.label = value;
          markDirty();
          renderDialogYamlPreview();
          renderDialogMap();
        });

        addField(choiceCard, "next", choice.next === null ? "null" : (choice.next || ""), (value) => {
          const parsed = value.trim();
          choice.next = parsed.toLowerCase() === "null" || parsed === "" ? null : parsed;
          markDirty();
          renderDialogYamlPreview();
          renderValidation();
          renderDialogMap();
        });

        addField(choiceCard, "hint", choice.hint || "", (value) => {
          choice.hint = value;
          markDirty();
          renderDialogYamlPreview();
          renderDialogMap();
        });

        const modeField = document.createElement("div");
        modeField.className = "field";
        const modeLabel = document.createElement("label");
        modeLabel.textContent = "condition mode";
        const modeSelect = document.createElement("select");
        ["requires_all", "requires"].forEach((mode) => {
          const option = document.createElement("option");
          option.value = mode;
          option.textContent = mode;
          modeSelect.appendChild(option);
        });
        modeSelect.value = choice.requiresMode || "requires_all";
        modeSelect.addEventListener("change", () => {
          choice.requiresMode = modeSelect.value;
          markDirty();
          renderDialogEditor();
          renderValidation();
        });
        modeField.appendChild(modeLabel);
        modeField.appendChild(modeSelect);
        choiceCard.appendChild(modeField);

        const conditionTitle = document.createElement("div");
        conditionTitle.className = "section-title with-action";
        conditionTitle.innerHTML = "<span>requires / requires_all</span>";
        const addConditionBtn = document.createElement("button");
        addConditionBtn.type = "button";
        addConditionBtn.className = "btn tiny";
        addConditionBtn.textContent = "Add condition";
        addConditionBtn.addEventListener("click", () => {
          choice.requires.push({ path: "", op: "eq", value: "" });
          markDirty();
          renderDialogEditor();
        });
        conditionTitle.appendChild(addConditionBtn);
        choiceCard.appendChild(conditionTitle);

        const conditionsList = document.createElement("div");
        conditionsList.className = "list-block";
        (choice.requires || []).forEach((condition, conditionIndex) => {
          conditionsList.appendChild(createConditionRow(condition, (updated) => {
            choice.requires[conditionIndex] = updated;
            markDirty();
            renderDialogYamlPreview();
            renderValidation();
          }, () => {
            choice.requires.splice(conditionIndex, 1);
            markDirty();
            renderDialogEditor();
          }));
        });
        choiceCard.appendChild(conditionsList);

        addField(choiceCard, "when (all/any/not) - YAML or JSON", choice.when_text || "", (value) => {
          choice.when_text = value;
          markDirty();
          renderDialogYamlPreview();
          renderValidation();
        }, "textarea");

        const effectsTitle = document.createElement("div");
        effectsTitle.className = "section-title with-action";
        effectsTitle.innerHTML = "<span>effects</span>";
        const addEffectBtn = document.createElement("button");
        addEffectBtn.type = "button";
        addEffectBtn.className = "btn tiny";
        addEffectBtn.textContent = "Add effect";
        addEffectBtn.addEventListener("click", () => {
          choice.effects.push(common.deepClone(content.templates.effect));
          markDirty();
          renderDialogEditor();
        });
        effectsTitle.appendChild(addEffectBtn);
        choiceCard.appendChild(effectsTitle);

        const effectsList = document.createElement("div");
        effectsList.className = "list-block";
        (choice.effects || []).forEach((effect, effectIndex) => {
          const effectCard = document.createElement("div");
          effectCard.className = "list-card";
          addField(effectCard, "path", effect.path || "", (value) => {
            effect.path = value;
            markDirty();
            renderDialogYamlPreview();
            renderDialogMap();
          });
          addField(effectCard, "delta", effect.delta, (value) => {
            effect.delta = value;
            markDirty();
            renderDialogYamlPreview();
            renderDialogMap();
          });
          addField(effectCard, "set_to", effect.set_to, (value) => {
            effect.set_to = value;
            markDirty();
            renderDialogYamlPreview();
            renderDialogMap();
          });
          addField(effectCard, "npc", effect.npc || "", (value) => {
            effect.npc = value;
            markDirty();
            renderDialogYamlPreview();
            renderDialogMap();
          });

          const axisField = document.createElement("div");
          axisField.className = "field";
          const axisLabel = document.createElement("label");
          axisLabel.textContent = "axis";
          const axisSelect = document.createElement("select");
          (content.relationAxes || []).forEach((axis) => {
            const option = document.createElement("option");
            option.value = axis;
            option.textContent = axis;
            axisSelect.appendChild(option);
          });
          axisSelect.value = effect.axis || "liking";
          axisSelect.addEventListener("change", () => {
            effect.axis = axisSelect.value;
            markDirty();
            renderDialogYamlPreview();
            renderDialogMap();
          });
          axisField.appendChild(axisLabel);
          axisField.appendChild(axisSelect);
          effectCard.appendChild(axisField);

          const removeEffectBtn = document.createElement("button");
          removeEffectBtn.type = "button";
          removeEffectBtn.className = "btn tiny danger";
          removeEffectBtn.textContent = "Remove effect";
          removeEffectBtn.addEventListener("click", () => {
            choice.effects.splice(effectIndex, 1);
            markDirty();
            renderDialogEditor();
          });
          effectCard.appendChild(removeEffectBtn);
          effectsList.appendChild(effectCard);
        });
        choiceCard.appendChild(effectsList);

        const actionsTitle = document.createElement("div");
        actionsTitle.className = "section-title with-action";
        actionsTitle.innerHTML = "<span>actions</span>";
        const addActionBtn = document.createElement("button");
        addActionBtn.type = "button";
        addActionBtn.className = "btn tiny";
        addActionBtn.textContent = "Add action";
        addActionBtn.addEventListener("click", () => {
          choice.actions.push(normalizeAction({ type: "dialog" }));
          markDirty();
          renderDialogEditor();
        });
        actionsTitle.appendChild(addActionBtn);
        choiceCard.appendChild(actionsTitle);

        const actionsList = document.createElement("div");
        actionsList.className = "list-block";
        (choice.actions || []).forEach((_action, actionIndex) => {
          actionsList.appendChild(createActionEditor(choice.actions, actionIndex, () => {
            markDirty();
            renderDialogEditor();
            renderDialogYamlPreview();
            renderValidation();
            renderDialogMap();
          }));
        });
        choiceCard.appendChild(actionsList);

        choicesList.appendChild(choiceCard);
      });
      nodeCard.appendChild(choicesList);
      refs.dialogNodesList.appendChild(nodeCard);
    });

    renderDialogYamlPreview();
    renderDialogMap();
  }

  function renderDialogYamlPreview() {
    const dialog = getSelectedDialog();
    if (!dialog) {
      refs.dialogYamlPreview.textContent = "";
      return;
    }
    try {
      refs.dialogYamlPreview.textContent = common.dumpYaml(serializeDialogTree(dialog));
    } catch (error) {
      refs.dialogYamlPreview.textContent = `# YAML generation error\n${error.message}`;
    }
  }

  function summarizeChoiceEffects(choice) {
    const lines = [];

    (choice.effects || []).forEach((effect) => {
      if (String(effect.npc || "").trim()) {
        const axis = String(effect.axis || "liking").trim() || "liking";
        if (String(effect.delta).trim() !== "") {
          const delta = Number(effect.delta);
          if (!Number.isNaN(delta)) {
            lines.push(`${delta >= 0 ? "Increase" : "Decrease"} ${effect.npc} ${axis} by ${Math.abs(delta)}.`);
          } else {
            lines.push(`Set ${effect.npc} ${axis} delta to ${effect.delta}.`);
          }
        }
        if (String(effect.set_to).trim() !== "") {
          lines.push(`Set ${effect.npc} ${axis} to ${effect.set_to}.`);
        }
      } else if (String(effect.path || "").trim()) {
        if (String(effect.delta).trim() !== "") lines.push(`Change ${effect.path} by ${effect.delta}.`);
        if (String(effect.set_to).trim() !== "") lines.push(`Set ${effect.path} to ${effect.set_to}.`);
      }
    });

    (choice.actions || []).forEach((action) => {
      const type = action.type;
      if (type === "give_item") {
        lines.push(`Gain ${action.quantity || 1}x ${action.item_id || "item"}.`);
      } else if (type === "transfer_item") {
        lines.push(`Transfer ${action.quantity || 1}x ${action.item_id || "item"} from ${action.from || "player"} to ${action.to || "player"}.`);
      } else if (type === "relationship_change") {
        const targets = [String(action.target_id || "").trim(), ...String(action.target_ids_text || "").split(",").map((v) => v.trim()).filter(Boolean)].filter(Boolean);
        const axis = action.axis || "liking";
        if (String(action.delta).trim() !== "") {
          lines.push(`Change ${axis} for ${targets.join(", ") || "target"} by ${action.delta}.`);
        }
        if (String(action.set_to).trim() !== "") {
          lines.push(`Set ${axis} for ${targets.join(", ") || "target"} to ${action.set_to}.`);
        }
      } else if (type === "set_flag") {
        lines.push(`Set ${action.path || "flag"} to ${action.value}.`);
      } else if (type === "set_quest_stage") {
        lines.push(`Set quest ${action.quest_id || "quest"} stage to ${action.stage}.`);
      } else if (type === "set_dialog_route") {
        lines.push(`Route ${action.character_id || "character"} in ${action.scene_id || "scene"} to ${action.dialog_id || "dialog"}.`);
      } else if (type === "clear_dialog_route") {
        lines.push(`Clear dialog route for ${action.character_id || "character"} in ${action.scene_id || "scene"}.`);
      } else if (type === "dialog") {
        lines.push(`Jump to dialog ${action.tree_id || "(missing id)"}.`);
      }
    });

    if (!lines.length) lines.push("No explicit consequences.");
    return lines;
  }

  function showTooltip(x, y, title, lines) {
    refs.branchTooltip.innerHTML = "";
    const heading = document.createElement("h4");
    heading.textContent = title;
    const body = document.createElement("p");
    body.textContent = lines.join("\n");
    refs.branchTooltip.appendChild(heading);
    refs.branchTooltip.appendChild(body);
    refs.branchTooltip.style.display = "block";
    refs.branchTooltip.style.left = `${Math.round(x + 12)}px`;
    refs.branchTooltip.style.top = `${Math.round(y + 12)}px`;
  }

  function hideTooltip() {
    refs.branchTooltip.style.display = "none";
  }

  function renderDialogMap() {
    const dialog = getSelectedDialog();
    refs.dialogMapSvg.innerHTML = "";
    hideTooltip();
    if (!dialog) return;

    const nodeEntries = Object.values(dialog.nodes || {});
    if (!nodeEntries.length) return;

    const nodeW = 230;
    const nodeH = 94;
    const marginX = 70;
    const marginY = 40;
    const colGap = 260;
    const rowGap = 130;
    const cols = 3;

    const positions = new Map();
    nodeEntries.forEach((node, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      positions.set(node.id, {
        x: marginX + col * colGap,
        y: marginY + row * rowGap,
      });
    });

    const maxRow = Math.floor((nodeEntries.length - 1) / cols);
    const width = marginX * 2 + nodeW + (cols - 1) * colGap;
    const height = marginY * 2 + nodeH + maxRow * rowGap + 140;
    refs.dialogMapSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);

    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
    marker.setAttribute("id", "arrow");
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("orient", "auto");
    const arrowPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    arrowPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    arrowPath.setAttribute("fill", "rgba(109,114,202,0.9)");
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    refs.dialogMapSvg.appendChild(defs);

    nodeEntries.forEach((node) => {
      const from = positions.get(node.id);
      (node.choices || []).forEach((choice) => {
        const consequences = summarizeChoiceEffects(choice);

        if (choice.next && positions.has(choice.next)) {
          const to = positions.get(choice.next);
          const path = document.createElementNS("http://www.w3.org/2000/svg", "line");
          path.setAttribute("x1", String(from.x + nodeW));
          path.setAttribute("y1", String(from.y + nodeH / 2));
          path.setAttribute("x2", String(to.x));
          path.setAttribute("y2", String(to.y + nodeH / 2));
          path.setAttribute("class", "edge");
          path.setAttribute("marker-end", "url(#arrow)");
          path.setAttribute("data-node-id", node.id);
          path.addEventListener("mouseenter", (event) => {
            showTooltip(event.clientX, event.clientY, choice.label || "Choice", consequences);
          });
          path.addEventListener("mousemove", (event) => {
            showTooltip(event.clientX, event.clientY, choice.label || "Choice", consequences);
          });
          path.addEventListener("mouseleave", hideTooltip);
          refs.dialogMapSvg.appendChild(path);
        }

        (choice.actions || []).forEach((action) => {
          if (action.type !== "dialog") return;
          const target = String(action.tree_id || "").trim();
          if (!target) return;
          const toX = from.x + nodeW + 180;
          const toY = from.y + nodeH + 30;

          const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
          line.setAttribute("x1", String(from.x + nodeW));
          line.setAttribute("y1", String(from.y + nodeH / 2));
          line.setAttribute("x2", String(toX));
          line.setAttribute("y2", String(toY));
          line.setAttribute("class", "edge edge-cross");
          line.setAttribute("marker-end", "url(#arrow)");
          line.addEventListener("mouseenter", (event) => {
            showTooltip(event.clientX, event.clientY, `${choice.label || "Choice"} -> ${target}`, consequences);
          });
          line.addEventListener("mousemove", (event) => {
            showTooltip(event.clientX, event.clientY, `${choice.label || "Choice"} -> ${target}`, consequences);
          });
          line.addEventListener("mouseleave", hideTooltip);
          refs.dialogMapSvg.appendChild(line);

          const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
          text.setAttribute("x", String(toX + 8));
          text.setAttribute("y", String(toY));
          text.setAttribute("class", "node-meta");
          text.textContent = `dialog:${target}`;
          refs.dialogMapSvg.appendChild(text);
        });
      });
    });

    nodeEntries.forEach((node) => {
      const pos = positions.get(node.id);
      const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("class", "node");
      g.style.cursor = "pointer";
      g.addEventListener("click", () => {
        const anchor = document.getElementById(`node-editor-${node.id}`);
        if (anchor) anchor.scrollIntoView({ behavior: "smooth", block: "center" });
      });

      const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      rect.setAttribute("x", String(pos.x));
      rect.setAttribute("y", String(pos.y));
      rect.setAttribute("width", String(nodeW));
      rect.setAttribute("height", String(nodeH));
      rect.setAttribute("class", "node-card");
      g.appendChild(rect);

      const title = document.createElementNS("http://www.w3.org/2000/svg", "text");
      title.setAttribute("x", String(pos.x + 12));
      title.setAttribute("y", String(pos.y + 28));
      title.setAttribute("class", "node-title");
      title.textContent = node.id;
      g.appendChild(title);

      const subtitle = document.createElementNS("http://www.w3.org/2000/svg", "text");
      subtitle.setAttribute("x", String(pos.x + 12));
      subtitle.setAttribute("y", String(pos.y + 50));
      subtitle.setAttribute("class", "node-meta");
      subtitle.textContent = `${(node.choices || []).length} choice(s)`;
      g.appendChild(subtitle);

      const preview = document.createElementNS("http://www.w3.org/2000/svg", "text");
      preview.setAttribute("x", String(pos.x + 12));
      preview.setAttribute("y", String(pos.y + 72));
      preview.setAttribute("class", "node-meta");
      preview.textContent = String(node.text || "").slice(0, 28);
      g.appendChild(preview);

      refs.dialogMapSvg.appendChild(g);
    });
  }

  function renderSchemaReference() {
    refs.schemaReference.innerHTML = "";
    const groups = [
      ["Dialog fields", help.dialog],
      ["Dialog nodes", help.node],
      ["Dialog choices", help.choice],
      ["Dialog conditions", help.dialogConditions],
      ["Dialog effects", help.effects],
      ["Story actions in choices", help.storyActions],
      ["Condition groups", help.conditionGroups],
    ];

    groups.forEach(([title, rows]) => {
      const group = document.createElement("section");
      group.className = "schema-group";
      const heading = document.createElement("h3");
      heading.textContent = title;
      const list = document.createElement("ul");
      (rows || []).forEach((row) => {
        const li = document.createElement("li");
        li.textContent = row;
        list.appendChild(li);
      });
      group.appendChild(heading);
      group.appendChild(list);
      refs.schemaReference.appendChild(group);
    });
  }

  function renderValidation() {
    const errors = [];
    const warns = [];
    const dialogIds = new Set(state.dialogs.map((dialog) => String(dialog.id || "").trim()).filter(Boolean));

    state.dialogs.forEach((dialog, idx) => {
      const dialogId = String(dialog.id || "").trim();
      if (!dialogId) errors.push(`Dialog #${idx + 1}: id is required.`);

      const nodeIds = Object.keys(dialog.nodes || {});
      if (!nodeIds.length) errors.push(`Dialog ${dialogId || idx + 1}: must contain at least one node.`);
      if (dialog.start_node && !nodeIds.includes(dialog.start_node)) warns.push(`Dialog ${dialogId || idx + 1}: start_node '${dialog.start_node}' not found in nodes.`);

      nodeIds.forEach((nodeId) => {
        const node = dialog.nodes[nodeId];
        (node.on_enter || []).forEach((hook, hookIndex) => {
          if (!String(hook.event || "").trim()) {
            errors.push(`Dialog ${dialogId || idx + 1} node '${nodeId}' hook #${hookIndex + 1}: event is required.`);
          }
          try {
            common.parseStructuredText(hook.data_text, {});
          } catch (_error) {
            errors.push(`Dialog ${dialogId || idx + 1} node '${nodeId}' hook #${hookIndex + 1}: data invalid.`);
          }
        });

        (node.choices || []).forEach((choice, choiceIndex) => {
          if (!String(choice.label || "").trim()) {
            errors.push(`Dialog ${dialogId || idx + 1} node '${nodeId}' choice #${choiceIndex + 1}: label is required.`);
          }
          if (choice.next && !nodeIds.includes(choice.next)) {
            warns.push(`Dialog ${dialogId || idx + 1} node '${nodeId}' choice #${choiceIndex + 1}: next '${choice.next}' not found.`);
          }

          (choice.requires || []).forEach((condition, conditionIndex) => {
            if (!String(condition.path || "").trim()) {
              errors.push(`Dialog ${dialogId || idx + 1} node '${nodeId}' choice #${choiceIndex + 1} condition #${conditionIndex + 1}: path required.`);
            }
          });

          if (String(choice.when_text || "").trim()) {
            try {
              const parsedWhen = common.parseStructuredText(choice.when_text, null);
              if (!parsedWhen || typeof parsedWhen !== "object") {
                errors.push(`Dialog ${dialogId || idx + 1} node '${nodeId}' choice #${choiceIndex + 1}: when must be a group object.`);
              }
            } catch (_error) {
              errors.push(`Dialog ${dialogId || idx + 1} node '${nodeId}' choice #${choiceIndex + 1}: when is invalid YAML/JSON.`);
            }
          }

          (choice.actions || []).forEach((action, actionIndex) => {
            if (action.type === "dialog") {
              const treeId = String(action.tree_id || "").trim();
              if (!treeId) errors.push(`Dialog ${dialogId || idx + 1} node '${nodeId}' choice #${choiceIndex + 1} action #${actionIndex + 1}: tree_id required.`);
              else if (!dialogIds.has(treeId)) warns.push(`Dialog ${dialogId || idx + 1} node '${nodeId}' choice #${choiceIndex + 1} action #${actionIndex + 1}: tree_id '${treeId}' is not loaded.`);
            }
          });
        });
      });
    });

    refs.validationBox.innerHTML = "";
    if (!errors.length && !warns.length) {
      const ok = document.createElement("div");
      ok.className = "validation-item ok";
      ok.textContent = "No validation problems detected.";
      refs.validationBox.appendChild(ok);
      return;
    }

    errors.forEach((message) => {
      const row = document.createElement("div");
      row.className = "validation-item error";
      row.textContent = message;
      refs.validationBox.appendChild(row);
    });

    warns.forEach((message) => {
      const row = document.createElement("div");
      row.className = "validation-item warn";
      row.textContent = message;
      refs.validationBox.appendChild(row);
    });
  }

  function refreshAll() {
    renderDialogSelect();
    renderDialogEditor();
    updateCounters();
    renderValidation();
  }

  function addNewDialog() {
    const next = common.deepClone(content.templates.dialogTree);
    next.id = `dialog_tree_${state.dialogs.length + 1}`;
    next.nodes.start.id = "start";
    state.dialogs.push(next);
    state.selectedDialogIndex = state.dialogs.length - 1;
    markDirty();
    setStatus("New dialog tree created.");
    refreshAll();
  }

  function removeSelectedDialog() {
    if (!getSelectedDialog()) return;
    state.dialogs.splice(state.selectedDialogIndex, 1);
    if (state.selectedDialogIndex >= state.dialogs.length) {
      state.selectedDialogIndex = state.dialogs.length - 1;
    }
    markDirty();
    setStatus("Dialog tree removed.");
    refreshAll();
  }

  async function loadDialogsFromFiles(files) {
    const dialogs = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".yaml") && !file.name.toLowerCase().endsWith(".yml")) continue;
      const parsed = common.parseYaml(await file.text());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      dialogs.push(normalizeDialogTree(parsed));
    }

    if (!dialogs.length) throw new Error("No valid dialog YAML files were loaded.");

    state.dialogs = dialogs;
    state.selectedDialogIndex = 0;
    resetDirty();
    setStatus(`Loaded ${dialogs.length} dialog tree(s).`);
    refreshAll();
  }

  function attachListeners() {
    refs.pickDialogsBtn.addEventListener("click", () => {
      refs.dialogsFolderInput.value = "";
      refs.dialogsFolderInput.click();
    });

    refs.dialogsFolderInput.addEventListener("change", async (event) => {
      const files = Array.from(event.target.files || []);
      if (!files.length) return;
      try {
        await loadDialogsFromFiles(files);
      } catch (error) {
        setStatus(`Dialog load failed: ${error.message}`);
      }
    });

    refs.newDialogBtn.addEventListener("click", addNewDialog);
    refs.removeDialogBtn.addEventListener("click", removeSelectedDialog);

    refs.dialogSelect.addEventListener("change", () => {
      state.selectedDialogIndex = Number(refs.dialogSelect.value);
      renderDialogEditor();
      updateCounters();
      renderValidation();
    });

    refs.dialogId.addEventListener("input", () => {
      const dialog = getSelectedDialog();
      if (!dialog) return;
      dialog.id = refs.dialogId.value;
      markDirty();
      renderDialogSelect();
      updateCounters();
      renderDialogYamlPreview();
      renderValidation();
      renderDialogMap();
    });

    refs.dialogSpeaker.addEventListener("input", () => {
      const dialog = getSelectedDialog();
      if (!dialog) return;
      dialog.speaker = refs.dialogSpeaker.value;
      markDirty();
      renderDialogYamlPreview();
    });

    refs.dialogSpeakerId.addEventListener("input", () => {
      const dialog = getSelectedDialog();
      if (!dialog) return;
      dialog.speaker_id = refs.dialogSpeakerId.value;
      markDirty();
      renderDialogYamlPreview();
    });

    refs.dialogStartNode.addEventListener("input", () => {
      const dialog = getSelectedDialog();
      if (!dialog) return;
      dialog.start_node = refs.dialogStartNode.value;
      markDirty();
      renderDialogYamlPreview();
      renderValidation();
    });

    refs.addDialogNodeBtn.addEventListener("click", () => {
      const dialog = getSelectedDialog();
      if (!dialog) return;
      let nodeId = "node";
      let i = 1;
      while (Object.prototype.hasOwnProperty.call(dialog.nodes, nodeId)) {
        i += 1;
        nodeId = `node_${i}`;
      }
      dialog.nodes[nodeId] = {
        id: nodeId,
        text: "",
        speaker: "",
        speaker_id: "",
        on_enter: [],
        choices: [],
      };
      markDirty();
      refreshAll();
    });

    refs.copyDialogYamlBtn.addEventListener("click", async () => {
      try {
        const payload = serializeSelectedDialog();
        if (!payload) {
          setStatus("No dialog selected.");
          return;
        }
        await common.copyText(common.dumpYaml(payload));
        setStatus("Dialog YAML copied to clipboard.");
      } catch (error) {
        setStatus(`Copy failed: ${error.message}`);
      }
    });

    refs.downloadDialogYamlBtn.addEventListener("click", () => {
      try {
        const payload = serializeSelectedDialog();
        if (!payload) {
          setStatus("No dialog selected.");
          return;
        }
        common.downloadText(`${payload.id || "dialog"}.yaml`, common.dumpYaml(payload));
        setStatus("Dialog YAML downloaded.");
      } catch (error) {
        setStatus(`Download failed: ${error.message}`);
      }
    });
  }

  function bootstrap() {
    renderSchemaReference();
    attachListeners();

    const dialog = common.deepClone(content.templates.dialogTree);
    dialog.id = "dialog_tree_1";
    dialog.nodes.start.id = "start";
    state.dialogs = [dialog];
    state.selectedDialogIndex = 0;

    refreshAll();
    setStatus("Dialog editor ready. Load dialogs to start authoring.");
  }

  bootstrap();
})();
