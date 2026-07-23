import { initializeApp, getApps, getApp } from 'firebase/app';
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
  ConfirmationResult
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

const app = firebaseConfig.apiKey ? (!getApps().length ? initializeApp(firebaseConfig) : getApp()) : null;
const auth = app ? getAuth(app) : null as any;
const googleProvider = app ? new GoogleAuthProvider() : null as any;

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
