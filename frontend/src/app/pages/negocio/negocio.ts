import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { MovementService, MovementType, MovementCategory, Movement } from '../../services/movement.service';

interface CategoryOption {
  value: MovementCategory;
  label: string;
}

interface MonthOption {
  value: string;
  label: string;
}

type HistoryFilter = 'TODOS' | MovementType;

@Component({
  selector: 'app-negocio',
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './negocio.html',
  styleUrl: './negocio.css',
})
export class Negocio implements OnInit {
  private fb = inject(FormBuilder);
  public movementService = inject(MovementService);

  incomeCategories: CategoryOption[] = [
    { value: 'VENTA', label: 'Venta' },
    { value: 'SERVICIO_PRESTADO', label: 'Servicio prestado' },
    { value: 'OTROS', label: 'Otros' },
  ];

  expenseCategories: CategoryOption[] = [
    { value: 'PROVEEDORES', label: 'Proveedores' },
    { value: 'NOMINA', label: 'Nómina' },
    { value: 'ALQUILER', label: 'Alquiler' },
    { value: 'MARKETING', label: 'Marketing' },
    { value: 'MANTENIMIENTO', label: 'Mantenimiento' },
    { value: 'OTROS', label: 'Otros' },
  ];

  allCategories: CategoryOption[] = [...this.incomeCategories, ...this.expenseCategories];

  isSubmitting = signal(false);
  errorMessage = signal('');

  editingId: string | null = null;

  filterType: HistoryFilter = 'TODOS';
  filterCategory: MovementCategory | 'TODAS' = 'TODAS';
  filterMonth: string = 'TODOS';

  form = this.fb.group({
    type: this.fb.control<MovementType>('INGRESO', Validators.required),
    category: this.fb.control<MovementCategory>('VENTA', Validators.required),
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    description: this.fb.control(''),
  });

  ngOnInit(): void {
    this.movementService.getAll().subscribe();

    this.form.get('type')!.valueChanges.subscribe((newType) => {
      if (this.editingId) return;
      const firstValid = this.categoriesForType(newType!)[0]?.value;
      this.form.get('category')!.setValue(firstValid);
    });
  }

  private businessMovements(): Movement[] {
    return this.movementService.movements().filter((m) => m.context === 'NEGOCIO');
  }

  categoriesForType(type: MovementType | null): CategoryOption[] {
    return type === 'INGRESO' ? this.incomeCategories : this.expenseCategories;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    const { type, category, amount, description } = this.form.getRawValue();
    const payload = {
      type: type!,
      category: category!,
      amount: amount!,
      description: description || undefined,
      context: 'NEGOCIO' as const,
    };

    const request$ = this.editingId
      ? this.movementService.update(this.editingId, payload)
      : this.movementService.create(payload);

    request$.subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.cancelEdit();
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.errorMessage.set(err.error?.error || 'Error al guardar el movimiento');
      },
    });
  }

  startEdit(mov: Movement): void {
    this.editingId = mov.id;
    this.form.setValue({
      type: mov.type,
      category: mov.category,
      amount: mov.amount,
      description: mov.description ?? '',
    });
    document.querySelector('.form-panel')?.scrollIntoView({ behavior: 'smooth' });
  }

  cancelEdit(): void {
    this.editingId = null;
    this.form.reset({ type: 'INGRESO', category: 'VENTA', amount: null, description: '' });
  }

  confirmDelete(mov: Movement): void {
    const confirmado = confirm(
      `¿Seguro que quieres eliminar este movimiento de ${this.categoryLabel(mov.category)} por ${this.formatQ(mov.amount)}?`
    );
    if (!confirmado) return;

    this.movementService.delete(mov.id).subscribe({
      error: () => {
        this.errorMessage.set('No se pudo eliminar el movimiento');
      },
    });
  }

  categoryLabel(value: MovementCategory): string {
    return this.allCategories.find((c) => c.value === value)?.label ?? value;
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-GT', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  formatQ(value: number): string {
    return 'Q ' + value.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  totalIngresos(): number {
    return this.filteredMovements()
      .filter((m) => m.type === 'INGRESO')
      .reduce((sum, m) => sum + m.amount, 0);
  }

  totalGastos(): number {
    return this.filteredMovements()
      .filter((m) => m.type === 'GASTO')
      .reduce((sum, m) => sum + m.amount, 0);
  }

  balanceNegocio(): number {
    return this.totalIngresos() - this.totalGastos();
  }

  filteredMovements(): Movement[] {
    return this.businessMovements().filter((mov) => {
      const matchesType = this.filterType === 'TODOS' || mov.type === this.filterType;
      const matchesCategory = this.filterCategory === 'TODAS' || mov.category === this.filterCategory;
      const matchesMonth = this.matchesMonth(mov);
      return matchesType && matchesCategory && matchesMonth;
    });
  }

  onFilterTypeChange(value: string): void {
    this.filterType = value as HistoryFilter;
    this.filterCategory = 'TODAS';
  }

  categoriesForFilter(): CategoryOption[] {
    if (this.filterType === 'INGRESO') return this.incomeCategories;
    if (this.filterType === 'GASTO') return this.expenseCategories;
    return this.allCategories;
  }

  availableMonths(): MonthOption[] {
    const nombresMes = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];

    const anioActual = new Date().getFullYear();

    return nombresMes.map((nombre, index) => ({
      value: `${anioActual}-${String(index + 1).padStart(2, '0')}`,
      label: `${nombre} ${anioActual}`,
    }));
  }

  private matchesMonth(mov: Movement): boolean {
    if (this.filterMonth === 'TODOS') return true;
    const fecha = new Date(mov.date);
    const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    return key === this.filterMonth;
  }
}