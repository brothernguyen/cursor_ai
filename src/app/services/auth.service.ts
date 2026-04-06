import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, from, map, switchMap, catchError, of, throwError } from 'rxjs';
import { Company } from '../interfaces/auth';
// import { BASE_URL } from '../config/constants'; // kept for commented HTTP API
import { SupabaseService } from './supabase.service';
import { environment } from '../../environments/environment';

/**
 * Values stored in `public.profiles.role` (DB check constraint).
 * Supabase Auth’s JWT `user.role` is separate: `authenticated` / `anon` for RLS, not this enum.
 */
export type AppUserRole = 'sys_admin' | 'company_admin' | 'employee';

/** Result of a successful password login: token plus application role from `profiles`. */
export interface AdminLoginResult {
  token: string;
  role: AppUserRole;
  data: { accessToken: string };
}

/** Build redirect URL for password reset (must be allowed in Supabase Auth URL config). */
function getResetPasswordRedirectUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/reset-password`;
  }
  return environment.supabaseUrl ? `${environment.supabaseUrl.replace(/\/$/, '')}/reset-password` : '/reset-password';
}

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

  /**
   * Password sign-in: Supabase session gives JWT `user.role` = `authenticated` only.
   * Loads **`profiles.role`** (`AppUserRole`) and `company_id` for the UI and RLS-backed queries.
   */
  adminLogin(loginData: { email: string; password: string }): Observable<AdminLoginResult> {
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
            const role = profile.role as AppUserRole;
            this.setToken(token);
            this.setRole(profile.role);
            if (profile.company_id) this.setCompanyId(profile.company_id);
            const isSystemAdmin = profile.role === 'system_admin' || profile.role === 'sys_admin' || profile.role === 'system';
            if (isSystemAdmin) this._shouldLoadCompaniesOnNextHomeInit = true;
            return { token, role, data: { accessToken: token } };
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

  createCompanyAdmin(adminData: {
    companyId: string;
    email: string;
    companyName?: string;
  }): Observable<{
    admin: Record<string, unknown> | null;
    emailSent: true;
  }> {
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
        const url = `${environment.supabaseUrl}/functions/v1/send-company-admin-invite`;
        const adminId = String(admin?.['id'] ?? '');
        const companyId = adminData.companyId;
        return from(this.sb.client.auth.getSession()).pipe(
          switchMap(({ data: sess, error: sessErr }) => {
            if (sessErr) throw sessErr;
            const access =
              sess?.session?.access_token?.trim() || this.getToken()?.trim() || '';
            const headers = new HttpHeaders({
              'Content-Type': 'application/json',
              apikey: environment.supabaseAnonKey,
              ...(access ? { Authorization: `Bearer ${access}` } : {}),
            });
            return this.http
              .post<{ success?: boolean; id?: string }>(
                url,
                {
                  email: adminData.email,
                  token,
                  companyName: adminData.companyName ?? undefined,
                },
                { headers }
              )
              .pipe(
                map(() => ({
                  admin,
                  emailSent: true as const,
                })),
                catchError((emailErr: unknown) => {
                  const body = (
                    emailErr instanceof HttpErrorResponse ? emailErr.error : null
                  ) as { error?: string; details?: unknown; hint?: string } | null;
                  let msg: string;
                  if (body?.error && typeof body.error === 'string') {
                    msg = body.details
                      ? `${body.error}: ${JSON.stringify(body.details)}`
                      : body.error;
                  } else if (emailErr instanceof HttpErrorResponse) {
                    msg = emailErr.message || 'Invitation email failed';
                  } else if (emailErr instanceof Error) {
                    msg = emailErr.message;
                  } else {
                    msg = 'Invitation email failed';
                  }
                  if (body?.hint && typeof body.hint === 'string') {
                    msg = `${msg} ${body.hint}`;
                  }
                  console.warn(
                    'Company admin invite email failed; rolling back invitation + admin row:',
                    msg
                  );
                  return from(this.sb.client.from('invitations').delete().eq('token', token)).pipe(
                    switchMap(({ error: invDelErr }) => {
                      if (invDelErr) {
                        console.error('Rollback: could not delete invitation row', invDelErr);
                      }
                      return from(
                        this.sb.client
                          .from('company_admins')
                          .delete()
                          .eq('id', adminId)
                          .eq('company_id', companyId)
                      );
                    }),
                    switchMap(({ error: cadDelErr }) => {
                      if (cadDelErr) {
                        console.error('Rollback: could not delete company_admins row', cadDelErr);
                      }
                      return throwError(() => new Error(msg));
                    })
                  );
                })
              );
          })
        );
      }),
      map((result) => ({
        ...result,
        admin: result.admin ?? null,
      }))
    );
  }

  // --- Legacy CRUD API (commented) ---
  // createCompanyAdmin(adminData: { companyId: string; email: string }) {
  //   const token = this.getToken();
  //   let headers = new HttpHeaders();
  //   if (token) headers = headers.set('Authorization', `Bearer ${token}`);
  //   return this.http.post(`${BASE_URL}/admin/company-admins`, adminData, { headers });
  // }

  /** Session user plus **`profiles.role`** (app role); omit relying on `session.user.role` (`authenticated`). */
  getCurrentUser(): Observable<{
    id: string;
    email: string | undefined;
    role: AppUserRole;
    company_id: string | null;
    firstName: string | null;
    lastName: string | null;
    status: string | null;
  } | null> {
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
              role: profile.role as AppUserRole,
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

  /**
   * If signUp returns no session (e.g. email confirmation enabled), confirm via Edge Function
   * then sign in so subsequent profile / employee updates pass RLS.
   */
  private ensureSessionAfterInviteSignUp(
    hasSessionFromSignUp: boolean,
    inviteEmail: string,
    password: string,
    invitationToken: string,
    userId: string
  ): Observable<void> {
    if (hasSessionFromSignUp) {
      return of(undefined);
    }
    const url = `${environment.supabaseUrl}/functions/v1/confirm-invited-user`;
    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      apikey: environment.supabaseAnonKey,
    });
    return this.http
      .post<{ success?: boolean; error?: string }>(url, { token: invitationToken, userId }, { headers })
      .pipe(
        switchMap((body) => {
          if (body && typeof body === 'object' && typeof body.error === 'string' && body.error) {
            return throwError(() => new Error(body.error));
          }
          return from(this.sb.client.auth.signInWithPassword({ email: inviteEmail, password }));
        }),
        map(({ data, error }) => {
          if (error) throw error;
          if (!data.session) throw new Error('Sign-in after registration failed');
          return undefined;
        })
      );
  }

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
        const inviteEmail = String(inv['email'] ?? '').trim();
        const companyId = inv['company_id'] != null ? String(inv['company_id']).trim() : '';
        const invRole = String(inv['role'] ?? '').trim();

        return from(
          this.sb.client.auth.signUp({
            email: inviteEmail,
            password: registerData.password,
            options: {
              data: {
                first_name: registerData.firstName,
                last_name: registerData.lastName,
                phone: registerData.phone,
                role: invRole,
                company_id: companyId,
                status: 'active',
              },
            },
          })
        ).pipe(
          switchMap(({ data, error }) => {
            if (error) throw error;
            if (!data.user) throw new Error('Sign up failed');
            const userId = data.user.id;
            return this.ensureSessionAfterInviteSignUp(
              Boolean(data.session),
              inviteEmail,
              registerData.password,
              token,
              userId
            ).pipe(
              switchMap(() =>
                from(
                  this.sb.client.from('profiles').upsert(
                    {
                      id: userId,
                      email: inviteEmail,
                      role: invRole,
                      company_id: companyId,
                      first_name: registerData.firstName,
                      last_name: registerData.lastName,
                      status: 'active',
                    },
                    { onConflict: 'id' }
                  )
                ).pipe(
                  switchMap(({ error: upsertErr }) => {
                    if (upsertErr) {
                      console.warn('Profiles upsert warning (trigger may have created row):', upsertErr);
                    }
                    if (invRole === 'employee') {
                      return from(
                        this.sb.client
                          .from('employees')
                          .update({
                            user_id: userId,
                            first_name: registerData.firstName,
                            last_name: registerData.lastName,
                            status: 'active',
                          })
                          .eq('email', inviteEmail)
                          .eq('company_id', companyId)
                          .select('id')
                          .maybeSingle()
                      ).pipe(
                        map(({ data: row, error: updErr }) => {
                          if (updErr) throw updErr;
                          if (!row) {
                            throw new Error(
                              'Could not activate employee (no matching employees row for this invite, or access denied).'
                            );
                          }
                          return { success: true as const };
                        })
                      );
                    }
                    return from(
                      this.sb.client
                        .from('company_admins')
                        .update({
                          user_id: userId,
                          first_name: registerData.firstName,
                          last_name: registerData.lastName,
                          status: 'active',
                        })
                        .eq('email', inviteEmail)
                        .eq('company_id', companyId)
                        .select('id')
                        .maybeSingle()
                    ).pipe(
                      map(({ data: row, error: updErr }) => {
                        if (updErr) throw updErr;
                        if (!row) {
                          throw new Error(
                            'Could not activate company admin (no matching company_admins row for this invite, or access denied).'
                          );
                        }
                        return { success: true as const };
                      })
                    );
                  })
                )
              )
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

  /**
   * Deletes the company admin: removes the company_admins row and the auth user (if any)
   * so they can no longer log in. Uses the delete-company-admin Edge Function.
   */
  deleteCompanyAdmin(adminId: string): Observable<void> {
    const url = `${environment.supabaseUrl}/functions/v1/delete-company-admin`;
    return from(this.sb.client.auth.getSession()).pipe(
      switchMap(({ data: { session } }) => {
        // Use fresh Supabase session token. LocalStorage can become stale if Supabase refreshes internally.
        const token = session?.access_token ?? this.getToken();
        const headers = new HttpHeaders({
          'Content-Type': 'application/json',
          // Some Edge Function setups expect apikey alongside Authorization when verify_jwt is enabled.
          'apikey': environment.supabaseAnonKey,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        });

        return this.http.post<{ success?: boolean; error?: string; details?: string }>(
          url,
          { company_admin_id: adminId },
          { headers }
        );
      }),
      map(() => undefined),
      catchError((err) => {
        const body = err.error as { error?: string; details?: string } | undefined;
        const msg =
          body?.error && typeof body.error === 'string'
            ? body.details
              ? `${body.error}: ${body.details}`
              : body.error
            : err.message || 'Failed to delete admin.';
        return throwError(() => new Error(msg));
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
      this.sb.client
        .from('company_admins')
        .select('id, first_name, last_name, email, status, company_id, created_at, companies(id, name)')
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data ?? []).map(row => {
          const companyRaw = Array.isArray(row.companies) ? row.companies[0] : row.companies;
          return {
            ...this.companyAdminRowToApp(row),
            company: companyRaw ? this.companyRowToApp(companyRaw as Record<string, unknown>) : null,
          };
        });
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

  /** Request a password reset email. Supabase sends a link to the given redirect URL. */
  requestPasswordReset(email: string): Observable<void> {
    const redirectTo = getResetPasswordRedirectUrl();
    return from(
      this.sb.client.auth.resetPasswordForEmail(email, { redirectTo })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  /** Update the current user's password (used on reset-password page after recovery link). */
  updatePassword(newPassword: string): Observable<void> {
    return from(this.sb.client.auth.updateUser({ password: newPassword })).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  logout(): void {
    this.sb.client.auth.signOut().then(() => this.clearAll());
  }

  /**
   * Restore token and **`user_role`** from Supabase session + **`profiles`**.
   * JWT `user.role` stays `authenticated`; app role always comes from `profiles`.
   */
  restoreSession(): void {
    if (!this.sb.isConfigured()) {
      console.warn(
        '[Auth] Supabase is not configured. Set `supabaseUrl` and `supabaseAnonKey` in src/environments/environment.ts — skipping session restore so the app can still load.'
      );
      return;
    }
    this.sb.client.auth.getSession()
      .then(({ data: { session } }) => {
        if (!session) return;
        this.sb.client
          .from('profiles')
          .select('role, company_id')
          .eq('id', session.user.id)
          .single()
          .then(({ data: profile }) => {
            if (!profile) return;
            this.setToken(session.access_token);
            this.setRole(profile.role);
            if (profile.company_id) this.setCompanyId(profile.company_id);
          });
      })
      .catch((err: unknown) => {
        const e = err as { name?: unknown; message?: unknown } | null;
        const name = String(e?.name ?? '');
        const msg = String(e?.message ?? '');
        // Ignore transient Supabase lock-manager contention for auth token reads.
        if (
          name === 'NavigatorLockAcquireTimeoutError'
          || msg.includes('auth-token')
        ) {
          return;
        }
        console.error('[Auth] restoreSession getSession failed', err);
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
