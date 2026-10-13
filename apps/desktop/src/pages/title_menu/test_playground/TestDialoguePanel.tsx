import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playSfx } from '../../../controllers/audioController';
import { fetchDialogue } from '../../../controllers/dialogueController';
import { useElementWidth } from '../../../hooks/useElementWidth';
import CommonButton from '../../../components/common/CommonButton';
import CommonInput from '../../../components/common/CommonInput';
import CommonSwitch from '../../../components/common/CommonSwitch';
import { DialogueView } from '../../../components/game/dialogue/DialogueView';
import {
    DIALOGUE_BOX_HEIGHT_ALLOWANCE_PX,
    DIALOGUE_SPRITE_MIN_HEIGHT_PX,
} from '../../../constants/DialogueConstants';
import type { DialogueSessionSnapshot } from '../../../hooks/useDialogueSession';
import type { StateChange, WorldStateInput } from '../../../types/WorldStateType';
import {
    OBJECTIVE_STATUSES,
    buildWorldStateInput,
    collectStateRequirements,
    createRequirementValues,
    type DialogueStateRequirement,
    type RequirementValues,
} from '../../../services/dialogueRequirementService';
import { relationshipStatePath } from '../../../services/state/worldStateService';

/**
 * Plays a dialogue for real, against the dialogue backend.
 *
 * It works in two steps, because a dialogue cannot be played without a state to
 * play it against and there is no way to guess one.
 *
 * 1. **Load** an id. The dialogue file is read and the values it gates on are
 *    worked out from its conditions — plus the items its effects move, because a
 *    dialogue that takes an item the player does not own cannot be played at all.
 *    Nothing else is offered, because nothing else would do anything.
 * 2. **Set those values**, then start. The defaults open every branch, so the
 *    interesting thing to do here is lower one and watch an option disappear.
 *
 * The session readout reports exactly what the backend returned — which node,
 * which options it considered visible, what it changed and what it warned about.
 */

/**
 * How narrow the panel has to be before its two halves stack.
 *
 * Measured, not taken from a breakpoint: `matchMedia` is evaluated against the
 * magnified viewport, so at 200% zoom a 1051px window still reports 1051px while
 * the panel is laid out on 525px — a `md:` rule would keep the halves side by side
 * on a surface that has no room for them.
 *
 * 720px is where the 280px column of variables stops leaving the stage enough
 * width for a readable cast. Below it each half takes the full width instead, the
 * variables on top and the stage underneath.
 */
const PANEL_STACK_MIN_WIDTH_PX = 720;

/** One editor, chosen by the shape of the value the dialogue compares against. */
function RequirementEditor({
    requirement,
    value,
    onChange,
}: {
    requirement: DialogueStateRequirement;
    value: string;
    onChange: (value: string) => void;
}) {
    // Where the dialogue reads it. Worth showing: it is the answer to "why is this
    // variable here at all".
    const usage = requirement.usage.join(', ');
    const frame = 'border-b-4 border-white/10 py-3';

    if (requirement.kind === 'boolean') {
        return (
            <CommonSwitch
                // `CommonSwitch` is uncontrolled, so the key forces it to pick up a
                // value that changed underneath it.
                key={`${requirement.path}-${value}`}
                title={requirement.path}
                description={usage}
                defaultChecked={value === 'true'}
                onChange={(checked) => onChange(checked ? 'true' : 'false')}
                showDescription
                containerClassName={`setting-line ${frame}`}
            />
        );
    }

    if (requirement.kind === 'objective_status') {
        return (
            <div className={frame}>
                <p className="settings-label">{requirement.path}</p>

                <div className="mt-1 flex flex-wrap gap-1">
                    {OBJECTIVE_STATUSES.map((status) => (
                        <button
                            key={status}
                            type="button"
                            aria-pressed={value === status}
                            onMouseEnter={() => void playSfx('hover')}
                            onClick={() => {
                                void playSfx('click');
                                onChange(status);
                            }}
                            className={`px-2 py-1 text-xs uppercase tracking-[0.15em] transition-colors duration-300 ease-out ${value === status
                                ? 'bg-white font-semibold text-galatime-dark'
                                : 'text-white/60 hover:bg-white/10 hover:text-white'
                                }`}
                        >
                            {status}
                        </button>
                    ))}
                </div>

                <p className="mt-1 text-xs leading-2.5 text-white/40">{usage}</p>
            </div>
        );
    }

    return (
        <CommonInput
            title={requirement.path}
            value={value}
            onChange={onChange}
            type={requirement.kind === 'number' ? 'number' : 'text'}
            containerClassName={frame}
        />
    );
}

/** One `label: value` line of the session readout. */
function DebugRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex gap-2">
            <dt className="w-28 shrink-0 text-white/40">{label}</dt>
            <dd className="min-w-0 wrap-break-word text-white/70">{value}</dd>
        </div>
    );
}

/** Where one affinity started a run, and where it stands now. */
interface RelationshipReading {
    /** Value the session was started with. */
    from: number;
    /** Value the conversation has left it at. */
    to: number;
}

/**
 * The relationships a run starts with, keyed by their dotted state path.
 *
 * Seeded from the state the panel is about to hand the engine, so an affinity
 * the dialogue gates on but never writes still reads as a value rather than
 * being absent from the readout.
 */
function seedRelationships(
    worldState: WorldStateInput | undefined,
): Record<string, RelationshipReading> {
    const readings: Record<string, RelationshipReading> = {};

    for (const [characterId, kinds] of Object.entries(worldState?.relationship ?? {})) {
        for (const [kind, value] of Object.entries(kinds)) {
            const path = relationshipStatePath(characterId, kind);
            readings[path] = { from: value, to: value };
        }
    }

    return readings;
}

/**
 * Folds one step's relationship changes into the running readings.
 *
 * `next` is the value after the change, not the delta, so reporting the same
 * step twice is a no-op instead of a double count — which is why the readings
 * are accumulated rather than summed from the deltas.
 *
 * A path nothing seeded is one the dialogue only *writes*: its change carries
 * the value it had before, and that is where the reading starts.
 */
function applyRelationshipChanges(
    readings: Record<string, RelationshipReading>,
    changes: StateChange[],
): Record<string, RelationshipReading> {
    let updated = readings;

    for (const change of changes) {
        if (change.kind !== 'relationship_changed') {
            continue;
        }

        const to = Number(change.next);

        if (!Number.isFinite(to) || updated[change.target]?.to === to) {
            continue;
        }

        const from = updated[change.target]?.from ?? Number(change.previous ?? 0);

        updated = { ...updated, [change.target]: { from, to } };
    }

    return updated;
}

export function TestDialoguePanel() {
    const { t } = useTranslation(['playground', 'dialogue']);
    const [dialogueId, setDialogueId] = useState('');
    const [error, setError] = useState<string | null>(null);

    /**
     * The panel itself, which decides whether its halves stack.
     *
     * The panel's own width is the right question — not the window's — because the
     * panel is already narrower than the window by a sidebar and two lots of
     * padding, and all of that shrinks again under the render scale.
     */
    const panelRef = useRef<HTMLDivElement>(null);
    const panelWidth = useElementWidth(panelRef);
    const isStacked = panelWidth !== null && panelWidth < PANEL_STACK_MIN_WIDTH_PX;
    /** The loaded dialogue and the values it gates on. `null` is step one. */
    const [loaded, setLoaded] = useState<{
        id: string;
        requirements: DialogueStateRequirement[];
    } | null>(null);
    const [values, setValues] = useState<RequirementValues>({});
    /** `key` forces a restart even when nothing else changed. */
    const [running, setRunning] = useState<{ id: string; key: number } | null>(null);
    const [snapshot, setSnapshot] = useState<DialogueSessionSnapshot | null>(null);

    /**
     * Every affinity the conversation has touched, keyed by dotted path.
     *
     * A response only carries the changes *this step* applied, so the readout
     * accumulates them here. That is also what keeps the final values on screen
     * once the session is over, when the response — and its `state_changes` —
     * are gone.
     */
    const [relationships, setRelationships] = useState<Record<string, RelationshipReading>>({});

    const response = snapshot?.response ?? null;
    const node = response?.current_node ?? null;

    // Rebuilt on every keystroke; `DialogueView` only reads it when a conversation
    // starts, so editing a value mid-conversation changes nothing until Start.
    const worldState = loaded ? buildWorldStateInput(loaded.requirements, values) : undefined;

    // Fold each step's changes in as they arrive. A status change re-renders the
    // same response, and re-applying an absolute value changes nothing, so the
    // repeat is harmless rather than something to guard against.
    useEffect(() => {
        const changes = snapshot?.response?.state_changes;

        if (changes && changes.length > 0) {
            setRelationships((previous) => applyRelationshipChanges(previous, changes));
        }
    }, [snapshot]);

    const handleLoad = async () => {
        const id = dialogueId.trim();

        if (!id) {
            void playSfx('denied');
            return;
        }

        // The loader keys dialogues by file name, not by the `dialogue_id` the file
        // declares, so this asks the question the engine will ask.
        const definition = await fetchDialogue(id);

        if (!definition) {
            void playSfx('denied');
            setError(t('playground.dialogue.notFound'));
            setLoaded(null);
            return;
        }

        // No click here: the `Load` button already plays one on pointer down. The
        // keyboard path plays its own in `handleKeyDown`.
        const requirements = collectStateRequirements(definition);

        setValues(createRequirementValues(requirements));
        setLoaded({ id, requirements });
        setError(null);
        setRunning(null);
        setSnapshot(null);
        setRelationships({});
    };

    // The `Change dialogue` and `Start` buttons play their own click; nothing here
    // may add a second one.
    const handleBack = () => {
        setLoaded(null);
        setRunning(null);
        setSnapshot(null);
        setError(null);
        setRelationships({});
    };

    const handleStart = () => {
        if (!loaded) {
            return;
        }

        // The readings start where the engine starts: the values this run is
        // about to be given, so an affinity left alone reads as itself rather
        // than as something the conversation never touched.
        setRelationships(seedRelationships(worldState));
        setSnapshot(null);
        setRunning((previous) => ({ id: loaded.id, key: (previous?.key ?? 0) + 1 }));
    };

    const handleKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter') {
            // Enter never reaches the button's pointer-down handler, so the sound
            // for the keyboard path is played here instead.
            void playSfx('click');
            void handleLoad();
        }
    };

    //region — Session readout
    const speakerDescription = node?.speaker_id
        ? `${node.speaker_id}${node.emotion ? `/${node.emotion}` : ''}`
        : t('dialogue.debug.none');

    // Who the dialogue has in the conversation, in the order they are standing.
    const castDescription = response
        ? response.cast_state.characters
            .map((character) => `${character.character_id}@${character.position}`)
            .join(', ') || t('dialogue.debug.none')
        : t('dialogue.debug.none');

    const choiceDescription = response
        ? response.available_choices
            .map((choice) => `${choice.choice_id} (${t(choice.enabled
                ? 'dialogue.debug.enabled'
                : 'dialogue.debug.locked')})`)
            .join(', ') || t('dialogue.debug.none')
        : t('dialogue.debug.none');

    const changeDescription = response
        ? response.state_changes
            .map((change) => `${change.target} ${change.delta !== undefined ? `${change.delta > 0 ? '+' : ''}${change.delta}` : String(change.next)}`)
            .join(', ') || t('dialogue.debug.none')
        : t('dialogue.debug.none');

    // Where every affinity stands, as the conversation has left it. One that
    // never moved reads as its value alone; one that did reads as it was, then
    // as it is.
    const relationshipDescription = Object.entries(relationships)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([path, reading]) => (
            reading.from === reading.to
                ? `${path}: ${reading.to}`
                : `${path}: ${reading.from} → ${reading.to}`
        ))
        .join(', ') || t('dialogue.debug.none');

    const warningDescription = response
        ? response.warnings
            .map((warning) => `${warning.code}${warning.path ? ` @ ${warning.path}` : ''}`)
            .join(', ') || t('dialogue.debug.none')
        : t('dialogue.debug.none');
    //endregion — Session readout

    //region — Render
    return (
        <div ref={panelRef} className="flex h-full min-h-0 flex-col gap-3">
            {loaded === null ? (
                /* Step one: the id, and nothing else. */
                <div
                    onKeyDown={handleKeyDown}
                    className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4"
                >
                    <div className="w-full max-w-md">
                        <CommonInput
                            title={t('playground.dialogue.inputTitle')}
                            value={dialogueId}
                            onChange={(value) => {
                                setDialogueId(value);
                                setError(null);
                            }}
                            placeholder={t('playground.dialogue.placeholder')}
                            maxCharacters={50}
                            showCounter
                        />
                    </div>

                    <CommonButton variant="primary" size="md" onPress={() => void handleLoad()}>
                        {t('playground.dialogue.load')}
                    </CommonButton>

                    {error && (
                        <p className="border-l-4 border-galatime-error pl-3 text-sm text-galatime-error">
                            {error}
                        </p>
                    )}
                </div>
            ) : (
                /* Step two: the values this dialogue gates on, and the stage. */
                <>
                    <header className="flex shrink-0 flex-wrap items-end justify-between gap-3 border-b border-white/10 pb-3">
                        <div className="min-w-0">
                            <p className="settings-label">{t('playground.dialogue.variables')}</p>
                            <p className="truncate font-mono text-sm text-white">{loaded.id}</p>
                            {/* The explanation is the first thing to go when the halves
                                stack: on a short screen it is worth more as stage. */}
                            {!isStacked && (
                                <p className="mt-1 max-w-lg text-xs leading-2.5 text-white/40">
                                    {t('playground.dialogue.variablesDescription')}
                                </p>
                            )}
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                            <CommonButton variant="ghost" size="sm" onPress={handleBack}>
                                {t('playground.dialogue.back')}
                            </CommonButton>
                            <CommonButton variant="primary" size="sm" onPress={handleStart}>
                                {t('playground.dialogue.start')}
                            </CommonButton>
                        </div>
                    </header>

                    {/*
                      Stacked, the two halves each take the full width: the variables on
                      top and the stage underneath. Side by side, the variables keep their
                      fixed column and the stage takes what is left.

                      The row is floored because a short viewport would otherwise give it
                      nothing at all: the header above it is `shrink-0` and wraps to
                      several lines on a narrow screen, so the space left for the halves
                      can reach zero and take the variables with it. This floor is what
                      keeps the variables column usable; the stage has its own, on
                      `DialogueView`.
                    */}
                    <div className={`flex min-h-[16rem] flex-1 gap-4 ${isStacked ? 'flex-col' : 'flex-row'}`}>
                        {/* Only the values the dialogue reads or moves — nothing else
                            would do anything, so nothing else is offered. Stacked, the
                            column is capped and scrolls on its own: left to size itself it
                            would take the stage's height with it and there would be
                            nothing left to look at. */}
                        <section
                            className={`min-h-0 overflow-y-auto pr-1 ${isStacked
                                ? 'max-h-[35%] w-full'
                                : 'w-56 shrink-0'
                                }`}
                        >
                            {loaded.requirements.length === 0 ? (
                                <p className="text-xs leading-2.5 text-white/40">
                                    {t('playground.dialogue.noVariables')}
                                </p>
                            ) : (
                                loaded.requirements.map((requirement) => (
                                    <RequirementEditor
                                        key={requirement.path}
                                        requirement={requirement}
                                        value={values[requirement.path] ?? ''}
                                        onChange={(value) => setValues((previous) => ({
                                            ...previous,
                                            [requirement.path]: value,
                                        }))}
                                    />
                                ))
                            )}
                        </section>

                        {/*
                          The floor of the dialogue surface, and the only place the
                          minimum character height is enforced.

                          It belongs on the whole surface, not on the stage.
                          `DialogueView` clips its own overflow, so a floor on the stage
                          would not push the panel into a scroll — it would push the box
                          out of the bottom of the clip, and a half-drawn line is the one
                          thing that must never happen. Flooring the surface instead
                          makes the *panel* taller than its section, and the section
                          scrolls.

                          The number is derived rather than written down so that changing
                          `DIALOGUE_SPRITE_MIN_HEIGHT_PX` cannot leave a floor too small to
                          honour it: the stage is what the characters stand on, so the
                          floor has to move with the minimum.
                        */}
                        <section
                            className="flex min-w-0 flex-1 flex-col"
                            style={{
                                minHeight: `${DIALOGUE_SPRITE_MIN_HEIGHT_PX + DIALOGUE_BOX_HEIGHT_ALLOWANCE_PX}px`,
                            }}
                        >
                            <DialogueView
                                dialogueId={running?.id ?? null}
                                sessionKey={running?.key}
                                worldState={worldState}
                                onSessionChange={setSnapshot}
                                onExit={() => setRunning(null)}
                                className="min-h-0 flex-1"
                                stageClassName="min-h-0"
                                idleContent={(
                                    <div className="absolute inset-0 flex items-center justify-center px-6">
                                        <p className="text-center text-sm leading-2.5 text-white/40">
                                            {t('playground.dialogue.idle')}
                                        </p>
                                    </div>
                                )}
                            />
                        </section>
                    </div>

                    {/* Session readout */}
                    <details className="max-h-44 shrink-0 overflow-y-auto border border-white/10 px-3 py-2">
                        <summary className="cursor-pointer text-xs uppercase tracking-[0.15em] text-white/60">
                            {t('dialogue.debug.title')}
                        </summary>

                        <dl className="mt-2 flex flex-col gap-1 font-mono text-xs leading-2.5">
                            <DebugRow label={t('dialogue.debug.node')} value={node ? `${node.id} (${node.type})` : t('dialogue.debug.none')} />
                            <DebugRow label={t('dialogue.debug.waitingFor')} value={node?.next_action ?? t('dialogue.debug.none')} />
                            <DebugRow label="auto_advance" value={String(node?.auto_advance ?? false)} />
                            <DebugRow label="status" value={snapshot?.status ?? 'idle'} />
                            <DebugRow label={t('dialogue.debug.speaker')} value={speakerDescription} />
                            <DebugRow label={t('dialogue.debug.cast')} value={castDescription} />
                            <DebugRow label={t('dialogue.debug.choices')} value={choiceDescription} />
                            <DebugRow label={t('dialogue.debug.changes')} value={changeDescription} />
                            <DebugRow label={t('dialogue.debug.relationships')} value={relationshipDescription} />
                            <DebugRow label={t('dialogue.debug.warnings')} value={warningDescription} />
                            {snapshot?.error && (
                                <DebugRow label="error" value={`${snapshot.error.code}: ${snapshot.error.message}`} />
                            )}
                        </dl>
                    </details>
                </>
            )}
        </div>
    );
    //endregion — Render
}
