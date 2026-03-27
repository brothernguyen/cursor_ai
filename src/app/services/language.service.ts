import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

export type AppLanguage = 'en' | 'vi' | 'hi';

export const APP_LANGUAGES: ReadonlyArray<{ code: AppLanguage; labelKey: string }> = [
  { code: 'en', labelKey: 'language.en' },
  { code: 'vi', labelKey: 'language.vi' },
  { code: 'hi', labelKey: 'language.hi' }
];

export const APP_LANG_STORAGE_KEY = 'app_lang';

@Injectable({
  providedIn: 'root'
})
export class LanguageService {
  private readonly translate = inject(TranslateService);
  /** Synced with TranslateService for select binding */
  readonly currentLangSig = signal<AppLanguage>('en');

  /** Call once after app bootstrap so stored language applies before first paint where possible */
  initialize(): void {
    const stored = this.getStoredCode();
    const lang = stored ?? this.translate.getBrowserLang()?.split('-')[0] ?? 'en';
    const normalized = this.normalize(lang);
    this.translate.addLangs(['en', 'vi', 'hi']);
    this.translate.setFallbackLang('en');
    this.currentLangSig.set(normalized);
    this.translate.use(normalized).subscribe({
      error: () => {
        this.currentLangSig.set('en');
        this.translate.use('en').subscribe();
      }
    });
  }

  getStoredCode(): AppLanguage | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(APP_LANG_STORAGE_KEY);
    return raw ? this.normalize(raw) : null;
  }

  setLanguage(code: AppLanguage): void {
    const normalized = this.normalize(code);
    localStorage.setItem(APP_LANG_STORAGE_KEY, normalized);
    this.currentLangSig.set(normalized);
    this.translate.use(normalized).subscribe({
      error: () => {
        this.currentLangSig.set('en');
        this.translate.use('en').subscribe();
      },
    });
  }

  currentLanguage(): AppLanguage {
    return this.currentLangSig();
  }

  private normalize(code: string): AppLanguage {
    const c = code.toLowerCase().slice(0, 2);
    if (c === 'vi') return 'vi';
    if (c === 'hi') return 'hi';
    return 'en';
  }
}
