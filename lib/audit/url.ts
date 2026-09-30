import { isIP } from "node:net";

/**
 * Rules for which web addresses the audit may fetch. The audit fetches a
 * website the founder types in, so it must never be tricked into reading our
 * own servers or cloud metadata (SSRF). Pure functions, unit tested.
 */

/** "roofco.com" -> "https://roofco.com/". Null if it isn't a usable public web address. */
export function normalizeWebsiteUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes(".") && !isIP(host.replace(/^\[|\]$/g, ""))) return null;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  u.hash = "";
  return u.toString();
}

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((n, part) => (n << 8) + Number(part), 0) >>> 0;
}

const PRIVATE_V4: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
];

/** Is this IP address private, local or otherwise not on the public internet? */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const n = ipv4ToInt(ip);
    return PRIVATE_V4.some(([base, bits]) => (n >>> (32 - bits)) === (ipv4ToInt(base) >>> (32 - bits)));
  }
  if (v === 6) {
    // URL parsing normalizes dotted mapped IPv4 into hexadecimal IPv6.
    let a = ip.toLowerCase();
    if (a.includes(".")) {
      const dotted = a.slice(a.lastIndexOf(":") + 1);
      const n = ipv4ToInt(dotted);
      a = a.slice(0, a.lastIndexOf(":") + 1) + (n >>> 16).toString(16) + ":" + (n & 65535).toString(16);
    }
    const parts = a.split("::");
    const left = parts[0] ? parts[0].split(":") : [];
    const right = parts[1] ? parts[1].split(":") : [];
    const words = parts.length === 2 ? [...left, ...Array(8 - left.length - right.length).fill("0"), ...right] : left;
    const n = words.map((word) => parseInt(word, 16));
    if (n.slice(0, 5).every((word) => word === 0) && (n[5] === 0 || n[5] === 65535)) {
      return isPrivateAddress(`${n[6] >>> 8}.${n[6] & 255}.${n[7] >>> 8}.${n[7] & 255}`);
    }
    // Only global unicast; reject transition, documentation and special networks.
    return (n[0] & 0xe000) !== 0x2000 || n[0] === 0x2002 ||
      (n[0] === 0x2001 && (n[1] === 0 || n[1] === 2 || n[1] === 0xdb8));
  }
  return true; // not an IP at all: treat as unsafe
}
