/**
 * "Sign in with Google" for players, the same account as on the website
 * (convex/users.ts loginWithGoogle, convex/googleAuth.ts).
 *
 * Google gives the app an ID token issued for the website's OAuth client
 * (`webClientId`), so the server's GOOGLE_CLIENT_IDS already accepts it. On top
 * of that Google wants each phone platform registered in the same Google Cloud
 * project ("unlocked"):
 *  - iOS: an "iOS" OAuth client for com.unlocked.escapeapp. Put its id in
 *    IOS_CLIENT_ID and add the plugin to app.json:
 *    ["@react-native-google-signin/google-signin", { "iosUrlScheme": "com.googleusercontent.apps.<id without .apps.googleusercontent.com>" }]
 *  - Android: an "Android" OAuth client per signing key (package
 *    com.unlocked.escapeapp + SHA-1 of the EAS upload key and of Play App
 *    Signing). Then set ANDROID_READY.
 * Until then the button stays hidden on that platform. Needs a native build;
 * on older binaries without the module the button is hidden too.
 */
import { Platform, TurboModuleRegistry } from 'react-native';

const WEB_CLIENT_ID = '1070399630488-hbaguc9li85ao8at62ar4ge8uoh4bu9f.apps.googleusercontent.com';
// "UNLOCKED iOS app" OAuth client (bundle com.unlocked.escapeapp, team 97G74KAACL)
const IOS_CLIENT_ID = '1070399630488-l5apvkb7q2thggqu7g4dieogea0eflg4.apps.googleusercontent.com';
// "UNLOCKED Android app (EAS upload key)" OAuth client exists (SHA-1 1C:C0:...:71:48).
// Play Store installs are re-signed by Play App Signing: that key's SHA-1 needs
// its own Android OAuth client too, or Google answers DEVELOPER_ERROR there.
const ANDROID_READY = true;

function nativeModule(): any | null {
  if (TurboModuleRegistry.get('RNGoogleSignin') == null) return null;
  try {
    return require('@react-native-google-signin/google-signin');
  } catch {
    return null;
  }
}

export const GOOGLE_SIGNIN_AVAILABLE =
  (Platform.OS === 'ios' ? !!IOS_CLIENT_ID : Platform.OS === 'android' ? ANDROID_READY : false) && !!nativeModule();

let configured = false;

/**
 * Shows Google's account picker. Resolves to the ID token, or null when the
 * player closed it. Throws on real errors.
 */
export async function googleIdToken(): Promise<string | null> {
  const mod = nativeModule();
  if (!mod) throw new Error('Google sign-in is not available');
  const { GoogleSignin, isSuccessResponse, isErrorWithCode, statusCodes } = mod;
  if (!configured) {
    GoogleSignin.configure({ webClientId: WEB_CLIENT_ID, iosClientId: IOS_CLIENT_ID || undefined, scopes: ['email', 'profile'] });
    configured = true;
  }
  try {
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    // Always offer the account picker instead of silently reusing the last account.
    await GoogleSignin.signOut().catch(() => {});
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return null; // cancelled
    return res.data.idToken ?? null;
  } catch (e) {
    const code = isErrorWithCode(e) ? (e as any).code : null;
    if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) return null;
    throw e;
  }
}
