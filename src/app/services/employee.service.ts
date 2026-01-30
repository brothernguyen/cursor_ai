import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BASE_URL } from '../config/constants';

@Injectable({
  providedIn: 'root',
})
export class EmployeeService {
  private baseUrl = `${BASE_URL}/company-admin/employees/invite`;
  private employeesBaseUrl = `${BASE_URL}/company-admin/employees`;

  constructor(private http: HttpClient) { }

  // Get the token from localStorage
  private getToken(): string | null {
    return localStorage.getItem('user_token');
  }

  // Invite an employee
  inviteEmployee(email: string) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.post(this.baseUrl, { email, role: 'employee' }, { headers });
  }

  // Get all employees
  getAllEmployees() {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get(this.employeesBaseUrl, { headers });
  }

  // Update an employee
  updateEmployee(employeeId: string, employeeData: {
    firstName: string;
    lastName: string;
    department?: string;
    role?: string;
    status?: 'active' | 'inactive' | 'pending';
  }) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    const url = `${this.employeesBaseUrl}/${employeeId}`;
    return this.http.put(url, employeeData, { headers });
  }

  // Update employee status
  updateEmployeeStatus(employeeId: string, status: string) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    const url = `${this.employeesBaseUrl}/${employeeId}/status`;
    return this.http.patch(url, { status }, { headers });
  }

  // Delete an employee
  deleteEmployee(employeeId: string) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    const url = `${this.employeesBaseUrl}/${employeeId}`;
    return this.http.delete(url, { headers });
  }
}

