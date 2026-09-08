import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { SessionExpiredService } from './session-expired.service';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'USER';
}

export interface AuthResponse {
  message: string;
  token: string;
  user: User;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly API_URL = 'http://localhost:3000/api/auth';
  private readonly TOKEN_KEY = 'gestion_token';

  // FASE 1: cuanto tiempo sin actividad hace falta para considerar
  // al usuario "inactivo" (5 minutos)
  private readonly INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000;

  // timer de la fase 1: se reinicia cada vez que hay actividad
  private inactivityDetectionTimer: ReturnType<typeof setTimeout> | null = null;

  // timer de la fase 2: solo existe DESPUES de que ya se cumplio la fase 1.
  // cuenta hacia el momento real en que el JWT vence (su "exp")
  private expiryCountdownTimer: ReturnType<typeof setTimeout> | null = null;

  private inactivityListenersAttached = false;

  currentUser = signal<User | null>(null);

  constructor(
    private http: HttpClient,
    private sessionExpiredService: SessionExpiredService
  ) {
    const savedUser = localStorage.getItem('gestion_user');
    if (savedUser) {
      this.currentUser.set(JSON.parse(savedUser));
    }

    this.attachInactivityListeners();
    this.resetInactivityDetection();
  }

  register(name: string, email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.API_URL}/register`, { name, email, password })
      .pipe(tap((response) => this.saveSession(response)));
  }

  login(email: string, password: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.API_URL}/login`, { email, password })
      .pipe(tap((response) => this.saveSession(response)));
  }

  googleLogin(credential: string): Observable<AuthResponse> {
    return this.http
      .post<AuthResponse>(`${this.API_URL}/google`, { credential })
      .pipe(tap((response) => this.saveSession(response)));
  }

  getMe(): Observable<{ user: User }> {
    return this.http.get<{ user: User }>(`${this.API_URL}/me`);
  }

  logout(): void {
    this.clearAllTimers();
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem('gestion_user');
    this.currentUser.set(null);
  }

  getToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  isLoggedIn(): boolean {
    return !!this.getToken();
  }

  private saveSession(response: AuthResponse): void {
    localStorage.setItem(this.TOKEN_KEY, response.token);
    localStorage.setItem('gestion_user', JSON.stringify(response.user));
    this.currentUser.set(response.user);
    this.resetInactivityDetection();
  }

  private clearAllTimers(): void {
    if (this.inactivityDetectionTimer) {
      clearTimeout(this.inactivityDetectionTimer);
      this.inactivityDetectionTimer = null;
    }
    if (this.expiryCountdownTimer) {
      clearTimeout(this.expiryCountdownTimer);
      this.expiryCountdownTimer = null;
    }
  }

  // engancha los eventos de actividad real del usuario, una sola vez
  private attachInactivityListeners(): void {
    if (this.inactivityListenersAttached) return;

    const eventos = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    eventos.forEach((evento) => {
      document.addEventListener(evento, () => this.onUserActivity());
    });

    this.inactivityListenersAttached = true;
  }

  // se llama cada vez que hay actividad real (clic, tecla, mouse, etc)
  private onUserActivity(): void {
    // si la fase 2 ya estaba corriendo (el usuario habia estado inactivo
    // y ahora volvio antes de que el token venciera), la cancelamos:
    // volvemos a empezar desde la fase 1
    if (this.expiryCountdownTimer) {
      clearTimeout(this.expiryCountdownTimer);
      this.expiryCountdownTimer = null;
    }

    this.resetInactivityDetection();
  }

  // FASE 1: reinicia el conteo de 5 minutos de inactividad
  private resetInactivityDetection(): void {
    if (this.inactivityDetectionTimer) {
      clearTimeout(this.inactivityDetectionTimer);
      this.inactivityDetectionTimer = null;
    }

    if (!this.isLoggedIn()) return;

    this.inactivityDetectionTimer = setTimeout(() => {
      this.onInactivityDetected();
    }, this.INACTIVITY_THRESHOLD_MS);
  }

  // se ejecuta justo cuando se cumplen los 5 minutos sin actividad.
  // aqui arranca la FASE 2
  private onInactivityDetected(): void {
    if (!this.isLoggedIn()) return;

    const token = this.getToken();
    if (!token) return;

    const payload = this.decodeToken(token);
    if (!payload?.exp) return;

    const expiresAtMs = payload.exp * 1000;
    const msRestante = expiresAtMs - Date.now();

    if (msRestante <= 0) {
      // el token ya vencio de por si, cerramos de una vez
      this.handleSessionEnd();
      return;
    }

    // FASE 2: contar exactamente lo que falta para que el JWT venza de verdad
    this.expiryCountdownTimer = setTimeout(() => {
      this.handleSessionEnd();
    }, msRestante);
  }

  private handleSessionEnd(): void {
    if (!this.isLoggedIn()) return;
    this.logout();
    this.sessionExpiredService.trigger();
  }

  private decodeToken(token: string): { exp?: number } | null {
    try {
      const payloadBase64 = token.split('.')[1];
      const normalized = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(normalized)
          .split('')
          .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join('')
      );
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
}