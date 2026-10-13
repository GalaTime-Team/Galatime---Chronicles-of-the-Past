import { Fragment } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { DialogueSegment, DialogueTextStyle } from '../../../types/DialogueType';
import { playSfx } from '../../../controllers/audioController';
import { useGame } from '../../../context/GameContext';
import { isAtomicSegment, splitSegmentWords } from '../../../services/dialogueTextService';
import {
    DIALOGUE_JITTER_DURATION,
    DIALOGUE_JITTER_INTENSITY,
    DIALOGUE_JITTER_PHASE_STEP,
    DIALOGUE_JITTER_TRANSITION,
    DIALOGUE_MOTION_PHASE_STEPS,
    DIALOGUE_SHAKE_DURATION,
    DIALOGUE_SHAKE_INTENSITY,
    DIALOGUE_SHAKE_PHASE_STEP,
    DIALOGUE_SHAKE_TRANSITION,
    DIALOGUE_WAVE_DURATION,
    DIALOGUE_WAVE_INTENSITY,
    DIALOGUE_WAVE_PHASE_STEP,
    DIALOGUE_WAVE_TRANSITION,
    buildJitterKeyframes,
    buildShakeKeyframes,
    buildWaveKeyframes,
    scaleMotionDuration,
} from '../../../constants/DialogueAnimationConstants';

/**
 * Draws one page of a line.
 *
 * It is deliberately dumb: it receives segments that have already been sliced to
 * the page and to how much of the page has been revealed, and renders them. It
 * decides nothing about pacing or pagination.
 *
 * The same component draws the hidden measuring mirror. That is the point — the
 * paginator measures the elements this component produced, so the ruler and the
 * text it is measuring can never drift apart when a style changes.
 *
 * A clickable phrase is drawn differently from the prose around it, but only
 * while the **Dialogue Tool tip** setting is on. With it off the phrase is still
 * clickable and still focusable — the setting hides the *affordance*, not the
 * interaction, so a player who wants to find the branches themselves can.
 */

export interface DialogueTextRendererProps {
    segments: DialogueSegment[];
    /**
     * When false the clickable spans are shown as text but do nothing.
     *
     * The box turns them off while a page is still typing, so a clickable phrase
     * cannot be followed before it has finished appearing.
     */
    interactiveEnabled?: boolean;
    onInteraction?: (interactionId: string) => void;
    /**
     * Wraps every measurable word in its own element carrying
     * `data-dialogue-token`, which is what the paginator queries.
     *
     * Only the hidden mirror needs it. The elements are unstyled inline spans, so
     * turning this on cannot change how the text wraps.
     */
    measureTokens?: boolean;
    /** Suppresses the movement styles; the accessibility setting wins over the author. */
    reduceMotion?: boolean;
}

/** The inline styling a `styled_text` segment asks for. */
function toCss(style: DialogueTextStyle | undefined): CSSProperties {
    if (!style) {
        return {};
    }

    const css: CSSProperties = {};

    if (style.color) {
        css.color = style.color;
    }

    if (style.bold) {
        css.fontWeight = 700;
    }

    if (style.italic) {
        css.fontStyle = 'italic';
    }

    if (style.underline) {
        css.textDecoration = 'underline';
    }

    return css;
}

/**
 * How hard a segment asks for one of the movement styles, or `0` for no movement.
 *
 * All three styles resolve identically on purpose. `off` is not a level: it is the
 * author deferring to the player, so it resolves to no movement and the
 * accessibility setting is free to agree.
 */
function resolveMotionIntensity(
    level: DialogueTextStyle['shake'],
    intensities: Record<string, number>,
    reduceMotion: boolean,
): number {
    if (reduceMotion || !level || level === 'off') {
        return 0;
    }

    return intensities[level] ?? 0;
}

/**
 * One character per element, each movement on its own phase.
 *
 * The three movement styles are layered **per character** instead of per
 * segment: the wave bobs, the jitter trembles inside that, and the shake rattles
 * the two of them together — each on its own element, so a segment may ask for
 * all three and the offsets add up rather than overwrite. Every character runs
 * the same loops offset by its place in the segment, so a line ripples and
 * shivers *along* instead of the whole phrase snapping in step.
 *
 * The phase comes from the character's index in the segment, and the value is
 * only ever truncated from the end while a page types, so a character never
 * changes phase part-way through a line. Characters are keyed by that same
 * index.
 *
 * **A space is counted for the phase but never wrapped in an element.** An
 * inline box trims the whitespace at its own edges, so a space inside a
 * `motion.span` collapses to nothing — which used to swallow the gap in
 * "desculpa princesa" while the line rendered. Spaces stay plain text between
 * the characters; they still advance the phase, so the letters after one keep
 * their place in the segment.
 *
 * **Words stay atomic when the wave asks for it.** Each word is one
 * `inline-block`, so the browser can only break the line between words; a break
 * inside a word would be a visible defect and would also make the hidden
 * measuring mirror disagree with the visible text. Without a wave the characters
 * are plain inline spans — where the line always broke anyway — because the
 * jitter and the shake move each one with a *relative* offset: a CSS transform
 * is ignored on a non-replaced inline box, and turning every character into an
 * `inline-block` to allow one would change where the line breaks. A relative
 * offset moves a character without touching layout, so the mirror still
 * describes what the box draws.
 *
 * Nothing here carries `data-dialogue-token`, and a waved segment is a single
 * token to the paginator (`isAtomicSegment`): the phase comes from a character's
 * place in the whole segment, so the segment cannot be split across pages without
 * restarting the ripple at every boundary.
 *
 * The tempo is handed in rather than read from the style: `duration` and
 * `phaseStep` scale together, so a slow movement still spreads along the line at
 * the same rate relative to its own loop.
 */
function MotionText({
    value,
    wave,
    jitter,
    shake,
    waveDuration,
    jitterDuration,
    shakeDuration,
    wavePhaseStep,
    jitterPhaseStep,
    shakePhaseStep,
}: {
    value: string;
    wave: number;
    jitter: number;
    shake: number;
    waveDuration: number;
    jitterDuration: number;
    shakeDuration: number;
    wavePhaseStep: number;
    jitterPhaseStep: number;
    shakePhaseStep: number;
}) {
    const waveKeyframes = wave > 0 ? buildWaveKeyframes(wave) : undefined;
    const jitterKeyframes = jitter > 0 ? buildJitterKeyframes(jitter) : undefined;
    const shakeKeyframes = shake > 0 ? buildShakeKeyframes(shake) : undefined;

    // Split on the whitespace runs only for a wave: the split is what makes each
    // word a block the browser cannot break. Without one the characters are
    // plain inline spans and the line breaks exactly where the mirror measures.
    const runs = waveKeyframes ? value.split(/(\s+)/) : [value];

    // Mutated during render on purpose, like `tokenIndex` below: it is a local of
    // this render, so the phase always walks the segment in the same order.
    let characterIndex = -1;

    const drawCharacter = (character: string): ReactNode => {
        characterIndex += 1;

        // A space is phase, not motion: see the note above.
        if (/\s/.test(character)) {
            return character;
        }

        const phase = (step: number) => (characterIndex % DIALOGUE_MOTION_PHASE_STEPS) * step;

        // Innermost first: the wave bobs the glyph, the jitter trembles it
        // inside that, the shake rattles the two of them together — each layer
        // its own element, so the offsets add up instead of overwriting.
        let node: ReactNode = character;

        if (waveKeyframes) {
            node = (
                <motion.span
                    className="inline-block"
                    animate={{ y: waveKeyframes }}
                    transition={{ ...DIALOGUE_WAVE_TRANSITION, duration: waveDuration, delay: phase(wavePhaseStep) }}
                >
                    {node}
                </motion.span>
            );
        }

        if (jitterKeyframes) {
            node = (
                <motion.span
                    style={{ position: 'relative', left: 0, top: 0 }}
                    animate={{ left: jitterKeyframes.left, top: jitterKeyframes.top }}
                    transition={{ ...DIALOGUE_JITTER_TRANSITION, duration: jitterDuration, delay: phase(jitterPhaseStep) }}
                >
                    {node}
                </motion.span>
            );
        }

        if (shakeKeyframes) {
            node = (
                <motion.span
                    style={{ position: 'relative', left: 0 }}
                    animate={{ left: shakeKeyframes }}
                    transition={{ ...DIALOGUE_SHAKE_TRANSITION, duration: shakeDuration, delay: phase(shakePhaseStep) }}
                >
                    {node}
                </motion.span>
            );
        }

        return <Fragment key={characterIndex}>{node}</Fragment>;
    };

    return (
        <>
            {runs.map((run, runIndex) => {
                if (run.length === 0) {
                    return null;
                }

                const characters = [...run].map(drawCharacter);
                const isWhitespaceRun = /^\s+$/.test(run);

                // A whitespace run is plain text: a block around it would trim
                // the space away. Everything else a wave wraps in its word
                // block; without one the characters need no wrapper at all.
                if (isWhitespaceRun || !waveKeyframes) {
                    return <Fragment key={runIndex}>{characters}</Fragment>;
                }

                return (
                    <span key={runIndex} className="inline-block whitespace-nowrap">
                        {characters}
                    </span>
                );
            })}
        </>
    );
}

export function DialogueTextRenderer({
    segments,
    interactiveEnabled = true,
    onInteraction,
    measureTokens = false,
    reduceMotion = false,
}: DialogueTextRendererProps) {
    const { t } = useTranslation('dialogue');
    const { gameState } = useGame();
    const highlightInteractive = gameState.settings.dialogueTooltipVisible;

    // Mutated during render on purpose: the counter is a local of this render, so
    // it restarts at zero every time and always walks the segments in the same
    // order `tokenizeSegments` did.
    let tokenIndex = 0;
    const nextToken = () => tokenIndex++;

    return (
        <>
            {segments.map((segment, index) => {
                if (segment.type === 'pause') {
                    return null;
                }

                if (segment.type === 'interactive_text') {
                    const token = measureTokens ? nextToken() : -1;

                    return (
                        <button
                            key={`${index}-${segment.interaction_id}`}
                            type="button"
                            data-dialogue-token={token >= 0 ? token : undefined}
                            disabled={!interactiveEnabled}
                            aria-label={t('dialogue.interactiveHint', { text: segment.value })}
                            onMouseEnter={() => {
                                if (interactiveEnabled) {
                                    void playSfx('hover');
                                }
                            }}
                            onClick={(event) => {
                                if (!interactiveEnabled) {
                                    return;
                                }

                                // The box itself is clickable; following a phrase
                                // must not also advance the line.
                                event.stopPropagation();
                                void playSfx('click');
                                onInteraction?.(segment.interaction_id);
                            }}
                            // With the tool tip off the phrase has to be indistinguishable
                            // from the prose around it, hover included; a keyboard focus
                            // ring is kept either way, because a focus ring that is also
                            // hidden leaves no way to reach the phrase at all.
                            className={`inline cursor-pointer border-0 bg-transparent p-0 font-custom transition-colors duration-300 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-galatime-accent disabled:cursor-default ${highlightInteractive
                                ? 'text-galatime-accent underline decoration-dotted underline-offset-4 hover:text-white focus-visible:text-white disabled:no-underline'
                                : 'text-inherit'
                                }`}
                        >
                            {segment.value}
                        </button>
                    );
                }

                if (segment.type === 'text') {
                    if (!measureTokens) {
                        return <Fragment key={index}>{segment.value}</Fragment>;
                    }

                    return (
                        <Fragment key={index}>
                            {splitSegmentWords(segment.value).map((range) => (
                                <span key={range.start} data-dialogue-token={nextToken()}>
                                    {segment.value.slice(range.start, range.end)}
                                </span>
                            ))}
                        </Fragment>
                    );
                }

                const css = toCss(segment.style);

                /*
                  The mirror has to hand the paginator exactly the tokens
                  `tokenizeSegments` counted, so the same `isAtomicSegment` decides
                  here. A styled segment that is allowed to break is drawn one
                  element per word, each carrying the same style — which is what it
                  looks like as one segment, so the ruler still describes the box.
                */
                if (measureTokens && !isAtomicSegment(segment)) {
                    return (
                        <Fragment key={index}>
                            {splitSegmentWords(segment.value).map((range) => (
                                <span key={range.start} data-dialogue-token={nextToken()} style={css}>
                                    {segment.value.slice(range.start, range.end)}
                                </span>
                            ))}
                        </Fragment>
                    );
                }

                const token = measureTokens ? nextToken() : -1;
                const style = segment.style;
                const shake = resolveMotionIntensity(style?.shake, DIALOGUE_SHAKE_INTENSITY, reduceMotion);
                const wave = resolveMotionIntensity(style?.wave, DIALOGUE_WAVE_INTENSITY, reduceMotion);
                const jitter = resolveMotionIntensity(style?.jitter, DIALOGUE_JITTER_INTENSITY, reduceMotion);

                // Tempo is orthogonal to the level: the level says how *far* the
                // text travels and `*_speed` says how fast. Each movement keeps its
                // own, so a line can drift slowly while it trembles quickly.
                const shakeDuration = scaleMotionDuration(DIALOGUE_SHAKE_DURATION, style?.shake_speed);
                const jitterDuration = scaleMotionDuration(DIALOGUE_JITTER_DURATION, style?.jitter_speed);
                const waveDuration = scaleMotionDuration(DIALOGUE_WAVE_DURATION, style?.wave_speed);
                // The phase offset is a *fraction* of the loop, so it slows down with
                // it. Leaving it alone would make a slowed wave ripple along the line
                // faster than each letter bobs, which reads as a glitch — the same
                // would go for a jitter or a shake spreading at a different rate than
                // it moves, so each takes its own step scaled with its own tempo.
                const wavePhaseStep = scaleMotionDuration(DIALOGUE_WAVE_PHASE_STEP, style?.wave_speed);
                const jitterPhaseStep = scaleMotionDuration(DIALOGUE_JITTER_PHASE_STEP, style?.jitter_speed);
                const shakePhaseStep = scaleMotionDuration(DIALOGUE_SHAKE_PHASE_STEP, style?.shake_speed);

                // Every movement runs per character, so they share one component:
                // the wave bobs, the jitter trembles inside that, and the shake
                // rattles the two of them together — each on its own element and
                // its own phase. See `MotionText` for why a space is not one of them.
                const content: ReactNode = wave > 0 || jitter > 0 || shake > 0
                    ? (
                        <MotionText
                            value={segment.value}
                            wave={wave}
                            jitter={jitter}
                            shake={shake}
                            waveDuration={waveDuration}
                            jitterDuration={jitterDuration}
                            shakeDuration={shakeDuration}
                            wavePhaseStep={wavePhaseStep}
                            jitterPhaseStep={jitterPhaseStep}
                            shakePhaseStep={shakePhaseStep}
                        />
                    )
                    : segment.value;

                return (
                    <span
                        key={index}
                        data-dialogue-token={token >= 0 ? token : undefined}
                        style={css}
                    >
                        {content}
                    </span>
                );
            })}
        </>
    );
}

export default DialogueTextRenderer;
