import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { FormBuilder, Validators, FormGroup, AbstractControl, ValidationErrors } from '@angular/forms';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import { MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
import { from } from 'rxjs';
import { finalize, map } from 'rxjs/operators';
import { LoadingService } from '../../services/loading.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { LanguageSelectComponent } from '../language-select/language-select.component';

function passwordMatchValidator(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  if (password && confirmPassword && password !== confirmPassword) {
    return { passwordMismatch: true };
  }
  return null;
}

@Component({
  selector: 'app-reset-password',
  imports: [
    ReactiveFormsModule,
    CommonModule,
    PasswordModule,
    ButtonModule,
    RouterLink,
    Toast,
    TranslatePipe,
    LanguageSelectComponent,
  ],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  form!: FormGroup;
  isSubmitting = false;
  success = false;
  hasRecoverySession = signal<boolean | null>(null);
  private auth = inject(AuthService);
  private sb = inject(SupabaseService);
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private msgService = inject(MessageService);
  private loading = inject(LoadingService);
  private readonly translate = inject(TranslateService);

  showForm = computed(() => this.hasRecoverySession() === true);
  showInvalidLink = computed(() => this.hasRecoverySession() === false);

  constructor() {
    this.form = this.fb.group(
      {
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', Validators.required],
      },
      { validators: passwordMatchValidator }
    );
  }

  get password() {
    return this.form.controls['password'];
  }
  get confirmPassword() {
    return this.form.controls['confirmPassword'];
  }

  ngOnInit(): void {
    if (!this.sb.isConfigured()) {
      console.warn(
        '[ResetPassword] Supabase is not configured. Set credentials in src/environments/environment.ts.'
      );
      this.hasRecoverySession.set(false);
      return;
    }
    // Supabase puts tokens in URL hash; client recovers session on load (may be async).
    const checkSession = () =>
      from(this.sb.client.auth.getSession()).pipe(
        map(({ data: { session } }) => !!session)
      );
    this.loading.begin();
    checkSession().pipe(
      finalize(() => this.loading.end())
    ).subscribe((hasSession) => {
      if (hasSession) {
        this.hasRecoverySession.set(true);
        return;
      }
      // Hash might not be processed yet; retry once after a short delay.
      const hasHash = typeof window !== 'undefined' && window.location?.hash?.includes('access_token');
      if (hasHash) {
        setTimeout(() => {
          this.loading.begin();
          checkSession().pipe(
            finalize(() => this.loading.end())
          ).subscribe((retrySession) => this.hasRecoverySession.set(retrySession));
        }, 400);
      } else {
        this.hasRecoverySession.set(false);
      }
    });
  }

  onSubmit(): void {
    if (this.form.invalid || this.isSubmitting) return;
    this.isSubmitting = true;
    this.loading.begin();
    const newPassword = this.form.value.password;
    this.auth.updatePassword(newPassword).pipe(
      finalize(() => {
        this.isSubmitting = false;
        this.loading.end();
      })
    ).subscribe({
      next: () => {
        this.success = true;
        this.auth.logout(); // So user signs in with new password
        this.msgService.add({
          severity: 'success',
          summary: this.translate.instant('toast.passwordUpdated'),
          detail: this.translate.instant('toast.passwordUpdatedDetail'),
          life: 5000,
        });
        this.router.navigate(['/login']);
      },
      error: (err) => {
        this.msgService.add({
          severity: 'error',
          summary: this.translate.instant('common.error'),
          detail: err?.message ?? this.translate.instant('toast.passwordUpdateFailed'),
          life: 4000,
        });
      },
    });
  }
}
