import { Component, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Company, User } from '../../../interfaces/auth';
import { AuthService } from '../../../services/auth.service';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-comp-update-admin',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './comp-update-admin.component.html',
  styleUrl: './comp-update-admin.component.scss'
})
export class CompUpdateAdminComponent implements OnInit {
  @Input() company: Company | null = null;
  @Input() admin: User | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() updated = new EventEmitter<void>();

  adminForm!: FormGroup;
  authService = inject(AuthService);
  msgService = inject(MessageService);
  isSubmitting = false;

  constructor(private fb: FormBuilder) { }

  ngOnInit(): void {
    this.adminForm = this.fb.group({
      firstName: [this.admin?.firstName || '', [Validators.required]],
      lastName: [this.admin?.lastName || '', [Validators.required]],
      status: [{ value: this.admin?.status || 'active', disabled: true }] // Temporarily disabled
    });
  }

  onClose() {
    this.close.emit();
  }

  onSubmit() {
    if (this.adminForm.valid && this.admin?.id) {
      this.isSubmitting = true;
      const formValue = this.adminForm.value;

      const adminData = {
        firstName: formValue.firstName.trim(),
        lastName: formValue.lastName.trim(),
        status: this.admin.status // Use existing status since it's not editable
      };

      this.authService.updateCompanyAdmin(this.admin.id, adminData).subscribe({
        next: (res: any) => {
          console.log('==>Admin updated successfully:', res);
          this.isSubmitting = false;
          this.msgService.add({
            severity: 'success',
            summary: 'Success',
            detail: 'Admin updated successfully',
            life: 3000
          });
          this.updated.emit();
          this.onClose();
        },
        error: (error) => {
          console.error('==>Error updating admin:', error);
          this.isSubmitting = false;
          const errorMessage = error.error?.message || error.message || 'Failed to update admin. Please try again.';
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

  get firstName() {
    return this.adminForm.get('firstName');
  }

  get lastName() {
    return this.adminForm.get('lastName');
  }

  get status() {
    return this.adminForm.get('status');
  }
}
