ALTER TABLE "Order" ADD COLUMN "inventoryReleasedAt" TIMESTAMP(3);
ALTER TABLE "OrderItem" ADD COLUMN "inventoryReserved" BOOLEAN NOT NULL DEFAULT false;
