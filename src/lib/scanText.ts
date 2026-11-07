// A reader types like a keyboard: with the Thai layout on, "qr_" arrives as "ๆพ๘". Map the characters a token or
// student code can contain (lowercase letters, digits, "_") from the Kedmanee layout back to what the barcode holds.
// The two strings are aligned: THAI[i] is the character typed for LATIN[i].
const THAI = "ๆไำพะัีรนยฟหกดเ้่าสวผปแอิืทมใฝจๅ/-ภถุึคต๘";
const LATIN = "qwertyuiopasdfghjkl;zxcvbnm,./0123456789_";
const KEDMANEE = new Map([...THAI].map((c, i) => [c, LATIN[i]]));

/** Latin text passes through untouched; only strings containing Thai letters are remapped. */
export const fromThaiLayout = (s: string) => (/[฀-๿]/.test(s) ? [...s].map((c) => KEDMANEE.get(c) ?? c).join("") : s);
