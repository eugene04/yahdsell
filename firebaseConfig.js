// firebaseConfig.js: Configures and initializes Firebase services for an Expo managed workflow.
// This file ensures that Firebase is initialized only once and provides instances
// for Authentication, Firestore, and Storage.

// Import necessary Firebase modules
import { getApp, getApps, initializeApp } from 'firebase/app';
import { getReactNativePersistence, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Import AsyncStorage for Firebase Auth persistence
import AsyncStorage from '@react-native-async-storage/async-storage';

// Your Firebase project configuration.
// IMPORTANT: Replace these placeholder values with your actual Firebase project credentials.
// These values are typically found in your Firebase project settings (Project settings -> General).
const firebaseConfig = {
  apiKey: "AIzaSyDPVo-XUgzXsQmVOwmoqR6QXzHTbTyAWog", // Your Firebase Web API Key
  authDomain: "yahdsell.firebaseapp.com",       // Your Firebase Auth Domain
  projectId: "yahdsell",                       // Your Firebase Project ID
  storageBucket: "yahdsell.firebasestorage.app", // Your Firebase Storage Bucket URL
  messagingSenderId: "56882429104",              // Your Firebase Messaging Sender ID
  appId: "1:56882429104:web:a7fb9da74922b80210cf75", // Your Firebase App ID (Web)
  measurementId: "G-D1BQSRC34R"                 // Your Firebase Measurement ID (for Analytics)
};

// Declare variables for the Firebase app and services.
// Initialize them to null to ensure they are only assigned if initialization is successful.
let app = null;
let auth = null;
let firestore = null;
let storage = null;

// Check if a Firebase app has already been initialized to prevent errors.
// getApps() returns an array of initialized Firebase apps.
const apps = getApps();

if (apps.length === 0) {
  // No Firebase app found, so proceed with initialization.
  console.log("No Firebase app found, initializing new default app...");
  try {
    // Basic validation of essential Firebase config keys before initialization.
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.authDomain) {
      throw new Error("Firebase config object has missing essential keys. Please check your firebaseConfig.");
    }
    // Initialize the Firebase app with your configuration.
    app = initializeApp(firebaseConfig);
    console.log("Firebase initialized successfully.");
  } catch (error) {
    // Log any errors that occur during Firebase app initialization.
    console.error("Firebase app initialization failed:", error);
    app = null; // Ensure 'app' is null if initialization fails
  }
} else {
  // A Firebase app already exists, retrieve the default instance.
  console.log("Firebase app already exists, getting default app...");
  app = getApp(); // Get the existing default app instance
}

// Initialize Firebase services (Auth, Firestore, Storage) only if the Firebase app was successfully initialized or retrieved.
if (app) {
  try {
    // Initialize Firebase Authentication with AsyncStorage for persistence.
    // getReactNativePersistence(AsyncStorage) enables Auth state to persist across app sessions.
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage)
    });

    // Initialize Firebase Firestore. This is where your database interactions happen.
    firestore = getFirestore(app);

    // Initialize Firebase Storage. This is used for file uploads and downloads.
    storage = getStorage(app);

    console.log("Firebase services initialized/retrieved.");
  } catch (serviceError) {
    // Log any errors that occur during the initialization of individual Firebase services.
    console.error("Failed to initialize Firebase services:", serviceError);
    // Services remain null if their initialization fails, which can be handled by consuming components.
  }
} else {
  // If the Firebase app itself failed to initialize, log a warning that services cannot be set up.
  console.error("Cannot initialize Firebase services because app initialization failed.");
}

// Export the initialized Firebase app and its services.
// Components can import these to interact with Firebase.
// Note: 'auth', 'firestore', and 'storage' might be null if initialization failed.
export { app, auth, firestore, storage };

