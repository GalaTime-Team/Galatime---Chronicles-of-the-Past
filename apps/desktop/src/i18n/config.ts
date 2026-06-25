import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import commonEn from './locales/en-US/common.json';

// i18next configuration
i18next
  .use(initReactI18next)
  .init({
    lng: 'en-US',
    fallbackLng: 'en-US',
    defaultNS: 'common',
    ns: ['common'],
    supportedLngs: ['en-US'],
    resources: {
      'en-US': {
        common: commonEn,
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
