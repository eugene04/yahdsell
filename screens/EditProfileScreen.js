// screens/EditProfileScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator, Alert, Image,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text, TextInput, TouchableOpacity,
    View,
} from 'react-native';
import Toast from 'react-native-toast-message';

import { auth, firestore, storage } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

const EditProfileScreen = () => {
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();
    const currentUser = auth().currentUser;

    // --- State Management ---
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [displayName, setDisplayName] = useState('');
    const [bio, setBio] = useState('');
    const [currentPhotoURL, setCurrentPhotoURL] = useState(null);
    const [newImageUri, setNewImageUri] = useState(null);
    const [originalStoragePath, setOriginalStoragePath] = useState(null);
    
    // --- Verification State ---
    const [isVerified, setIsVerified] = useState(false);
    const [verificationRequested, setVerificationRequested] = useState(false);
    const [isRequestingVerification, setIsRequestingVerification] = useState(false);


    // --- Data Fetching Effect ---
    useEffect(() => {
        if (!currentUser) {
            Alert.alert("Error", "You must be logged in.");
            navigation.goBack();
            return;
        }
        
        const userDocRef = firestore().collection('users').doc(currentUser.uid);
        const unsubscribe = userDocRef.onSnapshot(docSnap => {
            if (docSnap.exists) {
                const data = docSnap.data();
                setDisplayName(data.displayName || currentUser.displayName || '');
                setBio(data.bio || '');
                setCurrentPhotoURL(data.profilePicUrl || currentUser.photoURL);
                setOriginalStoragePath(data.profilePicStoragePath || null);
                setIsVerified(data.isVerified || false);
                setVerificationRequested(data.verificationRequested || false);
            }
            if (loading) setLoading(false);
        }, error => {
            console.error("Error fetching profile:", error);
            setLoading(false);
            Toast.show({ type: 'error', text1: 'Failed to load profile.' });
        });

        return () => unsubscribe();
    }, [currentUser, loading]);

    // --- Handlers ---
    const handleChoosePhoto = useCallback(async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permission Required', 'We need permission to access your photos to update your profile picture.');
            return;
        }

        let result = await ImagePicker.launchImageLibraryAsync({
            allowsEditing: true,
            aspect: [1, 1],
            quality: 1,
        });

        if (!result.canceled && result.assets?.[0]) {
            try {
                const manipResult = await ImageManipulator.manipulateAsync(
                    result.assets[0].uri,
                    [{ resize: { width: 400, height: 400 } }],
                    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
                );
                setNewImageUri(manipResult.uri);
                setCurrentPhotoURL(manipResult.uri); // Preview the new image
            } catch (e) {
                Toast.show({ type: 'error', text1: 'Image Error', text2: 'Could not process the selected image.' });
            }
        }
    }, []);

    const handleUpdateProfile = useCallback(async () => {
        if (!currentUser) { Alert.alert("Error", "You seem to be logged out."); return; }
        if (!displayName.trim()) { Alert.alert('Validation Error', 'Display Name cannot be empty.'); return; }

        setSubmitting(true);
        let finalPhotoURL = currentPhotoURL;
        let finalStoragePath = originalStoragePath;

        try {
            if (newImageUri) {
                const newPath = `profile_pictures/${currentUser.uid}.jpg`;
                const reference = storage().ref(newPath);
                await reference.putFile(newImageUri);
                finalPhotoURL = await reference.getDownloadURL();
                finalStoragePath = newPath;
                if (originalStoragePath && originalStoragePath !== newPath) {
                    await storage().ref(originalStoragePath).delete().catch(() => {});
                }
            }

            await currentUser.updateProfile({
                displayName: displayName.trim(),
                photoURL: finalPhotoURL,
            });

            const userDocRef = firestore().collection('users').doc(currentUser.uid);
            await userDocRef.update({
                displayName: displayName.trim(),
                bio: bio.trim(),
                profilePicUrl: finalPhotoURL,
                profilePicStoragePath: finalStoragePath,
                lastUpdatedAt: firestore.FieldValue.serverTimestamp()
            });

            Toast.show({ type: 'success', text1: 'Profile Updated!', position: 'bottom' });
            navigation.goBack();

        } catch (error) {
            console.error("Error updating profile:", error);
            Toast.show({ type: 'error', text1: 'Update Failed', text2: error.message, position: 'bottom' });
        } finally {
            setSubmitting(false);
        }
    }, [displayName, bio, newImageUri, currentPhotoURL, originalStoragePath, currentUser, navigation]);

    const handleRequestVerification = async () => {
        if (!currentUser) return;
        setIsRequestingVerification(true);
        try {
            const userDocRef = firestore().collection('users').doc(currentUser.uid);
            await userDocRef.update({
                verificationRequested: true,
            });
            Toast.show({
                type: 'success',
                text1: 'Verification Requested',
                text2: 'Your request has been submitted for review.'
            });
            setVerificationRequested(true);
        } catch (error) {
            console.error("Error requesting verification:", error);
            Toast.show({ type: 'error', text1: 'Request Failed', text2: 'Please try again later.' });
        } finally {
            setIsRequestingVerification(false);
        }
    };


    // --- UI ---
    const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);

    if (loading) {
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
                    <Text style={styles.title}>Edit Profile</Text>
                    <View style={styles.avatarContainer}>
                        <Image source={{ uri: currentPhotoURL || 'https://placehold.co/120x120/E0E0E0/7F7F7F?text=User' }} style={styles.avatarImage} />
                        <TouchableOpacity style={styles.changePhotoButton} onPress={handleChoosePhoto} disabled={submitting}>
                            <Text style={styles.changePhotoButtonText}>Change Photo</Text>
                        </TouchableOpacity>
                    </View>
                    <TextInput style={styles.input} placeholder="Display Name" value={displayName} onChangeText={setDisplayName} autoCapitalize="words" editable={!submitting} />
                    <TextInput style={[styles.input, styles.textArea]} placeholder="Bio (optional)" value={bio} onChangeText={setBio} multiline maxLength={150} editable={!submitting} />
                    
                    <View style={styles.verificationContainer}>
                        <Text style={styles.verificationTitle}>Verification Status</Text>
                        {isVerified ? (
                            <View style={styles.verificationStatusView}>
                                <Ionicons name="shield-checkmark" size={22} color={colors.primaryGreen} />
                                <Text style={[styles.verificationStatusText, { color: colors.primaryGreen }]}>Verified</Text>
                            </View>
                        ) : verificationRequested ? (
                            <View style={styles.verificationStatusView}>
                                <Ionicons name="time-outline" size={22} color={colors.accent} />
                                <Text style={[styles.verificationStatusText, { color: colors.accent }]}>Request Pending Review</Text>
                            </View>
                        ) : (
                            <TouchableOpacity 
                                style={[styles.verificationButton, isRequestingVerification && styles.buttonDisabled]} 
                                onPress={handleRequestVerification}
                                disabled={isRequestingVerification}
                            >
                                {isRequestingVerification 
                                    ? <ActivityIndicator color={colors.textOnPrimary} /> 
                                    : <Text style={styles.verificationButtonText}>Request Verification</Text>
                                }
                            </TouchableOpacity>
                        )}
                    </View>
                    
                    <TouchableOpacity style={[styles.button, submitting && styles.buttonDisabled]} onPress={handleUpdateProfile} disabled={submitting}>
                        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Changes</Text>}
                    </TouchableOpacity>
                </ScrollView>
            </KeyboardAvoidingView>
            <Toast />
        </SafeAreaView>
    );
};

// --- Styles ---
const themedStyles = (colors, isDarkMode) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    scrollContainer: { flexGrow: 1, padding: 20, alignItems: 'center' },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, color: colors.textPrimary },
    avatarContainer: { marginBottom: 20, alignItems: 'center' },
    avatarImage: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.border, marginBottom: 10 },
    changePhotoButton: { paddingVertical: 5 },
    changePhotoButtonText: { color: colors.primaryTeal, fontSize: 16, fontWeight: '500' },
    input: { width: '100%', minHeight: 50, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, paddingVertical: 10, marginBottom: 15, fontSize: 16, color: colors.textPrimary },
    textArea: { height: 100, textAlignVertical: 'top' },
    button: { width: '100%', height: 50, backgroundColor: colors.primaryGreen, justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginTop: 10 },
    buttonText: { color: colors.textOnPrimary || '#ffffff', fontSize: 18, fontWeight: 'bold' },
    buttonDisabled: { backgroundColor: colors.textDisabled },
    loadingIndicator: { marginVertical: 10 },
    verificationContainer: {
        width: '100%',
        backgroundColor: colors.surface,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 15,
        marginBottom: 20,
        alignItems: 'center',
    },
    verificationTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: colors.textPrimary,
        marginBottom: 15,
    },
    verificationStatusView: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 5,
    },
    verificationStatusText: {
        fontSize: 16,
        fontWeight: '500',
        marginLeft: 8,
    },
    verificationButton: {
        backgroundColor: colors.primaryTeal,
        paddingVertical: 10,
        paddingHorizontal: 25,
        borderRadius: 8,
    },
    verificationButtonText: {
        color: colors.textOnPrimary,
        fontSize: 16,
        fontWeight: 'bold',
    },
});

export default EditProfileScreen;
