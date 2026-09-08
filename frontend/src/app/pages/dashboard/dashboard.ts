import { Component, OnInit, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { MovementService } from '../../services/movement.service';
import { Personal } from '../personal/personal';
import { Negocio } from '../negocio/negocio';
import { Fondo } from '../fondo/fondo';

interface AccountTab {
  id: string;
  label: string;
  disabled: boolean;
}

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, Personal, Negocio, Fondo],
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
    { id: 'fondo', label: 'Fondo de inversión', disabled: false },
  ];

  activeTab = 'menu';

  balance = computed(() => {
    let total = 0;
    for (const mov of this.movementService.movements()) {
      if (mov.context !== 'PERSONAL') continue;
      total += mov.type === 'INGRESO' ? mov.amount : -mov.amount;
    }
    return total;
  });

  ingresosMes = computed(() => this.sumarDelMes('INGRESO', 'PERSONAL'));
  gastosMes = computed(() => this.sumarDelMes('GASTO', 'PERSONAL'));

  impuestos = computed(() => {
    const now = new Date();
    let iva = 0;
    for (const mov of this.movementService.movements()) {
      if (mov.context !== 'PERSONAL') continue;
      const fecha = new Date(mov.date);
      const esDelMesActual = fecha.getMonth() === now.getMonth() && fecha.getFullYear() === now.getFullYear();
      if (mov.type === 'GASTO' && esDelMesActual) {
        iva += this.movementService.ivaIncluido(mov);
      }
    }
    return iva;
  });

  negocio = computed(() => this.balancePorContexto('NEGOCIO'));
  fondoInversion = computed(() => this.balancePorContexto('FONDO'));

  ngOnInit(): void {
    this.authService.getMe().subscribe();
    this.movementService.getAll().subscribe();
  }

  private balancePorContexto(context: 'NEGOCIO' | 'FONDO'): number {
    let total = 0;
    for (const mov of this.movementService.movements()) {
      if (mov.context !== context) continue;
      total += mov.type === 'INGRESO' ? mov.amount : -mov.amount;
    }
    return total;
  }

  private sumarDelMes(type: 'INGRESO' | 'GASTO', context: 'PERSONAL' | 'NEGOCIO' | 'FONDO'): number {
    const now = new Date();
    let total = 0;
    for (const mov of this.movementService.movements()) {
      if (mov.context !== context) continue;
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

  formatMoney(value: number): string {
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