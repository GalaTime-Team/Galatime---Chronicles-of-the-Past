(function (root) {
    'use strict';

    var Model = root.SkillForgerModel;
    var Engine = root.SkillForgerEngine;
    var PATTERNS = [
        ['regen', 'Recuperar recurso'],
        ['regen_turn', 'Regenerar por turno'],
        ['buff', 'Buff'],
        ['debuff', 'Debuff'],
        ['damage', 'Dano'],
        ['drain', 'Drenar recurso'],
        ['cleanse', 'Purificar'],
        ['dispel', 'Dissipar'],
        ['deferred', 'Dano atrasado'],
        ['echo', 'Repetir ação'],
        ['move', 'Mover posição'],
        ['upkeep', 'Manter carga'],
        ['rewind', 'Retroceder tempo'],
    ];
    var TARGET_LABELS = {
        enemy_one: 'um inimigo', enemies_all: 'todos os inimigos',
        ally_one: 'um aliado', allies_all: 'todos os aliados',
        self: 'o próprio atacante', both_teams: 'ambas as equipas',
    };
    var ZOOM_MIN = 0.1;
    var ZOOM_MAX = 2;
    var ZOOM_STEP = 0.1;
    var DEFAULT_SIMULATOR = {
        skillId: null,
        attackerPhysicalAttack: 30,
        attackerMagicalAttack: 30,
        attackerAccuracyStat: 0,
        attackerCritStat: 0,
        attackerLine: 'front',
        defenderPhysicalDefense: 20,
        defenderMagicalDefense: 20,
        defenderEvasion: 0,
        defenderLine: 'front',
        defenderDefending: false,
        defenderElements: [],
        targetHpPercent: 100,
        phase: 'day',
        level: 1,
    };
    var state = {
        project: Model.load(),
        view: 'skills',
        selectedSkillId: null,
        search: '',
        elementFilter: 'all',
        treeElement: 'aqua',
        zoom: 1,
        treeLayout: null,
        prerequisiteSelection: new Set(),
        prerequisiteSearch: '',
        openScopes: Object.create(null),
        autoDescription: Object.create(null),
        pan: null,
        saveTimer: null,
        toastTimer: null,
        simulator: Object.assign({}, DEFAULT_SIMULATOR, { defenderElements: [] }),
    };

    function byId(id) { return document.getElementById(id); }
    function currentSkill() { return state.project.skills.find(function (skill) { return skill.id === state.selectedSkillId; }) || null; }
    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, function (character) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
        });
    }
    function sortedSkills(skills) {
        return skills.slice().sort(function (a, b) {
            return a.element_id.localeCompare(b.element_id) || a.id.localeCompare(b.id);
        });
    }
    function optionMarkup(value, label, selected) {
        return '<option value="' + escapeHtml(value) + '"' + (selected ? ' selected' : '') + '>' + escapeHtml(label) + '</option>';
    }

    function boot() {
        state.selectedSkillId = state.project.skills[0]?.id || null;
        // Uma descrição vinda do rascunho é do autor: nunca a reescrevemos.
        state.project.skills.forEach(function (skill) { state.autoDescription[skill.id] = false; });
        Model.ensurePositions(state.project);
        populateElementSelects();
        populateTemplateSelect();
        wireEvents();
        renderAll();
        if (!root.jsyaml) toast('YAML offline: JSON válido como YAML 1.2 será usado nos ficheiros exportados.', true);
    }

    function populateElementSelects() {
        var elements = Model.ELEMENTS.map(function (id) { return optionMarkup(id, id, false); }).join('');
        byId('element-filter').innerHTML = optionMarkup('all', 'Todos', true) + elements;
        document.querySelector('[name="element_id"]').innerHTML = elements;
        byId('tree-element').innerHTML = elements;
        byId('element-filter').value = state.elementFilter;
        byId('tree-element').value = state.treeElement;
        var quick = byId('quick-element');
        quick.innerHTML = elements;
        quick.value = defaultElement();
    }

    function populateTemplateSelect() {
        var grouped = new Map();
        Model.TEMPLATES.forEach(function (template) {
            var category = grouped.get(template.category) || [];
            category.push(template);
            grouped.set(template.category, category);
        });
        byId('create-template').innerHTML = '<option value="">Blank — skill vazia</option>'
            + Array.from(grouped.entries()).map(function (entry) {
                return '<optgroup label="' + escapeHtml(entry[0]) + '">' + entry[1].map(function (template) {
                    return optionMarkup(template.id, template.title, false);
                }).join('') + '</optgroup>';
            }).join('');
    }

    function wireEvents() {
        document.querySelectorAll('.view-tab').forEach(function (button) {
            button.addEventListener('click', function () { setView(button.dataset.view); });
        });
        byId('btn-new-skill').addEventListener('click', function () {
            var templateId = byId('create-template').value;
            var template = Model.TEMPLATES.find(function (item) { return item.id === templateId; }) || null;
            createSkill([], defaultElement(), template);
        });
        byId('btn-empty-new').addEventListener('click', function () { createSkill([], defaultElement()); });
        byId('quick-create').addEventListener('submit', function (event) {
            event.preventDefault();
            var name = byId('quick-name').value.trim();
            if (!name) { byId('quick-name').focus(); return; }
            createSkill([], byId('quick-element').value, null, name);
        });
        byId('btn-describe-skill').addEventListener('click', function () {
            var skill = currentSkill();
            if (!skill) return;
            syncSkillFromEditor(skill);
            var description = Model.describeSkill(skill);
            byId('skill-editor').elements.description.value = description;
            skill.description = description;
            persist();
            renderInspector();
            updateDescriptionCounter();
        });
        byId('btn-add-bonus-vs').addEventListener('click', function () {
            var skill = currentSkill();
            if (!skill) return;
            addBonusRow(skill);
        });
        byId('btn-simulate-skill').addEventListener('click', function () {
            var skill = currentSkill();
            if (skill) state.simulator.skillId = skill.id;
            setView('simulator');
        });
        byId('btn-sim-reset').addEventListener('click', function () {
            state.simulator = Object.assign({}, DEFAULT_SIMULATOR, {
                skillId: state.simulator.skillId,
                defenderElements: [],
            });
            syncSimulatorInputs();
            renderSimulator();
        });
        byId('btn-tree-first-skill').addEventListener('click', function () { createSkill([], state.treeElement); });
        byId('btn-duplicate-skill').addEventListener('click', duplicateSelectedSkill);
        byId('btn-delete-skill').addEventListener('click', deleteSelectedSkill);
        byId('btn-import').addEventListener('click', function () { byId('file-input').click(); });
        byId('file-input').addEventListener('change', importFiles);
        byId('btn-export').addEventListener('click', exportPackage);
        byId('btn-import-error-ok').addEventListener('click', closeImportError);
        byId('import-error-backdrop').addEventListener('click', function (event) {
            if (event.target === byId('import-error-backdrop')) closeImportError();
        });
        byId('skill-search').addEventListener('input', function (event) {
            state.search = event.target.value.trim().toLowerCase();
            renderSkillList();
        });
        byId('element-filter').addEventListener('change', function (event) {
            state.elementFilter = event.target.value;
            renderSkillList();
        });
        byId('prerequisite-search').addEventListener('input', function (event) {
            state.prerequisiteSearch = event.target.value.trim().toLowerCase();
            var skill = currentSkill();
            if (skill) renderPrerequisites(skill);
        });
        byId('prerequisite-selected').addEventListener('click', removePrerequisite);
        byId('validation-list').addEventListener('click', handleValidationClick);

        byId('skill-editor').addEventListener('input', handleEditorInput);
        byId('skill-editor').addEventListener('change', handleEditorChange);
        byId('prerequisite-list').addEventListener('change', handlePrerequisiteChange);
        byId('skill-editor').addEventListener('change', handleScopeToggle);
        byId('skill-editor').addEventListener('change', handleCollateralToggle);
        byId('skill-editor').addEventListener('click', handleEffectActions);
        byId('skill-editor').addEventListener('input', handleEffectInput);
        byId('skill-editor').addEventListener('change', handleEffectChange);

        byId('tree-element').addEventListener('change', function (event) {
            state.treeElement = event.target.value;
            renderTree();
        });
        byId('tree-nodes').addEventListener('click', function (event) {
            var node = event.target.closest('[data-skill-node]');
            if (!node) return;
            state.selectedSkillId = node.dataset.skillNode;
            byId('tree-nodes').querySelectorAll('[data-skill-node]').forEach(function (card) {
                card.classList.toggle('is-focused', card.dataset.skillNode === state.selectedSkillId);
            });
            var skills = state.project.skills.filter(function (skill) { return skill.element_id === state.treeElement; });
            renderEdges(skills, Model.layout(state.project, state.treeElement));
        });
        byId('tree-nodes').addEventListener('dblclick', function (event) {
            var node = event.target.closest('[data-skill-node]');
            if (!node) return;
            state.selectedSkillId = node.dataset.skillNode;
            setView('skills');
            renderSkillList();
            renderEditor();
            renderInspector();
        });
        byId('tree-canvas').addEventListener('pointerdown', startPan);
        window.addEventListener('pointermove', movePan);
        window.addEventListener('pointerup', stopPan);
        byId('btn-zoom-in').addEventListener('click', function () { setZoom(state.zoom + ZOOM_STEP); });
        byId('btn-zoom-out').addEventListener('click', function () { setZoom(state.zoom - ZOOM_STEP); });
        byId('btn-zoom-reset').addEventListener('click', fitTree);
        byId('zoom-level').addEventListener('click', function () { setZoom(1); });
        byId('tree-canvas').addEventListener('wheel', function (event) {
            if (!event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            setZoom(state.zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP), event);
        }, { passive: false });

        byId('sim-skill').addEventListener('change', function (event) {
            state.simulator.skillId = event.target.value;
            renderSimulator();
        });
        var SIM_NUMBER_FIELDS = {
            'sim-attack-physical': 'attackerPhysicalAttack',
            'sim-attack-magical': 'attackerMagicalAttack',
            'sim-attacker-accuracy': 'attackerAccuracyStat',
            'sim-attacker-crit': 'attackerCritStat',
            'sim-defense-physical': 'defenderPhysicalDefense',
            'sim-defense-magical': 'defenderMagicalDefense',
            'sim-defender-evasion': 'defenderEvasion',
            'sim-target-hp': 'targetHpPercent',
        };
        Object.keys(SIM_NUMBER_FIELDS).forEach(function (id) {
            byId(id).addEventListener('input', function (event) {
                state.simulator[SIM_NUMBER_FIELDS[id]] = numberValue(event.target.value, 0);
                renderSimulator();
            });
        });        var SIM_SELECT_FIELDS = {
            'sim-attacker-line': 'attackerLine',
            'sim-defender-line': 'defenderLine',
            'sim-phase': 'phase',
        };
        Object.keys(SIM_SELECT_FIELDS).forEach(function (id) {
            byId(id).addEventListener('change', function (event) {
                state.simulator[SIM_SELECT_FIELDS[id]] = event.target.value;
                renderSimulator();
            });
        });
        byId('sim-level').addEventListener('change', function (event) {
            state.simulator.level = numberValue(event.target.value, 1);
            renderSimulator();
        });
        byId('sim-defending').addEventListener('change', function (event) {
            state.simulator.defenderDefending = event.target.checked;
            renderSimulator();
        });
        byId('sim-elements').addEventListener('change', function (event) {
            var elementId = event.target.dataset.element;
            if (!elementId) return;
            var selected = new Set(state.simulator.defenderElements);
            if (event.target.checked) selected.add(elementId);
            else selected.delete(elementId);
            state.simulator.defenderElements = Array.from(selected);
            renderSimulator();
        });
    }

    function setView(view) {
        state.view = view;
        document.querySelectorAll('.view-tab').forEach(function (button) {
            button.classList.toggle('is-active', button.dataset.view === view);
        });
        byId('skills-view').hidden = view !== 'skills';
        byId('trees-view').hidden = view !== 'trees';
        byId('simulator-view').hidden = view !== 'simulator';
        if (view === 'trees') renderTree();
        if (view === 'simulator') { syncSimulatorInputs(); renderSimulator(); }
    }

    function renderAll() {
        byId('skill-count').textContent = state.project.skills.length;
        byId('tree-count').textContent = new Set(state.project.skills.map(function (skill) { return skill.element_id; })).size;
        renderSkillList();
        renderEditor();
        renderInspector();
        renderTree();
        renderSimulator();
    }

    function renderSkillList() {
        var list = byId('skill-list');
        var skills = sortedSkills(state.project.skills).filter(function (skill) {
            var searchMatch = !state.search || (skill.name + ' ' + skill.id + ' ' + skill.element_id).toLowerCase().includes(state.search);
            return searchMatch && (state.elementFilter === 'all' || skill.element_id === state.elementFilter);
        });
        byId('visible-count').textContent = skills.length;
        list.innerHTML = skills.length ? skills.map(function (skill) {
            return '<button type="button" class="skill-row ' + (skill.id === state.selectedSkillId ? 'is-selected' : '') + '" data-skill-id="' + escapeHtml(skill.id) + '">'
                + '<span class="skill-row-text"><strong>' + escapeHtml(skill.name) + '</strong><small>' + escapeHtml(skill.element_id) + ' <i>·</i> ' + escapeHtml(skill.id) + '</small></span></button>';
        }).join('') : '<div class="list-empty">' + (state.project.skills.length ? 'Sem resultados para esta pesquisa.' : 'Ainda não há skills. Cria uma ou começa por um modelo.') + '</div>';
        list.querySelectorAll('[data-skill-id]').forEach(function (button) {
            button.addEventListener('click', function () {
                state.selectedSkillId = button.dataset.skillId;
                state.prerequisiteSearch = '';
                byId('prerequisite-search').value = '';
                renderSkillList();
                renderEditor();
                renderInspector();
            });
        });
    }

    function renderEditor() {
        var skill = currentSkill();
        byId('empty-editor').hidden = Boolean(skill);
        byId('skill-editor').hidden = !skill;
        byId('btn-delete-skill').disabled = !skill;
        byId('btn-duplicate-skill').disabled = !skill;
        byId('current-id').textContent = skill ? skill.id : '—';
        if (!skill) {
            byId('prerequisite-list').innerHTML = '';
            byId('prerequisite-selected').innerHTML = '';
            byId('prerequisite-search').value = '';
            byId('self-effects').innerHTML = '';
            byId('target-effects').innerHTML = '';
            byId('team-effects').innerHTML = '';
            byId('bonus-vs-rows').innerHTML = '';
            byId('skill-summary').innerHTML = '';
            byId('editor-message').textContent = '';
            return;
        }

        state.prerequisiteSelection = new Set(skill.learning_requirements?.required_attack_ids || []);
        byId('prerequisite-search').value = state.prerequisiteSearch;

        var form = byId('skill-editor');
        form.elements.name.value = skill.name || '';
        form.elements.element_id.value = skill.element_id;
        form.elements.description.value = skill.description || '';
        form.elements.xp_cost.value = skill.learning_cost?.experience_points ?? 0;
        form.elements.targeting.value = normalizeTarget(skill.targeting);
        form.elements.direct_action.value = skill.damage ? 'damage' : 'none';
        form.elements.damage_type.value = skill.damage?.kind || skill.damage?.damage_type || 'magical';
        var power = skill.damage?.power;
        if (typeof power === 'number') power = { kind: 'fixed', value: power };
        form.elements.power_kind.value = power?.kind === 'random' ? 'random' : (power?.kind === 'scaling' ? 'attribute' : 'fixed');
        form.elements.power_value.value = power?.value ?? power?.multiplier ?? power?.min ?? 0;
        form.elements.accuracy.value = Number(skill.accuracy ?? 100);
        form.elements.hit_count.value = skill.hit_count ?? 1;
        form.elements.mana_cost.value = skill.costs?.mana ?? 0;
        form.elements.stamina_cost.value = skill.costs?.stamina ?? 0;
        form.elements.hp_cost.value = skill.costs?.hp ?? 0;
        form.elements.cooldown.value = skill.costs?.cooldown ?? 0;
        form.elements.solar.checked = Boolean(skill.solar);
        form.elements.nocturnal.checked = Boolean(skill.nocturnal);
        form.elements.ignore_accuracy.checked = Boolean(skill.ignore_accuracy);
        form.elements.crit_chance.value = skill.crit_chance ?? '';
        form.elements.guaranteed_crit_vs_status.value = skill.guaranteed_crit_vs_status || '';
        form.elements.defense_pierce.value = skill.defense_pierce ?? '';
        form.elements.bonus_vs_hp_below_threshold.value = skill.bonus_vs_hp_below?.threshold ?? '';
        form.elements.bonus_vs_hp_below_multiplier.value = skill.bonus_vs_hp_below?.multiplier ?? '';
        form.elements.flee_below_hp.value = skill.flee_below_hp ?? '';
        updatePowerFields(false);
        if (form.elements.power_kind.value === 'random' && form.elements.power_max) form.elements.power_max.value = power?.max ?? form.elements.power_value.value;
        if (form.elements.power_kind.value === 'attribute' && form.elements.power_stat) form.elements.power_stat.value = power?.stat || 'magical_attack';
        renderPrerequisites(skill);
        updateTargetContext(skill);
        renderCollateral(skill);
        renderEffectScopes(skill);
        renderBonusVs(skill);
        renderSkillSummary(skill);
        updateDescriptionCounter();
        byId('direct-cost').textContent = (Number(skill.learning_cost?.experience_points) || 0) + ' XP';
        byId('editor-message').textContent = 'O ID foi gerado uma vez. Alterar o nome não o altera.';
    }

    function updateDescriptionCounter() {
        var field = byId('skill-editor').elements.description;
        var counter = byId('description-counter');
        if (!field || !counter) return;
        var length = field.value.trim().length;
        counter.textContent = length ? length + ' caracteres' : 'Sem descrição — usa “Gerar descrição”.';
    }

    /**
     * Mantém a descrição em dia enquanto o autor não a tiver escrito.
     *
     * A partir do momento em que o texto é digitado, a descrição passa a ser do
     * autor e o Forger nunca mais a toca.
     */
    function refreshAutoDescription(skill) {
        if (!skill || state.autoDescription[skill.id] === false) return;
        var generated = Model.describeSkill(skill);
        if (generated === skill.description) return;
        skill.description = generated;
        var field = byId('skill-editor').elements.description;
        if (field && field.value !== generated) {
            field.value = generated;
            updateDescriptionCounter();
        }
    }

    /** Resumo em tiras: o que a skill é, num relance. */
    function renderSkillSummary(skill) {
        var container = byId('skill-summary');
        if (!container) return;
        var chips = [];
        chips.push({ label: 'Elemento', value: skill.element_id });
        chips.push({ label: 'Alvo', value: TARGET_LABELS[normalizeTarget(skill.targeting)] || skill.targeting });
        if (skill.damage) {
            var power = Model.readPowerValue(skill.damage.power);
            chips.push({
                label: 'Dano',
                value: power + ' ' + (skill.damage.kind === 'physical' ? 'físico' : 'mágico')
                    + (skill.hit_count > 1 ? ' × ' + skill.hit_count : ''),
            });
            chips.push({ label: 'Precisão', value: (skill.accuracy ?? 100) + '%' });
        } else {
            chips.push({ label: 'Dano', value: 'Sem dano direto' });
        }
        var costs = [];
        if (skill.costs?.mana) costs.push(skill.costs.mana + ' MP');
        if (skill.costs?.stamina) costs.push(skill.costs.stamina + ' ST');
        if (skill.costs?.cooldown) costs.push(skill.costs.cooldown + ' turnos');
        chips.push({ label: 'Custo', value: costs.length ? costs.join(' · ') : 'Grátis' });
        chips.push({ label: 'Aprender', value: (Number(skill.learning_cost?.experience_points) || 0) + ' XP' });
        if (skill.solar) chips.push({ label: 'Traço', value: 'Solar (×1.5 dia / ×0.5 noite)' });
        if (skill.nocturnal) chips.push({ label: 'Traço', value: 'Noturna (×1.5 noite / ×0.5 dia)' });
        if (skill.crit_chance) chips.push({ label: 'Crítico', value: skill.crit_chance + '%' });
        if (skill.ignore_accuracy) chips.push({ label: 'Traço', value: 'Não falha' });
        if (skill.defense_pierce) chips.push({ label: 'Traço', value: 'Ignora ' + Math.round(skill.defense_pierce * 100) + '% da defesa' });
        if (skill.bonus_vs_elements && Object.keys(skill.bonus_vs_elements).length) {
            chips.push({
                label: 'Bónus',
                value: Object.keys(skill.bonus_vs_elements).map(function (id) { return id + ' ×' + skill.bonus_vs_elements[id]; }).join(' · '),
            });
        }
        var effectCount = (skill.effects || []).length;
        if (effectCount) chips.push({ label: 'Efeitos', value: String(effectCount) });
        container.innerHTML = chips.map(function (chip) {
            return '<span class="summary-chip"><span>' + escapeHtml(chip.label) + '</span><strong>' + escapeHtml(chip.value) + '</strong></span>';
        }).join('');
    }

    function normalizeTarget(value) {
        if (typeof value === 'string') return value;
        if (value && typeof value === 'object') return value.area || value.target || 'enemy_one';
        return 'enemy_one';
    }

    function renderPrerequisites(skill) {
        var selected = state.prerequisiteSelection;
        var query = state.prerequisiteSearch;
        var candidates = sortedSkills(state.project.skills.filter(function (candidate) {
            if (candidate.id === skill.id) return false;
            return !query || (candidate.id + ' ' + candidate.name + ' ' + candidate.element_id).toLowerCase().includes(query);
        }));
        byId('prerequisite-count').textContent = selected.size ? selected.size + ' selecionada(s)' : 'Nenhuma selecionada';
        byId('prerequisite-selected').innerHTML = selected.size
            ? Array.from(selected).map(function (id) {
                var candidate = state.project.skills.find(function (item) { return item.id === id; });
                var isExternal = Boolean(candidate) && candidate.element_id !== skill.element_id;
                var label = isExternal ? candidate.element_id + ' · ' + candidate.id : (candidate ? candidate.id : id);
                return '<span class="selected-requirement"' + (isExternal ? ' title="Pré-requisito externo (outra árvore)"' : '') + '>' + escapeHtml(label) + '<button type="button" data-remove-prerequisite="' + escapeHtml(id) + '" aria-label="Remover pré-requisito">×</button></span>';
            }).join('')
            : '';
        byId('prerequisite-list').innerHTML = candidates.length ? candidates.map(function (candidate) {
            var crossTree = candidate.element_id !== skill.element_id;
            return '<label class="prereq-option' + (selected.has(candidate.id) ? ' is-selected' : '') + '"><input type="checkbox" data-prerequisite="' + escapeHtml(candidate.id) + '" ' + (selected.has(candidate.id) ? 'checked' : '') + '><span class="prereq-copy"><strong>' + escapeHtml(candidate.name) + '</strong><small>' + escapeHtml(candidate.id) + '</small></span><span class="prereq-meta"><code>' + escapeHtml(candidate.element_id) + '</code><span>' + (crossTree ? 'OUTRA ÁRVORE' : 'ESTA ÁRVORE') + '</span><b>' + (Number(candidate.learning_cost?.experience_points) || 0) + ' XP</b></span></label>';
        }).join('') : '<p class="muted-label prereq-empty">' + (state.project.skills.length > 1 ? 'Nenhuma skill corresponde à pesquisa.' : 'Cria mais skills para escolher pré-requisitos.') + '</p>';
    }

    /* --- Bónus contra elementos ----------------------------------------- */
    function renderBonusVs(skill) {
        var container = byId('bonus-vs-rows');
        if (!container) return;
        var bonus = skill.bonus_vs_elements || {};
        container.innerHTML = Object.keys(bonus).map(function (elementId) {
            return bonusRowMarkup(elementId, bonus[elementId]);
        }).join('');
    }

    function bonusRowMarkup(elementId, multiplier) {
        var options = Model.ELEMENTS.map(function (id) {
            return optionMarkup(id, id, id === elementId);
        }).join('');
        return '<div class="bonus-row">'
            + '<select class="control control-small" data-bonus-element>' + options + '</select>'
            + '<div class="input-suffix bonus-value"><input class="control control-small" data-bonus-value type="number" min="0" step="0.1" value="' + escapeHtml(multiplier) + '"><span>×</span></div>'
            + '<button class="icon-button icon-button-small" type="button" data-remove-bonus title="Remover bónus">×</button>'
            + '</div>';
    }

    function addBonusRow(skill) {
        var container = byId('bonus-vs-rows');
        var used = new Set(Object.keys(skill.bonus_vs_elements || {}));
        var candidate = Model.ELEMENTS.find(function (id) { return !used.has(id); }) || Model.ELEMENTS[0];
        var wrapper = document.createElement('div');
        wrapper.innerHTML = bonusRowMarkup(candidate, 1.5);
        container.appendChild(wrapper.firstElementChild);
        syncBonusVs(skill);
        persist();
        renderInspector();
        renderSkillSummary(skill);
    }

    function syncBonusVs(skill) {
        var container = byId('bonus-vs-rows');
        if (!container) return;
        var bonus = {};
        container.querySelectorAll('.bonus-row').forEach(function (row) {
            var elementId = row.querySelector('[data-bonus-element]')?.value;
            var multiplier = numberValue(row.querySelector('[data-bonus-value]')?.value, 0);
            if (!elementId || !Number.isFinite(multiplier) || multiplier <= 0) return;
            bonus[elementId] = multiplier;
        });
        if (Object.keys(bonus).length) skill.bonus_vs_elements = bonus;
        else delete skill.bonus_vs_elements;
    }

    function renderCollateral(skill) {
        var collateral = skill.collateral;
        var enabled = Boolean(collateral);
        var form = byId('skill-editor');
        form.elements.collateral_enabled.checked = enabled;
        byId('skill-editor').querySelector('.collateral-fields').hidden = !enabled;
        if (!enabled) return;
        form.elements.collateral_target.value = collateral.apply_to || 'both_teams';
        var chance = Number(collateral.chance ?? 1);
        form.elements.collateral_chance.value = Math.round(chance <= 1 ? chance * 100 : chance);
        var multiplier = collateral.damage_multiplier;
        form.elements.collateral_multiplier_min.value = Array.isArray(multiplier) ? multiplier[0] : (multiplier ?? 0.5);
        form.elements.collateral_multiplier_max.value = Array.isArray(multiplier) ? multiplier[1] : (multiplier ?? 0.5);
        form.elements.collateral_include_primary.checked = Boolean(collateral.include_primary_targets ?? collateral.include_primary_target);
        form.elements.collateral_include_caster.checked = Boolean(collateral.include_caster);
    }

    function renderInspector() {
        var report = Model.validate(state.project);
        var errors = report.errors || [];
        var warnings = report.warnings || [];
        byId('validation-mark').textContent = errors.length ? '!' : '✓';
        byId('validation-mark').classList.toggle('has-errors', errors.length > 0);
        var summary = '<strong class="' + (errors.length ? 'error-text' : 'ok-text') + '">'
            + (errors.length ? errors.length + ' erro(s)' : 'Sem erros') + '</strong>';
        if (warnings.length) summary += '<span class="muted-label">· ' + warnings.length + ' aviso(s)</span>';
        byId('validation-summary').innerHTML = summary;
        var items = errors.map(function (issue) {
            return '<button type="button" class="validation-item error" data-error-path="' + escapeHtml(issue.path || '') + '"><span>!</span><div><p>' + escapeHtml(issue.message) + '</p><code>' + escapeHtml(issue.path || '') + '</code><small>Ir para o campo ↗</small></div></button>';
        }).concat(warnings.map(function (issue) {
            return '<button type="button" class="validation-item warning" data-error-path="' + escapeHtml(issue.path || '') + '"><span>!</span><div><p>' + escapeHtml(issue.message) + '</p><code>' + escapeHtml(issue.path || '') + '</code></div></button>';
        }));
        byId('validation-list').innerHTML = items.length ? items.slice(0, 12).join('')
            : '<div class="validation-empty"><span>✓</span><p>As skills e pré-requisitos estão coerentes.</p></div>';
        renderPathPreview();
    }

    function handleValidationClick(event) {
        var button = event.target.closest('[data-error-path]');
        if (!button) return;
        var path = button.dataset.errorPath;
        var orderedSkills = state.project.skills.slice().sort(function (a, b) { return b.id.length - a.id.length; });
        var skill = orderedSkills.find(function (candidate) { return path.startsWith('skills.' + candidate.id + '.'); });
        if (!skill) return;

        state.selectedSkillId = skill.id;
        state.elementFilter = 'all';
        state.search = '';
        state.prerequisiteSearch = '';
        byId('element-filter').value = 'all';
        byId('skill-search').value = '';
        byId('prerequisite-search').value = '';
        setView('skills');
        renderAll();

        window.requestAnimationFrame(function () {
            var target = findFieldForIssue(skill, path, button.querySelector('p')?.textContent || '');
            if (!target) return;
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            target.focus({ preventScroll: true });
        });
    }

    function findFieldForIssue(skill, path, message) {
        var prefix = 'skills.' + skill.id + '.';
        var fieldPath = path.slice(prefix.length);
        if (fieldPath === 'name') return byId('skill-editor').elements.name;
        if (fieldPath === 'description') return byId('skill-editor').elements.description;
        if (fieldPath === 'element_id') return byId('skill-editor').elements.element_id;
        if (fieldPath.startsWith('learning_cost')) return byId('skill-editor').elements.xp_cost;
        if (fieldPath.startsWith('learning_requirements')) {
            var missing = /não encontrado:\s*(.+)$/i.exec(message);
            if (missing) {
                var remove = Array.from(document.querySelectorAll('[data-remove-prerequisite]')).find(function (item) {
                    return item.dataset.removePrerequisite === missing[1];
                });
                if (remove) return remove;
            }
            return document.querySelector('[data-prerequisite]:checked') || byId('prerequisite-search');
        }
        if (fieldPath.startsWith('damage')) {
            return fieldPath.includes('kind') ? byId('skill-editor').elements.damage_type : byId('skill-editor').elements.power_value;
        }
        if (fieldPath === 'solar') return byId('skill-editor').elements.solar;
        if (fieldPath.startsWith('bonus_vs_elements')) {
            var bonusSection = document.querySelector('.traits-section');
            if (bonusSection) bonusSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return document.querySelector('[data-bonus-value]') || byId('btn-add-bonus-vs');
        }
        if (fieldPath === 'accuracy') return byId('skill-editor').elements.accuracy;
        if (fieldPath === 'hit_count') return byId('skill-editor').elements.hit_count;
        if (fieldPath.startsWith('costs')) {
            var costField = fieldPath.split('.').pop();
            return byId('skill-editor').elements[costField + '_cost'] || byId('skill-editor').elements.cooldown;
        }
        var effectMatch = /^effects\[(\d+)\](?:\.(.+))?/.exec(fieldPath);
        if (effectMatch) {
            var effect = skill.effects?.[Number(effectMatch[1])];
            if (!effect) return byId('skill-editor').elements.name;
            var scope = effect.apply_to === 'self' ? 'self'
                : ['allies_all', 'enemies_all', 'both_teams'].includes(effect.apply_to) ? 'team' : 'target';
            state.openScopes[skill.id] = state.openScopes[skill.id] || {};
            state.openScopes[skill.id][scope] = true;
            renderEffectScopes(skill);
            var card = Array.from(document.querySelectorAll('[data-effect-card]')).find(function (item) {
                return item.dataset.effectId === effect.effect_id;
            });
            if (!card) return document.querySelector('[data-pattern-buttons="' + scope + '"] button');
            var property = effectMatch[2] || '';
            var advanced = card.querySelector('.effect-advanced');
            if (property.includes('polarity') || property.includes('immunities') || property.includes('prevent_actions')) {
                if (advanced) advanced.open = true;
            }
            if (property.includes('element_id')) return card.querySelector('[data-effect-field="element_id"]');
            if (property.includes('effect_id')) return card.querySelector('[data-effect-field="status_effect"]');
            if (property.includes('cleanse') || property.includes('dispel')) return card.querySelector('[data-effect-field="' + property.split('.')[0] + '"]');
            if (property.includes('damage')) return card.querySelector('[data-effect-field="damage_per_turn"]') || card.querySelector('[data-effect-pattern]');
            if (property.includes('regen_per_turn')) return card.querySelector('[data-effect-resource="regen_per_turn.hp"]') || card.querySelector('[data-effect-pattern]');
            if (property.includes('buff') || property.includes('debuff')) return card.querySelector('[data-stat-value]') || card.querySelector('[data-effect-pattern]');
            return card.querySelector('[data-effect-field="status_effect"]') || card.querySelector('[data-effect-pattern]');
        }
        if (fieldPath.startsWith('collateral')) {
            var details = document.querySelector('.collateral-section');
            details.open = true;
            var field = fieldPath.split('.').pop();
            if (field.includes('apply_to')) return byId('skill-editor').elements.collateral_target;
            return byId('skill-editor').elements.collateral_enabled;
        }
        return byId('skill-editor').elements.name;
    }

    function renderPathPreview() {
        var skill = currentSkill();
        var container = byId('path-preview');
        if (!skill) { container.innerHTML = '<p class="muted-label">Seleciona uma skill para ver o caminho.</p>'; return; }
        var path = Model.calculatePath(skill.id, state.project);
        var total = path.reduce(function (sum, item) { return sum + (Number(item.learning_cost?.experience_points) || 0); }, 0);
        container.innerHTML = '<div class="path-total"><span>CUSTO ACUMULADO</span><strong>' + total + ' XP</strong></div><div class="path-steps">'
            + path.map(function (item, index) {
                var cross = index > 0 && path[index - 1].element_id !== item.element_id;
                return (index ? '<span class="path-connector">↓</span>' : '') + '<div class="path-step ' + (item.id === skill.id ? 'is-current' : '') + '"><span class="path-identity"><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(item.element_id) + '</small></span><b>' + (Number(item.learning_cost?.experience_points) || 0) + ' XP</b></div>';
            }).join('') + '</div>';
    }

    /* ------------------------------------------------------------------ */
    /* Simulador — a mesma cadeia do motor, sem críticos nem variância.   */
    /* ------------------------------------------------------------------ */
    function simulatorSkill() {
        var skills = state.project.skills;
        if (!skills.length) return null;
        return skills.find(function (skill) { return skill.id === state.simulator.skillId; })
            || skills.find(function (skill) { return skill.id === state.selectedSkillId; })
            || skills[0];
    }

    function renderSimulator() {
        var select = byId('sim-skill');
        var skills = sortedSkills(state.project.skills);
        var skill = simulatorSkill();
        if (skill) state.simulator.skillId = skill.id;
        select.innerHTML = skills.length
            ? skills.map(function (item) {
                return optionMarkup(item.id, item.name + ' · ' + item.element_id, item.id === (skill && skill.id));
            }).join('')
            : '';
        if (skill) select.value = skill.id;
        renderSimulatorElements();
        var result = byId('sim-result');
        if (!skill) {
            result.innerHTML = '<div class="sim-empty"><h2>Sem skills para simular</h2><p>Cria uma skill — ou importa um <code>skills.yaml</code> — e volta aqui.</p></div>';
            return;
        }
        var sim = Engine.simulate(skill, {
            attackerPhysicalAttack: state.simulator.attackerPhysicalAttack,
            attackerMagicalAttack: state.simulator.attackerMagicalAttack,
            attackerAccuracyStat: state.simulator.attackerAccuracyStat,
            attackerCritStat: state.simulator.attackerCritStat,
            attackerLine: state.simulator.attackerLine,
            defenderPhysicalDefense: state.simulator.defenderPhysicalDefense,
            defenderMagicalDefense: state.simulator.defenderMagicalDefense,
            defenderEvasion: state.simulator.defenderEvasion,
            defenderLine: state.simulator.defenderLine,
            defenderDefending: state.simulator.defenderDefending,
            defenderElements: state.simulator.defenderElements,
            targetHpFraction: (numberValue(state.simulator.targetHpPercent, 100) || 0) / 100,
            phase: state.simulator.phase,
            level: state.simulator.level,
        });
        result.innerHTML = simulatorReport(skill, sim);
    }

    function renderSimulatorElements() {
        var container = byId('sim-elements');
        if (!container) return;
        var selected = new Set(state.simulator.defenderElements);
        container.innerHTML = Engine.elementIds().map(function (id) {
            return '<label class="sim-element"><input type="checkbox" data-element="' + escapeHtml(id) + '" ' + (selected.has(id) ? 'checked' : '') + '><span>' + escapeHtml(id) + '</span></label>';
        }).join('');
    }

    /** Escreve o estado nos campos — só quando se entra no simulador ou se repõe. */
    function syncSimulatorInputs() {
        byId('sim-attack-physical').value = state.simulator.attackerPhysicalAttack;
        byId('sim-attack-magical').value = state.simulator.attackerMagicalAttack;
        byId('sim-attacker-accuracy').value = state.simulator.attackerAccuracyStat;
        byId('sim-attacker-crit').value = state.simulator.attackerCritStat;
        byId('sim-attacker-line').value = state.simulator.attackerLine;
        byId('sim-defense-physical').value = state.simulator.defenderPhysicalDefense;
        byId('sim-defense-magical').value = state.simulator.defenderMagicalDefense;
        byId('sim-defender-evasion').value = state.simulator.defenderEvasion;
        byId('sim-target-hp').value = state.simulator.targetHpPercent;
        byId('sim-defender-line').value = state.simulator.defenderLine;
        byId('sim-defending').checked = state.simulator.defenderDefending;
        byId('sim-phase').value = state.simulator.phase;
        byId('sim-level').value = state.simulator.level;
    }

    function simulatorReport(skill, sim) {
        if (!sim.hasDamage) {
            return '<div class="sim-empty"><h2>' + escapeHtml(skill.name) + '</h2>'
                + '<p>Esta skill não causa dano direto, por isso não há número de dano a simular. '
                + 'Os efeitos que ela aplica continuam a valer: ' + escapeHtml(effectSummary(skill)) + '</p></div>';
        }
        var damageLabel = sim.damageType === 'physical' ? 'físico' : 'mágico';
        var rows = [];
        var defenseLabel = sim.defenseValue + (sim.pierced.fraction ? ' − ' + Math.round(sim.pierced.fraction * 100) + '% ignorada' : '');
        rows.push(['Ataque ÷ Defesa', sim.attackValue + ' ÷ ' + defenseLabel + ' = ' + round(sim.attackValue / Math.max(1, sim.effectiveDefense), 2)]);
        rows.push(['Elemento (' + skill.element_id + ')', '×' + sim.element.multiplier + ' — ' + sim.element.relation]);
        if (sim.phase !== 1) {
            rows.push([(skill.nocturnal ? 'Noturna' : 'Solar') + ' (' + (state.simulator.phase === 'night' ? 'noite' : 'dia') + ')', '×' + sim.phase]);
        }
        if (sim.bonus.multiplier !== 1) {
            rows.push(['Bónus contra ' + sim.bonus.element, '×' + sim.bonus.value]);
        }
        if (sim.hpBonus.multiplier !== 1) {
            rows.push(['Alvo enfraquecido (< ' + Math.round(sim.hpBonus.threshold * 100) + '% de vida)', '×' + sim.hpBonus.value]);
        }
        rows.push(['Linha (' + (state.simulator.attackerLine === 'front' ? 'frente' : 'trás') + ' → ' + (state.simulator.defenderLine === 'front' ? 'frente' : 'trás') + ')', '×' + sim.position]);
        if (sim.defenseReduction) rows.push(['Alvo a defender', '×' + (1 - sim.defenseReduction)]);

        var rangeNote = sim.minDamage !== null
            ? '<p class="sim-note">Com poder sorteado, o acerto fica entre <strong>' + sim.minDamage + '</strong> e <strong>' + sim.maxDamage + '</strong>.</p>'
            : '';

        var critNote = sim.critChance > 0
            ? '<div><span>Crítico</span><strong>' + Math.round(sim.critChance) + '% · ×' + sim.critMultiplier + '</strong></div>'
            : '';
        var guaranteed = sim.guaranteedCrit
            ? '<div><span>Crítico garantido contra</span><strong>' + escapeHtml(sim.guaranteedCrit) + '</strong></div>'
            : '';
        var flee = sim.fleeBelowHp !== null
            ? '<div><span>Alvo foge abaixo de</span><strong>' + Math.round(sim.fleeBelowHp * 100) + '% de vida</strong></div>'
            : '';

        return '<div class="sim-head">'
            + '<div><span class="eyebrow">' + escapeHtml(skill.element_id) + ' · nível ' + sim.tier.label + '</span>'
            + '<h2>' + escapeHtml(skill.name) + '</h2>'
            + '<p>Dano ' + damageLabel + ' · poder ' + round(sim.power, 1) + ' · ' + sim.hitCount + (sim.hitCount > 1 ? ' golpes' : ' golpe') + '</p></div>'
            + '</div>'
            + '<div class="sim-headline">'
            + '<div class="sim-figure sim-figure-main"><span>Dano por acerto</span><strong>' + sim.finalDamage + '</strong></div>'
            + '<div class="sim-figure"><span>Dano esperado por uso</span><strong>' + round(sim.expectedTotal, 1) + '</strong></div>'
            + '<div class="sim-figure"><span>Chance de acerto</span><strong>' + Math.round(sim.hitChance * 100) + '%</strong></div>'
            + '<div class="sim-figure"><span>Golpes esperados</span><strong>' + round(sim.expectedHits, 2) + '</strong></div>'
            + '</div>'
            + rangeNote
            + '<div class="sim-chain">'
            + rows.map(function (row) {
                return '<div class="sim-chain-row"><span>' + escapeHtml(row[0]) + '</span><strong>' + escapeHtml(row[1]) + '</strong></div>';
            }).join('')
            + '<div class="sim-chain-row is-total"><span>Dano por acerto</span><strong>' + sim.finalDamage + '</strong></div>'
            + '</div>'
            + '<div class="sim-meta">'
            + '<div><span>Custo</span><strong>' + (sim.costs.mana ? sim.costs.mana + ' MP' : 'sem mana') + (sim.costs.stamina ? ' · ' + sim.costs.stamina + ' ST' : '') + (sim.costs.hp ? ' · ' + sim.costs.hp + ' HP' : '') + (sim.costs.cooldown ? ' · ' + sim.costs.cooldown + ' turnos' : '') + '</strong></div>'
            + (sim.manaPerDamage !== null ? '<div><span>Mana por ponto de dano</span><strong>' + round(sim.manaPerDamage, 2) + '</strong></div>' : '')
            + '<div><span>Precisão</span><strong>' + Math.round(sim.accuracy.authored) + '% + ' + Math.round(sim.accuracy.modifier) + (sim.accuracy.evasion ? ' − ' + Math.round(sim.accuracy.evasion) + ' esquiva' : '') + ' = ' + Math.round(sim.accuracy.value) + '%</strong></div>'
            + critNote + guaranteed + flee
            + '<div><span>Nível</span><strong>' + sim.tier.label + ' · poder ×' + round(sim.tier.powerFactor, 2) + ' · custo ×' + round(sim.tier.costFactor, 2) + '</strong></div>'
            + '</div>'
            + '<p class="sim-note">' + (sim.scalingNote ? escapeHtml(sim.scalingNote) + ' ' : '')
            + 'Sem críticos e sem a variância (0.9 … 1.1): este é o valor esperado de um acerto, não uma tiragem.</p>';
    }

    function effectSummary(skill) {
        var effects = skill.effects || [];
        if (!effects.length) return 'não aplica nenhum efeito.';
        return effects.map(function (effect) {
            return (effect.status_effect || effect.effect_id || 'efeito');
        }).join(', ') + '.';
    }

    function round(value, decimals) {
        var factor = Math.pow(10, decimals || 0);
        return Math.round((Number(value) || 0) * factor) / factor;
    }

    function renderTree() {
        Model.ensureTree(state.project, state.treeElement);
        byId('tree-title').textContent = 'Árvore de ' + state.treeElement;
        byId('tree-subtitle').textContent = state.treeElement;
        renderTreeCanvas();
    }

    function renderTreeCanvas() {
        var skills = state.project.skills.filter(function (skill) { return skill.element_id === state.treeElement; });
        var nodes = byId('tree-nodes');
        byId('tree-skill-count').textContent = skills.length;
        byId('tree-empty').hidden = skills.length > 0;
        applyZoom();
        if (!skills.length) {
            nodes.innerHTML = '';
            byId('tree-edges').innerHTML = '';
            state.treeLayout = null;
            return;
        }
        var layout = Model.layout(state.project, state.treeElement);
        state.treeLayout = layout;
        nodes.style.width = layout.width + 'px';
        nodes.style.height = layout.height + 'px';
        byId('tree-edges').style.width = layout.width + 'px';
        byId('tree-edges').style.height = layout.height + 'px';
        nodes.innerHTML = skills.map(function (skill, index) {
            var point = layout.positions.get(skill.id);
            var requirements = skill.learning_requirements?.required_attack_ids || [];
            var external = requirements.map(function (id) { return state.project.skills.find(function (item) { return item.id === id; }); })
                .filter(function (item) { return item && item.element_id !== state.treeElement; });
            return '<article class="tree-node ' + (skill.id === state.selectedSkillId ? 'is-focused' : '') + '" data-skill-node="' + escapeHtml(skill.id) + '" draggable="false" style="left:' + point.x + 'px;top:' + point.y + 'px">'
                + '<div class="node-topline"><span class="node-element">' + escapeHtml(skill.element_id) + '</span></div>'
                + '<div class="tree-node-main"><strong>' + escapeHtml(skill.name) + '</strong><code>' + escapeHtml(skill.id) + '</code></div>'
                + '<div class="node-bottomline"><span>' + (Number(skill.learning_cost?.experience_points) || 0) + ' XP</span><span>' + (requirements.length ? '↳ ' + requirements.length + ' pré-req.' : 'Raiz') + '</span></div>'
                + (external.length ? '<div class="cross-tree-tag" title="' + escapeHtml('Pré-requisito externo: ' + external.map(function (item) { return item.element_id + ' · ' + item.id; }).join(' · ')) + '">'
                    + external.map(function (item) { return '<span>↗ ' + escapeHtml(item.element_id) + ' · ' + escapeHtml(item.id) + '</span>'; }).join('')
                    + '</div>' : '')
                + '</article>';
        }).join('');
        renderEdges(skills, layout);
    }

    function renderEdges(skills, layout) {
        var svg = byId('tree-edges');
        var positions = layout.positions;
        var markup = [];
        var activePath = new Set(Model.calculatePath(state.selectedSkillId, state.project).map(function (skill) { return skill.id; }));
        skills.forEach(function (skill) {
            var sameTreeRequirements = Array.from(new Set(skill.learning_requirements?.required_attack_ids || []))
                .filter(function (id) { return positions.has(id); })
                .sort(function (a, b) { return positions.get(a).x - positions.get(b).x; });
            sameTreeRequirements.forEach(function (requiredId, edgeIndex) {
                var from = positions.get(requiredId);
                var to = positions.get(skill.id);
                if (!from || !to) return;
                var startX = from.x + 102.5;
                var startY = from.y + 100;
                var targetSpacing = Math.min(30, 180 / Math.max(1, sameTreeRequirements.length - 1));
                var endX = to.x + 102.5 + (edgeIndex - (sameTreeRequirements.length - 1) / 2) * targetSpacing;
                var endY = to.y - 1;
                var middleY = startY + (endY - startY) / 2;
                var highlighted = activePath.has(requiredId) && activePath.has(skill.id);
                var path = 'M ' + startX + ' ' + startY + ' V ' + middleY + ' H ' + endX + ' V ' + endY;
                markup.push('<path class="tree-edge' + (highlighted ? ' is-highlighted' : '') + '" d="' + path + '" marker-end="url(#edge-arrow)"></path>');
            });
        });
        svg.setAttribute('viewBox', '0 0 ' + layout.width + ' ' + layout.height);
        svg.innerHTML = '<defs><marker id="edge-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L7,4 L0,8 z" class="edge-arrow"></path></marker></defs>' + markup.join('');
    }

    function handleEditorInput(event) {
        var skill = currentSkill();
        if (!skill) return;
        // A partir de aqui a descrição é do autor: o Forger deixa de a reescrever.
        if (event.target.name === 'description') state.autoDescription[skill.id] = false;
        if (event.target.closest('.bonus-row')) {
            syncBonusVs(skill);
            persist();
            renderInspector();
            renderSkillSummary(skill);
            return;
        }
        if (!event.target.name) return;
        syncSkillFromEditor(skill);
        if (event.target.name === 'power_kind') updatePowerFields(true);
        if (event.target.name === 'element_id') renderEffectScopes(skill);
        persist();
        updateEditorFeedback(skill, event.target.name === 'element_id');
        if (event.target.name === 'description') updateDescriptionCounter();
    }

    function handleEditorChange(event) {
        var skill = currentSkill();
        if (!skill) return;
        if (event.target.closest('.bonus-row')) {
            syncBonusVs(skill);
            persist();
            renderInspector();
            renderSkillSummary(skill);
            return;
        }
        if (!event.target.name) return;
        syncSkillFromEditor(skill);
        if (event.target.name === 'direct_action') updateDirectActionFields();
        if (event.target.name === 'power_kind') updatePowerFields(true);
        if (event.target.name === 'targeting') {
            updateTargetContext(skill);
            renderEffectScopes(skill);
        }
        if (event.target.name === 'collateral_target') syncCollateral(skill);
        if (event.target.name === 'element_id') renderEffectScopes(skill);
        persist();
        updateEditorFeedback(skill, event.target.name === 'element_id');
    }

    function syncSkillFromEditor(skill) {
        var form = byId('skill-editor');
        var oldElement = skill.element_id;
        skill.name = form.elements.name.value;
        skill.element_id = form.elements.element_id.value;
        skill.description = form.elements.description.value;
        skill.learning_cost = { experience_points: numberValue(form.elements.xp_cost.value, 0) };
        skill.learning_requirements = {
            required_attack_ids: Array.from(state.prerequisiteSelection),
        };
        skill.targeting = form.elements.targeting.value;
        skill.costs = {
            mana: numberValue(form.elements.mana_cost.value, 0),
            stamina: numberValue(form.elements.stamina_cost.value, 0),
            hp: numberValue(form.elements.hp_cost.value, 0),
            cooldown: numberValue(form.elements.cooldown.value, 0),
        };
        if (form.elements.solar.checked) skill.solar = true;
        else delete skill.solar;
        if (form.elements.nocturnal.checked) skill.nocturnal = true;
        else delete skill.nocturnal;
        if (form.elements.ignore_accuracy.checked) skill.ignore_accuracy = true;
        else delete skill.ignore_accuracy;
        setOptionalNumber(skill, 'crit_chance', form.elements.crit_chance.value);
        setOptionalNumber(skill, 'defense_pierce', form.elements.defense_pierce.value);
        setOptionalNumber(skill, 'flee_below_hp', form.elements.flee_below_hp.value);
        if (form.elements.guaranteed_crit_vs_status.value.trim()) {
            skill.guaranteed_crit_vs_status = form.elements.guaranteed_crit_vs_status.value.trim();
        } else {
            delete skill.guaranteed_crit_vs_status;
        }
        var hpThreshold = form.elements.bonus_vs_hp_below_threshold.value;
        var hpMultiplier = form.elements.bonus_vs_hp_below_multiplier.value;
        if (hpThreshold !== '' && hpMultiplier !== '') {
            skill.bonus_vs_hp_below = { threshold: numberValue(hpThreshold, 0), multiplier: numberValue(hpMultiplier, 1) };
        } else {
            delete skill.bonus_vs_hp_below;
        }
        syncBonusVs(skill);

        if (form.elements.direct_action.value === 'damage') {
            var powerValue = numberValue(form.elements.power_value.value, 0);
            var powerKind = form.elements.power_kind.value;
            var power = powerKind === 'random'
                ? { kind: 'random', min: powerValue, max: numberValue(form.elements.power_max?.value, powerValue) }
                : powerKind === 'attribute'
                    ? { kind: 'scaling', stat: form.elements.power_stat?.value || 'magical_attack', multiplier: powerValue }
                    : { kind: 'fixed', value: powerValue };
            skill.damage = { kind: form.elements.damage_type.value, power: power };
            skill.accuracy = Math.max(0, Math.min(100, numberValue(form.elements.accuracy.value, 100)));
            skill.hit_count = Math.max(1, numberValue(form.elements.hit_count.value, 1));
        } else {
            delete skill.damage;
            delete skill.accuracy;
            delete skill.hit_count;
        }

        syncEffectCards(skill);
        syncCollateral(skill);
        refreshAutoDescription(skill);

        if (oldElement !== skill.element_id) {
            if (state.project.trees[oldElement]) delete state.project.trees[oldElement].positions[skill.id];
            Model.ensureTree(state.project, skill.element_id);
            Model.position(state.project, skill, state.project.skills.indexOf(skill));
        }
    }

    function updateDirectActionFields() {
        var showDamage = byId('skill-editor').elements.direct_action.value === 'damage';
        document.querySelectorAll('[data-direct-damage]').forEach(function (field) { field.hidden = !showDamage; });
        byId('power-extra').hidden = !showDamage || byId('skill-editor').elements.power_kind.value === 'fixed';
    }

    function updateTargetContext(skill) {
        var target = normalizeTarget(skill?.targeting || byId('skill-editor').elements.targeting.value);
        // A secção própria gere os efeitos apply_to: self. Mantém-na visível
        // também quando o atacante é o alvo principal; a secção do alvo não
        // deve duplicar a pergunta nem esconder os efeitos próprios existentes.
        byId('attacker-effect-section').hidden = false;
        document.querySelector('.target-effects-section').hidden = target === 'self';
        byId('target-effects-title').textContent = target === 'self'
            ? 'O próprio atacante sofre algum efeito?'
            : 'O alvo (' + (TARGET_LABELS[target] || target) + ') sofre algum efeito?';
        updateTeamEffectsContext(skill);
        updateDirectActionFields();
    }

    function handlePrerequisiteChange(event) {
        if (!event.target.matches('[data-prerequisite]')) return;
        var skill = currentSkill();
        if (!skill) return;
        if (event.target.checked) state.prerequisiteSelection.add(event.target.dataset.prerequisite);
        else state.prerequisiteSelection.delete(event.target.dataset.prerequisite);
        syncSkillFromEditor(skill);
        persist();
        renderPrerequisites(skill);
        renderInspector();
        renderTreeCanvas();
    }

    function removePrerequisite(event) {
        var button = event.target.closest('[data-remove-prerequisite]');
        if (!button) return;
        var skill = currentSkill();
        if (!skill) return;
        state.prerequisiteSelection.delete(button.dataset.removePrerequisite);
        syncSkillFromEditor(skill);
        persist();
        renderPrerequisites(skill);
        renderInspector();
        renderTreeCanvas();
    }

    function handleScopeToggle(event) {
        var name = event.target.name;
        var scope = name === 'self_effects_enabled' ? 'self' : name === 'target_effects_enabled' ? 'target' : name === 'team_effects_enabled' ? 'team' : null;
        if (!scope) return;
        var skill = currentSkill();
        if (!skill) return;
        state.openScopes[skill.id] = state.openScopes[skill.id] || {};
        state.openScopes[skill.id][scope] = event.target.checked;
        if (!event.target.checked) {
            var effectsInScope = new Set(scopeEffects(skill, scope));
            skill.effects = (skill.effects || []).filter(function (effect) { return !effectsInScope.has(effect); });
        }
        persist();
        renderEffectScopes(skill);
        renderInspector();
    }

    function handleCollateralToggle(event) {
        if (event.target.name !== 'collateral_enabled') return;
        var skill = currentSkill();
        if (!skill) return;
        if (event.target.checked) {
            skill.collateral = { chance: 1, apply_to: 'both_teams', include_primary_targets: false, include_caster: false, damage_multiplier: [0.5, 0.5] };
        } else delete skill.collateral;
        byId('skill-editor').querySelector('.collateral-fields').hidden = !event.target.checked;
        persist();
    }

    function renderEffectScopes(skill) {
        updateTeamEffectsContext(skill);
        ['self', 'target', 'team'].forEach(function (scope) {
            var group = scopeEffects(skill, scope);
            var checkbox = document.querySelector('[name="' + scope + '_effects_enabled"]');
            var open = state.openScopes[skill.id]?.[scope];
            if (group.length > 0) open = true;
            else if (open === undefined) open = false;
            checkbox.checked = Boolean(open);
            byId(scope + '-effects').parentElement.hidden = !open;
            renderPatternButtons(scope);
            renderEffects(skill, scope);
        });
    }

    function scopeEffects(skill, scope) {
        var primaryTarget = normalizeTarget(skill.targeting);
        var teamTargets = ['allies_all', 'enemies_all', 'both_teams'];
        return (skill.effects || []).filter(function (effect) {
            var applyTo = effect.apply_to || 'target';
            if (scope === 'self') return applyTo === 'self';
            if (scope === 'team') return teamTargets.includes(applyTo) && applyTo !== primaryTarget;
            return applyTo === 'target'
                || (teamTargets.includes(applyTo) && applyTo === primaryTarget)
                || (!teamTargets.includes(applyTo) && applyTo !== 'self');
        });
    }

    function updateTeamEffectsContext(skill) {
        var primaryTarget = normalizeTarget(skill?.targeting || byId('skill-editor').elements.targeting.value);
        var title = 'Alguma equipa sofre um efeito?';
        var help = 'Aplica um efeito à equipa aliada, adversária ou a ambas.';
        if (primaryTarget === 'enemies_all') {
            title = 'A equipa aliada sofre também um efeito?';
            help = 'Todos os inimigos já são o alvo principal; aqui podes afetar os aliados.';
        } else if (primaryTarget === 'allies_all') {
            title = 'A equipa adversária sofre também um efeito?';
            help = 'Todos os aliados já são o alvo principal; aqui podes afetar os inimigos.';
        } else if (primaryTarget === 'both_teams') {
            title = 'As equipas recebem efeitos diferentes?';
            help = 'O alvo principal cobre ambas; usa esta secção para configurar um efeito próprio por lado.';
        }
        byId('team-effects-title').textContent = title;
        byId('team-effects-help').textContent = help;

    }

    function defaultTeamTarget(skill) {
        return availableTeamTargets(skill)[0] || 'allies_all';
    }

    function availableTeamTargets(skill) {
        var primaryTarget = normalizeTarget(skill.targeting);
        if (primaryTarget === 'enemies_all') return ['allies_all'];
        if (primaryTarget === 'allies_all') return ['enemies_all'];
        if (primaryTarget === 'both_teams') return ['allies_all', 'enemies_all'];
        return ['allies_all', 'enemies_all', 'both_teams'];
    }

    function renderPatternButtons(scope) {
        document.querySelector('[data-pattern-buttons="' + scope + '"]').innerHTML = PATTERNS.map(function (pattern) {
            return '<button class="pattern-button" type="button" data-add-effect="' + scope + '" data-pattern="' + pattern[0] + '">' + pattern[1] + '</button>';
        }).join('');
    }

    function renderEffects(skill, scope) {
        var container = byId(scope + '-effects');
        var effects = scopeEffects(skill, scope);
        container.innerHTML = effects.length ? effects.map(function (effect) {
            var pattern = detectPattern(effect);
            var chance = effect.effect_hit_chance ?? effect.apply_chance ?? 1;
            chance = Math.round(Number(chance) <= 1 ? Number(chance) * 100 : Number(chance));
            var applyTo = scope === 'team'
                ? '<label class="effect-field effect-field-wide"><span>Quem é afetado?</span><select class="control" data-effect-field="apply_to">' + targetOptions(effect.apply_to || defaultTeamTarget(skill), skill) + '</select></label>'
                : '';
            return '<article class="effect-card" data-effect-card data-effect-scope="' + escapeHtml(scope) + '" data-effect-id="' + escapeHtml(effect.effect_id) + '">'
                + '<div class="effect-card-head"><div><span class="field-label">EFEITO</span><code>' + escapeHtml(effect.effect_id) + '</code></div><button class="icon-button icon-button-small effect-remove" type="button" data-remove-effect="' + escapeHtml(effect.effect_id) + '" title="Remover efeito">×</button></div>'
                + '<div class="form-grid effect-main-grid">'
                + '<label class="effect-field"><span>Nome</span><input class="control" data-effect-field="status_effect" value="' + escapeHtml(effect.status_effect || '') + '" placeholder="Ex.: Regeneração"></label>'
                + '<label class="effect-field"><span>Operação</span><select class="control" data-effect-pattern>' + PATTERNS.map(function (item) { return optionMarkup(item[0], item[1], item[0] === pattern); }).join('') + '</select></label>'
                + '<label class="effect-field"><span>Elemento</span><select class="control" data-effect-field="element_id">' + optionMarkup('', 'Usar ' + skill.element_id, !effect.element_id) + Model.ELEMENTS.map(function (id) { return optionMarkup(id, id, effect.element_id === id); }).join('') + '</select></label>'
                + '<label class="effect-field"><span>Duração</span><div class="input-suffix"><input class="control" data-effect-field="turns" type="number" min="0" value="' + escapeHtml(Array.isArray(effect.turns) ? effect.turns[1] : effect.turns ?? 1) + '"><span>turnos</span></div></label>'
                + '<label class="effect-field"><span>Precisão</span><div class="input-suffix"><input class="control" data-effect-field="effect_hit_chance" type="number" min="0" max="100" value="' + chance + '"><span>%</span></div></label>'
                + applyTo + renderEffectPatternFields(effect, pattern)
                + '<label class="effect-stack"><input type="checkbox" data-effect-field="can_stack" ' + (effect.can_stack ? 'checked' : '') + '> Pode acumular</label></div>'
                + renderEffectAdvancedFields(effect)
                + '</article>';
        }).join('') : '<p class="no-effects">Escolhe um padrão para adicionar o primeiro efeito.</p>';
    }

    function renderEffectPatternFields(effect, pattern) {
        if (pattern === 'regen') {
            var regen = effect.resource_regen || {};
            return resourceInput('Recuperar vida', 'hp', regen.hp, 'resource_regen')
                + resourceInput('Recuperar mana', 'mana', regen.mana, 'resource_regen')
                + resourceInput('Recuperar stamina', 'stamina', regen.stamina, 'resource_regen')
                + '<label class="effect-field"><span>Cura imediata</span><input class="control" data-effect-field="heal" type="number" min="0" value="' + escapeHtml(effect.heal ?? '') + '" placeholder="0"><small>Paga de uma vez, ao aplicar.</small></label>';
        }
        if (pattern === 'regen_turn') {
            var perTurn = effect.regen_per_turn || {};
            return resourceInput('Vida por turno', 'hp', perTurn.hp, 'regen_per_turn')
                + resourceInput('Mana por turno', 'mana', perTurn.mana, 'regen_per_turn')
                + resourceInput('Stamina por turno', 'stamina', perTurn.stamina, 'regen_per_turn');
        }
        if (pattern === 'buff' || pattern === 'debuff') {
            return statRowsEditor(effect, pattern);
        }
        if (pattern === 'damage') {
            var variance = effect.damage_variance || [1, 1];
            return '<label class="effect-field"><span>Dano por turno</span><input class="control" data-effect-field="damage_per_turn" type="number" min="0" value="' + escapeHtml(effect.damage_per_turn ?? '') + '" placeholder="0"></label>'
                + '<label class="effect-field"><span>Dano imediato</span><input class="control" data-effect-field="damage" type="number" min="0" value="' + escapeHtml(effect.damage ?? '') + '" placeholder="0"></label>'
                + '<label class="effect-field"><span>Variação do dano imediato</span><div class="range-pair"><input class="control" data-effect-variance="min" type="number" min="0" step="0.1" value="' + escapeHtml(variance[0] ?? 1) + '"><input class="control" data-effect-variance="max" type="number" min="0" step="0.1" value="' + escapeHtml(variance[1] ?? 1) + '"></div></label>';
        }
        if (pattern === 'drain') {
            var drain = effect.resource_drain || {};
            var resource = Object.keys(drain)[0] || 'hp';
            return '<label class="effect-field"><span>Recurso drenado</span><select class="control" data-effect-drain-resource><option value="hp" ' + (resource === 'hp' ? 'selected' : '') + '>Vida</option><option value="mana" ' + (resource === 'mana' ? 'selected' : '') + '>Mana</option><option value="stamina" ' + (resource === 'stamina' ? 'selected' : '') + '>Stamina</option></select></label>'
                + '<label class="effect-field"><span>Quantidade</span><input class="control" data-effect-drain-amount type="number" min="0" value="' + escapeHtml(drain[resource] ?? 8) + '"></label>';
        }
        if (pattern === 'cleanse') {
            return '<label class="effect-field"><span>Quantidade</span><input class="control" data-effect-field="cleanse" type="number" min="0" value="' + escapeHtml(effect.cleanse ?? 1) + '"><small>Remove até N estados negativos (os mais antigos primeiro).</small></label>'
                + '<label class="effect-stack"><input type="checkbox" data-effect-field="cleanse_all" ' + (effect.cleanse_all ? 'checked' : '') + '> Remover todos</label>';
        }
        if (pattern === 'dispel') {
            return '<label class="effect-field"><span>Quantidade</span><input class="control" data-effect-field="dispel" type="number" min="0" value="' + escapeHtml(effect.dispel ?? 1) + '"><small>Remove até N estados positivos.</small></label>'
                + '<label class="effect-field"><span>Estado específico</span><input class="control" data-effect-field="dispel_status" value="' + escapeHtml(effect.dispel_status || '') + '" placeholder="darkness_shroud"><small>Remove só este estado, ignorando os restantes.</small></label>'
                + '<label class="effect-stack"><input type="checkbox" data-effect-field="dispel_all" ' + (effect.dispel_all ? 'checked' : '') + '> Remover todos</label>';
        }
        if (pattern === 'deferred') {
            var deferred = effect.deferred_damage || {};
            return '<label class="effect-field"><span>Dano</span><input class="control" data-effect-field="deferred_damage.amount" type="number" min="0" value="' + escapeHtml(deferred.amount ?? 12) + '"><small>O golpe cai mais tarde, não agora.</small></label>'
                + '<label class="effect-field"><span>Daqui a quantos turnos</span><input class="control" data-effect-field="deferred_damage.after_turns" type="number" min="1" value="' + escapeHtml(deferred.after_turns ?? 2) + '"></label>';
        }
        if (pattern === 'echo') {
            var echo = effect.echo || {};
            return '<label class="effect-field"><span>Multiplicador</span><input class="control" data-effect-field="echo.multiplier" type="number" min="0" step="0.1" value="' + escapeHtml(echo.multiplier ?? 1) + '"><small>Repete a última ação de quem usa a skill, com este multiplicador.</small></label>';
        }
        if (pattern === 'move') {
            var move = effect.move || {};
            return '<label class="effect-field"><span>Quem se move</span><select class="control" data-effect-field="move.who">'
                + optionMarkup('target', 'O alvo', move.who === 'target')
                + optionMarkup('self', 'Quem usa a skill', move.who === 'self') + '</select></label>'
                + '<label class="effect-field"><span>Para a linha</span><select class="control" data-effect-field="move.to_line">'
                + optionMarkup('front', 'Frente', move.to_line === 'front')
                + optionMarkup('rear', 'Trás', move.to_line === 'rear')
                + optionMarkup('other', 'Para a outra linha', move.to_line === 'other') + '</select></label>'
                + '<label class="effect-stack"><input type="checkbox" data-effect-field="move.swap_with_caster" ' + (move.swap_with_caster ? 'checked' : '') + '> Trocar de posição</label>';
        }
        if (pattern === 'upkeep') {
            var upkeep = effect.self_upkeep || {};
            return '<label class="effect-field"><span>Vida por turno</span><input class="control" data-effect-field="self_upkeep.hp" type="number" min="0" value="' + escapeHtml(upkeep.hp ?? '') + '" placeholder="0"></label>'
                + '<label class="effect-field"><span>Mana por turno</span><input class="control" data-effect-field="self_upkeep.mana" type="number" min="0" value="' + escapeHtml(upkeep.mana ?? '') + '" placeholder="0"></label>'
                + '<label class="effect-field"><span>Stamina por turno</span><input class="control" data-effect-field="self_upkeep.stamina" type="number" min="0" value="' + escapeHtml(upkeep.stamina ?? '') + '" placeholder="0"><small>O preço da manutenção não cresce com o nível da skill.</small></label>';
        }
        if (pattern === 'rewind') {
            var rewind = effect.rewind || {};
            var rewindResources = Array.isArray(rewind.resources) ? rewind.resources : [];
            return '<label class="effect-field"><span>Quantos turnos</span><input class="control" data-effect-field="rewind.turns" type="number" min="0" value="' + escapeHtml(rewind.turns ?? 1) + '"><small>0 volta até ao início da luta; 1 desfaz o último turno.</small></label>'
                + '<label class="effect-stack"><input type="checkbox" data-effect-field="rewind.resources.hp" ' + (rewindResources.indexOf('hp') !== -1 ? 'checked' : '') + '> Recuperar vida</label>'
                + '<label class="effect-stack"><input type="checkbox" data-effect-field="rewind.resources.mana" ' + (rewindResources.indexOf('mana') !== -1 ? 'checked' : '') + '> Recuperar mana</label>'
                + '<label class="effect-stack"><input type="checkbox" data-effect-field="rewind.resources.stamina" ' + (rewindResources.indexOf('stamina') !== -1 ? 'checked' : '') + '> Recuperar stamina</label>'
                + '<label class="effect-stack"><input type="checkbox" data-effect-field="rewind.cleanse" ' + (rewind.cleanse !== false ? 'checked' : '') + '> Remover os estados</label>';
        }
        return '';
    }

    /** Editor de atributos (buff/debuff) com uma linha por atributo. */
    function statRowsEditor(effect, key) {
        var stats = effect[key] || {};
        var rows = Object.keys(stats).map(function (name) {
            return '<div class="stat-row" data-stat-row>'
                + '<select class="control control-small" data-stat-name>' + Model.STAT_NAMES.map(function (id) {
                    return optionMarkup(id, Model.STAT_LABELS[id] || id, id === name);
                }).join('') + '</select>'
                + '<input class="control control-small" data-stat-value type="number" step="1" value="' + escapeHtml(stats[name]) + '">'
                + '<button class="icon-button icon-button-small" type="button" data-remove-stat title="Remover atributo">×</button>'
                + '</div>';
        }).join('');
        return '<div class="effect-field effect-field-wide" data-effect-stats="' + key + '">'
            + '<span>Atributos e valores</span>'
            + (rows || '<p class="no-effects">Sem atributos — usa “+ Atributo”.</p>')
            + '<button class="button button-small button-quiet" type="button" data-add-stat>+ Atributo</button>'
            + '<small>Positivo aumenta, negativo reduz. <code>accuracy</code> afeta os ataques de quem o recebe.</small>'
            + '</div>';
    }

    /** Opções que só interessam em casos específicos. */
    function renderEffectAdvancedFields(effect) {
        var polarityOptions = [optionMarkup('', 'Automática', !effect.polarity)]
            .concat(Model.POLARITIES.map(function (id) { return optionMarkup(id, id, effect.polarity === id); }))
            .join('');
        var immunities = Array.isArray(effect.status_immunities) ? effect.status_immunities.join(', ') : '';
        var prevented = Array.isArray(effect.prevent_actions) ? effect.prevent_actions.join(', ') : '';
        var deferredCost = effect.deferred_cost || {};
        return '<details class="effect-advanced"><summary>Opções avançadas</summary>'
            + '<div class="effect-advanced-group">'
            + '<span class="effect-group-title">Controlo de turno</span>'
            + '<div class="form-grid effect-main-grid">'
            + '<label class="effect-field"><span>Deslocar a ordem de turno</span><input class="control" data-effect-field="turn_offset" type="number" step="1" value="' + escapeHtml(effect.turn_offset ?? '') + '" placeholder="0"><small>Positivo adianta o turno, negativo atrasa-o.</small></label>'
            + '<label class="effect-field"><span>Reduzir cooldowns</span><input class="control" data-effect-field="cooldown_tick" type="number" min="0" value="' + escapeHtml(effect.cooldown_tick ?? '') + '" placeholder="0"><small>Quantos turnos de cooldown tira ao alvo.</small></label>'
            + '<label class="effect-stack"><input type="checkbox" data-effect-field="untargetable" ' + (effect.untargetable ? 'checked' : '') + '> O alvo não pode ser escolhido</label>'
            + '</div></div>'
            + '<div class="effect-advanced-group">'
            + '<span class="effect-group-title">Alvo e defesa</span>'
            + '<div class="form-grid effect-main-grid">'
            + '<label class="effect-field"><span>Imunidade a status</span><input class="control" data-effect-field="status_immunities" value="' + escapeHtml(immunities) + '" placeholder="blinded, stunned"><small>IDs de status que o alvo não pode sofrer.</small></label>'
            + '<label class="effect-field"><span>Ações proibidas</span><input class="control" data-effect-field="prevent_actions" value="' + escapeHtml(prevented) + '" placeholder="attack"><small>' + Model.PREVENT_ACTIONS.join(', ') + '</small></label>'
            + '<label class="effect-stack"><input type="checkbox" data-effect-field="prevent_skills" ' + (effect.prevent_skills ? 'checked' : '') + '> O alvo não pode usar skills</label>'
            + '<label class="effect-stack"><input type="checkbox" data-effect-field="heal_block" ' + (effect.heal_block ? 'checked' : '') + '> O alvo não pode ser curado por outros</label>'
            + '<label class="effect-stack"><input type="checkbox" data-effect-field="counter" ' + (effect.counter ? 'checked' : '') + '> Reflete o próximo golpe recebido</label>'
            + '</div></div>'
            + '<div class="effect-advanced-group">'
            + '<span class="effect-group-title">Custos e manutenção</span>'
            + '<div class="form-grid effect-main-grid">'
            + '<label class="effect-field"><span>Vida paga no turno seguinte</span><input class="control" data-effect-field="deferred_cost.hp" type="number" min="0" value="' + escapeHtml(deferredCost.hp ?? '') + '" placeholder="0"><small>Uma dívida: paga-se no início do turno seguinte de quem usa a skill.</small></label>'
            + '<label class="effect-field"><span>Custo por alvo atingido</span><input class="control" data-effect-field="self_damage_per_target" type="number" min="0" value="' + escapeHtml(effect.self_damage_per_target ?? '') + '" placeholder="0"><small>Vida perdida por cada inimigo alcançado.</small></label>'
            + '<label class="effect-field"><span>O dreno vai para</span><select class="control" data-effect-field="drain_to">'
            + optionMarkup('target', 'O alvo perde', (effect.drain_to || 'target') === 'target')
            + optionMarkup('caster', 'Quem usa a skill recebe', effect.drain_to === 'caster') + '</select></label>'
            + '</div></div>'
            + '<div class="effect-advanced-group">'
            + '<span class="effect-group-title">Polaridade</span>'
            + '<div class="form-grid effect-main-grid">'
            + '<label class="effect-field"><span>Polaridade</span><select class="control" data-effect-field="polarity">' + polarityOptions + '</select><small>Automática: buff → positive, debuff ou dano → negative, controlo → neutral.</small></label>'
            + '</div></div>'
            + '</details>';
    }

    function resourceInput(label, key, value, namespace) {
        return '<label class="effect-field"><span>' + label + '</span><input class="control" data-effect-resource="' + namespace + '.' + key + '" type="number" min="0" value="' + escapeHtml(value ?? '') + '" placeholder="0"></label>';
    }

    function targetOptions(selected, skill) {
        var labels = { allies_all: 'Todos os aliados', enemies_all: 'Todos os inimigos', both_teams: 'Ambas as equipas' };
        var targets = availableTeamTargets(skill);
        if (['allies_all', 'enemies_all', 'both_teams'].includes(selected) && !targets.includes(selected)) {
            targets = targets.concat(selected);
        }
        return targets.map(function (target) {
            var label = labels[target] + (availableTeamTargets(skill).includes(target) ? '' : ' · existente');
            return optionMarkup(target, label, selected === target);
        }).join('');
    }

    function detectPattern(effect) {
        if (effect.cleanse !== undefined || effect.cleanse_all) return 'cleanse';
        if (effect.dispel !== undefined || effect.dispel_all || effect.dispel_status) return 'dispel';
        if (effect.deferred_damage) return 'deferred';
        if (effect.echo) return 'echo';
        if (effect.move) return 'move';
        if (effect.rewind) return 'rewind';
        if (effect.self_upkeep) return 'upkeep';
        if (effect.regen_per_turn) return 'regen_turn';
        if (effect.resource_regen) return 'regen';
        if (effect.buff) return 'buff';
        if (effect.debuff) return 'debuff';
        if (effect.resource_drain) return 'drain';
        if (effect.damage !== undefined || effect.damage_per_turn !== undefined) return 'damage';
        return 'regen';
    }

    function handleEffectActions(event) {
        var addButton = event.target.closest('[data-add-effect]');
        if (addButton) {
            addEffect(addButton.dataset.addEffect, addButton.dataset.pattern);
            return;
        }
        var removeButton = event.target.closest('[data-remove-effect]');
        if (removeButton) {
            var skill = currentSkill();
            if (!skill) return;
            skill.effects = (skill.effects || []).filter(function (effect) { return effect.effect_id !== removeButton.dataset.removeEffect; });
            persist();
            renderEffectScopes(skill);
            renderInspector();
            renderSkillSummary(skill);
            return;
        }
        var addStat = event.target.closest('[data-add-stat]');
        if (addStat) {
            var owner = currentSkill();
            var container = addStat.closest('[data-effect-stats]');
            if (!owner || !container) return;
            var wrapper = document.createElement('div');
            wrapper.innerHTML = '<div class="stat-row" data-stat-row>'
                + '<select class="control control-small" data-stat-name>' + Model.STAT_NAMES.map(function (id) {
                    return optionMarkup(id, Model.STAT_LABELS[id] || id, id === 'physical_attack');
                }).join('') + '</select>'
                + '<input class="control control-small" data-stat-value type="number" step="1" value="10">'
                + '<button class="icon-button icon-button-small" type="button" data-remove-stat title="Remover atributo">×</button>'
                + '</div>';
            container.appendChild(wrapper.firstElementChild);
            syncEffectCards(owner);
            persist();
            renderInspector();
            return;
        }
        var removeStat = event.target.closest('[data-remove-stat]');
        if (removeStat) {
            var statOwner = currentSkill();
            var row = removeStat.closest('[data-stat-row]');
            if (!statOwner || !row) return;
            row.remove();
            syncEffectCards(statOwner);
            persist();
            renderInspector();
            return;
        }
        var removeBonus = event.target.closest('[data-remove-bonus]');
        if (removeBonus) {
            var bonusOwner = currentSkill();
            var bonusRow = removeBonus.closest('.bonus-row');
            if (!bonusOwner || !bonusRow) return;
            bonusRow.remove();
            syncBonusVs(bonusOwner);
            persist();
            renderInspector();
            renderSkillSummary(bonusOwner);
        }
    }

    function addEffect(scope, pattern) {
        var skill = currentSkill();
        if (!skill) return;
        skill.effects = skill.effects || [];
        var effectIndex = 1;
        var id = skill.id + '_effect_' + effectIndex;
        while (skill.effects.some(function (effect) { return effect.effect_id === id; })) id = skill.id + '_effect_' + (++effectIndex);
        var applyTo = scope === 'self' ? 'self' : scope === 'target' ? 'target' : defaultTeamTarget(skill);
        var properties = {};
        if (pattern === 'regen') properties.resource_regen = { hp: 15 };
        if (pattern === 'regen_turn') properties.regen_per_turn = { hp: 10 };
        if (pattern === 'buff') properties.buff = { physical_attack: 10 };
        if (pattern === 'debuff') properties.debuff = { physical_attack: 10 };
        if (pattern === 'damage') properties.damage_per_turn = 5;
        if (pattern === 'drain') properties.resource_drain = { hp: 8 };
        if (pattern === 'cleanse') properties.cleanse = 1;
        if (pattern === 'dispel') properties.dispel = 1;
        if (pattern === 'deferred') properties.deferred_damage = { amount: 12, after_turns: 2 };
        if (pattern === 'echo') properties.echo = { multiplier: 1 };
        if (pattern === 'move') properties.move = { who: 'target', to_line: 'rear' };
        if (pattern === 'upkeep') properties.self_upkeep = { hp: 2 };
        if (pattern === 'rewind') properties.rewind = { turns: 1, resources: ['hp', 'mana', 'stamina'], cleanse: true };
        skill.effects.push(Model.makeEffect(skill.id, pattern, applyTo, effectIndex - 1, properties));
        state.openScopes[skill.id] = state.openScopes[skill.id] || {};
        state.openScopes[skill.id][scope] = true;
        persist();
        renderEffectScopes(skill);
        renderInspector();
        renderSkillSummary(skill);
        var last = byId(scope + '-effects').lastElementChild;
        last?.querySelector('[data-effect-field="status_effect"]')?.focus();
    }

    function handleEffectInput(event) {
        if (!event.target.closest('[data-effect-card]')) return;
        var skill = currentSkill();
        if (!skill) return;
        syncEffectCards(skill);
        persist();
        renderInspector();
        renderTreeCanvas();
    }

    function handleEffectChange(event) {
        if (!event.target.closest('[data-effect-card]')) return;
        var skill = currentSkill();
        if (!skill) return;
        if (event.target.matches('[data-effect-pattern]')) changeEffectPattern(event.target);
        else {
            syncEffectCards(skill);
            persist();
            renderInspector();
            renderTreeCanvas();
        }
    }

    function changeEffectPattern(select) {
        var skill = currentSkill();
        var card = select.closest('[data-effect-card]');
        if (!skill || !card) return;
        var effect = skill.effects.find(function (item) { return item.effect_id === card.dataset.effectId; });
        if (!effect) return;
        ['buff', 'debuff', 'resource_regen', 'regen_per_turn', 'resource_drain', 'damage', 'damage_per_turn', 'damage_variance', 'cleanse', 'cleanse_all', 'dispel', 'dispel_all', 'dispel_status', 'deferred_damage', 'echo', 'move', 'self_upkeep', 'rewind'].forEach(function (key) { delete effect[key]; });
        var type = select.value;
        if (type === 'regen') effect.resource_regen = { hp: 15 };
        if (type === 'regen_turn') effect.regen_per_turn = { hp: 10 };
        if (type === 'buff') effect.buff = { physical_attack: 10 };
        if (type === 'debuff') effect.debuff = { physical_attack: 10 };
        if (type === 'damage') effect.damage_per_turn = 5;
        if (type === 'drain') effect.resource_drain = { hp: 8 };
        if (type === 'cleanse') effect.cleanse = 1;
        if (type === 'dispel') effect.dispel = 1;
        if (type === 'deferred') effect.deferred_damage = { amount: 12, after_turns: 2 };
        if (type === 'echo') effect.echo = { multiplier: 1 };
        if (type === 'move') effect.move = { who: 'target', to_line: 'rear' };
        if (type === 'upkeep') effect.self_upkeep = { hp: 2 };
        if (type === 'rewind') effect.rewind = { turns: 1, resources: ['hp', 'mana', 'stamina'], cleanse: true };
        // O nome do estado segue a operação, mas só enquanto o autor não o
        // tiver escrito por si.
        if (Object.values(Model.PATTERN_STATUS_NAMES || {}).includes(effect.status_effect)) {
            effect.status_effect = Model.patternStatusName(type);
        }
        persist();
        renderEffects(skill, card.dataset.effectScope);
        renderInspector();
        renderSkillSummary(skill);
    }

    function syncEffectCards(skill) {
        var original = skill.effects || [];
        var updatedById = new Map();
        document.querySelectorAll('[data-effect-card]').forEach(function (card) {
            var effect = original.find(function (item) { return item.effect_id === card.dataset.effectId; });
            if (!effect) return;
            if (card.dataset.effectScope === 'self') effect.apply_to = 'self';
            else if (card.dataset.effectScope === 'target' && (!effect.apply_to || effect.apply_to === 'target')) effect.apply_to = 'target';
            else if (card.dataset.effectScope === 'team' && !effect.apply_to) effect.apply_to = defaultTeamTarget(skill);
            card.querySelectorAll('[data-effect-field]').forEach(function (field) {
                var key = field.dataset.effectField;
                if (key === 'element_id') {
                    if (field.value) effect.element_id = field.value;
                    else delete effect.element_id;
                } else if (key === 'status_effect') {
                    effect.status_effect = field.value;
                } else if (key === 'apply_to') {
                    effect.apply_to = field.value;
                } else if (key === 'turns') {
                    effect.turns = numberValue(field.value, 0);
                } else if (key === 'effect_hit_chance') {
                    var chance = numberValue(field.value, 100) / 100;
                    if (chance >= 1) delete effect.effect_hit_chance;
                    else effect.effect_hit_chance = chance;
                } else if (key === 'can_stack') {
                    if (field.checked) effect.can_stack = true;
                    else delete effect.can_stack;
                } else if (key === 'damage' || key === 'damage_per_turn' || key === 'heal'
                    || key === 'cleanse' || key === 'dispel') {
                    if (field.value === '') delete effect[key];
                    else effect[key] = numberValue(field.value, 0);
                } else if (key === 'cleanse_all' || key === 'dispel_all') {
                    if (field.checked) effect[key] = true;
                    else delete effect[key];
                } else if (key === 'dispel_status') {
                    if (field.value.trim()) effect.dispel_status = field.value.trim();
                    else delete effect.dispel_status;
                } else if (key === 'polarity') {
                    if (field.value) effect.polarity = field.value;
                    else delete effect.polarity;
                } else if (key === 'status_immunities' || key === 'prevent_actions') {
                    var list = String(field.value || '').split(',').map(function (entry) { return entry.trim(); }).filter(Boolean);
                    if (list.length) effect[key] = list;
                    else delete effect[key];
                } else if (key.indexOf('rewind.resources.') === 0) {
                    // Os recursos recuperados são uma lista, não um campo solto.
                    var rewindResource = key.slice('rewind.resources.'.length);
                    effect.rewind = effect.rewind || {};
                    var rewindList = Array.isArray(effect.rewind.resources) ? effect.rewind.resources.slice() : [];
                    if (field.checked) {
                        if (rewindList.indexOf(rewindResource) === -1) rewindList.push(rewindResource);
                    } else {
                        rewindList = rewindList.filter(function (entry) { return entry !== rewindResource; });
                    }
                    effect.rewind.resources = rewindList;
                } else if (key === 'rewind.turns') {
                    effect.rewind = effect.rewind || {};
                    var rewindTurns = numberValue(field.value, 0);
                    // 0 significa "até ao início da luta", e é o que o motor
                    // lê quando o campo não existe.
                    if (rewindTurns > 0) effect.rewind.turns = rewindTurns;
                    else delete effect.rewind.turns;
                } else if (key === 'rewind.cleanse') {
                    effect.rewind = effect.rewind || {};
                    effect.rewind.cleanse = field.checked;
                } else if (key.indexOf('.') !== -1) {
                    // Campos aninhados: move.who, deferred_damage.amount, …
                    var nestedValue;
                    if (field.type === 'checkbox') nestedValue = field.checked ? true : undefined;
                    else if (field.value === '') nestedValue = undefined;
                    else nestedValue = fieldValue(field.value);
                    setNested(effect, key, nestedValue);
                    if (nestedValue === undefined) pruneEmpty(effect, key);
                } else if (field.type === 'checkbox') {
                    if (field.checked) effect[key] = true;
                    else delete effect[key];
                } else if (field.value === '') {
                    delete effect[key];
                } else {
                    effect[key] = fieldValue(field.value);
                }
            });

            card.querySelectorAll('[data-effect-resource]').forEach(function (field) {
                var parts = field.dataset.effectResource.split('.');
                effect[parts[0]] = effect[parts[0]] || {};
                if (field.value === '') delete effect[parts[0]][parts[1]];
                else effect[parts[0]][parts[1]] = numberValue(field.value, 0);
                if (!Object.keys(effect[parts[0]]).length) delete effect[parts[0]];
            });
            card.querySelectorAll('[data-effect-stats]').forEach(function (field) {
                var key = field.dataset.effectStats;
                var parsed = {};
                field.querySelectorAll('[data-stat-row]').forEach(function (row) {
                    var name = row.querySelector('[data-stat-name]')?.value;
                    var amount = numberValue(row.querySelector('[data-stat-value]')?.value, 0);
                    if (name) parsed[name] = amount;
                });
                if (Object.keys(parsed).length) effect[key] = parsed;
                else delete effect[key];
            });
            var minVariance = card.querySelector('[data-effect-variance="min"]');
            var maxVariance = card.querySelector('[data-effect-variance="max"]');
            if (minVariance && maxVariance) {
                var variance = [numberValue(minVariance.value, 1), numberValue(maxVariance.value, 1)];
                if (variance[0] !== 1 || variance[1] !== 1) effect.damage_variance = variance;
                else delete effect.damage_variance;
            }
            var drainResource = card.querySelector('[data-effect-drain-resource]');
            var drainAmount = card.querySelector('[data-effect-drain-amount]');
            if (drainResource && drainAmount) effect.resource_drain = { [drainResource.value]: numberValue(drainAmount.value, 0) };
            updatedById.set(effect.effect_id, effect);
        });
        skill.effects = original.map(function (effect) { return updatedById.get(effect.effect_id) || effect; });
    }

    function syncCollateral(skill) {
        var form = byId('skill-editor');
        if (!form.elements.collateral_enabled.checked) {
            delete skill.collateral;
            return;
        }
        var multiplierMin = numberValue(form.elements.collateral_multiplier_min.value, 0.5);
        var multiplierMax = numberValue(form.elements.collateral_multiplier_max.value, multiplierMin);
        skill.collateral = {
            chance: numberValue(form.elements.collateral_chance.value, 100) / 100,
            apply_to: form.elements.collateral_target.value,
            include_primary_targets: form.elements.collateral_include_primary.checked,
            include_caster: form.elements.collateral_include_caster.checked,
            damage_multiplier: [multiplierMin, multiplierMax],
        };
    }

    function updatePowerFields(saveAfter) {
        var form = byId('skill-editor');
        var kind = form.elements.power_kind.value;
        var extra = byId('power-extra');
        if (kind === 'random') {
            byId('power-label').textContent = 'Força mínima';
            extra.hidden = false;
            extra.innerHTML = '<label class="field"><span>Força máxima</span><input class="control" name="power_max" type="number" min="0" value="' + escapeHtml(form.elements.power_value.value || 20) + '"></label>';
        } else if (kind === 'attribute') {
            byId('power-label').textContent = 'Multiplicador';
            extra.hidden = false;
            extra.innerHTML = '<label class="field"><span>Atributo usado</span><select class="control" name="power_stat"><option value="magical_attack">magical_attack</option><option value="physical_attack">physical_attack</option><option value="strength">strength</option><option value="intelligence">intelligence</option></select></label>';
        } else {
            byId('power-label').textContent = 'Poder';
            extra.hidden = true;
            extra.innerHTML = '';
        }
        if (saveAfter) {
            var skill = currentSkill();
            if (skill) { syncSkillFromEditor(skill); persist(); }
        }
    }

    function updateEditorFeedback(skill, elementChanged) {
        byId('current-id').textContent = skill.id;
        byId('direct-cost').textContent = (Number(skill.learning_cost?.experience_points) || 0) + ' XP';
        byId('skill-count').textContent = state.project.skills.length;
        byId('tree-count').textContent = new Set(state.project.skills.map(function (item) { return item.element_id; })).size;
        if (elementChanged) renderPrerequisites(skill);
        renderSkillList();
        renderInspector();
        renderTreeCanvas();
        renderSkillSummary(skill);
    }

    function createSkill(requirements, elementId, template, customName) {
        var name = customName || (template ? template.title : 'Nova skill');
        var parentPoints = requirements.map(function (id) {
            var parent = state.project.skills.find(function (skill) { return skill.id === id; });
            if (!parent) return null;
            return parent.element_id === elementId ? Model.position(state.project, parent, state.project.skills.indexOf(parent)) : null;
        }).filter(Boolean);
        var x = parentPoints.length ? Math.max.apply(null, parentPoints.map(function (point) { return point.x; })) + 270 : 80;
        var y = parentPoints.length ? parentPoints.reduce(function (sum, point) { return sum + point.y; }, 0) / parentPoints.length + 125 : 80;
        var skill = Model.makeSkill(state.project, name, elementId, requirements, template || null);
        // Input mínimo: o ID sai do nome, a descrição é escrita a partir do que
        // já foi escolhido e o resto fica com os valores por omissão.
        state.autoDescription[skill.id] = true;
        if (!skill.description) skill.description = Model.describeSkill(skill);
        state.project.skills.push(skill);
        Model.setPosition(state.project, skill, x, y);
        state.selectedSkillId = skill.id;
        state.elementFilter = 'all';
        byId('element-filter').value = 'all';
        state.prerequisiteSearch = '';
        state.prerequisiteSelection = new Set(requirements || []);
        byId('prerequisite-search').value = '';
        byId('quick-name').value = '';
        persist();
        renderAll();
        setView('skills');
        if (!customName) byId('skill-editor').elements.name.focus();
        else byId('skill-editor').elements.description.focus();
        toast(requirements.length
            ? 'Nova ramificação criada com ' + requirements.length + ' pré-requisito(s).'
            : template ? 'Skill criada a partir do modelo “' + template.title + '”.'
                : 'Skill criada: “' + skill.name + '”. Afina a descrição quando quiseres.');
    }

    function deleteSelectedSkill() {
        var skill = currentSkill();
        if (!skill) return;
        var usedBy = state.project.skills.filter(function (candidate) { return (candidate.learning_requirements?.required_attack_ids || []).includes(skill.id); });
        var message = 'Apagar "' + skill.name + '"?';
        if (usedBy.length) message += '\n\n' + usedBy.length + ' skill(s) ainda dependem dela; as referências serão assinaladas.';
        confirmAction(message, 'Apagar', 'Apagar skill').then(function (accepted) {
            if (!accepted) return;
            state.project.skills = state.project.skills.filter(function (candidate) { return candidate.id !== skill.id; });
            Object.values(state.project.trees).forEach(function (tree) { delete tree.positions[skill.id]; });
            state.selectedSkillId = state.project.skills[0]?.id || null;
            persist();
            renderAll();
            toast('Skill apagada.');
        });
    }

    function duplicateSelectedSkill() {
        var skill = currentSkill();
        if (!skill) return;
        var copy = Model.clone(skill);
        var baseId = Model.slug(skill.name) + '_copia';
        var id = baseId;
        var suffix = 2;
        while (state.project.skills.some(function (candidate) { return candidate.id === id; })) id = baseId + '_' + suffix++;
        copy.id = id;
        copy.name = skill.name + ' (cópia)';
        if (copy.effects?.length) {
            copy.effects.forEach(function (effect, index) {
                if (effect.effect_id) effect.effect_id = id + '_effect_' + (index + 1);
            });
        }
        state.project.skills.push(copy);
        var sourcePoint = Model.position(state.project, skill, state.project.skills.indexOf(skill));
        Model.setPosition(state.project, copy, sourcePoint.x + 40, sourcePoint.y + 130);
        state.selectedSkillId = copy.id;
        state.prerequisiteSelection = new Set(copy.learning_requirements?.required_attack_ids || []);
        persist();
        renderAll();
        setView('skills');
        toast('Skill duplicada como "' + copy.name + '".');
    }

    function defaultElement() {
        if (state.view === 'trees') return state.treeElement;
        return state.elementFilter !== 'all' ? state.elementFilter : (currentSkill()?.element_id || 'aqua');
    }

    function setZoom(next, anchor) {
        var canvas = byId('tree-canvas');
        var target = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(next * 100) / 100));
        if (target === state.zoom) return;
        var rect = canvas.getBoundingClientRect();
        var anchorX = anchor ? anchor.clientX - rect.left : canvas.clientWidth / 2;
        var anchorY = anchor ? anchor.clientY - rect.top : canvas.clientHeight / 2;
        var contentX = canvas.scrollLeft + anchorX;
        var contentY = canvas.scrollTop + anchorY;
        var factor = target / state.zoom;
        state.zoom = target;
        applyZoom();
        canvas.scrollLeft = contentX * factor - anchorX;
        canvas.scrollTop = contentY * factor - anchorY;
    }

    function applyZoom() {
        var nodes = byId('tree-nodes');
        var edges = byId('tree-edges');
        var canvas = byId('tree-canvas');
        var transform = 'scale(' + state.zoom + ')';
        nodes.style.transform = transform;
        edges.style.transform = transform;
        nodes.style.transformOrigin = '0 0';
        edges.style.transformOrigin = '0 0';
        canvas.style.backgroundSize = (23 * state.zoom) + 'px ' + (23 * state.zoom) + 'px';
        canvas.style.backgroundPosition = (11 * state.zoom) + 'px ' + (11 * state.zoom) + 'px';
        byId('zoom-level').textContent = Math.round(state.zoom * 100) + '%';
        byId('btn-zoom-out').disabled = state.zoom <= ZOOM_MIN;
        byId('btn-zoom-in').disabled = state.zoom >= ZOOM_MAX;
        void canvas.scrollWidth;
    }

    function fitTree() {
        var canvas = byId('tree-canvas');
        var layout = state.treeLayout;
        if (!layout || !layout.width) { setZoom(1); return; }
        setZoom(Math.min((canvas.clientWidth - 40) / layout.width, (canvas.clientHeight - 40) / layout.height));
        canvas.scrollLeft = 0;
        canvas.scrollTop = 0;
    }

    function startPan(event) {
        if (event.button !== 0) return;
        if (event.target.closest('[data-skill-node], button, input, label')) return;
        var canvas = byId('tree-canvas');
        state.pan = { x: event.clientX, y: event.clientY, left: canvas.scrollLeft, top: canvas.scrollTop };
        canvas.classList.add('is-panning');
        event.preventDefault();
    }

    function movePan(event) {
        if (!state.pan) return;
        var canvas = byId('tree-canvas');
        canvas.scrollLeft = state.pan.left - (event.clientX - state.pan.x);
        canvas.scrollTop = state.pan.top - (event.clientY - state.pan.y);
    }

    function stopPan() {
        if (!state.pan) return;
        state.pan = null;
        byId('tree-canvas').classList.remove('is-panning');
    }

    function numberValue(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }

    /** Escreve um número opcional: um campo vazio apaga a chave. */
    function setOptionalNumber(target, key, value) {
        if (value === '' || value === null || value === undefined) {
            delete target[key];
            return;
        }
        var parsed = Number(value);
        if (Number.isFinite(parsed)) target[key] = parsed;
    }

    /** Converte o texto de um campo: número quando dá, senão o texto tal e qual. */
    function fieldValue(raw) {
        if (raw === '' || raw === null || raw === undefined) return undefined;
        var parsed = Number(raw);
        if (Number.isFinite(parsed) && String(raw).trim() !== '') return parsed;
        return raw;
    }

    /** Lê um valor aninhado por caminho com pontos (`move.who`). */
    function readNested(source, path) {
        return String(path).split('.').reduce(function (node, part) {
            return node && typeof node === 'object' ? node[part] : undefined;
        }, source);
    }

    /** Escreve (ou apaga) um valor aninhado por caminho com pontos. */
    function setNested(target, path, value) {
        var parts = String(path).split('.');
        var node = target;
        parts.forEach(function (part, index) {
            if (index === parts.length - 1) {
                if (value === undefined) delete node[part];
                else node[part] = value;
            } else {
                if (!node[part] || typeof node[part] !== 'object') node[part] = {};
                node = node[part];
            }
        });
    }

    /** Limpa os objetos vazios que ficaram pelo caminho depois de apagar. */
    function pruneEmpty(target, path) {
        var parts = String(path).split('.');
        for (var index = parts.length - 1; index > 0; index -= 1) {
            var parentPath = parts.slice(0, index).join('.');
            var parent = readNested(target, parentPath);
            if (parent && typeof parent === 'object' && !Object.keys(parent).length) {
                setNested(target, parentPath, undefined);
            }
        }
    }

    function persist() {
        if (state.saveTimer) window.clearTimeout(state.saveTimer);
        byId('save-state').classList.add('is-saving');
        byId('save-state').innerHTML = '<i></i> A guardar…';
        state.saveTimer = window.setTimeout(function () {
            var saved = Model.save(state.project);
            byId('save-state').classList.remove('is-saving');
            byId('save-state').innerHTML = saved ? '<i></i> Guardado neste dispositivo' : '<i></i> Não foi possível guardar';
            state.saveTimer = null;
        }, 250);
    }

    function toast(message, warning) {
        var element = byId('toast');
        element.textContent = message;
        element.classList.toggle('is-warning', Boolean(warning));
        element.classList.add('is-visible');
        if (state.toastTimer) window.clearTimeout(state.toastTimer);
        state.toastTimer = window.setTimeout(function () { element.classList.remove('is-visible'); }, 4000);
    }

    function escapeImportHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function showImportError(detail) {
        var backdrop = byId('import-error-backdrop');
        var body = byId('import-error-body');
        if (!backdrop || !body) { toast((detail && detail.title) || 'Importação cancelada', true); return; }
        var title = (detail && detail.title) || 'Importação cancelada';
        byId('import-error-title').textContent = title;
        var issues = (detail && Array.isArray(detail.issues)) ? detail.issues : [{ message: detail && detail.message ? detail.message : String(detail) }];
        body.innerHTML = issues.map(function (issue) {
            var parts = [];
            if (issue.file) parts.push('<div class="issue-file">' + escapeImportHtml(issue.file) + '</div>');
            if (issue.line) {
                parts.push('<div class="issue-loc">Linha ' + escapeImportHtml(issue.line) + (issue.column ? ', coluna ' + escapeImportHtml(issue.column) : '') + '</div>');
            }
            parts.push('<p class="issue-message">' + escapeImportHtml(issue.message || '') + '</p>');
            if (issue.snippet) parts.push('<pre>' + escapeImportHtml(issue.snippet) + '</pre>');
            if (issue.path) parts.push('<div class="issue-path">' + escapeImportHtml(issue.path) + '</div>');
            return '<div class="import-error-issue">' + parts.join('') + '</div>';
        }).join('');
        backdrop.hidden = false;
    }

    function closeImportError() {
        var backdrop = byId('import-error-backdrop');
        if (backdrop) backdrop.hidden = true;
    }

    // Diálogo de confirmação dentro da própria página: o confirm() nativo pode não
    // aparecer (ou ser bloqueado) em browsers embebidos e, ao ser cancelado, não
    // dava qualquer feedback — a importação falhava "em silêncio".
    function confirmAction(message, okLabel, titleLabel) {
        return new Promise(function (resolve) {
            var backdrop = byId('confirm-backdrop');
            if (!backdrop) { resolve(window.confirm(message)); return; }
            byId('confirm-message').textContent = message;
            byId('confirm-title').textContent = titleLabel || 'Confirmar';
            byId('confirm-eyebrow').textContent = (titleLabel || 'Confirmar').toUpperCase();
            byId('btn-confirm-ok').textContent = okLabel || 'Confirmar';
            backdrop.hidden = false;
            function close(value) {
                backdrop.hidden = true;
                window.removeEventListener('keydown', onKey, true);
                byId('btn-confirm-ok').onclick = null;
                byId('btn-confirm-cancel').onclick = null;
                backdrop.onclick = null;
                resolve(value);
            }
            function onKey(event) {
                if (event.key === 'Escape') { event.preventDefault(); close(false); }
                else if (event.key === 'Enter') { event.preventDefault(); close(true); }
            }
            byId('btn-confirm-ok').onclick = function () { close(true); };
            byId('btn-confirm-cancel').onclick = function () { close(false); };
            backdrop.onclick = function (event) { if (event.target === backdrop) close(false); };
            window.addEventListener('keydown', onKey, true);
            byId('btn-confirm-ok').focus();
        });
    }

    function serializeSkill(skill) {
        var result = {
            id: skill.id,
            name: skill.name,
            description: skill.description || '',
            element_id: skill.element_id,
            learning_cost: { experience_points: Number(skill.learning_cost?.experience_points) || 0 },
            learning_requirements: { required_attack_ids: (skill.learning_requirements?.required_attack_ids || []).slice() },
        };
        if (skill.targeting) result.targeting = skill.targeting;
        if (skill.damage) result.damage = Model.clone(skill.damage);
        if (skill.accuracy !== undefined) result.accuracy = skill.accuracy;
        if (skill.hit_count !== undefined) result.hit_count = skill.hit_count;
        if (skill.solar) result.solar = true;
        if (skill.nocturnal) result.nocturnal = true;
        if (skill.ignore_accuracy) result.ignore_accuracy = true;
        if (skill.crit_chance !== undefined) result.crit_chance = skill.crit_chance;
        if (skill.defense_pierce !== undefined) result.defense_pierce = skill.defense_pierce;
        if (skill.flee_below_hp !== undefined) result.flee_below_hp = skill.flee_below_hp;
        if (skill.guaranteed_crit_vs_status) result.guaranteed_crit_vs_status = skill.guaranteed_crit_vs_status;
        if (skill.bonus_vs_hp_below) result.bonus_vs_hp_below = Model.clone(skill.bonus_vs_hp_below);
        if (skill.bonus_vs_elements && Object.keys(skill.bonus_vs_elements).length) {
            result.bonus_vs_elements = Model.clone(skill.bonus_vs_elements);
        }
        result.costs = {
            mana: Number(skill.costs?.mana) || 0,
            stamina: Number(skill.costs?.stamina) || 0,
            cooldown: Number(skill.costs?.cooldown) || 0,
        };
        if (Number(skill.costs?.hp)) result.costs.hp = Number(skill.costs.hp);
        if (skill.effects?.length) result.effects = skill.effects.map(Model.cleanEffect).filter(Boolean);
        if (skill.collateral) result.collateral = Model.clone(skill.collateral);
        return result;
    }

    function skillsYaml() {
        var skills = sortedSkills(state.project.skills).map(serializeSkill);
        var indexLines = ['# Índice de skills (elemento → IDs):'];
        var currentElement = null;
        skills.forEach(function (skill) {
            if (skill.element_id !== currentElement) {
                currentElement = skill.element_id;
                indexLines.push('# ' + currentElement);
            }
            indexLines.push('#   ' + skill.id);
        });
        var yamlText = dumpYaml({ skills: skills });
        return indexLines.join('\n') + '\n' + yamlText;
    }

    function exportPackage() {
        var report = Model.validate(state.project);
        if (report.errors.length) {
            renderInspector();
            toast('Corrige os erros indicados antes de exportar o YAML.', true);
            return;
        }
        try {
            downloadFile('skills.yaml', skillsYaml(), 'text/yaml;charset=utf-8');
            toast('skills.yaml exportado — coloca-o em apps/desktop/src/data/combat/skills/.');
        } catch (error) {
            toast('Falha ao exportar o YAML: ' + error.message, true);
        }
    }

    function dumpYaml(value) {
        return root.jsyaml ? root.jsyaml.dump(value, { noRefs: true, lineWidth: 110, sortKeys: false }) : JSON.stringify(value, null, 2);
    }

    function downloadFile(name, text, type) {
        downloadBlob(name, new Blob([text], { type: type }));
    }

    function downloadBlob(name, blob) {
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = name;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    }

    function buildSnippet(text, line, column) {
        var lines = String(text || '').split('\\n');
        var start = Math.max(0, (line || 0) - 2);
        var end = Math.min(lines.length, (line || 0) + 2);
        var out = [];
        for (var i = start; i < end; i++) {
            out.push((i + 1) + ' | ' + lines[i]);
            if (i === (line || 0)) {
                var caret = '   ';
                for (var c = 0; c < (column || 0); c++) caret += ' ';
                caret += '^';
                out.push(caret);
            }
        }
        return out.join('\\n');
    }

    function makeParseError(file, error, text) {
        var issue = { file: file.name, message: (error && error.reason) ? error.reason : (error && error.message ? error.message : String(error)) };
        if (error && error.mark) {
            issue.line = (error.mark.line || 0) + 1;
            issue.column = (error.mark.column || 0) + 1;
            issue.snippet = buildSnippet(text, error.mark.line || 0, error.mark.column || 0);
        } else if (error && typeof error.lineNumber === 'number') {
            issue.line = error.lineNumber;
            issue.snippet = buildSnippet(text, error.lineNumber - 1, 0);
        }
        return issue;
    }

    function readFile(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    var text = String(reader.result || '');
                    var value = parseContent(text);
                    resolve({ file: file, value: value, text: text });
                } catch (error) { reject(makeParseError(file, error, text)); }
            };
            reader.onerror = function () { reject({ file: file.name, message: 'Falha ao ler ' + file.name }); };
            reader.readAsText(file);
        });
    }

    function parseContent(text) {
        return root.jsyaml
            ? root.jsyaml.load(text)
            : JSON.parse(text.split('\n').filter(function (line) { return !line.trim().startsWith('#'); }).join('\n'));
    }

    function importFiles(event) {
        var files = Array.from(event.target.files || []);
        event.target.value = '';
        if (!files.length) return;
        Promise.allSettled(files.map(readFile)).then(function (results) {
            var parseErrors = [];
            var entries = [];
            results.forEach(function (result) {
                if (result.status === 'fulfilled') entries.push(result.value);
                else parseErrors.push(result.reason);
            });
            if (parseErrors.length) {
                showImportError({ title: 'Não foi possível ler o(s) ficheiro(s)', issues: parseErrors });
                return;
            }
            return importEntries(entries);
        }).catch(function (error) {
            if (error && Array.isArray(error.issues)) {
                showImportError({ title: 'Importação cancelada', issues: error.issues });
            } else {
                showImportError({ title: 'Importação cancelada', issues: [{ message: error && error.message ? error.message : String(error) }] });
            }
        });
    }

    function importEntries(entries) {
        return Promise.resolve().then(function () {
            var catalogEntry = entries.find(function (entry) { return entry.value && Array.isArray(entry.value.skills); });
            if (!catalogEntry) {
                var err = new Error('O ficheiro precisa de conter uma lista “skills”.');
                err.issues = [{ message: 'Nenhum dos ficheiros selecionados contém uma lista “skills”. Verifica se o YAML tem a chave “skills:”.' }];
                throw err;
            }
            var rawSkills = catalogEntry.value.skills;
            var skipped = 0;
            var skills = rawSkills.map(function (source, index) {
                var normalized = Model.normalizeSkill(source);
                if (!normalized) { skipped++; return null; }
                normalized.__index = index;
                return normalized;
            }).filter(Boolean);
            var issues = [];
            if (skipped) {
                issues.push({ message: skipped + ' skill(s) foram ignoradas por falta de “id” ou “name”. Cada skill precisa de id e name.' });
            }
            var duplicateIds = findDuplicates(skills.map(function (skill) { return skill.id; }));
            duplicateIds.forEach(function (id) {
                issues.push({ message: 'ID de skill duplicado: ' + id, path: 'skills.' + id + '.id' });
            });
            var knownIds = new Set(skills.map(function (skill) { return skill.id; }));
            skills.forEach(function (skill) {
                (skill.learning_requirements.required_attack_ids || []).forEach(function (id) {
                    if (!knownIds.has(id)) {
                        issues.push({ message: skill.id + ' exige a skill não importada “' + id + '”.', path: 'skills.' + skill.id + '.learning_requirements.required_attack_ids' });
                    }
                });
            });
            if (issues.length) {
                var err = new Error(issues[0].message);
                err.issues = issues;
                throw err;
            }
            // As árvores são derivadas do catálogo: pertença por element_id e
            // arestas por learning_requirements (o normalize cria as posições).
            var imported = Model.normalize({ skills: skills });
            var report = Model.validate(imported);
            if (report.errors.length) {
                var vIssues = report.errors.map(function (issue) {
                    return { message: issue.message, path: issue.path };
                });
                var verr = new Error(report.errors[0].message);
                verr.issues = vIssues;
                throw verr;
            }
            // avisos não bloqueiam, mas mostra-os? Manter toast curto.
            return confirmAction('Importar ' + skills.length
                + ' skill(s), substituindo o rascunho local?', 'Importar', 'Importar YAML').then(function (accepted) {
                if (!accepted) { toast('Importação cancelada — o rascunho local mantém-se.'); return; }
                state.project = imported;
                state.treeElement = skills[0]?.element_id || 'aqua';
                state.selectedSkillId = skills[0]?.id || null;
                state.openScopes = Object.create(null);
                byId('tree-element').value = state.treeElement;
                persist();
                renderAll();
                toast('YAML importado: ' + skills.length + ' skill(s) — as árvores foram derivadas dos elementos e pré-requisitos.');
                if (report.warnings && report.warnings.length) {
                    toast(report.warnings.length + ' aviso(s) na importação — vê o painel de validação.', true);
                }
            });
        });
    }

    function findDuplicates(values) {
        var seen = new Set();
        var duplicates = new Set();
        values.forEach(function (value) { if (seen.has(value)) duplicates.add(value); else seen.add(value); });
        return Array.from(duplicates);
    }

    document.addEventListener('DOMContentLoaded', boot);
})(window);
