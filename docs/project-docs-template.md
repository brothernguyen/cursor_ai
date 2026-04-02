# Meeting Room App - Project Documentation

## Overview
This project is an Angular web app for managing meeting room operations across system and company roles.

Primary capabilities:
- Authentication and role-based routing (`sys_admin`, `company_admin`, `employee`)
- System-admin views for companies and admins
- Company-admin views for meeting rooms, employees, and reports
- Theme/language switching and responsive mobile UX
- Built-in API documentation page (`/api-docs`) powered by OpenAPI/Swagger UI

## Tech Stack
- **Frontend framework:** Angular 19
- **Language:** TypeScript 5
- **UI libraries:** PrimeNG 19, PrimeFlex, PrimeIcons, Bootstrap 5
- **Styling tooling:** SCSS, TailwindCSS (PostCSS pipeline)
- **i18n:** `@ngx-translate/core`, `@ngx-translate/http-loader`
- **State/reactivity:** Angular signals + RxJS
- **Backend platform:** Supabase
  - Auth (`/auth/v1`)
  - PostgREST (`/rest/v1`)
  - Edge Functions (`/functions/v1`)
- **API docs:** OpenAPI 3 + Swagger UI (`swagger-ui-dist`)
- **Testing:** Karma + Jasmine (Angular default test runner)

## Prerequisites
- **Node.js:** v20 LTS recommended (Angular 19 compatible)
- **npm:** v10+ recommended
- **Angular CLI:** optional globally (`npm i -g @angular/cli`), otherwise use local CLI via npm scripts
- **Browser:** Chromium-based browser for local QA
- **Supabase project access:** required for real auth/data workflows

## Getting Started
### 1) Install dependencies
```bash
npm install
```

### 2) Run locally
```bash
npm start
```
App runs at `http://localhost:4200`.

### 3) Build for production
```bash
npm run build
```

### 4) Development watch build
```bash
npm run watch
```

### 5) Run unit tests
```bash
npm test
```

## Environment Configuration
Environment files:
- `src/environments/environment.ts` (development)
- `src/environments/environment.prod.ts` (production)

Current app relies primarily on Supabase settings:

| Variable | Required | Purpose |
|---|---|---|
| `supabaseUrl` | Yes | Base URL of your Supabase project |
| `supabaseAnonKey` | Yes | Public anon key for client-side calls |
| `employeeUseDummyData` | Optional | Fallback mode for employee feature flows |

Notes:
- If Supabase config is missing, several services log warnings and some flows are skipped/fallback.
- Keep secrets out of source control; only public anon key belongs in frontend env files.

## Project Structure
High-level layout:
- `src/app/components/` - UI pages and reusable UI pieces
  - `home/` - main authenticated shell and dashboard/workflow views
  - `landing/`, `login/`, `register/`, `forgot-password/`, `reset-password/`
  - `api-docs/` - Swagger page hosted in-app
- `src/app/services/` - data/services layer
  - `auth.service.ts`, `room.service.ts`, `employee.service.ts`, `supabase.service.ts`, etc.
- `src/environments/` - environment-specific runtime config
- `src/assets/i18n/` - translation files
- `docs/openapi.yaml` - canonical OpenAPI spec source
- `docs/README.md` - API docs usage guide

## Main Workflows
### Auth and Session
1. User signs in from login screen.
2. App resolves role from profile data.
3. Home shell renders role-specific views.
4. Session restore occurs on refresh when config is available.

### System Admin
- Manage companies (search/sort/filter/create/update/delete)
- Manage company admins
- View system dashboard insights

### Company Admin
- Manage meeting rooms
- Invite/manage employees
- View company dashboard/report summaries

## API / Integration Notes
- Supabase endpoints are used directly by services.
- OpenAPI doc lives at `docs/openapi.yaml`, accessible in app via `/api-docs`.
- App role comes from profile data, not directly from raw auth token role.

Related docs:
- `docs/README.md` for Swagger/OpenAPI usage and troubleshooting

## Responsive & UX Notes
- Mobile-first adjustments are centralized in `home.component.scss` phone breakpoints.
- Drawer behavior is phone-aware (open/close patterns differ from desktop/tablet).
- Keep changes scoped to mobile media queries when making phone-specific updates.

## Testing Checklist
### Functional smoke
- [ ] Login/logout works for expected roles
- [ ] Companies page actions work (search/filter/create/edit/delete)
- [ ] Rooms create/edit/delete works
- [ ] Employee list/invite/edit/delete works

### Responsive smoke
- [ ] 390x844
- [ ] 412x915
- [ ] 768x1024
- [ ] 1366x768

### Console quality
- [ ] No uncaught JS runtime errors during core flows
- [ ] Expected warnings are documented or resolved

## Deployment Notes
- `npm run build` outputs deployable artifacts under Angular `dist/`.
- Ensure production environment values are correct before release.
- Validate `/api-docs` still renders and can load `openapi.yaml`.

## Troubleshooting
1. **Blank/partial data after login**
   - Verify `supabaseUrl` and `supabaseAnonKey` in environment files.
   - Check role/profile rows in Supabase tables.

2. **API docs page not loading spec**
   - Confirm `docs/openapi.yaml` exists.
   - Confirm Angular assets config copies it to root as `/openapi.yaml`.

3. **Mobile layout overlap issues**
   - Validate phone media query overrides are scoped to `max-width: 767px`.
   - Inspect drawer/mask z-index behavior if clicks are blocked.

4. **Employee rows missing columns**
   - Check data shape from API (camelCase vs snake_case fields).
   - Verify normalization logic in employee loading flow.

## Contributing Guidelines
- Branch naming: `feature/...`, `fix/...`, `chore/...`
- Keep commits focused and scoped
- Before PR:
  - run lint/tests
  - verify core role workflows
  - verify mobile and desktop regression checks

## Change Log
- 2026-04-01: Added project-specific documentation template with concrete stack, setup, workflow, and troubleshooting details.
