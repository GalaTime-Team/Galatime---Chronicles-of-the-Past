import { useTranslation } from 'react-i18next';
import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence } from "framer-motion";

import {
	DEFAULT_MUSIC_TRACK_ID,
	MUSIC_TRACKS,
} from '../constants/AudioConstants';
import { DIFFICULTIES } from '../constants/DifficultyConstants';
import {
	playMusic,
	setAllVolumes,
	setChannelVolume,
	setMasterVolume,
	stopAllAudio,
} from '../controllers/audioController';
import { useGame } from '../context/GameContext';

import CommonSelector from '../components/common/CommonSelector';
import CommonSwitch from '../components/common/CommonSwitch';
import CommonLoading from '../components/common/CommonLoading';
import CommonButton from '../components/common/CommonButton';
import CommonInput from '../components/common/CommonInput';
import CommonSlider from '../components/common/CommonSlider';
import CommonPopupCard, { PopupMode } from '../components/common/CommonPopupCard';
import CombatHUD, { Weapon, Attack } from '../components/game/attack/CombatHUD';

export function GamePage() {
	const { t } = useTranslation('common');

	const { gameState, setGameState } = useGame();
	const audioUnlockPendingRef = useRef(false);

	const [title, setTitle] = useState(t('game.settings.saveFile.default'));
	const [needsAudioUnlock, setNeedsAudioUnlock] = useState(false);

	const [popup, setPopup] = useState<{
		visible: boolean;
		message: string;
		mode: PopupMode;
	}>({
		visible: false,
		message: '',
		mode: 'normal',
	});

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

	const updateAudioVolume = useCallback(
		(channel: 'master' | 'music' | 'sfx' | 'ambient', value: number) => {
			setGameState((prevState) => ({
				...prevState,
				settings: {
					...prevState.settings,
					audio: {
						...prevState.settings.audio,
						[channel]: value,
					},
				},
			}));

			if (channel === 'master') {
				setMasterVolume(value);
				return;
			}

			setChannelVolume(channel, value);
		},
		[setGameState]
	);

	const handleMusicChange = useCallback(
		(item: { id: string }) => {
			setGameState((prevState) => ({
				...prevState,
				settings: {
					...prevState.settings,
					currentMusicTrackId: item.id,
				},
			}));

			void playMusic(item.id, { restartIfSame: true });
		},
		[setGameState]
	);

	// ── Sample attacks (replace with gameState.attacks or a selector) ──
	const attacks: Attack[] = [
		{
			id: 'angel_attack',
			title: 'Angel Attack',
			elementId: 'lux',
			type: 'magical',
			power: 40,
			accuracy: 85,
			mana_cost: 50,
			stamina_cost: 0,
		},
		{
			id: 'magic_suck',
			title: 'Magic Suck',
			elementId: 'vis',
			type: 'physical',
			power: 20,
			accuracy: 95,
			mana_cost: 0,
			stamina_cost: 40,
		},
		{
			id: 'gas_minion',
			title: 'Gas Minion',
			elementId: 'florere',
			type: 'buff',
			power: 10,
			accuracy: 100,
			mana_cost: 40,
			stamina_cost: 10,
		},
		{
			id: 'dense_fog',
			title: 'Dense Fog',
			elementId: 'caeli',
			type: 'debuff',
			power: 0,
			accuracy: 75,
			mana_cost: 35,
			stamina_cost: 0,
		},
	];

	const weapon: Weapon = {
		id: 'iron-sword',
		name: 'Iron Sword',
	};

	const handleAttackClick = (attack: Attack) => {
		console.log('Attack selected:', attack);
		// TODO: dispatch to combat engine / API
	};

	const handleExtraMovementClick = (
		movement: 'defend' | 'weapon' | 'rest' | 'inventory'
	) => {
		console.log('Extra movement selected:', movement);
		// TODO: update game state or open inventory modal, etc.
	};

	// ── Derive stats from gameState (with fallbacks) ──
	const hp = {
		current: gameState.player?.hp.current ?? 800,
		max: gameState.player?.hp.max ?? 1000,
	};
	const mana = {
		current: gameState.player?.mana.current ?? 400,
		max: gameState.player?.mana.max ?? 600,
	};
	const stamina = {
		current: gameState.player?.stamina.current ?? 500,
		max: gameState.player?.stamina.max ?? 700,
	};

	useEffect(() => {
		setAllVolumes(gameState.settings.audio);
	}, [gameState.settings.audio]);

	useEffect(() => {
		const selectedTrackId = gameState.settings.currentMusicTrackId || DEFAULT_MUSIC_TRACK_ID;

		void playMusic(selectedTrackId).then((started) => {
			if (started) {
				setNeedsAudioUnlock(false);
				setPopup((prev) => ({ ...prev, visible: false }));
				return;
			}

			setNeedsAudioUnlock(true);
		});
	}, [gameState.settings.currentMusicTrackId]);

	useEffect(() => {
		return () => {
			stopAllAudio();
		};
	}, []);

	useEffect(() => {
		if (!needsAudioUnlock) {
			return;
		}

		const tryUnlock = () => {
			if (audioUnlockPendingRef.current) {
				return;
			}

			audioUnlockPendingRef.current = true;
			const selectedTrackId = gameState.settings.currentMusicTrackId || DEFAULT_MUSIC_TRACK_ID;

			void playMusic(selectedTrackId).then((started) => {
				audioUnlockPendingRef.current = false;

				if (!started) {
					return;
				}

				setNeedsAudioUnlock(false);
				setPopup((prev) => ({ ...prev, visible: false }));
			});
		};

		document.addEventListener('pointerdown', tryUnlock);
		document.addEventListener('keydown', tryUnlock);

		return () => {
			document.removeEventListener('pointerdown', tryUnlock);
			document.removeEventListener('keydown', tryUnlock);
		};
	}, [gameState.settings.currentMusicTrackId, needsAudioUnlock]);

	const handlePopupClose = useCallback(() => {
		setPopup((prev) => ({ ...prev, visible: false }));
	}, []);

	const handlePopupClick = () => {
		handlePopupClose();
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
				<CommonLoading
					imageClassName="h-5"
				/>

				<CommonInput
					title={t('game.settings.saveFile.title')}
					value={title}
					onChange={handleTitleChange}
					placeholder={t('game.settings.saveFile.placeholder')}
					orientation="vertical"
					maxCharacters={20}
					showDescription={false}
				/>

				<CommonSelector
					title={t('game.settings.difficulty.title')}
					items={Object.values(DIFFICULTIES)}
					defaultId={gameState.settings.difficulty}
					onChange={handleDifficultyChange} orientation="horizontal"
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

				<CommonSlider
					title="Master Volume"
					min={0}
					max={100}
					value={gameState.settings.audio.master}
					onChange={(value) => updateAudioVolume('master', value)}
					className="max-w-xl"
					sliderContainerClassName="w-28"
				/>

				<CommonSlider
					title="Music Volume"
					min={0}
					max={100}
					value={gameState.settings.audio.music}
					onChange={(value) => updateAudioVolume('music', value)}
					className="max-w-xl"
					sliderContainerClassName="w-28"
				/>

				<CommonSlider
					title="SFX Volume"
					min={0}
					max={100}
					value={gameState.settings.audio.sfx}
					onChange={(value) => updateAudioVolume('sfx', value)}
					className="max-w-xl"
					sliderContainerClassName="w-28"
				/>

				<CommonSlider
					title="Ambient Volume"
					min={0}
					max={100}
					value={gameState.settings.audio.ambient}
					onChange={(value) => updateAudioVolume('ambient', value)}
					className="max-w-xl"
					sliderContainerClassName="w-28"
				/>

				<CommonSelector
					title="Music Track"
					items={MUSIC_TRACKS}
					defaultId={gameState.settings.currentMusicTrackId}
					onChange={handleMusicChange}
					orientation="horizontal"
					showDescription={false}
					containerClassName="max-w-xl"
				/>
				
				<div className="flex flex-row gap-6">
					<CommonButton
						variant="primary"
						size="md"
					>
						Primary Button
					</CommonButton>


					<CommonButton
						variant="outline"
						size="md"
					>
						Outline Button
					</CommonButton>

					<CommonButton
						variant="danger"
						size="lg"
					>
						Danger Button
					</CommonButton>

					<CommonButton
						variant="success"
						size="sm"
					>
						Success Button
					</CommonButton>
				</div>

				<CombatHUD
					hp={hp}
					mana={mana}
					stamina={stamina}
					attacks={attacks}
					weapon={weapon}
					onAttackClick={handleAttackClick}
					onExtraMovementClick={handleExtraMovementClick}
					gridConfig={{ columns: 2, rows: 2 }}
				/>
			</div>

			<AnimatePresence>
				<CommonPopupCard
					isOpen={popup.visible}
					message={popup.message}
					mode={popup.mode}
					onClose={handlePopupClose}
					onClick={handlePopupClick}
				/>
			</AnimatePresence>

		</div>
	);
}