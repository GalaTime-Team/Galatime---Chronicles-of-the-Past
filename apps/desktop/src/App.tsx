import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SplashScreen } from './pages/SplashScreen';
import { TitleMenu } from './pages/title_menu/TitleMenu';
import { SettingsScreen } from './pages/title_menu/SettingsScreen';
import { CreditsScreen } from './pages/title_menu/CreditsScreen';
import { NewGameScreen } from './pages/title_menu/NewGameScreen';
import { TitleMenuLayout } from './pages/title_menu/layout';
import { NowPlayingCard } from './components/common/NowPlayingCard';
import { useControlListener, useGame } from './context/GameContext';

type Screen = 'splash' | 'title' | 'newGame' | 'settings' | 'credits';

function App() {
  const [screen, setScreen] = useState<Screen>('splash');
  const { setGameState } = useGame();

  // The fullscreen shortcut is offered wherever the game is: it is a display setting like the
  // one in Settings, so it goes through the same state and is applied/persisted from there.
  // Fullscreen is a native window mode, which is why leaving it is only possible here — `deny`
  // (Escape) reaches the screen behind without the window reacting to it.
  useControlListener({
    fullscreen: () =>
      setGameState((previous) => ({
        ...previous,
        settings: {
          ...previous.settings,
          display: { ...previous.settings.display, fullscreen: !previous.settings.display.fullscreen },
        },
      })),
  });

  useEffect(() => {
    if (import.meta.env.DEV) return;

    const blockKeys = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const blockedShortcut = event.key === 'F5' || event.key === 'F12' || ((event.ctrlKey || event.metaKey) && ['r', 'i', 'u', 'j', 'c', 'g'].includes(key));
      if (blockedShortcut) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const blockContextMenu = (event: MouseEvent) => event.preventDefault();
    const beforeUnloadHandler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };

    document.addEventListener('keydown', blockKeys, { capture: true });
    document.addEventListener('contextmenu', blockContextMenu, { capture: true });
    window.addEventListener('beforeunload', beforeUnloadHandler);
    return () => {
      document.removeEventListener('keydown', blockKeys, { capture: true });
      document.removeEventListener('contextmenu', blockContextMenu, { capture: true });
      window.removeEventListener('beforeunload', beforeUnloadHandler);
    };
  }, []);

  const titleScreens = {
    title: <TitleMenu key="title" onNewGame={() => setScreen('newGame')} onSettings={() => setScreen('settings')} onCredits={() => setScreen('credits')} />,
    newGame: <NewGameScreen key="newGame" onBack={() => setScreen('title')} />,
    settings: <SettingsScreen key="settings" onBack={() => setScreen('title')} />,
    credits: <CreditsScreen key="credits" onBack={() => setScreen('title')} />
  };

  // During exit transitions the previous screen keeps rendering, so fall back to the title menu.
  const currentScreen =
    screen === 'splash' ? (
      <SplashScreen onComplete={() => setScreen('title')} />
    ) : (
      <TitleMenuLayout>
        {/* Keyed by screen so TitleMenu, Settings and Credits really swap: the leaving page fades
            out completely (`mode="wait"`) before the next one fades in. The layout itself is not
            re-keyed, so the background and the particles survive the transition untouched. */}
        <AnimatePresence mode="wait">{titleScreens[screen] ?? titleScreens.title}</AnimatePresence>
      </TitleMenuLayout>
    );

  return (
    <div className="min-h-screen bg-galatime-background font-custom text-white">
      {/* Opt-in "now playing" card: lives at the root so it survives every screen change. */}
      <NowPlayingCard />
      <AnimatePresence mode="wait">
        <motion.div key={screen === 'splash' ? 'splash' : 'menu'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
          {currentScreen}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default App;
