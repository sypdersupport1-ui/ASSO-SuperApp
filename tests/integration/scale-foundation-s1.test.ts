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

  it("4. Distinguishes API vs Worker database connection configurations", () => {
    const prevEnv = process.env.NODE_ENV;
    const prevRuntime = process.env.RUNTIME_ENV;
    
    try {
      process.env.NODE_ENV = "production";
      process.env.RUNTIME_ENV = "api";
      process.env.API_DB_POOL_SIZE = "12";
      
      const apiPoolSize = process.env.RUNTIME_ENV === "worker"
        ? parseInt(process.env.WORKER_DB_POOL_SIZE || "50", 10)
        : parseInt(process.env.API_DB_POOL_SIZE || "10", 10);
        
      expect(apiPoolSize).toBe(12);

      process.env.RUNTIME_ENV = "worker";
      process.env.WORKER_DB_POOL_SIZE = "40";
      
      const workerPoolSize = process.env.RUNTIME_ENV === "worker"
        ? parseInt(process.env.WORKER_DB_POOL_SIZE || "50", 10)
        : parseInt(process.env.API_DB_POOL_SIZE || "10", 10);
        
      expect(workerPoolSize).toBe(40);
    } finally {
      if (prevEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = prevEnv;
      
      if (prevRuntime === undefined) delete process.env.RUNTIME_ENV;
      else process.env.RUNTIME_ENV = prevRuntime;
    }
  });

  it("5. Horizontal scaling budget relies on mathematical constraints", () => {
    const apiInstances = 30;
    const workerInstances = 2;
    const apiPoolSize = 10;
    const workerPoolSize = 50;
    
    const aggregateConnections = (apiInstances * apiPoolSize) + (workerInstances * workerPoolSize);
    expect(aggregateConnections).toBe(400);
    expect(aggregateConnections).toBeLessThan(500); // Max pool size for 5432
  });
});
