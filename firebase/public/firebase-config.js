/**
 * Firebase Configuration
 *
 * INSTRUCTIONS:
 * 1. Go to Firebase Console: https://console.firebase.google.com
 * 2. Create a new project called "pams-recipes"
 * 3. Go to Project Settings > General > Your apps
 * 4. Click "Add app" > Web app
 * 5. Copy the firebaseConfig object here
 */

const firebaseConfig = {
  apiKey: "AIzaSyDuKQTnkseSJnShWm4bCq221Jb6ninil54",
  authDomain: "pams-recipes.firebaseapp.com",
  projectId: "pams-recipes",
  storageBucket: "pams-recipes.firebasestorage.app",
  messagingSenderId: "602237309084",
  appId: "1:602237309084:web:fa5172df011ee68556dd59"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Initialize services
const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
const functions = firebase.functions();

// Authorized emails (users who can add/edit recipes)
const AUTHORIZED_EMAILS = [
  'glarsen8172@gmail.com',
  'pkglines@gmail.com',
];

// Check if user is authorized to edit
function isAuthorizedUser(user) {
  return user && AUTHORIZED_EMAILS.includes(user.email);
}

