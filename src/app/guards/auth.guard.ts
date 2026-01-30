import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authSer = inject(AuthService);

  if (authSer.getToken() !== null) {
    return true;
  } else {
    const router = inject(Router);
    return router.navigate(['landing']);
  }
};
