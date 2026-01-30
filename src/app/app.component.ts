import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { RouterOutlet, ActivatedRoute } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { PrimeNG } from 'primeng/config';
import { TableModule } from 'primeng/table';
import { CardModule } from 'primeng/card';
import { AuthService } from './services/auth.service';
import { trigger, transition, style, query, animateChild, group, animate } from '@angular/animations';

export const routeAnimations = trigger('routeAnimations', [
  transition('landing => login', [
    style({ position: 'relative' }),
    query(':enter, :leave', [
      style({
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%'
      })
    ]),
    query(':enter', [
      style({ opacity: 0 })
    ]),
    query(':leave', animateChild()),
    group([
      query(':leave', [
        animate('600ms ease-in-out', style({ opacity: 0 }))
      ]),
      query(':enter', [
        animate('600ms ease-in-out', style({ opacity: 1 }))
      ])
    ]),
    query(':enter', animateChild())
  ]),
  transition('login => landing', [
    style({ position: 'relative' }),
    query(':enter, :leave', [
      style({
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%'
      })
    ]),
    query(':enter', [
      style({ opacity: 0 })
    ]),
    query(':leave', animateChild()),
    group([
      query(':leave', [
        animate('600ms ease-in-out', style({ opacity: 0 }))
      ]),
      query(':enter', [
        animate('600ms ease-in-out', style({ opacity: 1 }))
      ])
    ]),
    query(':enter', animateChild())
  ]),
  transition('* <=> *', [
    style({ position: 'relative' }),
    query(':enter, :leave', [
      style({
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%'
      })
    ]),
    query(':enter', [
      style({ opacity: 0 })
    ]),
    query(':leave', animateChild()),
    group([
      query(':leave', [
        animate('400ms ease-in-out', style({ opacity: 0 }))
      ]),
      query(':enter', [
        animate('400ms ease-in-out', style({ opacity: 1 }))
      ])
    ]),
    query(':enter', animateChild())
  ])
]);

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ButtonModule, TableModule, CardModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  animations: [routeAnimations]
})

export class AppComponent implements OnInit, OnDestroy {
  title = 'meeting-room';
  authSer = inject(AuthService);
  private beforeUnloadHandler?: () => void;

  constructor(private primeng: PrimeNG) { }

  prepareRoute(outlet: RouterOutlet) {
    return outlet?.activatedRouteData?.['animation'];
  }

  ngOnInit() {
    this.primeng.ripple.set(true);
    
    // Clear all tokens on app initialization
    this.authSer.clearAll();
    
    // Clear tokens when browser tab is closed
    this.beforeUnloadHandler = () => {
      this.authSer.clearAll();
    };
    
    window.addEventListener('beforeunload', this.beforeUnloadHandler);
  }

  ngOnDestroy() {
    // Clean up event listener
    if (this.beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this.beforeUnloadHandler);
    }
  }
}
