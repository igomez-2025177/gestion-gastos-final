import { Component, OnInit, inject } from '@angular/core';
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

interface CategoryGroup {
  category: MovementCategory;
  label: string;
  movements: Movement[];
  subtotal: number;
}

type HistoryFilter = 'TODOS' | MovementType;

@Component({
  selector: 'app-fondo',
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './fondo.html',
  styleUrl: './fondo.css',
})
export class Fondo implements OnInit {
  private fb = inject(FormBuilder);
  public movementService = inject(MovementService);

  incomeCategories: CategoryOption[] = [
    { value: 'RENDIMIENTO', label: 'Rendimiento' },
    { value: 'APORTACION', label: 'Aportación' },
    { value: 'OTROS', label: 'Otros' },
  ];

  expenseCategories: CategoryOption[] = [
    { value: 'RETIRO', label: 'Retiro' },
    { value: 'COMISION', label: 'Comisión' },
    { value: 'OTROS', label: 'Otros' },
  ];

  allCategories: CategoryOption[] = [...this.incomeCategories, ...this.expenseCategories];

  isSubmitting = false;
  errorMessage = '';

  editingId: string | null = null;

  expandedCategories = new Set<MovementCategory>();

  filterType: HistoryFilter = 'TODOS';
  filterMonth: string = 'TODOS';

  form = this.fb.group({
    type: this.fb.control<MovementType>('INGRESO', Validators.required),
    category: this.fb.control<MovementCategory>('APORTACION', Validators.required),
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

  private fondoMovements(): Movement[] {
    return this.movementService.movements().filter((m) => m.context === 'FONDO');
  }

  categoriesForType(type: MovementType | null): CategoryOption[] {
    return type === 'INGRESO' ? this.incomeCategories : this.expenseCategories;
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    const { type, category, amount, description } = this.form.getRawValue();
    const payload = {
      type: type!,
      category: category!,
      amount: amount!,
      description: description || undefined,
      context: 'FONDO' as const,
    };

    const request$ = this.editingId
      ? this.movementService.update(this.editingId, payload)
      : this.movementService.create(payload);

    request$.subscribe({
      next: () => {
        this.isSubmitting = false;
        this.cancelEdit();
      },
      error: (err) => {
        this.isSubmitting = false;
        this.errorMessage = err.error?.error || 'Error al guardar el movimiento';
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
  }

  cancelEdit(): void {
    this.editingId = null;
    this.form.reset({ type: 'INGRESO', category: 'APORTACION', amount: null, description: '' });
  }

  confirmDelete(mov: Movement): void {
    const confirmado = confirm(
      `¿Seguro que quieres eliminar este movimiento de ${this.categoryLabel(mov.category)} por ${this.formatQ(mov.amount)}?`
    );
    if (!confirmado) return;

    this.movementService.delete(mov.id).subscribe({
      error: () => {
        this.errorMessage = 'No se pudo eliminar el movimiento';
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

  balanceFondo(): number {
    return this.totalIngresos() - this.totalGastos();
  }

  filteredMovements(): Movement[] {
    return this.fondoMovements().filter((mov) => {
      const matchesType = this.filterType === 'TODOS' || mov.type === this.filterType;
      const matchesMonth = this.matchesMonth(mov);
      return matchesType && matchesMonth;
    });
  }

  onFilterTypeChange(value: string): void {
    this.filterType = value as HistoryFilter;
  }

  categoryGroups(): CategoryGroup[] {
    const groups: CategoryGroup[] = [];

    for (const cat of this.allCategories) {
      const movs = this.filteredMovements().filter((m) => m.category === cat.value);
      if (movs.length === 0) continue;

      const subtotal = movs.reduce((sum, m) => sum + (m.type === 'INGRESO' ? m.amount : -m.amount), 0);

      groups.push({ category: cat.value, label: cat.label, movements: movs, subtotal });
    }

    return groups.sort((a, b) => Math.abs(b.subtotal) - Math.abs(a.subtotal));
  }

  toggleCategory(cat: MovementCategory): void {
    if (this.expandedCategories.has(cat)) {
      this.expandedCategories.delete(cat);
    } else {
      this.expandedCategories.add(cat);
    }
  }

  isExpanded(cat: MovementCategory): boolean {
    return this.expandedCategories.has(cat);
  }

  availableMonths(): MonthOption[] {
    const monthsSet = new Set<string>();

    for (const mov of this.fondoMovements()) {
      const fecha = new Date(mov.date);
      const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
      monthsSet.add(key);
    }

    const nombresMes = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];

    return Array.from(monthsSet)
      .sort((a, b) => b.localeCompare(a))
      .map((key) => {
        const [year, month] = key.split('-');
        const label = `${nombresMes[Number(month) - 1]} ${year}`;
        return { value: key, label };
      });
  }

  private matchesMonth(mov: Movement): boolean {
    if (this.filterMonth === 'TODOS') return true;
    const fecha = new Date(mov.date);
    const key = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}`;
    return key === this.filterMonth;
  }
}