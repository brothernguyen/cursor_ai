import { Component, inject } from '@angular/core';
import { FormBuilder, Validators, FormGroup } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../services/auth.service';
import { LoadingService } from '../../services/loading.service';
import { MessageService } from 'primeng/api';
import { finalize } from 'rxjs/operators';
import { Toast } from 'primeng/toast';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageSelectComponent } from '../language-select/language-select.component';

@Component({
  selector: 'app-forgot-password',
  imports: [
    ReactiveFormsModule,
    CommonModule,
    InputTextModule,
    ButtonModule,
    RouterLink,
    Toast,
    TranslatePipe,
    LanguageSelectComponent,
  ],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
})
export class ForgotPasswordComponent {
  form!: FormGroup;
  isSubmitting = false;
  submitted = false;
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private msgService = inject(MessageService);
  private loading = inject(LoadingService);
  private readonly translate = inject(TranslateService);

  constructor() {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });
  }

  get email() {
    return this.form.controls['email'];
  }

  onSubmit(): void {
    if (this.form.invalid || this.isSubmitting) return;
    this.isSubmitting = true;
    this.loading.begin();
    this.auth.requestPasswordReset(this.form.value.email).pipe(
      finalize(() => {
        this.isSubmitting = false;
        this.loading.end();
      })
    ).subscribe({
      next: () => {
        this.submitted = true;
        this.msgService.add({
          severity: 'success',
          summary: this.translate.instant('forgot.toastCheckEmail'),
          detail: this.translate.instant('forgot.toastResetSent'),
          life: 5000,
        });
      },
      error: (err) => {
        this.msgService.add({
          severity: 'error',
          summary: this.translate.instant('common.error'),
          detail: err?.message ?? this.translate.instant('forgot.toastResetFailed'),
          life: 4000,
        });
      },
    });
  }
}
