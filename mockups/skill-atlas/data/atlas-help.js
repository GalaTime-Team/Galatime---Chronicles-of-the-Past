window.SkillAtlasHelp = {
  FIELD_HELP_CONTENT: {
    target: {
      title: "Target",
      body: "Defines who receives the direct skill resolution.\nExpected input: one of individual, all, self, ally_one, allies_all.\nPractical combat defaults are individual/all/self, but set the exact scope explicitly in YAML for deterministic behavior.",
    },
    accuracy: {
      title: "Accuracy",
      body: "First-hit success probability for this skill.\nExpected input: decimal in the [0.00..1.00] range (default 1.00).\nFor multi-hit skills, this applies only to the first hit attempt.",
    },
    hits: {
      title: "Hits",
      body: "Number of hit attempts performed by this skill.\nExpected input: integer >= 1 (default 1).\nWhen target is all, hit attempts are distributed across valid targets instead of applying all hits to each target.",
    },
    hit_chance: {
      title: "Hit chance",
      body: "Per-hit probability for additional hits after the first one.\nExpected input: decimal in the [0.00..1.00] range (default 1.00).\nWhen hits is 1, this field is functionally irrelevant and the UI locks it to 1.",
    },
    skill_points_cost: {
      title: "Skill points cost",
      body: "Progression cost used by the atlas authoring layer (serialized as skill_points_cost).\nExpected input: integer >= 0.\nUse consistent values to keep unlock pacing predictable across prerequisite chains.",
    },
    prerequisites: {
      title: "Prerequisites",
      body: "Ordered unlock requirements represented by skill IDs.\nExpected input: add one existing skill ID per entry (exact id match).\nDo not reference the current skill id itself; self-dependencies are invalid and blocked.",
    },
    effect_overview: {
      title: "Effect",
      body: "Optional payload for buffs, debuffs, damage-over-time, and resource restoration.\nExpected input: enable this section when the skill should carry status logic beyond direct damage.\nNew content should use effects payloads rather than legacy compatibility fields.",
    },
    effect_id: {
      title: "Effect ID",
      body: "Stable technical identifier for refresh/stack behavior of the status payload.\nExpected input: lowercase id token such as frost, burn_dot, nature_mend.\nRequired when effect is enabled.",
    },
    status_effect: {
      title: "Status effect",
      body: "Display name shown in combat logs/UI for this effect instance.\nExpected input: readable label such as Frost, Burn, Nature Mend.\nIf omitted, the editor derives a readable name from Effect ID.",
    },
    effect_apply_to: {
      title: "Apply to",
      body: "Target scope for effect payload execution (independent from direct hit targeting).\nExpected input: self, ally_one, enemies_all, enemy_one, or allies_all.\nSet this explicitly to avoid fallback inference.",
    },
    effect_turns: {
      title: "Turns",
      body: "Duration of persistent effect ticking.\nExpected input: integer >= 0.\n0 means instant resolution. Values > 0 become over-time effects; engine enforces at least 1 turn when non-zero duration is provided.",
    },
    effect_damage: {
      title: "Tick damage",
      body: "Per-tick effect damage value for damage-over-time style payloads.\nExpected input: integer >= 0.\nCommonly paired with turns > 0 for DoT; use 0 when the effect is regen-only or buff/debuff-only.",
    },
    effect_apply_chance: {
      title: "Apply chance",
      body: "Probability that the effect payload is applied when the skill resolves.\nExpected input: decimal in the [0.00..1.00] range (default 1.00).\nUse values < 1.00 for conditional status application.",
    },
    effect_regen_hp: {
      title: "Regen HP",
      body: "Health restoration amount carried by resource_regen.hp.\nExpected input: integer >= 0.\nWith turns = 0 it resolves instantly; with turns > 0 it is applied per effect tick.",
    },
    effect_regen_mana: {
      title: "Regen mana",
      body: "Mana restoration amount carried by resource_regen.mana.\nExpected input: integer >= 0.\nWith turns = 0 it resolves instantly; with turns > 0 it is applied per effect tick.",
    },
    effect_regen_stamina: {
      title: "Regen stamina",
      body: "Stamina restoration amount carried by resource_regen.stamina.\nExpected input: integer >= 0.\nWith turns = 0 it resolves instantly; with turns > 0 it is applied per effect tick.",
    },
  },
};
