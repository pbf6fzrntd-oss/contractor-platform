/** Store only the random key and a hash, never message text, in this tab's session. */
export async function replyRequestIdentity(
  storage: Pick<Storage, "getItem" | "setItem">,
  leadId: string,
  body: string,
) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body.trim()));
  const hash = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
  const storageKey = `lowcountry-reply:${leadId}:${hash}`;
  let key = storage.getItem(storageKey);
  if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    key = crypto.randomUUID();
    storage.setItem(storageKey, key);
  }
  return { key, storageKey };
}
