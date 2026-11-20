// Web stand-ins for native-only modules the app imports (mapped in metro.config.js). Each one
// covers only the calls the app makes; sign-in and file picking report "not on web".
import type { ReactNode } from 'react';

const notOnWeb = async(): Promise<never> => {
  throw new Error('Not available in the web build');
};

// @react-native-google-signin/google-signin
export const GoogleSignin = {
  configure: () => undefined,
  hasPlayServices: notOnWeb,
  signIn: notOnWeb,
  signOut: async() => undefined,
};
export const GoogleSigninButton = () => null;
export const statusCodes = {};

// @invertase/react-native-apple-authentication
export const appleAuth = { isSupported: false, isSignUpButtonSupported: false, performRequest: notOnWeb, Operation: {}, Scope: {} };
export const appleAuthAndroid = { isSupported: false, configure: () => undefined, signIn: notOnWeb, ResponseType: {}, Scope: {} };
export const AppleButton = Object.assign(() => null, { Type: {}, Style: {} });

// react-native-keychain: deliberately stores nothing, so no token ever lands in browser storage.
export const getGenericPassword = async() => false;
export const setGenericPassword = async() => false;
export const resetGenericPassword = async() => true;
export const getInternetCredentials = async() => false;
export const setInternetCredentials = async() => false;
export const resetInternetCredentials = async() => true;

// react-native-sha256
async function digest(algorithm: 'SHA-1' | 'SHA-256', text: string): Promise<string> {
  const hash = await crypto.subtle.digest(algorithm, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}
export const sha1 = (text: string) => digest('SHA-1', text);
export const sha256 = (text: string) => digest('SHA-256', text);

// @react-native-documents/picker
export const pick = notOnWeb;
export const keepLocalCopy = notOnWeb;
export const types = {};
export const errorCodes = {};
export const isErrorWithCode = () => false;

// react-native-color-matrix-image-filters: render the image unfiltered.
export const Sepia = ({ children }: { children?: ReactNode }) => <>{children}</>;

// Default export serves react-native-config (no keys), react-native-share and
// react-native-haptic-feedback.
export default {
  open: async({ url, title }: { url?: string; title?: string }) => {
    if (navigator.share) {
      await navigator.share({ url, title });
    }
  },
  trigger: () => undefined,
};
