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
import { map } from 'rxjs/operators';

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
    // Supabase puts tokens in URL hash; client recovers session on load (may be async).
    const checkSession = () =>
      from(this.sb.client.auth.getSession()).pipe(
        map(({ data: { session } }) => !!session)
      );
    checkSession().subscribe((hasSession) => {
      if (hasSession) {
        this.hasRecoverySession.set(true);
        return;
      }
      // Hash might not be processed yet; retry once after a short delay.
      const hasHash = typeof window !== 'undefined' && window.location?.hash?.includes('access_token');
      if (hasHash) {
        setTimeout(() => {
          checkSession().subscribe((retrySession) => this.hasRecoverySession.set(retrySession));
        }, 400);
      } else {
        this.hasRecoverySession.set(false);
      }
    });
  }

  onSubmit(): void {
    if (this.form.invalid || this.isSubmitting) return;
    this.isSubmitting = true;
    const newPassword = this.form.value.password;
    this.auth.updatePassword(newPassword).subscribe({
      next: () => {
        this.success = true;
        this.auth.logout(); // So user signs in with new password
        this.msgService.add({
          severity: 'success',
          summary: 'Password updated',
          detail: 'You can now sign in with your new password.',
          life: 5000,
        });
        this.router.navigate(['/login']);
      },
      error: (err) => {
        this.msgService.add({
          severity: 'error',
          summary: 'Error',
          detail: err?.message ?? 'Failed to update password. Try again.',
          life: 4000,
        });
        this.isSubmitting = false;
      },
      complete: () => {
        this.isSubmitting = false;
      },
    });
  }
}
