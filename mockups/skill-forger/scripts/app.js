(function (root) {
    'use strict';

    var Model = root.SkillForgerModel;
    var PATTERNS = [
        ['regen', 'Regenerar recurso'],
        ['buff', 'Buff'],
        ['debuff', 'Debuff'],
        ['damage', 'Dano sequencial'],
        ['drain', 'Drenar recurso'],
    ];
    var TARGET_LABELS = {
        enemy_one: 'um inimigo', enemies_all: 'todos os inimigos',
        ally_one: 'um aliado', allies_all: 'todos os aliados',
        self: 'o próprio atacante', both_teams: 'ambas as equipas',
    };
    var ZOOM_MIN = 0.1;
    var ZOOM_MAX = 2;
    var ZOOM_STEP = 0.1;
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
        pan: null,
        saveTimer: null,
        toastTimer: null,
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
        byId('btn-tree-first-skill').addEventListener('click', function () { createSkill([], state.treeElement); });
        byId('btn-duplicate-skill').addEventListener('click', duplicateSelectedSkill);
        byId('btn-delete-skill').addEventListener('click', deleteSelectedSkill);
        byId('btn-import').addEventListener('click', function () { byId('file-input').click(); });
        byId('file-input').addEventListener('change', importFiles);
        byId('btn-export').addEventListener('click', exportPackage);
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
    }

    function setView(view) {
        state.view = view;
        document.querySelectorAll('.view-tab').forEach(function (button) {
            button.classList.toggle('is-active', button.dataset.view === view);
        });
        byId('skills-view').hidden = view !== 'skills';
        byId('trees-view').hidden = view !== 'trees';
        if (view === 'trees') renderTree();
    }

    function renderAll() {
        byId('skill-count').textContent = state.project.skills.length;
        byId('tree-count').textContent = new Set(state.project.skills.map(function (skill) { return skill.element_id; })).size;
        renderSkillList();
        renderEditor();
        renderInspector();
        renderTree();
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
        form.elements.cooldown.value = skill.costs?.cooldown ?? 0;
        updatePowerFields(false);
        if (form.elements.power_kind.value === 'random' && form.elements.power_max) form.elements.power_max.value = power?.max ?? form.elements.power_value.value;
        if (form.elements.power_kind.value === 'attribute' && form.elements.power_stat) form.elements.power_stat.value = power?.stat || 'magical_attack';
        renderPrerequisites(skill);
        updateTargetContext(skill);
        renderCollateral(skill);
        renderEffectScopes(skill);
        byId('direct-cost').textContent = (Number(skill.learning_cost?.experience_points) || 0) + ' XP';
        byId('editor-message').textContent = 'O ID foi gerado uma vez. Alterar o nome não o altera.';
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
        byId('validation-mark').textContent = report.errors.length ? '!' : '✓';
        byId('validation-mark').classList.toggle('has-errors', report.errors.length > 0);
        byId('validation-summary').innerHTML = report.errors.length
            ? '<strong class="error-text">' + report.errors.length + ' erro(s)</strong>'
            : '<strong class="ok-text">Sem erros</strong>';
        byId('validation-list').innerHTML = report.errors.length ? report.errors.slice(0, 8).map(function (issue) {
            return '<button type="button" class="validation-item error" data-error-path="' + escapeHtml(issue.path || '') + '"><span>!</span><div><p>' + escapeHtml(issue.message) + '</p><code>' + escapeHtml(issue.path || '') + '</code><small>Ir para o campo ↗</small></div></button>';
        }).join('') : '<div class="validation-empty"><span>✓</span><p>As skills e pré-requisitos estão coerentes.</p></div>';
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
            if (property.includes('element_id')) return card.querySelector('[data-effect-field="element_id"]');
            if (property.includes('effect_id')) return card.querySelector('[data-effect-field="status_effect"]');
            if (property.includes('damage')) return card.querySelector('[data-effect-field="damage"]') || card.querySelector('[data-effect-pattern]');
            if (property.includes('buff') || property.includes('debuff')) return card.querySelector('[data-effect-stats]');
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
        if (!skill || !event.target.name) return;
        syncSkillFromEditor(skill);
        if (event.target.name === 'power_kind') updatePowerFields(true);
        if (event.target.name === 'element_id') renderEffectScopes(skill);
        persist();
        updateEditorFeedback(skill, event.target.name === 'element_id');
    }

    function handleEditorChange(event) {
        var skill = currentSkill();
        if (!skill || !event.target.name) return;
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
            cooldown: numberValue(form.elements.cooldown.value, 0),
        };

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
            return '<article class="effect-card" data-effect-card data-effect-id="' + escapeHtml(effect.effect_id) + '">'
                + '<div class="effect-card-head"><div><span class="field-label">EFEITO</span><code>' + escapeHtml(effect.effect_id) + '</code></div><button class="icon-button icon-button-small effect-remove" type="button" data-remove-effect="' + escapeHtml(effect.effect_id) + '" title="Remover efeito">×</button></div>'
                + '<div class="form-grid effect-main-grid">'
                + '<label class="effect-field"><span>Nome</span><input class="control" data-effect-field="status_effect" value="' + escapeHtml(effect.status_effect || '') + '" placeholder="Ex.: Regeneração"></label>'
                + '<label class="effect-field"><span>Operação</span><select class="control" data-effect-pattern>' + PATTERNS.map(function (item) { return optionMarkup(item[0], item[1], item[0] === pattern); }).join('') + '</select></label>'
                + '<label class="effect-field"><span>Elemento</span><select class="control" data-effect-field="element_id">' + optionMarkup('', 'Usar ' + skill.element_id, !effect.element_id) + Model.ELEMENTS.map(function (id) { return optionMarkup(id, id, effect.element_id === id); }).join('') + '</select></label>'
                + '<label class="effect-field"><span>Duração</span><div class="input-suffix"><input class="control" data-effect-field="turns" type="number" min="0" value="' + escapeHtml(Array.isArray(effect.turns) ? effect.turns[1] : effect.turns ?? 1) + '"><span>turnos</span></div></label>'
                + '<label class="effect-field"><span>Precisão</span><div class="input-suffix"><input class="control" data-effect-field="effect_hit_chance" type="number" min="0" max="100" value="' + chance + '"><span>%</span></div></label>'
                + applyTo + renderEffectPatternFields(effect, pattern)
                + '<label class="effect-stack"><input type="checkbox" data-effect-field="can_stack" ' + (effect.can_stack ? 'checked' : '') + '> Pode acumular</label></div></article>';
        }).join('') : '<p class="no-effects">Escolhe um padrão para adicionar o primeiro efeito.</p>';
    }

    function renderEffectPatternFields(effect, pattern) {
        if (pattern === 'regen') {
            var regen = effect.resource_regen || {};
            return resourceInput('vida', 'hp', regen.hp) + resourceInput('mana', 'mana', regen.mana) + resourceInput('stamina', 'stamina', regen.stamina);
        }
        if (pattern === 'buff' || pattern === 'debuff') {
            var stats = effect[pattern] || {};
            var text = Object.keys(stats).map(function (stat) { return stat + ': ' + stats[stat]; }).join(', ');
            return '<label class="effect-field effect-field-wide"><span>Atributos e valores</span><input class="control" data-effect-stats="' + pattern + '" value="' + escapeHtml(text) + '" placeholder="physical_attack: 10, speed: 5"><small>Formato atributo: valor, separados por vírgulas. <code>speed</code> representa a agilidade.</small></label>';
        }
        if (pattern === 'damage') {
            var variance = effect.damage_variance || [1, 1];
            return '<label class="effect-field"><span>Dano por turno</span><input class="control" data-effect-field="damage" type="number" min="0" value="' + escapeHtml(effect.damage ?? 5) + '"></label>'
                + '<label class="effect-field"><span>Variação mín. / máx.</span><div class="range-pair"><input class="control" data-effect-variance="min" type="number" min="0" step="0.1" value="' + escapeHtml(variance[0] ?? 1) + '"><input class="control" data-effect-variance="max" type="number" min="0" step="0.1" value="' + escapeHtml(variance[1] ?? 1) + '"></div></label>';
        }
        if (pattern === 'drain') {
            var drain = effect.resource_drain || {};
            var resource = Object.keys(drain)[0] || 'hp';
            return '<label class="effect-field"><span>Recurso drenado</span><select class="control" data-effect-drain-resource><option value="hp" ' + (resource === 'hp' ? 'selected' : '') + '>Vida</option><option value="mana" ' + (resource === 'mana' ? 'selected' : '') + '>Mana</option><option value="stamina" ' + (resource === 'stamina' ? 'selected' : '') + '>Stamina</option></select></label>'
                + '<label class="effect-field"><span>Quantidade</span><input class="control" data-effect-drain-amount type="number" min="0" value="' + escapeHtml(drain[resource] ?? 8) + '"></label>';
        }
        return '';
    }

    function resourceInput(label, key, value) {
        return '<label class="effect-field"><span>Recuperar ' + label + '</span><input class="control" data-effect-resource="resource_regen.' + key + '" type="number" min="0" value="' + escapeHtml(value ?? '') + '" placeholder="0"></label>';
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
        if (effect.resource_regen) return 'regen';
        if (effect.buff) return 'buff';
        if (effect.debuff) return 'debuff';
        if (effect.resource_drain) return 'drain';
        if (effect.damage !== undefined) return 'damage';
        return 'regen';
    }

    function handleEffectActions(event) {
        var addButton = event.target.closest('[data-add-effect]');
        if (addButton) {
            addEffect(addButton.dataset.addEffect, addButton.dataset.pattern);
            return;
        }
        var removeButton = event.target.closest('[data-remove-effect]');
        if (!removeButton) return;
        var skill = currentSkill();
        if (!skill) return;
        skill.effects = (skill.effects || []).filter(function (effect) { return effect.effect_id !== removeButton.dataset.removeEffect; });
        persist();
        renderEffectScopes(skill);
        renderInspector();
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
        if (pattern === 'buff') properties.buff = { physical_attack: 10 };
        if (pattern === 'debuff') properties.debuff = { physical_attack: 10 };
        if (pattern === 'damage') properties.damage = 5;
        if (pattern === 'drain') properties.resource_drain = { hp: 8 };
        skill.effects.push(Model.makeEffect(skill.id, pattern, applyTo, effectIndex - 1, properties));
        state.openScopes[skill.id] = state.openScopes[skill.id] || {};
        state.openScopes[skill.id][scope] = true;
        persist();
        renderEffectScopes(skill);
        renderInspector();
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
        ['buff', 'debuff', 'resource_regen', 'resource_drain', 'damage', 'damage_variance'].forEach(function (key) { delete effect[key]; });
        var type = select.value;
        if (type === 'regen') effect.resource_regen = { hp: 15 };
        if (type === 'buff') effect.buff = { physical_attack: 10 };
        if (type === 'debuff') effect.debuff = { physical_attack: 10 };
        if (type === 'damage') effect.damage = 5;
        if (type === 'drain') effect.resource_drain = { hp: 8 };
        persist();
        renderEffects(skill, card.dataset.scope);
        renderInspector();
    }

    function syncEffectCards(skill) {
        var original = skill.effects || [];
        var updatedById = new Map();
        document.querySelectorAll('[data-effect-card]').forEach(function (card) {
            var effect = original.find(function (item) { return item.effect_id === card.dataset.effectId; });
            if (!effect) return;
            if (card.dataset.scope === 'self') effect.apply_to = 'self';
            else if (card.dataset.scope === 'target' && (!effect.apply_to || effect.apply_to === 'target')) effect.apply_to = 'target';
            else if (card.dataset.scope === 'team' && !effect.apply_to) effect.apply_to = defaultTeamTarget(skill);
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
                    effect.effect_hit_chance = numberValue(field.value, 100) / 100;
                } else if (key === 'can_stack') {
                    effect.can_stack = field.checked;
                } else if (key === 'damage') {
                    effect.damage = numberValue(field.value, 0);
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
                var parsed = parseStats(field.value);
                if (Object.keys(parsed).length) effect[key] = parsed;
                else delete effect[key];
            });
            var minVariance = card.querySelector('[data-effect-variance="min"]');
            var maxVariance = card.querySelector('[data-effect-variance="max"]');
            if (minVariance && maxVariance) effect.damage_variance = [numberValue(minVariance.value, 1), numberValue(maxVariance.value, 1)];
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
    }

    function createSkill(requirements, elementId, template) {
        var name = template ? template.title : 'Nova skill';
        var parentPoints = requirements.map(function (id) {
            var parent = state.project.skills.find(function (skill) { return skill.id === id; });
            if (!parent) return null;
            return parent.element_id === elementId ? Model.position(state.project, parent, state.project.skills.indexOf(parent)) : null;
        }).filter(Boolean);
        var x = parentPoints.length ? Math.max.apply(null, parentPoints.map(function (point) { return point.x; })) + 270 : 80;
        var y = parentPoints.length ? parentPoints.reduce(function (sum, point) { return sum + point.y; }, 0) / parentPoints.length + 125 : 80;
        var skill = Model.makeSkill(state.project, name, elementId, requirements, template || null);
        state.project.skills.push(skill);
        Model.setPosition(state.project, skill, x, y);
        state.selectedSkillId = skill.id;
        state.elementFilter = 'all';
        byId('element-filter').value = 'all';
        state.prerequisiteSearch = '';
        state.prerequisiteSelection = new Set(requirements || []);
        byId('prerequisite-search').value = '';
        persist();
        renderAll();
        setView('skills');
        byId('skill-editor').elements.name.focus();
        if (!template) byId('skill-editor').elements.name.select();
        toast(requirements.length
            ? 'Nova ramificação criada com ' + requirements.length + ' pré-requisito(s).'
            : template ? 'Skill criada a partir do modelo “' + template.title + '”.' : 'Skill criada. O ID mantém-se estável ao mudar o nome.');
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

    function parseStats(value) {
        var result = {};
        String(value || '').split(',').forEach(function (pair) {
            var match = pair.trim().match(/^([a-zA-Z_][\w]*)\s*:\s*(-?\d+(?:\.\d+)?)$/);
            if (match) result[match[1]] = Number(match[2]);
        });
        return result;
    }

    function numberValue(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
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
        result.costs = {
            mana: Number(skill.costs?.mana) || 0,
            stamina: Number(skill.costs?.stamina) || 0,
            cooldown: Number(skill.costs?.cooldown) || 0,
        };
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

    function readFile(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    var text = String(reader.result || '');
                    var value = parseContent(text);
                    resolve({ file: file, value: value });
                } catch (error) { reject(error); }
            };
            reader.onerror = function () { reject(new Error('Falha ao ler ' + file.name)); };
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
        Promise.all(files.map(readFile))
            .then(function (entries) { return importEntries(entries); })
            .catch(function (error) {
                toast('Importação cancelada: ' + error.message, true);
            });
    }

    function importEntries(entries) {
        return Promise.resolve().then(function () {
            var catalogEntry = entries.find(function (entry) { return entry.value && Array.isArray(entry.value.skills); });
            if (!catalogEntry) throw new Error('O ficheiro precisa de conter uma lista “skills”.');
            var skills = catalogEntry.value.skills.map(Model.normalizeSkill).filter(Boolean);
            var duplicateIds = findDuplicates(skills.map(function (skill) { return skill.id; }));
            if (duplicateIds.length) throw new Error('IDs de skills duplicados: ' + duplicateIds.join(', '));
            var knownIds = new Set(skills.map(function (skill) { return skill.id; }));
            skills.forEach(function (skill) {
                (skill.learning_requirements.required_attack_ids || []).forEach(function (id) {
                    if (!knownIds.has(id)) throw new Error(skill.id + ' exige a skill não importada ' + id + '.');
                });
            });
            // As árvores são derivadas do catálogo: pertença por element_id e
            // arestas por learning_requirements (o normalize cria as posições).
            var imported = Model.normalize({ skills: skills });
            var report = Model.validate(imported);
            if (report.errors.length) throw new Error(report.errors[0].message);
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
