// screens/ChatBotScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
// --- FIX: Import the superior KeyboardControllerView ---
import { KeyboardControllerView } from 'react-native-keyboard-controller';

import { auth, functions } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

// Define the function reference once, outside the component.
const askGeminiFunc = functions().httpsCallable('askGemini');

const ChatBotScreen = () => {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [isBotTyping, setIsBotTyping] = useState(false);
  const navigation = useNavigation();
  const { colors } = useTheme();
  const currentUser = auth().currentUser;
  const flatListRef = useRef(null);
  
  // Get the dynamic header height to offset the keyboard view
  const headerHeight = useHeaderHeight();

  // Set initial welcome message
  useEffect(() => {
    setMessages([
      {
        _id: 'initial-message',
        text: 'Hello! I am the YahdSell assistant. How can I help you find the perfect second-hand item today?',
        createdAt: new Date(),
        user: {
          _id: 'BOT',
          name: 'YahdSell Bot',
          avatar: '🤖', // Using an emoji as a simple avatar
        },
      },
    ]);
  }, []);

  // Automatically scroll to the bottom when new messages are added
  useEffect(() => {
    if (flatListRef.current) {
      flatListRef.current.scrollToEnd({ animated: true });
    }
  }, [messages]);

  const onSend = useCallback(async () => {
    if (!text.trim()) return;
    if (!currentUser) {
      Alert.alert("Login Required", "Please log in to use the chat bot.");
      return;
    }

    const humanMessage = {
      _id: Math.random().toString(36).substring(7),
      text: text.trim(),
      createdAt: new Date(),
      user: {
        _id: currentUser.uid,
        name: currentUser.displayName || 'You',
      },
    };

    setMessages(prev => [...prev, humanMessage]);
    setText('');
    Keyboard.dismiss();
    setIsBotTyping(true);

    try {
      const result = await askGeminiFunc({ prompt: humanMessage.text });
      const reply = result?.data?.reply ?? "Sorry, I'm having trouble connecting. Please try again.";

      const botMessage = {
        _id: Math.random().toString(36).substring(7),
        text: reply,
        createdAt: new Date(),
        user: {
          _id: 'BOT',
          name: 'YahdSell Bot',
          avatar: '🤖',
        },
      };
      setMessages(prev => [...prev, botMessage]);
    } catch (err) {
      console.error("Error calling askGemini:", err);
      const errorMessage = {
        _id: Math.random().toString(36).substring(7),
        text: "I encountered an error. Please check your connection and try again.",
        createdAt: new Date(),
        user: { _id: 'BOT', name: 'YahdSell Bot', avatar: '🤖' },
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsBotTyping(false);
    }
  }, [text, currentUser]);

  const renderMessageItem = ({ item }) => {
    const isUserMessage = item.user._id === currentUser?.uid;
    return (
      <View style={[styles.messageRow, isUserMessage ? styles.userMessageRow : styles.botMessageRow]}>
        {!isUserMessage && <Text style={styles.botAvatar}>{item.user.avatar}</Text>}
        <View style={[styles.messageBubble, isUserMessage ? styles.userMessageBubble : styles.botMessageBubble]}>
          <Text style={isUserMessage ? styles.userMessageText : styles.botMessageText}>
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  const styles = useMemo(() => themedStyles(colors), [colors]);

  return (
    <SafeAreaView style={styles.container}>
      {/* --- FIX: Use KeyboardControllerView instead of KeyboardAvoidingView --- */}
      <KeyboardControllerView
        style={styles.container}
        keyboardVerticalOffset={headerHeight}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessageItem}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.messageList}
          style={styles.list}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {isBotTyping && (
          <View style={styles.typingIndicatorContainer}>
            <Text style={styles.botAvatar}>🤖</Text>
            <ActivityIndicator size="small" color={colors.textSecondary} />
          </View>
        )}

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={text}
            onChangeText={setText}
            placeholder="Ask a question..."
            placeholderTextColor={colors.textSecondary}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, (!text.trim() || isBotTyping) && styles.sendButtonDisabled]}
            onPress={onSend}
            disabled={!text.trim() || isBotTyping}
          >
            <Ionicons name="arrow-up-circle" size={36} color={(!text.trim() || isBotTyping) ? colors.textDisabled : colors.primaryTeal} />
          </TouchableOpacity>
        </View>
      </KeyboardControllerView>
    </SafeAreaView>
  );
};

const themedStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    flex: 1,
  },
  messageList: {
    paddingHorizontal: 10,
    paddingVertical: 15,
  },
  messageRow: {
    flexDirection: 'row',
    marginVertical: 8,
    alignItems: 'flex-end',
  },
  userMessageRow: {
    justifyContent: 'flex-end',
  },
  botMessageRow: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
  },
  userMessageBubble: {
    backgroundColor: colors.primaryTeal,
    borderBottomRightRadius: 4,
  },
  botMessageBubble: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 4,
  },
  userMessageText: {
    color: colors.textOnPrimary || '#FFFFFF',
    fontSize: 16,
  },
  botMessageText: {
    color: colors.textPrimary,
    fontSize: 16,
  },
  botAvatar: {
    fontSize: 24,
    marginRight: 8,
    marginBottom: 5,
  },
  typingIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  textInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.textPrimary,
    maxHeight: 120,
    marginRight: 10,
  },
  sendButton: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});

export default ChatBotScreen;
