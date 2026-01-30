import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimations } from '@angular/platform-browser/animations';
import { providePrimeNG } from 'primeng/config';
import Aura from '@primeuix/themes/aura';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { MessageService } from 'primeng/api';

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
                    darkModeSelector: 'system',
                    cssLayer: false
                }
            },
            ripple: true,
            inputVariant: 'filled'
        }),
        provideHttpClient(),
        MessageService
    ],
};
