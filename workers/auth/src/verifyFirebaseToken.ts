import { createRemoteJWKSet, jwtVerify, JWTPayload } from 'jose';

const GOOGLE_JWKS_URL = new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');

// Remote JWK set instance with in-memory caching across requests inside the same Cloudflare Worker isolate
const jwks = createRemoteJWKSet(GOOGLE_JWKS_URL, {
  cacheMaxAge: 6 * 60 * 60 * 1000, // 6 hours
  cooldownDuration: 30 * 1000,     // 30 seconds between failed fetches
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

/**
 * Verifies a Firebase ID token against Google's public JWKS without needing firebase-admin.
 * @param token The raw Firebase ID token JWT string
 * @param projectId The Firebase Project ID (`FIREBASE_PROJECT_ID`)
 * @returns The verified payload claims, or null if verification fails
 */
export async function verifyFirebaseToken(token: string, projectId: string): Promise<FirebaseIdTokenClaims | null> {
  if (!token || !projectId) return null;

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ['RS256'],
    });

    // Validate essential sub claim
    if (!payload.sub || typeof payload.sub !== 'string') {
      return null;
    }

    return payload as FirebaseIdTokenClaims;
  } catch (err) {
    console.error('Firebase token verification failed:', err);
    return null;
  }
}
