import { Component, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { MovementService } from '../../services/movement.service';
import { Personal } from '../personal/personal';
import { Negocio } from '../negocio/negocio';

interface AccountTab {
  id: string;
  label: string;
  disabled: boolean;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, Personal, Negocio],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  public authService = inject(AuthService);
  public movementService = inject(MovementService);
  private router = inject(Router);

  accountTabs: AccountTab[] = [
    { id: 'menu', label: 'Menú', disabled: false },
    { id: 'personal', label: 'Personal', disabled: false },
    { id: 'negocio', label: 'Negocio', disabled: false },
    { id: 'fondo', label: 'Fondo de inversión', disabled: true },
  ];

  activeTab = 'menu';

  // solo movimientos PERSONALES cuentan para estas tarjetas
  balance = computed(() => {
    let total = 0;
    for (const mov of this.movementService.movements()) {
      if (mov.isBusiness) continue;
      total += mov.type === 'INGRESO' ? mov.amount : -mov.amount;
    }
    return total;
  });

  ingresosMes = computed(() => this.sumarDelMes('INGRESO', false));
  gastosMes = computed(() => this.sumarDelMes('GASTO', false));

  impuestos = computed(() => {
    const now = new Date();
    let iva = 0;
    for (const mov of this.movementService.movements()) {
      if (mov.isBusiness) continue;
      const fecha = new Date(mov.date);
      const esDelMesActual = fecha.getMonth() === now.getMonth() && fecha.getFullYear() === now.getFullYear();
      if (mov.type === 'GASTO' && esDelMesActual) {
        iva += this.movementService.ivaIncluido(mov);
      }
    }
    return iva;
  });

  // balance de negocio (todo el historico), solo movimientos marcados como negocio
  negocio = computed(() => {
    let total = 0;
    for (const mov of this.movementService.movements()) {
      if (!mov.isBusiness) continue;
      total += mov.type === 'INGRESO' ? mov.amount : -mov.amount;
    }
    return total;
  });

  fondoInversion: number | null = null;

  ngOnInit(): void {
    this.authService.getMe().subscribe();
    this.movementService.getAll().subscribe();
  }

  private sumarDelMes(type: 'INGRESO' | 'GASTO', isBusiness: boolean): number {
    const now = new Date();
    let total = 0;
    for (const mov of this.movementService.movements()) {
      if (mov.isBusiness !== isBusiness) continue;
      const fecha = new Date(mov.date);
      const esDelMesActual = fecha.getMonth() === now.getMonth() && fecha.getFullYear() === now.getFullYear();
      if (mov.type === type && esDelMesActual) {
        total += mov.amount;
      }
    }
    return total;
  }

  setActiveTab(tab: AccountTab): void {
    if (tab.disabled) return;
    this.activeTab = tab.id;
  }

  formatMoney(value: number | null): string {
    if (value === null) return 'No disponible';
    return 'Q ' + value.toLocaleString('es-GT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}