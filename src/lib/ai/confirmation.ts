/**
 * Confirmación afirmativa del paciente (conversacional, no igualdad literal).
 */
function normalize(message: string): string {
  return message
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
}

const AFFIRMATIVE =
  /\b(si|sip|sep|dale|ok|okay|vale|perfecto|confirmo|confirmado|claro|de acuerdo|esta bien|va|vamos|hagamos|agenda|agendala|agendar|reserva|reserv[ae]|quiero esa|esa hora|me sirve|listo|hecho|yes|yep|sure)\b/;

const NEGATIVE =
  /\b(no|nop|nel|mejor no|cancel[ae]|olvidalo|ahora no|despues|quiza|quizas|tal vez|creo que no|no estoy seguro|no se)\b/;

/** Rechazo o pedido de otro horario (sin ser todavía un "sí"). */
const CHANGE_OR_DECLINE =
  /\b(no|nop|nel|mejor no|cancel[ae]|olvidalo|ahora no|despues|otra hora|otro horario|cambial[ao]|cambiar|prefiero|mejor\s+\d|no quiero esa|esa no)\b/;

export function isAffirmativeConfirmation(message: string): boolean {
  const text = normalize(message);
  if (!text) return false;
  if (NEGATIVE.test(text) && !AFFIRMATIVE.test(text)) return false;
  return AFFIRMATIVE.test(text);
}

export function isNegativeOrChangeIntent(message: string): boolean {
  const text = normalize(message);
  if (!text) return false;
  if (isAffirmativeConfirmation(text)) return false;
  return CHANGE_OR_DECLINE.test(text);
}

export function isWeakCancelIntent(message: string): boolean {
  return /\b(quiza|quizas|tal vez|puede que|creo que no podre|no se si)\b/.test(
    normalize(message),
  );
}
