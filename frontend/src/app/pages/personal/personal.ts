import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormsModule, FormBuilder, Validators } from '@angular/forms';
import { MovementService, MovementType, MovementCategory, Movement } from '../../services/movement.service';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { VOLTUM_LOGO_BASE64 } from './voltum-logo';

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
  selector: 'app-personal',
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './personal.html',
  styleUrl: './personal.css',
})
export class Personal implements OnInit {
  private fb = inject(FormBuilder);
  public movementService = inject(MovementService);

  incomeCategories: CategoryOption[] = [
    { value: 'SUELDO', label: 'Sueldo' },
    { value: 'BONO', label: 'Bono' },
    { value: 'VENTA', label: 'Venta' },
    { value: 'INVERSION', label: 'Inversión' },
    { value: 'OTROS', label: 'Otros' },
  ];

  expenseCategories: CategoryOption[] = [
    { value: 'ALIMENTACION', label: 'Alimentación' },
    { value: 'TRANSPORTE', label: 'Transporte' },
    { value: 'SERVICIOS', label: 'Servicios' },
    { value: 'SALUD', label: 'Salud' },
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
    category: this.fb.control<MovementCategory>('SUELDO', Validators.required),
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

  private personalMovements(): Movement[] {
    return this.movementService.movements().filter((m) => m.context === 'PERSONAL');
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
      context: 'PERSONAL' as const,
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
    this.form.reset({ type: 'INGRESO', category: 'SUELDO', amount: null, description: '' });
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

  balancePersonal(): number {
    return this.totalIngresos() - this.totalGastos();
  }

  filteredMovements(): Movement[] {
    return this.personalMovements().filter((mov) => {
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

  // siempre muestra el año calendario completo del año actual, de enero a diciembre.
  // al cambiar de año (ej. 2027) esto se recalcula solo, sin tocar codigo
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

  private dibujarEncabezado(doc: jsPDF): void {
    doc.addImage(VOLTUM_LOGO_BASE64, 'PNG', 14, 8, 46, 16.5);
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('REPORTE DE MOVIMIENTOS', 196, 15, { align: 'right' });
    doc.text('VOLTUM · TECNOLOGÍA FINANCIERA', 196, 20, { align: 'right' });
    doc.setTextColor(0);

    const colores: [number, number, number][] = [
      [244, 183, 64], [242, 130, 61], [232, 80, 63], [61, 111, 242],
    ];
    const anchoFranja = 182 / colores.length;
    colores.forEach((color, i) => {
      doc.setFillColor(...color);
      doc.rect(14 + i * anchoFranja, 29, anchoFranja, 1.2, 'F');
    });
  }

  private dibujarPiePagina(doc: jsPDF, numeroPagina: number): void {
    const alturaPagina = doc.internal.pageSize.getHeight();
    doc.setDrawColor(220);
    doc.line(14, alturaPagina - 15, 196, alturaPagina - 15);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text('VOLTUM · Tecnología Financiera', 14, alturaPagina - 10);
    doc.text(`PÁGINA ${numeroPagina}`, 196, alturaPagina - 10, { align: 'right' });
    doc.setTextColor(0);
  }

  exportarPDF(): void {
    const doc = new jsPDF();
    this.dibujarEncabezado(doc);

    doc.setFontSize(17);
    doc.setFont('helvetica', 'bold');
    doc.text('Historial de movimientos personales', 14, 42);
    doc.setFont('helvetica', 'normal');

    doc.setDrawColor(242, 130, 61);
    doc.setLineWidth(0.6);
    doc.line(14, 45, 60, 45);
    doc.setLineWidth(0.2);

    doc.setFontSize(9.5);
    doc.setTextColor(130);
    doc.text(`Generado el ${new Date().toLocaleDateString('es-GT')}`, 14, 51);
    doc.setTextColor(0);

    const filas = this.filteredMovements().map((mov) => [
      this.formatDate(mov.date),
      mov.type === 'INGRESO' ? 'Ingreso' : 'Gasto',
      this.categoryLabel(mov.category),
      mov.description ?? '-',
      (mov.type === 'INGRESO' ? '+' : '-') + this.formatQ(mov.amount),
    ]);

    autoTable(doc, {
      startY: 57,
      head: [['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto']],
      body: filas,
      theme: 'striped',
      headStyles: { fillColor: [242, 130, 61], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'left' },
      styles: { fontSize: 9, cellPadding: 4 },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 4) {
          const esIngreso = String(data.cell.raw).startsWith('+');
          data.cell.styles.textColor = esIngreso ? [79, 174, 130] : [232, 80, 63];
        }
      },
      margin: { bottom: 25 },
      didDrawPage: () => {
        this.dibujarEncabezado(doc);
        this.dibujarPiePagina(doc, doc.getNumberOfPages());
      },
    });

    const finalY = (doc as any).lastAutoTable?.finalY ?? 57;

    const cajaY = finalY + 10;
    doc.setDrawColor(230);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(14, cajaY, 182, 30, 2, 2, 'FD');

    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text('Total ingresos', 22, cajaY + 9);
    doc.text('Total gastos', 22, cajaY + 17);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Balance', 22, cajaY + 25);
    doc.setFont('helvetica', 'normal');

    doc.setTextColor(79, 174, 130);
    doc.text(this.formatQ(this.totalIngresos()), 188, cajaY + 9, { align: 'right' });
    doc.setTextColor(232, 80, 63);
    doc.text(this.formatQ(this.totalGastos()), 188, cajaY + 17, { align: 'right' });
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    const bal = this.balancePersonal();
    doc.setTextColor(bal >= 0 ? 79 : 232, bal >= 0 ? 174 : 80, bal >= 0 ? 130 : 63);
    doc.text(this.formatQ(bal), 188, cajaY + 25, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);

    doc.save('historial-personal.pdf');
  }
}