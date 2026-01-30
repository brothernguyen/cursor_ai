import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
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
