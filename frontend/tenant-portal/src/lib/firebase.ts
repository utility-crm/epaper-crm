import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithPhoneNumber, 
  RecaptchaVerifier, 
  sendEmailVerification, 
  applyActionCode,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  User,
  ConfirmationResult,
  Auth
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
};

const hasValidConfig = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.appId
);

const app: FirebaseApp | null = hasValidConfig ? (!getApps().length ? initializeApp(firebaseConfig) : getApp()) : null;
const auth: Auth | null = app ? getAuth(app) : null;
const googleProvider: GoogleAuthProvider | null = app ? new GoogleAuthProvider() : null;

export {
  app,
  auth,
  googleProvider,
  signInWithPopup,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  sendEmailVerification,
  applyActionCode,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
};
export type { User, ConfirmationResult };
