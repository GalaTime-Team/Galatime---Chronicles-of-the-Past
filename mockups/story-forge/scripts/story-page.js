(function () {
  "use strict";

  const content = window.StoryForgeContent || {};
  const help = window.StoryForgeHelp || {};
  const common = window.StoryForgeCommon;

  const state = {
    storyEvents: [],
    selectedStoryIndex: -1,
    storySourceWasList: true,
    dirtyStory: false,
    dialogs: [],
  };

  const refs = {
    importStoryBtn: document.getElementById("importStoryBtn"),
    pickDialogsBtn: document.getElementById("pickDialogsBtn"),
    newStoryBtn: document.getElementById("newStoryBtn"),
    removeStoryBtn: document.getElementById("removeStoryBtn"),
    copyStoryYamlBtn: document.getElementById("copyStoryYamlBtn"),
    downloadStoryYamlBtn: document.getElementById("downloadStoryYamlBtn"),

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
    storyWhenJson: document.getElementById("storyWhenJson"),
    storyActionsList: document.getElementById("storyActionsList"),
    addStoryActionBtn: document.getElementById("addStoryActionBtn"),
    storyYamlPreview: document.getElementById("storyYamlPreview"),

    validationBox: document.getElementById("validationBox"),
    schemaReference: document.getElementById("schemaReference"),
  };

  function setStatus(message) {
    refs.statusText.textContent = message;
  }

  function markDirty() {
    state.dirtyStory = true;
    refs.dirtyFlag.textContent = "Pending changes";
  }

  function resetDirty() {
    state.dirtyStory = false;
    refs.dirtyFlag.textContent = "No changes";
  }

  function getSelectedStory() {
    if (state.selectedStoryIndex < 0 || state.selectedStoryIndex >= state.storyEvents.length) return null;
    return state.storyEvents[state.selectedStoryIndex];
  }

  function updateCounters() {
    refs.storyCount.textContent = `Stories: ${state.storyEvents.length}`;
    refs.dialogCount.textContent = `Dialogs loaded: ${state.dialogs.length}`;
  }

  function setupTriggerOptions() {
    refs.storyTrigger.innerHTML = "";
    (content.triggers || []).forEach((trigger) => {
      const option = document.createElement("option");
      option.value = trigger;
      option.textContent = trigger;
      refs.storyTrigger.appendChild(option);
    });
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

  function normalizeStoryEvent(event) {
    const source = event && typeof event === "object" ? event : {};
    const out = common.deepClone(content.templates.storyEvent);
    out.id = String(source.id || out.id);
    out.name = source.name === undefined ? "" : String(source.name || "");
    out.priority = Number.isFinite(Number(source.priority)) ? Number(source.priority) : 0;
    out.trigger = String(source.trigger || out.trigger);
    out.trigger_filter = source.trigger_filter && typeof source.trigger_filter === "object" ? common.deepClone(source.trigger_filter) : {};
    out.repeatable = Boolean(source.repeatable);
    out.when_text = source.when ? common.dumpYaml(source.when).trim() : "";

    out.conditions = [];
    (Array.isArray(source.conditions) ? source.conditions : []).forEach((condition) => {
      out.conditions.push(normalizeCondition(condition));
    });

    out.actions = [];
    (Array.isArray(source.actions) ? source.actions : []).forEach((action) => {
      out.actions.push(normalizeAction(action));
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

  function serializeAction(action) {
    const type = String(action.type || "");
    if (!type) return null;
    const out = { type };
    if (action.halt_on_fail) out.halt_on_fail = true;

    if (type === "dialog") out.tree_id = String(action.tree_id || "").trim();
    if (type === "combat") {
      out.enemies = String(action.enemies_text || "").split(",").map((v) => v.trim()).filter(Boolean);
    }
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

  function serializeStoryEvent(event) {
    const out = {
      id: String(event.id || "").trim(),
      priority: Number.isFinite(Number(event.priority)) ? Math.trunc(Number(event.priority)) : 0,
      trigger: String(event.trigger || "scene_enter"),
    };

    if (String(event.name || "").trim()) out.name = String(event.name).trim();
    if (event.repeatable) out.repeatable = true;

    const triggerFilterEntries = Object.entries(event.trigger_filter || {}).filter(([k]) => String(k).trim());
    if (triggerFilterEntries.length) {
      out.trigger_filter = {};
      triggerFilterEntries.forEach(([key, value]) => {
        out.trigger_filter[String(key).trim()] = common.parseTypedValue(String(value));
      });
    }

    const conditions = (event.conditions || []).map(buildConditionObject).filter(Boolean);
    if (conditions.length) out.conditions = conditions;

    const whenText = String(event.when_text || "").trim();
    if (whenText) {
      out.when = common.parseStructuredText(whenText, {});
    }

    const actions = (event.actions || []).map(serializeAction).filter(Boolean);
    if (actions.length) out.actions = actions;

    return out;
  }

  function serializeStoryPayload() {
    const rows = state.storyEvents.map(serializeStoryEvent);
    if (state.storySourceWasList) return rows;
    return rows.length === 1 ? rows[0] : rows;
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

  function createConditionRow(condition, onChange, onRemove) {
    const card = document.createElement("div");
    card.className = "list-card";

    const grid = document.createElement("div");
    grid.className = "inline-grid";

    const pathInput = document.createElement("input");
    pathInput.placeholder = "path";
    pathInput.value = condition.path || "";

    const opSelect = document.createElement("select");
    (content.storyConditionOps || []).forEach((op) => {
      const option = document.createElement("option");
      option.value = op;
      option.textContent = op;
      opSelect.appendChild(option);
    });
    if (![...(content.storyConditionOps || [])].includes(condition.op)) {
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

    function sync() {
      onChange({ path: pathInput.value, op: opSelect.value, value: valueInput.value });
    }

    pathInput.addEventListener("input", sync);
    opSelect.addEventListener("change", () => {
      valueInput.disabled = opSelect.value === "exists";
      if (opSelect.value === "exists" && !valueInput.value) valueInput.value = "true";
      sync();
    });
    valueInput.addEventListener("input", sync);
    removeBtn.addEventListener("click", onRemove);

    grid.appendChild(pathInput);
    grid.appendChild(opSelect);
    grid.appendChild(valueInput);
    card.appendChild(grid);
    card.appendChild(removeBtn);
    return card;
  }

  function addActionField(card, labelText, value, onInput, type = "text") {
    const field = document.createElement("div");
    field.className = "field";
    const label = document.createElement("label");
    label.textContent = labelText;
    let input;
    if (type === "textarea") {
      input = document.createElement("textarea");
    } else if (type === "checkbox") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = Boolean(value);
    } else {
      input = document.createElement("input");
      input.type = type;
      input.value = value === undefined ? "" : String(value);
    }

    input.addEventListener(type === "checkbox" ? "change" : "input", () => {
      onInput(type === "checkbox" ? input.checked : input.value);
    });

    field.appendChild(label);
    field.appendChild(input);
    card.appendChild(field);
    return input;
  }

  function renderActionCard(action, index, story) {
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
      markDirty();
      renderStoryEditor();
      renderValidation();
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
      story.actions[index] = normalizeAction({ type: typeSelect.value });
      markDirty();
      renderStoryEditor();
      renderValidation();
    });
    typeField.appendChild(typeLabel);
    typeField.appendChild(typeSelect);
    card.appendChild(typeField);

    addActionField(card, "halt_on_fail", action.halt_on_fail, (value) => {
      action.halt_on_fail = value;
      markDirty();
      renderStoryYamlPreview();
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
        markDirty();
        renderStoryYamlPreview();
        renderValidation();
      });
      field.appendChild(label);
      field.appendChild(select);
      card.appendChild(field);
    }

    if (action.type === "combat") {
      addActionField(card, "enemies (comma-separated ids)", action.enemies_text || "", (value) => {
        action.enemies_text = value;
        markDirty();
        renderStoryYamlPreview();
      });
    }

    if (action.type === "set_flag") {
      addActionField(card, "path", action.path || "", (value) => {
        action.path = value;
        markDirty();
        renderStoryYamlPreview();
        renderValidation();
      });
      addActionField(card, "value", action.value === undefined ? "true" : String(action.value), (value) => {
        action.value = value;
        markDirty();
        renderStoryYamlPreview();
      });
    }

    if (action.type === "give_item") {
      addActionField(card, "item_id", action.item_id || "", (value) => {
        action.item_id = value;
        markDirty();
        renderStoryYamlPreview();
        renderValidation();
      });
      addActionField(card, "quantity", action.quantity === undefined ? 1 : action.quantity, (value) => {
        action.quantity = value;
        markDirty();
        renderStoryYamlPreview();
      }, "number");
    }

    if (action.type === "emit") {
      addActionField(card, "event", action.event || "", (value) => {
        action.event = value;
        markDirty();
        renderStoryYamlPreview();
        renderValidation();
      });
      addActionField(card, "data (YAML or JSON)", action.data_text || "{}", (value) => {
        action.data_text = value;
        markDirty();
        renderStoryYamlPreview();
        renderValidation();
      }, "textarea");
    }

    if (action.type === "transfer_item") {
      addActionField(card, "item_id", action.item_id || "", (value) => {
        action.item_id = value;
        markDirty();
        renderStoryYamlPreview();
      });
      addActionField(card, "quantity", action.quantity === undefined ? 1 : action.quantity, (value) => {
        action.quantity = value;
        markDirty();
        renderStoryYamlPreview();
      }, "number");
      addActionField(card, "from", action.from || "player", (value) => {
        action.from = value;
        markDirty();
        renderStoryYamlPreview();
      });
      addActionField(card, "to", action.to || "player", (value) => {
        action.to = value;
        markDirty();
        renderStoryYamlPreview();
      });
      addActionField(card, "consume", action.consume, (value) => {
        action.consume = value;
        markDirty();
        renderStoryYamlPreview();
      }, "checkbox");
    }

    if (action.type === "relationship_change") {
      addActionField(card, "target_id", action.target_id || "", (value) => {
        action.target_id = value;
        markDirty();
        renderStoryYamlPreview();
      });
      addActionField(card, "target_ids (comma-separated)", action.target_ids_text || "", (value) => {
        action.target_ids_text = value;
        markDirty();
        renderStoryYamlPreview();
      });
      addActionField(card, "axis", action.axis || "liking", (value) => {
        action.axis = value;
        markDirty();
        renderStoryYamlPreview();
      });
      addActionField(card, "delta", action.delta, (value) => {
        action.delta = value;
        markDirty();
        renderStoryYamlPreview();
      });
      addActionField(card, "set_to", action.set_to, (value) => {
        action.set_to = value;
        markDirty();
        renderStoryYamlPreview();
      });
    }

    if (action.type === "set_quest_stage") {
      addActionField(card, "quest_id", action.quest_id || "", (value) => {
        action.quest_id = value;
        markDirty();
        renderStoryYamlPreview();
      });
      addActionField(card, "stage", action.stage, (value) => {
        action.stage = value;
        markDirty();
        renderStoryYamlPreview();
      });
    }

    if (action.type === "set_dialog_route") {
      addActionField(card, "scene_id", action.scene_id || "", (value) => {
        action.scene_id = value;
        markDirty();
        renderStoryYamlPreview();
      });
      addActionField(card, "character_id", action.character_id || "", (value) => {
        action.character_id = value;
        markDirty();
        renderStoryYamlPreview();
      });
      addActionField(card, "dialog_id", action.dialog_id || "", (value) => {
        action.dialog_id = value;
        markDirty();
        renderStoryYamlPreview();
      });
    }

    if (action.type === "clear_dialog_route") {
      addActionField(card, "scene_id", action.scene_id || "", (value) => {
        action.scene_id = value;
        markDirty();
        renderStoryYamlPreview();
      });
      addActionField(card, "character_id", action.character_id || "", (value) => {
        action.character_id = value;
        markDirty();
        renderStoryYamlPreview();
      });
    }

    return card;
  }

  function renderStoryYamlPreview() {
    const story = getSelectedStory();
    if (!story) {
      refs.storyYamlPreview.textContent = "";
      return;
    }
    try {
      refs.storyYamlPreview.textContent = common.dumpYaml(serializeStoryEvent(story));
    } catch (error) {
      refs.storyYamlPreview.textContent = `# YAML generation error\n${error.message}`;
    }
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
      refs.storyWhenJson.value = "";
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
    refs.storyWhenJson.value = story.when_text || "";

    refs.triggerFilterList.innerHTML = "";
    Object.entries(story.trigger_filter || {}).forEach(([key, value]) => {
      const card = document.createElement("div");
      card.className = "list-card";
      const grid = document.createElement("div");
      grid.className = "inline-grid";

      const keyInput = document.createElement("input");
      keyInput.dataset.key = "key";
      keyInput.value = key;
      const valueInput = document.createElement("input");
      valueInput.dataset.key = "value";
      valueInput.value = String(value);
      const blank = document.createElement("div");
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
        markDirty();
        renderStoryYamlPreview();
        renderValidation();
      }

      keyInput.addEventListener("input", sync);
      valueInput.addEventListener("input", sync);
      removeBtn.addEventListener("click", () => {
        delete story.trigger_filter[key];
        markDirty();
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
      refs.storyConditionsList.appendChild(createConditionRow(condition, (updated) => {
        story.conditions[index] = updated;
        markDirty();
        renderStoryYamlPreview();
        renderValidation();
      }, () => {
        story.conditions.splice(index, 1);
        markDirty();
        renderStoryEditor();
      }));
    });

    refs.storyActionsList.innerHTML = "";
    (story.actions || []).forEach((action, index) => {
      refs.storyActionsList.appendChild(renderActionCard(action, index, story));
    });

    renderStoryYamlPreview();
  }

  function renderSchemaReference() {
    refs.schemaReference.innerHTML = "";
    const groups = [
      ["Story fields", help.story],
      ["Story conditions", help.storyConditions],
      ["Story actions", help.storyActions],
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

    state.storyEvents.forEach((event, idx) => {
      if (!String(event.id || "").trim()) errors.push(`Story #${idx + 1}: id is required.`);
      if (!(content.triggers || []).includes(String(event.trigger || ""))) {
        errors.push(`Story ${event.id || idx + 1}: trigger '${event.trigger}' is invalid.`);
      }

      (event.conditions || []).forEach((condition, cIndex) => {
        if (!String(condition.path || "").trim()) {
          errors.push(`Story ${event.id || idx + 1} condition #${cIndex + 1}: path is required.`);
        }
      });

      if (String(event.when_text || "").trim()) {
        try {
          const parsedWhen = common.parseStructuredText(event.when_text, null);
          if (!parsedWhen || typeof parsedWhen !== "object") {
            errors.push(`Story ${event.id || idx + 1}: when must be an object/group.`);
          }
        } catch (_error) {
          errors.push(`Story ${event.id || idx + 1}: when is not valid YAML/JSON.`);
        }
      }

      (event.actions || []).forEach((action, aIndex) => {
        const type = String(action.type || "");
        if (!(content.actionTypes || []).includes(type)) {
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
        if ((type === "give_item" || type === "transfer_item") && !String(action.item_id || "").trim()) {
          errors.push(`Story ${event.id || idx + 1} action #${aIndex + 1}: item_id is required.`);
        }
        if (type === "emit" && !String(action.event || "").trim()) {
          errors.push(`Story ${event.id || idx + 1} action #${aIndex + 1}: emit event is required.`);
        }
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
    renderStorySelect();
    renderStoryEditor();
    updateCounters();
    renderValidation();
  }

  function addNewStory() {
    const next = common.deepClone(content.templates.storyEvent);
    next.id = `story_event_${state.storyEvents.length + 1}`;
    state.storyEvents.push(next);
    state.selectedStoryIndex = state.storyEvents.length - 1;
    markDirty();
    setStatus("New story event created.");
    refreshAll();
  }

  function removeSelectedStory() {
    if (!getSelectedStory()) return;
    state.storyEvents.splice(state.selectedStoryIndex, 1);
    if (state.selectedStoryIndex >= state.storyEvents.length) {
      state.selectedStoryIndex = state.storyEvents.length - 1;
    }
    markDirty();
    setStatus("Story event removed.");
    refreshAll();
  }

  async function importStoryFromFile(file) {
    const text = await common.readFileText(file);
    const parsed = common.parseYaml(text);
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
    resetDirty();
    setStatus(`Loaded story file with ${state.storyEvents.length} event(s).`);
    refreshAll();
  }

  async function loadDialogsFromFiles(files) {
    const dialogs = [];
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith(".yaml") && !file.name.toLowerCase().endsWith(".yml")) continue;
      const parsed = common.parseYaml(await file.text());
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) continue;
      dialogs.push({ id: String(parsed.id || "") });
    }
    state.dialogs = dialogs;
    setStatus(`Loaded ${dialogs.length} dialog tree id(s) for references.`);
    updateCounters();
    renderValidation();
  }

  function attachListeners() {
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
    refs.removeStoryBtn.addEventListener("click", removeSelectedStory);

    refs.storySelect.addEventListener("change", () => {
      state.selectedStoryIndex = Number(refs.storySelect.value);
      renderStoryEditor();
    });

    refs.storyId.addEventListener("input", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.id = refs.storyId.value;
      markDirty();
      renderStorySelect();
      renderStoryYamlPreview();
      renderValidation();
    });

    refs.storyName.addEventListener("input", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.name = refs.storyName.value;
      markDirty();
      renderStoryYamlPreview();
    });

    refs.storyPriority.addEventListener("input", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.priority = refs.storyPriority.value;
      markDirty();
      renderStoryYamlPreview();
    });

    refs.storyTrigger.addEventListener("change", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.trigger = refs.storyTrigger.value;
      markDirty();
      renderStorySelect();
      renderStoryYamlPreview();
      renderValidation();
    });

    refs.storyRepeatable.addEventListener("change", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.repeatable = refs.storyRepeatable.checked;
      markDirty();
      renderStoryYamlPreview();
    });

    refs.storyWhenJson.addEventListener("input", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.when_text = refs.storyWhenJson.value;
      markDirty();
      renderStoryYamlPreview();
      renderValidation();
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
      markDirty();
      renderStoryEditor();
    });

    refs.addStoryConditionBtn.addEventListener("click", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.conditions.push({ path: "", op: "eq", value: "" });
      markDirty();
      renderStoryEditor();
      renderValidation();
    });

    refs.addStoryActionBtn.addEventListener("click", () => {
      const story = getSelectedStory();
      if (!story) return;
      story.actions.push(normalizeAction({ type: "dialog" }));
      markDirty();
      renderStoryEditor();
      renderValidation();
    });

    refs.copyStoryYamlBtn.addEventListener("click", async () => {
      try {
        await common.copyText(common.dumpYaml(serializeStoryPayload()));
        setStatus("Story YAML copied to clipboard.");
      } catch (error) {
        setStatus(`Copy failed: ${error.message}`);
      }
    });

    refs.downloadStoryYamlBtn.addEventListener("click", () => {
      try {
        common.downloadText("story.yaml", common.dumpYaml(serializeStoryPayload()));
        setStatus("Story YAML downloaded.");
      } catch (error) {
        setStatus(`Download failed: ${error.message}`);
      }
    });
  }

  function bootstrap() {
    setupTriggerOptions();
    renderSchemaReference();
    attachListeners();

    const seed = common.deepClone(content.templates.storyEvent);
    seed.id = "story_event_1";
    state.storyEvents = [seed];
    state.selectedStoryIndex = 0;

    refreshAll();
    setStatus("Story editor ready. Import a story file to start.");
  }

  bootstrap();
})();
