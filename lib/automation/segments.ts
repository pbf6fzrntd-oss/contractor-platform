/**
 * How many texts (SMS "segments") a message uses. Carriers bill per segment.
 * Plain text fits 160 characters (153 per part when split). Any character
 * outside the basic SMS alphabet (e.g. Spanish á í ó ú, emoji) switches the
 * whole message to 70 characters (67 per part).
 */
const GSM_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[~]|€"; // count as 2 characters

export function smsSegments(text: string): { encoding: "GSM-7" | "UCS-2"; characters: number; segments: number } {
  let gsmLength = 0;
  let isGsm = true;
  for (const ch of text) {
    if (GSM_BASIC.includes(ch)) gsmLength += 1;
    else if (GSM_EXTENDED.includes(ch)) gsmLength += 2;
    else {
      isGsm = false;
      break;
    }
  }
  if (isGsm) {
    return { encoding: "GSM-7", characters: gsmLength, segments: gsmLength <= 160 ? 1 : Math.ceil(gsmLength / 153) };
  }
  // UCS-2 counts UTF-16 code units (emoji take 2).
  const units = text.length;
  return { encoding: "UCS-2", characters: units, segments: units <= 70 ? 1 : Math.ceil(units / 67) };
}
