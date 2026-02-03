import { Component, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Company } from '../../../interfaces/auth';
import { AuthService } from '../../../services/auth.service';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-comp-create-admin',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './comp-create-admin.component.html',
  styleUrl: './comp-create-admin.component.scss'
})
export class CompCreateAdminComponent implements OnInit {
  @Input() company: Company | null = null;
  @Output() close = new EventEmitter<void>();

  adminForm!: FormGroup;
  authService = inject(AuthService);
  msgService = inject(MessageService);
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
        next: (res: any) => {
          console.log('==>Admin created successfully:', res);
          this.isSubmitting = false;
          this.onClose();
          // Optionally reset form
          this.adminForm.reset();
        },
        error: (error) => {
          console.error('==>Error creating admin:', error);
          this.isSubmitting = false;
          const errorMessage = error.error?.message || error.message || 'Failed to invite admin. Please try again.';
          this.msgService.add({
            severity: 'error',
            summary: 'Error',
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
