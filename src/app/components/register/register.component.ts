import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, Validators, FormGroup } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { RouterLink, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { CheckboxModule } from 'primeng/checkbox';
import { PasswordModule } from 'primeng/password';
import { RippleModule } from 'primeng/ripple';
import { ToastModule } from 'primeng/toast';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-register',
  imports: [
    CardModule,
    InputTextModule,
    ReactiveFormsModule,
    ButtonModule,
    RouterLink,
    CommonModule,
    CheckboxModule,
    PasswordModule,
    RippleModule,
    ToastModule,
  ],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
  providers: [MessageService]
})
export class RegisterComponent implements OnInit {
  registerForm!: FormGroup;
  console = console;
  authService = inject(AuthService);
  msgService = inject(MessageService);
  token: string | null = null;
  isSubmitting = false;

  constructor(private fb: FormBuilder, private router: Router, private activatedRoute: ActivatedRoute) { }

  ngOnInit(): void {
    this.registerForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      password: ['', Validators.required],
      phone: [''],
    });

    // Get token from query params
    this.token = this.activatedRoute.snapshot.queryParams['token'];
    console.log('==>Token from URL:', this.token);

    // Save token to localStorage
    if (this.token) {
      this.authService.setToken(this.token);
      console.log('==>Token saved to localStorage');
    }
  }


  get firstName() {
    return this.registerForm.controls['firstName'];
  }

  get lastName() {
    return this.registerForm.controls['lastName'];
  }

  get password() {
    return this.registerForm.controls['password'];
  }

  get phone() {
    return this.registerForm.controls['phone'];
  }

  onSubmit() {
    if (this.registerForm.valid && this.token) {
      this.isSubmitting = true;
      const formValue = this.registerForm.value;

      const registerData = {
        firstName: formValue.firstName,
        lastName: formValue.lastName,
        password: formValue.password,
        phone: formValue.phone || undefined
      };

      this.authService.acceptInvitation(registerData, this.token).subscribe({
        next: (res: any) => {
          console.log('==>Registration successful:', res);
          this.isSubmitting = false;

          // Remove token from localStorage after successful signup
          this.authService.removeToken();
          
          // Navigate to login page
          this.router.navigate(['/login']);
        },
        error: (error) => {
          console.error('==>Registration error:', error);
          this.isSubmitting = false;

          // Show error message
          const errorMessage = error.error?.message || error.message || 'Failed to complete registration. Please try again.';
          this.msgService.add({
            severity: 'error',
            summary: 'Registration Failed',
            detail: errorMessage,
            life: 5000
          });
        }
      });
    } else {
      // Mark all fields as touched to show validation errors
      Object.keys(this.registerForm.controls).forEach(key => {
        this.registerForm.get(key)?.markAsTouched();
      });

      if (!this.token) {
        this.msgService.add({
          severity: 'error',
          summary: 'Invalid Token',
          detail: 'Invalid invitation token. Please check your invitation link.',
          life: 5000
        });
      }
    }
  }
}
