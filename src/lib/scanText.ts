// A reader types like a keyboard: with the Thai layout on, "qr_" arrives as "ๆพ๘". Map the characters a token or
// student code can contain (lowercase letters, digits, "_") from the Kedmanee layout back to what the barcode holds.
// The two strings are aligned: THAI[i] is the character typed for LATIN[i].
const THAI = "ๆไำพะัีรนยฟหกดเ้่าสวผปแอิืทมใฝจๅ/-ภถุึคต๘";
const LATIN = "qwertyuiopasdfghjkl;zxcvbnm,./0123456789_";
const KEDMANEE = new Map([...THAI].map((c, i) => [c, LATIN[i]]));

/**
 * Latin text passes through untouched; strings containing Thai letters are remapped.
 * On the Thai layout the 3 key types a literal "_", and "_" in a token arrives as "๘" (mapped above),
 * so a raw "_" in Thai-layout text is the digit 3. Digits-and-underscores only (e.g. an all-3s UID,
 * which has no Thai letter to give it away) is also read that way; no real token is just digits and "_".
 */
export const fromThaiLayout = (s: string) =>
  /[฀-๿]/.test(s)
    ? [...s].map((c) => (c === "_" ? "3" : (KEDMANEE.get(c) ?? c))).join("")
    : /^[\d_]+$/.test(s)
      ? s.replaceAll("_", "3")
      : s;
