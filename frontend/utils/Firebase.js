import { getAuth, GoogleAuthProvider } from "firebase/auth"
import { initializeApp } from "firebase/app";
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_APIKEY,
    authDomain: "loginonecart-6330b.firebaseapp.com",
    projectId: "loginonecart-6330b",
    storageBucket: "loginonecart-6330b.firebasestorage.app",
    messagingSenderId: "558309898382",
    appId: "1:558309898382:web:c53893ec0b528e429e31df"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app)
const provider = new GoogleAuthProvider()

export { auth, provider }