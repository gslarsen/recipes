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
  apiKey: "YOUR_API_KEY",
  authDomain: "pams-recipes.firebaseapp.com",
  projectId: "pams-recipes",
  storageBucket: "pams-recipes.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
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
  'gregorylarsen@gmail.com',
  // Add Pam's email here
];

// Check if user is authorized to edit
function isAuthorizedUser(user) {
  return user && AUTHORIZED_EMAILS.includes(user.email);
}

