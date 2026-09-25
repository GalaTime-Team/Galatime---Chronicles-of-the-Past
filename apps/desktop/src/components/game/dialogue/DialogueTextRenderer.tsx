import { Fragment } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import type { DialogueSegment, DialogueTextStyle } from '../../../types/DialogueType';
import { playSfx } from '../../../controllers/audioController';
import { useGame } from '../../../context/GameContext';
import { splitSegmentWords } from '../../../services/dialogueTextService';
import {
    DIALOGUE_JITTER_DURATION,
    DIALOGUE_JITTER_INTENSITY,
    DIALOGUE_JITTER_TRANSITION,
    DIALOGUE_SHAKE_DURATION,
    DIALOGUE_SHAKE_INTENSITY,
    DIALOGUE_SHAKE_TRANSITION,
    DIALOGUE_WAVE_DURATION,
    DIALOGUE_WAVE_INTENSITY,
    DIALOGUE_WAVE_PHASE_STEP,
    DIALOGUE_WAVE_PHASE_STEPS,
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
 * One character per element, each bobbing up and down on its own phase.
 *
 * The phase comes from the character's place in the segment, so neighbours are
 * never in step and the line reads as a ripple instead of as the whole word
 * jumping. Characters are keyed by that same index, and the value is only ever
 * truncated from the end while a page types, so a character never changes phase
 * part-way through a line.
 *
 * **Words stay atomic.** Each word is one `inline-block`, so the browser can only
 * break the line between words; a break inside a word would be a visible defect
 * and would also make the hidden measuring mirror disagree with the visible text.
 *
 * Nothing here carries `data-dialogue-token`: a styled segment is one token to
 * the paginator, and handing it more elements than it counted makes it give up
 * and put the whole line on a single page.
 *
 * The tempo is handed in rather than read from the style: `duration` and
 * `phaseStep` scale together, so a slow wave still ripples across the line at the
 * same rate relative to its own bob.
 */
function WaveText({
    value,
    intensity,
    duration,
    phaseStep,
}: {
    value: string;
    intensity: number;
    duration: number;
    phaseStep: number;
}) {
    const keyframes = buildWaveKeyframes(intensity);

    // Split on the whitespace runs rather than on the words, so the spacing is
    // preserved exactly and the runs become the only places a line may break.
    const runs = value.split(/(\s+)/);

    // Mutated during render on purpose, like `tokenIndex` below: it is a local of
    // this render, so the phase always walks the segment in the same order.
    let characterIndex = -1;

    return (
        <>
            {runs.map((run, runIndex) => (
                <span key={runIndex} className="inline-block whitespace-nowrap">
                    {[...run].map((character) => {
                        characterIndex += 1;

                        return (
                            <motion.span
                                key={characterIndex}
                                className="inline-block"
                                animate={{ y: keyframes }}
                                transition={{
                                    ...DIALOGUE_WAVE_TRANSITION,
                                    duration,
                                    delay: (characterIndex % DIALOGUE_WAVE_PHASE_STEPS) * phaseStep,
                                }}
                            >
                                {character}
                            </motion.span>
                        );
                    })}
                </span>
            ))}
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

                const token = measureTokens ? nextToken() : -1;
                const css = toCss(segment.style);
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
                // faster than each letter bobs, which reads as a glitch.
                const wavePhaseStep = scaleMotionDuration(DIALOGUE_WAVE_PHASE_STEP, style?.wave_speed);

                // Each movement style owns its own layer, so a segment may ask for
                // all three at once instead of one winning: the wave runs per
                // character, the jitter trembles inside that, and the shake throws
                // the whole segment around the two of them. The offsets are on
                // separate elements, so they add up rather than overwrite.
                let content: ReactNode = wave > 0
                    ? (
                        <WaveText
                            value={segment.value}
                            intensity={wave}
                            duration={waveDuration}
                            phaseStep={wavePhaseStep}
                        />
                    )
                    : segment.value;

                // The jitter animates `left` and `top` on a relatively positioned
                // span, for the same reason the shake animates `left`: a CSS
                // transform does nothing on a non-replaced inline box, and an
                // `inline-block` — the other way to make one apply — would change
                // where the line breaks, so the mirror that measures the line would
                // no longer describe what the box draws.
                if (jitter > 0) {
                    const keyframes = buildJitterKeyframes(jitter);

                    content = (
                        <motion.span
                            style={{ position: 'relative', left: 0, top: 0 }}
                            animate={{ left: keyframes.left, top: keyframes.top }}
                            transition={{ ...DIALOGUE_JITTER_TRANSITION, duration: jitterDuration }}
                        >
                            {content}
                        </motion.span>
                    );
                }

                if (shake > 0) {
                    return (
                        <motion.span
                            key={index}
                            data-dialogue-token={token >= 0 ? token : undefined}
                            // The shake animates `left` on a relatively positioned span, not
                            // `x`. A CSS transform does nothing on a non-replaced inline box,
                            // which is what the segment is; and an `inline-block` — the other
                            // way to make a transform apply — would change where the line
                            // breaks, so the mirror that measures the line would no longer
                            // describe what the box draws. A relative offset moves the segment
                            // without touching layout, and the whole segment moves as one
                            // because it stays a single element.
                            style={{ ...css, position: 'relative', left: 0 }}
                            animate={{ left: buildShakeKeyframes(shake) }}
                            transition={{ ...DIALOGUE_SHAKE_TRANSITION, duration: shakeDuration }}
                        >
                            {content}
                        </motion.span>
                    );
                }

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
