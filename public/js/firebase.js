import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
    getAuth, signInAnonymously, onAuthStateChanged, connectAuthEmulator,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig, useEmulator } from './config.js';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

if (useEmulator) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', 8085);
}

// Resolves with the current user, signing in anonymously the first time.
// The anonymous session persists in this browser, which is what keeps a
// phone "joined" to a game after the code has been entered once.
let userPromise = null;
export function currentUser() {
    if (!userPromise) {
        userPromise = new Promise((resolve, reject) => {
            const stop = onAuthStateChanged(auth, (user) => {
                if (user) {
                    stop();
                    resolve(user);
                } else {
                    signInAnonymously(auth).catch((err) => {
                        stop();
                        userPromise = null;
                        reject(err);
                    });
                }
            });
        });
    }
    return userPromise;
}
