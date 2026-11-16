// Runs against the Firestore emulator: npm run test:rules
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, test } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";

let env: RulesTestEnvironment;
const valid = () => ({ documentType: "FREE_TRIAL", overallRisk: "HIGH", categories: ["RENEWAL", "PRICE"], findingCount: 2, route: "ON_DEVICE", createdAt: serverTimestamp() });
const alice = () => env.authenticatedContext("alice").firestore();
const scans = (db: ReturnType<typeof alice>, uid = "alice") => collection(db, "users", uid, "scans");

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-smallprint-scout",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host: "127.0.0.1", port: 8181 },
  });
});
beforeEach(() => env.clearFirestore());
afterAll(() => env.cleanup());

async function seed(): Promise<string> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users/alice/scans/s1"), { ...valid(), createdAt: Timestamp.now() });
  });
  return "users/alice/scans/s1";
}

test("owner can create a valid summary", () => assertSucceeds(addDoc(scans(alice()), valid())));
test("owner can run the app's history query", async () => {
  await seed();
  await assertSucceeds(getDocs(query(scans(alice()), orderBy("createdAt", "desc"), limit(20))));
});
test("owner can delete", async () => assertSucceeds(deleteDoc(doc(alice(), await seed()))));

test("signed-out user cannot read or write", async () => {
  const path = await seed();
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, path)));
  await assertFails(getDocs(collection(anon, "users/alice/scans")));
  await assertFails(addDoc(collection(anon, "users/alice/scans"), valid()));
});
test("another user cannot read, list, write or delete", async () => {
  const path = await seed();
  const bob = env.authenticatedContext("bob").firestore();
  await assertFails(getDoc(doc(bob, path)));
  await assertFails(getDocs(scans(bob)));
  await assertFails(addDoc(scans(bob), valid()));
  await assertFails(deleteDoc(doc(bob, path)));
});
test("updates are denied, even for the owner", async () => assertFails(updateDoc(doc(alice(), await seed()), { overallRisk: "LOW" })));

test("extra fields are rejected (no contract text)", () => assertFails(addDoc(scans(alice()), { ...valid(), contractText: "secret clause" })));
test("missing field is rejected", () => { const { route: _r, ...rest } = valid(); return assertFails(addDoc(scans(alice()), rest)); });
test("bad enum is rejected", () => assertFails(addDoc(scans(alice()), { ...valid(), overallRisk: "EXTREME" })));
test("bad category item is rejected", () => assertFails(addDoc(scans(alice()), { ...valid(), categories: ["RENEWAL", "x".repeat(5000)] })));
test("non-string category item is rejected", () => assertFails(addDoc(scans(alice()), { ...valid(), categories: [42] })));
test("oversized category list is rejected", () => assertFails(addDoc(scans(alice()), { ...valid(), categories: Array(8).fill("PRICE") })));
test("findingCount out of range or float is rejected", async () => {
  await assertFails(addDoc(scans(alice()), { ...valid(), findingCount: 4 }));
  await assertFails(addDoc(scans(alice()), { ...valid(), findingCount: -1 }));
  await assertFails(addDoc(scans(alice()), { ...valid(), findingCount: 1.5 }));
});
test("client-chosen createdAt is rejected", () => assertFails(addDoc(scans(alice()), { ...valid(), createdAt: Timestamp.fromDate(new Date("2020-01-01")) })));
test("other collections are denied", () => assertFails(setDoc(doc(alice(), "users/alice"), { name: "Alice" })));
