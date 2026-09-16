import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

declare const google: any; // el SDK de Google se carga por <script> en index.html, no por npm

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login implements OnInit {
  loginForm: FormGroup;

  // signals en vez de propiedades normales: en zoneless, Angular solo
  // repinta la pantalla cuando cambia un signal()
  errorMessage = signal('');
  isLoading = signal(false);

  sessionExpiredMessage = false;
  showPassword = false;

  private readonly GOOGLE_CLIENT_ID =
    '966740166244-fh3l75pimk5q490k9u0s31n03me6fikj.apps.googleusercontent.com';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });

    this.sessionExpiredMessage = this.route.snapshot.queryParamMap.get('expired') === 'true';
  }

  ngOnInit(): void {
    google.accounts.id.initialize({
      client_id: this.GOOGLE_CLIENT_ID,
      callback: (response: any) => this.handleGoogleLogin(response),
    });

    // el boton real de Google se dibuja escondido (no se puede repintar a nuestro estilo).
    // el boton que se ve (.btn-google) le dispara un clic programado a este de aqui
    google.accounts.id.renderButton(document.getElementById('google-btn-hidden'), {
      theme: 'filled_black',
      size: 'large',
    });
  }

  triggerGoogleLogin(): void {
    const hiddenButton = document.querySelector(
      '#google-btn-hidden div[role="button"]'
    ) as HTMLElement | null;
    hiddenButton?.click();
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.errorMessage.set('');
    this.isLoading.set(true);

    const { email, password } = this.loginForm.value;

    this.authService.login(email, password).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.error || 'Ocurrió un error al iniciar sesión');
      },
    });
  }

  handleGoogleLogin(response: any): void {
    this.errorMessage.set('');
    this.isLoading.set(true);

    this.authService.googleLogin(response.credential).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.error || 'No se pudo iniciar sesión con Google');
      },
    });
  }
}