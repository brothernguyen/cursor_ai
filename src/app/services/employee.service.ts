import { Injectable } from '@angular/core';
import { map, Observable, from, of, throwError } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
// import { BASE_URL } from '../config/constants'; // kept for commented HTTP API
import { environment } from '../../environments/environment';
import { messageFromInviteEmailFnError } from '../helpers/invite-email-fn-error';
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class EmployeeService {
  // --- Legacy CRUD API (commented for safety) ---
  // private baseUrl = `${BASE_URL}/company-admin/employees/invite`;
  // private employeesBaseUrl = `${BASE_URL}/company-admin/employees`;

  private readonly dummyEmployees = [
    { id: 'emp-001', firstName: 'Avery', lastName: 'Nguyen', email: 'avery.nguyen@acme.com', department: 'Engineering', role: 'Frontend Engineer', status: 'active' },
    { id: 'emp-002', firstName: 'Noah', lastName: 'Tran', email: 'noah.tran@acme.com', department: 'Engineering', role: 'Backend Engineer', status: 'active' },
    { id: 'emp-003', firstName: 'Mia', lastName: 'Le', email: 'mia.le@acme.com', department: 'Engineering', role: 'QA Engineer', status: 'inactive' },
    { id: 'emp-004', firstName: 'Liam', lastName: 'Pham', email: 'liam.pham@acme.com', department: 'Design', role: 'Product Designer', status: 'active' },
    { id: 'emp-005', firstName: 'Sophia', lastName: 'Hoang', email: 'sophia.hoang@acme.com', department: 'Product', role: 'Product Manager', status: 'active' },
    { id: 'emp-006', firstName: 'Ethan', lastName: 'Vu', email: 'ethan.vu@acme.com', department: 'Sales', role: 'Account Executive', status: 'inactive' },
    { id: 'emp-007', firstName: 'Isabella', lastName: 'Do', email: 'isabella.do@acme.com', department: 'Customer Success', role: 'CSM', status: 'active' },
    { id: 'emp-008', firstName: 'Oliver', lastName: 'Bui', email: 'oliver.bui@acme.com', department: 'Finance', role: 'Financial Analyst', status: 'inactive' },
    { id: 'emp-009', firstName: 'Charlotte', lastName: 'Dang', email: 'charlotte.dang@acme.com', department: 'HR', role: 'People Ops', status: 'active' },
    { id: 'emp-010', firstName: 'Lucas', lastName: 'Ngo', email: 'lucas.ngo@acme.com', department: 'Engineering', role: 'DevOps Engineer', status: 'active' },
    { id: 'emp-011', firstName: 'Amelia', lastName: 'Mai', email: 'amelia.mai@acme.com', department: 'Marketing', role: 'Growth Marketer', status: 'inactive' },
    { id: 'emp-012', firstName: 'Henry', lastName: 'Ly', email: 'henry.ly@acme.com', department: 'Security', role: 'Security Engineer', status: 'active' },
    { id: 'emp-013', firstName: 'Harper', lastName: 'Ta', email: 'harper.ta@acme.com', department: 'Operations', role: 'Operations Manager', status: 'active' },
    { id: 'emp-014', firstName: 'Benjamin', lastName: 'Chau', email: 'benjamin.chau@acme.com', department: 'Engineering', role: 'Data Engineer', status: 'inactive' },
    { id: 'emp-015', firstName: 'Evelyn', lastName: 'Truong', email: 'evelyn.truong@acme.com', department: 'Legal', role: 'Legal Counsel', status: 'active' },
    { id: 'emp-016', firstName: 'James', lastName: 'Vo', email: 'james.vo@acme.com', department: 'IT', role: 'IT Support', status: 'inactive' },
    { id: 'emp-017', firstName: 'Abigail', lastName: 'Huynh', email: 'abigail.huynh@acme.com', department: 'Design', role: 'UX Researcher', status: 'active' },
    { id: 'emp-018', firstName: 'William', lastName: 'Khanh', email: 'william.khanh@acme.com', department: 'Engineering', role: 'Mobile Engineer', status: 'active' },
    { id: 'emp-019', firstName: 'Ella', lastName: 'Tien', email: 'ella.tien@acme.com', department: 'Marketing', role: 'Content Strategist', status: 'inactive' },
    { id: 'emp-020', firstName: 'Daniel', lastName: 'Minh', email: 'daniel.minh@acme.com', department: 'Sales', role: 'Sales Ops', status: 'active' },
  ] as const;

  constructor(
    private sb: SupabaseService,
    private auth: AuthService
  ) { }

  private getToken(): string | null {
    return localStorage.getItem('user_token');
  }

  private getCompanyId(): string | null {
    return this.auth.getCompanyId();
  }

  private isUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  private employeeRowToApp(row: Record<string, unknown>): Record<string, unknown> {
    return {
      id: row['id'],
      company_id: row['company_id'],
      email: row['email'],
      user_id: row['user_id'],
      firstName: row['first_name'],
      lastName: row['last_name'],
      department: row['department'],
      role: row['role'],
      status: row['status'],
    };
  }

  /**
   * Creates an invited (non-active) employee row, invitation token, and sends the same register link email
   * as company admins (Edge Function `send-company-admin-invite` with employee copy).
   * If the email call fails, the invitation and employee rows are deleted so the DB stays consistent.
   */
  inviteEmployee(
    email: string,
    companyName?: string
  ): Observable<{
    employee: Record<string, unknown> | null;
    emailSent: true;
  }> {
    const companyId = this.getCompanyId();
    if (!companyId) throw new Error('Company context required');
    return from(
      this.sb.client.from('employees').insert({
        company_id: companyId,
        email,
        role: 'employee',
        status: 'inactive',
      }).select().single()
    ).pipe(
      switchMap(({ data: employeeRow, error: insertError }) => {
        if (insertError) throw insertError;
        const employee = employeeRow ? this.employeeRowToApp(employeeRow) : null;
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        return from(
          this.sb.client.from('invitations').insert({
            token,
            email,
            role: 'employee',
            company_id: companyId,
            expires_at: expiresAt,
          })
        ).pipe(
          map(({ error: invError }) => {
            if (invError) throw invError;
            return { employee, token };
          })
        );
      }),
      switchMap(({ employee, token }) => {
        const empId = String(employee?.['id'] ?? '');
        return from(
          this.sb.client.functions.invoke('send-company-admin-invite', {
            body: {
              email,
              token,
              companyName: companyName?.trim() || undefined,
              inviteRole: 'employee' as const,
            },
            timeout: 90_000,
          })
        ).pipe(
          switchMap((result) => {
            if (!result.error) {
              return of({ employee, emailSent: true as const });
            }
            return from(messageFromInviteEmailFnError(result.error)).pipe(
              switchMap((msg) => {
                console.warn(
                  'Employee invitation email failed; rolling back invitation + employee row:',
                  msg
                );
                return from(this.sb.client.from('invitations').delete().eq('token', token)).pipe(
                  switchMap(({ error: invDelErr }) => {
                    if (invDelErr) {
                      console.error('Rollback: could not delete invitation row', invDelErr);
                    }
                    return from(
                      this.sb.client
                        .from('employees')
                        .delete()
                        .eq('id', empId)
                        .eq('company_id', companyId)
                    );
                  }),
                  switchMap(({ error: empDelErr }) => {
                    if (empDelErr) {
                      console.error('Rollback: could not delete employee row', empDelErr);
                    }
                    return throwError(() => new Error(msg));
                  })
                );
              })
            );
          })
        );
      }),
      map((result) => ({ employee: result.employee ?? null, emailSent: true as const }))
    );
  }

  // --- Legacy CRUD API (commented) ---
  // inviteEmployee(email: string) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.post(this.baseUrl, { email, role: 'employee' }, { headers });
  // }

  getAllEmployees(): Observable<unknown> {
    const companyId = this.getCompanyId();
    if (!companyId) {
      return environment.employeeUseDummyData ? of([...this.dummyEmployees]) : of([]);
    }
    return from(
      this.sb.client.from('employees').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        const rows = data ?? [];
        if (rows.length === 0) return environment.employeeUseDummyData ? [...this.dummyEmployees] : [];
        return rows.map(row => this.employeeRowToApp(row));
      }),
      catchError(() => environment.employeeUseDummyData ? of([...this.dummyEmployees]) : of([]))
    );
  }

  // --- Legacy CRUD API (commented) ---
  // getAllEmployees() {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.get(this.employeesBaseUrl, { headers });
  // }

  updateEmployee(employeeId: string, employeeData: {
    firstName: string;
    lastName: string;
    department?: string;
    role?: string;
    status?: 'active' | 'inactive';
  }): Observable<unknown> {
    if (!this.isUuid(employeeId)) {
      if (environment.employeeUseDummyData) {
        return of({
          id: employeeId,
          firstName: employeeData.firstName,
          lastName: employeeData.lastName,
          department: employeeData.department,
          role: employeeData.role,
          status: employeeData.status
        });
      }
      throw new Error('Invalid employee id format');
    }

    const companyId = this.getCompanyId();
    if (!companyId) throw new Error('Company context required');
    const row: Record<string, unknown> = {
      first_name: employeeData.firstName,
      last_name: employeeData.lastName,
    };
    if (employeeData.department != null) row['department'] = employeeData.department;
    if (employeeData.role != null) row['role'] = employeeData.role;
    if (employeeData.status != null) row['status'] = employeeData.status;
    return from(
      this.sb.client.from('employees').update(row).eq('id', employeeId).eq('company_id', companyId).select().single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.employeeRowToApp(data) : null;
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // updateEmployee(employeeId: string, employeeData: {...}) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   const url = `${this.employeesBaseUrl}/${employeeId}`;
  //   return this.http.put(url, employeeData, { headers });
  // }

  updateEmployeeStatus(employeeId: string, status: string): Observable<unknown> {
    // Dummy employees use display IDs like emp-001 (not DB UUID).
    // Avoid sending those IDs to Supabase, which causes:
    // "invalid input syntax for type uuid".
    if (!this.isUuid(employeeId)) {
      if (environment.employeeUseDummyData) {
        return of({ id: employeeId, status });
      }
      throw new Error('Invalid employee id format');
    }

    const companyId = this.getCompanyId();
    if (!companyId) throw new Error('Company context required');
    return from(
      this.sb.client.from('employees').update({ status }).eq('id', employeeId).eq('company_id', companyId).select().single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.employeeRowToApp(data) : null;
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // updateEmployeeStatus(employeeId: string, status: string) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   const url = `${this.employeesBaseUrl}/${employeeId}/status`;
  //   return this.http.patch(url, { status }, { headers });
  // }

  deleteEmployee(employeeId: string): Observable<void> {
    if (!this.isUuid(employeeId)) {
      if (environment.employeeUseDummyData) {
        return of(void 0);
      }
      throw new Error('Invalid employee id format');
    }

    const companyId = this.getCompanyId();
    if (!companyId) throw new Error('Company context required');
    return from(
      this.sb.client.from('employees').delete().eq('id', employeeId).eq('company_id', companyId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // deleteEmployee(employeeId: string) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   const url = `${this.employeesBaseUrl}/${employeeId}`;
  //   return this.http.delete(url, { headers });
  // }
}
