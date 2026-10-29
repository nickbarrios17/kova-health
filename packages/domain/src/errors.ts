/** Domain error codes shared by all clients. SQL raises them with SQLSTATE `VDxxx`. */
export const ERROR_CODES = [
  'ACTIVE_SESSION_EXISTS',
  'VERSION_CONFLICT',
  'SESSION_CLOSED',
  'INVALID_TRANSITION',
  'INVALID_INPUT',
  'NOT_FOUND',
  'CONFLICT',
  'FORBIDDEN',
  'UNAUTHENTICATED',
  'EMAIL_NOT_CONFIRMED',
  'NETWORK',
  'RATE_LIMITED',
  'INVITE_INVALID',
  'ALREADY_HAS_COACH',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const SQLSTATE: Record<string, ErrorCode> = {
  VD001: 'ACTIVE_SESSION_EXISTS',
  VD002: 'VERSION_CONFLICT',
  VD003: 'SESSION_CLOSED',
  VD004: 'INVALID_TRANSITION',
  VD005: 'INVALID_INPUT',
  VD006: 'INVITE_INVALID',
  VD007: 'ALREADY_HAS_COACH',
  VD404: 'NOT_FOUND',
  VD429: 'RATE_LIMITED',
  '23505': 'CONFLICT', // unique_violation
  '23503': 'NOT_FOUND', // foreign_key_violation: referenced row missing or not yours
  '23514': 'INVALID_INPUT', // check_violation
  '23502': 'INVALID_INPUT', // not_null_violation
  '22P02': 'INVALID_INPUT', // invalid_text_representation
  '22003': 'INVALID_INPUT', // numeric_value_out_of_range
  '42501': 'FORBIDDEN', // insufficient_privilege / RLS violation
  PGRST301: 'UNAUTHENTICATED',
  // Supabase Auth error codes
  email_not_confirmed: 'EMAIL_NOT_CONFIRMED',
  invalid_credentials: 'UNAUTHENTICATED',
  over_request_rate_limit: 'RATE_LIMITED',
  over_email_send_rate_limit: 'RATE_LIMITED',
  weak_password: 'INVALID_INPUT',
  user_already_exists: 'CONFLICT',
  PGRST116: 'NOT_FOUND',
};

/** Errors carry a stable code and a safe message, never raw SQL details. */
export class KovaError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string = code,
    public readonly retryable: boolean = code === 'NETWORK' || code === 'RATE_LIMITED',
  ) {
    super(message);
    this.name = 'KovaError';
  }
}

export function codeFromSqlState(state: string | undefined | null): ErrorCode {
  return (state && SQLSTATE[state]) || 'INTERNAL';
}

const SAFE_MESSAGES: Record<ErrorCode, string> = {
  ACTIVE_SESSION_EXISTS: 'Ya tienes un entrenamiento en curso.',
  VERSION_CONFLICT: 'Otro dispositivo cambió esto. Recarga para ver la última versión.',
  SESSION_CLOSED: 'Esta sesión ya terminó.',
  INVALID_TRANSITION: 'Esa acción no es posible en el estado actual de la sesión.',
  INVALID_INPUT: 'Algún dato no es válido.',
  NOT_FOUND: 'No se encontró.',
  CONFLICT: 'Ese registro ya existe.',
  FORBIDDEN: 'No tienes permiso para esta acción.',
  UNAUTHENTICATED: 'Inicia sesión de nuevo.',
  EMAIL_NOT_CONFIRMED: 'Confirma tu correo: abre el enlace que te enviamos al crear la cuenta.',
  NETWORK: 'Sin conexión. Lo intentaremos de nuevo.',
  RATE_LIMITED: 'Demasiados intentos. Espera un momento.',
  INVITE_INVALID: 'El código no es válido o ya venció. Pide uno nuevo.',
  ALREADY_HAS_COACH: 'Ya tienes un coach. Corta ese vínculo antes de aceptar otro.',
  INTERNAL: 'Algo salió mal.',
};

export function safeMessage(code: ErrorCode): string {
  return SAFE_MESSAGES[code];
}
