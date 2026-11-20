// Web stand-ins for the @react-native-firebase modules (see metro.config.js). The web build has
// no Firebase project, so the app runs signed out: auth reports no user and the rest are no-ops.
const unavailable = async(): Promise<never> => {
  throw new Error('Arkham Cards accounts are not available in the web build');
};

export const getApps = () => [];
export const initializeApp = () => ({});

const authService = {
  currentUser: null,
  onAuthStateChanged(callback: (user: null) => void) {
    setTimeout(() => callback(null), 0);
    return () => undefined;
  },
  signInWithCredential: unavailable,
  signInWithEmailAndPassword: unavailable,
  createUserWithEmailAndPassword: unavailable,
  sendPasswordResetEmail: unavailable,
  signOut: async() => undefined,
};
export const auth = Object.assign(() => authService, {
  GoogleAuthProvider: { credential: () => ({}) },
  AppleAuthProvider: { credential: () => ({}) },
});

const ref = { on: () => undefined, off: () => undefined, once: unavailable, set: unavailable };
export const database = () => ({
  ref: () => ref,
  setPersistenceEnabled: () => undefined,
  goOffline: () => undefined,
  goOnline: () => undefined,
});

export const crashlytics = () => ({
  setCrashlyticsCollectionEnabled: () => undefined,
  didCrashOnPreviousExecution: async() => false,
  log: () => undefined,
  setAttribute: () => undefined,
  recordError: () => undefined,
  crash: () => undefined,
});

export const analytics = () => ({
  logScreenView: async() => undefined,
  logEvent: async() => undefined,
});

export const functions = () => ({ httpsCallable: () => unavailable });
