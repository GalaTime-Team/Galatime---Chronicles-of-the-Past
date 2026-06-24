(function () {
  "use strict";

  window.StoryForgeHelp = {
    story: [
      "id (required): unique event id.",
      "name (optional): display label; defaults to id in runtime.",
      "priority (optional): higher number executes first.",
      "trigger (optional): scene_enter, dialog_end, combat_end or manual.",
      "trigger_filter (optional): exact key/value pairs matching trigger payload.",
      "conditions (optional legacy): all conditions must pass (AND).",
      "when (optional): recursive condition groups with all/any/not.",
      "actions (optional): executed in order when event triggers.",
      "repeatable (optional): if false, event is one-shot.",
    ],
    storyConditions: [
      "path (required): dot-path in state.",
      "Operators: eq, neq, gte, lte, gt, lt, exists, contains.",
      "Story condition behavior: missing path fails unless exists is used.",
    ],
    storyActions: [
      "dialog: requires tree_id.",
      "combat: requires enemies list.",
      "set_flag: path + value.",
      "give_item: item_id + quantity.",
      "emit: event + data_json.",
      "transfer_item: item_id, quantity, from, to, consume.",
      "relationship_change: target_id or target_ids, axis, delta/set_to.",
      "set_quest_stage: quest_id + stage.",
      "set_dialog_route: scene_id + character_id + dialog_id.",
      "clear_dialog_route: scene_id + character_id.",
      "halt_on_fail: optional on each action.",
    ],
    dialog: [
      "id (required): unique dialog tree id.",
      "speaker (optional): default speaker fallback.",
      "speaker_id (optional): character id for resolved display name.",
      "start_node (optional): entry node id, defaults to start.",
      "nodes (required): map keyed by node id.",
    ],
    node: [
      "text (required in practice): shown to player.",
      "speaker (optional): overrides tree speaker.",
      "speaker_id (optional): overrides tree speaker_id.",
      "on_enter (optional): emit event + data payload when entering node.",
      "choices (optional): options available from this node.",
    ],
    choice: [
      "label (required): player-facing option text.",
      "next (optional): node id or null to end dialog.",
      "requires (legacy): single condition mapping.",
      "requires_all: list of AND conditions.",
      "when: recursive all/any/not conditions.",
      "effects: state changes on choice select.",
      "actions: full narrative actions list, same as story actions.",
      "hint: optional UI hint.",
    ],
    dialogConditions: [
      "path required. Operators: eq, neq, gte, lte, gt, lt, exists, contains.",
      "Dialog behavior: missing path is treated as 0 unless exists is used.",
    ],
    effects: [
      "path + delta/set_to modifies state directly.",
      "npc + axis shorthand maps to relationships.<npc>.<axis>.",
    ],
    conditionGroups: [
      "Use when with all/any/not to build nested condition trees.",
      "List format is treated as all by default.",
      "All entries inside all must pass; any requires one pass; not negates one entry.",
    ],
    actions: [
      "dialog: requires tree_id.",
      "combat: requires enemies list.",
      "set_flag: path + value.",
      "give_item: item_id + quantity.",
      "emit: event + data_json.",
      "transfer_item: item_id, quantity, from, to, consume.",
      "relationship_change: target_id or target_ids, axis, delta/set_to.",
      "set_quest_stage: quest_id + stage.",
      "set_dialog_route: scene_id + character_id + dialog_id.",
      "clear_dialog_route: scene_id + character_id.",
    ],
  };
})();
