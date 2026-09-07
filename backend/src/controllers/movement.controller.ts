import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { MovementType, MovementCategory } from "../generated/prisma/client";

const VALID_TYPES = Object.values(MovementType);

const PERSONAL_INCOME_CATEGORIES: MovementCategory[] = ["SUELDO", "BONO", "VENTA", "INVERSION", "OTROS"];
const PERSONAL_EXPENSE_CATEGORIES: MovementCategory[] = ["ALIMENTACION", "TRANSPORTE", "SERVICIOS", "SALUD", "OTROS"];

const NEGOCIO_INCOME_CATEGORIES: MovementCategory[] = ["VENTA", "SERVICIO_PRESTADO", "OTROS"];
const NEGOCIO_EXPENSE_CATEGORIES: MovementCategory[] = ["PROVEEDORES", "NOMINA", "ALQUILER", "MARKETING", "MANTENIMIENTO", "OTROS"];

function isCategoryValid(type: MovementType, category: MovementCategory, isBusiness: boolean): boolean {
  const income = isBusiness ? NEGOCIO_INCOME_CATEGORIES : PERSONAL_INCOME_CATEGORIES;
  const expense = isBusiness ? NEGOCIO_EXPENSE_CATEGORIES : PERSONAL_EXPENSE_CATEGORIES;
  return type === "INGRESO" ? income.includes(category) : expense.includes(category);
}

export async function createMovement(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const { type, category, amount, description, date, isBusiness } = req.body;

    if (!type || !category || amount === undefined) {
      return res.status(400).json({ error: "Faltan campos: type, category, amount" });
    }

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `Tipo inválido, debe ser uno de: ${VALID_TYPES.join(", ")}` });
    }

    const esNegocio = !!isBusiness;

    if (!isCategoryValid(type, category, esNegocio)) {
      return res.status(400).json({ error: "Categoría inválida para este tipo de movimiento" });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "El monto debe ser un número mayor a 0" });
    }

    const movement = await prisma.movement.create({
      data: {
        type,
        category,
        amount: numericAmount,
        description: description || null,
        date: date ? new Date(date) : new Date(),
        userId: userId!,
        isBusiness: esNegocio,
      },
    });

    return res.status(201).json({ message: "Movimiento registrado correctamente", movement });
  } catch (error) {
    console.error("Error en createMovement:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}

export async function getMovements(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    const movements = await prisma.movement.findMany({
      where: { userId },
      orderBy: { date: "desc" },
    });

    return res.status(200).json({ movements });
  } catch (error) {
    console.error("Error en getMovements:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}

export async function updateMovement(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const id = req.params.id as string;
    const { type, category, amount, description, date } = req.body;

    const existing = await prisma.movement.findUnique({ where: { id } });

    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Movimiento no encontrado" });
    }

    const finalType = type ?? existing.type;
    const finalCategory = category ?? existing.category;

    if (category && !isCategoryValid(finalType, finalCategory, existing.isBusiness)) {
      return res.status(400).json({ error: "Categoría inválida para este tipo de movimiento" });
    }

    const numericAmount = amount !== undefined ? Number(amount) : existing.amount;
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "El monto debe ser un número mayor a 0" });
    }

    const movement = await prisma.movement.update({
      where: { id },
      data: {
        type: finalType,
        category: finalCategory,
        amount: numericAmount,
        description: description !== undefined ? description || null : existing.description,
        date: date ? new Date(date) : existing.date,
      },
    });

    return res.status(200).json({ message: "Movimiento actualizado correctamente", movement });
  } catch (error) {
    console.error("Error en updateMovement:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}

export async function deleteMovement(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const id = req.params.id as string;

    const existing = await prisma.movement.findUnique({ where: { id } });

    if (!existing || existing.userId !== userId) {
      return res.status(404).json({ error: "Movimiento no encontrado" });
    }

    await prisma.movement.delete({ where: { id } });
    return res.status(200).json({ message: "Movimiento eliminado correctamente" });
  } catch (error) {
    console.error("Error en deleteMovement:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}