import { useTranslation } from 'react-i18next';
import { useState } from 'react';

import { DIFFICULTIES } from '../constants/DifficultyConstants';

import CommonsSelector from '../components/common/CommonSelector';
import CommonSwitch from '../components/common/CommonSwitch';
import CommonLoading from '../components/common/CommonLoading';
import CommonButton from '../components/common/CommonButton';
import AttackCard, { Attack } from '../components/game/AttackCard';
import { useGame } from '../context/GameContext';
import CommonInput from '../components/common/CommonInput';
import ExtraMovementCard from '../components/game/ExtraMovementCard';

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
					<CommonButton
						variant="primary"
						size="md"
						onPress={() => console.log('Primary button clicked')}
					>
						Primary Button
					</CommonButton>
					<CommonButton
						variant="outline"
						size="md"
						onPress={() => console.log('Outline button clicked')}
					>
						Outline Button
					</CommonButton>
					<CommonButton
						variant="danger"
						size="lg"
						onPress={() => console.log('Danger button clicked')}
					>
						Danger Button
					</CommonButton>
					<CommonButton
						variant="success"
						size="sm"
						onPress={() => console.log('Success button clicked')}
					>
						Success Button
					</CommonButton>
				</div>

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
