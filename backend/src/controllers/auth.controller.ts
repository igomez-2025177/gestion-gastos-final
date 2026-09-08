import { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../lib/prisma";
import { hashPassword, comparePassword } from "../utils/password";
import { generateToken } from "../utils/jwt";
import { AuthRequest } from "../middlewares/auth.middleware";

const ALLOWED_EMAIL_DOMAINS = ["gmail.com", "hotmail.com", "outlook.com", "kinal.edu.gt"];

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function isEmailDomainAllowed(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return !!domain && ALLOWED_EMAIL_DOMAINS.includes(domain);
}

export async function register(req: Request, res: Response) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: "Faltan campos: name, email, password" });
    }

    if (!isEmailDomainAllowed(email)) {
      return res.status(400).json({
        error: `Solo se permiten correos de: ${ALLOWED_EMAIL_DOMAINS.join(", ")}`,
      });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      return res.status(409).json({ error: "Ya existe un usuario con ese email" });
    }

    const hashedPassword = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
      },
    });

    const token = generateToken({ userId: user.id, role: user.role });

    return res.status(201).json({
      message: "Usuario registrado correctamente",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error en register:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Faltan campos: email, password" });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.password) {
      // !user.password cubre el caso de una cuenta creada solo por Google,
      // que no tiene contraseña local todavía
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const passwordMatches = await comparePassword(password, user.password);

    if (!passwordMatches) {
      return res.status(401).json({ error: "Credenciales inválidas" });
    }

    const token = generateToken({ userId: user.id, role: user.role });

    return res.status(200).json({
      message: "Login exitoso",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error en login:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}

export async function googleLogin(req: Request, res: Response) {
  try {
    const { credential } = req.body;

    if (!credential) {
      return res.status(400).json({ error: "Falta el token de Google (credential)" });
    }

    // esto verifica el token contra los servidores de Google, nunca confiamos
    // en un token que llega crudo desde el navegador
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(401).json({ error: "Token de Google inválido" });
    }

    const { sub: googleId, email, name } = payload;

    // 1. ¿ya existe un usuario que entró antes con esta misma cuenta de Google?
    let user = await prisma.user.findUnique({ where: { googleId } });

    // 2. si no, ¿existe una cuenta local con el mismo correo? -> se vincula
    if (!user) {
      user = await prisma.user.findUnique({ where: { email } });

      if (user) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId },
        });
      }
    }

    // 3. si tampoco existe ninguna cuenta, se crea una nueva sin password
    if (!user) {
      if (!isEmailDomainAllowed(email)) {
        return res.status(400).json({
          error: `Solo se permiten correos de: ${ALLOWED_EMAIL_DOMAINS.join(", ")}`,
        });
      }

      user = await prisma.user.create({
        data: {
          name: name ?? email.split("@")[0] ?? "Usuario de Google",
          email,
          googleId,
          // password queda null, esta cuenta solo puede entrar por Google
        },
      });
    }

    const token = generateToken({ userId: user.id, role: user.role });

    return res.status(200).json({
      message: "Login con Google exitoso",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Error en googleLogin:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}

export async function me(req: AuthRequest, res: Response) {
  try {
    const userId = req.user?.userId;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      return res.status(404).json({ error: "Usuario no encontrado" });
    }

    return res.status(200).json({ user });
  } catch (error) {
    console.error("Error en me:", error);
    return res.status(500).json({ error: "Error interno del servidor" });
  }
}