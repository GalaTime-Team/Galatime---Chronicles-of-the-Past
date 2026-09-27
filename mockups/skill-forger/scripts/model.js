(function (root) {
    'use strict';

    var KEY = 'galatime.skill-forger.draft.v2';
    var ELEMENTS = [
        'aqua', 'caeli', 'chaos', 'corporis', 'florere', 'inanus', 'ignis', 'lapis', 'lux',
        'spatium', 'umbra', 'vetus', 'vis',
    ];

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

    function makeEffect(skillId, pattern, applyTo, index, properties) {
        var effect = Object.assign({
            effect_id: skillId + '_effect_' + (index + 1),
            status_effect: pattern === 'regen' ? 'Regeneração' : pattern === 'buff' ? 'Aumento de atributos'
                : pattern === 'debuff' ? 'Redução de atributos' : pattern === 'damage' ? 'Dano sequencial' : 'Drenagem',
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
            id: 'damage_sequence', title: 'Dano sequencial', category: 'Efeitos contínuos', description: 'Aplica dano ao longo de vários turnos.',
            build: function (skillId) { return { targeting: 'enemy_one', effects: [makeEffect(skillId, 'damage', 'target', 0, { damage: 6, damage_variance: [0.8, 1.2], turns: 3, effect_hit_chance: 0.9 })], costs: { mana: 10, stamina: 0, cooldown: 0 } }; },
        },
        {
            id: 'life_drain', title: 'Drenar vida', category: 'Efeitos contínuos', description: 'Fere um inimigo e recupera vida do atacante.',
            build: function (skillId) { return { targeting: 'enemy_one', damage: { kind: 'magical', power: { kind: 'fixed', value: 20 } }, accuracy: 90, hit_count: 1, effects: [makeEffect(skillId, 'regen', 'self', 0, { resource_regen: { hp: 12 } })], costs: { mana: 12, stamina: 0, cooldown: 0 } }; },
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
        smoke.description = 'Uma nuvem que reduz a precisão do inimigo.';
        smoke.targeting = 'enemy_one';
        smoke.effects = [makeEffect(smoke.id, 'debuff', 'target', 0, { lower_accuracy: 0.2, effect_hit_chance: 0.9 })];
        setPosition(project, smoke, 370, 170);
        project.skills.push(smoke);
        return project;
    }

    function cleanEffect(effect) {
        if (!effect || typeof effect !== 'object') return null;
        var allowed = [
            'effect_id', 'element_id', 'status_effect', 'apply_to', 'turns', 'effect_hit_chance',
            'apply_chance', 'lower_accuracy', 'buff', 'debuff', 'resource_regen', 'resource_drain',
            'damage', 'damage_variance', 'can_stack', 'regen_variance', 'heal', 'drain',
        ];
        var cleaned = {};
        allowed.forEach(function (key) {
            if (effect[key] !== undefined && effect[key] !== '') cleaned[key] = clone(effect[key]);
        });
        if (!cleaned.element_id) delete cleaned.element_id;
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
        var byId = new Map();
        project.skills.forEach(function (skill) {
            var path = 'skills.' + skill.id;
            if (byId.has(skill.id)) errors.push({ path: path + '.id', message: 'ID duplicado: ' + skill.id });
            byId.set(skill.id, skill);
            if (!skill.name || !skill.name.trim()) errors.push({ path: path + '.name', message: 'A skill precisa de um nome.' });
            if (!skill.description || !skill.description.trim()) errors.push({ path: path + '.description', message: 'A skill precisa de uma descrição.' });
            if (!ELEMENTS.includes(skill.element_id)) errors.push({ path: path + '.element_id', message: 'Elemento não reconhecido: ' + skill.element_id });
            if (skill.damage && !['physical', 'magical'].includes(skill.damage.kind || skill.damage.damage_type)) {
                errors.push({ path: path + '.damage.kind', message: 'O dano direto só pode ser físico ou mágico.' });
            }
            var cost = Number(skill.learning_cost?.experience_points);
            if (!Number.isFinite(cost) || cost < 0) errors.push({ path: path + '.learning_cost.experience_points', message: 'O custo tem de ser zero ou positivo.' });
            var requirements = skill.learning_requirements?.required_attack_ids || [];
            if (requirements.includes(skill.id)) errors.push({ path: path + '.learning_requirements.required_attack_ids', message: 'Uma skill não pode ser pré-requisito de si própria.' });
            requirements.forEach(function (id) {
                if (!project.skills.some(function (candidate) { return candidate.id === id; })) {
                    errors.push({ path: path + '.learning_requirements.required_attack_ids', message: 'Pré-requisito não encontrado: ' + id });
                }
            });
            var effectIds = new Set();
            (skill.effects || []).forEach(function (effect, index) {
                if (!effect.effect_id || !effect.effect_id.trim()) errors.push({ path: path + '.effects[' + index + '].effect_id', message: 'Cada efeito precisa de um ID.' });
                else if (effectIds.has(effect.effect_id)) errors.push({ path: path + '.effects[' + index + '].effect_id', message: 'ID de efeito duplicado: ' + effect.effect_id });
                effectIds.add(effect.effect_id);
                if (effect.element_id && !ELEMENTS.includes(effect.element_id)) errors.push({ path: path + '.effects[' + index + '].element_id', message: 'Elemento de efeito não reconhecido: ' + effect.element_id });
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
        return { errors: errors, warnings: [] };
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
        TEMPLATES: TEMPLATES,
        clone: clone,
        slug: slug,
        emptyProject: emptyProject,
        demoProject: demoProject,
        makeSkill: makeSkill,
        makeEffect: makeEffect,
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
