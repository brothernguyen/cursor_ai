import { Component, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Company } from '../../../interfaces/auth';
import { AuthService } from '../../../services/auth.service';
import { MessageService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-comp-create-admin',
  imports: [CommonModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: './comp-create-admin.component.html',
  styleUrl: './comp-create-admin.component.scss'
})
export class CompCreateAdminComponent implements OnInit {
  @Input() company: Company | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<void>();

  adminForm!: FormGroup;
  authService = inject(AuthService);
  msgService = inject(MessageService);
  private translate = inject(TranslateService);
  isSubmitting = false;

  constructor(private fb: FormBuilder) { }

  ngOnInit(): void {
    console.log('==>compId:', this.company?.id);
    this.adminForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onClose() {
    this.close.emit();
  }

  onSubmit() {
    if (this.adminForm.valid && this.company?.id) {
      this.isSubmitting = true;
      const formValue = this.adminForm.value;

      const adminData = {
        companyId: this.company.id,
        email: formValue.email,
        companyName: this.company.name ?? undefined
      };

      this.authService.createCompanyAdmin(adminData).subscribe({
        next: (res) => {
          console.log('==>Admin created successfully:', res);
          this.isSubmitting = false;
          if (res.emailSent) {
            this.msgService.add({
              severity: 'success',
              summary: this.translate.instant('common.success'),
              detail: this.translate.instant('toast.invitationSentToEmailDetail', {
                email: formValue.email
              }),
              life: 5000
            });
          } else {
            this.msgService.add({
              severity: 'warn',
              summary: this.translate.instant('toast.adminInviteEmailWarnSummary'),
              detail:
                res.emailError ??
                this.translate.instant('toast.adminInviteEmailWarnDetailFallback'),
              life: 12000
            });
          }
          this.created.emit();
          this.onClose();
          this.adminForm.reset();
        },
        error: (error) => {
          console.error('==>Error creating admin:', error);
          this.isSubmitting = false;
          const errorMessage =
            error.error?.message ||
            error.message ||
            this.translate.instant('toast.inviteAdminGenericError');
          this.msgService.add({
            severity: 'error',
            summary: this.translate.instant('common.error'),
            detail: errorMessage,
            life: 3000
          });
        }
      });
    } else {
      // Mark all fields as touched to show validation errors
      Object.keys(this.adminForm.controls).forEach(key => {
        this.adminForm.get(key)?.markAsTouched();
      });
    }
  }

  get email() {
    return this.adminForm.get('email');
  }
}
