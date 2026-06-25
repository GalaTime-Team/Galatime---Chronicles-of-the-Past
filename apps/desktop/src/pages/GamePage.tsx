import CommonsSelector from '../components/common/CommonSelector';
import CommonSwitch from '../components/common/CommonSwitch';
import CommonLoading from '../components/common/CommonLoading';
import { useTranslation } from 'react-i18next';
import CommonButton from '../components/common/CommonButton';

export function GamePage() {
  const { t } = useTranslation('common');

  const difficultyItems = [
    { 
      id: 'easy', 
      title: t('game.difficulty.easy.label'), 
      description: t('game.difficulty.easy.description') 
    },
    { 
      id: 'normal', 
      title: t('game.difficulty.normal.label'), 
      description: t('game.difficulty.normal.description') 
    },
    { 
      id: 'hard', 
      title: t('game.difficulty.hard.label'), 
      description: t('game.difficulty.hard.description') 
    },
  ];

  const handleDifficultyChange = (item: { id: string; title: string; description?: string }) => {
    console.log('Selected difficulty:', item.id);
  };

  const handleToggleTips = (isEnabled: boolean) => {
    console.log('Fighting Tool tip enabled:', isEnabled);
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
        <CommonsSelector
          title={t('game.difficulty.title')}
          items={difficultyItems}
          defaultId="normal"
          onChange={handleDifficultyChange}
        />
        <CommonSwitch
          title={t('game.settings.fightingTips.title')}
          description={t('game.settings.fightingTips.description')}
          defaultChecked={true}
          onChange={handleToggleTips}
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
            size="md"
            onPress={() => console.log('Danger button clicked')}
          >
            Danger Button
          </CommonButton>
          <CommonButton
            variant="success"
            size="md"
            onPress={() => console.log('Success button clicked')}
          >
            Success Button
          </CommonButton>
        </div>
      </div>

    </div>
  );
}
