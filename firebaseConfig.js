// firebaseConfig.js for @react-native-firebase

// We no longer initialize the services here.
// We just import the pre-initialized modules that the library provides.
// The configuration is handled automatically by the google-services.json
// and GoogleService-Info.plist files via the plugin in app.json.

import auth from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';
import functions from '@react-native-firebase/functions';
import storage from '@react-native-firebase/storage';

// Export the modules directly.
// You will call them as functions now, e.g., auth() instead of just auth.
export { auth, firestore, functions, storage };

