export function ok(data) {
    return { ok: true, data };
}
export function err(code, message) {
    return { ok: false, error: { code, message } };
}
export const ErrorCode = {
    UNAUTHORIZED: 'UNAUTHORIZED',
    INVALID_AUDIENCE: 'INVALID_AUDIENCE',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    SLUG_NOT_FOUND: 'SLUG_NOT_FOUND',
    BAD_REQUEST: 'BAD_REQUEST',
    CONFLICT: 'CONFLICT',
    RATE_LIMITED: 'RATE_LIMITED',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
};
