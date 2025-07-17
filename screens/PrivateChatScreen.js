// screens/PrivateChatScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Keyboard,
  Modal,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { KeyboardControllerView } from 'react-native-keyboard-controller';

import { auth, firestore, storage } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

const generateChatId = (uid1, uid2) => {
  if (!uid1 || !uid2) return null;
  return [uid1, uid2].sort().join('_');
};

const PrivateChatScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { colors } = useTheme();
  const headerHeight = useHeaderHeight();

  const { recipientId, recipientName, recipientAvatar } = route.params || {};
  const currentUser = auth().currentUser;

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [imageModalVisible, setImageModalVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const flatListRef = useRef(null);

  const chatId = useMemo(() => generateChatId(currentUser?.uid, recipientId), [currentUser?.uid, recipientId]);

  useLayoutEffect(() => {
    navigation.setOptions({ title: recipientName || 'Chat' });
  }, [navigation, recipientName]);

  useEffect(() => {
    if (!chatId) {
      setLoading(false);
      return;
    }

    const messagesQuery = firestore()
      .collection('privateChats')
      .doc(chatId)
      .collection('messages')
      .orderBy('createdAt', 'desc');

    const unsubscribe = messagesQuery.onSnapshot(querySnapshot => {
      const fetchedMessages = querySnapshot.docs.map(doc => {
        const firebaseData = doc.data();
        return {
          _id: doc.id,
          text: firebaseData.text || '',
          createdAt: firebaseData.createdAt?.toDate() || new Date(),
          user: firebaseData.user || { _id: 'unknown' },
          image: firebaseData.image || null,
          system: firebaseData.system || false,
        };
      });
      setMessages(fetchedMessages);
      if (loading) setLoading(false);
    }, err => {
      console.error("Error fetching messages:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [chatId, loading]);
  
  const handleSendMessage = useCallback(async (messageText, imageUrl = null) => {
    if (!currentUser) {
      Alert.alert("Login Required", "Please log in to send a message.");
      return;
    }
    if (!chatId) return;

    setIsSending(true);

    const messageData = {
      text: messageText || '',
      createdAt: firestore.FieldValue.serverTimestamp(),
      user: {
        _id: currentUser.uid,
        name: currentUser.displayName || 'Me',
        avatar: currentUser.photoURL || null,
      },
      ...(imageUrl && { image: imageUrl }),
    };

    const chatMetadata = {
      lastMessage: {
        text: messageText ? messageText.substring(0, 40) : '📷 Image',
        createdAt: firestore.FieldValue.serverTimestamp(),
        senderId: currentUser.uid,
      },
      participants: [currentUser.uid, recipientId],
      participantDetails: {
        [currentUser.uid]: { 
            displayName: currentUser.displayName || 'Me', 
            avatar: currentUser.photoURL || null 
        },
        [recipientId]: { 
            displayName: recipientName || 'User', 
            avatar: recipientAvatar || null 
        }
      },
      lastActivity: firestore.FieldValue.serverTimestamp(),
    };

    try {
      const chatDocRef = firestore().collection('privateChats').doc(chatId);
      const messagesCollectionRef = chatDocRef.collection('messages');
      
      await messagesCollectionRef.add(messageData);
      await chatDocRef.set(chatMetadata, { merge: true });
      
      if (messageText) setText('');
      Keyboard.dismiss();
    } catch (err) {
      console.error("Error sending message:", err);
      Alert.alert("Error", "Could not send message.");
    } finally {
      setIsSending(false);
    }
  }, [chatId, currentUser, recipientId, recipientName, recipientAvatar]);

  const handlePickImage = async () => {
    if (!currentUser) { Alert.alert("Login Required"); return; }
    
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission Required'); return; }
    
    let result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, quality: 0.7 });

    if (!result.canceled && result.assets?.[0]) {
      uploadImageAndSend(result.assets[0].uri);
    }
  };

  const uploadImageAndSend = async (imageUri) => {
    if (!imageUri || !currentUser || !chatId) return;
    setIsSending(true);
    const filename = `${currentUser.uid}_${Date.now()}.jpg`;
    const storagePath = `chatImages/${chatId}/${filename}`;
    
    try {
      const imageRef = storage().ref(storagePath);
      await imageRef.putFile(imageUri);
      const downloadURL = await imageRef.getDownloadURL();
      await handleSendMessage(null, downloadURL);
    } catch (error) {
      console.error("Error uploading image:", error);
      Alert.alert("Image Upload Error", "Could not send image.");
      setIsSending(false);
    }
  };

  const formatTimestamp = (date) => {
    if (!date) return '';
    const now = new Date();
    const isToday = now.toDateString() === date.toDateString();

    if (isToday) {
      // If the message is from today, show only the time.
      return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } else {
      // If the message is from a previous day, show the date and time.
      return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    }
  };

  const renderMessageItem = ({ item }) => {
    const isUserMessage = item.user._id === currentUser?.uid;

    if (item.system) {
        return (
            <View style={styles.systemMessageContainer}>
                <Text style={styles.systemMessageText}>{item.text}</Text>
            </View>
        );
    }

    return (
      <View style={[styles.messageRow, isUserMessage ? styles.userMessageRow : styles.botMessageRow]}>
        <View style={styles.messageContent}>
            <View style={[styles.messageBubble, isUserMessage ? styles.userMessageBubble : styles.botMessageBubble]}>
            {item.image ? (
                <TouchableOpacity onPress={() => { setSelectedImageUri(item.image); setImageModalVisible(true); }}>
                <Image source={{ uri: item.image }} style={styles.chatImage} />
                </TouchableOpacity>
            ) : (
                <Text style={isUserMessage ? styles.userMessageText : styles.botMessageText}>
                {item.text}
                </Text>
            )}
            </View>
            <Text style={[styles.timestampText, isUserMessage ? styles.userTimestamp : styles.botTimestamp]}>
                {formatTimestamp(item.createdAt)}
            </Text>
        </View>
      </View>
    );
  };

  const styles = useMemo(() => themedStyles(colors), [colors]);

  if (loading) {
    return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardControllerView style={styles.container} keyboardVerticalOffset={headerHeight}>
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessageItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.messageList}
          style={styles.list}
          inverted // This is key for chat UIs
        />

        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={handlePickImage} disabled={isSending}>
            <Ionicons name="add" size={28} color={colors.primaryTeal} />
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            placeholder="Type a message..."
            placeholderTextColor={colors.textSecondary}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, (!text.trim() || isSending) && styles.sendButtonDisabled]}
            onPress={() => handleSendMessage(text)}
            disabled={!text.trim() || isSending}
          >
            {isSending ? <ActivityIndicator size="small" color={colors.primaryTeal} /> : <Ionicons name="arrow-up-circle" size={36} color={colors.primaryTeal} />}
          </TouchableOpacity>
        </View>
      </KeyboardControllerView>

      <Modal animationType="fade" transparent={true} visible={imageModalVisible} onRequestClose={() => setImageModalVisible(false)}>
        <View style={styles.modalContainer}>
          <TouchableOpacity style={styles.closeButton} onPress={() => setImageModalVisible(false)}>
            <Ionicons name="close-circle" size={32} color="white" />
          </TouchableOpacity>
          <Image source={{ uri: selectedImageUri }} style={styles.fullScreenImage} resizeMode="contain" />
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const themedStyles = (colors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { flex: 1 },
  messageList: { paddingHorizontal: 10, paddingVertical: 15 },
  messageRow: { flexDirection: 'row', marginVertical: 4, alignItems: 'flex-end' },
  userMessageRow: { justifyContent: 'flex-end' },
  botMessageRow: { justifyContent: 'flex-start' },
  messageContent: {
    maxWidth: '80%',
  },
  messageBubble: { padding: 4, borderRadius: 18 },
  userMessageBubble: { backgroundColor: colors.primaryTeal, borderBottomRightRadius: 4 },
  botMessageBubble: { backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  userMessageText: { color: colors.textOnPrimary || '#FFFFFF', fontSize: 16, paddingHorizontal: 10, paddingVertical: 6 },
  botMessageText: { color: colors.textPrimary, fontSize: 16, paddingHorizontal: 10, paddingVertical: 6 },
  chatImage: { width: 200, height: 200, borderRadius: 15 },
  timestampText: {
    fontSize: 10,
    color: colors.textDisabled,
    marginTop: 4,
  },
  userTimestamp: {
    textAlign: 'right',
    marginRight: 8,
  },
  botTimestamp: {
    textAlign: 'left',
    marginLeft: 8,
  },
  systemMessageContainer: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginVertical: 10,
  },
  systemMessageText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  inputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  actionButton: { padding: 5 },
  textInput: { flex: 1, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10, fontSize: 16, color: colors.textPrimary, maxHeight: 120, marginHorizontal: 8 },
  sendButton: { justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { opacity: 0.5 },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', alignItems: 'center' },
  fullScreenImage: { width: '100%', height: '100%' },
  closeButton: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 30, right: 15, padding: 10, zIndex: 10 },
});

export default PrivateChatScreen;
