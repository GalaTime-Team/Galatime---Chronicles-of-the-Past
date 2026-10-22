/*
 * Motor de combate espelhado — o Forger simula o dano com a mesma cadeia do
 * jogo (`apps/desktop/src/services/combat/damageCalculator.ts`).
 *
 * A cadeia é:
 *
 *     dano = (ATK / RES) x EFEITO x (PWR / POWER_DIVISOR) x VARIÂNCIA
 *
 * A simulação é determinística: sem críticos e sem a variância aleatória
 * (0.9 … 1.1), tal como o pedido — o número mostrado é o valor *esperado* de
 * um acerto, não uma tiragem.
 *
 * As regras que o motor ainda não implementa são aplicadas aqui na mesma
 * forma em que as árvores de skills as pedem, para que o catálogo possa ser
 * escrito já no formato final:
 *   - `accuracy` é um modificador *de saída* (afeta os próprios ataques).
 *   - `evasion` é um modificador *de entrada* (afeta o acerto contra o alvo).
 *   - `solar` rende x1.5 de dia e x0.5 de noite; `nocturnal`, o contrário.
 *   - `bonus_vs_elements` multiplica sobre a tabela de elementos.
 *   - `crit_chance` e `crit_multiplier` descrevem o golpe crítico.
 */
(function (root) {
    'use strict';

    /* ------------------------------------------------------------------ */
    /* Constantes (apps/desktop/src/constants/CombatConstants.ts)          */
    /* ------------------------------------------------------------------ */
    var CONSTANTS = {
        POWER_DIVISOR: 1,
        MINIMUM_DEFENSE: 1,
        MINIMUM_DAMAGE: 1,
        DEFAULT_ACCURACY: 100,
        DAMAGE_VARIANCE_RANGE: [0.9, 1.1],
        DEFEND_DAMAGE_REDUCTION: 0.5,
        POSITION_DAMAGE_MODIFIERS: {
            front: { front: 1, rear: 0.8 },
            rear: { front: 0.85, rear: 0.8 },
        },
        /* O fator das skills de dia e de noite. */
        SOLAR_DAY_MULTIPLIER: 1.5,
        SOLAR_NIGHT_MULTIPLIER: 0.5,
        /* O multiplicador do golpe crítico. */
        CRIT_MULTIPLIER: 1.75,
        /* Limites da precisão efetiva. */
        MIN_EFFECTIVE_ACCURACY: 5,
        MAX_EFFECTIVE_ACCURACY: 100,
        /* Escada de níveis (skillLevels.ts). */
        MAX_SKILL_LEVEL: 5,
        SKILL_LEVEL_POWER_GROWTH: 0.15,
        SKILL_LEVEL_COST_GROWTH: 0.05,
        SKILL_LEVEL_COOLDOWN_EVERY: 2,
    };

    /* ------------------------------------------------------------------ */
    /* Tabela de elementos (apps/desktop/src/data/combat/elements/elements.yaml) */
    /* ------------------------------------------------------------------ */
    var ELEMENT_DATA = {
        aqua: { name: 'Aqua', type: 'natural', relations: { immune: ['corporis'], super_strong: [], strong: ['ignis', 'lux'], weak: ['chaos', 'florere'], super_weak: [] } },
        caeli: { name: 'Caeli', type: 'natural', relations: { immune: ['corporis', 'lux', 'umbra'], super_strong: [], strong: ['aqua', 'florere', 'spatium'], weak: ['ignis', 'lapis'], super_weak: [] } },
        chaos: { name: 'Chaos', type: 'natural', relations: { immune: ['corporis'], super_strong: [], strong: ['caeli', 'lapis'], weak: ['lux', 'spatium'], super_weak: [] } },
        corporis: { name: 'Corporis', type: 'natural', relations: { immune: [], super_strong: [], strong: ['aqua', 'caeli', 'vetus'], weak: ['lux', 'spatium', 'vis'], super_weak: [] } },
        florere: { name: 'Florere', type: 'natural', relations: { immune: [], super_strong: [], strong: ['aqua', 'corporis', 'lux'], weak: ['ignis', 'spatium'], super_weak: [] } },
        ignis: { name: 'Ignis', type: 'natural', relations: { immune: [], super_strong: [], strong: ['florere', 'umbra'], weak: ['aqua', 'caeli'], super_weak: [] } },
        inanus: { name: 'Inanus', type: 'natural', relations: { immune: [], super_strong: [], strong: [], weak: [], super_weak: [] } },
        lapis: { name: 'Lapis', type: 'natural', relations: { immune: ['vetus', 'vis'], super_strong: [], strong: ['caeli', 'ignis', 'lux', 'umbra'], weak: ['aqua', 'florere'], super_weak: [] } },
        lux: { name: 'Lux', type: 'natural', relations: { immune: ['caeli', 'lux'], super_strong: [], strong: ['chaos', 'ignis'], weak: ['aqua', 'florere', 'umbra'], super_weak: [] } },
        spatium: { name: 'Spatium', type: 'natural', relations: { immune: ['corporis', 'vetus'], super_strong: [], strong: ['florere', 'lux'], weak: ['spatium', 'umbra'], super_weak: [] } },
        umbra: { name: 'Umbra', type: 'natural', relations: { immune: ['caeli', 'lapis', 'umbra'], super_strong: [], strong: ['aqua', 'spatium', 'vetus'], weak: ['corporis', 'ignis', 'lux'], super_weak: [] } },
        vetus: { name: 'Vetus', type: 'natural', relations: { immune: [], super_strong: [], strong: ['spatium', 'vis'], weak: ['caeli'], super_weak: [] } },
        vis: { name: 'Vis', type: 'natural', relations: { immune: [], super_strong: [], strong: ['chaos', 'corporis'], weak: ['lapis', 'vetus'], super_weak: [] } },
        corrupted_blaze: { name: 'Corrupted Blaze', type: 'corrupted', relations: { immune: ['ignis'], super_strong: ['florere', 'spatium', 'umbra'], strong: ['corporis', 'lux'], weak: ['chaos'], super_weak: ['aqua', 'caeli'] } },
        corrupted_day: { name: 'Corrupted Day', type: 'corrupted', relations: { immune: ['caeli', 'lux'], super_strong: ['chaos', 'corporis', 'ignis', 'lapis'], strong: ['spatium'], weak: [], super_weak: ['aqua', 'florere', 'umbra'] } },
        corrupted_forest: { name: 'Corrupted Forest', type: 'corrupted', relations: { immune: ['florere', 'umbra'], super_strong: ['chaos', 'lapis'], strong: ['corporis', 'spatium'], weak: ['aqua', 'caeli'], super_weak: ['ignis'] } },
        corrupted_ice: { name: 'Corrupted Ice', type: 'corrupted', relations: { immune: ['aqua', 'corporis'], super_strong: ['ignis', 'lux', 'umbra'], strong: ['lapis'], weak: ['caeli'], super_weak: ['chaos', 'florere'] } },
        corrupted_night: { name: 'Corrupted Night', type: 'corrupted', relations: { immune: ['lapis', 'umbra'], super_strong: ['aqua', 'caeli', 'florere', 'spatium'], strong: ['chaos'], weak: [], super_weak: ['corporis', 'ignis', 'lux'] } },
        corrupted_void: { name: 'Corrupted Void', type: 'corrupted', relations: { immune: ['corporis', 'ignis'], super_strong: ['florere', 'lapis', 'lux'], strong: [], weak: ['chaos'], super_weak: ['spatium', 'umbra'] } },
    };

    var SCORE_MAP = { immune: -3, super_strong: -2, strong: -1, weak: 1, super_weak: 2 };

    var RELATION_LABELS = {
        '-3': 'imune', '-2': 'muito resistente', '-1': 'resistente', '0': 'normal', '1': 'vulnerável', '2': 'muito vulnerável',
    };

    /* ------------------------------------------------------------------ */
    /* Utilitários                                                         */
    /* ------------------------------------------------------------------ */
    function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
    function isRecord(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
    function numberOr(value, fallback) {
        var parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : fallback;
    }
    function roundHalf(value) { return Math.round(value); }

    /** Elementos disponíveis (naturais + corrompidos). */
    function elementIds() { return Object.keys(ELEMENT_DATA); }

    /**
     * Pontuação defensiva de um elemento contra um elemento ofensivo.
     *
     * As relações são declaradas no elemento *defensivo*: `lux.relations.weak:
     * [aqua]` significa que Aqua é forte contra Lux.
     */
    function elementDefenseScore(targetElementId, offensiveElementId) {
        var target = ELEMENT_DATA[targetElementId];
        if (!target || !offensiveElementId) return 0;
        var total = 0;
        Object.keys(SCORE_MAP).forEach(function (relation) {
            var list = target.relations[relation] || [];
            if (list.indexOf(offensiveElementId) !== -1) total += SCORE_MAP[relation];
        });
        return total;
    }

    /** Pontuação → multiplicador (elementUtils.scoreToMultiplier). */
    function scoreToMultiplier(score) {
        switch (score) {
            case -3: return 0;
            case -2: return 0.25;
            case -1: return 0.5;
            case 0: return 1;
            case 1: return 2;
            case 2: return 4;
            default:
                if (score < -3) return 0;
                if (score > 2) return 4;
                return 1;
        }
    }

    /** Rótulo da relação resultante (para a legenda do simulador). */
    function scoreLabel(score) { return RELATION_LABELS[String(score)] || 'normal'; }

    /**
     * Multiplicador de elemento contra um defensor multi-elemento.
     *
     * As pontuações dos elementos do defensor somam-se antes de virar
     * multiplicador — a mesma regra do motor.
     */
    function elementMultiplier(offensiveElementId, targetElementIds) {
        var ids = (targetElementIds || []).filter(function (id) { return Boolean(id); });
        if (!offensiveElementId || !ids.length) return { score: 0, multiplier: 1, relation: 'normal' };
        var total = 0;
        ids.forEach(function (id) { total += elementDefenseScore(id, offensiveElementId); });
        return { score: total, multiplier: scoreToMultiplier(total), relation: scoreLabel(total) };
    }

    /** Modificador de linha (positionRules.positionDamageModifier). */
    function positionDamageModifier(attackerLine, defenderLine, sameSide) {
        if (sameSide) return 1;
        var table = CONSTANTS.POSITION_DAMAGE_MODIFIERS;
        return (table[attackerLine] || table.front)[defenderLine] || 1;
    }

    /**
     * Lê o poder de dano (combatUtils.readPower).
     *
     * Aceita um número, `{ kind: 'fixed', value }` ou `{ min, max }`.
     */
    function readPower(value) {
        var direct = numberOr(value, Number.NaN);
        if (Number.isFinite(direct)) return direct;
        if (!isRecord(value)) return 0;
        var fixed = numberOr(value.value, Number.NaN);
        if (Number.isFinite(fixed)) return fixed;
        var min = numberOr(value.min, Number.NaN);
        var max = numberOr(value.max, Number.NaN);
        if (Number.isFinite(min) && Number.isFinite(max)) return (min + max) / 2;
        return 0;
    }

    /** Intervalo de poder autorado, quando o poder é sorteado (`min`/`max`). */
    function powerRange(value) {
        if (!isRecord(value)) return null;
        var min = numberOr(value.min, Number.NaN);
        var max = numberOr(value.max, Number.NaN);
        if (Number.isFinite(min) && Number.isFinite(max)) return [Math.min(min, max), Math.max(min, max)];
        return null;
    }

    /** Escala da escada de níveis (skillLevels.applySkillLevel). */
    function skillLevel(level) {
        var target = clamp(Math.round(numberOr(level, 1)), 1, CONSTANTS.MAX_SKILL_LEVEL);
        var steps = target - 1;
        return {
            level: target,
            label: target === 1 ? 'I' : ['', 'I', 'II', 'III', 'IV', 'V'][target],
            powerFactor: 1 + CONSTANTS.SKILL_LEVEL_POWER_GROWTH * steps,
            costFactor: 1 + CONSTANTS.SKILL_LEVEL_COST_GROWTH * steps,
            extraCooldown: Math.floor(steps / CONSTANTS.SKILL_LEVEL_COOLDOWN_EVERY),
        };
    }

    /** Precisão efetiva: precisão autorada + modificador de saída − esquiva. */
    function effectiveAccuracy(accuracy, accuracyStat, evasion, ignoreAccuracy) {
        var authored = numberOr(accuracy, CONSTANTS.DEFAULT_ACCURACY);
        if (authored > 0 && authored <= 1) authored = authored * 100;
        if (ignoreAccuracy) {
            return { value: CONSTANTS.MAX_EFFECTIVE_ACCURACY, authored: clamp(authored, 0, 100), modifier: numberOr(accuracyStat, 0), evasion: numberOr(evasion, 0), unavoidable: true };
        }
        var value = clamp(
            authored + numberOr(accuracyStat, 0) - numberOr(evasion, 0),
            CONSTANTS.MIN_EFFECTIVE_ACCURACY,
            CONSTANTS.MAX_EFFECTIVE_ACCURACY,
        );
        return { value: value, authored: clamp(authored, 0, 100), modifier: numberOr(accuracyStat, 0), evasion: numberOr(evasion, 0), unavoidable: false };
    }

    /**
     * Chance de crítico: a da skill mais o stat do atacante.
     *
     * O crítico é sempre *do lado de quem ataca* — como a precisão, nunca
     * depende do defensor.
     */
    function critChance(skill, critStat) {
        var authored = numberOr(skill.crit_chance, 0);
        if (authored > 0 && authored <= 1) authored = authored * 100;
        return clamp(authored + numberOr(critStat, 0), 0, 100);
    }

    /**
     * Fator de dia ou de noite.
     *
     * `solar` rende x1.5 de dia e x0.5 de noite; `nocturnal` o inverso. As
     * duas regras leem a mesma hora do encontro.
     */
    function phaseMultiplier(skill, phase) {
        var night = phase === 'night';
        var multiplier = 1;
        if (skill.solar) multiplier *= night ? CONSTANTS.SOLAR_NIGHT_MULTIPLIER : CONSTANTS.SOLAR_DAY_MULTIPLIER;
        if (skill.nocturnal) multiplier *= night ? CONSTANTS.SOLAR_DAY_MULTIPLIER : CONSTANTS.SOLAR_NIGHT_MULTIPLIER;
        return multiplier;
    }

    /**
     * Bónus por elemento.
     *
     * O motor ainda não existe: o Forger aplica o maior bónus declarado entre
     * os elementos do defensor (o mais forte dos declarados), e diz isso no
     * ecrã do simulador.
     */
    function bonusVsMultiplier(bonusVsElements, targetElementIds) {
        var entries = Object.entries(isRecord(bonusVsElements) ? bonusVsElements : {});
        if (!entries.length) return { multiplier: 1, element: null, value: null };
        var best = { multiplier: 1, element: null, value: null };
        (targetElementIds || []).forEach(function (id) {
            entries.forEach(function (entry) {
                if (entry[0] !== id) return;
                var value = numberOr(entry[1], 1);
                if (value > best.multiplier) best = { multiplier: value, element: id, value: value };
            });
        });
        return best;
    }

    /**
     * Bónus para alvos abaixo de um limiar de vida (execução).
     *
     * `bonus_vs_hp_below: { threshold: 0.5, multiplier: 1.25 }` — o bónus só
     * conta se o defensor estiver abaixo do limiar.
     */
    function bonusVsHpBelow(spec, targetHpFraction) {
        if (!isRecord(spec)) return { multiplier: 1, threshold: null, applied: false };
        var threshold = numberOr(spec.threshold, 0);
        var multiplier = numberOr(spec.multiplier, 1);
        var fraction = numberOr(targetHpFraction, 1);
        var applied = threshold > 0 && fraction < threshold;
        return { multiplier: applied ? multiplier : 1, threshold: threshold, applied: applied, value: multiplier };
    }

    /** Fração da defesa do alvo que o golpe ignora. */
    function pierceDefense(defenseValue, pierce) {
        var fraction = clamp(numberOr(pierce, 0), 0, 1);
        return { value: defenseValue * (1 - fraction), fraction: fraction };
    }

    /**
     * Simula o dano de uma skill.
     *
     * Devolve a cadeia completa para que o simulador possa mostrar *porque* o
     * número é o que é.
     */
    function simulate(skill, options) {
        options = options || {};
        var tier = skillLevel(options.level);
        var damage = isRecord(skill.damage) ? skill.damage : {};
        var damageType = damage.damage_type === 'physical' || damage.damage_type === 'magical'
            ? damage.damage_type
            : (damage.kind === 'physical' || damage.kind === 'magical' ? damage.kind : 'magical');
        var powerSpec = damage.power !== undefined ? damage.power : skill.power;
        var scaling = isRecord(powerSpec) && powerSpec.kind === 'scaling';
        var rawPower = readPower(powerSpec);
        var power = rawPower * tier.powerFactor;

        var attackValue = damageType === 'physical'
            ? numberOr(options.attackerPhysicalAttack, 0)
            : numberOr(options.attackerMagicalAttack, 0);
        var defenseValue = damageType === 'physical'
            ? numberOr(options.defenderPhysicalDefense, 0)
            : numberOr(options.defenderMagicalDefense, 0);

        // O motor ainda não lê `power: { kind: scaling }` (readPower devolve 0).
        // O simulador usa a leitura pretendida — atributo x multiplicador — e
        // assinala a lacuna.
        var scalingNote = null;
        if (scaling) {
            var statValue = powerSpec.stat === 'physical_attack'
                ? numberOr(options.attackerPhysicalAttack, 0)
                : powerSpec.stat === 'strength' || powerSpec.stat === 'intelligence'
                    ? numberOr(options.attackerMagicalAttack, 0)
                    : numberOr(options.attackerMagicalAttack, 0);
            var multiplier = numberOr(powerSpec.multiplier, 1);
            power = statValue * multiplier * tier.powerFactor;
            scalingNote = 'Leitura do Forger: ' + (powerSpec.stat || 'magical_attack') + ' × ' + multiplier
                + '. O motor ainda devolve 0 para `power.kind: scaling`.';
        }

        var element = elementMultiplier(skill.element_id, options.defenderElements || []);
        var position = positionDamageModifier(
            options.attackerLine || 'front',
            options.defenderLine || 'front',
            Boolean(options.sameSide),
        );
        var phase = phaseMultiplier(skill, options.phase === 'night' ? 'night' : 'day');
        var bonus = bonusVsMultiplier(skill.bonus_vs_elements, options.defenderElements || []);
        var hpBonus = bonusVsHpBelow(skill.bonus_vs_hp_below, options.targetHpFraction);
        var defenseReduction = options.defenderDefending ? CONSTANTS.DEFEND_DAMAGE_REDUCTION : 0;
        var pierced = pierceDefense(defenseValue, skill.defense_pierce);

        var defense = Math.max(CONSTANTS.MINIMUM_DEFENSE, pierced.value);
        var base = (attackValue / defense) * element.multiplier * (power / CONSTANTS.POWER_DIVISOR);
        var afterTraits = base * phase * bonus.multiplier * hpBonus.multiplier;
        var positioned = afterTraits * position * (1 - defenseReduction);
        var finalDamage = element.multiplier === 0 ? 0 : Math.max(CONSTANTS.MINIMUM_DAMAGE, roundHalf(positioned));

        var accuracy = effectiveAccuracy(
            skill.accuracy,
            options.attackerAccuracyStat,
            options.defenderEvasion,
            skill.ignore_accuracy === true,
        );
        var crit = critChance(skill, options.attackerCritStat);
        var hitCount = Math.max(1, Math.round(numberOr(skill.hit_count, 1)));
        var hitChance = accuracy.value / 100;
        var expectedHits = hitCount * hitChance;
        var expectedTotal = finalDamage * expectedHits;

        var range = powerRange(powerSpec);
        var minDamage = null;
        var maxDamage = null;
        if (range && element.multiplier !== 0) {
            var low = computeDamage(attackValue, defense, element.multiplier, range[0] * tier.powerFactor, phase, bonus.multiplier * hpBonus.multiplier, position, defenseReduction);
            var high = computeDamage(attackValue, defense, element.multiplier, range[1] * tier.powerFactor, phase, bonus.multiplier * hpBonus.multiplier, position, defenseReduction);
            minDamage = low;
            maxDamage = high;
        }

        var costs = isRecord(skill.costs) ? skill.costs : {};
        var manaCost = Math.round(numberOr(costs.mana, 0) * tier.costFactor);
        var staminaCost = Math.round(numberOr(costs.stamina, 0) * tier.costFactor);
        var hpCost = Math.round(numberOr(costs.hp, 0) * tier.costFactor);
        var cooldownCost = Math.round(numberOr(costs.cooldown, 0)) + tier.extraCooldown;

        return {
            hasDamage: Boolean(skill.damage) && power > 0,
            damageType: damageType,
            tier: tier,
            power: power,
            powerRange: range,
            attackValue: attackValue,
            defenseValue: defenseValue,
            effectiveDefense: defense,
            pierced: pierced,
            element: element,
            position: position,
            phase: phase,
            bonus: bonus,
            hpBonus: hpBonus,
            defenseReduction: defenseReduction,
            base: base,
            afterTraits: afterTraits,
            positioned: positioned,
            finalDamage: finalDamage,
            minDamage: minDamage,
            maxDamage: maxDamage,
            accuracy: accuracy,
            critChance: crit,
            critMultiplier: CONSTANTS.CRIT_MULTIPLIER,
            guaranteedCrit: skill.guaranteed_crit_vs_status ? skill.guaranteed_crit_vs_status : null,
            hitCount: hitCount,
            hitChance: hitChance,
            expectedHits: expectedHits,
            expectedTotal: expectedTotal,
            fleeBelowHp: skill.flee_below_hp === undefined ? null : numberOr(skill.flee_below_hp, 0),
            costs: { mana: manaCost, stamina: staminaCost, hp: hpCost, cooldown: cooldownCost },
            manaPerDamage: expectedTotal > 0 ? manaCost / expectedTotal : null,
            scalingNote: scalingNote,
        };
    }

    /** Uma passada isolada da cadeia (usada para o mínimo/máximo de poder). */
    function computeDamage(attackValue, defense, elementMultiplierValue, power, solar, bonus, position, defenseReduction) {
        var base = (attackValue / Math.max(CONSTANTS.MINIMUM_DEFENSE, defense)) * elementMultiplierValue * power;
        var value = base * solar * bonus * position * (1 - defenseReduction);
        return elementMultiplierValue === 0 ? 0 : Math.max(CONSTANTS.MINIMUM_DAMAGE, roundHalf(value));
    }

    root.SkillForgerEngine = {
        CONSTANTS: CONSTANTS,
        ELEMENT_DATA: ELEMENT_DATA,
        elementIds: elementIds,
        elementDefenseScore: elementDefenseScore,
        scoreToMultiplier: scoreToMultiplier,
        elementMultiplier: elementMultiplier,
        positionDamageModifier: positionDamageModifier,
        readPower: readPower,
        skillLevel: skillLevel,
        effectiveAccuracy: effectiveAccuracy,
        critChance: critChance,
        phaseMultiplier: phaseMultiplier,
        bonusVsMultiplier: bonusVsMultiplier,
        bonusVsHpBelow: bonusVsHpBelow,
        pierceDefense: pierceDefense,
        simulate: simulate,
    };
})(window);
