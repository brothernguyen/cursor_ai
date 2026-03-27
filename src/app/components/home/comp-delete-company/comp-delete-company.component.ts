import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Company } from '../../../interfaces/auth';
import { AuthService } from '../../../services/auth.service';
import { MessageService, ConfirmationService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-comp-delete-company',
  imports: [CommonModule, TranslatePipe],
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
  private translate = inject(TranslateService);
  deleting = false;

  onDelete() {
    if (!this.company?.id) {
      this.msgService.add({
        severity: 'error',
        summary: this.translate.instant('common.error'),
        detail: this.translate.instant('toast.companyIdMissing'),
        life: 3000
      });
      return;
    }

    const companyId = this.company.id;
    const companyName = this.company.name;

    this.confirmationService.confirm({
      message: this.translate.instant('toast.deleteCompanyConfirmDialogMessage', {
        name: companyName
      }),
      header: this.translate.instant('modals.deleteCompany'),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      acceptLabel: this.translate.instant('common.ok'),
      rejectLabel: this.translate.instant('common.cancel'),
      accept: () => {
        this.deleting = true;
        this.authService.deleteCompany(companyId).subscribe({
          next: (res: any) => {
            console.log('==>Company deleted successfully:', res);
            this.deleting = false;
            this.msgService.add({
              severity: 'success',
              summary: this.translate.instant('common.success'),
              detail: this.translate.instant('toast.companyDeletedDetail'),
              life: 3000
            });
            // Emit deleted event first, then close modal
            this.deleted.emit();
            this.onClose();
          },
          error: (error) => {
            console.error('==>Error deleting company:', error);
            this.deleting = false;
            const errorMessage =
              error.error?.message ||
              error.message ||
              this.translate.instant('toast.failedDeleteCompanyDetail');
            this.msgService.add({
              severity: 'error',
              summary: this.translate.instant('common.error'),
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


