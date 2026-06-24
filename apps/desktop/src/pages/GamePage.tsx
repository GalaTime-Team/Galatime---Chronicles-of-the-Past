import CommonsSelector from '../components/common/CommonSelector';
import CommonSwitch from '../components/common/CommonSwitch';

export function GamePage() {

  const difficultyItems = [
    { id: 'easy', title: 'Easy', description: 'For those who want to relax.' },
    { id: 'normal', title: 'Normal', description: 'The standard experience.' },
    { id: 'hard', title: 'Hard', description: 'A true challenge awaits.' },
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
          <p className="text-xs uppercase tracking-[0.3em] text-galatime-primary/80">GalaTime</p>
          <h1 className="mt-2 text-3xl font-bold text-white">Chronicles of the Past</h1>
          <p className="mt-2 text-galatime-accent/80">Tailwind CSS + Tauri</p>
        </header>
      </div>

      <div className="flex flex-col gap-6">
        <CommonsSelector
          title="Difficulty"
          items={difficultyItems}
          defaultId="normal"
          onChange={handleDifficultyChange}
        />
        <CommonSwitch
          title="Fighting Tool tip"
          description="Display details about attacks."
          defaultChecked={true}
          onChange={handleToggleTips}
        />
      </div>

    </div>
  );
}
