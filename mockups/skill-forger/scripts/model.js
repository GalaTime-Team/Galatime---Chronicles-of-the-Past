(function (root) {
    'use strict';

    var KEY = 'galatime.skill-forger.draft.v2';
    var ELEMENTS = [
        'aqua', 'caeli', 'chaos', 'corporis', 'florere', 'inanus', 'ignis', 'lapis', 'lux',
        'spatium', 'umbra', 'vetus', 'vis',
    ];

    /* Vocabulário do motor: polaridade de efeito, tipos de skill, ações
       proibíveis e atributos que um buff/debuff pode mexer. */    var POLARITIES = ['positive', 'negative', 'neutral'];
    var SKILL_KINDS = ['Attack', 'Heal', 'Buff', 'Debuff', 'Control', 'Utility'];
    var PREVENT_ACTIONS = ['attack', 'skill', 'weapon', 'defend', 'rest', 'inventory', 'switch_line'];

    /* Atributos que um buff/debuff pode mexer. */
    var STAT_NAMES = [
        'hp', 'mana', 'stamina', 'max_hp', 'max_mana', 'max_stamina',
        'physical_attack', 'magical_attack', 'attack',
        'physical_defense', 'magical_defense', 'defense',
        'speed', 'accuracy', 'evasion', 'crit_chance',
    ];

    var STAT_LABELS = {
        hp: 'hp — vida máxima',
        mana: 'mana — mana máxima',
        stamina: 'stamina — stamina máxima',
        max_hp: 'max_hp — vida máxima',
        max_mana: 'max_mana — mana máxima',
        max_stamina: 'max_stamina — stamina máxima',
        physical_attack: 'physical_attack — ataque físico',
        magical_attack: 'magical_attack — ataque mágico',
        attack: 'attack — os dois canais de ataque',
        physical_defense: 'physical_defense — defesa física',
        magical_defense: 'magical_defense — defesa mágica',
        defense: 'defense — as duas defesas',
        speed: 'speed — agilidade (turnos por ronda)',
        accuracy: 'accuracy — precisão dos próprios ataques',
        evasion: 'evasion — esquiva do próprio corpo (dificulta ser atingido)',
        crit_chance: 'crit_chance — chance de crítico dos próprios ataques',
    };

    function clone(value) { return JSON.parse(JSON.stringify(value)); }
    function slug(value) {
        return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'skill';
    }
    function emptyProject() { return { skills: [], trees: {} }; }
    function elementLabel(elementId) { return elementId || ''; }

    function ensureTree(project, elementId) {
        // A árvore guarda apenas posições: nome, membros e arestas derivam-se
        // do catálogo de skills (element_id + learning_requirements).
        if (!project.trees[elementId]) project.trees[elementId] = { positions: {} };
        return project.trees[elementId];
    }

    function setPosition(project, skill, x, y) {
        ensureTree(project, skill.element_id).positions[skill.id] = {
            x: Math.max(24, Math.round(Number(x) || 0)),
            y: Math.max(24, Math.round(Number(y) || 0)),
        };
    }

    // Coordinates are a view of the dependency graph, never user-authored state.
    // A tidy spanning forest gives every skill its own horizontal lane while
    // centering each parent over the branch it owns. Extra prerequisites remain
    // visible as cross-links without duplicating their dependent node.
    function layout(project, elementId) {
        var tree = ensureTree(project, elementId);
        var skills = project.skills.filter(function (skill) { return skill.element_id === elementId; })
            .slice().sort(function (a, b) { return a.id.localeCompare(b.id); });
        var byId = new Map(skills.map(function (skill) { return [skill.id, skill]; }));
        var parents = new Map();
        var children = new Map(skills.map(function (skill) { return [skill.id, []]; }));
        skills.forEach(function (skill) {
            var sameTreeParents = Array.from(new Set(skill.learning_requirements?.required_attack_ids || []))
                .filter(function (id) { return byId.has(id) && id !== skill.id; });
            parents.set(skill.id, sameTreeParents);
            sameTreeParents.forEach(function (parentId) { children.get(parentId).push(skill.id); });
        });
        children.forEach(function (ids) { ids.sort(function (a, b) { return a.localeCompare(b); }); });

        var rankMemo = new Map();
        function rank(id, active) {
            if (rankMemo.has(id)) return rankMemo.get(id);
            if (active.has(id)) return 0; // Break malformed cycles for layout; validation still reports them.
            active.add(id);
            var result = 0;
            (parents.get(id) || []).forEach(function (parentId) {
                result = Math.max(result, rank(parentId, active) + 1);
            });
            active.delete(id);
            rankMemo.set(id, result);
            return result;
        }
        skills.forEach(function (skill) { rank(skill.id, new Set()); });

        var ownedChildren = new Map();
        var assigned = new Set();
        function claimBranch(id) {
            if (assigned.has(id)) return;
            assigned.add(id);
            var branch = (children.get(id) || []).filter(function (childId) { return !assigned.has(childId); });
            ownedChildren.set(id, branch);
            branch.forEach(claimBranch);
        }
        var roots = skills.filter(function (skill) { return parents.get(skill.id).length === 0; });
        roots.forEach(function (skill) { claimBranch(skill.id); });
        // A cyclic component has no root; anchor each still-unassigned component
        // deterministically so it also receives unique, non-overlapping slots.
        skills.forEach(function (skill) { claimBranch(skill.id); });

        var widths = new Map();
        function branchWidth(id) {
            if (widths.has(id)) return widths.get(id);
            var branch = ownedChildren.get(id) || [];
            var width = branch.length ? branch.reduce(function (sum, childId) { return sum + branchWidth(childId); }, 0) : 1;
            widths.set(id, width);
            return width;
        }
        var slots = new Map();
        function assignSlots(id, firstSlot) {
            var width = branchWidth(id);
            slots.set(id, firstSlot + (width - 1) / 2);
            var childSlot = firstSlot;
            (ownedChildren.get(id) || []).forEach(function (childId) {
                assignSlots(childId, childSlot);
                childSlot += branchWidth(childId);
            });
        }
        var nextSlot = 0;
        roots.concat(skills.filter(function (skill) { return !roots.includes(skill); })).forEach(function (skill) {
            if (slots.has(skill.id)) return;
            assignSlots(skill.id, nextSlot);
            nextSlot += branchWidth(skill.id);
        });

        var positions = new Map();
        var cardWidth = 205;
        var horizontalStep = 270;
        var verticalStep = 180;
        var leftInset = 72;
        var topInset = 58;
        skills.forEach(function (skill) {
            var x = leftInset + slots.get(skill.id) * horizontalStep;
            var y = topInset + rankMemo.get(skill.id) * verticalStep;
            var point = { x: Math.round(x), y: Math.round(y) };
            positions.set(skill.id, point);
            tree.positions[skill.id] = point;
        });
        // Drop coordinates for removed/moved skills from this tree.
        Object.keys(tree.positions).forEach(function (id) { if (!byId.has(id)) delete tree.positions[id]; });
        return {
            positions: positions,
            width: Math.max(360, nextSlot * horizontalStep + leftInset * 2),
            height: Math.max(480, topInset * 2 + (Math.max(0, ...Array.from(rankMemo.values())) + 1) * verticalStep),
        };
    }

    function position(project, skill) {
        return layout(project, skill.element_id).positions.get(skill.id) || { x: 72, y: 58 };
    }

    function ensurePositions(project) {
        var elements = new Set(project.skills.map(function (skill) { return skill.element_id; }));
        elements.forEach(function (elementId) { layout(project, elementId); });
    }

    /* Nome por omissão de cada padrão de efeito. */
    var PATTERN_STATUS_NAMES = {
        regen: 'Regeneração',
        regen_turn: 'Regeneração contínua',
        buff: 'Aumento de atributos',
        debuff: 'Redução de atributos',
        damage: 'Dano contínuo',
        drain: 'Drenagem',
        cleanse: 'Purificação',
        dispel: 'Dissipação',
        deferred: 'Golpe atrasado',
        echo: 'Repetição',
        move: 'Deslocação',
        upkeep: 'Manutenção',
        rewind: 'Retroceder tempo',
    };

    function patternStatusName(pattern) { return PATTERN_STATUS_NAMES[pattern] || 'Efeito'; }

    function makeEffect(skillId, pattern, applyTo, index, properties) {
        var effect = Object.assign({
            effect_id: skillId + '_effect_' + (index + 1),
            status_effect: patternStatusName(pattern),
            apply_to: applyTo,
            turns: 3,
        }, properties || {});
        return effect;
    }

    var TEMPLATES = [
        {
            id: 'physical_strike', title: 'Ataque físico', category: 'Ataques', description: 'Dano físico a um inimigo.',
            build: function () { return { targeting: 'enemy_one', damage: { kind: 'physical', power: { kind: 'fixed', value: 24 } }, accuracy: 95, hit_count: 1 }; },
        },
        {
            id: 'magic_bolt', title: 'Ataque mágico', category: 'Ataques', description: 'Projétil mágico de alvo único.',
            build: function () { return { targeting: 'enemy_one', damage: { kind: 'magical', power: { kind: 'fixed', value: 32 } }, accuracy: 100, hit_count: 1, costs: { mana: 8, stamina: 0, cooldown: 0 } }; },
        },
        {
            id: 'multi_strike', title: 'Rajada de golpes', category: 'Ataques', description: 'Vários golpes físicos ao mesmo alvo.',
            build: function () { return { targeting: 'enemy_one', damage: { kind: 'physical', power: { kind: 'fixed', value: 13 } }, accuracy: 88, hit_count: 4, costs: { mana: 0, stamina: 7, cooldown: 0 } }; },
        },
        {
            id: 'attack_rain', title: 'Chuva de ataques', category: 'Ataques', description: 'Golpes mágicos repetidos contra todos os inimigos.',
            build: function () { return { targeting: 'enemies_all', damage: { kind: 'magical', power: { kind: 'fixed', value: 16 } }, accuracy: 90, hit_count: 3, costs: { mana: 18, stamina: 0, cooldown: 1 } }; },
        },
        {
            id: 'self_buff', title: 'Buff próprio', category: 'Buffs', description: 'Aumenta atributos do atacante.',
            build: function (skillId) { return { targeting: 'self', effects: [makeEffect(skillId, 'buff', 'self', 0, { buff: { physical_attack: 10, speed: 5 } })] }; },
        },
        {
            id: 'team_buff', title: 'Buff de equipa', category: 'Buffs', description: 'Melhora a defesa de toda a equipa aliada.',
            build: function (skillId) { return { targeting: 'allies_all', effects: [makeEffect(skillId, 'buff', 'allies_all', 0, { buff: { physical_defense: 12, magical_defense: 12 } })], costs: { mana: 14, stamina: 0, cooldown: 0 } }; },
        },
        {
            id: 'target_debuff', title: 'Debuff individual', category: 'Debuffs', description: 'Reduz um atributo de um inimigo.',
            build: function (skillId) { return { targeting: 'enemy_one', effects: [makeEffect(skillId, 'debuff', 'target', 0, { debuff: { magical_defense: 12 }, effect_hit_chance: 0.85 })], costs: { mana: 7, stamina: 0, cooldown: 0 } }; },
        },
        {
            id: 'area_debuff', title: 'Debuff em área', category: 'Debuffs', description: 'Reduz a velocidade de todos os inimigos.',
            build: function (skillId) { return { targeting: 'enemies_all', effects: [makeEffect(skillId, 'debuff', 'enemies_all', 0, { debuff: { speed: 8 }, effect_hit_chance: 0.8 })], costs: { mana: 16, stamina: 0, cooldown: 1 } }; },
        },
        {
            id: 'self_regen', title: 'Regeneração própria', category: 'Recuperação', description: 'Recupera vida do atacante.',
            build: function (skillId) { return { targeting: 'self', effects: [makeEffect(skillId, 'regen', 'self', 0, { resource_regen: { hp: 24 } })], costs: { mana: 6, stamina: 0, cooldown: 0 } }; },
        },
        {
            id: 'ally_heal', title: 'Curar um aliado', category: 'Recuperação', description: 'Recupera vida de um aliado escolhido.',
            build: function (skillId) { return { targeting: 'ally_one', effects: [makeEffect(skillId, 'regen', 'target', 0, { resource_regen: { hp: 30 } })], costs: { mana: 9, stamina: 0, cooldown: 0 } }; },
        },
        {
            id: 'team_heal', title: 'Curar toda a equipa', category: 'Recuperação', description: 'Recupera vida de todos os aliados.',
            build: function (skillId) { return { targeting: 'allies_all', effects: [makeEffect(skillId, 'regen', 'allies_all', 0, { resource_regen: { hp: 16 } })], costs: { mana: 22, stamina: 0, cooldown: 1 } }; },
        },
        {
            id: 'mana_restore', title: 'Recuperar mana', category: 'Recuperação', description: 'O atacante recupera mana.',
            build: function (skillId) { return { targeting: 'self', effects: [makeEffect(skillId, 'regen', 'self', 0, { resource_regen: { mana: 18 } })], costs: { mana: 0, stamina: 0, cooldown: 1 } }; },
        },
        {
            id: 'damage_sequence', title: 'Dano por turno', category: 'Efeitos contínuos', description: 'Aplica dano ao longo de vários turnos.',
            build: function (skillId) { return { targeting: 'enemy_one', effects: [makeEffect(skillId, 'damage', 'target', 0, { damage_per_turn: 6, turns: 3, effect_hit_chance: 0.9 })], costs: { mana: 10, stamina: 0, cooldown: 0 } }; },
        },
        {
            id: 'life_drain', title: 'Drenar vida', category: 'Efeitos contínuos', description: 'Fere um inimigo e recupera vida do atacante.',
            build: function (skillId) { return { targeting: 'enemy_one', damage: { kind: 'magical', power: { kind: 'fixed', value: 20 } }, accuracy: 90, hit_count: 1, effects: [makeEffect(skillId, 'regen', 'self', 0, { resource_regen: { hp: 12 } })], costs: { mana: 12, stamina: 0, cooldown: 0 } }; },
        },
        {
            id: 'solar_beam', title: 'Raio solar', category: 'Traços', description: 'Dano magical que só existe à luz do sol e fere Umbra ainda mais.',
            build: function () { return { targeting: 'enemy_one', damage: { kind: 'magical', power: { kind: 'fixed', value: 18 } }, accuracy: 100, hit_count: 1, solar: true, bonus_vs_elements: { umbra: 1.5 }, costs: { mana: 8, stamina: 0, cooldown: 0 } }; },
        },
        {
            id: 'blind', title: 'Cegar', category: 'Controle', description: 'Reduz a precisão dos ataques do inimigo.',
            build: function (skillId) { return { targeting: 'enemy_one', effects: [makeEffect(skillId, 'debuff', 'target', 0, { debuff: { accuracy: 20 }, effect_hit_chance: 0.9 })], costs: { mana: 6, stamina: 0, cooldown: 1 } }; },
        },
        {
            id: 'purify', title: 'Purificar', category: 'Controle', description: 'Remove estados negativos de um aliado.',
            build: function (skillId) { return { targeting: 'ally_one', effects: [makeEffect(skillId, 'cleanse', 'target', 0, { cleanse: 2 })], costs: { mana: 10, stamina: 0, cooldown: 1 } }; },
        },
        {
            id: 'dispel', title: 'Dissipar', category: 'Controle', description: 'Remove um estado positivo do inimigo.',
            build: function (skillId) { return { targeting: 'enemy_one', effects: [makeEffect(skillId, 'dispel', 'target', 0, { dispel: 1 })], costs: { mana: 10, stamina: 0, cooldown: 1 } }; },
        },
        {
            id: 'mending_light', title: 'Luz reparadora', category: 'Recuperação', description: 'Regenera vida ao longo de vários turnos.',
            build: function (skillId) { return { targeting: 'ally_one', effects: [makeEffect(skillId, 'regen_turn', 'target', 0, { regen_per_turn: { hp: 10 }, turns: 4 })], costs: { mana: 12, stamina: 0, cooldown: 2 } }; },
        },
        {
            id: 'night_ambush', title: 'Emboscada noturna', category: 'Golpes críticos', description: 'Golpe noturno com chance de crítico.',
            build: function () { return { targeting: 'enemy_one', damage: { kind: 'physical', power: { kind: 'fixed', value: 22 } }, accuracy: 90, hit_count: 1, nocturnal: true, crit_chance: 30, costs: { mana: 0, stamina: 8, cooldown: 1 } }; },
        },
        {
            id: 'veil', title: 'Manto de sombras', category: 'Esquiva', description: 'Aumenta a esquiva de quem o recebe.',
            build: function (skillId) { return { targeting: 'self', effects: [makeEffect(skillId, 'buff', 'self', 0, { buff: { evasion: 15 } })], costs: { mana: 8, stamina: 0, cooldown: 1 } }; },
        },
        {
            id: 'time_lock', title: 'Fecho do tempo', category: 'Controlo', description: 'Impede o alvo de usar skills e de ser escolhido.',
            build: function (skillId) { return { targeting: 'enemy_one', effects: [makeEffect(skillId, 'debuff', 'target', 0, { prevent_skills: true, untargetable: true, turns: 1 })], costs: { mana: 14, stamina: 0, cooldown: 2 } }; },
        },
        {
            id: 'blink', title: 'Arranque', category: 'Posição', description: 'Move o alvo para a outra linha.',
            build: function (skillId) { return { targeting: 'enemy_one', effects: [makeEffect(skillId, 'move', 'target', 0, { move: { who: 'target', to_line: 'other' } })], costs: { mana: 10, stamina: 0, cooldown: 1 } }; },
        },
        {
            id: 'oath', title: 'Juramento de sangue', category: 'Preço em vida', description: 'Custa vida agora e paga o resto no turno seguinte.',
            build: function (skillId) { return { targeting: 'enemy_one', damage: { kind: 'physical', power: { kind: 'fixed', value: 26 } }, accuracy: 100, hit_count: 1, effects: [makeEffect(skillId, 'debuff', 'target', 0, { deferred_cost: { hp: 12 } })], costs: { mana: 0, stamina: 0, hp: 10, cooldown: 1 } }; },
        },
    ];

    function makeSkill(project, name, elementId, requirements, template) {
        var baseId = slug(name);
        var id = baseId;
        var suffix = 2;
        while (project.skills.some(function (skill) { return skill.id === id; })) id = baseId + '_' + suffix++;
        var skill = {
            id: id,
            name: name || 'Nova skill',
            description: template?.description || '',
            element_id: elementId || 'aqua',
            learning_cost: { experience_points: 1 },
            learning_requirements: { required_attack_ids: (requirements || []).slice() },
            targeting: 'enemy_one',
            costs: { mana: 0, stamina: 0, cooldown: 0 },
            effects: [],
        };
        if (template) Object.assign(skill, template.build(id));
        return skill;
    }

    /* Alvo em linguagem natural, para a descrição automática. */
    var TARGET_PHRASES = {
        enemy_one: 'a um inimigo', enemies_all: 'a todos os inimigos',
        ally_one: 'a um aliado', allies_all: 'a todos os aliados',
        self: 'a si próprio', both_teams: 'a ambas as equipas',
    };

    var RESOURCE_NAMES = { hp: 'vida', mana: 'mana', stamina: 'stamina' };

    /** Lê o poder autorado (número, `{ value }` ou `{ min, max }`). */
    function readPowerValue(spec) {
        if (typeof spec === 'number' && Number.isFinite(spec)) return spec;
        if (!spec || typeof spec !== 'object') return 0;
        if (Number.isFinite(Number(spec.value))) return Number(spec.value);
        if (Number.isFinite(Number(spec.min)) && Number.isFinite(Number(spec.max))) {
            return (Number(spec.min) + Number(spec.max)) / 2;
        }
        if (Number.isFinite(Number(spec.multiplier))) return Number(spec.multiplier);
        return 0;
    }

    /**
     * Escreve a descrição da skill a partir do que foi escolhido.
     *
     * Serve de ponto de partida: o autor escreve por cima do que o Forger
     * sugere, mas nunca parte de uma caixa vazia.
     */
    function describeSkill(skill) {
        var sentences = [];
        var target = TARGET_PHRASES[skill.targeting] || 'ao alvo';
        var damage = skill.damage;
        if (damage) {
            var kind = damage.kind === 'physical' ? 'físico' : 'mágico';
            var power = Math.round(readPowerValue(damage.power));
            var hits = Math.max(1, Number(skill.hit_count) || 1);
            var accuracy = skill.accuracy === undefined ? 100 : Math.round(Number(skill.accuracy));
            var headline = 'Inflige ' + power + ' de dano ' + kind + ' ' + target;
            var details = [];
            if (hits > 1) details.push(hits + ' golpes');
            if (accuracy !== 100) details.push(accuracy + '% de precisão');
            sentences.push(headline + (details.length ? ' (' + details.join(', ') + ')' : '') + '.');
        }
        if (skill.solar) sentences.push('Dano solar: ×1.5 de dia, ×0.5 de noite.');
        if (skill.nocturnal) sentences.push('Dano noturno: ×1.5 de noite, ×0.5 de dia.');
        if (skill.crit_chance) sentences.push(skill.crit_chance + '% de chance de crítico (×1.75).');
        if (skill.ignore_accuracy) sentences.push('Acerta sempre, sem tirada de precisão.');
        if (skill.defense_pierce) sentences.push('Ignora ' + Math.round(skill.defense_pierce * 100) + '% da defesa do alvo.');
        if (skill.guaranteed_crit_vs_status) sentences.push('Crítico garantido contra “' + skill.guaranteed_crit_vs_status + '”.');
        if (skill.bonus_vs_hp_below && typeof skill.bonus_vs_hp_below === 'object') {
            sentences.push('×' + skill.bonus_vs_hp_below.multiplier + ' contra alvos abaixo de '
                + Math.round(skill.bonus_vs_hp_below.threshold * 100) + '% de vida.');
        }
        if (skill.flee_below_hp !== undefined && skill.flee_below_hp !== null) {
            sentences.push('O alvo foge em pânico abaixo de ' + Math.round(skill.flee_below_hp * 100) + '% de vida.');
        }
        if (skill.costs?.hp) sentences.push('Custa ' + skill.costs.hp + ' de vida a quem a usa.');
        if (skill.bonus_vs_elements && typeof skill.bonus_vs_elements === 'object') {
            Object.keys(skill.bonus_vs_elements).forEach(function (elementId) {
                sentences.push('Fere ' + elementId + ' com ×' + skill.bonus_vs_elements[elementId] + '.');
            });
        }
        (skill.effects || []).forEach(function (effect) {
            sentences.push(describeEffect(effect, target));
        });
        if (!sentences.length) sentences.push('Uma skill do elemento ' + (skill.element_id || 'sem elemento') + '.');
        return sentences.join(' ');
    }

    /** Uma frase por efeito. */
    function describeEffect(effect, target) {
        var where = effect.apply_to === 'self' ? 'a si próprio'
            : effect.apply_to === 'allies_all' ? 'a todos os aliados'
                : effect.apply_to === 'enemies_all' ? 'a todos os inimigos'
                    : effect.apply_to === 'both_teams' ? 'a ambas as equipas' : target;
        var turns = effect.turns ? ' durante ' + effect.turns + ' turnos' : '';
        var fragments = [];
        if (effect.cleanse_all) fragments.push('Remove todos os estados negativos ' + where + '.');
        else if (effect.cleanse) fragments.push('Remove até ' + effect.cleanse + ' estado(s) negativo(s) ' + where + '.');
        if (effect.dispel_all) fragments.push('Remove todos os estados positivos ' + where + '.');
        else if (effect.dispel) fragments.push('Remove ' + effect.dispel + ' estado(s) positivo(s) ' + where + '.');
        if (effect.dispel_status) fragments.push('Remove o estado “' + effect.dispel_status + '” ' + where + '.');
        if (effect.resource_regen && typeof effect.resource_regen === 'object') {
            Object.keys(effect.resource_regen).forEach(function (resource) {
                fragments.push('Recupera ' + effect.resource_regen[resource] + ' de ' + (RESOURCE_NAMES[resource] || resource) + ' ' + where + '.');
            });
        }
        if (effect.regen_per_turn && typeof effect.regen_per_turn === 'object') {
            Object.keys(effect.regen_per_turn).forEach(function (resource) {
                fragments.push('Regenera ' + effect.regen_per_turn[resource] + ' de ' + (RESOURCE_NAMES[resource] || resource) + ' por turno' + turns + ' ' + where + '.');
            });
        }
        if (effect.heal) fragments.push('Cura ' + effect.heal + ' de vida ' + where + '.');
        if (effect.damage_per_turn) fragments.push('Inflige ' + effect.damage_per_turn + ' de dano por turno' + turns + ' ' + where + '.');
        if (effect.damage) fragments.push('Inflige ' + effect.damage + ' de dano ' + where + '.');
        ['buff', 'debuff'].forEach(function (key) {
            var stats = effect[key];
            if (!stats || typeof stats !== 'object') return;
            Object.keys(stats).forEach(function (statName) {
                var amount = Number(stats[statName]);
                var verb = key === 'buff' ? 'Aumenta' : 'Reduz';
                fragments.push(verb + ' ' + statName + ' em ' + Math.abs(amount) + turns + ' ' + where + '.');
            });
        });
        if (effect.status_immunities && effect.status_immunities.length) {
            fragments.push('Concede imunidade a: ' + effect.status_immunities.join(', ') + '.');
        }
        if (effect.prevent_actions && effect.prevent_actions.length) {
            fragments.push('Impede ' + effect.prevent_actions.join(', ') + ' ' + where + '.');
        }
        if (effect.prevent_skills) fragments.push('O alvo não pode usar skills.');
        if (effect.untargetable) fragments.push('O alvo não pode ser escolhido.');
        if (effect.heal_block) fragments.push('O alvo não pode ser curado por outros.');
        if (effect.counter) fragments.push('Reflete o próximo golpe recebido.');
        if (effect.turn_offset !== undefined && effect.turn_offset !== null) {
            fragments.push(effect.turn_offset >= 0
                ? 'Adianta ' + effect.turn_offset + ' turno(s) na ordem.'
                : 'Atrasa ' + Math.abs(effect.turn_offset) + ' turno(s) na ordem.');
        }
        if (effect.cooldown_tick) fragments.push('Reduz ' + effect.cooldown_tick + ' turno(s) de cooldown.');
        if (effect.deferred_damage && typeof effect.deferred_damage === 'object') {
            fragments.push('Golpe de ' + effect.deferred_damage.amount + ' que cai daqui a ' + effect.deferred_damage.after_turns + ' turno(s).');
        }
        if (effect.echo && typeof effect.echo === 'object') {
            fragments.push('Repete a última ação de quem a usa (×' + effect.echo.multiplier + ').');
        }
        if (effect.move && typeof effect.move === 'object') {
            fragments.push('Move ' + (effect.move.who === 'self' ? 'quem a usa' : 'o alvo')
                + ' para a linha ' + (effect.move.to_line === 'front' ? 'frente' : effect.move.to_line === 'rear' ? 'trás' : 'oposta')
                + (effect.move.swap_with_caster ? ', trocando de posição' : '') + '.');
        }
        if (effect.deferred_cost && typeof effect.deferred_cost === 'object' && effect.deferred_cost.hp) {
            fragments.push('Custa ' + effect.deferred_cost.hp + ' de vida no turno seguinte.');
        }
        if (effect.self_upkeep && typeof effect.self_upkeep === 'object') {
            Object.keys(effect.self_upkeep).forEach(function (resource) {
                fragments.push('Paga ' + effect.self_upkeep[resource] + ' de ' + (RESOURCE_NAMES[resource] || resource) + ' por turno.');
            });
        }
        if (effect.self_damage_per_target) {
            fragments.push('Perde ' + effect.self_damage_per_target + ' de vida por alvo alcançado.');
        }
        if (effect.drain_to === 'caster') {
            fragments.push('O recurso drenado vai para quem usa a skill.');
        }
        if (effect.rewind && typeof effect.rewind === 'object') {
            var rewindTurns = effect.rewind.turns;
            var rewindScope = rewindTurns === undefined || rewindTurns === null
                ? 'até ao início da luta'
                : 'nos últimos ' + rewindTurns + ' turno(s)';
            var rewindResources = Array.isArray(effect.rewind.resources) && effect.rewind.resources.length
                ? effect.rewind.resources.join(', ')
                : 'todos os recursos';
            fragments.push('Retrocede ' + where + ' ' + rewindScope + ': recupera ' + rewindResources + '.');
            if (effect.rewind.cleanse !== false) {
                fragments.push('Remove os estados que apareceram nesses turnos.');
            }
        }
        return fragments.join(' ');
    }

    function demoProject() {
        var project = emptyProject();
        var water = makeSkill(project, 'Jato de Aqua', 'aqua', [], TEMPLATES[1]);
        water.description = 'Um projétil de água concentrada.';
        water.damage.power.value = 18;
        setPosition(project, water, 90, 100);
        project.skills.push(water);

        var flame = makeSkill(project, 'Brasa Viva', 'ignis', [], TEMPLATES[0]);
        flame.description = 'Uma chama rápida e precisa.';
        flame.damage.power.value = 16;
        setPosition(project, flame, 90, 100);
        project.skills.push(flame);

        var smoke = makeSkill(project, 'Fumo', 'ignis', [water.id, flame.id], null);
        smoke.description = 'Uma nuvem que reduz a precisão dos ataques do inimigo.';
        smoke.targeting = 'enemy_one';
        smoke.effects = [makeEffect(smoke.id, 'debuff', 'target', 0, { debuff: { accuracy: 20 }, effect_hit_chance: 0.9 })];
        setPosition(project, smoke, 370, 170);
        project.skills.push(smoke);
        return project;
    }

    function cleanEffect(effect) {
        if (!effect || typeof effect !== 'object') return null;
        // `damage_per_turn`, `cleanse*`, `dispel*`, `regen_per_turn`, `polarity`
        // e `status_immunities` são os campos que o motor precisa; os restantes
        // cobrem turno, posição, custos e manutenção.
        var allowed = [
            'effect_id', 'element_id', 'status_effect', 'apply_to', 'turns', 'effect_hit_chance',
            'apply_chance', 'lower_accuracy', 'buff', 'debuff', 'resource_regen', 'resource_drain',
            'damage', 'damage_per_turn', 'damage_variance', 'can_stack', 'regen_variance', 'heal', 'drain',
            'polarity', 'cleanse', 'cleanse_all', 'dispel', 'dispel_all', 'dispel_status',
            'regen_per_turn', 'status_immunities', 'prevent_actions',
            'deferred_damage', 'echo', 'move', 'turn_offset', 'cooldown_tick', 'untargetable',
            'heal_block', 'counter', 'prevent_skills', 'deferred_cost', 'self_upkeep',
            'self_damage_per_target', 'drain_to', 'rewind',
        ];
        var cleaned = {};
        allowed.forEach(function (key) {
            if (effect[key] !== undefined && effect[key] !== '') cleaned[key] = clone(effect[key]);
        });
        if (!cleaned.element_id) delete cleaned.element_id;
        // Um retrocesso sem campos não é um retrocesso: some com ele.
        if (cleaned.rewind && typeof cleaned.rewind === 'object' && !Object.keys(cleaned.rewind).length) {
            delete cleaned.rewind;
        }
        return cleaned;
    }

    function normalizeSkill(source) {
        if (!source || typeof source.id !== 'string' || typeof source.name !== 'string') return null;
        var skill = {
            id: source.id,
            name: source.name,
            element_id: source.element_id || source.element || 'aqua',
            learning_cost: { experience_points: Number(source.learning_cost?.experience_points ?? 1) },
            learning_requirements: {
                required_attack_ids: Array.isArray(source.learning_requirements?.required_attack_ids)
                    ? source.learning_requirements.required_attack_ids.slice() : [],
            },
            targeting: source.targeting || source.target || 'enemy_one',
            costs: {
                mana: Number(source.costs?.mana ?? source.mana_cost ?? 0),
                stamina: Number(source.costs?.stamina ?? source.stamina_cost ?? 0),
                cooldown: Number(source.costs?.cooldown ?? source.cooldown ?? 0),
                hp: Number(source.costs?.hp ?? source.hp_cost ?? 0),
            },
            effects: Array.isArray(source.effects) ? source.effects.map(cleanEffect).filter(Boolean) : [],
        };
        var usedEffectIds = new Set();
        skill.effects.forEach(function (effect, index) {
            var baseId = effect.effect_id || (skill.id + '_effect_' + (index + 1));
            var effectId = baseId;
            var suffix = 2;
            while (usedEffectIds.has(effectId)) effectId = baseId + '_' + suffix++;
            effect.effect_id = effectId;
            usedEffectIds.add(effectId);
        });
        if (source.description) skill.description = source.description;
        if (source.solar === true || source.solar === 'true') skill.solar = true;
        if (source.nocturnal === true || source.nocturnal === 'true') skill.nocturnal = true;
        if (source.ignore_accuracy === true || source.ignore_accuracy === 'true') skill.ignore_accuracy = true;
        if (source.kind && typeof source.kind === 'string') skill.kind = source.kind;
        ['crit_chance', 'flee_below_hp', 'defense_pierce'].forEach(function (key) {
            if (source[key] === undefined || source[key] === null) return;
            var value = Number(source[key]);
            if (Number.isFinite(value)) skill[key] = value;
        });
        if (source.guaranteed_crit_vs_status && typeof source.guaranteed_crit_vs_status === 'string') {
            skill.guaranteed_crit_vs_status = source.guaranteed_crit_vs_status.trim();
        }
        if (source.bonus_vs_hp_below && typeof source.bonus_vs_hp_below === 'object') {
            var threshold = Number(source.bonus_vs_hp_below.threshold);
            var multiplier = Number(source.bonus_vs_hp_below.multiplier);
            if (Number.isFinite(threshold) && Number.isFinite(multiplier)) {
                skill.bonus_vs_hp_below = { threshold: threshold, multiplier: multiplier };
            }
        }
        if (source.bonus_vs_elements && typeof source.bonus_vs_elements === 'object') {
            var bonus = {};
            Object.keys(source.bonus_vs_elements).forEach(function (elementId) {
                var multiplier = Number(source.bonus_vs_elements[elementId]);
                if (Number.isFinite(multiplier)) bonus[elementId] = multiplier;
            });
            if (Object.keys(bonus).length) skill.bonus_vs_elements = bonus;
        }

        if (source.damage && typeof source.damage === 'object') {
            skill.damage = clone(source.damage);
        } else if (source.damage_type && source.damage_type !== 'status' && source.damage_type !== 'none') {
            skill.damage = {
                kind: source.damage_type,
                power: typeof source.power === 'object' ? clone(source.power) : { kind: 'fixed', value: Number(source.power) || 0 },
            };
        }
        if (skill.damage) {
            var accuracy = Number(source.accuracy ?? source.hit_chance ?? skill.damage.accuracy ?? 100);
            skill.accuracy = accuracy >= 0 && accuracy <= 1 ? accuracy * 100 : accuracy;
            skill.hit_count = Number(source.hit_count ?? source.hits ?? skill.damage.hit_count ?? 1);
        }
        if (source.targeting && typeof source.targeting === 'object') {
            skill.targeting = source.targeting.area || source.targeting.target || 'enemy_one';
        }
        if (source.collateral && typeof source.collateral === 'object') skill.collateral = clone(source.collateral);
        return skill;
    }

    function normalize(project) {
        if (!project || typeof project !== 'object') return demoProject();
        if (Array.isArray(project)) project = { skills: project };
        var normalized = {
            skills: (Array.isArray(project.skills) ? project.skills : []).map(normalizeSkill).filter(Boolean),
            trees: {},
        };
        Object.keys(project.trees || {}).forEach(function (elementId) {
            var tree = project.trees[elementId] || {};
            // Rascunhos antigos tinham `name` aqui; ignora-o — o nome deriva do elemento.
            normalized.trees[elementId] = {
                positions: tree.positions && typeof tree.positions === 'object' ? clone(tree.positions) : {},
            };
        });
        // Rebuild even when a draft already has coordinates: saved positions came
        // from the former manual/left-to-right canvas and are not layout input.
        ensurePositions(normalized);
        return normalized;
    }

    function calculatePath(skillId, project) {
        var byId = new Map(project.skills.map(function (skill) { return [skill.id, skill]; }));
        var visited = new Set();
        var active = new Set();
        var path = [];
        function visit(id) {
            if (visited.has(id) || active.has(id)) return;
            var skill = byId.get(id);
            if (!skill) return;
            active.add(id);
            (skill.learning_requirements?.required_attack_ids || []).forEach(visit);
            active.delete(id);
            visited.add(id);
            path.push(skill);
        }
        visit(skillId);
        return path;
    }

    function validate(project) {
        var errors = [];
        var warnings = [];
        var byId = new Map();
        project.skills.forEach(function (skill) {
            var path = 'skills.' + skill.id;
            if (byId.has(skill.id)) errors.push({ path: path + '.id', message: 'ID duplicado: ' + skill.id });
            byId.set(skill.id, skill);
            if (!skill.name || !skill.name.trim()) errors.push({ path: path + '.name', message: 'A skill precisa de um nome.' });
            if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(skill.id || '')) {
                errors.push({ path: path + '.id', message: 'O ID tem de estar em snake_case (ex.: sunray, holy_nova).' });
            }
            if (!skill.description || !skill.description.trim()) {
                warnings.push({ path: path + '.description', message: 'A skill não tem descrição — o jogo mostra-a ao jogador.' });
            }
            if (!ELEMENTS.includes(skill.element_id)) errors.push({ path: path + '.element_id', message: 'Elemento não reconhecido: ' + skill.element_id });
            else if (skill.element_id === 'inanus') {
                warnings.push({ path: path + '.element_id', message: '“inanus” não tem relações de elemento: o dano nunca é alterado por tabela.' });
            }
            if (skill.kind && SKILL_KINDS.indexOf(skill.kind) === -1) {
                errors.push({ path: path + '.kind', message: '“kind” tem de ser um de: ' + SKILL_KINDS.join(', ') + '.' });
            }
            if (skill.damage) {
                var damageKind = skill.damage.kind || skill.damage.damage_type;
                if (damageKind === 'pure') {
                    warnings.push({ path: path + '.damage.kind', message: '“pure” esconde a skill do catálogo de jogo.' });
                } else if (!['physical', 'magical'].includes(damageKind)) {
                    errors.push({ path: path + '.damage.kind', message: 'O dano direto só pode ser físico ou mágico.' });
                }
            }
            if (skill.damage && skill.damage.power && typeof skill.damage.power === 'object' && skill.damage.power.kind === 'scaling') {
                warnings.push({ path: path + '.damage.power', message: 'O motor ainda não lê “power.kind: scaling” (readPower devolve 0) — usa um valor fixo até existir suporte.' });
            }
            if (skill.accuracy !== undefined && skill.accuracy !== null) {
                var accuracy = Number(skill.accuracy);
                if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100) {
                    errors.push({ path: path + '.accuracy', message: 'A precisão tem de estar entre 0 e 100.' });
                }
            }
            if (skill.hit_count !== undefined && skill.hit_count !== null) {
                var hitCount = Number(skill.hit_count);
                if (!Number.isFinite(hitCount) || hitCount < 1) {
                    errors.push({ path: path + '.hit_count', message: 'O número de golpes tem de ser 1 ou mais.' });
                }
            }
            if (skill.solar !== undefined && typeof skill.solar !== 'boolean') {
                errors.push({ path: path + '.solar', message: '“solar” tem de ser verdadeiro ou falso.' });
            }
            if (skill.nocturnal !== undefined && typeof skill.nocturnal !== 'boolean') {
                errors.push({ path: path + '.nocturnal', message: '“nocturnal” tem de ser verdadeiro ou falso.' });
            }
            if (skill.solar === true && skill.nocturnal === true) {
                warnings.push({ path: path + '.nocturnal', message: 'Uma skill não pode ser solar e noturna ao mesmo tempo — os dois traços se cancelam.' });
            }
            if (skill.ignore_accuracy !== undefined && typeof skill.ignore_accuracy !== 'boolean') {
                errors.push({ path: path + '.ignore_accuracy', message: '“ignore_accuracy” tem de ser verdadeiro ou falso.' });
            }
            if (skill.crit_chance !== undefined && skill.crit_chance !== null) {
                var crit = Number(skill.crit_chance);
                if (!Number.isFinite(crit) || crit < 0 || crit > 100) {
                    errors.push({ path: path + '.crit_chance', message: 'A chance de crítico tem de estar entre 0 e 100.' });
                }
            }
            if (skill.flee_below_hp !== undefined && skill.flee_below_hp !== null) {
                var flee = Number(skill.flee_below_hp);
                if (!Number.isFinite(flee) || flee < 0 || flee > 1) {
                    errors.push({ path: path + '.flee_below_hp', message: 'O limite de fuga tem de ser uma fração entre 0 e 1 (0.4 = 40% de vida).' });
                }
            }
            if (skill.defense_pierce !== undefined && skill.defense_pierce !== null) {
                var pierce = Number(skill.defense_pierce);
                if (!Number.isFinite(pierce) || pierce < 0 || pierce > 1) {
                    errors.push({ path: path + '.defense_pierce', message: 'A percentagem de defesa ignorada tem de estar entre 0 e 1 (0.5 = metade da defesa).' });
                }
            }
            if (skill.guaranteed_crit_vs_status !== undefined && !String(skill.guaranteed_crit_vs_status).trim()) {
                errors.push({ path: path + '.guaranteed_crit_vs_status', message: 'O ID do status não pode estar vazio.' });
            }
            if (skill.bonus_vs_hp_below && typeof skill.bonus_vs_hp_below === 'object') {
                var hpThreshold = Number(skill.bonus_vs_hp_below.threshold);
                var hpMultiplier = Number(skill.bonus_vs_hp_below.multiplier);
                if (!Number.isFinite(hpThreshold) || hpThreshold <= 0 || hpThreshold > 1) {
                    errors.push({ path: path + '.bonus_vs_hp_below.threshold', message: 'O limiar de vida tem de ser uma fração entre 0 e 1.' });
                }
                if (!Number.isFinite(hpMultiplier) || hpMultiplier <= 0) {
                    errors.push({ path: path + '.bonus_vs_hp_below.multiplier', message: 'O multiplicador tem de ser positivo.' });
                }
            }
            if (skill.bonus_vs_elements && typeof skill.bonus_vs_elements === 'object') {
                Object.keys(skill.bonus_vs_elements).forEach(function (elementId) {
                    var multiplier = Number(skill.bonus_vs_elements[elementId]);
                    if (!ELEMENTS.includes(elementId)) {
                        errors.push({ path: path + '.bonus_vs_elements.' + elementId, message: 'Elemento não reconhecido no bónus: ' + elementId });
                    }
                    if (!Number.isFinite(multiplier) || multiplier <= 0) {
                        errors.push({ path: path + '.bonus_vs_elements.' + elementId, message: 'O bónus tem de ser um multiplicador positivo.' });
                    }
                });
            }
            var cost = Number(skill.learning_cost?.experience_points);
            if (!Number.isFinite(cost) || cost < 0) errors.push({ path: path + '.learning_cost.experience_points', message: 'O custo tem de ser zero ou positivo.' });
            ['mana', 'stamina', 'cooldown', 'hp'].forEach(function (key) {
                var value = Number(skill.costs?.[key] ?? 0);
                if (!Number.isFinite(value) || value < 0) {
                    errors.push({ path: path + '.costs.' + key, message: 'O custo de ' + key + ' tem de ser zero ou positivo.' });
                }
            });
            var requirements = skill.learning_requirements?.required_attack_ids || [];
            if (requirements.includes(skill.id)) errors.push({ path: path + '.learning_requirements.required_attack_ids', message: 'Uma skill não pode ser pré-requisito de si própria.' });
            requirements.forEach(function (id) {
                if (!project.skills.some(function (candidate) { return candidate.id === id; })) {
                    errors.push({ path: path + '.learning_requirements.required_attack_ids', message: 'Pré-requisito não encontrado: ' + id });
                }
            });
            var effectIds = new Set();
            (skill.effects || []).forEach(function (effect, index) {
                var effectPath = path + '.effects[' + index + ']';
                if (!effect.effect_id || !effect.effect_id.trim()) errors.push({ path: effectPath + '.effect_id', message: 'Cada efeito precisa de um ID.' });
                else if (effectIds.has(effect.effect_id)) errors.push({ path: effectPath + '.effect_id', message: 'ID de efeito duplicado: ' + effect.effect_id });
                effectIds.add(effect.effect_id);
                if (effect.element_id && !ELEMENTS.includes(effect.element_id)) errors.push({ path: effectPath + '.element_id', message: 'Elemento de efeito não reconhecido: ' + effect.element_id });
                if (effect.polarity && POLARITIES.indexOf(effect.polarity) === -1) {
                    errors.push({ path: effectPath + '.polarity', message: 'A polaridade tem de ser positive, negative ou neutral.' });
                }
                if (effect.turns !== undefined && Number(effect.turns) < 0) {
                    errors.push({ path: effectPath + '.turns', message: 'A duração não pode ser negativa.' });
                }
                if (effect.effect_hit_chance !== undefined) {
                    var chance = Number(effect.effect_hit_chance);
                    if (!Number.isFinite(chance) || chance < 0 || chance > 1) {
                        errors.push({ path: effectPath + '.effect_hit_chance', message: 'A precisão do efeito tem de estar entre 0 e 1.' });
                    }
                }
                ['cleanse', 'dispel'].forEach(function (key) {
                    if (effect[key] === undefined) return;
                    var amount = Number(effect[key]);
                    if (!Number.isFinite(amount) || amount < 0) {
                        errors.push({ path: effectPath + '.' + key, message: '“' + key + '” tem de ser zero ou mais.' });
                    }
                });
                ['cleanse_all', 'dispel_all'].forEach(function (key) {
                    if (effect[key] !== undefined && typeof effect[key] !== 'boolean') {
                        errors.push({ path: effectPath + '.' + key, message: '“' + key + '” tem de ser verdadeiro ou falso.' });
                    }
                });
                if (effect.dispel_status !== undefined && !String(effect.dispel_status).trim()) {
                    errors.push({ path: effectPath + '.dispel_status', message: 'O ID do status a dissipar não pode estar vazio.' });
                }
                if (effect.regen_per_turn && typeof effect.regen_per_turn === 'object') {
                    Object.keys(effect.regen_per_turn).forEach(function (resource) {
                        if (['hp', 'mana', 'stamina'].indexOf(resource) === -1) {
                            errors.push({ path: effectPath + '.regen_per_turn.' + resource, message: 'Recurso desconhecido: ' + resource });
                        }
                        if (Number(effect.regen_per_turn[resource]) < 0) {
                            errors.push({ path: effectPath + '.regen_per_turn.' + resource, message: 'A regeneração por turno não pode ser negativa.' });
                        }
                    });
                }
                if (effect.damage_per_turn !== undefined && Number(effect.damage_per_turn) < 0) {
                    errors.push({ path: effectPath + '.damage_per_turn', message: 'O dano por turno não pode ser negativo.' });
                }
                if (effect.status_immunities !== undefined) {
                    if (!Array.isArray(effect.status_immunities) || !effect.status_immunities.length) {
                        errors.push({ path: effectPath + '.status_immunities', message: 'A lista de imunidades tem de ter pelo menos um status.' });
                    } else {
                        effect.status_immunities.forEach(function (statusId) {
                            if (!String(statusId).trim()) {
                                errors.push({ path: effectPath + '.status_immunities', message: 'Um ID de status está vazio.' });
                            }
                        });
                    }
                }
                if (effect.prevent_actions !== undefined) {
                    if (!Array.isArray(effect.prevent_actions) || !effect.prevent_actions.length) {
                        errors.push({ path: effectPath + '.prevent_actions', message: 'A lista de ações proibidas tem de ter pelo menos uma entrada.' });
                    } else {
                        effect.prevent_actions.forEach(function (kind) {
                            if (PREVENT_ACTIONS.indexOf(kind) === -1) {
                                warnings.push({ path: effectPath + '.prevent_actions', message: '“' + kind + '” não é um tipo de ação conhecido (' + PREVENT_ACTIONS.join(', ') + ').' });
                            }
                        });
                    }
                }
                ['untargetable', 'heal_block', 'counter', 'prevent_skills'].forEach(function (key) {
                    if (effect[key] !== undefined && typeof effect[key] !== 'boolean') {
                        errors.push({ path: effectPath + '.' + key, message: '“' + key + '” tem de ser verdadeiro ou falso.' });
                    }
                });
                if (effect.turn_offset !== undefined && !Number.isFinite(Number(effect.turn_offset))) {
                    errors.push({ path: effectPath + '.turn_offset', message: 'O deslocamento da ordem de turno tem de ser um número.' });
                }
                if (effect.cooldown_tick !== undefined && Number(effect.cooldown_tick) < 0) {
                    errors.push({ path: effectPath + '.cooldown_tick', message: 'A redução de cooldown não pode ser negativa.' });
                }
                if (effect.self_damage_per_target !== undefined && Number(effect.self_damage_per_target) < 0) {
                    errors.push({ path: effectPath + '.self_damage_per_target', message: 'O custo por alvo não pode ser negativo.' });
                }
                if (effect.drain_to !== undefined && ['target', 'caster'].indexOf(effect.drain_to) === -1) {
                    errors.push({ path: effectPath + '.drain_to', message: 'O destino do dreno tem de ser “target” ou “caster”.' });
                }
                if (effect.deferred_damage && typeof effect.deferred_damage === 'object') {
                    var deferredAmount = Number(effect.deferred_damage.amount);
                    var deferredTurns = Number(effect.deferred_damage.after_turns);
                    if (!Number.isFinite(deferredAmount) || deferredAmount < 0) {
                        errors.push({ path: effectPath + '.deferred_damage.amount', message: 'O dano atrasado tem de ter um valor.' });
                    }
                    if (!Number.isFinite(deferredTurns) || deferredTurns < 1) {
                        errors.push({ path: effectPath + '.deferred_damage.after_turns', message: 'O dano atrasado tem de dizer em quantos turnos cai.' });
                    }
                }
                if (effect.echo && typeof effect.echo === 'object') {
                    var echoMultiplier = Number(effect.echo.multiplier);
                    if (!Number.isFinite(echoMultiplier) || echoMultiplier <= 0) {
                        errors.push({ path: effectPath + '.echo.multiplier', message: 'O multiplicador da repetição tem de ser positivo.' });
                    }
                }
                if (effect.move && typeof effect.move === 'object') {
                    if (['target', 'self'].indexOf(effect.move.who) === -1) {
                        errors.push({ path: effectPath + '.move.who', message: 'A posição tem de dizer quem se move: “target” ou “self”.' });
                    }
                    if (['front', 'rear', 'other'].indexOf(effect.move.to_line) === -1) {
                        errors.push({ path: effectPath + '.move.to_line', message: 'A linha de destino tem de ser front, rear ou other.' });
                    }
                }
                if (effect.deferred_cost && typeof effect.deferred_cost === 'object') {
                    var deferredCost = Number(effect.deferred_cost.hp);
                    if (!Number.isFinite(deferredCost) || deferredCost < 0) {
                        errors.push({ path: effectPath + '.deferred_cost.hp', message: 'O custo diferido tem de ter um valor.' });
                    }
                }
                if (effect.self_upkeep && typeof effect.self_upkeep === 'object') {
                    Object.keys(effect.self_upkeep).forEach(function (resource) {
                        if (['hp', 'mana', 'stamina'].indexOf(resource) === -1) {
                            errors.push({ path: effectPath + '.self_upkeep.' + resource, message: 'Recurso desconhecido: ' + resource });
                        }
                        if (Number(effect.self_upkeep[resource]) < 0) {
                            errors.push({ path: effectPath + '.self_upkeep.' + resource, message: 'A manutenção não pode ser negativa.' });
                        }
                    });
                }
                if (effect.rewind !== undefined) {
                    if (!effect.rewind || typeof effect.rewind !== 'object' || Array.isArray(effect.rewind)) {
                        errors.push({ path: effectPath + '.rewind', message: 'O retrocesso tem de ser um objeto.' });
                    } else {
                        if (effect.rewind.turns !== undefined && effect.rewind.turns !== null) {
                            var rewindTurns = Number(effect.rewind.turns);
                            if (!Number.isFinite(rewindTurns) || rewindTurns < 0) {
                                errors.push({ path: effectPath + '.rewind.turns', message: 'O retrocesso tem de ser de 0 (até ao início da luta) ou mais turnos.' });
                            }
                        }
                        if (effect.rewind.resources !== undefined) {
                            if (!Array.isArray(effect.rewind.resources)) {
                                errors.push({ path: effectPath + '.rewind.resources', message: 'Os recursos têm de ser uma lista.' });
                            } else {
                                effect.rewind.resources.forEach(function (resource) {
                                    if (['hp', 'mana', 'stamina'].indexOf(resource) === -1) {
                                        errors.push({ path: effectPath + '.rewind.resources', message: 'Recurso desconhecido: ' + resource });
                                    }
                                });
                            }
                        }
                        if (effect.rewind.cleanse !== undefined && typeof effect.rewind.cleanse !== 'boolean') {
                            errors.push({ path: effectPath + '.rewind.cleanse', message: '“cleanse” tem de ser verdadeiro ou falso.' });
                        }
                    }
                }
                ['buff', 'debuff'].forEach(function (key) {
                    var stats = effect[key];
                    if (!stats || typeof stats !== 'object') return;
                    Object.keys(stats).forEach(function (statName) {
                        if (STAT_NAMES.indexOf(statName) === -1) {
                            warnings.push({ path: effectPath + '.' + key + '.' + statName, message: 'Atributo desconhecido: ' + statName });
                        }
                        if (!Number.isFinite(Number(stats[statName]))) {
                            errors.push({ path: effectPath + '.' + key + '.' + statName, message: 'O valor do atributo tem de ser numérico.' });
                        }
                    });
                });
            });
        });

        var visiting = new Set();
        var visited = new Set();
        var cycles = new Set();
        function visit(id, chain) {
            if (visiting.has(id)) {
                chain.slice(chain.indexOf(id)).forEach(function (cycleId) { cycles.add(cycleId); });
                return;
            }
            if (visited.has(id)) return;
            var skill = byId.get(id);
            if (!skill) return;
            visiting.add(id);
            (skill.learning_requirements?.required_attack_ids || []).forEach(function (requiredId) { visit(requiredId, chain.concat(id)); });
            visiting.delete(id);
            visited.add(id);
        }
        project.skills.forEach(function (skill) { visit(skill.id, []); });
        cycles.forEach(function (id) { errors.push({ path: 'skills.' + id + '.learning_requirements.required_attack_ids', message: 'Esta dependência faz parte de um ciclo global.' }); });
        return { errors: errors, warnings: warnings };
    }

    function load() {
        try {
            var raw = localStorage.getItem(KEY);
            if (raw) return normalize(JSON.parse(raw));
            // Migrate the first mockup's local-only draft once, stripping editor fields.
            var legacy = localStorage.getItem('galatime.skill-forger.draft.v1');
            return legacy ? normalize(JSON.parse(legacy)) : demoProject();
        } catch (error) { return demoProject(); }
    }

    function save(project) {
        try { localStorage.setItem(KEY, JSON.stringify(normalize(project))); return true; }
        catch (error) { return false; }
    }

    root.SkillForgerModel = {
        KEY: KEY,
        ELEMENTS: ELEMENTS,
        POLARITIES: POLARITIES,
        SKILL_KINDS: SKILL_KINDS,
        PREVENT_ACTIONS: PREVENT_ACTIONS,
        STAT_NAMES: STAT_NAMES,
        STAT_LABELS: STAT_LABELS,
        PATTERN_STATUS_NAMES: PATTERN_STATUS_NAMES,
        TEMPLATES: TEMPLATES,
        clone: clone,
        slug: slug,
        emptyProject: emptyProject,
        demoProject: demoProject,
        makeSkill: makeSkill,
        makeEffect: makeEffect,
        patternStatusName: patternStatusName,
        describeSkill: describeSkill,
        readPowerValue: readPowerValue,
        elementLabel: elementLabel,
        ensureTree: ensureTree,
        layout: layout,
        setPosition: setPosition,
        position: position,
        ensurePositions: ensurePositions,
        normalize: normalize,
        normalizeSkill: normalizeSkill,
        cleanEffect: cleanEffect,
        calculatePath: calculatePath,
        validate: validate,
        load: load,
        save: save,
    };
})(window);
