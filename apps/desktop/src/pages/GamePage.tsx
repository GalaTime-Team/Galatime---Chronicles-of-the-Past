import { useTranslation } from 'react-i18next';
import { useRef, useState } from 'react';

import { DIFFICULTIES } from '../constants/DifficultyConstants';

import CommonsSelector from '../components/common/CommonSelector';
import CommonSwitch from '../components/common/CommonSwitch';
import CommonLoading from '../components/common/CommonLoading';
import CommonButton from '../components/common/CommonButton';
import AttackCard, { Attack } from '../components/game/AttackCard';
import { useGame } from '../context/GameContext';
import CommonInput from '../components/common/CommonInput';
import ExtraMovementCard from '../components/game/ExtraMovementCard';
import CombatStatsBar, { type CombatStatsBarRef } from '../components/game/CombatStatsBar';

export function GamePage() {
	const { t } = useTranslation('common');

	const { gameState, setGameState } = useGame();

	const [title, setTitle] = useState(t('game.settings.saveFile.default'));

	const fireBallAttack: Attack = {
		id: 'fireball_001',
		title: 'Fire Ball',
		elementId: 'ignis',
		type: 'magical',
		power: 10,
		accuracy: 90,
		mana_cost: 20,
		stamina_cost: 0,
	};

	const darknessAttack: Attack = {
		id: 'darkness_001',
		title: 'Darkness',
		elementId: 'umbra',
		type: 'buff',
		power: 0,
		accuracy: 100,
		mana_cost: 30,
		stamina_cost: 0,
	};

	const [hp, setHp] = useState(100);
	const maxHp = 100;
	const hpBarRef = useRef<CombatStatsBarRef>(null);
	const [previewDeplete, setPreviewDeplete] = useState(0);
	const [previewRestore, setPreviewRestore] = useState(0);

	const applyDeplete = (amount: number, animate: boolean) => {
		if (animate) {
			hpBarRef.current?.deplete(amount);
		}
		setHp((prev) => Math.max(0, prev - amount));

	};

	const applyRestore = (amount: number, animate: boolean) => {
		if (animate) {
			hpBarRef.current?.restore(amount);
		}
		setHp((prev) => Math.min(maxHp, prev + amount));

	};

	const handleTitleChange = (value: string) => {
		setTitle(value);
	};

	const handleDifficultyChange = (item: { id: string }) => {
		setGameState((prevState) => ({
			...prevState,
			settings: {
				...prevState.settings,
				difficulty: item.id as keyof typeof DIFFICULTIES,
			},
		}));
	};

	const handleToggleTips = (isEnabled: boolean) => {
		setGameState((prevState) => ({
			...prevState,
			settings: {
				...prevState.settings,
				fightingTooltipVisible: isEnabled,
			},
		}));
	};

	const handleAttackClick = (attack: Attack) => {
		console.log(`Attack clicked: ${attack.title}`);
	};

	return (
		<div className="min-h-screen bg-gradient-to-br from-galatime-dark via-galatime-primary/20 to-galatime-accent/30 px-6 py-8">
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
				<header className="rounded-2xl border border-galatime-primary/30 bg-black/30 p-6 shadow-2xl shadow-galatime-dark/40">
					<p className="text-xs uppercase tracking-[0.3em] text-galatime-primary/80">{t('game.header.tagline')}</p>
					<h1 className="mt-2 text-3xl font-bold text-white">{t('game.header.title')}</h1>
					<p className="mt-2 text-galatime-accent/80">{t('game.header.subtitle')}</p>
				</header>
			</div>

			<div className="flex flex-col gap-6 items-center">
				<CommonLoading />

				<CommonInput
					title={t('game.settings.saveFile.title')}
					value={title}
					onChange={handleTitleChange}
					placeholder={t('game.settings.saveFile.placeholder')}
					orientation="vertical"
					maxCharacters={20}
					showDescription={false}
				/>

				<CommonsSelector
					title={t('game.settings.difficulty.title')}
					items={Object.values(DIFFICULTIES)}
					defaultId={gameState.settings.difficulty}
					onChange={handleDifficultyChange}
					orientation="horizontal"
					showDescription={true}
					containerClassName="max-w-xl"
				/>

				<CommonSwitch
					title={t('game.settings.fightingTips.title')}
					description={t('game.settings.fightingTips.description')}
					defaultChecked={gameState.settings.fightingTooltipVisible}
					onChange={handleToggleTips}
					orientation="vertical"
					showDescription={true}
				/>

				<div className="flex flex-row gap-6">
					<div
						onMouseEnter={() => setPreviewDeplete(5)}
						onMouseLeave={() => setPreviewDeplete(0)}
					>
						<CommonButton
							variant="primary"
							size="md"
							onPress={() => applyDeplete(5, false)}
						>
							-5 HP w/out animation
						</CommonButton>
					</div>


					<div
						onMouseEnter={() => setPreviewRestore(5)}
						onMouseLeave={() => setPreviewRestore(0)}
					>
						<CommonButton
							variant="outline"
							size="md"
							onPress={() => applyRestore(5, false)}
						>
							+5 HP w/out animation
						</CommonButton>
					</div>

					<CommonButton
						variant="danger"
						size="lg"
						onPress={() => applyDeplete(5, true)}
					>
						-5 HP w/ animation
					</CommonButton>

					<CommonButton
						variant="success"
						size="sm"
						onPress={() => applyRestore(5, true)}
					>
						+5 HP w/ animation
					</CommonButton>
				</div>

				<CombatStatsBar
					ref={hpBarRef}
					title='HP'
					showTitle
					current={hp}
					max={maxHp}
					orientation="ltr"
					className="w-full max-w-2xl"
					previewDeplete={previewDeplete}
					previewRestore={previewRestore}
				/>

				<CombatStatsBar
					ref={hpBarRef}
					title="MN"
					showTitle
					current={hp}
					max={maxHp}
					orientation="rtl"
					className="w-full max-w-2xl"
					healthClass="bg-gradient-to-r from-galatime-stats-manaFrom to-galatime-stats-manaTo"
					previewDepleteClass="bg-galatime-dark/60"
					previewRestoreClass="bg-galatime-stats-manaTo/60"
					previewDeplete={previewDeplete}
					previewRestore={previewRestore}
					depleteClass=""
					restoreClass=""
				/>

				<CombatStatsBar
					ref={hpBarRef}
					title="SN"
					showTitle
					current={hp}
					max={maxHp}
					orientation="ltr"
					className="h-full max-h-2xl"
					healthClass="bg-galatime-stats-stamina"
					previewDepleteClass="bg-galatime-dark/60"
					previewRestoreClass="bg-galatime-stats-stamina/60"
					previewDeplete={previewDeplete}
					previewRestore={previewRestore}
					depleteClass=""
					restoreClass=""
				/>

				<AttackCard
					attack={fireBallAttack}
					onClick={handleAttackClick}
				/>
				<AttackCard
					attack={darknessAttack}
					onClick={handleAttackClick}
				/>

				<div className="flex flex-row gap-2">
					<ExtraMovementCard
						iconPath="/images/elements/extra/defend.svg"
						title="Defend"
						onClick={() => console.log('Defend clicked')}
					/>
					<ExtraMovementCard
						iconPath="/images/elements/extra/weapon.svg"
						title="Weapon"
						onClick={() => console.log('Weapon clicked')}
					/>
					<ExtraMovementCard
						iconPath="/images/elements/extra/rest.svg"
						title="Rest"
						onClick={() => console.log('Rest clicked')}
					/>
					<ExtraMovementCard
						iconPath="/images/elements/extra/inventory.svg"
						title="Inventory"
						onClick={() => console.log('Inventory clicked')}
					/>
				</div>

			</div>

		</div>
	);
}
