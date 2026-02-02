import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable, from } from 'rxjs';
// import { BASE_URL } from '../config/constants'; // kept for commented HTTP API
import { AuthService } from './auth.service';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class EmployeeService {
  // --- Legacy CRUD API (commented for safety) ---
  // private baseUrl = `${BASE_URL}/company-admin/employees/invite`;
  // private employeesBaseUrl = `${BASE_URL}/company-admin/employees`;

  constructor(
    private http: HttpClient,
    private sb: SupabaseService,
    private auth: AuthService
  ) { }

  private getToken(): string | null {
    return localStorage.getItem('user_token');
  }

  private getCompanyId(): string | null {
    return this.auth.getCompanyId();
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

  inviteEmployee(email: string): Observable<unknown> {
    const companyId = this.getCompanyId();
    if (!companyId) throw new Error('Company context required');
    return from(
      this.sb.client.from('employees').insert({
        company_id: companyId,
        email,
        role: 'employee',
        status: 'pending',
      }).select().single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.employeeRowToApp(data) : null;
      })
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
    if (!companyId) throw new Error('Company context required');
    return from(
      this.sb.client.from('employees').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map(row => this.employeeRowToApp(row));
      })
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
    status?: 'active' | 'inactive' | 'pending';
  }): Observable<unknown> {
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
