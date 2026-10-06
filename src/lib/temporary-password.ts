import { randomInt } from "node:crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%*-_+?";
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;

export const TEMPORARY_PASSWORD_LENGTH = 16;

/**
 * Contraseña temporal con CSPRNG (`crypto.randomInt`, sin sesgo de módulo).
 * Garantiza mayúscula, minúscula, dígito y símbolo; sin caracteres ambiguos (0/O, 1/l/I).
 */
export function generateTemporaryPassword(length: number = TEMPORARY_PASSWORD_LENGTH): string {
  if (length < 12) {
    throw new Error("La contraseña temporal debe tener al menos 12 caracteres.");
  }
  const pick = (set: string) => set[randomInt(set.length)];
  const chars = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
