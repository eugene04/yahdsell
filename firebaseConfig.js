// firebaseConfig.js (Prevents Duplicate App Initialization)

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app'; // Import getApps and getApp
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Hardcoded config (Still check these values!)
const firebaseConfig = {
  apiKey: "AIzaSyDPVo-XUgzXsQmVOwmoqR6QXzHTbTyAWog",
  authDomain: "yahdsell.firebaseapp.com",
  projectId: "yahdsell",
  storageBucket: "yahdsell.firebasestorage.app",
  messagingSenderId: "56882429104",
  appId: "1:56882429104:web:a7fb9da74922b80210cf75",
  measurementId: "G-D1BQSRC34R"
};

// --- MODIFICATION: Check if app already exists ---
let app;
const apps = getApps(); // Get a list of initialized apps

if (apps.length === 0) {
  console.log("No Firebase app found, initializing new default app...");
  try {
    // Check config keys before initializing
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.authDomain) {
      throw new Error("Firebase config object has missing essential keys.");
    }
    app = initializeApp(firebaseConfig);
    console.log("Firebase initialized successfully.");
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    app = null; // Ensure app is null if init fails
  }
} else {
  console.log("Firebase app already exists, getting default app...");
  app = getApp(); // Get the existing default app instance
}
// --- END MODIFICATION ---


// Initialize services (only if app was successfully initialized or retrieved)
let auth = null; // Initialize as null
let firestore = null;
let storage = null;

if (app) {
  try {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });
    firestore = getFirestore(app);
    storage = getStorage(app);
    console.log("Firebase services initialized/retrieved.");
  } catch (serviceError) {
    console.error("Failed to initialize Firebase services:", serviceError);
    // Keep services as null if their initialization fails
  }
} else {
    console.error("Cannot initialize Firebase services because app initialization failed.");
}


// Export the initialized services (could be null if initialization failed)
export { app, auth, firestore, storage };
