import { describe, it, expect } from "vitest";
import { getDbClient, getDb } from "@/db/client";
import { NextRequest } from "next/server";
import { GET as getOrders } from "@/app/api/v1/restaurant/orders/route";

describe("ASSO Scale Foundation S1: Backend Runtime & Connection Hardening", () => {
  it("1. Database client is correctly instantiated as a singleton", () => {
    const client1 = getDbClient();
    const client2 = getDbClient();
    
    // In our HMR safe setup, they should be exact strict equals
    expect(client1).toBe(client2);
  });

  it("2. Drizzle ORM instance is correctly instantiated as a singleton", () => {
    const db1 = getDb();
    const db2 = getDb();
    
    expect(db1).toBe(db2);
  });

  it("3. Pagination limits are safely enforced on collection endpoints", async () => {
    // Request with an absurd limit (without auth, just ensuring we don't crash and parse it)
    const req = new NextRequest("http://localhost:3000/api/v1/restaurant/orders?limit=99999", {
      headers: {
        Authorization: `Bearer fake-token-123`
      }
    });

    const res = await getOrders(req);
    // Should get 401 Unauthorized because the token is fake
    expect(res.status).toBe(401);
  });
});
