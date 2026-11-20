import type { LicenceRecord } from "./doc-ocr.ts";

// Synthetic fixtures for SOP-LIC-014 (UC02): licence records, a fines and inspection register,
// finance payments, and the text printed on each synthetic document image. All invented.
// scripts/make_synthetic_docs.ts renders DOCS to PNG; the per-task evals read the same table.

export const TODAY = "2026-11-20";

const rec = (r: Partial<LicenceRecord> & Pick<LicenceRecord, "licence_number" | "trade_name" | "holder" | "address" | "activity_code" | "activity_group" | "expiry">): LicenceRecord =>
  ({ registered_email: `${r.licence_number.toLowerCase()}@registered.example`, language: "en", ...r });

export const RECORDS: Record<string, LicenceRecord> = {
  noor: rec({ licence_number: "TL-482913", trade_name: "Al Noor Trading", holder: "Omar Hassan Al Noor", address: "Unit 14, Dock Road, Marsa", activity_code: "4711", activity_group: "Retail and trading", expiry: "2026-12-15", registered_email: "omar@alnoor.example" }),
  bakery: rec({ licence_number: "TL-551207", trade_name: "Marsa Bakery", holder: "Layla Khalid Mansour", address: "Shop 3, Harbour Street, Marsa", activity_code: "5610", activity_group: "Food and hospitality", expiry: "2026-11-08", registered_email: "layla@marsabakery.example" }),
  delta: rec({ licence_number: "TL-390044", trade_name: "Delta Fabrication", holder: "Yusuf Rahman Idris", address: "Plot 8, Industrial Zone, Marsa", activity_code: "2599", activity_group: "Industrial", expiry: "2026-09-01" }),
  nadia: rec({ licence_number: "TL-610822", trade_name: "Nadia Consulting", holder: "Nadia Fouad Saleh", address: "Office 2, Bay Tower, Marsa", activity_code: "7020", activity_group: "Professional services", expiry: "2027-01-10" }),
  // boundary of the grace period: expired exactly 30 days ago, and 31 days ago
  edge30: rec({ licence_number: "TL-700030", trade_name: "Thirty Day Traders", holder: "Karim Adel Nasser", address: "Unit 1, Edge Road, Marsa", activity_code: "4711", activity_group: "Retail and trading", expiry: "2026-10-21" }),
  edge31: rec({ licence_number: "TL-700031", trade_name: "Thirty One Traders", holder: "Samira Adel Nasser", address: "Unit 2, Edge Road, Marsa", activity_code: "4711", activity_group: "Retail and trading", expiry: "2026-10-20" }),
  arabic: rec({ licence_number: "TL-720001", trade_name: "Al Wafa Stores", holder: "Fatima Omar Wafa", address: "Unit 9, Souk Road, Marsa", activity_code: "4711", activity_group: "Retail and trading", expiry: "2026-12-20", language: "ar" }),
};

export interface Registry { fines: { amount: number; reason: string }[]; inspectionHold: string | null }
export const REGISTRY: Record<string, Registry> = {
  "TL-551207": { fines: [{ amount: 500, reason: "Signage without permit" }], inspectionHold: null },
  "TL-390044": { fines: [], inspectionHold: "Fire safety re-inspection pending" },
};
export const NO_REGISTRY: Registry = { fines: [], inspectionHold: null };

export interface Payment { amount: number; reference: string; payer: string }

export interface DocSpec { file: string; lines: string[]; blur?: number }

const trade = (no: string, name: string, until: string): string[] => ["TRADE NAME CERTIFICATE", "Issued by: Marsa Business Registry", `Trade name: ${name}`, `Licence number: ${no}`, `Valid until: ${until}`];
const lease = (ref: string | null, tenant: string, prem: string, start: string, end: string): string[] => [
  "TENANCY CONTRACT", ...(ref ? ["Registered with Marsa Property Registry", `Registry reference: ${ref}`] : ["Not registered"]),
  `Tenant: ${tenant}`, `Premises: ${prem}`, `Start date: ${start}`, `End date: ${end}`];
const ident = (name: string, no: string, exp: string): string[] => ["NATIONAL IDENTITY CARD", `Name: ${name}`, "Document type: National ID", `Number: ${no}`, `Expiry date: ${exp}`];
const insure = (who: string, prem: string, act: string, cover: string, from: string, to: string): string[] => [
  "CERTIFICATE OF INSURANCE", "Public liability", `Insured: ${who}`, `Premises: ${prem}`, `Activity: ${act}`, `Cover: ${cover}`, `Valid from: ${from}`, `Valid to: ${to}`];

const N = RECORDS.noor, B = RECORDS.bakery;

/** key -> what is printed on the image. Keys ending in a defect name are deliberately wrong. */
export const DOCS: Record<string, DocSpec> = {
  // Al Noor: a good set, then one defect each
  "noor-d1": { file: "noor-d1.png", lines: trade(N.licence_number, N.trade_name, "2027-06-30") },
  "noor-d2": { file: "noor-d2.png", lines: lease("PR-77120", N.holder, N.address, "2026-01-01", "2028-12-31") },
  "noor-d3": { file: "noor-d3.png", lines: ident(N.holder, "784-1988-5521-3", "2030-04-12") },
  "noor-d4": { file: "noor-d4.png", lines: insure(N.holder, N.address, N.activity_group, "500,000", "2026-07-01", "2027-06-30") },
  "noor-d1-expired": { file: "noor-d1-expired.png", lines: trade(N.licence_number, N.trade_name, "2026-10-01") },
  "noor-d1-wrongno": { file: "noor-d1-wrongno.png", lines: trade("TL-482931", N.trade_name, "2027-06-30") },
  "noor-d2-short": { file: "noor-d2-short.png", lines: lease("PR-77120", N.holder, N.address, "2026-01-01", "2027-08-31") },
  "noor-d2-address": { file: "noor-d2-address.png", lines: lease("PR-77120", N.holder, "Unit 15, Dock Road, Marsa", "2026-01-01", "2028-12-31") },
  "noor-d2-unreg": { file: "noor-d2-unreg.png", lines: lease(null, N.holder, N.address, "2026-01-01", "2028-12-31") },
  "noor-d3-expiring": { file: "noor-d3-expiring.png", lines: ident(N.holder, "784-1988-5521-3", "2026-12-05") },
  "noor-d3-other": { file: "noor-d3-other.png", lines: ident("Hassan Omar Al Noor", "784-1990-1177-2", "2030-04-12") },
  "noor-d4-lowcover": { file: "noor-d4-lowcover.png", lines: insure(N.holder, N.address, N.activity_group, "100,000", "2026-07-01", "2027-06-30") },
  "noor-d4-lapsed": { file: "noor-d4-lapsed.png", lines: insure(N.holder, N.address, N.activity_group, "500,000", "2025-12-01", "2026-12-01") },
  "noor-d4-blur": { file: "noor-d4-blur.png", lines: insure(N.holder, N.address, N.activity_group, "500,000", "2026-07-01", "2027-06-30"), blur: 9 },
  // Marsa Bakery (licence expired 12 days ago): a good set
  "bakery-d1": { file: "bakery-d1.png", lines: trade(B.licence_number, B.trade_name, "2027-08-31") },
  "bakery-d2": { file: "bakery-d2.png", lines: lease("PR-80455", B.holder, B.address, "2025-12-01", "2028-11-30") },
  "bakery-d3": { file: "bakery-d3.png", lines: ident(B.holder, "784-1991-3340-8", "2031-02-02") },
  "bakery-d4": { file: "bakery-d4.png", lines: insure(B.holder, B.address, B.activity_group, "750,000", "2026-03-01", "2027-02-28") },
  // not a renewal document at all
  "menu": { file: "menu.png", lines: ["BAKERY PRICE LIST", "Croissant: 4", "Loaf: 7"] },
};

export const DOC_DIR = "data/sops/fixtures/uc02/docs";
