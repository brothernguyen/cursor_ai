import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges, inject, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Company, User } from '../../../interfaces/auth';
import { AuthService } from '../../../services/auth.service';
import { MessageService, ConfirmationService } from 'primeng/api';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'app-comp-detail',
  imports: [CommonModule, FormsModule, TranslatePipe],
  templateUrl: './comp-detail.component.html',
  styleUrl: './comp-detail.component.scss'
})
export class CompDetailComponent implements OnInit, OnChanges, OnDestroy {
  @Input() company: Company | null = null;
  @Output() close = new EventEmitter<void>();
  @Output() edit = new EventEmitter<any>();
  @Output() update = new EventEmitter<User>();

  authService = inject(AuthService);
  msgService = inject(MessageService);
  confirmationService = inject(ConfirmationService);
  private translate = inject(TranslateService);
  admins: User[] = [];
  loadingAdmins = false;
  deletingAdminId: string | null = null;
  updatingStatus = false;
  
  // Logo upload
  logoPreview: string | null = null;
  logoFile: File | null = null;
  logoFileSizeError = '';
  
  // Form data
  formData = {
    name: '',
    status: 'active',
    industry: '',
    address: '',
    phone: '',
    companyId: ''
  };
  
  // Status change debouncing
  private statusChangeSubject = new Subject<string>();
  private destroy$ = new Subject<void>();
  private previousStatus: string = '';
  
  readonly statusOptions: Array<'active' | 'inactive' | 'pending'> = [
    'active',
    'inactive',
    'pending'
  ];
  
  industryOptions = ['Technology', 'Finance', 'Healthcare'];

  ngOnInit(): void {
    this.initializeCompanyData();
    
    // Setup debounced status change handler
    this.statusChangeSubject.pipe(
      debounceTime(500), // 500ms delay
      distinctUntilChanged(),
      takeUntil(this.destroy$)
    ).subscribe((status: string) => {
      this.updateCompanyStatus(status);
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['company'] && changes['company'].currentValue) {
      this.initializeCompanyData();
    }
  }

  initializeCompanyData(): void {
    if (this.company?.id) {
      this.loadAdmins();
    }
    // Initialize form data
    if (this.company) {
      const initialStatus = this.company.status || 'active';
      this.formData = {
        name: this.company.name || '',
        status: initialStatus,
        industry: this.company.industry || '',
        address: this.company.address || '',
        phone: this.company.phone || '',
        companyId: this.company.id?.toString() || ''
      };
      // Store previous status for comparison
      this.previousStatus = initialStatus;
      // Set logo preview if logoUrl exists - always show current company logo
      if (this.company.logoUrl) {
        this.logoPreview = this.company.logoUrl;
      } else {
        // Reset logo preview if no logo exists
        this.logoPreview = null;
      }
      // Reset logo file when company changes
      this.logoFile = null;
      this.logoFileSizeError = '';
    }
  }

  loadAdmins() {
    if (!this.company?.id) return;

    this.loadingAdmins = true;
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
        this.loadingAdmins = false;
      },
      error: (error) => {
        console.error('==>Error loading admins:', error);
        this.admins = [];
        this.loadingAdmins = false;
      }
    });
  }

  onClose() {
    this.close.emit();
  }

  onEdit() {
    this.edit.emit();
  }
  
  onSave() {
    // Emit save event with form data
    const companyData = {
      name: this.formData.name.trim(),
      status: this.formData.status,
      industry: this.formData.industry.trim(),
      address: this.formData.address.trim(),
      phone: this.formData.phone?.trim() || undefined,
      logoUrl: this.logoPreview || this.company?.logoUrl || undefined,
      companyId: this.formData.companyId
    };
    this.edit.emit(companyData);
  }
  
  triggerLogoUpload() {
    const input = document.getElementById('company-logo-upload-input') as HTMLInputElement;
    input?.click();
  }
  
  onLogoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      // Check file size (50MB = 50 * 1024 * 1024 bytes)
      const maxFileSize = 50 * 1024 * 1024; // 50MB in bytes
      
      if (file.size > maxFileSize) {
        this.logoFileSizeError = this.translate.instant('toast.fileExceeds50Detail');
        this.logoFile = null;
        this.logoPreview = null;
        // Clear the input
        event.target.value = '';
        // Show warning message
        this.msgService.add({
          severity: 'warn',
          summary: this.translate.instant('toast.fileTooLargeSummary'),
          detail: this.translate.instant('toast.fileExceeds50Detail'),
          life: 5000
        });
        return;
      }
      
      // Clear any previous error
      this.logoFileSizeError = '';
      this.logoFile = file;
      // Create a preview URL
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.logoPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }
  
  onLogoDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file && file.type.startsWith('image/')) {
      // Check file size (50MB = 50 * 1024 * 1024 bytes)
      const maxFileSize = 50 * 1024 * 1024; // 50MB in bytes
      
      if (file.size > maxFileSize) {
        this.logoFileSizeError = this.translate.instant('toast.fileExceeds50Detail');
        this.logoFile = null;
        this.logoPreview = null;
        // Show warning message
        this.msgService.add({
          severity: 'warn',
          summary: this.translate.instant('toast.fileTooLargeSummary'),
          detail: this.translate.instant('toast.fileExceeds50Detail'),
          life: 5000
        });
        return;
      }
      
      // Clear any previous error
      this.logoFileSizeError = '';
      this.logoFile = file;
      // Create a preview URL
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.logoPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  isFormValid(): boolean {
    // Check if there's a file size error
    if (this.logoFileSizeError) {
      return false;
    }
    return !!(
      this.formData.name?.trim() &&
      this.formData.address?.trim() &&
      this.formData.industry?.trim()
    );
  }

  onUpdateAdmin(admin: User) {
    this.update.emit(admin);
  }

  onStatusChange(newStatus: string) {
    // Prevent selecting 'pending' status (temporarily disabled by backend)
    if (newStatus === 'pending') {
      this.msgService.add({
        severity: 'warn',
        summary: this.translate.instant('toast.statusPendingDisabledSummary'),
        detail: this.translate.instant('toast.statusPendingDisabledDetail'),
        life: 3000
      });
      // Revert to previous status
      this.formData.status = this.previousStatus;
      return;
    }
    
    // Only trigger update if status actually changed
    if (newStatus !== this.previousStatus && this.company?.id) {
      this.statusChangeSubject.next(newStatus);
    }
  }

  updateCompanyStatus(status: string) {
    if (!this.company?.id) {
      return;
    }

    // Prevent multiple simultaneous updates
    if (this.updatingStatus) {
      return;
    }

    this.updatingStatus = true;
    this.authService.updateCompanyStatus(this.company.id, status).subscribe({
      next: (res: any) => {
        console.log('==>Company status updated successfully:', res);
        this.previousStatus = status;
        this.updatingStatus = false;
        // Update the company object if response contains updated data
        if (this.company) {
          this.company.status = status;
        }
        this.msgService.add({
          severity: 'success',
          summary: this.translate.instant('common.success'),
          detail: this.translate.instant('toast.companyStatusUpdatedDetail'),
          life: 2000
        });
      },
      error: (error) => {
        console.error('==>Error updating company status:', error);
        this.updatingStatus = false;
        // Revert to previous status on error
        this.formData.status = this.previousStatus;
        const errorMessage =
          error.error?.message ||
          error.message ||
          this.translate.instant('toast.failedUpdateCompanyStatus');
        this.msgService.add({
          severity: 'error',
          summary: this.translate.instant('common.error'),
          detail: errorMessage,
          life: 3000
        });
      }
    });
  }

  onDeleteAdmin(admin: User) {
    if (!admin.id) {
      this.msgService.add({
        severity: 'error',
        summary: this.translate.instant('common.error'),
        detail: this.translate.instant('toast.adminIdMissing'),
        life: 3000
      });
      return;
    }

    const adminName = `${admin.firstName} ${admin.lastName}`;
    
    this.confirmationService.confirm({
      message: this.translate.instant('toast.confirmDeleteAdminMessage', { name: adminName }),
      header: this.translate.instant('toast.confirmDeleteAdminHeader'),
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      acceptLabel: this.translate.instant('common.ok'),
      rejectLabel: this.translate.instant('common.cancel'),
      accept: () => {
        this.deletingAdminId = admin.id!;
        this.authService.deleteCompanyAdmin(admin.id!).subscribe({
          next: (res: any) => {
            console.log('==>Admin deleted successfully:', res);
            this.deletingAdminId = null;
            // Reload admins list
            this.loadAdmins();
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
      },
      reject: () => {
        // User cancelled, do nothing
      }
    });
  }
}
