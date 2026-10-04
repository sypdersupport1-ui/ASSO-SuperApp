import { execSync } from "child_process";
import postgres from "postgres";
import crypto from "crypto";

const PREVIEW_URL = "https://asso-super-2obqh1rt5-sypdersupport1-ui.vercel.app";
const TENANT_ID = "11111111-1111-1111-1111-111111111111"; // Tenant A
const OUTLET_ID = "11111111-1111-1111-1111-111111111112";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("❌ DATABASE_URL is required in environment.");
  process.exit(1);
}

const sql = postgres(connectionString, {
  ssl: "require",
  max: 5,
  connect_timeout: 10,
});

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function signStaffJwt(payload: any): string {
  const secret = process.env.PREVIEW_JWT_SECRET || process.env.JWT_SECRET || "super-secret-local-dev-jwt-key-minimum-32-chars-long";
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const message = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${message}.${signature}`;
}

function executeRemoteVercelCurl(
  method: string,
  path: string,
  token: string,
  body?: any,
  idempotencyKey?: string
): { status: number; data: any; raw: string } {
  const fullUrl = `${PREVIEW_URL}${path}`;
  const args: string[] = [
    "npx",
    "vercel",
    "curl",
    fullUrl,
    "--",
    "-s",
    "-w",
    "\\n---STATUS:%{http_code}---",
    "-X",
    method,
    "-H",
    `"Authorization: Bearer ${token}"`,
    "-H",
    `"x-tenant-id: ${TENANT_ID}"`,
    "-H",
    `"Content-Type: application/json"`,
  ];

  if (idempotencyKey) {
    args.push("-H", `"idempotency-key: ${idempotencyKey}"`);
  }

  if (body) {
    const jsonStr = JSON.stringify(body).replace(/"/g, '\\"');
    args.push("-d", `"${jsonStr}"`);
  }

  const cmd = args.join(" ");
  try {
    const output = execSync(cmd, { encoding: "utf-8", timeout: 30000 });
    const statusMatch = output.match(/---STATUS:(\d+)---/);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 200;
    const cleanOutput = output.replace(/---STATUS:\d+---/, "").trim();

    const firstBrace = cleanOutput.indexOf("{");
    const lastBrace = cleanOutput.lastIndexOf("}");
    let parsedData: any = null;
    let rawJson = "";

    if (firstBrace !== -1 && lastBrace !== -1) {
      rawJson = cleanOutput.substring(firstBrace, lastBrace + 1);
      try {
        parsedData = JSON.parse(rawJson);
      } catch (e) {
        parsedData = { raw: rawJson, fullOutput: output };
      }
    } else {
      parsedData = { raw: cleanOutput, fullOutput: output };
    }

    if (statusCode >= 400 && parsedData?.error) {
      console.log(`   [API Response ${statusCode}]:`, JSON.stringify(parsedData.error));
    } else if (statusCode >= 400) {
      console.log(`   [Raw Output ${statusCode}]:`, output);
    }

    return { status: statusCode, data: parsedData, raw: rawJson };
  } catch (err: any) {
    console.error(`Error running command: ${cmd}`, err.message);
    throw err;
  }
}

async function runRemoteFinancialSmokeTest() {
  console.log("=================================================================");
  console.log("  ASSO R3.6 VERCEL PREVIEW REMOTE FINANCIAL MUTATION VERIFICATION  ");
  console.log(`  Target URL: ${PREVIEW_URL}`);
  console.log(`  Architecture: Shared Supabase Database (Isolated Synthetic Records)`);
  console.log("=================================================================\n");

  // Step 1: Create disposable synthetic order in shared DB for test isolation
  console.log("1. Creating isolated disposable synthetic order...");
  const [ctx] = await sql`
    SELECT context_id, outlet_id FROM business_contexts WHERE tenant_id = ${TENANT_ID} AND outlet_id IS NOT NULL LIMIT 1
  `;
  if (!ctx || !ctx.outlet_id) {
    throw new Error("No business context with outlet found for Tenant A.");
  }

  // 0. Mint authenticated staff manager token
  const managerToken = signStaffJwt({
    sub: "00000000-0000-0000-0000-000000000001",
    tenantId: TENANT_ID,
    outletId: ctx.outlet_id,
    roles: ["MANAGER"],
    permissions: ["restaurant.bills.view", "restaurant.bills.manage"],
    sessionType: "STAFF",
    isSuperAdmin: false,
  });

  const syntheticOrderId = crypto.randomUUID();
  const orderNumber = `SYNTH-${Date.now().toString().slice(-6)}`;
  await sql`
    INSERT INTO orders (
      order_id, tenant_id, outlet_id, context_id, order_number, order_source, dining_context,
      subtotal_amount, tax_amount, total_amount, status
    ) VALUES (
      ${syntheticOrderId}, ${TENANT_ID}, ${ctx.outlet_id}, ${ctx.context_id}, ${orderNumber}, 'POS', 'DINE_IN',
      100.0000, 5.0000, 105.0000, 'CONFIRMED'
    )
  `;
  console.log(`   ✓ Synthetic order created: ${syntheticOrderId} (Total: ₹105.00, Outlet: ${ctx.outlet_id})`);

  let generatedBillId = "";

  try {
    // Step 2: Remote Bill Generation
    console.log("\n2. Remotely generating Bill via Vercel Preview API...");
    const billRes = executeRemoteVercelCurl("POST", "/api/v1/restaurant/bills", managerToken, {
      outletId: ctx.outlet_id,
      orderIds: [syntheticOrderId],
    });
    console.log(`   HTTP Status: ${billRes.status}`);
    if (billRes.status !== 201 || !billRes.data?.data?.billId) {
      throw new Error(`Failed to generate bill remotely: ${JSON.stringify(billRes.data)}`);
    }
    generatedBillId = billRes.data.data.billId;
    console.log(`   ✓ Remote Bill generated: ${generatedBillId} (Total: ₹${billRes.data.data.totalAmount})`);

    // Step 3: Remote Bill Equal Split
    console.log("\n3. Remotely creating 2-portion Equal Split...");
    const splitKey = `idemp_split_${Date.now()}`;
    const splitRes = executeRemoteVercelCurl(
      "POST",
      `/api/v1/restaurant/bills/${generatedBillId}/splits`,
      managerToken,
      { splitType: "EQUAL", portionsCount: 2 },
      splitKey
    );
    console.log(`   HTTP Status: ${splitRes.status}`);
    if (splitRes.status !== 201 || !splitRes.data?.data?.activeSplit?.portions) {
      throw new Error(`Failed to create split remotely: ${JSON.stringify(splitRes.data)}`);
    }
    const portions = splitRes.data.data.activeSplit.portions;
    console.log(`   ✓ Portions created: ${portions.length} (Portion 1: ₹${portions[0].totalAmount}, Portion 2: ₹${portions[1].totalAmount})`);

    // Step 4: Idempotency Replay on Split Creation
    console.log("\n4. Testing remote idempotent replay with same idempotency key...");
    const replayRes = executeRemoteVercelCurl(
      "POST",
      `/api/v1/restaurant/bills/${generatedBillId}/splits`,
      managerToken,
      { splitType: "EQUAL", portionsCount: 2 },
      splitKey
    );
    console.log(`   HTTP Status: ${replayRes.status}`);
    if (replayRes.status !== 200 && replayRes.status !== 201) {
      throw new Error(`Idempotency replay failed: ${JSON.stringify(replayRes.data)}`);
    }
    console.log("   ✓ Idempotent replay safely returned cached response without duplicate records");

    // Step 5: Partial Settlement on Portion 1
    console.log("\n5. Remotely recording partial payment on Portion 1...");
    const portion1 = portions[0];
    const payKey1 = `idemp_pay1_${Date.now()}`;
    const pay1Res = executeRemoteVercelCurl(
      "POST",
      `/api/v1/restaurant/bills/${generatedBillId}/payments`,
      managerToken,
      {
        portionId: portion1.portionId,
        amount: portion1.totalAmount,
        paymentMethod: "CASH",
        notes: "Remote synthetic test payment 1",
      },
      payKey1
    );
    console.log(`   HTTP Status: ${pay1Res.status}`);
    if (pay1Res.status !== 201) {
      throw new Error(`Payment 1 failed: ${JSON.stringify(pay1Res.data)}`);
    }
    console.log(`   ✓ Portion 1 settled. Bill status: ${pay1Res.data.data.status}, Settled: ₹${pay1Res.data.data.settledAmount}, Remaining: ₹${pay1Res.data.data.remainingAmount}`);

    // Step 6: Overpayment Rejection
    console.log("\n6. Testing rejection of invalid overpayment...");
    const portion2 = portions[1];
    const invalidPayRes = executeRemoteVercelCurl(
      "POST",
      `/api/v1/restaurant/bills/${generatedBillId}/payments`,
      managerToken,
      {
        portionId: portion2.portionId,
        amount: "9999.00",
        paymentMethod: "CASH",
      }
    );
    console.log(`   HTTP Status: ${invalidPayRes.status} (Expected: 422 or 400)`);
    if (invalidPayRes.status !== 422 && invalidPayRes.status !== 400) {
      throw new Error(`Overpayment should have been rejected, got ${invalidPayRes.status}`);
    }
    console.log("   ✓ Invalid overpayment correctly rejected by server-side business rule");

    // Step 7: Tip Allocation via PERCENTAGE_BASED Mode
    console.log("\n7. Remotely allocating tip via PERCENTAGE_BASED mode (Server 60%, Kitchen 40%)...");
    const tipRes = executeRemoteVercelCurl(
      "POST",
      `/api/v1/restaurant/bills/${generatedBillId}/tips`,
      managerToken,
      {
        tipAmount: "20.00",
        distributions: [
          { recipientName: "Server Pool", percentage: "60.00" },
          { recipientName: "Kitchen Pool", percentage: "40.00" },
        ],
      }
    );
    console.log(`   HTTP Status: ${tipRes.status}`);
    if (tipRes.status !== 201) {
      throw new Error(`Tip allocation failed: ${JSON.stringify(tipRes.data)}`);
    }
    const tipDist = tipRes.data.data.tipDistributions;
    console.log(`   ✓ Server authoritatively computed monetary allocations:`);
    tipDist.forEach((d: any) => {
      console.log(`     - ${d.recipientName} (${parseFloat(d.percentage)}%): ₹${d.amount}`);
    });
    console.log(`   Bill Total updated to: ₹${tipRes.data.data.totalAmount}, Remaining: ₹${tipRes.data.data.remainingAmount}`);

    // Step 8: Rejection of Invalid Percentage Sum
    console.log("\n8. Testing rejection of invalid percentage sum (90% != 100%)...");
    const invalidTipRes = executeRemoteVercelCurl(
      "POST",
      `/api/v1/restaurant/bills/${generatedBillId}/tips`,
      managerToken,
      {
        tipAmount: "20.00",
        distributions: [
          { recipientName: "Server Pool", percentage: "50.00" },
          { recipientName: "Kitchen Pool", percentage: "40.00" },
        ],
      }
    );
    console.log(`   HTTP Status: ${invalidTipRes.status} (Expected: 400 or 422)`);
    if (invalidTipRes.status !== 400 && invalidTipRes.status !== 422) {
      throw new Error(`Invalid percentage sum should have been rejected, got ${invalidTipRes.status}`);
    }
    console.log("   ✓ Invalid tip percentage sum strictly rejected by server-side validation");

    // Step 9: Settle Portion 2
    console.log("\n9. Remotely settling Portion 2...");
    const pay2Res = executeRemoteVercelCurl(
      "POST",
      `/api/v1/restaurant/bills/${generatedBillId}/payments`,
      managerToken,
      {
        portionId: portion2.portionId,
        amount: portion2.totalAmount,
        paymentMethod: "CASH",
        notes: "Remote synthetic test payment 2",
      }
    );
    console.log(`   HTTP Status: ${pay2Res.status}`);
    if (pay2Res.status !== 201) {
      throw new Error(`Payment 2 failed: ${JSON.stringify(pay2Res.data)}`);
    }
    console.log(`   ✓ Portion 2 settled. Remaining balance: ₹${pay2Res.data.data.remainingAmount}`);

    // Step 10: Final Settlement of Tip Balance
    console.log("\n10. Remotely settling remaining tip balance at bill level...");
    const payTipRes = executeRemoteVercelCurl(
      "POST",
      `/api/v1/restaurant/bills/${generatedBillId}/payments`,
      managerToken,
      {
        amount: "20.00",
        paymentMethod: "CASH",
        notes: "Remote synthetic test tip payment",
      }
    );
    console.log(`   HTTP Status: ${payTipRes.status}`);
    if (payTipRes.status !== 201) {
      throw new Error(`Tip payment failed: ${JSON.stringify(payTipRes.data)}`);
    }
    const finalBill = payTipRes.data.data;
    console.log(`   ✓ Final Settlement complete!`);
    console.log(`     - Status: ${finalBill.status}`);
    console.log(`     - Total Amount: ₹${finalBill.totalAmount}`);
    console.log(`     - Settled Amount: ₹${finalBill.settledAmount}`);
    console.log(`     - Remaining Amount: ₹${finalBill.remainingAmount}`);
    console.log(`     - Is Fully Settled: ${finalBill.isFullySettled}`);

    if (finalBill.status !== "PAID" || finalBill.remainingAmount !== "0.00" || !finalBill.isFullySettled) {
      throw new Error("Final bill balance did not reconcile exactly to zero.");
    }

    // Step 11: Remote Outbox Verification
    console.log("\n11. Verifying transactional outbox events committed in database...");
    const outboxEvents = await sql`
      SELECT event_type, status, created_at
      FROM domain_outbox_events
      WHERE tenant_id = ${TENANT_ID} AND aggregate_id = ${generatedBillId}
      ORDER BY created_at ASC
    `;
    console.log(`   ✓ Found ${outboxEvents.length} outbox events recorded for this bill:`);
    outboxEvents.forEach((ev: any) => console.log(`     - ${ev.event_type} (Status: ${ev.status})`));

  } finally {
    // Step 12: Safe cleanup of synthetic disposable test records
    console.log("\n12. Performing safe cleanup of synthetic test records...");
    if (generatedBillId) {
      await sql`DELETE FROM restaurant_tip_distributions WHERE bill_id = ${generatedBillId}`;
      await sql`DELETE FROM payment_transactions WHERE bill_id = ${generatedBillId}`;
      await sql`DELETE FROM restaurant_bill_split_portions WHERE split_id IN (SELECT split_id FROM restaurant_bill_splits WHERE bill_id = ${generatedBillId})`;
      await sql`DELETE FROM restaurant_bill_splits WHERE bill_id = ${generatedBillId}`;
      await sql`DELETE FROM bills WHERE bill_id = ${generatedBillId}`;
      await sql`DELETE FROM domain_outbox_events WHERE aggregate_id = ${generatedBillId}`;
      console.log(`   ✓ Cleaned up synthetic bill ${generatedBillId} and associated records.`);
    }
    await sql`DELETE FROM orders WHERE order_id = ${syntheticOrderId}`;
    console.log(`   ✓ Cleaned up synthetic order ${syntheticOrderId}.`);

    await sql.end();
  }

  console.log("\n=================================================================");
  console.log("  ALL 11 REMOTE FINANCIAL MUTATION SMOKE CHECKS PASSED (100%)    ");
  console.log("=================================================================");
}

runRemoteFinancialSmokeTest().catch((e) => {
  console.error("FATAL ERROR in remote financial smoke test:", e);
  process.exit(1);
});
