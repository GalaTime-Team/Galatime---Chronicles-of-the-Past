/**
 * Tunables of the dialogue presentation layer.
 *
 * Kept apart from `AnimationConstants` (page and splash transitions) because the
 * dialogue has its own vocabulary: how fast a line types out, how long the text
 * box holds, where a character stands and how a line's outcome is labelled.
 *
 * Nothing here decides narrative: these values only shape how the response the
 * backend already produced is drawn.
 */

/** Milliseconds per character before a segment's own `speed_multiplier` is applied. */
export const DIALOGUE_DEFAULT_TEXT_SPEED = 30;

/**
 * Rows of text the box shows before a line is paginated.
 *
 * The height of a row is not a constant here. The spoken line scales with the
 * window — `--dialogue-text-size` / `--dialogue-line-height` in `globals.css` —
 * because a fixed 32px row was the smallest thing on screen at a large
 * proportion. The box is still exactly `maxRows` of those rows tall, and the
 * hidden measuring mirror reads the same two variables, so pagination stays in
 * step with the render.
 */
export const DIALOGUE_DEFAULT_MAX_ROWS = 2;

/**
 * Extra hold (in milliseconds) added after a punctuation mark, on top of the
 * per-character delay, so a sentence breathes without the author writing a
 * `pause` segment. Deliberately a small table: only marks that end or split a
 * clause earn a hold.
 */
export const DIALOGUE_PUNCTUATION_HOLDS: Record<string, number> = {
    ',': 90,
    ';': 120,
    ':': 120,
    '.': 200,
    '!': 200,
    '?': 200,
    '…': 260,
    '—': 140,
};

/**
 * Most characters the stage draws at once.
 *
 * A conversation is free to bring more than this in — somebody arrives while a
 * group is already talking — so the stage is a fixed-size cast it has to choose
 * from, rather than a list it grows to fit. `dialogueCastService` decides which
 * of them are drawn.
 *
 * This is the **ceiling**, not the count: a narrow stage shows fewer (see
 * `DIALOGUE_SPRITE_MIN_HEIGHT_PX`), because a sprite is sized by *width* and four
 * of them on a phone's stage would each come out too small to read. The slot and
 * sprite-width tables below carry an entry for every cast size from 1 to this,
 * which is what makes lowering the count safe.
 */
export const DIALOGUE_MAX_VISIBLE_CHARACTERS = 4;

/**
 * The shortest a drawn character may be, in layout pixels.
 *
 * A character is sized by *width* — the stage spreads its cast evenly, so a stage
 * `W` wide holding `N` of them gives each roughly `W / N` — and the sprite's own
 * 5:6 ratio turns that width into a height. On a narrow stage those two facts
 * compound: a phone's stage gives a character so little width that it comes out
 * short as well as narrow, which is the size that reads as "too small".
 *
 * So this is what the cast count exists to protect. `dialogueCastService` keeps
 * the largest cast whose sprites still reach this height and leaves characters out
 * when they cannot, which is what gives the ones who remain the width — and so the
 * height — to be drawn properly.
 *
 * The other half of the guarantee is the surface's floor: the panel that hosts the
 * stage is floored at this height plus `DIALOGUE_BOX_HEIGHT_ALLOWANCE_PX`, so the
 * stage is always tall enough to honour it and the count only has to work out how
 * many fit *across*.
 */
export const DIALOGUE_SPRITE_MIN_HEIGHT_PX = 220;

/**
 * How much taller a sprite is than it is wide.
 *
 * The `tsp` art is 250x300, so a character drawn `w` wide stands `w * 6/5` tall.
 * This mirrors the `aspect-[5/6]` in `DIALOGUE_SPRITE_BOX_CLASS`: the class is what
 * the browser applies, this is what the cast count reasons about, and the two have
 * to agree or a sprite would not reach the height its count was chosen for.
 */
export const DIALOGUE_SPRITE_HEIGHT_TO_WIDTH = 6 / 5;

/**
 * Room the dialogue box takes at the bottom of a dialogue surface, in layout px.
 *
 * The name plate (`text-2xl` at `leading-none`), two rows of `--dialogue-text-size`
 * at the bottom of its clamp, the `>>` strip's `pb-6` and the wrapper's `pb-4` come
 * to roughly this. An allowance rather than a measurement: the box's real height
 * follows the window's typography, and this is only ever used to size a floor, so
 * being a few pixels generous costs a few pixels of scroll and nothing else.
 */
export const DIALOGUE_BOX_HEIGHT_ALLOWANCE_PX = 170;

/**
 * Horizontal centre of each slot, as a percentage of the stage width, per cast size.
 *
 * The slots come from how many characters are actually on stage, not from the
 * authored `position`. A dialogue can only ever name three positions, so four
 * characters have nowhere to stand if the positions are taken literally; and two
 * characters both authored `right` still have to go somewhere. The authored
 * position decides the left-to-right *order*, so a `left` character still ends up
 * to the left of a `right` one.
 *
 * **The slots are pulled towards the middle on purpose.** They used to be spread
 * out to the edges, which left each sprite a narrow column and made it shrink on
 * any stage that was not wide — the sprite is sized by *width*, so the gap
 * between two neighbours was the thing capping its size. Trading some of that gap
 * back is what lets a sprite grow, and a slight overlap costs nothing visually
 * because the `tsp` art is a character on a transparent canvas.
 *
 * Each entry is a centre, paired with `-translate-x-1/2`. The outermost centres
 * are kept at least half a sprite in from the edge (`16 - 28/2 = 2%`), so no
 * sprite is ever clipped by the stage.
 *
 * **The centres and `DIALOGUE_SPRITE_LAYOUT` are one decision.** Pulling a slot
 * towards the middle is only worth doing if the sprite then grows to use the room,
 * and a sprite wider than the gap between two neighbours is exactly the overlap
 * being traded for — so the two tables are read together, never tuned separately.
 */
export const DIALOGUE_SLOT_CENTRES: Record<number, number[]> = {
    1: [50],
    2: [27, 73],
    3: [21, 50, 79],
    4: [16, 39, 61, 84],
};

/**
 * How wide a sprite is drawn, per cast size: the Tailwind class the stage applies,
 * and the same number as a fraction.
 *
 * The two are one row on purpose. The class has to be a literal in the source for
 * Tailwind to generate it, and the fraction is what `resolveVisibleCharacterCap`
 * divides the stage by when it works out how many characters fit. Kept apart they
 * would drift, and the drift would show up as a sprite that never reaches the
 * height its own count was chosen for.
 *
 * Sized by width rather than by height, because the stage's real constraint is
 * horizontal: sprites as wide as they are tall would overlap the moment four of
 * them share the stage.
 *
 * **A small cast is where these numbers do the work.** They are as wide as the slot
 * allows rather than as narrow as they can be — a sprite only ever *shrinks* from
 * here, since a short stage clamps it by height, so every percent given away is one
 * it never gets back. One character on a phone's stage takes 60% of it, while the
 * same stage showing four gives each of them 28%; that gap is the whole reason the
 * count drops as the stage narrows.
 */
export const DIALOGUE_SPRITE_LAYOUT: Record<number, { widthClass: string; widthFraction: number }> = {
    1: { widthClass: 'w-[65%]', widthFraction: 0.65 },
    2: { widthClass: 'w-[50%]', widthFraction: 0.5 },
    3: { widthClass: 'w-[34%]', widthFraction: 0.34 },
    4: { widthClass: 'w-[28%]', widthFraction: 0.28 },
};

/**
 * Filter applied to every character who is not the one speaking.
 *
 * A dimmed sprite keeps its silhouette but stops competing with the line being
 * read, which is what makes the speaker legible without a pointer or an arrow.
 */
export const DIALOGUE_CHARACTER_DIM_CLASS = 'brightness-[0.45] saturate-[0.55]';

/** Filter applied to the speaking character, so switching speakers is symmetric. */
export const DIALOGUE_CHARACTER_ACTIVE_CLASS = 'brightness-100 saturate-100';

/**
 * The sprite's box: the artwork's own 5:6 ratio, never taller than the stage.
 *
 * The `tsp` art is 250x300, so the ratio lets the sprite fill the box exactly
 * instead of being letterboxed inside it. `max-h-full` stops a short stage from
 * pushing the sprite off the top; the width comes from `DIALOGUE_SPRITE_LAYOUT`,
 * and the ratio here is the one `DIALOGUE_SPRITE_HEIGHT_TO_WIDTH` states as a
 * number.
 */
export const DIALOGUE_SPRITE_BOX_CLASS = 'aspect-[5/6] max-h-full';

/** Opacity of the placeholder drawn for a character that has no sprites at all. */
export const DIALOGUE_MISSING_SPRITE_OPACITY = 0.25;

/**
 * How long a page is held after it finishes appearing before an `auto_advance`
 * line turns it or moves on.
 *
 * The text types out at its normal pace; this is the pause that follows, so the
 * player still has time to read before the line leaves without being asked.
 * Only ever used by nodes the author marked `auto_advance`.
 */
export const DIALOGUE_AUTO_ADVANCE_HOLD_MS = 900;

/**
 * How long the result panel is held after an `auto_advance` line ran the
 * conversation into its ending, before the surface closes itself.
 *
 * Longer than the per-page hold on purpose: the panel is the only place the
 * step's `state_changes` are shown, and a cutscene should not flash past them.
 */
export const DIALOGUE_AUTO_CLOSE_HOLD_MS = 1600;

/** Gap between the last choice option and the top edge of the dialogue box. */
export const DIALOGUE_CHOICE_STACK_GAP_CLASS = 'gap-2';

/**
 * i18n key per `result` label the backend reports on an `end` node.
 *
 * The outcome is authored (`good`, `neutral`, `bad`, …), so an unknown label is
 * expected rather than a bug: it resolves to the generic key instead of showing
 * a raw identifier to the player.
 */
export const DIALOGUE_RESULT_LABEL_KEYS: Record<string, string> = {
    good: 'dialogue.result.good',
    neutral: 'dialogue.result.neutral',
    bad: 'dialogue.result.bad',
};

/** Used for any outcome the table above does not name. */
export const DIALOGUE_RESULT_FALLBACK_KEY = 'dialogue.result.unknown';

/** i18n key naming a dialogue outcome, never `undefined`. */
export function resolveResultLabelKey(result: string | null): string {
    if (!result) {
        return DIALOGUE_RESULT_FALLBACK_KEY;
    }

    return DIALOGUE_RESULT_LABEL_KEYS[result] ?? DIALOGUE_RESULT_FALLBACK_KEY;
}
