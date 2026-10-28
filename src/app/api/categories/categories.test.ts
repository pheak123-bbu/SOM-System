import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    category: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    product: {
      updateMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(async (cb) => {
      return cb(db);
    }),
  },
}));

import { getAuthContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { GET as getCategories, POST as createCategory } from "./route";
import { GET as getCategoryById, PATCH as updateCategory, DELETE as deleteCategory } from "./[categoryId]/route";

describe("Categories API Module", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "user-1",
      storeId: "store-1",
      role: "OWNER",
      user: { id: "user-1", name: "Dara", email: "dara@example.com" },
      store: { id: "store-1", name: "Dara Store", currency: "USD" },
    } as any);
  });

  it("GET /api/categories returns categories with product count", async () => {
    vi.mocked(db.category.findMany).mockResolvedValue([
      {
        id: "cat-1",
        storeId: "store-1",
        name: "សម្លៀកបំពាក់",
        description: "អាវ និងខោ",
        color: "#3164ce",
        icon: null,
        active: true,
        createdAt: new Date("2026-10-22T00:00:00Z"),
        updatedAt: new Date("2026-10-22T00:00:00Z"),
        _count: { products: 5 },
      } as any,
    ]);

    const req = new Request("http://localhost:3000/api/categories");
    const res = await getCategories(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.categories).toHaveLength(1);
    expect(body.categories[0].name).toBe("សម្លៀកបំពាក់");
    expect(body.categories[0].productCount).toBe(5);
  });

  it("POST /api/categories creates a new category with audit log", async () => {
    vi.mocked(db.category.findUnique).mockResolvedValue(null);
    vi.mocked(db.category.create).mockResolvedValue({
      id: "cat-new",
      storeId: "store-1",
      name: "ស្បែកជើង",
      description: "ស្បែកជើងបុរស និងនារី",
      color: "#10b981",
      icon: null,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      _count: { products: 0 },
    } as any);

    const req = new Request("http://localhost:3000/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "ស្បែកជើង",
        description: "ស្បែកជើងបុរស និងនារី",
        color: "#10b981",
        active: true,
      }),
    });

    const res = await createCategory(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.category.name).toBe("ស្បែកជើង");
    expect(db.category.create).toHaveBeenCalled();
    expect(db.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CATEGORY_CREATED",
          entity: "Category",
        }),
      })
    );
  });

  it("POST /api/categories rejects duplicate category name in store", async () => {
    vi.mocked(db.category.findUnique).mockResolvedValue({
      id: "cat-exist",
      name: "សម្លៀកបំពាក់",
    } as any);

    const req = new Request("http://localhost:3000/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "សម្លៀកបំពាក់" }),
    });

    const res = await createCategory(req);
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain("មានរួចហើយ");
  });

  it("PATCH /api/categories/[id] updates category and syncs product.category string", async () => {
    vi.mocked(db.category.findFirst).mockResolvedValue({
      id: "cat-1",
      storeId: "store-1",
      name: "សម្លៀកបំពាក់",
    } as any);
    vi.mocked(db.category.findUnique).mockResolvedValue(null);
    vi.mocked(db.category.update).mockResolvedValue({
      id: "cat-1",
      name: "ម៉ូដសម្លៀកបំពាក់",
      description: "កែប្រែថ្មី",
      color: "#8b5cf6",
      active: true,
      createdAt: new Date(),
      _count: { products: 3 },
    } as any);

    const req = new Request("http://localhost:3000/api/categories/cat-1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ម៉ូដសម្លៀកបំពាក់", color: "#8b5cf6" }),
    });

    const res = await updateCategory(req, { params: Promise.resolve({ categoryId: "cat-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.category.name).toBe("ម៉ូដសម្លៀកបំពាក់");
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { storeId: "store-1", categoryId: "cat-1" },
      data: { category: "ម៉ូដសម្លៀកបំពាក់" },
    });
  });

  it("DELETE /api/categories/[id] unlinks products and deletes category", async () => {
    vi.mocked(db.category.findFirst).mockResolvedValue({
      id: "cat-1",
      storeId: "store-1",
      name: "សម្លៀកបំពាក់",
      _count: { products: 4 },
    } as any);

    const req = new Request("http://localhost:3000/api/categories/cat-1", { method: "DELETE" });
    const res = await deleteCategory(req, { params: Promise.resolve({ categoryId: "cat-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(db.product.updateMany).toHaveBeenCalledWith({
      where: { storeId: "store-1", categoryId: "cat-1" },
      data: { categoryId: null, category: null },
    });
    expect(db.category.delete).toHaveBeenCalledWith({ where: { id: "cat-1" } });
  });
});
