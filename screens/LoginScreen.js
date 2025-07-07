// screens/LoginScreen.js

import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

// 1. Import the auth module from @react-native-firebase
import { auth } from '../firebaseConfig';

// NOTE: We no longer import from 'firebase/auth'.
// All auth functions are now methods on the auth() object.

const LoginScreen = () => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigation = useNavigation();

    // The styles can remain the same.
    const styles = staticStyles;

    const handleLogin = async () => {
        if (!email || !password) {
            setError('Please enter both email and password.');
            return;
        }
        setError('');
        setLoading(true);
        try {
            // 2. Use the new syntax: auth().signInWithEmailAndPassword(...)
            await auth().signInWithEmailAndPassword(email, password);
            console.log('User signed in successfully!');
            // Navigation to the main app is handled automatically by the
            // onAuthStateChanged listener in your navigation component.
        } catch (err) {
            setLoading(false);
            console.error("Login Error:", err.code, err.message);
            // Error codes from @react-native-firebase/auth are similar
            switch (err.code) {
                case 'auth/invalid-email':
                    setError('Please enter a valid email address.');
                    break;
                case 'auth/user-disabled':
                    setError('This user account has been disabled.');
                    break;
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential': // Catches both wrong email and password
                    setError('Incorrect email or password. Please try again.');
                    break;
                case 'auth/too-many-requests':
                    setError('Access to this account has been temporarily disabled due to many failed login attempts. You can immediately restore it by resetting your password or you can try again later.');
                    break;
                default:
                    setError('Login failed. Please check your credentials and try again.');
                    break;
            }
        }
    };

    const handlePasswordReset = async () => {
        if (!email) {
            Alert.alert("Email Required", "Please enter your email address in the field above first.");
            return;
        }
        setError('');
        setLoading(true);

        try {
            // 3. Use the new syntax for sending a password reset email
            await auth().sendPasswordResetEmail(email);
            Alert.alert(
                "Password Reset Email Sent",
                `An email has been sent to ${email} with instructions to reset your password.`
            );
        } catch (err) {
            console.error("Password Reset Error:", err.code, err.message);
            switch (err.code) {
                 case 'auth/invalid-email':
                    setError('The email address entered is not valid.');
                    break;
                 case 'auth/user-not-found':
                    setError('No account found with this email address.');
                    break;
                 default:
                    setError('Failed to send password reset email. Please try again.');
                    break;
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" />
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                style={styles.keyboardAvoidingContainer}
            >
                <View style={styles.innerContainer}>
                    <Text style={styles.title}>Log In</Text>
                    <Text style={styles.subtitle}>Welcome back to yahdsell!</Text>

                    {error ? <Text style={styles.errorText}>{error}</Text> : null}

                    <TextInput
                        style={styles.input}
                        placeholder="Email Address"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholderTextColor="#888"
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Password"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        placeholderTextColor="#888"
                    />

                    <TouchableOpacity style={styles.button} onPress={handleLogin} disabled={loading}>
                        {loading ? (<ActivityIndicator size="small" color="#ffffff" />) : (<Text style={styles.buttonText}>Log In</Text>)}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={handlePasswordReset} style={styles.forgotPasswordButton} disabled={loading}>
                        <Text style={styles.linkText}>Forgot Password?</Text>
                    </TouchableOpacity>

                    <View style={styles.footer}>
                        <Text style={styles.footerText}>Don't have an account? </Text>
                        <TouchableOpacity onPress={() => navigation.navigate('Signup')} disabled={loading}>
                            <Text style={styles.linkText}>Sign Up</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

// --- Styles ---
const staticStyles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f8f8' },
    keyboardAvoidingContainer: { flex: 1 },
    innerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 30 },
    title: { fontSize: 32, fontWeight: 'bold', marginBottom: 10, color: '#333' },
    subtitle: { fontSize: 16, color: '#666', marginBottom: 30 },
    input: { width: '100%', height: 50, backgroundColor: '#ffffff', borderColor: '#cccccc', borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, marginBottom: 15, fontSize: 16, color: '#333' },
    button: { width: '100%', height: 50, backgroundColor: '#007bff', justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginTop: 10 },
    buttonText: { color: '#ffffff', fontSize: 18, fontWeight: 'bold' },
    errorText: { color: 'red', marginBottom: 15, fontSize: 14, textAlign: 'center' },
    forgotPasswordButton: { marginTop: 15, paddingVertical: 5 },
    footer: { flexDirection: 'row', marginTop: 25 },
    footerText: { fontSize: 14, color: '#666' },
    linkText: { fontSize: 14, color: '#007bff', fontWeight: '600' },
});

export default LoginScreen;
