// screens/SignupScreen.js (Updated with updateProfile)

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
// Import initialized auth/firestore instances and specific functions
import { auth, firestore } from '../firebaseConfig'; // Adjust path if needed
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'; // Added updateProfile
// Import firestore functions if saving user profile data
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';

const SignupScreen = () => {
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigation = useNavigation();

  const handleSignup = async () => {
    setError('');

    // --- Validation ---
    if (!displayName) { // Assuming displayName is required
        setError('Please enter a display name.');
        return;
    }
    if (!email || !password || !confirmPassword) {
      setError('Please fill in all email and password fields.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password should be at least 6 characters long.');
      return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
        setError('Please enter a valid email address.');
        return;
    }
    // --- End Validation ---

    setLoading(true);

    try {
      // 1. Create user with Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const newUser = userCredential.user;
      console.log('User account created successfully!', newUser.uid);

      // --- 2. Set displayName on Auth Profile ---
      // It's good practice to set this immediately after creation
      try {
          await updateProfile(newUser, { displayName: displayName });
          console.log("Auth profile updated with displayName.");
      } catch (profileError) {
          console.error("Error updating auth profile:", profileError);
          // Log error but continue - user can update profile later maybe
      }
      // --- End Set displayName ---


      // --- 3. Optional: Save additional user info to Firestore ---
      // This saves data to your 'users' collection for easy querying later
      try {
          const userDocRef = doc(firestore, 'users', newUser.uid);
          await setDoc(userDocRef, {
              uid: newUser.uid,
              email: newUser.email,
              displayName: displayName, // Save display name here too
              createdAt: serverTimestamp(),
              // Add other default fields, e.g., profilePicUrl: null
          });
          console.log('User data saved to Firestore.');
      } catch (firestoreError) {
          console.error("Error saving user data to Firestore:", firestoreError);
          // Decide if this failure is critical or if app can proceed
      }
      // --- End Optional Firestore Save ---

      // 4. Signup successful - No explicit navigation needed
      // The onAuthStateChanged listener in RootNavigator will handle the switch to AppNavigator
      console.log("Signup process complete.");
      // setLoading(false); // Not strictly needed as component will unmount

    } catch (err) { // Catch errors from createUserWithEmailAndPassword
      setLoading(false);
      console.error("Signup Error:", err.code, err.message);

      // Set user-friendly error messages
      switch (err.code) {
        case 'auth/email-already-in-use':
          setError('This email address is already registered.');
          break;
        case 'auth/invalid-email':
          setError('The email address is not valid.');
          break;
        case 'auth/weak-password':
          setError('Password is too weak (min. 6 characters).');
          break;
        default:
          setError('Failed to create account. Please try again.');
          break;
      }
    }
  };

  // --- UI Rendering ---
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardAvoidingContainer}
      >
        <ScrollView contentContainerStyle={styles.scrollInnerContainer} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join the yahdsell marketplace!</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Inputs */}
          <TextInput style={styles.input} placeholder="Display Name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" placeholderTextColor="#888" />
          <TextInput style={styles.input} placeholder="Email Address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} placeholderTextColor="#888"/>
          <TextInput style={styles.input} placeholder="Password (min. 6 characters)" value={password} onChangeText={setPassword} secureTextEntry placeholderTextColor="#888"/>
          <TextInput style={styles.input} placeholder="Confirm Password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry placeholderTextColor="#888"/>

          {/* Signup Button */}
          <TouchableOpacity style={[styles.button, loading && styles.buttonDisabled]} onPress={handleSignup} disabled={loading}>
            {loading ? ( <ActivityIndicator size="small" color="#ffffff" /> ) : ( <Text style={styles.buttonText}>Sign Up</Text> )}
          </TouchableOpacity>

          {/* Link to Login */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.linkText}>Log In</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f8f8', },
    keyboardAvoidingContainer: { flex: 1, },
    scrollInnerContainer: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30, paddingVertical: 20, },
    title: { fontSize: 32, fontWeight: 'bold', marginBottom: 10, color: '#333', },
    subtitle: { fontSize: 16, color: '#666', marginBottom: 30, textAlign: 'center', },
    input: { width: '100%', height: 50, backgroundColor: '#ffffff', borderColor: '#cccccc', borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, marginBottom: 15, fontSize: 16, },
    button: { width: '100%', height: 50, backgroundColor: '#28a745', justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginTop: 10, },
    buttonDisabled: { backgroundColor: '#cccccc', },
    buttonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold', },
    errorText: { color: 'red', marginBottom: 15, fontSize: 14, textAlign: 'center', },
    footer: { flexDirection: 'row', marginTop: 25, justifyContent: 'center', alignItems: 'center', },
    footerText: { fontSize: 14, color: '#666', },
    linkText: { fontSize: 14, color: '#007bff', fontWeight: '600', },
});

// --- Make sure this line is present ---
export default SignupScreen;