import { beforeAll, describe, expect, it } from "vitest";
import { credentialStatus, parseCredentialForm } from "@/lib/credentials";
import { cleanFileName, MAX_UPLOAD_BYTES, sniffType, storagePath, validateUpload } from "@/lib/files/validate";
import { parseSubjectForm, PRIVATE_FIELDS, shareableSubject, subjectLabel } from "@/lib/subjects/fields";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

const JPEG = bytes([0xff, 0xd8, 0xff, 0xe0], "JFIF\0\0\0\0\0\0\0\0");
const PNG = bytes([0x89], "PNG", [0x0d, 0x0a, 0x1a, 0x0a], "\0\0\0\0\0\0\0\0");
const WEBP = bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 ");
const HEIC = bytes([0, 0, 0, 0x18], "ftypheic", "\0\0\0\0");
const PDF = bytes("%PDF-1.7\n", "\0\0\0\0\0\0\0");
const SVG = bytes('<svg xmlns="http://www.w3.org/2000/svg">');
const HTML = bytes("<!doctype html><script>");
const EXE = bytes("MZ", [0x90, 0, 3, 0, 0, 0, 4, 0, 0, 0, 0xff, 0xff, 0, 0]);

describe("private file uploads", () => {
  it("recognizes real photos and PDFs by their first bytes", () => {
    expect(sniffType(JPEG)).toBe("image/jpeg");
    expect(sniffType(PNG)).toBe("image/png");
    expect(sniffType(WEBP)).toBe("image/webp");
    expect(sniffType(HEIC)).toBe("image/heic");
    expect(sniffType(PDF)).toBe("application/pdf");
  });

  it("refuses SVG, HTML and programs, whatever the file is called", () => {
    for (const head of [SVG, HTML, EXE, new Uint8Array()]) expect(sniffType(head)).toBeNull();
    expect(validateUpload({ kind: "photo", size: 100, head: SVG }).ok).toBe(false);
    expect(validateUpload({ kind: "document", size: 100, head: HTML }).ok).toBe(false);
  });

  it("allows PDFs for documents and vaccine records, but not as photos", () => {
    expect(validateUpload({ kind: "vaccination_record", size: 1000, head: PDF })).toEqual({ ok: true, type: "application/pdf" });
    expect(validateUpload({ kind: "photo", size: 1000, head: PDF }).ok).toBe(false);
    expect(validateUpload({ kind: "photo", size: 1000, head: HEIC })).toEqual({ ok: true, type: "image/heic" });
  });

  it("enforces the size limit", () => {
    expect(validateUpload({ kind: "photo", size: MAX_UPLOAD_BYTES, head: JPEG }).ok).toBe(true);
    const tooBig = validateUpload({ kind: "photo", size: MAX_UPLOAD_BYTES + 1, head: JPEG });
    expect(tooBig.ok === false && tooBig.error).toMatch(/too big/);
    expect(validateUpload({ kind: "photo", size: 0, head: JPEG }).ok).toBe(false);
  });

  it("stores files under the business's own folder with a random name", () => {
    const org = "11111111-1111-4111-8111-111111111111";
    const file = "22222222-2222-4222-8222-222222222222";
    expect(storagePath(org, file, "image/jpeg", new Date("2026-09-30T12:00:00Z"))).toBe(`${org}/2026/${file}.jpg`);
  });

  it("cleans uploaded file names", () => {
    expect(cleanFileName("C:\\fakepath\\roof photo (1).jpg")).toBe("roof photo 1.jpg");
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
    expect(cleanFileName("<script>.pdf")).toBe("script.pdf");
    expect(cleanFileName("")).toBeNull();
  });
});

describe("signed links to local files", () => {
  let verify: typeof import("@/lib/files/storage").verifyLocalSignature;
  let signedUrl: typeof import("@/lib/files/storage").signedUrl;
  beforeAll(async () => {
    process.env.FILE_STORAGE = "local";
    process.env.FILE_SIGNING_SECRET = "test-secret";
    process.env.NEXT_PUBLIC_SITE_URL ??= "http://localhost:3000";
    ({ verifyLocalSignature: verify, signedUrl } = await import("@/lib/files/storage"));
  });

  it("works for 5 minutes and not after, and only for the same file", async () => {
    const path = "11111111-1111-4111-8111-111111111111/2026/22222222-2222-4222-8222-222222222222.jpg";
    const url = new URL((await signedUrl(path))!);
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig")!;
    expect(exp * 1000 - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(verify(path, exp, sig)).toBe(true);
    expect(verify(path, exp, sig, (exp + 1) * 1000)).toBe(false);
    expect(verify(path.replace("2222", "3333"), exp, sig)).toBe(false);
    expect(verify(path, exp + 60, sig)).toBe(false);
  });
});

describe("customer records (property / pet / vehicle)", () => {
  const form = (entries: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries(entries)) f.set(k, v);
    return f;
  };

  it("keeps secrets out of the shareable details", () => {
    const pet = parseSubjectForm("pet", form({ name: "Buddy", species: "dog", breed: "Golden Retriever", size: "large", behavior_notes: "Bites at nails", care_notes: "Insulin at 6pm" }));
    expect(pet.ok && pet.label).toBe("Buddy (Golden Retriever)");
    expect(pet.ok && pet.attributes).not.toHaveProperty("behavior_notes");
    expect(pet.ok && pet.privateFields).toEqual({ behavior_notes: "Bites at nails", care_notes: "Insulin at 6pm" });

    const car = parseSubjectForm("vehicle", form({ year: "2019", make: "Honda", model: "CR-V", vin: "1hgcm82633a004352" }));
    expect(car.ok && car.label).toBe("2019 Honda CR-V");
    expect(car.ok && car.privateFields.vin).toBe("1HGCM82633A004352");
    expect(car.ok && JSON.stringify(car.attributes)).not.toContain("1HGCM");
  });

  it("never lets private details into what assistants, texts or public pages see", () => {
    const SENTINEL = "SECRET-4821";
    // Even if private values somehow ended up in the attributes, the allow-list drops them.
    for (const kind of ["property", "pet", "vehicle"] as const) {
      const attributes: Record<string, string> = { address: `12 Oak St ${SENTINEL}`, name: "Rex", make: "Ford" };
      for (const f of PRIVATE_FIELDS[kind]) attributes[f.key] = SENTINEL;
      const shared = shareableSubject({ id: "s1", kind, label: kind === "property" ? `12 Oak St ${SENTINEL}` : "Rex", attributes });
      expect(JSON.stringify(shared), kind).not.toContain(SENTINEL);
    }
  });

  it("rejects bad VINs and odd values with a plain explanation", () => {
    const bad = parseSubjectForm("vehicle", form({ vin: "12345" }));
    expect(bad.ok === false && bad.error).toMatch(/17/);
    const year = parseSubjectForm("vehicle", form({ year: "1800" }));
    expect(year.ok).toBe(false);
    const size = parseSubjectForm("pet", form({ size: "gigantic" }));
    expect(size.ok).toBe(false);
  });

  it("names records sensibly when details are missing", () => {
    expect(subjectLabel("property", {})).toBe("Property");
    expect(subjectLabel("vehicle", { make: "Toyota" })).toBe("Toyota");
    expect(subjectLabel("pet", { name: "Mia" })).toBe("Mia");
  });
});

describe("licenses and insurance", () => {
  it("reads the form", () => {
    const f = new FormData();
    f.set("kind", "license");
    f.set("label", "SC residential builder license");
    f.set("number", "RBB-123");
    f.set("expires_on", "2027-06-30");
    f.set("show_on_profile", "on");
    const r = parseCredentialForm(f);
    expect(r.success && r.data).toMatchObject({ kind: "license", number: "RBB-123", issuer: null, show_on_profile: true });
  });

  it("flags expired and soon-to-expire items", () => {
    expect(credentialStatus(null, "2026-09-30")).toBe("ok");
    expect(credentialStatus("2026-09-29", "2026-09-30")).toBe("expired");
    expect(credentialStatus("2026-10-20", "2026-09-30")).toBe("expiring");
    expect(credentialStatus("2027-01-01", "2026-09-30")).toBe("ok");
  });
});
