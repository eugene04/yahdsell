
// screens/ChatBotScreen.js

import React, { useState, useCallback, useEffect,useMemo } from 'react';
import { View, ActivityIndicator, StyleSheet, Text, SafeAreaView, Alert } from 'react-native';
import { GiftedChat } from 'react-native-gifted-chat';
import { useNavigation } from '@react-navigation/native';

// Import Firebase services (app needed for functions) and functions methods
import { auth, app } from '../firebaseConfig'; // Import app instance
import { getFunctions, httpsCallable, FunctionsError } from 'firebase/functions'; // Import functions methods

// Import theme hook
import { useTheme } from '../src/ThemeContext';

// Initialize Firebase Functions
const functions = getFunctions(app); // Pass the initialized app

// Reference to the callable function (use the exact name defined in index.ts)
const askGeminiFunc = httpsCallable(functions, 'askGemini');

const ChatBotScreen = () => {
  const [messages, setMessages] = useState([]);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const navigation = useNavigation();
  const { colors, isDarkMode } = useTheme(); // Get theme colors
  const currentUser = auth.currentUser; // Get current user for user ID

  // Set initial message
  useEffect(() => {
    setMessages([
      {
        _id: 1,
        text: 'Hello! How can I help you today?',
        createdAt: new Date(),
        user: {
          _id: 'BOT', // Special ID for the bot
          name: 'YahdSell Bot',
          // avatar: 'url_to_bot_avatar.png', // Optional bot avatar
        },
      },
    ]);
  }, []);

  const onSend = useCallback(async (messagesToSend = []) => {
    if (!currentUser) {
        Alert.alert("Login Required", "Please log in to use the chat bot.");
        // Optional: navigate to login
        // navigation.navigate('Login');
        return;
    }

    const userMessage = messagesToSend[0];
    // Add user's message to the chat UI immediately
    setMessages(previousMessages => GiftedChat.append(previousMessages, [userMessage]));

    // Set bot typing indicator
    setIsBotTyping(true);

    // Call the Cloud Function
    try {
        console.log("Calling askGemini Cloud Function with:", userMessage.text);
        const result = await askGeminiFunc({ prompt: userMessage.text });

        // Ensure result.data and result.data.reply exist
         if (result.data && typeof result.data.reply === 'string') {
            const botReplyText = result.data.reply;
            console.log("Received reply from function:", botReplyText);

            // Create the bot's message object
            const botMessage = {
                _id: Math.random().toString(36).substring(7), // Generate unique ID
                text: botReplyText,
                createdAt: new Date(),
                user: {
                  _id: 'BOT',
                  name: 'YahdSell Bot',
                  // avatar: 'url_to_bot_avatar.png',
                },
            };
            // Add bot's message to the UI
            setMessages(previousMessages => GiftedChat.append(previousMessages, [botMessage]));
         } else {
              throw new Error("Invalid response format from Cloud Function.");
         }

    } catch (error) {
        console.error("Error calling Cloud Function or processing response:", error);
        let errorMessage = "Sorry, something went wrong.";
        // Handle specific callable function errors
        if (error instanceof FunctionsError) {
             errorMessage = `Error: <span class="math-inline">\{error\.message\} \(</span>{error.code})`;
        } else if (error instanceof Error) {
            errorMessage = error.message;
        }
        // Display error as a message in chat
        const errorMessageObj = {
            _id: Math.random().toString(36).substring(7),
            text: errorMessage,
            createdAt: new Date(),
            system: true, // Make it look like a system message
            // user: { _id: 'BOT', name: 'Error' } // Or attribute to bot
        };
         setMessages(previousMessages => GiftedChat.append(previousMessages, [errorMessageObj]));
    } finally {
        // Remove bot typing indicator
        setIsBotTyping(false);
    }
  }, [currentUser, navigation]); // Include dependencies

  // Themed styles
  const styles = useMemo(() => StyleSheet.create({
      container: { flex: 1, backgroundColor: colors.background },
      // Add any specific styles if needed
  }), [colors]);


  return (
    <SafeAreaView style={styles.container}>
      <GiftedChat
        messages={messages}
        onSend={messagesToSend => onSend(messagesToSend)}
        user={{
          // Current logged-in user
          _id: currentUser?.uid || 'UNKNOWN_USER', // Use UID or a placeholder
          name: currentUser?.displayName || currentUser?.email || undefined,
          // avatar: currentUser?.photoURL || undefined
        }}
        placeholder="Ask the bot anything..."
        isTyping={isBotTyping} // Show typing indicator when bot is processing
        // Customize appearance using props if needed
        // renderBubble={props => <Bubble {...props} wrapperStyle={{ /*...*/ }} />}
      />
    </SafeAreaView>
  );
};

export default ChatBotScreen;