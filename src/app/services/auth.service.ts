import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, from, map, switchMap, catchError, of } from 'rxjs';
import { Company } from '../interfaces/auth';
// import { BASE_URL } from '../config/constants'; // kept for commented HTTP API
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  // --- Legacy CRUD API (commented for safety, restore if switching back to custom backend) ---
  // private baseUrl = `${BASE_URL}/auth/login`;

  /** Set by adminLogin when sign-in succeeds as system admin; Home reads and clears it to load companies. */
  private _shouldLoadCompaniesOnNextHomeInit = false;

  constructor(
    private http: HttpClient,
    private sb: SupabaseService
  ) { }

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

  // Get the role (check user_role first, then CurrentRole as fallback)
  getRole(): string | null {
    return localStorage.getItem('user_role') ?? localStorage.getItem('CurrentRole');
  }

  // Remove the role (for logout)
  removeRole(): void {
    localStorage.removeItem('user_role');
  }

  setCompanyId(companyId: string | null): void {
    if (companyId) localStorage.setItem('company_id', companyId);
    else localStorage.removeItem('company_id');
  }

  getCompanyId(): string | null {
    return localStorage.getItem('company_id');
  }

  // Clear all tokens and user data
  clearAll(): void {
    this.removeToken();
    this.removeRole();
    this.setCompanyId(null);
    this._shouldLoadCompaniesOnNextHomeInit = false;
  }

  /** Used by Home after navigation from login to trigger loading companies once. */
  getAndClearShouldLoadCompanies(): boolean {
    const value = this._shouldLoadCompaniesOnNextHomeInit;
    this._shouldLoadCompaniesOnNextHomeInit = false;
    return value;
  }

  // --- Supabase: Admin Login ---
  adminLogin(loginData: { email: string; password: string }): Observable<{ token: string; role: string; data?: { accessToken: string } }> {
    return from(
      this.sb.client.auth.signInWithPassword(loginData)
    ).pipe(
      switchMap(({ data, error }) => {
        if (error) throw error;
        if (!data.session) throw new Error('No session');
        return from(
          this.sb.client
            .from('profiles')
            .select('role, company_id')
            .eq('id', data.session.user.id)
            .single()
        ).pipe(
          map(({ data: profile, error: profileError }) => {
            if (profileError || !profile) throw profileError || new Error('Profile not found');
            const token = data.session!.access_token;
            this.setToken(token);
            this.setRole(profile.role);
            if (profile.company_id) this.setCompanyId(profile.company_id);
            const isSystemAdmin = profile.role === 'system_admin' || profile.role === 'sys_admin' || profile.role === 'system';
            if (isSystemAdmin) this._shouldLoadCompaniesOnNextHomeInit = true;
            return { token, role: profile.role, data: { accessToken: token } };
          })
        );
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // adminLogin(loginData: { email: string; password: string }) {
  //   return this.http.post(this.baseUrl, loginData);
  // }

  // --- Supabase: Get all companies ---
  getAllCompanies(status?: 'active' | 'inactive' | null): Observable<unknown> {
    console.log('==>loadCompanies');

    let q = this.sb.client.from('companies').select('*');
    if (status) q = q.eq('status', status);
    return from(q.order('created_at', { ascending: false })).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map(row => this.companyRowToApp(row));
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // getAllCompanies(status?: 'active' | 'inactive' | null) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   let url = `${BASE_URL}/admin/companies`;
  //   if (status) url += `?status=${status}`;
  //   return this.http.get(url, { headers });
  // }

  createCompany(company: Company): Observable<unknown> {
    const row = this.companyAppToRow(company);
    return from(this.sb.client.from('companies').insert(row).select().single()).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.companyRowToApp(data) : null;
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // createCompany(company: Company) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.post(`${BASE_URL}/admin/companies`, company, { headers });
  // }

  updateCompany(companyId: string, company: Partial<Company>): Observable<unknown> {
    const row = this.companyAppToRow(company as Company);
    return from(this.sb.client.from('companies').update(row).eq('id', companyId).select().single()).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.companyRowToApp(data) : null;
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // updateCompany(companyId: string, company: Partial<Company>) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.put(`${BASE_URL}/admin/companies/${companyId}`, company, { headers });
  // }

  updateCompanyStatus(companyId: string, status: string): Observable<unknown> {
    return from(this.sb.client.from('companies').update({ status }).eq('id', companyId).select().single()).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.companyRowToApp(data) : null;
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // updateCompanyStatus(companyId: string, status: string) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.patch(`${BASE_URL}/admin/companies/${companyId}/status`, { status }, { headers });
  // }

  createCompanyAdmin(adminData: { companyId: string; email: string; companyName?: string }): Observable<unknown> {
    return from(
      this.sb.client.from('company_admins').insert({
        company_id: adminData.companyId,
        email: adminData.email,
      }).select().single()
    ).pipe(
      switchMap(({ data: adminRow, error: insertError }) => {
        if (insertError) throw insertError;
        const admin = adminRow ? this.companyAdminRowToApp(adminRow) : null;
        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        return from(
          this.sb.client.from('invitations').insert({
            token,
            email: adminData.email,
            role: 'company_admin',
            company_id: adminData.companyId,
            expires_at: expiresAt,
          })
        ).pipe(
          map(() => ({ admin, token })),
          catchError((inviteErr) => {
            console.error('Failed to create invitation record:', inviteErr);
            throw inviteErr;
          })
        );
      }),
      switchMap(({ admin, token }) => {
        return from(
          this.sb.client.functions.invoke('send-company-admin-invite', {
            body: {
              email: adminData.email,
              token,
              companyName: adminData.companyName ?? undefined,
            },
          })
        ).pipe(
          map(({ data, error: fnError }) => {
            if (fnError) console.warn('Invitation email may not have been sent:', fnError);
            return admin;
          }),
          catchError((emailErr) => {
            console.warn('Invitation email failed (admin and invitation were created):', emailErr);
            return of(admin!);
          })
        );
      }),
      map((admin) => admin ?? null)
    );
  }

  // --- Legacy CRUD API (commented) ---
  // createCompanyAdmin(adminData: { companyId: string; email: string }) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.post(`${BASE_URL}/admin/company-admins`, adminData, { headers });
  // }

  getCurrentUser(): Observable<unknown> {
    return from(this.sb.client.auth.getSession()).pipe(
      switchMap(({ data: { session }, error }) => {
        if (error) throw error;
        if (!session) return from(Promise.resolve(null));
        return from(
          this.sb.client.from('profiles').select('*').eq('id', session.user.id).single()
        ).pipe(
          map(({ data: profile, error: profileError }) => {
            if (profileError) throw profileError;
            return profile ? {
              id: session.user.id,
              email: session.user.email,
              role: profile.role,
              company_id: profile.company_id,
              firstName: profile.first_name,
              lastName: profile.last_name,
              status: profile.status,
            } : null;
          })
        );
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // getCurrentUser() {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.get(`${BASE_URL}/auth/me`, { headers });
  // }

  acceptInvitation(registerData: {
    firstName: string;
    lastName: string;
    password: string;
    phone?: string;
  }, token: string): Observable<unknown> {
    return from(
      this.sb.client.rpc('get_invitation_by_token', { t: token })
    ).pipe(
      switchMap(({ data: rows, error: rpcErr }) => {
        if (rpcErr) throw rpcErr;
        const inv = (Array.isArray(rows) && rows.length > 0 ? rows[0] : null) as Record<string, unknown> | null;
        if (!inv) throw new Error('Invalid or expired invitation');
        if (new Date((inv['expires_at'] as string)) < new Date()) throw new Error('Invitation expired');
        return from(
          this.sb.client.auth.signUp({
            email: inv['email'] as string,
            password: registerData.password,
            options: {
              data: {
                first_name: registerData.firstName,
                last_name: registerData.lastName,
                phone: registerData.phone,
                role: inv['role'] as string,
                company_id: inv['company_id'] as string,
                status: 'active',
              },
            },
          })
        ).pipe(
          switchMap(({ data, error }) => {
            if (error) throw error;
            if (!data.user) throw new Error('Sign up failed');
            const userId = data.user.id;
            // Trigger on auth.users creates the profiles row from metadata above.
            // Sync profile and company_admins so we're robust if trigger or RLS differs.
            return from(
              this.sb.client.from('profiles').upsert({
                id: userId,
                email: inv['email'] as string,
                role: inv['role'] as string,
                company_id: inv['company_id'] as string,
                first_name: registerData.firstName,
                last_name: registerData.lastName,
                status: 'active',
              }, { onConflict: 'id' })
            ).pipe(
              switchMap(({ error: upsertErr }) => {
                if (upsertErr) console.warn('Profiles upsert warning (trigger may have created row):', upsertErr);
                return from(
                  this.sb.client.from('company_admins').update({
                    user_id: userId,
                    status: 'active',
                  }).eq('email', inv['email'] as string).eq('company_id', inv['company_id'] as string)
                );
              }),
              map(() => ({ success: true }))
            );
          })
        );
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // acceptInvitation(registerData: {...}, token: string) {
  //   return this.http.post(`${BASE_URL}/invitations/accept`, { ...registerData, token });
  // }

  getCompanyAdmins(companyId: string): Observable<unknown> {
    return from(
      this.sb.client.from('company_admins').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map(row => this.companyAdminRowToApp(row));
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // getCompanyAdmins(companyId: string) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.get(`${BASE_URL}/admin/company-admins?companyId=${companyId}`, { headers });
  // }

  updateCompanyAdmin(adminId: string, adminData: { firstName: string; lastName: string; status?: string }): Observable<unknown> {
    const row: Record<string, unknown> = {
      first_name: adminData.firstName,
      last_name: adminData.lastName,
    };
    if (adminData.status != null) row['status'] = adminData.status;
    return from(this.sb.client.from('company_admins').update(row).eq('id', adminId).select().single()).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data ? this.companyAdminRowToApp(data) : null;
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // updateCompanyAdmin(adminId: string, adminData: {...}) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.put(`${BASE_URL}/admin/company-admins/${adminId}`, adminData, { headers });
  // }

  deleteCompanyAdmin(adminId: string): Observable<void> {
    return from(this.sb.client.from('company_admins').delete().eq('id', adminId)).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // deleteCompanyAdmin(adminId: string) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.delete(`${BASE_URL}/admin/company-admins/${adminId}`, { headers });
  // }

  deleteCompany(companyId: string): Observable<void> {
    return from(this.sb.client.from('companies').delete().eq('id', companyId)).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // deleteCompany(companyId: string) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.delete(`${BASE_URL}/admin/companies/${companyId}`, { headers });
  // }

  getAllCompanyAdmins(): Observable<unknown> {
    return from(
      this.sb.client.from('company_admins').select('*, companies(*)').order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map(row => ({
          ...this.companyAdminRowToApp(row),
          company: row.companies ? this.companyRowToApp(row.companies as Record<string, unknown>) : null,
        }));
      })
    );
  }

  // --- Legacy CRUD API (commented) ---
  // getAllCompanyAdmins() {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.get(`${BASE_URL}/admin/companies/full?role=company_admin`, { headers });
  // }

  logout(): void {
    this.sb.client.auth.signOut().then(() => this.clearAll());
  }

  /** Restore token/role/companyId from Supabase session (e.g. on app load after refresh). */
  restoreSession(): void {
    this.sb.client.auth.getSession().then(({ data: { session } }) => {
      if (!session) return;
      this.sb.client.from('profiles').select('role, company_id').eq('id', session.user.id).single().then(({ data: profile }) => {
        if (!profile) return;
        this.setToken(session.access_token);
        this.setRole(profile.role);
        if (profile.company_id) this.setCompanyId(profile.company_id);
      });
    });
  }

  private companyRowToApp(row: Record<string, unknown>): Record<string, unknown> {
    return {
      id: row['id'],
      name: row['name'],
      logoUrl: row['logo_url'],
      address: row['address'],
      phone: row['phone'],
      industry: row['industry'],
      status: row['status'],
    };
  }

  private companyAppToRow(company: Company): Record<string, unknown> {
    return {
      name: company.name,
      logo_url: company.logoUrl,
      address: company.address,
      phone: company.phone,
      industry: company.industry,
      status: company.status,
    };
  }

  private companyAdminRowToApp(row: Record<string, unknown>): Record<string, unknown> {
    return {
      id: row['id'],
      company_id: row['company_id'],
      email: row['email'],
      user_id: row['user_id'],
      firstName: row['first_name'],
      lastName: row['last_name'],
      status: row['status'],
    };
  }
}
