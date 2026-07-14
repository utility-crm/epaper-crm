import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');

const jwks = createRemoteJWKSet(GOOGLE_JWKS_URL, {
  cacheMaxAge: 6 * 60 * 60 * 1000,
  cooldownDuration: 30 * 1000,
});

export interface FirebaseIdTokenClaims extends JWTPayload {
  sub: string;
  email?: string;
  email_verified?: boolean;
  phone_number?: string;
  name?: string;
  picture?: string;
  firebase: {
    identities?: Record<string, unknown>;
    sign_in_provider?: string;
  };
}

export async function verifyFirebaseToken(token: string, projectId: string): Promise<FirebaseIdTokenClaims | null> {
  if (!token || !projectId) return null;

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    });

    if (!payload.sub || typeof payload.sub !== 'string') {
      return null;
    }

    return payload as FirebaseIdTokenClaims;
  } catch (err) {
    console.error('Firebase token verification failed:', err);
    return null;
  }
}
