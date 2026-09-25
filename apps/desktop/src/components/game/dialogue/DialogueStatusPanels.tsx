import { useTranslation } from 'react-i18next';
import type { DialogueError } from '../../../types/DialogueType';
import type { StateChange } from '../../../types/WorldStateType';
import { resolveResultLabelKey } from '../../../constants/DialogueConstants';
import CommonButton from '../../common/CommonButton';

/**
 * The panels that replace the dialogue box when there is no line to show: the
 * conversation is starting, it failed, or it is over.
 *
 * They deliberately use the same frame as the box — dark fill, white outline — so
 * the surface does not appear to jump when it swaps between them.
 */

/** Shared frame, so the three panels cannot drift apart. */
const PANEL_FRAME = 'w-full bg-galatime-dark outline-2 outline-white px-4 py-3';

/** The conversation is being loaded. */
export function DialogueLoadingPanel() {
    const { t } = useTranslation('dialogue');

    return (
        <div className={PANEL_FRAME}>
            <p className="text-sm leading-2.5 text-white/60">{t('dialogue.loading')}</p>
        </div>
    );
}

export interface DialogueErrorPanelProps {
    error: DialogueError;
    onDismiss: () => void;
}

/**
 * The last step failed.
 *
 * The message is looked up from the stable error code rather than shown raw, so
 * the player reads a sentence. The code itself stays on screen because this
 * surface is also the tool used to test the dialogue engine, and "which of the
 * fourteen failures was it" is the first thing anyone asks.
 */
export function DialogueErrorPanel({ error, onDismiss }: DialogueErrorPanelProps) {
    const { t } = useTranslation('dialogue');

    const message = t(`dialogue.error.${error.code}`, { defaultValue: '' })
        || t('dialogue.error.unknown');

    return (
        <div className={`${PANEL_FRAME} border-l-4 border-l-galatime-error`}>
            <p className="text-sm uppercase tracking-[0.15em] text-galatime-error">
                {t('dialogue.error.title')}
            </p>

            <p className="mt-2 text-sm leading-2.5 text-white">{message}</p>

            <p className="mt-1 text-xs leading-2.5 text-white/40">{error.code}</p>

            <div className="mt-3 flex justify-end">
                <CommonButton variant="ghost" size="sm" onPress={onDismiss}>
                    {t('dialogue.close')}
                </CommonButton>
            </div>
        </div>
    );
}

/**
 * The readable part of a dotted state path.
 *
 * The root only says which slice it is, so it is dropped. A relationship path
 * keeps both of its remaining segments — `relationship.pacci.friendship` reads
 * as `pacci · friendship` — because "+2 friendship" alone would not say to whom.
 */
function lastSegment(path: string): string {
    const [, ...rest] = path.split('.');

    return rest.filter(Boolean).join(' · ') || path;
}

/** `+2`, `-1`, `true` — the value side of a change, without inventing grammar. */
function formatValue(change: StateChange): string {
    const { next, delta } = change;

    if (typeof delta === 'number') {
        return `${delta > 0 ? '+' : ''}${delta}`;
    }

    return String(next);
}

export interface DialogueResultPanelProps {
    /** Outcome label authored on the `end` node, e.g. `good`. */
    result: string | null;
    /** Deltas the final step applied, for player-facing feedback. */
    changes: StateChange[];
    onClose: () => void;
}

/** The conversation reached an `end` node. */
export function DialogueResultPanel({ result, changes, onClose }: DialogueResultPanelProps) {
    const { t } = useTranslation('dialogue');

    return (
        <div className={`${PANEL_FRAME} border-l-4 border-l-galatime-accent`}>
            <p className="text-sm uppercase tracking-[0.15em] text-white/60">
                {t('dialogue.result.title')}
            </p>

            <p className="mt-2 text-lg uppercase tracking-widest text-white">
                {t(resolveResultLabelKey(result))}
            </p>

            {changes.length > 0 && (
                <>
                    <p className="mt-3 text-xs uppercase tracking-[0.15em] text-white/40">
                        {t('dialogue.changes.title')}
                    </p>

                    <ul className="mt-1">
                        {changes.map((change, index) => (
                            <li
                                key={`${change.kind}-${change.target}-${index}`}
                                className="flex items-baseline justify-between gap-4 text-sm leading-2.5"
                            >
                                <span className="text-white/60">{lastSegment(change.target)}</span>
                                <span className="text-galatime-accent">{formatValue(change)}</span>
                            </li>
                        ))}
                    </ul>
                </>
            )}

            <div className="mt-3 flex justify-end">
                <CommonButton variant="ghost" size="sm" onPress={onClose}>
                    {t('dialogue.close')}
                </CommonButton>
            </div>
        </div>
    );
}
