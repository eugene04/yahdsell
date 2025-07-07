// screens/ChatBotScreen.js

import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, SafeAreaView, StyleSheet } from 'react-native';
import { GiftedChat } from 'react-native-gifted-chat';

// 1. Import the new firebase modules
import { auth, functions } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

// 2. Use the new syntax to get a reference to the callable function
const askGeminiFunc = functions().httpsCallable('askGemini');

const ChatBotScreen = () => {
  const [messages, setMessages] = useState([]);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const navigation = useNavigation();
  const { colors } = useTheme();
  // 3. Use the new syntax to get the current user
  const currentUser = auth().currentUser;

  // Set initial welcome message
  useEffect(() => {
    setMessages([
      {
        _id: 1,
        text: 'Hello! How can I help you today?',
        createdAt: new Date(),
        user: {
          _id: 'BOT',
          name: 'YahdSell Bot',
        },
      },
    ]);
  }, []);

  const onSend = useCallback(async (messagesToSend = []) => {
    if (!currentUser) {
        Alert.alert("Login Required", "Please log in to use the chat bot.");
        return;
    }

    const userMessage = messagesToSend[0];
    setMessages(previousMessages => GiftedChat.append(previousMessages, [userMessage]));
    setIsBotTyping(true);

    try {
      // 4. The call to the function itself remains the same
      const result = await askGeminiFunc({ prompt: userMessage.text });

      if (result.data && typeof result.data.reply === 'string') {
        const botMessage = {
          _id: Math.random().toString(36).substring(7),
          text: result.data.reply,
          createdAt: new Date(),
          user: {
            _id: 'BOT',
            name: 'YahdSell Bot',
          },
        };
        setMessages(previousMessages => GiftedChat.append(previousMessages, [botMessage]));
      } else {
        throw new Error("Invalid response format from Cloud Function.");
      }
    } catch (error) {
      console.error("Error calling Cloud Function:", error);
      const errorMessageObj = {
        _id: Math.random().toString(36).substring(7),
        text: "Sorry, something went wrong. Please try again.",
        createdAt: new Date(),
        system: true,
      };
      setMessages(previousMessages => GiftedChat.append(previousMessages, [errorMessageObj]));
    } finally {
      setIsBotTyping(false);
    }
  }, [currentUser, navigation]);

  const styles = useMemo(() => StyleSheet.create({
      container: { flex: 1, backgroundColor: colors.background },
  }), [colors]);

  return (
    <SafeAreaView style={styles.container}>
      <GiftedChat
        messages={messages}
        onSend={messagesToSend => onSend(messagesToSend)}
        user={{
          _id: currentUser?.uid || 'UNKNOWN_USER',
          name: currentUser?.displayName || currentUser?.email,
          avatar: currentUser?.photoURL,
        }}
        placeholder="Ask the bot anything..."
        isTyping={isBotTyping}
      />
    </SafeAreaView>
  );
};

export default ChatBotScreen;
