-- CreateTable
CREATE TABLE "LiveSession" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "bannerText" TEXT DEFAULT 'លេខទូរស័ព្ទទំនាក់ទំនង 012 345 678 | ដឹកជញ្ជូន 25 ខេត្ត/ក្រុង',
    "topLogoUrl" TEXT,
    "activePinId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LiveSessionProduct" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "cfCode" TEXT NOT NULL,
    "customTitle" TEXT,
    "customPrice" DECIMAL(12,2) NOT NULL,
    "imageUrl" TEXT,
    "allocatedStock" INTEGER NOT NULL DEFAULT 10,
    "remainingStock" INTEGER NOT NULL DEFAULT 10,
    "position" TEXT NOT NULL DEFAULT 'LEFT',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LiveSessionProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LiveSession_storeId_status_idx" ON "LiveSession"("storeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "LiveSessionProduct_sessionId_cfCode_key" ON "LiveSessionProduct"("sessionId", "cfCode");

-- CreateIndex
CREATE INDEX "LiveSessionProduct_sessionId_isActive_idx" ON "LiveSessionProduct"("sessionId", "isActive");

-- AddForeignKey
ALTER TABLE "LiveSession" ADD CONSTRAINT "LiveSession_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSessionProduct" ADD CONSTRAINT "LiveSessionProduct_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LiveSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSessionProduct" ADD CONSTRAINT "LiveSessionProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LiveSessionProduct" ADD CONSTRAINT "LiveSessionProduct_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
