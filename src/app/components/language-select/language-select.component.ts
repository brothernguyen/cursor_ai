import { Component, inject, OnInit } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import {
  APP_LANGUAGES,
  AppLanguage,
  LanguageService
} from '../../services/language.service';

@Component({
  selector: 'app-language-select',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <label class="language-select__label" for="app-language-select">{{
      'language.label' | translate
    }}</label>
    <select
      id="app-language-select"
      class="language-select__control"
      (change)="onNativeChange($event)"
      [attr.aria-label]="'language.label' | translate"
    >
      @for (opt of languages; track opt.code) {
        <option
          [value]="opt.code"
          [selected]="opt.code === languageService.currentLangSig()"
        >
          {{ opt.labelKey | translate }}
        </option>
      }
    </select>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        width: max-content;
        max-width: 100%;
      }
      .language-select__label {
        position: absolute;
        width: 1px;
        height: 1px;
        padding: 0;
        margin: -1px;
        overflow: hidden;
        clip: rect(0, 0, 0, 0);
        white-space: nowrap;
        border: 0;
      }
      .language-select__control {
        box-sizing: border-box;
        height: 30px;
        min-width: 0;
        width: max-content;
        max-width: 100%;
        padding: 0 10px;
        border-radius: 8px;
        border: 1px solid #c4b5fd;
        background: #ffffff;
        color: #1e293b;
        font-size: 13px;
        font-weight: 500;
        line-height: calc(30px - 2px);
        text-align: center;
        text-align-last: center;
        cursor: pointer;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
        appearance: none;
        -webkit-appearance: none;
        -moz-appearance: none;
        background-image: none;
        -webkit-tap-highlight-color: transparent;
      }
      .language-select__control::-ms-expand {
        display: none;
      }
      .language-select__control:focus,
      .language-select__control:focus-visible,
      .language-select__control:active {
        outline: none;
        box-shadow: none;
      }
      :host-context(html.app-dark) .language-select__control {
        background: #111827;
        background-image: none;
        border-color: #6366f1;
        color: #e2e8f0;
      }
    `
  ]
})
export class LanguageSelectComponent implements OnInit {
  readonly languageService = inject(LanguageService);
  readonly languages = APP_LANGUAGES;

  ngOnInit(): void {
    // After login, remount can show a stale select state; align with TranslateService.
    this.languageService.syncFromTranslate();
  }

  onNativeChange(event: Event): void {
    const code = (event.target as HTMLSelectElement).value;
    this.languageService.setLanguage(code as AppLanguage);
  }
}
