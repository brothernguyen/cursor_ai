import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Company } from '../../../interfaces/auth';
import { AuthService } from '../../../services/auth.service';
import { MessageService, ConfirmationService } from 'primeng/api';

@Component({
  selector: 'app-comp-delete-company',
  imports: [CommonModule],
  templateUrl: './comp-delete-company.component.html',
  styleUrl: './comp-delete-company.component.scss'
})
export class CompDeleteCompanyComponent {
  @Input() company: Company | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() deleted = new EventEmitter<void>();

  authService = inject(AuthService);
  msgService = inject(MessageService);
  confirmationService = inject(ConfirmationService);
  deleting = false;

  onDelete() {
    if (!this.company?.id) {
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Company ID is missing',
        life: 3000
      });
      return;
    }

    const companyId = this.company.id;
    const companyName = this.company.name;

    this.confirmationService.confirm({
      message: `Are you sure you want to delete "${companyName}"? This action cannot be undone.`,
      header: 'Delete Company',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      acceptLabel: 'OK',
      rejectLabel: 'Cancel',
      accept: () => {
        this.deleting = true;
        this.authService.deleteCompany(companyId).subscribe({
          next: (res: any) => {
            console.log('==>Company deleted successfully:', res);
            this.deleting = false;
            this.msgService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Company deleted successfully',
              life: 3000
            });
            // Emit deleted event first, then close modal
            this.deleted.emit();
            this.onClose();
          },
          error: (error) => {
            console.error('==>Error deleting company:', error);
            this.deleting = false;
            const errorMessage = error.error?.message || error.message || 'Failed to delete company. Please try again.';
            this.msgService.add({
              severity: 'error',
              summary: 'Error',
              detail: errorMessage,
              life: 3000
            });
            // Don't close modal on error so user can try again
          }
        });
      },
      reject: () => {
        // User cancelled, do nothing
      }
    });
  }

  onClose() {
    this.close.emit();
  }

  onCancel() {
    this.onClose();
  }
}


