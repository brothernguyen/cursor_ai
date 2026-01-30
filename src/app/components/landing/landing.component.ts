import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';


@Component({
  selector: 'app-landing',
  imports: [CommonModule, RouterLink],
  templateUrl: './landing.component.html',
  styleUrl: './landing.component.scss'
})
export class LandingComponent {

  constructor(private router: Router) {}

  handleRegister() {
    this.router.navigate(['/register']);
  }

  handleSignin() {
    this.router.navigate(['/login']);
  }
}
