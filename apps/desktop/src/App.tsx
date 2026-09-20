import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { SplashScreen } from './pages/SplashScreen';
import { TitleMenu } from './pages/title_menu/TitleMenu';
import { SettingsScreen } from './pages/title_menu/SettingsScreen';
import { CreditsScreen } from './pages/title_menu/CreditsScreen';

type Screen = 'splash' | 'title' | 'settings' | 'credits';

function App() {
  const [screen, setScreen] = useState<Screen>('splash');

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

  const currentScreen = {
    splash: <SplashScreen onComplete={() => setScreen('title')} />,
    title: <TitleMenu onSettings={() => setScreen('settings')} onCredits={() => setScreen('credits')} />,
    settings: <SettingsScreen onBack={() => setScreen('title')} />,
    credits: <CreditsScreen onBack={() => setScreen('title')} />
  }[screen];

  return (
    <div className="min-h-screen bg-galatime-dark font-custom text-white">
      <AnimatePresence mode="wait">
        <motion.div key={screen} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
          {currentScreen}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export default App;
