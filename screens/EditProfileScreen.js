// screens/EditProfileScreen.js (with Toast Feedback)

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
// Firebase and Config
import { updateProfile } from 'firebase/auth';
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, firestore, storage } from '../firebaseConfig';
// Navigation and Theme
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../src/ThemeContext';
// Image Picker & Manipulator
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
// Icons (Optional)
// *** 1. Import Toast ***
import Toast from 'react-native-toast-message';

const EditProfileScreen = () => {
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();
    const currentUser = auth.currentUser;

    // State
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [manipulatingImage, setManipulatingImage] = useState(false);
    const [error, setError] = useState(null); // Keep for potential form-level errors
    const [profileData, setProfileData] = useState(null);
    const [displayName, setDisplayName] = useState('');
    const [bio, setBio] = useState('');
    const [currentPhotoURL, setCurrentPhotoURL] = useState(null);
    const [newImageUri, setNewImageUri] = useState(null);

    // --- Fetch Existing Profile Data --- (Keep as is)
    useEffect(() => {
        if (!currentUser) { Alert.alert("Error", "You must be logged in."); navigation.goBack(); return; }
        setLoading(true); setError(null);
        const userDocRef = doc(firestore, 'users', currentUser.uid);
        const fetchProfile = async () => {
            try {
                const docSnap = await getDoc(userDocRef);
                let firestoreDisplayName = ''; let firestoreBio = ''; let firestorePhotoUrl = null;
                if (docSnap.exists()) {
                    const data = docSnap.data(); setProfileData(data);
                    firestoreDisplayName = data.displayName || ''; firestoreBio = data.bio || '';
                    firestorePhotoUrl = data.profilePicUrl || null;
                } else { setProfileData(null); }
                const authDisplayName = currentUser.displayName || ''; const authPhotoUrl = currentUser.photoURL || null;
                setDisplayName(firestoreDisplayName || authDisplayName); setBio(firestoreBio);
                setCurrentPhotoURL(firestorePhotoUrl || authPhotoUrl);
            } catch (err) { console.error("Error fetching profile:", err); setError("Failed to load profile."); }
            finally { setLoading(false); }
        };
        fetchProfile();
    }, [currentUser, navigation]);


    // --- Handle Image Picking & Manipulation --- (Keep as is)
    const handleChoosePhoto = useCallback(async () => {
        setError(''); setManipulatingImage(false); setNewImageUri(null);
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') { Alert.alert('Permission Required'); return; }
            const mediaTypes = ImagePicker.MediaTypeOptions?.Images ?? 'Images';
            let result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: mediaTypes, allowsEditing: true, aspect: [1, 1], quality: 1,
            });
            if (!result.canceled && result.assets && result.assets.length > 0) {
                const originalUri = result.assets[0].uri;
                setManipulatingImage(true); setCurrentPhotoURL(originalUri);
                const manipResult = await ImageManipulator.manipulateAsync(
                    originalUri, [{ resize: { width: 400, height: 400 } }],
                    { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
                );
                setNewImageUri(manipResult.uri); setCurrentPhotoURL(manipResult.uri);
            }
        } catch (pickerError) { console.error("Profile Image Picker/Manipulation Error:", pickerError); Alert.alert("Error", "Could not process image."); setError("Image processing failed."); setNewImageUri(null); }
        finally { setManipulatingImage(false); }
    }, [profileData, currentUser]);


    // --- Handle Update Submission ---
    const handleUpdateProfile = useCallback(async () => {
        if (!currentUser) { Alert.alert("Error", "You seem to be logged out."); return; }
        const trimmedDisplayName = displayName.trim();
        if (!trimmedDisplayName) { Alert.alert('Validation Error', 'Display Name cannot be empty.'); return; }

        setError(null); setSubmitting(true); setUploading(false);

        let finalPhotoURL = profileData?.profilePicUrl || currentUser?.photoURL || null;
        const oldStoragePath = profileData?.profilePicStoragePath || null;
        let finalStoragePath = oldStoragePath;
        const userDocRef = doc(firestore, 'users', currentUser.uid);

        // Step 1: Upload New Image (if one was picked)
        if (newImageUri) {
            setUploading(true);
            try {
                const response = await fetch(newImageUri); const blob = await response.blob();
                const newPath = `profile_pictures/${currentUser.uid}.jpg`;
                const storageRef = ref(storage, newPath);
                await uploadBytes(storageRef, blob);
                finalPhotoURL = await getDownloadURL(storageRef);
                finalStoragePath = newPath;
                if (oldStoragePath && oldStoragePath !== newPath) {
                    const oldImageRef = ref(storage, oldStoragePath);
                    try { await deleteObject(oldImageRef); } catch (deleteError) { /* Log non-critical error */ }
                }
            } catch (uploadError) {
                console.error("Error uploading new profile picture:", uploadError);
                // *** 2. Show Error Toast for Upload ***
                Toast.show({ type: 'error', text1: 'Image Upload Failed', text2: 'Profile changes not saved.', position: 'bottom' });
                setError('Failed to upload new image.'); // Keep error state if needed
                setUploading(false); setSubmitting(false); return;
            } finally { setUploading(false); }
        }

        // Step 2: Prepare Update Data
        const authUpdateData = { displayName: trimmedDisplayName, photoURL: finalPhotoURL };
        const firestoreUpdateData = {
            displayName: trimmedDisplayName, bio: bio.trim(),
            profilePicUrl: finalPhotoURL, profilePicStoragePath: finalStoragePath,
            lastUpdatedAt: serverTimestamp()
        };

        // Step 3: Execute Updates (Auth and Firestore)
        try {
            await updateProfile(currentUser, authUpdateData);
            await updateDoc(userDocRef, firestoreUpdateData);

            // *** 3. Show Success Toast ***
            Toast.show({
                type: 'success',
                text1: 'Profile Updated',
                text2: 'Your changes have been saved.',
                position: 'bottom',
                visibilityTime: 3000 // Show for 3 seconds
            });
            // Alert.alert('Success', 'Profile updated successfully!'); // Remove or keep Alert
            navigation.goBack();

        } catch (updateError) {
            console.error("Error updating profile (Auth or Firestore):", updateError);
            // *** 4. Show Error Toast for Save ***
            Toast.show({
                type: 'error',
                text1: 'Update Failed',
                text2: 'Could not save profile changes.',
                position: 'bottom',
                visibilityTime: 4000
            });
            setError('Failed to save profile changes.'); // Keep error state if needed
            // Alert.alert('Update Failed', 'Could not save profile changes.'); // Remove or keep Alert
        } finally { setSubmitting(false); }
    }, [displayName, bio, newImageUri, profileData, currentUser, navigation]);


    // --- Themed Styles ---
    const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);

    // --- Loading/Error States ---
    if (loading) { return ( <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView> ); }
    if (error && !profileData && !currentUser?.displayName) { return ( <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text><TouchableOpacity style={styles.button} onPress={() => navigation.goBack()}><Text style={styles.buttonText}>Go Back</Text></TouchableOpacity></SafeAreaView> ); }


    // --- UI Rendering ---
    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }} >
                <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">

                    <Text style={styles.title}>Edit Profile</Text>

                    {/* Profile Picture Section */}
                    <View style={styles.avatarContainer}>
                        {currentPhotoURL ? (
                            <Image source={{ uri: currentPhotoURL }} style={styles.avatarImage} />
                        ) : (
                            <View style={styles.avatarPlaceholder}>
                                <Text style={styles.avatarPlaceholderText}>
                                    {displayName ? displayName.charAt(0).toUpperCase() : '?'}
                                </Text>
                            </View>
                        )}
                        {manipulatingImage && <ActivityIndicator size="small" color={colors.primaryTeal} style={{ marginVertical: 5 }}/>}
                        <TouchableOpacity style={styles.changePhotoButton} onPress={handleChoosePhoto} disabled={submitting || uploading || manipulatingImage}>
                             <Text style={styles.changePhotoButtonText}>Change Photo</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Display Name Input */}
                    <TextInput
                        style={styles.input}
                        placeholder="Display Name"
                        value={displayName}
                        onChangeText={setDisplayName}
                        placeholderTextColor={colors.textSecondary}
                        autoCapitalize="words"
                        editable={!submitting}
                    />

                    {/* Bio Input */}
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Bio (optional)"
                        value={bio}
                        onChangeText={setBio}
                        placeholderTextColor={colors.textSecondary}
                        multiline={true}
                        maxLength={150}
                        editable={!submitting}
                    />

                     {/* Display form-level error if any */}
                    {error && !loading && <Text style={styles.errorText}>{error}</Text>}

                    {/* Loading Indicators */}
                    {uploading && <Text style={styles.loadingText}>Uploading image...</Text>}
                    {submitting && <ActivityIndicator size="small" color={colors.primaryTeal} style={styles.loadingIndicator}/>}
                    {submitting && !uploading && <Text style={styles.loadingText}>Saving profile...</Text>}


                    {/* Update Button */}
                    <TouchableOpacity
                        style={[styles.button, styles.submitButton, (submitting || uploading || manipulatingImage) && styles.buttonDisabled]}
                        onPress={handleUpdateProfile}
                        disabled={submitting || uploading || manipulatingImage}
                    >
                        <Text style={styles.buttonText}>Save Changes</Text>
                    </TouchableOpacity>

                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

// --- Styles Function Definition --- (Keep as is)
const themedStyles = (colors, isDarkMode) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: colors.background },
    scrollContainer: { flexGrow: 1, padding: 20, alignItems: 'center' },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: colors.textPrimary, },
    errorText: { color: colors.error, marginBottom: 15, fontSize: 16, textAlign: 'center' },
    avatarContainer: { marginBottom: 20, alignItems: 'center' },
    avatarImage: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.border, marginBottom: 10 },
    avatarPlaceholder: { width: 120, height: 120, borderRadius: 60, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
    avatarPlaceholderText: { fontSize: 40, color: colors.textSecondary },
    changePhotoButton: { paddingVertical: 5 },
    changePhotoButtonText: { color: colors.primaryTeal, fontSize: 16, fontWeight: '500' },
    input: { width: '100%', minHeight: 50, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, paddingVertical: 10, marginBottom: 15, fontSize: 16, color: colors.textPrimary, },
    textArea: { height: 100, textAlignVertical: 'top', },
    button: { width: '100%', height: 50, backgroundColor: colors.primaryGreen, justifyContent: 'center', alignItems: 'center', borderRadius: 8, marginTop: 10, }, // Changed general button to green for save
    submitButton: { width: '100%', backgroundColor: colors.primaryGreen, }, // Explicitly green
    buttonText: { color: colors.textOnPrimary || '#ffffff', fontSize: 18, fontWeight: 'bold', },
    buttonDisabled: { backgroundColor: colors.textDisabled, },
    loadingIndicator: { marginTop: 10, },
    loadingText: { marginTop: 5, marginBottom: 10, textAlign: 'center', color: colors.textSecondary, },
});

export default EditProfileScreen;
