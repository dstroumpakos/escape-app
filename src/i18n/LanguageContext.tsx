import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations, Language } from './translations';

const LANGUAGE_KEY = '@unlocked_language';
const CONVEX_URL = 'https://resilient-crocodile-943.convex.cloud';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'el',
  setLanguage: () => {},
  t: (key) => key,
});

/** Fire-and-forget language sync to Convex DB */
async function syncLanguageToDB(lang: Language) {
  try {
    const userId = await AsyncStorage.getItem('userId');
    if (!userId) return;
    await fetch(`${CONVEX_URL}/updateLanguage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, language: lang }),
    });
  } catch {
    // silent – best-effort sync
  }
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('el');

  // Load saved language on mount and sync to DB
  React.useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY).then((saved) => {
      if (saved === 'en' || saved === 'el') {
        setLanguageState(saved);
        syncLanguageToDB(saved);
      } else {
        syncLanguageToDB('el');
      }
    });
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    AsyncStorage.setItem(LANGUAGE_KEY, lang);
    syncLanguageToDB(lang);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      let text = translations[language][key] ?? translations.en[key] ?? key;
      if (params) {
        Object.entries(params).forEach(([k, v]) => {
          text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
        });
      }
      return text;
    },
    [language],
  );

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useTranslation = () => useContext(LanguageContext);
export default LanguageContext;
