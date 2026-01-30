import { Component, inject, OnInit } from '@angular/core';
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
import { AuthService } from '../../services/auth.service';
import { MessageService } from 'primeng/api';
import { Toast } from 'primeng/toast';
@Component({
  selector: 'app-login',
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
    Toast
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;
  authSer = inject(AuthService);

  console = console;

  constructor(private fb: FormBuilder, private router: Router, private msgService: MessageService) { }

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
  }

  get email() {
    return this.loginForm.controls['email'];
  }

  get password() {
    return this.loginForm.controls['password'];
  }

  onSubmit() {
    if (this.loginForm.invalid) {
      return;
    }

    const loginData = {
      email: this.loginForm.value.email,
      password: this.loginForm.value.password
    };

    this.authSer.adminLogin(loginData).subscribe({
      next: (res: any) => {
        const token = res.data.accessToken;
        console.log('==>token: ', token);

        this.authSer.setToken(token);
        this.router.navigate(['/home']);
      },
      error: (error) => {
        console.log('==>Login error: ', error);
        this.msgService.add({ severity: 'error', summary: 'Error', detail: 'Credential invalid!', life: 3000 });
      }
    });
    this.loginForm.reset();
  }
}
