// Copy to config.js and fill in from Firebase console → Project settings →
// Your apps → Web app. These values are public by design; access is
// controlled by firestore.rules.
export const firebaseConfig = {
    apiKey: '',
    authDomain: 'YOUR-PROJECT.firebaseapp.com',
    projectId: 'YOUR-PROJECT',
    appId: '',
};

// true = talk to the local Firebase emulators (firebase emulators:start)
// instead of the real project.
export const useEmulator = false;
