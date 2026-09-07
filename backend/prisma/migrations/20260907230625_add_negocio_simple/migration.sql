/*
  Warnings:

  - The values [IMPUESTOS] on the enum `MovementCategory` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the column `businessId` on the `movements` table. All the data in the column will be lost.
  - You are about to drop the `business_memberships` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `businesses` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "MovementCategory_new" AS ENUM ('ALIMENTACION', 'TRANSPORTE', 'SERVICIOS', 'SALUD', 'SUELDO', 'BONO', 'VENTA', 'INVERSION', 'SERVICIO_PRESTADO', 'PROVEEDORES', 'NOMINA', 'ALQUILER', 'MARKETING', 'MANTENIMIENTO', 'OTROS');
ALTER TABLE "movements" ALTER COLUMN "category" TYPE "MovementCategory_new" USING ("category"::text::"MovementCategory_new");
ALTER TYPE "MovementCategory" RENAME TO "MovementCategory_old";
ALTER TYPE "MovementCategory_new" RENAME TO "MovementCategory";
DROP TYPE "public"."MovementCategory_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "business_memberships" DROP CONSTRAINT "business_memberships_businessId_fkey";

-- DropForeignKey
ALTER TABLE "business_memberships" DROP CONSTRAINT "business_memberships_userId_fkey";

-- DropForeignKey
ALTER TABLE "businesses" DROP CONSTRAINT "businesses_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "movements" DROP CONSTRAINT "movements_businessId_fkey";

-- AlterTable
ALTER TABLE "movements" DROP COLUMN "businessId",
ADD COLUMN     "isBusiness" BOOLEAN NOT NULL DEFAULT false;

-- DropTable
DROP TABLE "business_memberships";

-- DropTable
DROP TABLE "businesses";

-- DropEnum
DROP TYPE "BusinessRole";

-- DropEnum
DROP TYPE "MembershipStatus";
