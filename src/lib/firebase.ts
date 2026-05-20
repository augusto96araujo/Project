import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged as firebaseOnAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { OperationType, type FirestoreErrorInfo } from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);

const nativeAuth = getAuth();

const LOCAL_USER_KEY = 'netmanager_local_user';

let currentLocalUser: any = null;
try {
  const saved = localStorage.getItem(LOCAL_USER_KEY);
  if (saved) {
    currentLocalUser = JSON.parse(saved);
  }
} catch (e) {
  console.error('Error reading local user:', e);
}

const listeners = new Set<(user: any) => void>();

export const auth = new Proxy(nativeAuth, {
  get(target, prop, receiver) {
    if (prop === 'currentUser') {
      if (target.currentUser) {
        return target.currentUser;
      }
      return currentLocalUser;
    }
    if (prop === 'setLocalUser') {
      return (user: any) => {
        currentLocalUser = user;
        if (user) {
          localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
        } else {
          localStorage.removeItem(LOCAL_USER_KEY);
        }
        listeners.forEach(cb => {
          try {
            cb(currentLocalUser);
          } catch (e) {
            console.error('Error triggering local listener:', e);
          }
        });
      };
    }
    if (prop === 'customOnAuthStateChanged') {
      return (callback: (user: any) => void) => {
        listeners.add(callback);
        // Call immediately with current state
        callback(auth.currentUser);
        // Subscribe to native changes as well
        const nativeUnsub = firebaseOnAuthStateChanged(nativeAuth, (nativeUser) => {
          if (nativeUser) {
            callback(nativeUser);
          } else {
            callback(currentLocalUser);
          }
        });
        return () => {
          listeners.delete(callback);
          nativeUnsub();
        };
      };
    }

    const value = Reflect.get(target, prop, receiver);
    if (typeof value === 'function') {
      return value.bind(target);
    }
    return value;
  }
}) as any;

export function onAuthStateChanged(authInstance: any, callback: (user: any) => void) {
  if (authInstance && typeof authInstance.customOnAuthStateChanged === 'function') {
    return authInstance.customOnAuthStateChanged(callback);
  }
  return firebaseOnAuthStateChanged(authInstance, callback);
}

export function signOut(authInstance: any) {
  if (authInstance && typeof authInstance.setLocalUser === 'function') {
    authInstance.setLocalUser(null);
  }
  return firebaseSignOut(nativeAuth);
}


/**
 * Handle Firestore errors with detailed context for AI Studio debugging.
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration and internet connection.");
    }
  }
}

testConnection();
