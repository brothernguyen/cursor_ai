import { Component, inject, OnInit, OnDestroy, signal, ViewChild, HostListener, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { PaginatorModule } from 'primeng/paginator';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LayoutService } from '../../services/layout.service';
import { RoomService } from '../../services/room.service';
import { EmployeeService } from '../../services/employee.service';
import { Company, Room } from '../../interfaces/auth';
import { forkJoin, of, Subject } from 'rxjs';
import { map, catchError, debounceTime, distinctUntilChanged, finalize, takeUntil } from 'rxjs/operators';
import { Popover } from 'primeng/popover';
import { PopoverModule } from 'primeng/popover';
import { ButtonModule } from 'primeng/button';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { CompDetailComponent } from './comp-detail/comp-detail.component';
import { CompCreateAdminComponent } from "./comp-create-admin/comp-create-admin.component";
import { CardModule } from 'primeng/card';
import { GalleriaModule } from 'primeng/galleria';
import { DrawerModule } from 'primeng/drawer';
import { CompDeleteAdminComponent } from "./comp-delete-admin/comp-delete-admin.component";
import { CompDeleteCompanyComponent } from "./comp-delete-company/comp-delete-company.component";
import { CompUpdateAdminComponent } from "./comp-update-admin/comp-update-admin.component";
import { User } from '../../interfaces/auth';
import { LoadingService } from '../../services/loading.service';

// Extended interface for table display with additional fields from API
interface CompanyWithDetails extends Company {
  admins?: number;
  total?: number;
}

// Extended interface for room display with additional fields
interface RoomDisplay extends Room {
  id?: number;
  hours?: string;
  status?: 'active' | 'inactive' | 'pending';
  images?: string[];
}

// Extended interface for employee display
interface EmployeeDisplay {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  department?: string;
  role?: string;
  status?: 'active' | 'inactive' | 'pending';
}

// Extended interface for admin display
interface AdminDisplay {
  id?: string;
  firstName: string;
  lastName: string;
  email: string;
  status?: 'active' | 'inactive' | 'pending';
  companyName?: string;
  companyId?: string;
}

@Component({
  selector: 'app-home',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, PaginatorModule, PopoverModule, ButtonModule, ToastModule, ConfirmDialogModule, CardModule, GalleriaModule, DrawerModule, CompDetailComponent, CompCreateAdminComponent, CompDeleteAdminComponent, CompDeleteCompanyComponent, CompUpdateAdminComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  providers: [MessageService, ConfirmationService]
})
export class HomeComponent implements OnInit, OnDestroy {
  private readonly homeViewStorageKey = 'home:selectedView';
  role = signal<'system' | 'company'>('system');
  view = signal<'dashboard' | 'companies' | 'admins' | 'rooms' | 'employees' | 'report' | 'settings'>('dashboard');
  modal = signal<string>('');
  search = signal<string>('');
  authSer = inject(AuthService);
  layoutService = inject(LayoutService);
  roomSer = inject(RoomService);
  employeeSer = inject(EmployeeService);
  loading = inject(LoadingService);
  msgService = inject(MessageService);
  confirmationService = inject(ConfirmationService);
  @ViewChild('op') op!: Popover;
  @ViewChild('filterPopover') filterPopover!: Popover;
  @ViewChild('periodDropdown') periodDropdownRef!: ElementRef;
  selectedCompany: Company | null = null;
  showDetail = signal<boolean>(false);
  showCreateAdmin = signal<boolean>(false);
  showDeleteAdmin = signal<boolean>(false);
  showUpdateAdmin = signal<boolean>(false);
  showDeleteCompany = signal<boolean>(false);
  selectedAdmin: User | null = null;
  sidebarOpen = signal<boolean>(true);
  sidebarCollapsed = signal<boolean>(false);
  selectedKpiCard = signal<string>('Total company');
  selectedPeriod = signal<string>('This week');
  showPeriodDropdown = signal<boolean>(false);
  currentUser = signal<{ firstName?: string; lastName?: string; companyName?: string }>({});
  selectedCompanyPeriod = signal<string>('This week');
  showCompanyPeriodDropdown = signal<boolean>(false);
  selectedUtilizationPeriod = signal<string>('Week');
  roomViewMode = signal<'card' | 'list'>('card'); // Default to card view (right button)
  statusSortDirection = signal<'asc' | 'desc' | null>(null); // null = no sort, 'asc' = active first, 'desc' = inactive first
  employeeStatusSortDirection = signal<'asc' | 'desc' | null>(null);
  employeeFirstNameSortDirection = signal<'asc' | 'desc' | null>(null);
  employeeLastNameSortDirection = signal<'asc' | 'desc' | null>(null);
  employeeEmailSortDirection = signal<'asc' | 'desc' | null>(null);
  employeeDepartmentSortDirection = signal<'asc' | 'desc' | null>(null);
  employeeRoleSortDirection = signal<'asc' | 'desc' | null>(null);
  roomToDelete: RoomDisplay | null = null;
  companyIndustrySortDirection = signal<'asc' | 'desc' | null>(null); // For company industry sorting
  companyStatusSortDirection = signal<'asc' | 'desc' | null>(null); // For company status sorting
  companyFilterStatus = signal<'active' | 'inactive' | null>(null); // For company filter: active, inactive, or null (all)
  showEditEmployeeStatusMenu = false;
  companyNameSortDirection = signal<'asc' | 'desc' | null>(null); // For company name sorting
  employeeStatusOptions: Array<{ label: string; value: 'active' | 'pending' | 'inactive' }> = [
    { label: 'Active', value: 'active' },
    { label: 'Pending', value: 'pending' },
    { label: 'Inactive', value: 'inactive' }
  ];

  /**
   * Report tab (company) — v1 focuses on: "How utilized are our meeting rooms this period?"
   *
   * Data sources today:
   * - Real: `activeEmployees` from `this.employees` (status === 'active'); room names/locations from `this.rooms` after `loadRooms()`.
   * - Mock (until backend exists): total bookings, utilization %, utilization trend, bookings-by-hour, per-room bookings/hours — replace with e.g. GET /api/report/summary?period=&building=
   */
  reportPeriod = signal<'thisWeek' | 'thisMonth' | 'last30Days'>('thisMonth');
  reportBuildingFilter = signal<string>('all');

  employees: EmployeeDisplay[] = [];

  // Company Admins
  allAdmins: AdminDisplay[] = [];
  loadingAdmins = false;
  adminToDelete: AdminDisplay | null = null;
  private readonly adminsCacheTtlMs = 60_000;
  private adminsCacheUpdatedAt = 0;
  private adminsCacheDirty = true;
  firstAdmin = signal<number>(0);
  rowsAdmin = signal<number>(10);
  adminNameSortDirection = signal<'asc' | 'desc' | null>(null);
  adminEmailSortDirection = signal<'asc' | 'desc' | null>(null);
  adminCompanySortDirection = signal<'asc' | 'desc' | null>(null);
  adminStatusSortDirection = signal<'asc' | 'desc' | null>(null);

  // Get sorted admins (without pagination)
  get sortedAdmins(): AdminDisplay[] {
    let sortedAdmins = [...this.allAdmins];
    
    // Apply sorting based on active sort direction
    const nameSort = this.adminNameSortDirection();
    const emailSort = this.adminEmailSortDirection();
    const companySort = this.adminCompanySortDirection();
    const statusSort = this.adminStatusSortDirection();
    
    if (nameSort) {
      sortedAdmins = sortedAdmins.sort((a, b) => {
        const aName = `${a.firstName} ${a.lastName}`.toLowerCase();
        const bName = `${b.firstName} ${b.lastName}`.toLowerCase();
        if (nameSort === 'asc') {
          return aName.localeCompare(bName);
        } else {
          return bName.localeCompare(aName);
        }
      });
    } else if (emailSort) {
      sortedAdmins = sortedAdmins.sort((a, b) => {
        const aEmail = (a.email || '').toLowerCase();
        const bEmail = (b.email || '').toLowerCase();
        if (emailSort === 'asc') {
          return aEmail.localeCompare(bEmail);
        } else {
          return bEmail.localeCompare(aEmail);
        }
      });
    } else if (companySort) {
      sortedAdmins = sortedAdmins.sort((a, b) => {
        const aCompany = (a.companyName || 'N/A').toLowerCase();
        const bCompany = (b.companyName || 'N/A').toLowerCase();
        if (companySort === 'asc') {
          return aCompany.localeCompare(bCompany);
        } else {
          return bCompany.localeCompare(aCompany);
        }
      });
    } else if (statusSort) {
      sortedAdmins = sortedAdmins.sort((a, b) => {
        const aStatus = a.status || 'inactive';
        const bStatus = b.status || 'inactive';
        const statusValue: { [key: string]: number } = {
          'active': 2,
          'pending': 1,
          'inactive': 0
        };
        const aValue = statusValue[aStatus] || 0;
        const bValue = statusValue[bStatus] || 0;
        if (statusSort === 'asc') {
          return bValue - aValue; // Active first
        } else {
          return aValue - bValue; // Inactive first
        }
      });
    }
    
    return sortedAdmins;
  }

  // Get paginated admins
  get paginatedAdmins(): AdminDisplay[] {
    const sorted = this.sortedAdmins;
    const start = this.firstAdmin();
    const end = start + this.rowsAdmin();
    return sorted.slice(start, end);
  }

  // Get total records for paginator (sorted admins count)
  get totalAdminsRecords(): number {
    return this.sortedAdmins.length;
  }

  @ViewChild('companyPeriodDropdown') companyPeriodDropdownRef!: ElementRef;
  @ViewChild('industryDropdown') industryDropdownRef!: ElementRef;

  // Industry dropdown state
  showIndustryDropdown = signal<boolean>(false);
  industries = signal<string[]>(['Technology', 'Finance', 'Healthcare']);
  showAddIndustryInput = signal<boolean>(false);
  newIndustryName = signal<string>('');
  newIndustryNameInput = ''; // For ngModel binding

  // Phone validation state
  phoneError = signal<string>('');

  // Create company step state
  createCompanyStep = signal<1 | 2>(1); // 1: Company Information, 2: Invite Admins
  createdCompanyId = signal<string | null>(null);
  createdCompanyName = signal<string | null>(null);
  adminEmails = signal<string[]>([]);
  newAdminEmail = signal<string>('');
  newAdminEmailInput = ''; // For ngModel binding

  // Employee email management
  employeeEmails = signal<string[]>([]);
  newEmployeeEmailInput = ''; // For ngModel binding

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (this.showPeriodDropdown() && this.periodDropdownRef) {
      const target = event.target as HTMLElement;
      if (!this.periodDropdownRef.nativeElement.contains(target)) {
        this.showPeriodDropdown.set(false);
      }
    }
    if (this.showCompanyPeriodDropdown() && this.companyPeriodDropdownRef) {
      const target = event.target as HTMLElement;
      if (!this.companyPeriodDropdownRef.nativeElement.contains(target)) {
        this.showCompanyPeriodDropdown.set(false);
      }
    }
    if (this.showIndustryDropdown() && this.industryDropdownRef) {
      const target = event.target as HTMLElement;
      if (!this.industryDropdownRef.nativeElement.contains(target)) {
        this.showIndustryDropdown.set(false);
        this.showAddIndustryInput.set(false);
        this.newIndustryName.set('');
      }
    }
    // Close popover when clicking outside
    if (this.op) {
      const target = event.target as HTMLElement;
      // Check if popover is visible by checking if it exists in DOM
      const popoverElement = document.querySelector('.p-popover');
      if (popoverElement) {
        // Check if click is on any action button (three-dots, edit, delete) or their children
        const isActionButton = target.closest('.companies-action-buttons') || 
                              target.closest('.companies-three-dots-btn') ||
                              target.closest('.companies-edit-button') ||
                              target.closest('.companies-delete-button');
        // Check if click is inside the popover content
        const isInsidePopover = popoverElement.contains(target);
        
        // Close if clicking outside both the action buttons and the popover
        if (!isActionButton && !isInsidePopover) {
          this.op.hide();
        }
      }
    }
  }

  @HostListener('document:keydown.escape', ['$event'])
  onEscapeKey(event: Event) {
    // Only handle Esc if no modal is open
    if (this.modal()) {
      // Let modals handle Esc themselves
      return;
    }
    
    // Prevent Esc from closing the drawer
    if (this.sidebarOpen()) {
      this.isEscKeyPressed = true; // Set flag to track Esc key press
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      // Keep drawer open - don't close it
      this.sidebarOpen.set(true);
      // Reset flag after a short delay
      setTimeout(() => {
        this.isEscKeyPressed = false;
      }, 100);
    }
  }

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent) {
    // Allow Ctrl+B or Cmd+B to toggle sidebar
    if ((event.ctrlKey || event.metaKey) && event.key === 'b') {
      event.preventDefault();
      this.toggleSidebar();
    }
  }

  // Employee invitation form (kept for backward compatibility, but not used in new UI)
  inviteEmployeeForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  // Success response data
  invitationResponse: {
    message?: string;
    invitationLink?: string;
    token?: string;
  } | null = null;

  console = console;

  // Responsive options for Galleria
  responsiveOptions: any[] = [
    {
      breakpoint: '1024px',
      numVisible: 3
    },
    {
      breakpoint: '768px',
      numVisible: 2
    },
    {
      breakpoint: '560px',
      numVisible: 1
    }
  ];

  // Company detail popover
  toggle(event: any, company: any) {
    this.selectedCompany = company;
    this.op.toggle(event);
  }

  onRowClick(company: CompanyWithDetails) {
    // Row click no longer opens detail view - only Edit icon does
    // This method is kept for potential future use
  }

  onShowDetail() {
    this.op.hide();
    this.showDetail.set(true);
  }

  onCloseDetail() {
    this.showDetail.set(false);
    this.selectedCompany = null;
  }

  onEditCompany(companyData?: any) {
    // This is called from the detail form's Save button
    if (!companyData || !this.selectedCompany?.id) {
      return;
    }

    // Validate required fields
    if (!companyData.name || !companyData.address || !companyData.industry) {
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Please fill in all required fields',
        life: 3000
      });
      return;
    }

    const companyToUpdate = {
      name: companyData.name,
      status: companyData.status,
      industry: companyData.industry,
      address: companyData.address,
      phone: companyData.phone,
      logoUrl: companyData.logoUrl
    };

    this.authSer.updateCompany(this.selectedCompany.id, companyToUpdate).subscribe({
      next: (res: any) => {
        console.log('Company updated successfully:', res);
        this.msgService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Company updated successfully!',
          life: 3000
        });
        // Reload companies list
        this.loadCompanies();
        // Close detail view
        this.onCloseDetail();
      },
      error: (error) => {
        console.error('Error updating company:', error);
        const errorMessage = error.error?.message || error.message || 'Failed to update company. Please try again.';
        this.msgService.add({
          severity: 'error',
          summary: 'Error',
          detail: errorMessage,
          life: 3000
        });
      }
    });
  }

  onEditCompanyClick(company: CompanyWithDetails) {
    this.selectedCompany = company;
    this.showDetail.set(true);
  }

  onDeleteCompanyClick(company: CompanyWithDetails) {
    this.selectedCompany = company;
    this.onShowDeleteCompany();
  }

  onShowCreateAdmin() {
    this.op.hide();
    this.showCreateAdmin.set(true);
  }

  onCloseCreateAdmin() {
    this.showCreateAdmin.set(false);
    this.selectedCompany = null;
  }

  onShowDeleteAdmin() {
    this.op.hide();
    this.showDeleteAdmin.set(true);
  }

  onCloseDeleteAdmin() {
    this.showDeleteAdmin.set(false);
    this.selectedCompany = null;
  }

  onShowUpdateAdmin(admin: User | AdminDisplay) {
    // Convert AdminDisplay to User format if needed
    const userAdmin: User = {
      id: admin.id || '',
      firstName: admin.firstName,
      lastName: admin.lastName,
      email: admin.email,
      status: admin.status || 'active'
    };
    this.selectedAdmin = userAdmin;
    
    // If admin has companyId, find and set the selected company
    if ('companyId' in admin && admin.companyId) {
      // Try to find company from existing companies list
      const company = this.companies.find(c => c.id === admin.companyId);
      if (company) {
        this.selectedCompany = company;
      } else {
        // If company not found in list, create a minimal company object
        this.selectedCompany = {
          id: admin.companyId,
          name: ('companyName' in admin && admin.companyName) ? admin.companyName : '',
          address: '',
          industry: '',
          status: 'active'
        };
      }
    }
    
    this.showUpdateAdmin.set(true);
  }

  onCloseUpdateAdmin() {
    this.showUpdateAdmin.set(false);
    this.selectedAdmin = null;
  }

  onAdminUpdated() {
    // Reload admins in detail view if it's open
    if (this.showDetail() && this.selectedCompany) {
      // The detail component will reload when it detects company change
      // We can trigger a reload by toggling the detail view
      const currentCompany = this.selectedCompany;
      this.showDetail.set(false);
      setTimeout(() => {
        this.selectedCompany = currentCompany;
        this.showDetail.set(true);
      }, 0);
    }
    
    this.onAdminCrudSuccess();
  }

  onAdminCrudSuccess() {
    this.adminsCacheDirty = true;
    // Refresh immediately if user is on admins tab
    if (this.view() === 'admins' && this.role() === 'system') {
      this.loadAndLogCompanyAdmins(true);
    }
  }

  onUpdateAdminFromDetail(admin: User) {
    this.selectedAdmin = admin;
    this.showUpdateAdmin.set(true);
  }

  onShowDeleteCompany() {
    this.op.hide();
    this.showDeleteCompany.set(true);
  }

  onCloseDeleteCompany() {
    this.showDeleteCompany.set(false);
    this.selectedCompany = null;
  }

  onCompanyDeleted() {
    // Reset to first page after deletion
    this.first.set(0);
    // Refresh companies list after deletion
    this.loadCompanies();
  }

  // Pagination state (companies)
  first = signal<number>(0);
  rows = signal<number>(10);
  rowsPerPageOptions = [5, 10, 15, 20, 50];

  // Pagination state (employees — company view)
  firstEmployee = signal<number>(0);
  rowsEmployee = signal<number>(10);

  companies: CompanyWithDetails[] = [];

  // Form model for creating a new company
  newCompany: Company = {
    name: '',
    address: '',
    industry: '',
    phone: '',
    logoUrl: '',
    status: 'active'
  };

  // Logo upload properties
  logoPreview: string | null = null;
  logoFile: File | null = null;
  logoFileSizeError = signal<string>('');

  // Form model for creating a new room
  newRoom: Room = {
    name: '',
    capacity: 0,
    availableFrom: '',
    availableTo: '',
    location: '',
    timezone: 'UTC'
  };

  // Form model for editing a room
  editRoom: {
    id?: string | number;
    name: string;
    capacity: number;
    availableFrom: string;
    availableTo: string;
    location: string;
  } = {
      id: undefined,
      name: '',
      capacity: 0,
      availableFrom: '',
      availableTo: '',
      location: ''
    };

  // Form model for editing an employee
  editEmployee: {
    id?: string;
    firstName: string;
    lastName: string;
    email: string;
    department?: string;
    role?: string;
    status?: 'active' | 'inactive' | 'pending';
  } = {
      id: undefined,
      firstName: '',
      lastName: '',
      email: '',
      department: '',
      role: '',
      status: 'active'
    };

  // Employee status change debouncing
  private employeeStatusChangeSubject = new Subject<string>();
  private employeeStatusDestroy$ = new Subject<void>();
  private previousEmployeeStatus: 'active' | 'inactive' | 'pending' = 'active';
  updatingEmployeeStatus = false;

  constructor(private fb: FormBuilder, private router: Router) { }

  ngOnInit(): void {
    // Restore previously selected tab on refresh.
    this.view.set(this.getInitialView());

    // After sign-in success (system admin), auth sets a flag so we load companies here
    if (this.authSer.getAndClearShouldLoadCompanies()) {
      this.role.set('system');
      this.ensureViewAllowedForRole();
      this.loadCompanies();
      this.loadCurrentViewDataOnRefresh();
    } else {
      // First check role from localStorage
      const savedRole = this.authSer.getRole();
      if (savedRole === 'system_admin' || savedRole === 'sys_admin' || savedRole === 'system') {
        this.role.set('system');
        this.ensureViewAllowedForRole();
        this.loadCompanies();
        this.loadCurrentViewDataOnRefresh();
      } else if (savedRole === 'company_admin' || savedRole === 'company') {
        this.role.set('company');
        this.ensureViewAllowedForRole();
        this.loadCurrentViewDataOnRefresh();
      }
    }

    // Then fetch current user to update role and get user info
    this.checkCurrentRole();

    // Setup debounced employee status change handler
    this.employeeStatusChangeSubject.pipe(
      debounceTime(500), // 500ms delay
      distinctUntilChanged(),
      takeUntil(this.employeeStatusDestroy$)
    ).subscribe((status: string) => {
      this.updateEmployeeStatus(status);
    });
  }

  ngOnDestroy(): void {
    this.employeeStatusDestroy$.next();
    this.employeeStatusDestroy$.complete();
  }

  checkCurrentRole() {
    this.loading.begin();
    this.authSer.getCurrentUser().pipe(
      finalize(() => this.loading.end())
    ).subscribe({
      next: (res: any) => {
        console.log('Current user info:', res);
        // Extract user data from response
        const userData = res.data || res;

        // Store user name and company info
        this.currentUser.set({
          firstName: userData?.firstName,
          lastName: userData?.lastName,
          companyName: userData?.company?.name || userData?.companyName
        });

        // Extract role from response and save to localStorage
        if (userData?.role || res.role) {
          const userRole = userData?.role || res.role;
          // Save role to localStorage
          this.authSer.setRole(userRole);
        }

        // Use getRole() to check and set component role
        const savedRole = this.authSer.getRole();
        if (savedRole === 'system_admin' || savedRole === 'sys_admin' || savedRole === 'system') {
          this.role.set('system');
          this.ensureViewAllowedForRole();
          // Only load companies if user is system admin
          this.loadCompanies();
          this.loadCurrentViewDataOnRefresh();
        } else if (savedRole === 'company_admin' || savedRole === 'company') {
          this.role.set('company');
          this.ensureViewAllowedForRole();
          // Don't load companies for company admin
          this.loadCurrentViewDataOnRefresh();
        }
      },
      error: (error) => {
        console.error('Error getting current user:', error);
        // Fallback to role from localStorage if API call fails
        const savedRole = this.authSer.getRole();
        if (savedRole === 'system_admin' || savedRole === 'sys_admin' || savedRole === 'system') {
          this.role.set('system');
          this.ensureViewAllowedForRole();
          // Only load companies if user is system admin
          this.loadCompanies();
          this.loadCurrentViewDataOnRefresh();
        } else if (savedRole === 'company_admin' || savedRole === 'company') {
          this.role.set('company');
          this.ensureViewAllowedForRole();
          this.loadCurrentViewDataOnRefresh();
        }
      }
    });
  }

  rooms: RoomDisplay[] = [];

  // Get sorted rooms based on status sort direction
  get sortedRooms(): RoomDisplay[] {
    const roomsList = [...this.rooms];
    const sortDir = this.statusSortDirection();

    if (sortDir === null) {
      return roomsList; // No sorting
    }

    return roomsList.sort((a, b) => {
      const aStatus = a.status || 'inactive';
      const bStatus = b.status || 'inactive';

      // Active = 1, Inactive = 0
      const aValue = aStatus === 'active' ? 1 : 0;
      const bValue = bStatus === 'active' ? 1 : 0;

      if (sortDir === 'asc') {
        // Active first (1 comes before 0)
        return bValue - aValue;
      } else {
        // Inactive first (0 comes before 1)
        return aValue - bValue;
      }
    });
  }

  // Toggle status sort direction
  toggleStatusSort() {
    const current = this.statusSortDirection();
    if (current === null) {
      this.statusSortDirection.set('asc'); // Active first
    } else if (current === 'asc') {
      this.statusSortDirection.set('desc'); // Inactive first
    } else {
      this.statusSortDirection.set(null); // No sort
    }
  }

  // Get sorted employees — only one column active at a time.
  get sortedEmployees(): EmployeeDisplay[] {
    const list = [...this.employees];

    const firstName = this.employeeFirstNameSortDirection();
    const lastName = this.employeeLastNameSortDirection();
    const email = this.employeeEmailSortDirection();
    const department = this.employeeDepartmentSortDirection();
    const role = this.employeeRoleSortDirection();
    const status = this.employeeStatusSortDirection();

    const strCompare = (a: string, b: string, dir: 'asc' | 'desc') =>
      dir === 'asc' ? a.localeCompare(b) : b.localeCompare(a);

    if (firstName) {
      return list.sort((a, b) =>
        strCompare((a.firstName || '').toLowerCase(), (b.firstName || '').toLowerCase(), firstName));
    }
    if (lastName) {
      return list.sort((a, b) =>
        strCompare((a.lastName || '').toLowerCase(), (b.lastName || '').toLowerCase(), lastName));
    }
    if (email) {
      return list.sort((a, b) =>
        strCompare((a.email || '').toLowerCase(), (b.email || '').toLowerCase(), email));
    }
    if (department) {
      return list.sort((a, b) =>
        strCompare((a.department || '').toLowerCase(), (b.department || '').toLowerCase(), department));
    }
    if (role) {
      return list.sort((a, b) =>
        strCompare((a.role || '').toLowerCase(), (b.role || '').toLowerCase(), role));
    }
    if (status) {
      const weight: { [key: string]: number } = { active: 2, pending: 1, inactive: 0 };
      return list.sort((a, b) => {
        const aW = weight[a.status || 'inactive'] ?? 0;
        const bW = weight[b.status || 'inactive'] ?? 0;
        return status === 'asc' ? bW - aW : aW - bW;
      });
    }

    return list;
  }

  /** Employees for current page (after sort) */
  get paginatedEmployees(): EmployeeDisplay[] {
    const sorted = this.sortedEmployees;
    const start = this.firstEmployee();
    const end = start + this.rowsEmployee();
    return sorted.slice(start, end);
  }

  get totalEmployeesRecords(): number {
    return this.employees.length;
  }

  onEmployeePageChange(event: { first?: number; rows?: number }): void {
    if (event.first !== undefined) this.firstEmployee.set(event.first);
    if (event.rows !== undefined) this.rowsEmployee.set(event.rows);
  }

  private reportMockSeed(): number {
    return this.reportMockSeedFor(this.reportPeriod(), this.reportBuildingFilter());
  }

  private reportMockSeedFor(period: 'thisWeek' | 'thisMonth' | 'last30Days', building: string): number {
    return this.simpleHash(`${period}|${building}|${this.rooms.length}`);
  }

  private reportPeriodDayCount(): number {
    return this.reportPeriodDayCountFor(this.reportPeriod());
  }

  private reportPeriodDayCountFor(period: 'thisWeek' | 'thisMonth' | 'last30Days'): number {
    switch (period) {
      case 'thisWeek':
        return 7;
      case 'thisMonth':
      case 'last30Days':
        return 30;
    }
  }

  /** Rooms included in report after building filter */
  get reportRoomsFiltered(): RoomDisplay[] {
    const filt = this.reportBuildingFilter();
    if (filt === 'all') return [...this.rooms];
    return this.rooms.filter((r) => {
      const loc = (r.location || '').trim();
      return loc.startsWith(filt) || loc.split(',')[0]?.trim() === filt;
    });
  }

  get reportBuildingOptions(): { value: string; label: string }[] {
    const opts: { value: string; label: string }[] = [{ value: 'all', label: 'All buildings' }];
    const seen = new Set<string>();
    for (const r of this.rooms) {
      const first = (r.location || '').split(',')[0]?.trim();
      if (first && !seen.has(first)) {
        seen.add(first);
        opts.push({ value: first, label: first });
      }
    }
    return opts;
  }

  get reportSummaryKpis(): {
    totalBookings: number;
    utilizationPct: number;
    peakDayLabel: string;
    activeEmployees: number;
  } {
    return this.reportSummaryKpisFor(this.reportPeriod());
  }

  private reportSummaryKpisFor(period: 'thisWeek' | 'thisMonth' | 'last30Days'): {
    totalBookings: number;
    utilizationPct: number;
    peakDayLabel: string;
    activeEmployees: number;
  } {
    const seed = this.reportMockSeedFor(period, this.reportBuildingFilter());
    const days = this.reportPeriodDayCountFor(period);
    const base = 10 + (Math.abs(seed) % 35);
    const totalBookings = Math.max(0, base * Math.min(days, 14) + (Math.abs(seed) % 20));
    const utilizationPct = 32 + (Math.abs(seed) % 58);
    const peakDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const peakDayLabel = peakDays[Math.abs(seed) % peakDays.length];
    const activeEmployees = this.employees.filter((e) => e.status === 'active').length;
    return { totalBookings, utilizationPct, peakDayLabel, activeEmployees };
  }

  /** Utilization trend (mock %) — one row per day (week) or per week chunk (month) */
  get reportUtilizationTrend(): { label: string; pct: number }[] {
    const seed = this.reportMockSeed();
    const period = this.reportPeriod();
    if (period === 'thisWeek') {
      const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      return labels.map((label, i) => ({
        label,
        pct: 25 + ((Math.abs(seed) + i * 11) % 65)
      }));
    }
    const labels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
    return labels.map((label, i) => ({
      label,
      pct: 30 + ((Math.abs(seed) + i * 17) % 60)
    }));
  }

  /** Bookings by hour of day (mock) — 8:00–18:00 */
  get reportBookingsByHour(): { hour: number; count: number }[] {
    const seed = this.reportMockSeed();
    const rows: { hour: number; count: number }[] = [];
    for (let h = 8; h <= 18; h++) {
      rows.push({
        hour: h,
        count: 2 + ((Math.abs(seed) + h * 13) % 28)
      });
    }
    return rows;
  }

  get reportBookingsByHourMax(): number {
    const rows = this.reportBookingsByHour;
    return Math.max(1, ...rows.map((r) => r.count));
  }

  get reportTopRooms(): {
    roomName: string;
    location: string;
    bookings: number;
    hours: number;
  }[] {
    const seed = this.reportMockSeed();
    const filtered = this.reportRoomsFiltered;
    const fallback = [
      { name: 'Conference Room A', location: 'Building A' },
      { name: 'Boardroom', location: 'Building B' },
      { name: 'Huddle Space', location: 'Building B' }
    ];
    const source =
      filtered.length > 0
        ? filtered.map((r) => ({ name: r.name, location: r.location || '—' }))
        : fallback;
    const rows = source.map((r, i) => {
      const b = 5 + ((Math.abs(seed) + i * 19) % 120);
      const hrs = Math.round((b * 0.45 + (i % 5)) * 10) / 10;
      return {
        roomName: r.name,
        location: r.location,
        bookings: b,
        hours: hrs
      };
    });
    return [...rows].sort((a, b) => b.bookings - a.bookings);
  }

  downloadReportTopRoomsCsv(): void {
    const rows = this.reportTopRooms;
    const header = 'Room,Location,Bookings,Hours booked';
    const lines = [
      header,
      ...rows.map((r) =>
        [r.roomName, r.location, String(r.bookings), String(r.hours)]
          .map((c) => `"${String(c).replace(/"/g, '""')}"`)
          .join(',')
      )
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `meeting-room-report-${this.reportPeriod()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  onCompanyPeriodSelect(periodLabel: 'This week' | 'This month'): void {
    this.selectedCompanyPeriod.set(periodLabel);
    this.reportPeriod.set(periodLabel === 'This week' ? 'thisWeek' : 'thisMonth');
    this.showCompanyPeriodDropdown.set(false);
  }

  onSystemPeriodSelect(periodLabel: 'This week' | 'This month'): void {
    this.selectedPeriod.set(periodLabel);
    this.reportPeriod.set(periodLabel === 'This week' ? 'thisWeek' : 'thisMonth');
    this.showPeriodDropdown.set(false);
  }

  onUtilizationPeriodChange(period: 'Today' | 'Week' | 'Month'): void {
    this.selectedUtilizationPeriod.set(period);
    if (period === 'Today' || period === 'Week') {
      this.reportPeriod.set('thisWeek');
      this.selectedCompanyPeriod.set('This week');
      return;
    }
    this.reportPeriod.set('thisMonth');
    this.selectedCompanyPeriod.set('This month');
  }

  get companyDashboardKpis(): Array<{
    label: string;
    value: string;
    change: string;
    changeType: 'increase' | 'decrease';
    lastMonth: string;
  }> {
    const summary = this.reportSummaryKpis;
    const previousPeriod = this.reportPeriod() === 'thisWeek' ? 'thisMonth' : 'thisWeek';
    const previousSummary = this.reportSummaryKpisFor(previousPeriod);
    const totalRooms = this.rooms.length;
    const activeRooms = this.rooms.filter((r) => (r.status || '').toLowerCase() === 'active').length;
    const inactiveRooms = Math.max(0, totalRooms - activeRooms);
    const totalEmployees = this.employees.length;
    const activeEmployees = summary.activeEmployees;
    const previousBookings = Math.max(1, previousSummary.totalBookings);
    const bookingDeltaPct = Math.round(((summary.totalBookings - previousBookings) / previousBookings) * 100);

    return [
      {
        label: 'Meeting Rooms',
        value: `${totalRooms}`,
        change: `${Math.round((activeRooms / Math.max(1, totalRooms)) * 100)}% active`,
        changeType: inactiveRooms <= activeRooms ? 'increase' : 'decrease',
        lastMonth: `${inactiveRooms} inactive`
      },
      {
        label: 'Active Employees',
        value: `${activeEmployees}`,
        change: `${Math.round((activeEmployees / Math.max(1, totalEmployees)) * 100)}% of employees`,
        changeType: activeEmployees >= Math.ceil(totalEmployees * 0.65) ? 'increase' : 'decrease',
        lastMonth: `${Math.max(0, totalEmployees - activeEmployees)} not active`
      },
      {
        label: 'Bookings',
        value: `${summary.totalBookings}`,
        change: `${Math.abs(bookingDeltaPct)}%`,
        changeType: bookingDeltaPct >= 0 ? 'increase' : 'decrease',
        lastMonth: `Peak day: ${summary.peakDayLabel}`
      }
    ];
  }

  get companyDashboardTopRooms(): Array<{
    roomName: string;
    location: string;
    bookings: number;
    hours: number;
    usagePct: number;
  }> {
    const top = this.reportTopRooms.slice(0, 5);
    const maxHours = Math.max(1, ...top.map((r) => r.hours));
    return top.map((r) => ({
      ...r,
      usagePct: Math.max(8, Math.min(100, Math.round((r.hours / maxHours) * 100)))
    }));
  }

  get companyDashboardBookingsByHourPreview(): Array<{
    label: string;
    count: number;
    pct: number;
  }> {
    const rows = this.reportBookingsByHour;
    const max = this.reportBookingsByHourMax;
    return rows
      .map((r) => ({
        label: `${String(r.hour).padStart(2, '0')}:00`,
        count: r.count,
        pct: Math.round((r.count / max) * 100)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }

  get companyDashboardTrendSummary(): {
    avgUtilization: number;
    maxUtilization: number;
    minUtilization: number;
  } {
    const rows = this.reportUtilizationTrend;
    const pcts = rows.map((r) => r.pct);
    const avgUtilization = Math.round(pcts.reduce((sum, x) => sum + x, 0) / Math.max(1, pcts.length));
    return {
      avgUtilization,
      maxUtilization: Math.max(...pcts),
      minUtilization: Math.min(...pcts)
    };
  }

  get companyDashboardOperationalInsights(): Array<{ label: string; value: string; tone: 'good' | 'warn' | 'danger' }> {
    const topRooms = this.companyDashboardTopRooms;
    const overused = topRooms.filter((r) => r.usagePct >= 80).length;
    const underused = topRooms.filter((r) => r.usagePct <= 25).length;
    const activeEmployees = this.reportSummaryKpis.activeEmployees;
    const employeeCount = Math.max(1, this.employees.length);
    const activeEmployeeRatio = Math.round((activeEmployees / employeeCount) * 100);
    const totalRooms = Math.max(1, this.rooms.length);
    const activeRooms = this.rooms.filter((r) => (r.status || '').toLowerCase() === 'active').length;
    const activeRoomRatio = Math.round((activeRooms / totalRooms) * 100);

    return [
      {
        label: 'Overused rooms',
        value: `${overused} room${overused === 1 ? '' : 's'} above 80%`,
        tone: overused > 1 ? 'warn' : 'good'
      },
      {
        label: 'Underused rooms',
        value: `${underused} room${underused === 1 ? '' : 's'} below 25%`,
        tone: underused > 1 ? 'danger' : 'good'
      },
      {
        label: 'Active employee ratio',
        value: `${activeEmployeeRatio}% currently active`,
        tone: activeEmployeeRatio >= 65 ? 'good' : 'warn'
      },
      {
        label: 'Active room ratio',
        value: `${activeRoomRatio}% rooms available`,
        tone: activeRoomRatio >= 70 ? 'good' : 'warn'
      }
    ];
  }

  get systemDashboardBookingsByHourPreview(): Array<{ label: string; count: number; pct: number }> {
    const rows = this.reportBookingsByHour;
    const max = this.reportBookingsByHourMax;
    return rows
      .map((r) => ({
        label: `${String(r.hour).padStart(2, '0')}:00`,
        count: r.count,
        pct: Math.round((r.count / max) * 100)
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);
  }

  get systemDashboardTopCompanies(): Array<{ name: string; admins: number; users: number; healthPct: number }> {
    const rows = (this.companies || []).map((company) => {
      const admins = company.admins ?? 0;
      const users = company.total ?? 0;
      const healthPct = Math.max(8, Math.min(100, Math.round(((admins + users) / Math.max(1, users + 2)) * 100)));
      return {
        name: company.name || 'Unknown company',
        admins,
        users,
        healthPct
      };
    });
    return rows.sort((a, b) => b.users - a.users).slice(0, 5);
  }

  get systemDashboardOperationalInsights(): Array<{ label: string; value: string; tone: 'good' | 'warn' | 'danger' }> {
    const total = this.companies.length;
    const active = this.companies.filter((c) => c.status === 'active').length;
    const inactive = this.companies.filter((c) => c.status === 'inactive').length;
    const pending = this.companies.filter((c) => c.status === 'pending').length;
    const noAdmin = this.companies.filter((c) => (c.admins ?? 0) === 0).length;
    const activeRatio = Math.round((active / Math.max(1, total)) * 100);

    return [
      {
        label: 'Active company ratio',
        value: `${activeRatio}% (${active}/${Math.max(1, total)})`,
        tone: activeRatio >= 70 ? 'good' : 'warn'
      },
      {
        label: 'Inactive companies',
        value: `${inactive} company${inactive === 1 ? '' : 'ies'} need reactivation`,
        tone: inactive > 2 ? 'warn' : 'good'
      },
      {
        label: 'Pending onboarding',
        value: `${pending} waiting setup`,
        tone: pending > 0 ? 'warn' : 'good'
      },
      {
        label: 'No admin assigned',
        value: `${noAdmin} company${noAdmin === 1 ? '' : 'ies'} without admin`,
        tone: noAdmin > 0 ? 'danger' : 'good'
      }
    ];
  }

  readonly dashboardMetricDataSourceMap: Record<string, string> = {
    meetingRooms: 'real:this.rooms (replace with /api/rooms/summary)',
    activeEmployees: 'real:this.employees status (replace with /api/employees/summary)',
    bookings: 'mock:reportSummaryKpis.totalBookings (replace with /api/report/summary.totalBookings)',
    utilization: 'mock:reportSummaryKpis.utilizationPct (replace with /api/report/summary.utilizationPct)',
    bookingsByHour: 'mock:reportBookingsByHour (replace with /api/report/bookings-by-hour)',
    topRooms: 'mock:reportTopRooms (replace with /api/report/top-rooms)'
  };

  /** Cycles through asc -> desc -> null; resets all other employee sort columns. */
  private cycleEmployeeSort(
    target: ReturnType<typeof signal<'asc' | 'desc' | null>>,
    ...others: ReturnType<typeof signal<'asc' | 'desc' | null>>[]
  ) {
    const current = target();
    others.forEach(s => s.set(null));
    target.set(current === null ? 'asc' : current === 'asc' ? 'desc' : null);
  }

  toggleEmployeeFirstNameSort() {
    this.cycleEmployeeSort(this.employeeFirstNameSortDirection,
      this.employeeLastNameSortDirection, this.employeeEmailSortDirection,
      this.employeeDepartmentSortDirection, this.employeeRoleSortDirection,
      this.employeeStatusSortDirection);
  }

  toggleEmployeeLastNameSort() {
    this.cycleEmployeeSort(this.employeeLastNameSortDirection,
      this.employeeFirstNameSortDirection, this.employeeEmailSortDirection,
      this.employeeDepartmentSortDirection, this.employeeRoleSortDirection,
      this.employeeStatusSortDirection);
  }

  toggleEmployeeEmailSort() {
    this.cycleEmployeeSort(this.employeeEmailSortDirection,
      this.employeeFirstNameSortDirection, this.employeeLastNameSortDirection,
      this.employeeDepartmentSortDirection, this.employeeRoleSortDirection,
      this.employeeStatusSortDirection);
  }

  toggleEmployeeDepartmentSort() {
    this.cycleEmployeeSort(this.employeeDepartmentSortDirection,
      this.employeeFirstNameSortDirection, this.employeeLastNameSortDirection,
      this.employeeEmailSortDirection, this.employeeRoleSortDirection,
      this.employeeStatusSortDirection);
  }

  toggleEmployeeRoleSort() {
    this.cycleEmployeeSort(this.employeeRoleSortDirection,
      this.employeeFirstNameSortDirection, this.employeeLastNameSortDirection,
      this.employeeEmailSortDirection, this.employeeDepartmentSortDirection,
      this.employeeStatusSortDirection);
  }

  toggleEmployeeStatusSort() {
    this.cycleEmployeeSort(this.employeeStatusSortDirection,
      this.employeeFirstNameSortDirection, this.employeeLastNameSortDirection,
      this.employeeEmailSortDirection, this.employeeDepartmentSortDirection,
      this.employeeRoleSortDirection);
  }

  // Load employees (placeholder - will need API endpoint)
  loadEmployees() {
    this.loading.begin();
    this.employeeSer.getAllEmployees().pipe(
      finalize(() => this.loading.end())
    ).subscribe({
      next: (res: any) => {
        // EmployeeService returns an array, but keep defensive handling for older response shapes.
        if (Array.isArray(res)) this.employees = res;
        else if (Array.isArray(res?.data)) this.employees = res.data;
        else if (Array.isArray(res?.data?.employees)) this.employees = res.data.employees;
        else if (Array.isArray(res?.data?.data)) this.employees = res.data.data;
        else this.employees = [];
        const total = this.employees.length;
        if (this.firstEmployee() >= total && total > 0) {
          this.firstEmployee.set(Math.max(0, total - this.rowsEmployee()));
        }
        if (total === 0) this.firstEmployee.set(0);
      },
      error: (error) => {
        console.error('==>error loading employees: ', error);
        this.employees = []; // Ensure employees is always an array
        this.firstEmployee.set(0);
      }
    });
  }

  // Room images: Unsplash meeting/office photos; variety so each room gets a distinct image
  private static readonly ROOM_PHOTOS = [
    'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1556761175-5973dc0f32e7?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1593062096033-9a26dc09f2d5?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1573164713988-8665fc2effaa?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1568992687947-868a62a9f521?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1604328698692-f76ea9498e76?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1552664730-d307ca884978?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1556760544-74068565f05e?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1552581234-26160f608093?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1556761175-b19a2182beb8?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&h=600&fit=crop&q=80',
    'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&h=600&fit=crop&q=80'
  ] as const;

  getRoomImages(roomNameOrId: string | number): string[] {
    const seed = typeof roomNameOrId === 'string' ? roomNameOrId : String(roomNameOrId ?? '');
    const index = seed ? (Math.abs(this.simpleHash(seed)) % HomeComponent.ROOM_PHOTOS.length) : 0;
    const primary = HomeComponent.ROOM_PHOTOS[index];
    return [primary, primary, primary];
  }

  private simpleHash(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
    return h;
  }

  /** URLs that have successfully loaded – reuse one for cards whose image failed */
  successfulImageUrls = signal<Set<string>>(new Set());
  /** Room id -> URL to show (reused from a successfully loaded image when primary failed) */
  roomFallbackImageUrl = signal<Map<string | number, string>>(new Map());
  /** Only when primary failed and no successful image to reuse */
  roomImageLoadFailed = signal<Set<string | number>>(new Set());

  /** Always returns a URL so the card can display an image (never null). */
  getDisplayImageUrl(room: RoomDisplay): string {
    const id = room.id ?? '';
    if (room == null) return this.getPicsumRoomImageUrl('room');
    const fallback = this.roomFallbackImageUrl().get(id);
    if (fallback) return fallback;
    const fromImages = room.images?.[0];
    if (fromImages) return fromImages;
    if (room.featuredImageUrl) return room.featuredImageUrl;
    const fromApiSnake = (room as unknown as Record<string, unknown>)['featured_image_url'];
    if (fromApiSnake && typeof fromApiSnake === 'string') return fromApiSnake;
    if (this.roomImageLoadFailed().has(id)) return this.getPicsumRoomImageUrl((id || room.name) ?? 'room');
    const fromPool = this.getRoomImages(room.name ?? room.id ?? id)[0];
    return fromPool ?? this.getPicsumRoomImageUrl((id || room.name) ?? 'room');
  }

  onRoomImageLoad(event: Event): void {
    const src = (event.target as HTMLImageElement)?.src;
    if (src) this.successfulImageUrls.update((s) => new Set(s).add(src));
  }

  /** Picsum fallback so every room card gets an image when Unsplash fails */
  private getPicsumRoomImageUrl(roomIdOrIndex: string | number): string {
    const seed = encodeURIComponent(String(roomIdOrIndex));
    return `https://picsum.photos/seed/${seed}/800/600`;
  }

  onRoomImageError(room: RoomDisplay): void {
    if (room == null) return;
    const id = room.id ?? '';
    if (this.roomFallbackImageUrl().has(id)) {
      this.roomImageLoadFailed.update((s) => new Set(s).add(id));
      return;
    }
    const ok = this.successfulImageUrls();
    if (ok.size > 0) {
      const reuseUrl = ok.values().next().value as string;
      this.roomFallbackImageUrl.update((m) => {
        const next = new Map(m);
        next.set(id, reuseUrl);
        return next;
      });
    } else {
      // No other image loaded yet – use Picsum so this card still has a featured image
      const picsumUrl = this.getPicsumRoomImageUrl((id || room.name) ?? 'room');
      this.roomFallbackImageUrl.update((m) => {
        const next = new Map(m);
        next.set(id, picsumUrl);
        return next;
      });
    }
  }

  // All filtered companies (for pagination total count)
  get allFilteredCompanies(): CompanyWithDetails[] {
    // Safety check: ensure companies is always an array
    if (!Array.isArray(this.companies)) {
      return [];
    }
    const searchTerm = this.search().toLowerCase();
    let filtered = this.companies.filter(c => c.name && c.name.toLowerCase().includes(searchTerm));

    // Sort by Company Name
    const nameSort = this.companyNameSortDirection();
    if (nameSort) {
      filtered = [...filtered].sort((a, b) => {
        const aName = (a.name || '').toLowerCase();
        const bName = (b.name || '').toLowerCase();
        if (nameSort === 'asc') {
          return aName.localeCompare(bName);
        } else {
          return bName.localeCompare(aName);
        }
      });
    }

    // Sort by Industry
    const industrySort = this.companyIndustrySortDirection();
    if (industrySort) {
      filtered = [...filtered].sort((a, b) => {
        const aIndustry = (a.industry || '').toLowerCase();
        const bIndustry = (b.industry || '').toLowerCase();
        if (industrySort === 'asc') {
          return aIndustry.localeCompare(bIndustry);
        } else {
          return bIndustry.localeCompare(aIndustry);
        }
      });
    }

    // Sort by Status
    const statusSort = this.companyStatusSortDirection();
    if (statusSort) {
      filtered = [...filtered].sort((a, b) => {
        const aStatus = a.status || 'inactive';
        const bStatus = b.status || 'inactive';
        // Active = 2, Pending = 1, Inactive = 0
        const statusValue: { [key: string]: number } = {
          'active': 2,
          'pending': 1,
          'inactive': 0
        };
        const aValue = statusValue[aStatus] || 0;
        const bValue = statusValue[bStatus] || 0;
        if (statusSort === 'asc') {
          return bValue - aValue; // Active first
        } else {
          return aValue - bValue; // Inactive first
        }
      });
    }

    return filtered;
  }

  // Paginated companies for display
  get filteredCompanies(): CompanyWithDetails[] {
    const allFiltered = this.allFilteredCompanies;
    const start = this.first();
    const end = start + this.rows();
    return allFiltered.slice(start, end);
  }

  // Total records for paginator
  get totalRecords(): number {
    return this.allFilteredCompanies.length;
  }

  // Dashboard KPI Statistics
  get companyStatistics() {
    const allCompanies = this.companies || [];
    const total = allCompanies.length;
    const active = allCompanies.filter(c => c.status === 'active').length;
    const inactive = allCompanies.filter(c => c.status === 'inactive').length;
    const pending = allCompanies.filter(c => c.status === 'pending').length;
    
    const activePercent = total > 0 ? Math.round((active / total) * 100) : 0;
    const inactivePercent = total > 0 ? Math.round((inactive / total) * 100) : 0;
    
    return {
      total: {
        label: 'Total company',
        value: total.toString(),
        change: '12.0%', // TODO: Calculate from last month data if available
        changeType: 'positive' as const,
        subText: 'Last month: 1234', // TODO: Get from API if available
        isPurple: true
      },
      active: {
        label: 'Active',
        value: active.toString(),
        change: `${activePercent}% of total`,
        changeType: null,
        subText: null,
        isPurple: false
      },
      inactive: {
        label: 'Inactive',
        value: inactive.toString(),
        change: `${inactivePercent}% of total`,
        changeType: null,
        subText: null,
        isPurple: false
      },
      pending: {
        label: 'Pending',
        value: pending.toString(),
        change: 'Action needed',
        changeType: null,
        subText: null,
        isPurple: false
      }
    };
  }

  setRole(role: 'system' | 'company') {
    this.role.set(role);
    this.saveView('dashboard');
    this.view.set('dashboard');
  }

  setView(view: 'dashboard' | 'companies' | 'admins' | 'rooms' | 'employees' | 'report' | 'settings') {
    // Close any open modals when switching tabs (only if modal is actually open)
    if (this.modal()) {
      this.setModal('');
    }
    // Close the action options popover when switching tabs
    if (this.op) {
      this.op.hide();
    }
    this.view.set(view);
    this.saveView(view);
    if (view === 'companies') {
      this.first.set(0); // Reset to first page when switching to companies view
    }
    if (view === 'rooms' && this.role() === 'company') {
      // Load rooms when switching to rooms view
      this.loadRooms();
    }
    if (view === 'employees' && this.role() === 'company') {
      this.firstEmployee.set(0);
      // Load employees when switching to employees view
      this.loadEmployees();
    }
    if (view === 'report' && this.role() === 'company') {
      this.loadRooms();
      this.loadEmployees();
    }
    if (view === 'admins' && this.role() === 'system') {
      const cacheExpired = Date.now() - this.adminsCacheUpdatedAt > this.adminsCacheTtlMs;
      // Use cache during quick tab switches; refresh when dirty/expired/empty.
      if (this.adminsCacheDirty || cacheExpired || this.allAdmins.length === 0) {
        this.loadAndLogCompanyAdmins(true);
      }
    }
    // Clear invitation response when switching tabs
    this.invitationResponse = null;
  }

  private saveView(view: 'dashboard' | 'companies' | 'admins' | 'rooms' | 'employees' | 'report' | 'settings'): void {
    if (typeof window !== 'undefined') {
      localStorage.setItem(this.homeViewStorageKey, view);
      this.updateUrlTabParam(view);
    }
  }

  private getSavedView(): 'dashboard' | 'companies' | 'admins' | 'rooms' | 'employees' | 'report' | 'settings' | null {
    if (typeof window === 'undefined') {
      return null;
    }
    const savedView = localStorage.getItem(this.homeViewStorageKey);
    if (
      savedView === 'dashboard' ||
      savedView === 'companies' ||
      savedView === 'admins' ||
      savedView === 'rooms' ||
      savedView === 'employees' ||
      savedView === 'report' ||
      savedView === 'settings'
    ) {
      return savedView;
    }
    return null;
  }

  private getInitialView(): 'dashboard' | 'companies' | 'admins' | 'rooms' | 'employees' | 'report' | 'settings' {
    const urlView = this.getViewFromUrl();
    if (urlView) {
      return urlView;
    }
    return this.getSavedView() ?? 'dashboard';
  }

  private getViewFromUrl(): 'dashboard' | 'companies' | 'admins' | 'rooms' | 'employees' | 'report' | 'settings' | null {
    if (typeof window === 'undefined') {
      return null;
    }
    const value = new URL(window.location.href).searchParams.get('tab');
    if (
      value === 'dashboard' ||
      value === 'companies' ||
      value === 'admins' ||
      value === 'rooms' ||
      value === 'employees' ||
      value === 'report' ||
      value === 'settings'
    ) {
      return value;
    }
    return null;
  }

  private updateUrlTabParam(view: 'dashboard' | 'companies' | 'admins' | 'rooms' | 'employees' | 'report' | 'settings'): void {
    if (typeof window === 'undefined') {
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set('tab', view);
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }

  private ensureViewAllowedForRole(): void {
    const currentView = this.view();
    const allowedViews: Array<'dashboard' | 'companies' | 'admins' | 'rooms' | 'employees' | 'report' | 'settings'> =
      this.role() === 'system'
        ? ['dashboard', 'companies', 'admins', 'settings']
        : ['dashboard', 'rooms', 'employees', 'report', 'settings'];

    if (!allowedViews.includes(currentView)) {
      this.saveView('dashboard');
      this.view.set('dashboard');
    }
  }

  private loadCurrentViewDataOnRefresh(): void {
    if (this.view() === 'admins' && this.role() === 'system') {
      // Ensure admins data is fetched on browser refresh when "Company Admins" is the saved tab.
      this.loadAndLogCompanyAdmins(true);
    }
  }

  setAppThemeMode(mode: 'light' | 'dark'): void {
    this.layoutService.layoutConfig.update((s) => ({ ...s, darkTheme: mode === 'dark' }));
  }

  toggleAppThemeMode(): void {
    this.layoutService.layoutConfig.update((s) => ({ ...s, darkTheme: !s.darkTheme }));
  }

  onThemeToggleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggleAppThemeMode();
    }
  }

  get isDarkThemeEnabled(): boolean {
    return !!this.layoutService.layoutConfig().darkTheme;
  }

  get shouldDimGlobalThemeToggle(): boolean {
    return (
      !!this.modal() ||
      this.showDetail() ||
      this.showCreateAdmin() ||
      this.showDeleteAdmin() ||
      this.showUpdateAdmin() ||
      this.showDeleteCompany() ||
      !!this.adminToDelete ||
      !!this.roomToDelete ||
      this.modal() === 'editEmployee'
    );
  }

  setModal(modal: string) {
    this.modal.set(modal);
    if (modal !== 'editEmployee') {
      this.showEditEmployeeStatusMenu = false;
    }
    // Reset form when closing the create company modal
    if (modal !== 'createCompany') {
      this.newCompany = {
        name: '',
        address: '',
        industry: '',
        phone: '',
        logoUrl: '',
        status: 'active'
      };
      this.logoPreview = null;
      this.logoFile = null;
      // Reset industry dropdown state
      this.showIndustryDropdown.set(false);
      this.showAddIndustryInput.set(false);
      this.newIndustryNameInput = '';
      this.newIndustryName.set('');
      // Reset phone error
      this.phoneError.set('');
      // Reset create company step
      this.createCompanyStep.set(1);
      this.createdCompanyId.set(null);
      this.createdCompanyName.set(null);
      this.adminEmails.set([]);
      this.newAdminEmail.set('');
      this.newAdminEmailInput = '';
    }
    // Reset form when closing the add room modal
    if (modal !== 'addRoom') {
      this.newRoom = {
        name: '',
        capacity: 0,
        availableFrom: '',
        availableTo: '',
        location: '',
        timezone: 'UTC'
      };
    }
    // Reset form when closing the edit room modal
    if (modal !== 'editRoom') {
      this.editRoom = {
        id: undefined,
        name: '',
        capacity: 0,
        availableFrom: '',
        availableTo: '',
        location: ''
      };
    }
    // Reset room to delete when closing delete modal
    if (modal !== 'deleteRoom') {
      this.roomToDelete = null;
    }
    // Reset form when closing the invite employee modal
    if (modal !== 'inviteEmployee') {
      this.employeeEmails.set([]);
      this.newEmployeeEmailInput = '';
      this.invitationResponse = null;
    }
    // Reset form when closing the edit employee modal
    if (modal !== 'editEmployee') {
      this.editEmployee = {
        id: undefined,
        firstName: '',
        lastName: '',
        email: '',
        department: '',
        role: '',
        status: 'active'
      };
    }
  }

  onSearchChange(value: string) {
    this.search.set(value);
    this.first.set(0); // Reset to first page when searching
  }

  onPageChange(event: any) {
    this.first.set(event.first);
    this.rows.set(event.rows);
    // Load admin counts for the newly visible companies
    this.loadAdminCountsForVisibleCompanies();
  }

  getBadgeClass(status: string | undefined): string {
    const styles: { [key: string]: string } = {
      active: 'bg-green-100 text-green-800',
      inactive: 'bg-gray-100 text-gray-800',
      pending: 'bg-yellow-100 text-yellow-800',
    };
    return styles[status || 'inactive'] || styles['inactive'];
  }

  onLogout() {
    this.authSer.logout();
    this.router.navigate(['/landing']);
  }

  // Helper method to validate URL
  private isValidUrl(urlString: string): boolean {
    if (!urlString || urlString.trim() === '') {
      return false;
    }
    try {
      const url = new URL(urlString);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }

  // Validate phone number (must be numeric if provided)
  validatePhone(phone: string | undefined): boolean {
    if (!phone || phone.trim() === '') {
      return true; // Phone is optional
    }
    // Check if phone contains only digits (allowing spaces, dashes, parentheses for formatting)
    const phoneRegex = /^[\d\s\-\(\)]+$/;
    return phoneRegex.test(phone.trim());
  }

  // Check phone and update error state
  onPhoneChange(phone: string | undefined) {
    if (!phone || phone.trim() === '') {
      this.phoneError.set('');
      return;
    }
    if (!this.validatePhone(phone)) {
      this.phoneError.set('Phone number must contain only numbers');
    } else {
      this.phoneError.set('');
    }
  }

  // Check if all required fields are filled and phone is valid
  isCompanyFormValid(): boolean {
    const requiredFieldsValid = !!(
      this.newCompany.name?.trim() &&
      this.newCompany.address?.trim() &&
      this.newCompany.industry?.trim()
    );
    const phoneValid = this.validatePhone(this.newCompany.phone);
    return requiredFieldsValid && phoneValid;
  }

  onCreateCompany() {
    // Validate required fields
    if (!this.newCompany.name || !this.newCompany.address || !this.newCompany.industry) {
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Please fill in all required fields',
        sticky: true
      });
      return;
    }

    // Check if there's a file size error
    if (this.logoFileSizeError()) {
      this.msgService.add({
        severity: 'warn',
        summary: 'File Too Large',
        detail: 'Please choose a file smaller than 50MB',
        sticky: true
      });
      return;
    }

    // Validate phone number if provided
    if (this.newCompany.phone && !this.validatePhone(this.newCompany.phone)) {
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Phone number must contain only numbers',
        sticky: true
      });
      this.phoneError.set('Phone number must contain only numbers');
      return;
    }

    // Validate logoUrl if provided (only if it's a URL string, not a file)
    if (this.newCompany.logoUrl && !this.logoPreview && !this.isValidUrl(this.newCompany.logoUrl as string)) {
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Please enter a valid URL for the logo (e.g., https://example.com/logo.png) or leave it empty',
        sticky: true
      });
      return;
    }

    // Prepare company object
    const companyToCreate: Company = {
      name: this.newCompany.name.trim(),
      address: this.newCompany.address.trim(),
      industry: this.newCompany.industry.trim(),
      status: 'active' // Always set status to 'active'
    };

    // Include phone if provided
    if (this.newCompany.phone) {
      companyToCreate.phone = this.newCompany.phone.trim();
    }

    // Include logoUrl if provided (base64 from file upload or URL)
    if (this.logoPreview) {
      companyToCreate.logoUrl = this.logoPreview;
    } else if (this.newCompany.logoUrl && this.isValidUrl(this.newCompany.logoUrl as string)) {
      companyToCreate.logoUrl = (this.newCompany.logoUrl as string).trim();
    }

    this.authSer.createCompany(companyToCreate).subscribe({
      next: (res: any) => {
        console.log('Company created successfully - Full response:', res);
        // Store created company ID - check multiple possible response structures
        const companyId =
          res?.data?.id ||
          res?.data?.data?.id ||
          res?.id ||
          res?.data?.companyId ||
          res?.companyId ||
          (res?.data && typeof res.data === 'string' ? res.data : null) ||
          (res?.data && res.data?.company?.id ? res.data.company.id : null);

        console.log('Extracted companyId:', companyId);
        console.log('Response structure:', JSON.stringify(res, null, 2));

        if (companyId) {
          this.createdCompanyId.set(String(companyId));
          this.createdCompanyName.set(this.newCompany.name?.trim() ?? null);
          console.log('Saved companyId for step 2:', this.createdCompanyId());
        } else {
          console.error('Company ID not found in response. Response structure:', res);
          // Don't move to step 2 if companyId is not found
          this.msgService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Company created but ID not found in response. Please check console for details.',
            sticky: true
          });
          return;
        }
        // Show success toast - will move to step 2 when user closes it
        this.msgService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Company created successfully!',
          sticky: true,
          life: 0,
          closable: true
        });
        // Reset form (but keep modal open for step 2)
        this.newCompany = {
          name: '',
          address: '',
          industry: '',
          phone: '',
          logoUrl: '',
          status: 'active'
        };
        this.logoPreview = null;
        this.logoFile = null;
        this.logoFileSizeError.set('');
        // Refresh companies list
        this.loadCompanies();
        // Move to step 2 immediately (toast will show on top)
        this.createCompanyStep.set(2);
      },
      error: (error) => {
        console.error('Error creating company:', error);
        const errorMessage = error.error?.message || error.message || 'Failed to create company. Please try again.';
        this.msgService.add({
          severity: 'error',
          summary: 'Error',
          detail: errorMessage,
          sticky: true
        });
      }
    });
  }

  // Logo upload methods
  triggerLogoUpload() {
    const input = document.getElementById('logo-upload-input') as HTMLInputElement;
    input?.click();
  }

  onLogoSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      // Check file size (50MB = 50 * 1024 * 1024 bytes)
      const maxFileSize = 50 * 1024 * 1024; // 50MB in bytes
      
      if (file.size > maxFileSize) {
        this.logoFileSizeError.set('File size exceeds 50MB. Please choose a smaller file.');
        this.logoFile = null;
        this.logoPreview = null;
        // Clear the input
        event.target.value = '';
        // Show warning message
        this.msgService.add({
          severity: 'warn',
          summary: 'File Too Large',
          detail: 'The selected file exceeds 50MB. Please choose a smaller file.',
          life: 5000
        });
        return;
      }
      
      // Clear any previous error
      this.logoFileSizeError.set('');
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
        this.logoFileSizeError.set('File size exceeds 50MB. Please choose a smaller file.');
        this.logoFile = null;
        this.logoPreview = null;
        // Show warning message
        this.msgService.add({
          severity: 'warn',
          summary: 'File Too Large',
          detail: 'The selected file exceeds 50MB. Please choose a smaller file.',
          life: 5000
        });
        return;
      }
      
      // Clear any previous error
      this.logoFileSizeError.set('');
      this.logoFile = file;
      // Create a preview URL
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.logoPreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  loadCompanies() {
    const filterStatus = this.companyFilterStatus();
    this.loading.begin();
    this.authSer.getAllCompanies(filterStatus).pipe(
      finalize(() => this.loading.end())
    ).subscribe({
      next: (res: any) => {
        console.log('==>companies: ', res);
        let companiesList: CompanyWithDetails[] = [];
        // AuthService.getAllCompanies (Supabase) returns the array directly, not { data: array }
        if (Array.isArray(res)) {
          companiesList = res;
        } else if (Array.isArray(res?.data)) {
          companiesList = res.data;
        } else if (res?.data && Array.isArray(res.data.companies)) {
          companiesList = res.data.companies;
        } else if (res?.data && Array.isArray(res.data.data)) {
          companiesList = res.data.data;
        } else {
          console.warn('API response data is not an array:', res);
          companiesList = [];
        }
        
        // Initialize all companies without admin counts (will be loaded lazily for visible companies)
        companiesList.forEach(company => {
          company.admins = undefined;
        });
        this.companies = companiesList;
        
        // Load admin counts only for currently visible companies (paginated)
        this.loadAdminCountsForVisibleCompanies();
      },
      error: (error) => {
        console.error('==>error: ', error);
        this.companies = []; // Ensure companies is always an array
      }
    });
  }

  loadAdminCountsForVisibleCompanies() {
    // Get only the currently visible/paginated companies
    const visibleCompanies = this.filteredCompanies;
    
    if (!visibleCompanies || visibleCompanies.length === 0) {
      return;
    }

    // Filter out companies that already have admin counts loaded
    // Only load if admins is undefined (not loaded yet)
    const companiesToLoad = visibleCompanies.filter(company => 
      company.id && company.admins === undefined
    );

    if (companiesToLoad.length === 0) {
      return;
    }

    // Create an array of observables to fetch admin counts for visible companies only
    const adminCountRequests = companiesToLoad.map(company => {
      if (!company.id) {
        return of({ companyId: company.id, count: 0 });
      }
      
      return this.authSer.getCompanyAdmins(company.id).pipe(
        map((res: any) => {
          let admins: any[] = [];
          // Handle different response structures (same as in comp-detail component)
          if (Array.isArray(res.data)) {
            admins = res.data;
          } else if (res.data && Array.isArray(res.data.admins)) {
            admins = res.data.admins;
          } else if (res.data && Array.isArray(res.data.data)) {
            admins = res.data.data;
          } else if (Array.isArray(res)) {
            admins = res;
          }
          return { companyId: company.id, count: admins.length };
        }),
        catchError((error) => {
          console.error(`==>Error loading admins for company ${company.id}:`, error);
          return of({ companyId: company.id, count: 0 });
        })
      );
    });

    // Fetch admin counts in parallel for visible companies only
    this.loading.begin();
    forkJoin(adminCountRequests).pipe(
      finalize(() => this.loading.end())
    ).subscribe({
      next: (results) => {
        // Update companies with admin counts
        results.forEach(result => {
          if (result.companyId) {
            const company = this.companies.find(c => c.id === result.companyId);
            if (company) {
              company.admins = result.count;
            }
          }
        });
      },
      error: (error) => {
        console.error('==>Error loading admin counts:', error);
      }
    });
  }

  toggleFilter(event: any) {
    this.filterPopover.toggle(event);
  }

  onFilterStatusChange(status: 'active' | 'inactive' | null) {
    this.companyFilterStatus.set(status);
    this.filterPopover.hide();
    this.loadCompanies();
  }

  // Helper method to format time from HH:MM to Xam-Xpm format
  private formatTimeRange(from: string, to: string): string {
    const formatTime = (time: string): string => {
      if (!time) return '';
      const [hours, minutes] = time.split(':');
      const hour = parseInt(hours, 10);
      const ampm = hour >= 12 ? 'pm' : 'am';
      const displayHour = hour % 12 || 12;
      const mins = minutes && minutes !== '00' ? ':' + minutes : '';
      return `${displayHour}${mins}${ampm}`;
    };
    return `${formatTime(from)}-${formatTime(to)}`;
  }

  onCreateRoom() {
    // Validate required fields
    if (!this.newRoom.name || !this.newRoom.location || !this.newRoom.availableFrom || !this.newRoom.availableTo || !this.newRoom.capacity || this.newRoom.capacity <= 0) {
      this.msgService.add({
        severity: 'error',
        summary: 'Validation Error',
        detail: 'Please fill in all required fields',
        life: 3000
      });
      return;
    }

    // Prepare room object with timezone set to UTC
    const roomToCreate: Room = {
      name: this.newRoom.name.trim(),
      capacity: this.newRoom.capacity,
      availableFrom: this.newRoom.availableFrom,
      availableTo: this.newRoom.availableTo,
      location: this.newRoom.location.trim(),
      timezone: 'UTC'
    };

    this.roomSer.createRoom(roomToCreate).subscribe({
      next: (res: any) => {
        console.log('Room created successfully:', res);

        // Reset form
        this.newRoom = {
          name: '',
          capacity: 0,
          availableFrom: '',
          availableTo: '',
          location: '',
          timezone: 'UTC'
        };
        // Close modal
        this.setModal('');
        // Reload rooms data
        this.loadRooms();
        // Show success toast
        this.msgService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Room created successfully!',
          life: 3000
        });
      },
      error: (error) => {
        console.error('Error creating room:', error);
        const errorMessage = error.error?.message || error.message || 'Failed to create room. Please try again.';
        this.msgService.add({
          severity: 'error',
          summary: 'Error',
          detail: errorMessage,
          life: 3000
        });
      }
    });
  }

  // Open edit room modal with room data
  onEditRoom(room: RoomDisplay) {
    if (!room.id) {
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Room ID is missing',
        life: 3000
      });
      return;
    }

    // Populate edit form with room data
    this.editRoom = {
      id: room.id,
      name: room.name || '',
      capacity: room.capacity || 0,
      availableFrom: room.availableFrom || '',
      availableTo: room.availableTo || '',
      location: room.location || ''
    };

    // Open edit modal
    this.setModal('editRoom');
  }

  // Save edited room
  onSaveEditRoom() {
    // Validate required fields
    if (!this.editRoom.name || !this.editRoom.location || !this.editRoom.availableFrom || !this.editRoom.availableTo || !this.editRoom.capacity || this.editRoom.capacity <= 0) {
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Please fill in all required fields',
        life: 3000
      });
      return;
    }

    if (!this.editRoom.id) {
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Room ID is missing',
        life: 3000
      });
      return;
    }

    // Prepare room object for update
    const roomToUpdate = {
      name: this.editRoom.name.trim(),
      capacity: this.editRoom.capacity,
      availableFrom: this.editRoom.availableFrom,
      availableTo: this.editRoom.availableTo,
      location: this.editRoom.location.trim()
    };

    const roomId = this.editRoom.id.toString();

    this.roomSer.editRoom(roomId, roomToUpdate).subscribe({
      next: (res: any) => {
        console.log('Room updated successfully:', res);

        // Reset form
        this.editRoom = {
          id: undefined,
          name: '',
          capacity: 0,
          availableFrom: '',
          availableTo: '',
          location: ''
        };
        // Close modal
        this.setModal('');
        // Reload rooms data
        this.loadRooms();
        // Show success toast
        this.msgService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Room updated successfully!',
          life: 3000
        });
      },
      error: (error) => {
        console.error('Error updating room:', error);
        const errorMessage = error.error?.message || error.message || 'Failed to update room. Please try again.';
        this.msgService.add({
          severity: 'error',
          summary: 'Error',
          detail: errorMessage,
          life: 3000
        });
      }
    });
  }

  loadRooms() {
    this.loading.begin();
    this.roomSer.getAllRooms().pipe(
      finalize(() => this.loading.end())
    ).subscribe({
      next: (res: any) => {
        console.log('Rooms loaded:', res);
        // Handle different response structures
        let roomsData: any[] = [];
        if (Array.isArray(res.data)) {
          roomsData = res.data;
        } else if (res.data && Array.isArray(res.data.rooms)) {
          roomsData = res.data.rooms;
        } else if (res.data && Array.isArray(res.data.data)) {
          roomsData = res.data.data;
        } else if (Array.isArray(res)) {
          roomsData = res;
        }

        this.roomImageLoadFailed.set(new Set());
        this.roomFallbackImageUrl.set(new Map());
        this.successfulImageUrls.set(new Set());
        // Prefer featured image from DB (saved after download); else assign from pool
        this.rooms = roomsData.map((room: any, index: number) => {
          const savedImage = room.featuredImageUrl ?? room.featured_image_url;
          const roomDisplay: RoomDisplay = {
            id: room.id,
            name: room.name,
            capacity: room.capacity,
            location: room.location,
            availableFrom: room.availableFrom,
            availableTo: room.availableTo,
            timezone: room.timezone || 'UTC',
            hours: this.formatTimeRange(room.availableFrom || '', room.availableTo || ''),
            status: room.status || 'active',
            images: savedImage ? [savedImage] : this.getRoomImages(room.name ?? room.id ?? index)
          };
          console.log('==>card image', room.name, this.getDisplayImageUrl(room));
          return roomDisplay;
        });
        // Backfill: download images for rooms that don't have one and save to DB, then reload
        const missing = roomsData.filter((r: any) => !(r.featuredImageUrl ?? r.featured_image_url));
        if (missing.length > 0) {
          this.roomSer.ensureRoomImages().subscribe({
            next: (result) => {
              if (result.updated > 0) this.loadRooms();
            },
            error: () => { /* ignore; cards still show fallback images */ }
          });
        }
      },
      error: (error) => {
        console.error('Error loading rooms:', error);
        // Keep existing rooms if API call fails
      }
    });
  }

  onInviteEmployee() {
    const emails = this.employeeEmails();
    
    if (emails.length === 0) {
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Please add at least one email address',
        life: 3000
      });
      return;
    }

    // Invite all employees
    let completed = 0;
    let failed = 0;
    const total = emails.length;
    console.log(`Starting to invite ${total} employee(s)...`);

    emails.forEach((email, index) => {
      console.log(`[${index + 1}/${total}] Inviting employee: ${email}`);

      this.employeeSer.inviteEmployee(email).subscribe({
        next: (res: any) => {
          completed++;
          console.log(`Employee ${email} invited successfully:`, res);

          // Show success toast for each employee
          this.msgService.add({
            severity: 'success',
            summary: 'Success',
            detail: `Successfully invited ${email}`,
            life: 3000
          });

          if (completed + failed === total) {
            // Show summary toast when all invitations are processed
            if (failed === 0) {
              this.msgService.add({
                severity: 'success',
                summary: 'All Employees Invited',
                detail: `Successfully invited all ${completed} employee(s)!`,
                sticky: true
              });
            } else {
              this.msgService.add({
                severity: 'warn',
                summary: 'Partial Success',
                detail: `Invited ${completed} employee(s), ${failed} failed`,
                sticky: true
              });
            }
            // Reset form and reload employees list
            this.employeeEmails.set([]);
            this.newEmployeeEmailInput = '';
            this.loadEmployees();
          }
        },
        error: (error) => {
          failed++;
          console.error(`Error inviting employee ${email}:`, error);
          const errorMessage = error.error?.message || error.message || 'Failed to send invitation';

          // Show error toast for each failed employee
          this.msgService.add({
            severity: 'error',
            summary: 'Error',
            detail: `Failed to invite ${email}: ${errorMessage}`,
            life: 3000
          });

          if (completed + failed === total) {
            // Show summary toast when all invitations are processed
            if (failed === total) {
              this.msgService.add({
                severity: 'error',
                summary: 'All Invitations Failed',
                detail: 'Failed to invite all employees',
                sticky: true
              });
            } else {
              this.msgService.add({
                severity: 'warn',
                summary: 'Partial Success',
                detail: `Invited ${completed} employee(s), ${failed} failed`,
                sticky: true
              });
            }
            // Reset form and reload employees list
            this.employeeEmails.set([]);
            this.newEmployeeEmailInput = '';
            this.loadEmployees();
          }
        }
      });
    });
  }

  onCloseInvitationResponse() {
    this.invitationResponse = null;
  }

  // Open delete confirmation modal
  onDeleteRoom(room: RoomDisplay) {
    if (!room.id) {
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Room ID is missing',
        life: 3000
      });
      return;
    }

    // Store room to delete and open confirmation modal
    this.roomToDelete = room;
    this.setModal('deleteRoom');
  }

  // Confirm and delete room
  onConfirmDeleteRoom() {
    if (!this.roomToDelete || !this.roomToDelete.id) {
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Room ID is missing',
        life: 3000
      });
      return;
    }

    const roomId = this.roomToDelete.id.toString();
    const roomName = this.roomToDelete.name;

    this.roomSer.deleteRoom(roomId).subscribe({
      next: (res: any) => {
        console.log('Room deleted successfully:', res);

        // Reset room to delete
        this.roomToDelete = null;
        // Close modal
        this.setModal('');
        // Reload rooms data
        this.loadRooms();

        // Show success toast
        this.msgService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Room deleted successfully!',
          life: 3000
        });
      },
      error: (error) => {
        console.error('Error deleting room:', error);
        const errorMessage = error.error?.message || error.message || 'Failed to delete room. Please try again.';
        this.msgService.add({
          severity: 'error',
          summary: 'Error',
          detail: errorMessage,
          life: 3000
        });
      }
    });
  }

  // Cancel delete
  onCancelDeleteRoom() {
    this.roomToDelete = null;
    this.setModal('');
  }

  toggleSidebar() {
    // If drawer is closed, open it
    if (!this.sidebarOpen()) {
      this.sidebarOpen.set(true);
    } else {
      // Toggle collapsed state instead of closing
      this.sidebarCollapsed.set(!this.sidebarCollapsed());
    }
  }

  private isEscKeyPressed = false;

  onDrawerHide(event: any) {
    // Prevent drawer from closing via Esc key
    // Only prevent if Esc was pressed (not if closed intentionally)
    if (this.isEscKeyPressed && !this.modal()) {
      // Reopen the drawer if it was closed by Esc key
      setTimeout(() => {
        if (!this.sidebarOpen()) {
          this.sidebarOpen.set(true);
        }
      }, 0);
      this.isEscKeyPressed = false; // Reset flag
    }
  }

  // Toggle Industry sort
  toggleIndustrySort() {
    const current = this.companyIndustrySortDirection();
    if (current === null) {
      this.companyIndustrySortDirection.set('asc');
    } else if (current === 'asc') {
      this.companyIndustrySortDirection.set('desc');
    } else {
      this.companyIndustrySortDirection.set(null);
    }
    // Reset status sort when toggling industry
    this.companyStatusSortDirection.set(null);
    this.companyNameSortDirection.set(null);
  }

  // Industry dropdown methods
  selectIndustry(industry: string) {
    this.newCompany.industry = industry;
    this.showIndustryDropdown.set(false);
    this.showAddIndustryInput.set(false);
    this.newIndustryName.set('');
  }

  onAddIndustryClick() {
    this.showAddIndustryInput.set(true);
  }

  addNewIndustry() {
    const industryName = this.newIndustryNameInput.trim();
    if (industryName && !this.industries().includes(industryName)) {
      this.industries.update(list => [...list, industryName]);
      this.newCompany.industry = industryName;
      this.newIndustryNameInput = '';
      this.newIndustryName.set('');
      this.showAddIndustryInput.set(false);
      this.showIndustryDropdown.set(false);
    }
  }

  cancelAddIndustry() {
    this.showAddIndustryInput.set(false);
    this.newIndustryNameInput = '';
    this.newIndustryName.set('');
  }

  // Admin email management methods
  addAdminEmail() {
    console.log('=== addAdminEmail called ===');
    console.log('newAdminEmailInput value:', this.newAdminEmailInput);
    const email = this.newAdminEmailInput.trim();
    console.log('Trimmed email:', email);
    console.log('Email length:', email.length);
    console.log('Is valid email:', this.isValidEmail(email));
    console.log('Current adminEmails count:', this.adminEmails().length);
    console.log('Can add more (less than 5):', this.adminEmails().length < 5);
    console.log('Email already exists:', this.adminEmails().includes(email));

    if (!email) {
      console.warn('Email is empty');
      return;
    }

    if (!this.isValidEmail(email)) {
      console.warn('Email is not valid:', email);
      this.msgService.add({
        severity: 'error',
        summary: 'Invalid Email',
        detail: 'Please enter a valid email address',
        life: 3000
      });
      return;
    }

    if (this.adminEmails().length >= 5) {
      console.warn('Maximum 5 emails allowed');
      this.msgService.add({
        severity: 'warn',
        summary: 'Limit Reached',
        detail: 'Maximum 5 admin emails allowed',
        life: 3000
      });
      return;
    }

    if (this.adminEmails().includes(email)) {
      console.warn('Email already exists:', email);
      this.msgService.add({
        severity: 'warn',
        summary: 'Duplicate Email',
        detail: 'This email is already in the list',
        life: 3000
      });
      return;
    }

    console.log('Adding email to array:', email);
    this.adminEmails.update(emails => {
      const newEmails = [...emails, email];
      console.log('Updated adminEmails array:', newEmails);
      return newEmails;
    });
    this.newAdminEmailInput = '';
    this.newAdminEmail.set('');
    console.log('Email added successfully. Current array:', this.adminEmails());
  }

  removeAdminEmail(email: string) {
    this.adminEmails.update(emails => emails.filter(e => e !== email));
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  onAdminEmailKeyPress(event: any) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addAdminEmail();
    }
  }

  // Employee email management methods
  addEmployeeEmail() {
    const email = this.newEmployeeEmailInput.trim();

    if (!email) {
      return;
    }

    if (!this.isValidEmail(email)) {
      this.msgService.add({
        severity: 'error',
        summary: 'Invalid Email',
        detail: 'Please enter a valid email address',
        life: 3000
      });
      return;
    }

    if (this.employeeEmails().length >= 5) {
      this.msgService.add({
        severity: 'warn',
        summary: 'Limit Reached',
        detail: 'Maximum 5 employee emails allowed',
        life: 3000
      });
      return;
    }

    if (this.employeeEmails().includes(email)) {
      this.msgService.add({
        severity: 'warn',
        summary: 'Duplicate Email',
        detail: 'This email is already in the list',
        life: 3000
      });
      return;
    }

    this.employeeEmails.update(emails => [...emails, email]);
    this.newEmployeeEmailInput = '';
  }

  removeEmployeeEmail(email: string) {
    this.employeeEmails.update(emails => emails.filter(e => e !== email));
  }

  onEmployeeEmailKeyPress(event: any) {
    if (event.key === 'Enter') {
      event.preventDefault();
      this.addEmployeeEmail();
    }
  }

  onFinishInviteAdmins() {
    console.log('=== onFinishInviteAdmins called ===');
    const companyId = this.createdCompanyId();
    console.log('Current createdCompanyId signal value:', companyId);
    console.log('Step:', this.createCompanyStep());

    if (!companyId) {
      console.error('Company ID is null or undefined. Cannot invite admins.');
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Company ID not found. Please go back and create the company again.',
        sticky: true
      });
      return;
    }

    console.log('Using companyId to invite admins:', companyId);

    const emails = this.adminEmails();
    console.log('Admin emails array:', emails);
    console.log('Admin emails length:', emails.length);

    if (emails.length === 0) {
      console.log('No emails to invite, closing modal');
      // Allow finishing without inviting admins
      this.setModal('');
      this.loadCompanies();
      return;
    }

    // Invite all admins
    let completed = 0;
    let failed = 0;
    const total = emails.length;
    console.log(`Starting to invite ${total} admin(s)...`);

    emails.forEach((email, index) => {
      console.log(`[${index + 1}/${total}] Inviting admin: ${email} with companyId: ${companyId}`);
      console.log('CompanyId type:', typeof companyId);
      console.log('Email type:', typeof email);

      // Ensure companyId is a string
      const companyIdStr = String(companyId);
      console.log('Calling createCompanyAdmin with:', { companyId: companyIdStr, email });

      const companyName = this.createdCompanyName() ?? undefined;
      this.authSer.createCompanyAdmin({ companyId: companyIdStr, email, companyName }).subscribe({
        next: (res) => {
          if (res.emailSent) {
            completed++;
            this.msgService.add({
              severity: 'success',
              summary: 'Success',
              detail: `Successfully invited ${email}`,
              life: 3000
            });
          } else {
            failed++;
            this.msgService.add({
              severity: 'warn',
              summary: 'Invite saved — email failed',
              detail: `${email}: ${res.emailError ?? 'Email could not be sent.'}`,
              life: 10000
            });
          }

          if (completed + failed === total) {
            // Show summary toast when all invitations are processed
            if (failed === 0) {
              this.msgService.add({
                severity: 'success',
                summary: 'All Admins Invited',
                detail: `Successfully invited all ${completed} admin(s)!`,
                sticky: true
              });
            } else {
              this.msgService.add({
                severity: 'warn',
                summary: 'Partial Success',
                detail: `Invited ${completed} admin(s), ${failed} failed`,
                sticky: true
              });
            }
            this.setModal('');
            this.loadCompanies();
          }
        },
        error: (error) => {
          failed++;
          const errorMessage = error.error?.message || error.message || 'Failed to invite admin';
          console.error('==>Error inviting admin:', error);

          // Show error toast for each failed admin
          this.msgService.add({
            severity: 'error',
            summary: 'Error',
            detail: `Failed to invite ${email}: ${errorMessage}`,
            life: 3000
          });

          if (completed + failed === total) {
            // Show summary toast when all invitations are processed
            if (failed === total) {
              this.msgService.add({
                severity: 'error',
                summary: 'All Invitations Failed',
                detail: 'Failed to invite all admins',
                sticky: true
              });
            } else {
              this.msgService.add({
                severity: 'warn',
                summary: 'Partial Success',
                detail: `Invited ${completed} admin(s), ${failed} failed`,
                sticky: true
              });
            }
            this.setModal('');
            this.loadCompanies();
          }
        }
      });
    });
  }

  goBackToStep1() {
    this.createCompanyStep.set(1);
  }

  onToastClose() {
    // When toast is closed after successful company creation, ensure we're on step 2
    if (this.createdCompanyId() && this.createCompanyStep() === 1) {
      this.createCompanyStep.set(2);
    }
  }

  onNewIndustryInputChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.newIndustryNameInput = target.value;
    this.newIndustryName.set(target.value);
  }

  // Toggle Status sort
  toggleCompanyStatusSort() {
    const current = this.companyStatusSortDirection();
    if (current === null) {
      this.companyStatusSortDirection.set('asc');
    } else if (current === 'asc') {
      this.companyStatusSortDirection.set('desc');
    } else {
      this.companyStatusSortDirection.set(null);
    }
    // Reset industry sort when toggling status
    this.companyIndustrySortDirection.set(null);
    this.companyNameSortDirection.set(null);
  }

  // Toggle Company Name sort
  toggleCompanyNameSort() {
    const current = this.companyNameSortDirection();
    if (current === null) {
      this.companyNameSortDirection.set('asc');
    } else if (current === 'asc') {
      this.companyNameSortDirection.set('desc');
    } else {
      this.companyNameSortDirection.set(null);
    }
    // Reset other sorts when toggling company name
    this.companyIndustrySortDirection.set(null);
    this.companyStatusSortDirection.set(null);
  }

  // 3D tilt effect for room card images
  onRoomImageMouseMove(event: MouseEvent, roomId: number | string | undefined) {
    if (!roomId) return;

    const card = (event.currentTarget as HTMLElement).closest('.room-card') as HTMLElement;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -10; // Max 10 degrees
    const rotateY = ((x - centerX) / centerX) * 10; // Max 10 degrees

    const imageContainer = card.querySelector('.room-image-container') as HTMLElement;
    if (imageContainer) {
      imageContainer.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.05, 1.05, 1.05)`;
    }
  }

  onRoomImageMouseLeave(event: MouseEvent) {
    const card = (event.currentTarget as HTMLElement).closest('.room-card') as HTMLElement;
    if (!card) return;

    const imageContainer = card.querySelector('.room-image-container') as HTMLElement;
    if (imageContainer) {
      imageContainer.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    }
  }

  // Open edit employee modal with employee data
  onEditEmployee(employee: EmployeeDisplay) {
    if (!employee.id) {
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Employee ID is missing',
        life: 3000
      });
      return;
    }

    // Populate edit form with employee data
    const initialStatus: 'active' | 'inactive' | 'pending' = (employee.status as 'active' | 'inactive' | 'pending') || 'active';
    this.editEmployee = {
      id: employee.id,
      firstName: employee.firstName || '',
      lastName: employee.lastName || '',
      email: employee.email || '',
      department: employee.department || '',
      role: employee.role || '',
      status: initialStatus
    };
    // Store previous status for comparison
    this.previousEmployeeStatus = initialStatus;

    // Open edit modal
    this.setModal('editEmployee');
  }

  onEmployeeStatusChange(newStatus: string) {
    // Only trigger update if status actually changed
    if (newStatus !== this.previousEmployeeStatus && this.editEmployee.id) {
      this.employeeStatusChangeSubject.next(newStatus);
    }
  }

  toggleEditEmployeeStatusMenu() {
    if (this.updatingEmployeeStatus) return;
    this.showEditEmployeeStatusMenu = !this.showEditEmployeeStatusMenu;
  }

  setEditEmployeeStatus(newStatus: 'active' | 'pending' | 'inactive') {
    this.editEmployee.status = newStatus;
    this.showEditEmployeeStatusMenu = false;
    this.onEmployeeStatusChange(newStatus);
  }

  updateEmployeeStatus(status: string) {
    // Type guard to ensure status is valid
    const validStatus: 'active' | 'inactive' | 'pending' = (status === 'active' || status === 'inactive' || status === 'pending') 
      ? status as 'active' | 'inactive' | 'pending'
      : 'active';
    if (!this.editEmployee.id) {
      return;
    }

    // Prevent multiple simultaneous updates
    if (this.updatingEmployeeStatus) {
      return;
    }

    this.updatingEmployeeStatus = true;
    this.employeeSer.updateEmployeeStatus(this.editEmployee.id, validStatus).subscribe({
      next: (res: any) => {
        console.log('==>Employee status updated successfully:', res);
        this.previousEmployeeStatus = validStatus;
        this.updatingEmployeeStatus = false;
        // Update the employee object in the list if it exists
        const employeeIndex = this.employees.findIndex(e => e.id === this.editEmployee.id);
        if (employeeIndex !== -1) {
          this.employees[employeeIndex].status = status as 'active' | 'inactive' | 'pending';
        }
        this.msgService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Employee status updated successfully',
          life: 2000
        });
      },
      error: (error) => {
        console.error('==>Error updating employee status:', error);
        this.updatingEmployeeStatus = false;
        // Revert to previous status on error
        this.editEmployee.status = this.previousEmployeeStatus;
        const errorMessage = error.error?.message || error.message || 'Failed to update employee status. Please try again.';
        this.msgService.add({
          severity: 'error',
          summary: 'Error',
          detail: errorMessage,
          life: 3000
        });
      }
    });
  }

  // Save edited employee
  onSaveEditEmployee() {
    // Validate required fields
    if (!this.editEmployee.firstName?.trim() || !this.editEmployee.lastName?.trim()) {
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'First name and last name are required',
        life: 3000
      });
      return;
    }

    if (!this.editEmployee.id) {
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Employee ID is missing',
        life: 3000
      });
      return;
    }

    const employeeToUpdate = {
      firstName: this.editEmployee.firstName.trim(),
      lastName: this.editEmployee.lastName.trim(),
      department: this.editEmployee.department?.trim() || undefined,
      role: this.editEmployee.role?.trim() || undefined,
      status: this.editEmployee.status || 'active'
    };
    const employeeId = this.editEmployee.id.toString();
    
    this.employeeSer.updateEmployee(employeeId, employeeToUpdate).subscribe({
      next: (res: any) => {
        console.log('Employee updated successfully:', res);
        this.editEmployee = {
          id: undefined,
          firstName: '',
          lastName: '',
          email: '',
          department: '',
          role: '',
          status: 'active'
        };
        this.setModal('');
        this.loadEmployees();
        this.msgService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Employee updated successfully!',
          life: 3000
        });
      },
      error: (error) => {
        console.error('Error updating employee:', error);
        const errorMessage = error.error?.message || error.message || 'Failed to update employee. Please try again.';
        this.msgService.add({
          severity: 'error',
          summary: 'Error',
          detail: errorMessage,
          life: 3000
        });
      }
    });
  }

  // Delete employee
  // Load and log all company admins
  loadAndLogCompanyAdmins(showLoading = true) {
    this.loadingAdmins = showLoading;
    this.authSer.getAllCompanyAdmins().pipe(
      finalize(() => {
        this.loadingAdmins = false;
      })
    ).subscribe({
      next: (res: any) => {
        console.log('All company admins response:', res);
        
        // Extract all admins from the response
        let adminsList: AdminDisplay[] = [];
        
        // Handle different response structures
        const raw = res.data ?? res;
        const companiesData = Array.isArray(raw) ? raw : (raw?.data ?? raw);

        // Supabase: flat array of company_admin rows with nested company
        if (Array.isArray(companiesData) && companiesData.length > 0) {
          const first = companiesData[0];
          const isSupabaseShape =
            first != null &&
            typeof first === 'object' &&
            ('first_name' in first || 'firstName' in first) &&
            ('email' in first) &&
            !('users' in first);

          if (isSupabaseShape) {
            adminsList = (companiesData as any[]).map((row: any) => ({
              id: row.id ?? '',
              firstName: row.first_name ?? row.firstName ?? '',
              lastName: row.last_name ?? row.lastName ?? '',
              email: row.email ?? '',
              status: row.status ?? 'pending',
              companyName: row.companies?.name ?? row.company?.name ?? '',
              companyId: row.company_id ?? row.companies?.id ?? row.company?.id ?? ''
            }));
          }
        }

        if (adminsList.length === 0 && Array.isArray(companiesData)) {
          // Legacy: array of companies with users
          companiesData.forEach((company: any) => {
            if (company.users && Array.isArray(company.users)) {
              const companyAdmins = (company.users as any[])
                .filter((user: any) => user.role === 'company_admin')
                .map((user: any) => ({
                  id: user.id || user._id || '',
                  firstName: user.firstName || '',
                  lastName: user.lastName || '',
                  email: user.email || '',
                  status: user.status || 'active',
                  companyName: company.name || '',
                  companyId: company.id || company._id || ''
                }));
              adminsList = [...adminsList, ...companyAdmins];
            }
          });
        }

        if (adminsList.length === 0 && companiesData?.companies) {
          companiesData.companies.forEach((company: any) => {
            if (company.users && Array.isArray(company.users)) {
              const companyAdmins = (company.users as any[])
                .filter((user: any) => user.role === 'company_admin')
                .map((user: any) => ({
                  id: user.id || user._id || '',
                  firstName: user.firstName || '',
                  lastName: user.lastName || '',
                  email: user.email || '',
                  status: user.status || 'active',
                  companyName: company.name || '',
                  companyId: company.id || company._id || ''
                }));
              adminsList = [...adminsList, ...companyAdmins];
            }
          });
        }

        this.allAdmins = adminsList;
        this.adminsCacheUpdatedAt = Date.now();
        this.adminsCacheDirty = false;
        console.log('Filtered company admins (role: company_admin):', this.allAdmins);
      },
      error: (error) => {
        console.error('Error loading company admins:', error);
        this.allAdmins = [];
        this.adminsCacheDirty = true;
      }
    });
  }

  // Pagination for admins
  onAdminPageChange(event: any) {
    this.firstAdmin.set(event.first);
    this.rowsAdmin.set(event.rows);
  }

  // Toggle admin name sort
  toggleAdminNameSort() {
    const current = this.adminNameSortDirection();
    if (current === null) {
      this.adminNameSortDirection.set('asc');
    } else if (current === 'asc') {
      this.adminNameSortDirection.set('desc');
    } else {
      this.adminNameSortDirection.set(null);
    }
    // Reset other sorts
    this.adminEmailSortDirection.set(null);
    this.adminCompanySortDirection.set(null);
    this.adminStatusSortDirection.set(null);
  }

  // Toggle admin email sort
  toggleAdminEmailSort() {
    const current = this.adminEmailSortDirection();
    if (current === null) {
      this.adminEmailSortDirection.set('asc');
    } else if (current === 'asc') {
      this.adminEmailSortDirection.set('desc');
    } else {
      this.adminEmailSortDirection.set(null);
    }
    // Reset other sorts
    this.adminNameSortDirection.set(null);
    this.adminCompanySortDirection.set(null);
    this.adminStatusSortDirection.set(null);
  }

  // Toggle admin company sort
  toggleAdminCompanySort() {
    const current = this.adminCompanySortDirection();
    if (current === null) {
      this.adminCompanySortDirection.set('asc');
    } else if (current === 'asc') {
      this.adminCompanySortDirection.set('desc');
    } else {
      this.adminCompanySortDirection.set(null);
    }
    // Reset other sorts
    this.adminNameSortDirection.set(null);
    this.adminEmailSortDirection.set(null);
    this.adminStatusSortDirection.set(null);
  }

  // Toggle admin status sort
  toggleAdminStatusSort() {
    const current = this.adminStatusSortDirection();
    if (current === null) {
      this.adminStatusSortDirection.set('asc');
    } else if (current === 'asc') {
      this.adminStatusSortDirection.set('desc');
    } else {
      this.adminStatusSortDirection.set(null);
    }
    // Reset other sorts
    this.adminNameSortDirection.set(null);
    this.adminEmailSortDirection.set(null);
    this.adminCompanySortDirection.set(null);
  }

  // Delete admin click handler
  onDeleteAdminClick(admin: AdminDisplay) {
    this.adminToDelete = admin;
  }

  onCancelDeleteAdmin() {
    this.adminToDelete = null;
  }

  onConfirmDeleteAdmin() {
    const admin = this.adminToDelete;
    if (!admin?.id) {
      this.adminToDelete = null;
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Admin ID is missing',
        life: 3000
      });
      return;
    }

    this.authSer.deleteCompanyAdmin(admin.id).subscribe({
      next: (res: any) => {
        console.log('Admin deleted successfully:', res);
        this.adminToDelete = null;
        // Remove admin from list
        this.allAdmins = this.allAdmins.filter(a => a.id !== admin.id);
        this.msgService.add({
          severity: 'success',
          summary: 'Success',
          detail: 'Company admin deleted successfully',
          life: 3000
        });
      },
      error: (error) => {
        console.error('Error deleting admin:', error);
        let errorMessage = error.error?.message || error.message || 'Failed to delete admin. Please try again.';
        if (errorMessage.includes('send a request')) {
          errorMessage = 'Could not reach the delete service. Deploy the Edge Function: run "npx supabase functions deploy delete-company-admin" from the project root, then try again.';
        } else if (errorMessage.includes('non-2xx status code')) {
          errorMessage = 'Delete failed (server error). Open DevTools (F12) → Network tab, click the "delete-company-admin" request, and check the Response body for the exact error.';
        }
        this.msgService.add({
          severity: 'error',
          summary: 'Error',
          detail: errorMessage,
          life: 5000
        });
      }
    });
  }

  onDeleteEmployee(employee: EmployeeDisplay) {
    console.log('onDeleteEmployee called with employee:', employee);
    console.log('Employee ID:', employee?.id);
    
    if (!employee || !employee.id) {
      console.error('Employee or employee ID is missing');
      this.msgService.add({
        severity: 'error',
        summary: 'Error',
        detail: 'Employee ID is missing',
        life: 3000
      });
      return;
    }

    const employeeName = `${employee.firstName} ${employee.lastName}`;
    
    console.log('Showing confirmation dialog for:', employeeName);
    this.confirmationService.confirm({
      message: `Are you sure you want to delete ${employeeName}?`,
      header: 'Delete Employee',
      icon: 'pi pi-exclamation-triangle',
      acceptButtonStyleClass: 'p-button-danger',
      acceptLabel: 'OK',
      rejectLabel: 'Cancel',
      accept: () => {
        this.employeeSer.deleteEmployee(employee.id!).subscribe({
          next: (res: any) => {
            console.log('==>Employee deleted successfully:', res);
            // Remove employee from list
            this.employees = this.employees.filter(e => e.id !== employee.id);
            this.msgService.add({
              severity: 'success',
              summary: 'Success',
              detail: 'Employee deleted successfully',
              life: 3000
            });
          },
          error: (error) => {
            console.error('==>Error deleting employee:', error);
            const errorMessage = error.error?.message || error.message || 'Failed to delete employee. Please try again.';
            this.msgService.add({
              severity: 'error',
              summary: 'Error',
              detail: errorMessage,
              life: 3000
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
