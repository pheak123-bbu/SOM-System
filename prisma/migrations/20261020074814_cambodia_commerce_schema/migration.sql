-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "codRiskOverride" TEXT DEFAULT 'AUTO',
ADD COLUMN     "facebookId" TEXT,
ADD COLUMN     "telegramUsername" TEXT;

-- AlterTable
ALTER TABLE "CustomerAddress" ADD COLUMN     "commune" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "province" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "courier" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(12,2) DEFAULT 4100,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" TEXT DEFAULT 'COD',
ADD COLUMN     "paymentStatus" TEXT DEFAULT 'UNPAID',
ADD COLUMN     "province" TEXT,
ADD COLUMN     "trackingNumber" TEXT;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "costPrice" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "costPrice" DECIMAL(12,2),
ADD COLUMN     "lowStockAlert" INTEGER DEFAULT 5;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "costPrice" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "address" TEXT,
ADD COLUMN     "bakongAccountId" TEXT,
ADD COLUMN     "bankAccountName" TEXT,
ADD COLUMN     "bankAccountNumber" TEXT,
ADD COLUMN     "bankName" TEXT,
ADD COLUMN     "exchangeRate" DECIMAL(12,2) DEFAULT 4100,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "phone" TEXT;

-- CreateIndex
CREATE INDEX "CustomerAddress_customerId_province_idx" ON "CustomerAddress"("customerId", "province");

-- CreateIndex
CREATE INDEX "Order_storeId_courier_idx" ON "Order"("storeId", "courier");

-- CreateIndex
CREATE INDEX "Order_storeId_paymentMethod_paymentStatus_idx" ON "Order"("storeId", "paymentMethod", "paymentStatus");
