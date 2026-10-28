import { describe, expect, it } from "vitest";
import { OrderStatus } from "@prisma/client";
import { canTransitionOrder } from "@/lib/order-status";

describe("order status transitions", () => {
  it("allows only the next valid confirmation and fulfillment steps", () => {
    expect(canTransitionOrder(OrderStatus.DRAFT, OrderStatus.PENDING_CONFIRMATION)).toBe(true);
    expect(canTransitionOrder(OrderStatus.PENDING_CONFIRMATION, OrderStatus.CONFIRMED)).toBe(true);
    expect(canTransitionOrder(OrderStatus.CONFIRMED, OrderStatus.PROCESSING)).toBe(true);
    expect(canTransitionOrder(OrderStatus.PROCESSING, OrderStatus.SHIPPED)).toBe(true);
    expect(canTransitionOrder(OrderStatus.SHIPPED, OrderStatus.DELIVERED)).toBe(true);
  });

  it("does not allow new or terminal orders to be silently confirmed", () => {
    expect(canTransitionOrder(OrderStatus.DRAFT, OrderStatus.CONFIRMED)).toBe(false);
    expect(canTransitionOrder(OrderStatus.CANCELLED, OrderStatus.CONFIRMED)).toBe(false);
    expect(canTransitionOrder(OrderStatus.DELIVERED, OrderStatus.CANCELLED)).toBe(false);
  });

  it("allows cancellation from pre-terminal states (including returned COD after shipped)", () => {
    expect(canTransitionOrder(OrderStatus.DRAFT, OrderStatus.CANCELLED)).toBe(true);
    expect(canTransitionOrder(OrderStatus.PENDING_CONFIRMATION, OrderStatus.CANCELLED)).toBe(true);
    expect(canTransitionOrder(OrderStatus.CONFIRMED, OrderStatus.CANCELLED)).toBe(true);
    expect(canTransitionOrder(OrderStatus.PROCESSING, OrderStatus.CANCELLED)).toBe(true);
    expect(canTransitionOrder(OrderStatus.SHIPPED, OrderStatus.CANCELLED)).toBe(true);
    expect(canTransitionOrder(OrderStatus.DELIVERED, OrderStatus.CANCELLED)).toBe(false);
  });
});
