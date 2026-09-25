import i18next from 'i18next';
import { initReactI18next, setDefaults } from 'react-i18next';
import commonEn from './locales/en/common.json';
import gameEn from './locales/en/game.json';
import titleMenuEn from './locales/en/titleMenu.json';
import newGameEn from './locales/en/newGame.json';
import settingsEn from './locales/en/settings.json';
import dialogueEn from './locales/en/dialogue.json';
import playgroundEn from './locales/en/playground.json';
import creditsEn from './locales/en/credits.json';

const namespaces = ['common', 'game', 'titleMenu', 'newGame', 'settings', 'dialogue', 'playground', 'credits'] as const;

// `useTranslation(['a', 'b'])` only binds the first namespace unless `nsMode` is
// `'fallback'`. Without it, keys from the second namespace (e.g. `dialogue.debug.*`
// in the dialogue playground) render as the raw key.
setDefaults({ nsMode: 'fallback' });

// i18next configuration
i18next
  .use(initReactI18next)
  .init({
    lng: 'en',
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: [...namespaces],
    supportedLngs: ['en'],
    resources: {
      'en': {
        common: commonEn,
        game: gameEn,
        titleMenu: titleMenuEn,
        newGame: newGameEn,
        settings: settingsEn,
        dialogue: dialogueEn,
        playground: playgroundEn,
        credits: creditsEn,
      },
    },
    interpolation: {
      escapeValue: false, // React already handles XSS protection
    },
    react: {
      useSuspense: false, // Disable suspense for better control
    },
  });

export default i18next;
