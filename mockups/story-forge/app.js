(function () {
  "use strict";

  const content = window.StoryForgeContent || {};
  const help = window.StoryForgeHelp || {};

  const state = {
    storyEvents: [],
    dialogs: [],
    selectedStoryIndex: -1,
    selectedDialogIndex: -1,
    storySourceWasList: true,
    dirtyStory: false,
    dirtyDialog: false,
    loadedDialogFileNames: [],
  };

  const refs = {
    importStoryBtn: document.getElementById("importStoryBtn"),
    pickDialogsBtn: document.getElementById("pickDialogsBtn"),
    newStoryBtn: document.getElementById("newStoryBtn"),
    newDialogBtn: document.getElementById("newDialogBtn"),
    removeStoryBtn: document.getElementById("removeStoryBtn"),
    removeDialogBtn: document.getElementById("removeDialogBtn"),
    copyStoryYamlBtn: document.getElementById("copyStoryYamlBtn"),
    copyDialogYamlBtn: document.getElementById("copyDialogYamlBtn"),
    downloadStoryYamlBtn: document.getElementById("downloadStoryYamlBtn"),
    downloadDialogYamlBtn: document.getElementById("downloadDialogYamlBtn"),

    importStoryInput: document.getElementById("importStoryInput"),
    dialogsFolderInput: document.getElementById("dialogsFolderInput"),

    statusText: document.getElementById("statusText"),
    dirtyFlag: document.getElementById("dirtyFlag"),
    storyCount: document.getElementById("storyCount"),
    dialogCount: document.getElementById("dialogCount"),

    storySelect: document.getElementById("storySelect"),
    storyId: document.getElementById("storyId"),
    storyName: document.getElementById("storyName"),
    storyPriority: document.getElementById("storyPriority"),
    storyTrigger: document.getElementById("storyTrigger"),
    storyRepeatable: document.getElementById("storyRepeatable"),
    triggerFilterList: document.getElementById("triggerFilterList"),
    addTriggerFilterBtn: document.getElementById("addTriggerFilterBtn"),
    storyConditionsList: document.getElementById("storyConditionsList"),
    addStoryConditionBtn: document.getElementById("addStoryConditionBtn"),
    storyActionsList: document.getElementById("storyActionsList"),
    addStoryActionBtn: document.getElementById("addStoryActionBtn"),
    storyYamlPreview: document.getElementById("storyYamlPreview"),

    dialogSelect: document.getElementById("dialogSelect"),
    dialogId: document.getElementById("dialogId"),
    dialogSpeaker: document.getElementById("dialogSpeaker"),
    dialogStartNode: document.getElementById("dialogStartNode"),
    dialogNodesList: document.getElementById("dialogNodesList"),
    addDialogNodeBtn: document.getElementById("addDialogNodeBtn"),
    dialogYamlPreview: document.getElementById("dialogYamlPreview"),

    validationBox: document.getElementById("validationBox"),
    schemaReference: document.getElementById("schemaReference"),
  };

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function parseYaml(text) {
    return window.jsyaml.load(text, { schema: window.jsyaml.DEFAULT_SCHEMA });
  }

  function dumpYaml(value) {
    return window.jsyaml.dump(value, {
      lineWidth: 120,
      noRefs: true,
      condenseFlow: false,
      quotingType: '"',
    });
  }

  function setStatus(message) {
    refs.statusText.textContent = message;
  }

  function markDirty(mode) {
    if (mode === "story") {
      state.dirtyStory = true;
    }
    if (mode === "dialog") {
      state.dirtyDialog = true;
    }
    refs.dirtyFlag.textContent = state.dirtyStory || state.dirtyDialog ? "Pending changes" : "No changes";
  }

  function resetDirty(mode) {
    if (mode === "story") {
      state.dirtyStory = false;
    }
    if (mode === "dialog") {
      state.dirtyDialog = false;
    }
    refs.dirtyFlag.textContent = state.dirtyStory || state.dirtyDialog ? "Pending changes" : "No changes";
  }

  function updateCounters() {
    refs.storyCount.textContent = `Stories: ${state.storyEvents.length}`;
    refs.dialogCount.textContent = `Dialogs: ${state.dialogs.length}`;
  }

  function normalizeStoryEvent(event) {
    const out = deepClone(content.templates.storyEvent);
    const source = event && typeof event === "object" ? event : {};

    out.id = String(source.id || out.id);
    out.name = source.name === undefined ? "" : String(source.name || "");
    out.priority = Number.isFinite(Number(source.priority)) ? Number(source.priority) : 0;
    out.trigger = String(source.trigger || out.trigger);
    out.trigger_filter = source.trigger_filter && typeof source.trigger_filter === "object" ? deepClone(source.trigger_filter) : {};
    out.repeatable = Boolean(source.repeatable);

    out.conditions = [];
    if (Array.isArray(source.conditions)) {
      source.conditions.forEach((condition) => {
        const normalized = { path: String(condition.path || ""), op: "eq", value: "" };
        ["eq", "neq", "gte", "lte", "gt", "lt", "exists", "contains"].some((op) => {
          if (Object.prototype.hasOwnProperty.call(condition, op)) {
            normalized.op = op;
            normalized.value = condition[op];
            return true;
          }
          return false;
        });
        if (!Object.prototype.hasOwnProperty.call(condition, normalized.op)) {
          normalized.value = "";
        }
        out.conditions.push(normalized);
      });
    }

    out.actions = [];
    if (Array.isArray(source.actions)) {
      source.actions.forEach((action) => {
        const type = String(action.type || "dialog");
        const normalizedAction = { type };
        if (type === "dialog") {
          normalizedAction.tree_id = String(action.tree_id || "");
        } else if (type === "set_flag") {
          normalizedAction.path = String(action.path || "");
          normalizedAction.value = action.value;
        } else if (type === "give_item") {
          normalizedAction.item_id = String(action.item_id || "");
          normalizedAction.quantity = Number.isFinite(Number(action.quantity)) ? Number(action.quantity) : 1;
        } else if (type === "combat") {
          normalizedAction.enemies = Array.isArray(action.enemies) ? action.enemies.map(String) : [];
          normalizedAction.enemies_text = normalizedAction.enemies.join(", ");
        } else if (type === "emit") {
          normalizedAction.event = String(action.event || "");
          normalizedAction.data_json = JSON.stringify(action.data && typeof action.data === "object" ? action.data : {}, null, 2);
        }
        out.actions.push(normalizedAction);
      });
    }

    return out;
  }

  function normalizeDialogChoice(choice) {
    const source = choice && typeof choice === "object" ? choice : {};
    const out = deepClone(content.templates.choice);
    out.label = String(source.label || "");
    out.next = source.next === null ? null : String(source.next || "");
    out.hint = source.hint === undefined ? "" : String(source.hint || "");
    out.effects = [];
    if (Array.isArray(source.effects)) {
      source.effects.forEach((effect) => {
        out.effects.push({
          path: String(effect.path || ""),
          delta: effect.delta === undefined ? "" : effect.delta,
          set_to: effect.set_to === undefined ? "" : effect.set_to,
          npc: String(effect.npc || ""),
          axis: String(effect.axis || "liking"),
        });
      });
    }

    out.requiresMode = "requires_all";
    out.requires = [];
    if (source.requires && typeof source.requires === "object") {
      out.requiresMode = "requires";
      const r = source.requires;
      const mapped = { path: String(r.path || ""), op: "eq", value: "" };
      ["eq", "neq", "gte", "lte", "exists", "min", "max"].some((op) => {
        if (Object.prototype.hasOwnProperty.call(r, op)) {
          mapped.op = op === "min" ? "gte" : op === "max" ? "lte" : op;
          mapped.value = r[op];
          return true;
        }
        return false;
      });
      out.requires.push(mapped);
    } else if (Array.isArray(source.requires_all)) {
      source.requires_all.forEach((r) => {
        const mapped = { path: String(r.path || ""), op: "eq", value: "" };
        ["eq", "neq", "gte", "lte", "exists", "min", "max"].some((op) => {
          if (Object.prototype.hasOwnProperty.call(r, op)) {
            mapped.op = op === "min" ? "gte" : op === "max" ? "lte" : op;
            mapped.value = r[op];
            return true;
          }
          return false;
        });
        out.requires.push(mapped);
      });
    }

    return out;
  }

  function normalizeDialogTree(tree) {
    const out = deepClone(content.templates.dialogTree);
    const source = tree && typeof tree === "object" ? tree : {};
    out.id = String(source.id || out.id);
    out.speaker = source.speaker === undefined ? "" : String(source.speaker || "");
    out.start_node = String(source.start_node || "start");
    out.nodes = {};

    const inputNodes = source.nodes && typeof source.nodes === "object" ? source.nodes : {};
    const nodeEntries = Object.entries(inputNodes);
    if (!nodeEntries.length) {
      out.nodes.start = deepClone(content.templates.dialogTree.nodes.start);
      return out;
    }

    nodeEntries.forEach(([nodeId, nodeValue]) => {
      const node = nodeValue && typeof nodeValue === "object" ? nodeValue : {};
      const normalizedNode = {
        id: String(nodeId || ""),
        text: String(node.text || ""),
        speaker: node.speaker === undefined ? "" : String(node.speaker || ""),
        on_enter: [],
        choices: [],
      };

      if (Array.isArray(node.on_enter)) {
        node.on_enter.forEach((hook) => {
          let hookData = {};
          if (hook.data && typeof hook.data === "object") {
            hookData = hook.data;
          }
          normalizedNode.on_enter.push({
            event: String(hook.event || ""),
            data_json: JSON.stringify(hookData, null, 2),
          });
        });
      }

      if (Array.isArray(node.choices)) {
        node.choices.forEach((choice) => {
          normalizedNode.choices.push(normalizeDialogChoice(choice));
        });
      }

      out.nodes[normalizedNode.id] = normalizedNode;
    });

    return out;
  }

  function buildStoryConditionObject(condition) {
    const out = { path: String(condition.path || "") };
    const op = String(condition.op || "eq");
    if (op === "exists") {
      out.exists = Boolean(condition.value);
      return out;
    }
    if (op === "gte" && condition.op === "min") {
      out.gte = condition.value;
      return out;
    }
    out[op] = condition.value;
    return out;
  }

  function parseTypedValue(raw) {
    if (raw === null || raw === undefined) return "";
    if (typeof raw !== "string") return raw;
    const value = raw.trim();
    if (value === "") return "";
    if (value === "null") return null;
    if (value === "true") return true;
    if (value === "false") return false;
    if (!Number.isNaN(Number(value)) && value !== "") return Number(value);
    if ((value.startsWith("{") && value.endsWith("}")) || (value.startsWith("[") && value.endsWith("]"))) {
      try {
        return JSON.parse(value);
      } catch (_error) {
        return value;
      }
    }
    return value;
  }

  function serializeStoryEvent(event) {
    const out = {
      id: String(event.id || "").trim(),
      priority: Number.isFinite(Number(event.priority)) ? Math.trunc(Number(event.priority)) : 0,
      trigger: String(event.trigger || "scene_enter"),
    };

    if (String(event.name || "").trim()) {
      out.name = String(event.name).trim();
    }

    if (event.repeatable) {
      out.repeatable = true;
    }

    const triggerFilterEntries = Object.entries(event.trigger_filter || {}).filter(([k, v]) => String(k).trim() && String(v).trim());
    if (triggerFilterEntries.length) {
      out.trigger_filter = {};
      triggerFilterEntries.forEach(([key, value]) => {
        out.trigger_filter[String(key).trim()] = parseTypedValue(String(value));
      });
    }

    const conditions = (event.conditions || [])
      .map((condition) => ({
        path: String(condition.path || "").trim(),
        op: String(condition.op || "eq"),
        value: condition.value,
      }))
      .filter((condition) => condition.path);
    if (conditions.length) {
      out.conditions = conditions.map((condition) => {
        const row = { path: condition.path };
        if (condition.op === "exists") {
          row.exists = condition.value === true || condition.value === "true";
        } else {
          row[condition.op] = parseTypedValue(condition.value);
        }
        return row;
      });
    }

    const actions = (event.actions || []).map((action) => {
      const type = String(action.type || "dialog");
      const row = { type };
      if (type === "dialog") {
        row.tree_id = String(action.tree_id || "").trim();
      } else if (type === "set_flag") {
        row.path = String(action.path || "").trim();
        row.value = parseTypedValue(action.value);
      } else if (type === "give_item") {
        row.item_id = String(action.item_id || "").trim();
        row.quantity = Number.isFinite(Number(action.quantity)) ? Number(action.quantity) : 1;
      } else if (type === "combat") {
        const enemies = String(action.enemies_text || "")
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
        row.enemies = enemies;
      } else if (type === "emit") {
        row.event = String(action.event || "").trim();
        try {
          row.data = action.data_json ? JSON.parse(action.data_json) : {};
        } catch (_error) {
          row.data = {};
        }
      }
      return row;
    }).filter((action) => action.type);

    if (actions.length) {
      out.actions = actions;
    }

    return out;
  }

  function serializeDialogTree(tree) {
    const out = {
      id: String(tree.id || "").trim(),
      nodes: {},
    };
    if (String(tree.speaker || "").trim()) {
      out.speaker = String(tree.speaker).trim();
    }
    if (String(tree.start_node || "").trim()) {
      out.start_node = String(tree.start_node).trim();
    }

    Object.values(tree.nodes || {}).forEach((node) => {
      const nodeId = String(node.id || "").trim();
      if (!nodeId) return;
      const row = {
        text: String(node.text || ""),
      };
      if (String(node.speaker || "").trim()) {
        row.speaker = String(node.speaker).trim();
      }

      if (Array.isArray(node.on_enter) && node.on_enter.length) {
        const hooks = node.on_enter
          .filter((hook) => String(hook.event || "").trim())
          .map((hook) => {
            const line = { event: String(hook.event).trim() };
            if (String(hook.data_json || "").trim()) {
              try {
                line.data = JSON.parse(hook.data_json);
              } catch (_error) {
                line.data = {};
              }
            }
            return line;
          });
        if (hooks.length) {
          row.on_enter = hooks;
        }
      }

      row.choices = (node.choices || [])
        .filter((choice) => String(choice.label || "").trim())
        .map((choice) => {
          const c = {
            label: String(choice.label || "").trim(),
          };

          if (choice.next === null || String(choice.next || "").toLowerCase() === "null" || String(choice.next || "").trim() === "") {
            c.next = null;
          } else {
            c.next = String(choice.next || "").trim();
          }

          if (String(choice.hint || "").trim()) {
            c.hint = String(choice.hint).trim();
          }

          const reqRows = (choice.requires || [])
            .map((condition) => ({
              path: String(condition.path || "").trim(),
              op: String(condition.op || "eq"),
              value: condition.value,
            }))
            .filter((condition) => condition.path)
            .map((condition) => {
              const row = { path: condition.path };
              if (condition.op === "exists") {
                row.exists = condition.value === true || condition.value === "true";
              } else {
                row[condition.op] = parseTypedValue(condition.value);
              }
              return row;
            });

          if (reqRows.length) {
            if (choice.requiresMode === "requires") {
              c.requires = reqRows[0];
            } else {
              c.requires_all = reqRows;
            }
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
              const row = {};
              if (effect.path) row.path = effect.path;
              if (effect.npc) row.npc = effect.npc;
              if (effect.axis && effect.axis !== "liking") row.axis = effect.axis;
              if (String(effect.delta).trim() !== "") row.delta = parseTypedValue(effect.delta);
              if (String(effect.set_to).trim() !== "") row.set_to = parseTypedValue(effect.set_to);
              return row;
            });

          if (effectRows.length) {
            c.effects = effectRows;
          }

          return c;
        });

      out.nodes[nodeId] = row;
    });

    return out;
  }

  function getSelectedStory() {
    if (state.selectedStoryIndex < 0 || state.selectedStoryIndex >= state.storyEvents.length) return null;
    return state.storyEvents[state.selectedStoryIndex];
  }

  function getSelectedDialog() {
    if (state.selectedDialogIndex < 0 || state.selectedDialogIndex >= state.dialogs.length) return null;
    return state.dialogs[state.selectedDialogIndex];
  }

  function renderStorySelect() {
    refs.storySelect.innerHTML = "";
    if (!state.storyEvents.length) {
      const option = document.createElement("option");
      option.value = "-1";
      option.textContent = "(no story events)";
      refs.storySelect.appendChild(option);
      refs.storySelect.value = "-1";
      return;
    }

    state.storyEvents.forEach((event, index) => {
      const option = document.createElement("option");
      option.value = String(index);
      option.textContent = `${event.id || "event"} (${event.trigger || "scene_enter"})`;
      refs.storySelect.appendChild(option);
    });

    if (state.selectedStoryIndex < 0) state.selectedStoryIndex = 0;
    refs.storySelect.value = String(state.selectedStoryIndex);
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

  function createConditionRow(condition, context, onChange, onRemove) {
    const card = document.createElement("div");
    card.className = "list-card";

    const grid = document.createElement("div");
    grid.className = "inline-grid";

    const pathInput = document.createElement("input");
    pathInput.placeholder = "path";
    pathInput.value = condition.path || "";

    const opSelect = document.createElement("select");
    const operators = context === "story" ? content.storyConditionOps : content.dialogConditionOps;
    operators.forEach((op) => {
      const option = document.createElement("option");
      option.value = op;
      option.textContent = op;
      opSelect.appendChild(option);
    });
    opSelect.value = operators.includes(condition.op) ? condition.op : "eq";

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
      if (opSelect.value === "exists" && valueInput.value === "") {
        valueInput.value = "true";
      }
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

  function renderStoryEditor() {
    const story = getSelectedStory();
    refs.removeStoryBtn.disabled = !story;
    refs.copyStoryYamlBtn.disabled = !story;
    refs.downloadStoryYamlBtn.disabled = !story;
    if (!story) {
      refs.storyId.value = "";
      refs.storyName.value = "";
      refs.storyPriority.value = "0";
      refs.storyTrigger.value = "scene_enter";
      refs.storyRepeatable.checked = false;
      refs.triggerFilterList.innerHTML = "";
      refs.storyConditionsList.innerHTML = "";
      refs.storyActionsList.innerHTML = "";
      refs.storyYamlPreview.textContent = "";
      return;
    }

    refs.storyId.value = story.id || "";
    refs.storyName.value = story.name || "";
    refs.storyPriority.value = String(story.priority || 0);
    refs.storyTrigger.value = story.trigger || "scene_enter";
    refs.storyRepeatable.checked = Boolean(story.repeatable);

    refs.triggerFilterList.innerHTML = "";
    Object.entries(story.trigger_filter || {}).forEach(([key, value], index) => {
      const card = document.createElement("div");
      card.className = "list-card";
      const grid = document.createElement("div");
      grid.className = "inline-grid";

      const keyInput = document.createElement("input");
      keyInput.placeholder = "key";
      keyInput.value = key;
      keyInput.dataset.originalKey = key;

      const valueInput = document.createElement("input");
      valueInput.placeholder = "value";
      valueInput.value = String(value);

      const blank = document.createElement("div");
      blank.textContent = "";

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "btn tiny danger";
      removeBtn.textContent = "Remove";

      function sync() {
        const entries = Array.from(refs.triggerFilterList.querySelectorAll(".list-card")).map((row) => {
          const k = row.querySelector("input[data-key='key']").value;
          const v = row.querySelector("input[data-key='value']").value;
          return [k, v];
        }).filter(([k]) => String(k).trim());
        story.trigger_filter = {};
        entries.forEach(([k, v]) => {
          story.trigger_filter[k] = v;
        });
        markDirty("story");
        renderStoryYamlPreview();
        renderValidation();
      }

      keyInput.dataset.key = "key";
      valueInput.dataset.key = "value";
      keyInput.addEventListener("input", sync);
      valueInput.addEventListener("input", sync);
      removeBtn.addEventListener("click", () => {
        const originalKey = keyInput.dataset.originalKey || key;
        delete story.trigger_filter[originalKey];
        markDirty("story");
        renderStoryEditor();
      });

      grid.appendChild(keyInput);
      grid.appendChild(valueInput);
      grid.appendChild(blank);
      card.appendChild(grid);
      card.appendChild(removeBtn);
      refs.triggerFilterList.appendChild(card);
    });

    refs.storyConditionsList.innerHTML = "";
    (story.conditions || []).forEach((condition, index) => {
      const row = createConditionRow(condition, "story", (updated) => {
        story.conditions[index] = updated;
        markDirty("story");
        renderStoryYamlPreview();
        renderValidation();
      }, () => {
        story.conditions.splice(index, 1);
        markDirty("story");
        renderStoryEditor();
      });
      refs.storyConditionsList.appendChild(row);
    });

    refs.storyActionsList.innerHTML = "";
    (story.actions || []).forEach((action, index) => {
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
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", () => {
        story.actions.splice(index, 1);
        markDirty("story");
        renderStoryEditor();
      });
      head.appendChild(title);
      head.appendChild(removeBtn);
      card.appendChild(head);

      const typeField = document.createElement("div");
      typeField.className = "field";
      const typeLabel = document.createElement("label");
      typeLabel.textContent = "type";
      const typeSelect = document.createElement("select");
      content.actionTypes.forEach((type) => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = type;
        typeSelect.appendChild(option);
      });
      typeSelect.value = action.type || "dialog";
      typeSelect.addEventListener("change", () => {
        story.actions[index] = { type: typeSelect.value };
        if (typeSelect.value === "dialog") story.actions[index].tree_id = "";
        if (typeSelect.value === "set_flag") {
          story.actions[index].path = "";
          story.actions[index].value = "";
        }
        if (typeSelect.value === "give_item") {
          story.actions[index].item_id = "";
          story.actions[index].quantity = 1;
        }
        if (typeSelect.value === "combat") {
          story.actions[index].enemies_text = "";
        }
        if (typeSelect.value === "emit") {
          story.actions[index].event = "";
          story.actions[index].data_json = "{}";
        }
        markDirty("story");
        renderStoryEditor();
      });
      typeField.appendChild(typeLabel);
      typeField.appendChild(typeSelect);
      card.appendChild(typeField);

      if ((action.type || "") === "dialog") {
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
          markDirty("story");
          renderStoryYamlPreview();
          renderValidation();
        });
        field.appendChild(label);
        field.appendChild(select);
        card.appendChild(field);
      }

      if ((action.type || "") === "set_flag") {
        const grid = document.createElement("div");
        grid.className = "grid two";

        const pathField = document.createElement("div");
        pathField.className = "field";
        const pathLabel = document.createElement("label");
        pathLabel.textContent = "path";
        const pathInput = document.createElement("input");
        pathInput.value = action.path || "";
        pathInput.addEventListener("input", () => {
          action.path = pathInput.value;
          markDirty("story");
          renderStoryYamlPreview();
          renderValidation();
        });
        pathField.appendChild(pathLabel);
        pathField.appendChild(pathInput);

        const valueField = document.createElement("div");
        valueField.className = "field";
        const valueLabel = document.createElement("label");
        valueLabel.textContent = "value";
        const valueInput = document.createElement("input");
        valueInput.value = action.value === undefined ? "" : String(action.value);
        valueInput.addEventListener("input", () => {
          action.value = valueInput.value;
          markDirty("story");
          renderStoryYamlPreview();
          renderValidation();
        });
        valueField.appendChild(valueLabel);
        valueField.appendChild(valueInput);

        grid.appendChild(pathField);
        grid.appendChild(valueField);
        card.appendChild(grid);
      }

      if ((action.type || "") === "give_item") {
        const grid = document.createElement("div");
        grid.className = "grid two";

        const idField = document.createElement("div");
        idField.className = "field";
        const idLabel = document.createElement("label");
        idLabel.textContent = "item_id";
        const idInput = document.createElement("input");
        idInput.value = action.item_id || "";
        idInput.addEventListener("input", () => {
          action.item_id = idInput.value;
          markDirty("story");
          renderStoryYamlPreview();
          renderValidation();
        });
        idField.appendChild(idLabel);
        idField.appendChild(idInput);

        const qField = document.createElement("div");
        qField.className = "field";
        const qLabel = document.createElement("label");
        qLabel.textContent = "quantity";
        const qInput = document.createElement("input");
        qInput.type = "number";
        qInput.value = action.quantity === undefined ? "1" : String(action.quantity);
        qInput.addEventListener("input", () => {
          action.quantity = qInput.value;
          markDirty("story");
          renderStoryYamlPreview();
          renderValidation();
        });
        qField.appendChild(qLabel);
        qField.appendChild(qInput);

        grid.appendChild(idField);
        grid.appendChild(qField);
        card.appendChild(grid);
      }

      if ((action.type || "") === "combat") {
        const field = document.createElement("div");
        field.className = "field";
        const label = document.createElement("label");
        label.textContent = "enemies (comma-separated ids)";
        const input = document.createElement("input");
        if (!action.enemies_text && Array.isArray(action.enemies)) {
          action.enemies_text = action.enemies.join(", ");
        }
        input.value = action.enemies_text || "";
        input.addEventListener("input", () => {
          action.enemies_text = input.value;
          markDirty("story");
          renderStoryYamlPreview();
          renderValidation();
        });
        field.appendChild(label);
        field.appendChild(input);
        card.appendChild(field);
      }

      if ((action.type || "") === "emit") {
        const eventField = document.createElement("div");
        eventField.className = "field";
        const eventLabel = document.createElement("label");
        eventLabel.textContent = "event";
        const eventInput = document.createElement("input");
        eventInput.value = action.event || "";
        eventInput.addEventListener("input", () => {
          action.event = eventInput.value;
          markDirty("story");
          renderStoryYamlPreview();
          renderValidation();
        });
        eventField.appendChild(eventLabel);
        eventField.appendChild(eventInput);

        const dataField = document.createElement("div");
        dataField.className = "field";
        const dataLabel = document.createElement("label");
        dataLabel.textContent = "data_json";
        const dataText = document.createElement("textarea");
        dataText.value = action.data_json || "{}";
        dataText.addEventListener("input", () => {
          action.data_json = dataText.value;
          markDirty("story");
          renderStoryYamlPreview();
          renderValidation();
        });
        dataField.appendChild(dataLabel);
        dataField.appendChild(dataText);

        card.appendChild(eventField);
        card.appendChild(dataField);
      }

      refs.storyActionsList.appendChild(card);
    });

    renderStoryYamlPreview();
  }

  function createDialogConditionList(choice, contextLabel, onChange) {
    const wrapper = document.createElement("div");
    wrapper.className = "list-block";

    (choice.requires || []).forEach((condition, index) => {
      const row = createConditionRow(condition, "dialog", (updated) => {
        choice.requires[index] = updated;
        onChange();
      }, () => {
        choice.requires.splice(index, 1);
        onChange();
      });
      wrapper.appendChild(row);
    });

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn tiny";
    addBtn.textContent = `Add ${contextLabel} condition`;
    addBtn.addEventListener("click", () => {
      choice.requires.push({ path: "", op: "eq", value: "" });
      onChange();
    });
    wrapper.appendChild(addBtn);

    return wrapper;
  }

  function renderDialogEditor() {
    const dialog = getSelectedDialog();
    refs.removeDialogBtn.disabled = !dialog;
    refs.copyDialogYamlBtn.disabled = !dialog;
    refs.downloadDialogYamlBtn.disabled = !dialog;

    if (!dialog) {
      refs.dialogId.value = "";
      refs.dialogSpeaker.value = "";
      refs.dialogStartNode.value = "start";
      refs.dialogNodesList.innerHTML = "";
      refs.dialogYamlPreview.textContent = "";
      return;
    }

    refs.dialogId.value = dialog.id || "";
    refs.dialogSpeaker.value = dialog.speaker || "";
    refs.dialogStartNode.value = dialog.start_node || "start";

    refs.dialogNodesList.innerHTML = "";
    Object.values(dialog.nodes || {}).forEach((node, nodeIndex) => {
      const nodeCard = document.createElement("div");
      nodeCard.className = "list-card";

      const nodeHead = document.createElement("div");
      nodeHead.className = "list-card-head";
      const nodeTitle = document.createElement("div");
      nodeTitle.className = "list-card-title";
      nodeTitle.textContent = `Node #${nodeIndex + 1}`;
      const removeNodeBtn = document.createElement("button");
      removeNodeBtn.type = "button";
      removeNodeBtn.className = "btn tiny danger";
      removeNodeBtn.textContent = "Remove node";
      removeNodeBtn.addEventListener("click", () => {
        delete dialog.nodes[node.id];
        markDirty("dialog");
        renderDialogEditor();
        renderValidation();
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
        const newId = nodeIdInput.value;
        if (!newId) return;
        if (newId !== node.id) {
          delete dialog.nodes[node.id];
          node.id = newId;
          dialog.nodes[newId] = node;
          markDirty("dialog");
          renderDialogEditor();
          renderValidation();
        }
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
        markDirty("dialog");
        renderDialogYamlPreview();
      });
      nodeSpeakerField.appendChild(nodeSpeakerLabel);
      nodeSpeakerField.appendChild(nodeSpeakerInput);

      nodeGrid.appendChild(nodeIdField);
      nodeGrid.appendChild(nodeSpeakerField);
      nodeCard.appendChild(nodeGrid);

      const nodeTextField = document.createElement("div");
      nodeTextField.className = "field";
      const nodeTextLabel = document.createElement("label");
      nodeTextLabel.textContent = "text";
      const nodeTextArea = document.createElement("textarea");
      nodeTextArea.value = node.text || "";
      nodeTextArea.addEventListener("input", () => {
        node.text = nodeTextArea.value;
        markDirty("dialog");
        renderDialogYamlPreview();
        renderValidation();
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
        node.on_enter.push({ event: "", data_json: "{}" });
        markDirty("dialog");
        renderDialogEditor();
      });
      hooksTitle.appendChild(addHookBtn);
      nodeCard.appendChild(hooksTitle);

      const hooksList = document.createElement("div");
      hooksList.className = "list-block";
      (node.on_enter || []).forEach((hook, hookIndex) => {
        const hookCard = document.createElement("div");
        hookCard.className = "list-card";

        const hookGrid = document.createElement("div");
        hookGrid.className = "grid two";

        const eventField = document.createElement("div");
        eventField.className = "field";
        const eventLabel = document.createElement("label");
        eventLabel.textContent = "event";
        const eventInput = document.createElement("input");
        eventInput.value = hook.event || "";
        eventInput.addEventListener("input", () => {
          hook.event = eventInput.value;
          markDirty("dialog");
          renderDialogYamlPreview();
        });
        eventField.appendChild(eventLabel);
        eventField.appendChild(eventInput);

        const dataField = document.createElement("div");
        dataField.className = "field";
        const dataLabel = document.createElement("label");
        dataLabel.textContent = "data_json";
        const dataInput = document.createElement("textarea");
        dataInput.value = hook.data_json || "{}";
        dataInput.addEventListener("input", () => {
          hook.data_json = dataInput.value;
          markDirty("dialog");
          renderDialogYamlPreview();
          renderValidation();
        });
        dataField.appendChild(dataLabel);
        dataField.appendChild(dataInput);

        hookGrid.appendChild(eventField);
        hookGrid.appendChild(dataField);

        const removeHookBtn = document.createElement("button");
        removeHookBtn.type = "button";
        removeHookBtn.className = "btn tiny danger";
        removeHookBtn.textContent = "Remove hook";
        removeHookBtn.addEventListener("click", () => {
          node.on_enter.splice(hookIndex, 1);
          markDirty("dialog");
          renderDialogEditor();
        });

        hookCard.appendChild(hookGrid);
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
        node.choices.push(deepClone(content.templates.choice));
        markDirty("dialog");
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
          markDirty("dialog");
          renderDialogEditor();
          renderValidation();
        });
        choiceHead.appendChild(choiceTitle);
        choiceHead.appendChild(removeChoiceBtn);
        choiceCard.appendChild(choiceHead);

        const choiceGrid = document.createElement("div");
        choiceGrid.className = "grid two";

        const labelField = document.createElement("div");
        labelField.className = "field";
        const labelLabel = document.createElement("label");
        labelLabel.textContent = "label";
        const labelInput = document.createElement("input");
        labelInput.value = choice.label || "";
        labelInput.addEventListener("input", () => {
          choice.label = labelInput.value;
          markDirty("dialog");
          renderDialogYamlPreview();
          renderValidation();
        });
        labelField.appendChild(labelLabel);
        labelField.appendChild(labelInput);

        const nextField = document.createElement("div");
        nextField.className = "field";
        const nextLabel = document.createElement("label");
        nextLabel.textContent = "next";
        const nextInput = document.createElement("input");
        nextInput.placeholder = "node_id or null";
        nextInput.value = choice.next === null ? "null" : (choice.next || "");
        nextInput.addEventListener("input", () => {
          const value = nextInput.value.trim();
          choice.next = value.toLowerCase() === "null" || value === "" ? null : value;
          markDirty("dialog");
          renderDialogYamlPreview();
          renderValidation();
        });
        nextField.appendChild(nextLabel);
        nextField.appendChild(nextInput);

        choiceGrid.appendChild(labelField);
        choiceGrid.appendChild(nextField);

        const hintField = document.createElement("div");
        hintField.className = "field";
        const hintLabel = document.createElement("label");
        hintLabel.textContent = "hint";
        const hintInput = document.createElement("input");
        hintInput.value = choice.hint || "";
        hintInput.addEventListener("input", () => {
          choice.hint = hintInput.value;
          markDirty("dialog");
          renderDialogYamlPreview();
        });
        hintField.appendChild(hintLabel);
        hintField.appendChild(hintInput);

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
          markDirty("dialog");
          renderDialogEditor();
          renderValidation();
        });
        modeField.appendChild(modeLabel);
        modeField.appendChild(modeSelect);

        const modeGrid = document.createElement("div");
        modeGrid.className = "grid two";
        modeGrid.appendChild(hintField);
        modeGrid.appendChild(modeField);

        choiceCard.appendChild(choiceGrid);
        choiceCard.appendChild(modeGrid);

        const conditionTitle = document.createElement("div");
        conditionTitle.className = "section-title";
        conditionTitle.textContent = choice.requiresMode || "requires_all";
        choiceCard.appendChild(conditionTitle);

        choiceCard.appendChild(createDialogConditionList(choice, "dialog", () => {
          markDirty("dialog");
          renderDialogEditor();
          renderValidation();
        }));

        const effectsTitle = document.createElement("div");
        effectsTitle.className = "section-title with-action";
        effectsTitle.innerHTML = "<span>effects</span>";
        const addEffectBtn = document.createElement("button");
        addEffectBtn.type = "button";
        addEffectBtn.className = "btn tiny";
        addEffectBtn.textContent = "Add effect";
        addEffectBtn.addEventListener("click", () => {
          choice.effects.push(deepClone(content.templates.effect));
          markDirty("dialog");
          renderDialogEditor();
        });
        effectsTitle.appendChild(addEffectBtn);
        choiceCard.appendChild(effectsTitle);

        const effectsList = document.createElement("div");
        effectsList.className = "list-block";
        (choice.effects || []).forEach((effect, effectIndex) => {
          const effectCard = document.createElement("div");
          effectCard.className = "list-card";

          const effectGrid1 = document.createElement("div");
          effectGrid1.className = "grid two";
          const pathField = document.createElement("div");
          pathField.className = "field";
          const pathLabel = document.createElement("label");
          pathLabel.textContent = "path";
          const pathInput = document.createElement("input");
          pathInput.value = effect.path || "";
          pathInput.addEventListener("input", () => {
            effect.path = pathInput.value;
            markDirty("dialog");
            renderDialogYamlPreview();
          });
          pathField.appendChild(pathLabel);
          pathField.appendChild(pathInput);

          const deltaField = document.createElement("div");
          deltaField.className = "field";
          const deltaLabel = document.createElement("label");
          deltaLabel.textContent = "delta";
          const deltaInput = document.createElement("input");
          deltaInput.value = effect.delta === undefined ? "" : String(effect.delta);
          deltaInput.addEventListener("input", () => {
            effect.delta = deltaInput.value;
            markDirty("dialog");
            renderDialogYamlPreview();
          });
          deltaField.appendChild(deltaLabel);
          deltaField.appendChild(deltaInput);

          effectGrid1.appendChild(pathField);
          effectGrid1.appendChild(deltaField);

          const effectGrid2 = document.createElement("div");
          effectGrid2.className = "grid three";

          const setToField = document.createElement("div");
          setToField.className = "field";
          const setToLabel = document.createElement("label");
          setToLabel.textContent = "set_to";
          const setToInput = document.createElement("input");
          setToInput.value = effect.set_to === undefined ? "" : String(effect.set_to);
          setToInput.addEventListener("input", () => {
            effect.set_to = setToInput.value;
            markDirty("dialog");
            renderDialogYamlPreview();
          });
          setToField.appendChild(setToLabel);
          setToField.appendChild(setToInput);

          const npcField = document.createElement("div");
          npcField.className = "field";
          const npcLabel = document.createElement("label");
          npcLabel.textContent = "npc (shorthand)";
          const npcInput = document.createElement("input");
          npcInput.value = effect.npc || "";
          npcInput.addEventListener("input", () => {
            effect.npc = npcInput.value;
            markDirty("dialog");
            renderDialogYamlPreview();
          });
          npcField.appendChild(npcLabel);
          npcField.appendChild(npcInput);

          const axisField = document.createElement("div");
          axisField.className = "field";
          const axisLabel = document.createElement("label");
          axisLabel.textContent = "axis";
          const axisSelect = document.createElement("select");
          content.relationAxes.forEach((axis) => {
            const option = document.createElement("option");
            option.value = axis;
            option.textContent = axis;
            axisSelect.appendChild(option);
          });
          axisSelect.value = effect.axis || "liking";
          axisSelect.addEventListener("change", () => {
            effect.axis = axisSelect.value;
            markDirty("dialog");
            renderDialogYamlPreview();
          });
          axisField.appendChild(axisLabel);
          axisField.appendChild(axisSelect);

          effectGrid2.appendChild(setToField);
          effectGrid2.appendChild(npcField);
          effectGrid2.appendChild(axisField);

          const removeEffectBtn = document.createElement("button");
          removeEffectBtn.type = "button";
          removeEffectBtn.className = "btn tiny danger";
          removeEffectBtn.textContent = "Remove effect";
          removeEffectBtn.addEventListener("click", () => {
            choice.effects.splice(effectIndex, 1);
            markDirty("dialog");
            renderDialogEditor();
          });

          effectCard.appendChild(effectGrid1);
          effectCard.appendChild(effectGrid2);
          effectCard.appendChild(removeEffectBtn);
          effectsList.appendChild(effectCard);
        });
        choiceCard.appendChild(effectsList);

        choicesList.appendChild(choiceCard);
      });
      nodeCard.appendChild(choicesList);

      refs.dialogNodesList.appendChild(nodeCard);
    });

    renderDialogYamlPreview();
  }

  function renderStoryYamlPreview() {
    const story = getSelectedStory();
    if (!story) {
      refs.storyYamlPreview.textContent = "";
      return;
    }
    try {
      const payload = serializeStoryEvent(story);
      refs.storyYamlPreview.textContent = dumpYaml(payload);
    } catch (error) {
      refs.storyYamlPreview.textContent = `# YAML generation error\n${error.message}`;
    }
  }

  function renderDialogYamlPreview() {
    const dialog = getSelectedDialog();
    if (!dialog) {
      refs.dialogYamlPreview.textContent = "";
      return;
    }
    try {
      const payload = serializeDialogTree(dialog);
      refs.dialogYamlPreview.textContent = dumpYaml(payload);
    } catch (error) {
      refs.dialogYamlPreview.textContent = `# YAML generation error\n${error.message}`;
    }
  }

  function serializeStoryFilePayload() {
    const serialized = state.storyEvents.map(serializeStoryEvent);
    if (state.storySourceWasList) {
      return serialized;
    }
    if (serialized.length === 1) {
      return serialized[0];
    }
    return serialized;
  }

  function serializeDialogBySelection() {
    const dialog = getSelectedDialog();
    if (!dialog) return null;
    return serializeDialogTree(dialog);
  }

  function renderSchemaReference() {
    refs.schemaReference.innerHTML = "";

    function addGroup(title, rows) {
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
    }

    addGroup("Story fields", help.story);
    addGroup("Story conditions", help.storyConditions);
    addGroup("Story actions", help.storyActions);
    addGroup("Dialog fields", help.dialog);
    addGroup("Dialog nodes", help.node);
    addGroup("Dialog choices", help.choice);
    addGroup("Dialog conditions", help.dialogConditions);
    addGroup("Dialog effects", help.effects);
  }

  function renderValidation() {
    const errors = [];
    const warns = [];

    const dialogIds = new Set(state.dialogs.map((dialog) => String(dialog.id || "").trim()).filter(Boolean));

    state.storyEvents.forEach((event, idx) => {
      if (!String(event.id || "").trim()) {
        errors.push(`Story #${idx + 1}: id is required.`);
      }
      if (!content.triggers.includes(String(event.trigger || ""))) {
        errors.push(`Story ${event.id || idx + 1}: trigger '${event.trigger}' is invalid.`);
      }
      (event.conditions || []).forEach((condition, cIndex) => {
        if (!String(condition.path || "").trim()) {
          errors.push(`Story ${event.id || idx + 1} condition #${cIndex + 1}: path is required.`);
        }
      });
      (event.actions || []).forEach((action, aIndex) => {
        const type = String(action.type || "");
        if (!content.actionTypes.includes(type)) {
          errors.push(`Story ${event.id || idx + 1} action #${aIndex + 1}: unsupported type '${type}'.`);
          return;
        }
        if (type === "dialog") {
          const treeId = String(action.tree_id || "").trim();
          if (!treeId) {
            errors.push(`Story ${event.id || idx + 1} action #${aIndex + 1}: tree_id is required.`);
          } else if (!dialogIds.has(treeId)) {
            warns.push(`Story ${event.id || idx + 1} action #${aIndex + 1}: tree_id '${treeId}' is not loaded.`);
          }
        }
        if (type === "set_flag" && !String(action.path || "").trim()) {
          errors.push(`Story ${event.id || idx + 1} action #${aIndex + 1}: set_flag path is required.`);
        }
        if (type === "give_item" && !String(action.item_id || "").trim()) {
          errors.push(`Story ${event.id || idx + 1} action #${aIndex + 1}: give_item item_id is required.`);
        }
        if (type === "emit") {
          if (!String(action.event || "").trim()) {
            errors.push(`Story ${event.id || idx + 1} action #${aIndex + 1}: emit event is required.`);
          }
          try {
            JSON.parse(action.data_json || "{}");
          } catch (_error) {
            errors.push(`Story ${event.id || idx + 1} action #${aIndex + 1}: emit data_json must be valid JSON.`);
          }
        }
      });
    });

    const ids = state.storyEvents.map((event) => String(event.id || "").trim()).filter(Boolean);
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length) {
      errors.push(`Duplicate story ids: ${Array.from(new Set(duplicates)).join(", ")}.`);
    }

    state.dialogs.forEach((dialog, idx) => {
      const dialogId = String(dialog.id || "").trim();
      if (!dialogId) {
        errors.push(`Dialog #${idx + 1}: id is required.`);
      }
      const nodeIds = Object.keys(dialog.nodes || {});
      if (!nodeIds.length) {
        errors.push(`Dialog ${dialogId || idx + 1}: must contain at least one node.`);
      }
      if (dialog.start_node && !nodeIds.includes(dialog.start_node)) {
        warns.push(`Dialog ${dialogId || idx + 1}: start_node '${dialog.start_node}' not found in nodes.`);
      }
      nodeIds.forEach((nodeId) => {
        const node = dialog.nodes[nodeId];
        if (!String(node.text || "").trim()) {
          warns.push(`Dialog ${dialogId || idx + 1} node '${nodeId}': text is empty.`);
        }
        (node.on_enter || []).forEach((hook, hookIndex) => {
          if (!String(hook.event || "").trim()) {
            errors.push(`Dialog ${dialogId || idx + 1} node '${nodeId}' hook #${hookIndex + 1}: event is required.`);
          }
          try {
            JSON.parse(hook.data_json || "{}");
          } catch (_error) {
            errors.push(`Dialog ${dialogId || idx + 1} node '${nodeId}' hook #${hookIndex + 1}: data_json invalid JSON.`);
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
            if (!content.dialogConditionOps.includes(String(condition.op || ""))) {
              errors.push(`Dialog ${dialogId || idx + 1} node '${nodeId}' choice #${choiceIndex + 1} condition #${conditionIndex + 1}: invalid operator '${condition.op}'.`);
            }
          });
          (choice.effects || []).forEach((effect, effectIndex) => {
            if (!String(effect.path || "").trim() && !String(effect.npc || "").trim()) {
              errors.push(`Dialog ${dialogId || idx + 1} node '${nodeId}' choice #${choiceIndex + 1} effect #${effectIndex + 1}: path or npc required.`);
            }
          });
        });
      });
    });

    refs.validationBox.innerHTML = "";
    if (!errors.length && !warns.length) {
      const ok = document.createElement("div");
      ok.className = "validation-item";
      ok.style.borderColor = "#2d6f44";
      ok.style.background = "rgba(26, 77, 43, 0.45)";
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

  async function readFileText(file) {
    if (!file) return "";
    return file.text();
  }

  async function importStoryFromFile(file) {
    const text = await readFileText(file);
    const parsed = parseYaml(text);
    if (Array.isArray(parsed)) {
      state.storySourceWasList = true;
      state.storyEvents = parsed.map(normalizeStoryEvent);
    } else if (parsed && typeof parsed === "object") {
      state.storySourceWasList = false;
      state.storyEvents = [normalizeStoryEvent(parsed)];
    } else {
      throw new Error("Story YAML must be an object or a list of objects.");
    }

    state.selectedStoryIndex = state.storyEvents.length ? 0 : -1;
    resetDirty("story");
    setStatus(`Loaded story file with ${state.storyEvents.length} event(s).`);
    refreshAll();
  }

  async function loadDialogsFromFiles(files) {
    const dialogs = [];
    const names = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".yaml") && !file.name.toLowerCase().endsWith(".yml")) {
        continue;
      }
      const text = await file.text();
      const parsed = parseYaml(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        continue;
      }
      dialogs.push(normalizeDialogTree(parsed));
      names.push(file.name);
    }

    if (!dialogs.length) {
      throw new Error("No valid dialog YAML files were loaded.");
    }

    state.dialogs = dialogs;
    state.loadedDialogFileNames = names;
    state.selectedDialogIndex = 0;
    resetDirty("dialog");
    setStatus(`Loaded ${dialogs.length} dialog tree(s).`);
    refreshAll();
  }

  async function copyText(value, message) {
    await navigator.clipboard.writeText(value);
    setStatus(message);
  }

  function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function refreshAll() {
    renderStorySelect();
    renderDialogSelect();
    renderStoryEditor();
    renderDialogEditor();
    updateCounters();
    renderValidation();
    updateToolbarState();
  }

  function updateToolbarState() {
    const hasStory = !!getSelectedStory();
    const hasDialog = !!getSelectedDialog();
    refs.removeStoryBtn.disabled = !hasStory;
    refs.copyStoryYamlBtn.disabled = !hasStory;
    refs.downloadStoryYamlBtn.disabled = !hasStory;

    refs.removeDialogBtn.disabled = !hasDialog;
    refs.copyDialogYamlBtn.disabled = !hasDialog;
    refs.downloadDialogYamlBtn.disabled = !hasDialog;
  }

  function addNewStory() {
    const next = deepClone(content.templates.storyEvent);
    next.id = `story_event_${state.storyEvents.length + 1}`;
    state.storyEvents.push(next);
    state.selectedStoryIndex = state.storyEvents.length - 1;
    markDirty("story");
    setStatus("New story event created.");
    refreshAll();
  }

  function addNewDialog() {
    const next = deepClone(content.templates.dialogTree);
    next.id = `dialog_tree_${state.dialogs.length + 1}`;
    next.nodes.start.id = "start";
    state.dialogs.push(next);
    state.selectedDialogIndex = state.dialogs.length - 1;
    markDirty("dialog");
    setStatus("New dialog tree created.");
    refreshAll();
  }

  function removeSelectedStory() {
    if (!getSelectedStory()) return;
    state.storyEvents.splice(state.selectedStoryIndex, 1);
    if (state.selectedStoryIndex >= state.storyEvents.length) {
      state.selectedStoryIndex = state.storyEvents.length - 1;
    }
    markDirty("story");
    setStatus("Story event removed.");
    refreshAll();
  }

  function removeSelectedDialog() {
    if (!getSelectedDialog()) return;
    state.dialogs.splice(state.selectedDialogIndex, 1);
    if (state.selectedDialogIndex >= state.dialogs.length) {
      state.selectedDialogIndex = state.dialogs.length - 1;
    }
    markDirty("dialog");
    setStatus("Dialog tree removed.");
    refreshAll();
  }

  function setupStoryTriggerOptions() {
    refs.storyTrigger.innerHTML = "";
    content.triggers.forEach((trigger) => {
      const option = document.createElement("option");
      option.value = trigger;
      option.textContent = trigger;
      refs.storyTrigger.appendChild(option);
    });
  }

  function attachMainListeners() {
    refs.importStoryBtn.addEventListener("click", () => {
      refs.importStoryInput.value = "";
      refs.importStoryInput.click();
    });

    refs.importStoryInput.addEventListener("change", async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      try {
        await importStoryFromFile(file);
      } catch (error) {
        setStatus(`Import failed: ${error.message}`);
      }
    });

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

    refs.newStoryBtn.addEventListener("click", addNewStory);
    refs.newDialogBtn.addEventListener("click", addNewDialog);
    refs.removeStoryBtn.addEventListener("click", removeSelectedStory);
    refs.removeDialogBtn.addEventListener("click", removeSelectedDialog);

    refs.storySelect.addEventListener("change", () => {
      state.selectedStoryIndex = Number(refs.storySelect.value);
      renderStoryEditor();
      updateToolbarState();
    });

    refs.dialogSelect.addEventListener("change", () => {
      state.selectedDialogIndex = Number(refs.dialogSelect.value);
      renderDialogEditor();
      updateToolbarState();
      renderValidation();
    });

    refs.storyId.addEventListener("input", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.id = refs.storyId.value;
      markDirty("story");
      renderStorySelect();
      renderStoryYamlPreview();
      renderValidation();
    });

    refs.storyName.addEventListener("input", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.name = refs.storyName.value;
      markDirty("story");
      renderStoryYamlPreview();
      renderValidation();
    });

    refs.storyPriority.addEventListener("input", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.priority = refs.storyPriority.value;
      markDirty("story");
      renderStoryYamlPreview();
    });

    refs.storyTrigger.addEventListener("change", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.trigger = refs.storyTrigger.value;
      markDirty("story");
      renderStorySelect();
      renderStoryYamlPreview();
      renderValidation();
    });

    refs.storyRepeatable.addEventListener("change", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.repeatable = refs.storyRepeatable.checked;
      markDirty("story");
      renderStoryYamlPreview();
    });

    refs.addTriggerFilterBtn.addEventListener("click", () => {
      const story = getSelectedStory();
      if (!story) return;
      let key = "key";
      let i = 1;
      while (Object.prototype.hasOwnProperty.call(story.trigger_filter, key)) {
        i += 1;
        key = `key_${i}`;
      }
      story.trigger_filter[key] = "";
      markDirty("story");
      renderStoryEditor();
    });

    refs.addStoryConditionBtn.addEventListener("click", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.conditions.push({ path: "", op: "eq", value: "" });
      markDirty("story");
      renderStoryEditor();
      renderValidation();
    });

    refs.addStoryActionBtn.addEventListener("click", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.actions.push({ type: "dialog", tree_id: "" });
      markDirty("story");
      renderStoryEditor();
      renderValidation();
    });

    refs.dialogId.addEventListener("input", () => {
      const dialog = getSelectedDialog();
      if (!dialog) return;
      dialog.id = refs.dialogId.value;
      markDirty("dialog");
      renderDialogSelect();
      renderDialogYamlPreview();
      renderValidation();
    });

    refs.dialogSpeaker.addEventListener("input", () => {
      const dialog = getSelectedDialog();
      if (!dialog) return;
      dialog.speaker = refs.dialogSpeaker.value;
      markDirty("dialog");
      renderDialogYamlPreview();
    });

    refs.dialogStartNode.addEventListener("input", () => {
      const dialog = getSelectedDialog();
      if (!dialog) return;
      dialog.start_node = refs.dialogStartNode.value;
      markDirty("dialog");
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
        on_enter: [],
        choices: [],
      };
      markDirty("dialog");
      renderDialogEditor();
      renderValidation();
    });

    refs.copyStoryYamlBtn.addEventListener("click", async () => {
      try {
        const yaml = dumpYaml(serializeStoryFilePayload());
        await copyText(yaml, "Story YAML copied to clipboard.");
      } catch (error) {
        setStatus(`Copy failed: ${error.message}`);
      }
    });

    refs.copyDialogYamlBtn.addEventListener("click", async () => {
      try {
        const payload = serializeDialogBySelection();
        if (!payload) {
          setStatus("No dialog selected.");
          return;
        }
        const yaml = dumpYaml(payload);
        await copyText(yaml, "Dialog YAML copied to clipboard.");
      } catch (error) {
        setStatus(`Copy failed: ${error.message}`);
      }
    });

    refs.downloadStoryYamlBtn.addEventListener("click", () => {
      try {
        const payload = serializeStoryFilePayload();
        const yaml = dumpYaml(payload);
        downloadText("story.yaml", yaml);
        setStatus("Story YAML downloaded.");
      } catch (error) {
        setStatus(`Download failed: ${error.message}`);
      }
    });

    refs.downloadDialogYamlBtn.addEventListener("click", () => {
      try {
        const payload = serializeDialogBySelection();
        if (!payload) {
          setStatus("No dialog selected.");
          return;
        }
        const filename = `${payload.id || "dialog"}.yaml`;
        const yaml = dumpYaml(payload);
        downloadText(filename, yaml);
        setStatus("Dialog YAML downloaded.");
      } catch (error) {
        setStatus(`Download failed: ${error.message}`);
      }
    });
  }

  function bootstrap() {
    setupStoryTriggerOptions();
    renderSchemaReference();
    attachMainListeners();

    state.storyEvents = [deepClone(content.templates.storyEvent)];
    state.storyEvents[0].id = "story_event_1";
    state.selectedStoryIndex = 0;

    const dialog = deepClone(content.templates.dialogTree);
    dialog.id = "dialog_tree_1";
    dialog.nodes.start.id = "start";
    state.dialogs = [dialog];
    state.selectedDialogIndex = 0;

    refreshAll();
    setStatus("Story Forge ready. Import a story file and load dialogs to start authoring.");
  }

  bootstrap();
})();
