(function () {
  "use strict";

  window.StoryForgeContent = {
    triggers: ["scene_enter", "dialog_end", "combat_end", "manual"],
    storyConditionOps: ["eq", "neq", "gte", "lte", "gt", "lt", "exists", "contains"],
    dialogConditionOps: ["eq", "neq", "gte", "lte", "gt", "lt", "exists", "contains"],
    actionTypes: [
      "dialog",
      "combat",
      "set_flag",
      "give_item",
      "emit",
      "transfer_item",
      "relationship_change",
      "set_quest_stage",
      "set_dialog_route",
      "clear_dialog_route",
    ],
    relationAxes: ["liking", "trust", "respect", "fear", "suspicion"],
    templates: {
      storyEvent: {
        id: "new_story_event",
        name: "New Story Event",
        priority: 0,
        trigger: "scene_enter",
        trigger_filter: {},
        conditions: [],
        when_text: "",
        actions: [],
        repeatable: false,
      },
      dialogTree: {
        id: "new_dialog_tree",
        speaker: "",
        speaker_id: "",
        start_node: "start",
        nodes: {
          start: {
            id: "start",
            text: "",
            speaker: "",
            speaker_id: "",
            on_enter: [],
            choices: [
              {
                label: "Continue",
                next: null,
              },
            ],
          },
        },
      },
      condition: {
        path: "",
        op: "eq",
        value: "",
      },
      action: {
        type: "dialog",
        tree_id: "",
        halt_on_fail: false,
      },
      node: {
        id: "node_id",
        text: "",
        speaker: "",
        speaker_id: "",
        on_enter: [],
        choices: [],
      },
      choice: {
        label: "",
        next: null,
        hint: "",
        when_text: "",
        requiresMode: "requires_all",
        requires: [],
        effects: [],
        actions: [],
      },
      effect: {
        path: "",
        delta: "",
        set_to: "",
        npc: "",
        axis: "liking",
      },
      hook: {
        event: "",
        data_text: "{}",
        data_json: "{}",
      },
    },
  };
})();
