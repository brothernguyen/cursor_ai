import { Component, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Company, User } from '../../../interfaces/auth';
import { AuthService } from '../../../services/auth.service';
import { MessageService } from 'primeng/api';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-comp-delete-admin',
  imports: [CommonModule, TranslatePipe],
  templateUrl: './comp-delete-admin.component.html',
  styleUrl: './comp-delete-admin.component.scss'
})
export class CompDeleteAdminComponent implements OnInit {
  @Input() company: Company | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() deleted = new EventEmitter<void>();

  authService = inject(AuthService);
  msgService = inject(MessageService);
  private translate = inject(TranslateService);
  admins: User[] = [];
  loading = false;
  deletingAdminId: string | null = null;
  adminPendingDelete: User | null = null;

  ngOnInit(): void {
    if (this.company?.id) {
      this.loadAdmins();
    }
  }

  loadAdmins() {
    if (!this.company?.id) return;

    this.loading = true;
    this.authService.getCompanyAdmins(this.company.id).subscribe({
      next: (res: any) => {
        console.log('==>Admins loaded:', res);
        // Handle different response structures
        if (Array.isArray(res.data)) {
          this.admins = res.data;
        } else if (res.data && Array.isArray(res.data.admins)) {
          this.admins = res.data.admins;
        } else if (res.data && Array.isArray(res.data.data)) {
          this.admins = res.data.data;
        } else if (Array.isArray(res)) {
          this.admins = res;
        } else {
          this.admins = [];
        }
        this.loading = false;
      },
      error: (error) => {
        console.error('==>Error loading admins:', error);
        this.admins = [];
        this.loading = false;
        this.msgService.add({
          severity: 'error',
          summary: this.translate.instant('common.error'),
          detail: this.translate.instant('toast.loadAdminsFailed'),
          life: 3000
        });
      }
    });
  }

  onDelete(admin: User) {
    this.adminPendingDelete = admin;
  }

  cancelDelete() {
    this.adminPendingDelete = null;
  }

  confirmDelete() {
    const admin = this.adminPendingDelete;
    if (!admin) return;

    if (!admin.id) {
      this.msgService.add({
        severity: 'error',
        summary: this.translate.instant('common.error'),
        detail: this.translate.instant('toast.adminIdMissing'),
        life: 3000
      });
      this.adminPendingDelete = null;
      return;
    }
    this.deletingAdminId = admin.id!;
    this.authService.deleteCompanyAdmin(admin.id!).subscribe({
      next: (res: any) => {
        console.log('==>Admin deleted successfully:', res);
        this.deletingAdminId = null;
        this.adminPendingDelete = null;
        this.loadAdmins();
        this.deleted.emit();
        this.msgService.add({
          severity: 'success',
          summary: this.translate.instant('common.success'),
          detail: this.translate.instant('toast.adminDeletedDetail'),
          life: 3000
        });
      },
      error: (error) => {
        console.error('==>Error deleting admin:', error);
        this.deletingAdminId = null;
        let errorMessage =
          error.error?.message || error.message || this.translate.instant('toast.deleteAdminFailed');
        if (errorMessage.includes('send a request')) {
          errorMessage = this.translate.instant('toast.deleteServiceUnreachable');
        } else if (errorMessage.includes('non-2xx status code')) {
          errorMessage = this.translate.instant('toast.deleteServerErrorHint');
        }
        this.msgService.add({
          severity: 'error',
          summary: this.translate.instant('common.error'),
          detail: errorMessage,
          life: 5000
        });
      }
    });
  }

  onClose() {
    this.close.emit();
  }

  onCancel() {
    // Cancel action - can be customized if needed
    // For now, it just closes the modal
    this.onClose();
  }

  capitalizeStatus(status: string | undefined): string {
    if (!status) return '';
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
