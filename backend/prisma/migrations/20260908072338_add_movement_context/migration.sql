/*
  Warnings:

  - You are about to drop the column `isBusiness` on the `movements` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "MovementContext" AS ENUM ('PERSONAL', 'NEGOCIO', 'FONDO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MovementCategory" ADD VALUE 'RENDIMIENTO';
ALTER TYPE "MovementCategory" ADD VALUE 'APORTACION';
ALTER TYPE "MovementCategory" ADD VALUE 'RETIRO';
ALTER TYPE "MovementCategory" ADD VALUE 'COMISION';

-- AlterTable
ALTER TABLE "movements" DROP COLUMN "isBusiness",
ADD COLUMN     "context" "MovementContext" NOT NULL DEFAULT 'PERSONAL';
