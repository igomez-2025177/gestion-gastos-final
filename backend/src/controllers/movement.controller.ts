import { Response } from "express";
import { prisma } from "../lib/prisma";
import { AuthRequest } from "../middlewares/auth.middleware";
import { MovementType, MovementCategory, MovementContext } from "../generated/prisma/client";

const VALID_TYPES = Object.values(MovementType);
const VALID_CONTEXTS = Object.values(MovementContext);

const CATEGORY_MAP: Record<MovementContext, { INGRESO: MovementCategory[]; GASTO: MovementCategory[] }> = {
  PERSONAL: {
    INGRESO: ["SUELDO", "BONO", "VENTA", "INVERSION", "OTROS"],
    GASTO: ["ALIMENTACION", "TRANSPORTE", "SERVICIOS", "SALUD", "OTROS"],
  },
  NEGOCIO: {
    INGRESO: ["VENTA", "SERVICIO_PRESTADO", "OTROS"],
    GASTO: ["PROVEEDORES", "NOMINA", "ALQUILER", "MARKETING", "MANTENIMIENTO", "OTROS"],
  },
  FONDO: {
    INGRESO: ["RENDIMIENTO", "APORTACION", "OTROS"],
    GASTO: ["RETIRO", "COMISION", "OTROS"],
  },
};

function isCategoryValid(type: MovementType, category: MovementCategory, context: MovementContext): boolean {
  return CATEGORY_MAP[context][type].includes(category);
}

// suma todos los INGRESO y resta todos los GASTO de un contexto para saber
// cuanto balance real hay disponible ahi. excludeMovementId sirve para cuando
// se esta editando un movimiento existente, así no se cuenta a si mismo dos veces
async function getContextBalance(
  userId: string,
  context: MovementContext,
  excludeMovementId?: string
): Promise<number> {
  const movements = await prisma.movement.findMany({
    where: {
      userId,
      context,
      ...(excludeMovementId ? { id: { not: excludeMovementId } } : {}),
    },
  });

  return movements.reduce((total, m) => {
    return m.type === "INGRESO" ? total + m.amount : total - m.amount;
  }, 0);
}

export async function createMovement(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;
    const { type, category, amount, description, date, context } = req.body;

    if (!type || !category || amount === undefined) {
      return res.status(400).json({ error: "Faltan campos: type, category, amount" });
    }

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `Tipo inválido, debe ser uno de: ${VALID_TYPES.join(", ")}` });
    }

    const finalContext: MovementContext = context && VALID_CONTEXTS.includes(context) ? context : "PERSONAL";

    if (!isCategoryValid(type, category, finalContext)) {
      return res.status(400).json({ error: "Categoría inválida para este tipo de movimiento" });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "El monto debe ser un número mayor a 0" });
    }

    if (type === "GASTO") {
      const currentBalance = await getContextBalance(userId!, finalContext);

      if (numericAmount > currentBalance) {
        return res.status(400).json({
          error: `No puedes registrar este gasto: tu balance disponible en este contexto es Q${currentBalance.toFixed(2)}`,
        });
      }
    }

    const movement = await prisma.movement.create({
      data: {
        type,
        category,
        amount: numericAmount,
        description: description || null,
        date: date ? new Date(date) : new Date(),
        userId: userId!,
        context: finalContext,
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

    if (category && !isCategoryValid(finalType, finalCategory, existing.context)) {
      return res.status(400).json({ error: "Categoría inválida para este tipo de movimiento" });
    }

    const numericAmount = amount !== undefined ? Number(amount) : existing.amount;
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ error: "El monto debe ser un número mayor a 0" });
    }

    if (finalType === "GASTO") {
      // se excluye el propio movimiento del calculo, porque su version anterior
      // ya está incluida en el historial y no debe contarse dos veces
      const currentBalance = await getContextBalance(userId!, existing.context, id);

      if (numericAmount > currentBalance) {
        return res.status(400).json({
          error: `No puedes registrar este gasto: tu balance disponible en este contexto es Q${currentBalance.toFixed(2)}`,
        });
      }
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