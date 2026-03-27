import { ApplicationConfig, APP_INITIALIZER, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { provideHttpClient } from '@angular/common/http';
import { provideTranslateService, provideTranslateLoader } from '@ngx-translate/core';
import {
  TranslateHttpLoader,
  TRANSLATE_HTTP_LOADER_CONFIG,
} from '@ngx-translate/http-loader';
import { routes } from './app.routes';
import { MessageService } from 'primeng/api';
import { LanguageService } from './services/language.service';

export function initLanguageFactory(languageService: LanguageService) {
  return () => {
    languageService.initialize();
    return Promise.resolve();
  };
}

export const appConfig: ApplicationConfig = {
    providers: [
        provideZoneChangeDetection({ eventCoalescing: true }),
        provideAnimations(),
        provideRouter(routes),
        providePrimeNG({
            theme: {
                preset: Aura,
                options: {
                    prefix: 'p',
                    darkModeSelector: '.app-dark',
                    cssLayer: false
                }
            },
            ripple: true,
            inputVariant: 'filled'
        }),
        provideHttpClient(),
        // Required by TranslateHttpLoader (inject(TRANSLATE_HTTP_LOADER_CONFIG) in v17+)
        {
            provide: TRANSLATE_HTTP_LOADER_CONFIG,
            useValue: { prefix: '/assets/i18n/', suffix: '.json' },
        },
        ...provideTranslateService({
            loader: provideTranslateLoader(TranslateHttpLoader),
            fallbackLang: 'en',
            lang: 'en',
        }),
        {
            provide: APP_INITIALIZER,
            useFactory: initLanguageFactory,
            deps: [LanguageService],
            multi: true
        },
        MessageService
    ],
};
