/**
 * Development environment.
 * Set your Supabase project URL and anon key from https://supabase.com/dashboard/project/_/settings/api
 */
export const environment = {
  production: false,
  supabaseUrl: 'https://lvoncirunpbomolblvuo.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx2b25jaXJ1bnBib21vbGJsdnVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4NTAxNjAsImV4cCI6MjA4NTQyNjE2MH0.9DUqNWZCMbllIZP2eN6DoBqUNjT0d9dF0cv8sthBWhI',
  /**
   * Same-origin prefix for Edge Functions when using `ng serve` + proxy.conf.json.
   * Fixes browser "Failed to fetch" / FunctionsFetchError for /functions/v1/*. Keep
   * `proxy.conf.json` target in sync with supabaseUrl. Omit in production unless
   * you add a same-origin reverse proxy (e.g. /api → Supabase).
   */
  supabaseFunctionsFetchProxyPrefix: '/__sb-fn',
  /**
   * Temporary UI-only data source to visualize Employees/Report before real API + Figma design land.
   * Set to false once real data is ready.
   */
  employeeUseDummyData: true,
};
