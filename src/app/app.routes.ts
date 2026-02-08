import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { ForgotPasswordComponent } from './components/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './components/reset-password/reset-password.component';
import { HomeComponent } from './components/home/home.component';
import { LandingComponent } from './components/landing/landing.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    data: { animation: 'login' }
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordComponent,
    data: { animation: 'forgotPassword' }
  },
  {
    path: 'reset-password',
    component: ResetPasswordComponent,
    data: { animation: 'resetPassword' }
  },
  {
    path: 'register',
    component: RegisterComponent,
    data: { animation: 'register' }
  },
  {
    path: 'home',
    component: HomeComponent,
    canActivate: [authGuard],
    data: { animation: 'home' }
  },
  {
    path: 'landing',
    component: LandingComponent,
    data: { animation: 'landing' }
  },
  {
    path: '',
    redirectTo: 'landing',
    pathMatch: 'full'
  }
];
