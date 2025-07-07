// screens/GroupChatScreen.js

import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    SafeAreaView,
    StyleSheet,
    Text
} from 'react-native';
import { Actions, GiftedChat } from 'react-native-gifted-chat';

// 1. Import the new firebase modules
import { auth, firestore, storage } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext'; // Assuming you have a theme context

const GroupChatScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { colors } = useTheme(); // Using theme colors for styling
    const { groupId, groupName } = route.params || {};
    // 2. Use new auth syntax
    const currentUser = auth().currentUser;

    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [imageUploading, setImageUploading] = useState(false);

    useLayoutEffect(() => {
        navigation.setOptions({ title: groupName || 'Group Chat' });
    }, [navigation, groupName]);

    // --- Data Fetching Effect ---
    useEffect(() => {
        if (!groupId) {
            setError("Group ID not specified.");
            setLoading(false);
            return;
        }

        // 3. Update Firestore listener syntax
        const messagesQuery = firestore()
            .collection('groups')
            .doc(groupId)
            .collection('messages')
            .orderBy('createdAt', 'desc');

        const unsubscribe = messagesQuery.onSnapshot(querySnapshot => {
            const fetchedMessages = querySnapshot.docs.map(doc => {
                const firebaseData = doc.data();
                return {
                    _id: doc.id,
                    text: firebaseData.text || '',
                    createdAt: firebaseData.createdAt?.toDate() || new Date(),
                    user: firebaseData.user || { _id: 'unknown', name: 'Unknown' },
                    image: firebaseData.image || null,
                };
            });
            setMessages(fetchedMessages);
            if (loading) setLoading(false);
        }, err => {
            console.error("Error fetching group messages: ", err);
            setError("Failed to load messages.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [groupId, loading]);

    // --- Handlers ---
    const onSend = useCallback((messagesToSend = []) => {
        if (!currentUser || !groupId) {
            Alert.alert("Error", "Cannot send message. Please ensure you are logged in.");
            return;
        }
        const { text } = messagesToSend[0];
        const messageData = {
            text: text,
            // 4. Update serverTimestamp syntax
            createdAt: firestore.FieldValue.serverTimestamp(),
            user: {
                _id: currentUser.uid,
                name: currentUser.displayName || currentUser.email || 'Me',
            },
        };
        // 5. Update add document syntax
        firestore().collection('groups').doc(groupId).collection('messages').add(messageData)
            .catch((err) => {
                console.error("Error sending group text message:", err);
                Alert.alert("Error", "Failed to send message.");
            });
    }, [groupId, currentUser]);

    const uploadImageAndSend = async (imageUri) => {
        if (!imageUri || !currentUser || !groupId) return;
        
        setImageUploading(true);
        const filename = `${currentUser.uid}_${Date.now()}.jpg`;
        const storagePath = `groupChatImages/${groupId}/${filename}`;
        
        try {
            // 6. Use new Storage syntax
            const reference = storage().ref(storagePath);
            await reference.putFile(imageUri);
            const downloadURL = await reference.getDownloadURL();

            const messageData = {
                image: downloadURL,
                createdAt: firestore.FieldValue.serverTimestamp(),
                user: {
                    _id: currentUser.uid,
                    name: currentUser.displayName || currentUser.email || 'Me',
                },
            };
            await firestore().collection('groups').doc(groupId).collection('messages').add(messageData);
        } catch (error) {
            console.error("Error sending group image message:", error);
            Alert.alert("Error", "Failed to send image.");
        } finally {
            setImageUploading(false);
        }
    };

    const handlePickImage = async () => {
        if (!currentUser) { Alert.alert("Login Required", "Log in to send images."); return; }
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') { Alert.alert('Permission Required'); return; }
        
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.7,
        });

        if (!result.canceled && result.assets?.[0]) {
            uploadImageAndSend(result.assets[0].uri);
        }
    };

    const renderActions = (props) => (
        <Actions
            {...props}
            containerStyle={styles.actionsContainer}
            icon={() => (<Text style={[styles.actionsIconText, { color: colors.primaryTeal }]}>+</Text>)}
            options={{ 'Choose From Library': handlePickImage, 'Cancel': () => {} }}
            optionTintColor={colors.primaryTeal}
        />
    );
    
    // --- Render Logic ---
    const styles = useMemo(() => themedStyles(colors), [colors]);

    if (loading) {
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
    }
    if (error) {
        return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text></SafeAreaView>;
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            {imageUploading && <ActivityIndicator style={styles.uploadIndicator} size="small" color={colors.primaryTeal} />}
            <KeyboardAvoidingView
                 style={styles.keyboardAvoidingContainer}
                 behavior={Platform.OS === "ios" ? "padding" : "height"}
                 keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 0}
            >
                <GiftedChat
                    messages={messages}
                    onSend={messagesToSend => onSend(messagesToSend)}
                    user={{
                        _id: currentUser.uid,
                        name: currentUser.displayName || currentUser.email || 'Me'
                    }}
                    renderActions={renderActions}
                    placeholder="Type your message..."
                    alwaysShowSend
                />
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

// --- Styles ---
const themedStyles = (colors) => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    keyboardAvoidingContainer: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: colors.background },
    errorText: { color: colors.error, fontSize: 16, textAlign: 'center' },
    actionsContainer: { width: 26, height: 26, marginLeft: 10, marginBottom: 10, alignItems: 'center', justifyContent: 'center' },
    actionsIconText: { fontSize: 24, fontWeight: 'bold' },
    uploadIndicator: { position: 'absolute', top: 10, right: 10, zIndex: 10 },
});

export default GroupChatScreen;
