import en from './en.json';
import de from './de.json';
import es from './es.json';
import ro from './ro.json';

export type Locale = 'en' | 'de' | 'es' | 'ro';

const translations: Record<Locale, typeof en> = { en, de: de as typeof en, es: es as typeof en, ro: ro as typeof en };

export function t(locale: Locale, key: string): any {
  const keys = key.split('.');
  let val: any = translations[locale] ?? translations['en'];
  for (const k of keys) {
    val = val?.[k];
    if (val === undefined) break;
  }
  if (val === undefined) {
    let fallback: any = translations['en'];
    for (const k of keys) fallback = fallback?.[k];
    return fallback ?? key;
  }
  return val;
}

export function getLocaleFromUrl(url: URL): Locale {
  const [, lang] = url.pathname.split('/');
  if (['de','es','ro'].includes(lang)) return lang as Locale;
  return 'en';
}

export function getLocalizedPath(path: string, locale: Locale): string {
  if (locale === 'en') return path;
  return `/${locale}${path}`;
}

export const LOCALES: Locale[] = ['en', 'de', 'es', 'ro'];
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  de: 'Deutsch',
  es: 'Espanol',
  ro: 'Romana',
};
