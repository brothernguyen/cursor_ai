import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Company } from '../interfaces/auth';
import { BASE_URL } from '../config/constants';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private baseUrl = `${BASE_URL}/auth/login`;

  constructor(private http: HttpClient) { }

  // Save the token
  setToken(token: string): void {
    localStorage.setItem('user_token', token);
  }

  // Get the token
  getToken(): string | null {
    return localStorage.getItem('user_token');
  }

  // Remove the token (for logout)
  removeToken(): void {
    localStorage.removeItem('user_token');
  }

  // Save the role
  setRole(role: string): void {
    localStorage.setItem('user_role', role);
  }

  // Get the role
  getRole(): string | null {
    return localStorage.getItem('user_role');
  }

  // Remove the role (for logout)
  removeRole(): void {
    localStorage.removeItem('user_role');
  }

  // Clear all tokens and user data
  clearAll(): void {
    this.removeToken();
    this.removeRole();
  }

  // Admin Login
  adminLogin(loginData: { email: string; password: string }) {
    return this.http.post(this.baseUrl, loginData);
  }

  // Get all companies
  getAllCompanies(status?: 'active' | 'inactive' | null) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    let url = `${BASE_URL}/admin/companies`;
    if (status) {
      url += `?status=${status}`;
    }

    return this.http.get(url, { headers });
  }

  createCompany(company: Company) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.post(
      `${BASE_URL}/admin/companies`,
      company,
      { headers }
    );
  }

  // Update company
  updateCompany(companyId: string, company: Partial<Company>) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.put(
      `${BASE_URL}/admin/companies/${companyId}`,
      company,
      { headers }
    );
  }

  // Update company status
  updateCompanyStatus(companyId: string, status: string) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.patch(
      `${BASE_URL}/admin/companies/${companyId}/status`,
      { status },
      { headers }
    );
  }

  createCompanyAdmin(adminData: {
    companyId: string;
    email: string;
  }) {
    const token = this.getToken();
    let headers = new HttpHeaders();
    console.log('==>Inviting admin2:', adminData);


    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.post(
      `${BASE_URL}/admin/company-admins`,
      adminData,
      { headers }
    );
  }

  // Get current user info (role)
  getCurrentUser() {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return this.http.get(`${BASE_URL}/auth/me`, { headers });
  }

  // Accept invitation and register company admin
  acceptInvitation(registerData: {
    firstName: string;
    lastName: string;
    password: string;
    phone?: string;
  }, token: string) {
    // Include token in request body instead of header
    const requestBody = {
      ...registerData,
      token: token
    };

    return this.http.post(
      `${BASE_URL}/invitations/accept`,
      requestBody
    );
  }

  // Get company admins
  getCompanyAdmins(companyId: string) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return this.http.get(
      `${BASE_URL}/admin/company-admins?companyId=${companyId}`,
      { headers }
    );
  }

  // Update company admin
  updateCompanyAdmin(adminId: string, adminData: {
    firstName: string;
    lastName: string;
    status?: string;
  }) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return this.http.put(
      `${BASE_URL}/admin/company-admins/${adminId}`,
      adminData,
      { headers }
    );
  }

  // Delete company admin
  deleteCompanyAdmin(adminId: string) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return this.http.delete(
      `${BASE_URL}/admin/company-admins/${adminId}`,
      { headers }
    );
  }

  // Delete company
  deleteCompany(companyId: string) {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return this.http.delete(
      `${BASE_URL}/admin/companies/${companyId}`,
      { headers }
    );
  }

  // Get all company admins
  getAllCompanyAdmins() {
    const token = this.getToken();
    let headers = new HttpHeaders();

    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }

    return this.http.get(
      `${BASE_URL}/admin/companies/full?role=company_admin`,
      { headers }
    );
  }
}
