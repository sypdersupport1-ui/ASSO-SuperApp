import { ModuleNotEntitledError } from "../api/errors";

// In-memory reference set of standard tenant entitlements for testing and local dev
const tenantEntitlementsStore = new Map<string, Set<string>>([
  ["11111111-1111-1111-1111-111111111111", new Set(["CORE", "HOTEL", "RESTAURANT", "POS", "ORDERING"])],
]);

export function setTenantEntitlements(tenantId: string, modules: string[]): void {
  tenantEntitlementsStore.set(tenantId, new Set(modules));
}

export function isModuleEntitled(tenantId: string, moduleCode: string, isSuperAdmin = false): boolean {
  if (isSuperAdmin) {
    return true;
  }
  const entitled = tenantEntitlementsStore.get(tenantId);
  if (!entitled) {
    // If not explicitly registered, default core modules are enabled for dev
    return ["CORE", "POS", "ORDERING"].includes(moduleCode);
  }
  return entitled.has(moduleCode) || entitled.has("*");
}

export function assertModuleEntitlement(tenantId: string, moduleCode: string, isSuperAdmin = false): void {
  if (!isModuleEntitled(tenantId, moduleCode, isSuperAdmin)) {
    throw new ModuleNotEntitledError(moduleCode);
  }
}
