// screens/ChatListScreen.js

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, Image, SafeAreaView, // Using SafeAreaView for loading/error
  RefreshControl // For pull-to-refresh
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native'; // useFocusEffect to refresh on screen focus

// Import Theme Hook
import { useTheme } from '../src/ThemeContext'; // Adjust path if needed
// Import Firebase services and functions
import { firestore, auth } from '../firebaseConfig'; // Adjust path if needed
import {
  collection, query, where, orderBy, onSnapshot, Timestamp // Import Timestamp
} from 'firebase/firestore';
// Import Icon library for placeholder
import Ionicons from '@expo/vector-icons/Ionicons';

const ChatListScreen = () => {
  const navigation = useNavigation();
  const { colors, isDarkMode } = useTheme();
  const currentUser = auth.currentUser;

  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- Fetch Chats Effect ---
  const fetchChats = useCallback(() => {
    if (!currentUser) {
      setError("Please log in to view chats."); // Should ideally be handled by RootNavigator
      setLoading(false);
      setIsRefreshing(false);
      return () => {}; // Return empty cleanup function
    }

    setLoading(true);
    setError(null);

    const chatsRef = collection(firestore, 'privateChats');
    // Query chats where the current user is a participant, order by last message time
    const q = query(
      chatsRef,
      where('participants', 'array-contains', currentUser.uid),
      orderBy('lastMessage.createdAt', 'desc') // Order by the timestamp within lastMessage
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedChats = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Find the *other* participant's details
        const otherParticipantId = data.participants?.find(p => p !== currentUser.uid);
        const otherParticipantDetails = data.participantDetails?.[otherParticipantId];

        fetchedChats.push({
          id: doc.id, // chatId (e.g., uid1_uid2)
          otherParticipant: {
            id: otherParticipantId,
            displayName: otherParticipantDetails?.displayName || 'Unknown User',
            avatar: otherParticipantDetails?.avatar || null, // Use avatar if stored
          },
          lastMessage: {
            text: data.lastMessage?.text || '',
            createdAt: data.lastMessage?.createdAt, // Keep as Timestamp or convert here
          },
        });
      });
      setChats(fetchedChats);
      setLoading(false);
      setIsRefreshing(false);
    }, (err) => {
      console.error("Error fetching chat list: ", err);
      // Check for INDEX_NOT_FOUND error
      if (err.code === 'failed-precondition') {
           setError("Firestore index required. Check debug console for link.");
      } else {
           setError("Failed to load chats.");
      }
      setLoading(false);
      setIsRefreshing(false);
    });

    return unsubscribe; // Return cleanup function

  }, [currentUser]); // Dependency on currentUser

  // Fetch chats when the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const unsubscribe = fetchChats();
      return () => unsubscribe(); // Cleanup on blur
    }, [fetchChats])
  );

  // --- Pull-to-refresh ---
  const onRefresh = useCallback(() => {
    console.log("Refreshing chat list...");
    setIsRefreshing(true);
    // fetchChats already handles setting loading/refreshing states
    const unsubscribe = fetchChats();
    // Typically cleanup isn't needed here as fetchChats handles it,
    // but return it just in case of quick pull-release scenarios.
    return () => unsubscribe();
  }, [fetchChats]);


  // --- Navigate to Chat ---
  const navigateToChat = (chatItem) => {
    if (!chatItem?.otherParticipant?.id) {
        console.error("Missing recipient ID for chat:", chatItem);
        Alert.alert("Error", "Could not open chat.");
        return;
    }
    navigation.navigate('PrivateChat', {
        recipientId: chatItem.otherParticipant.id,
        recipientName: chatItem.otherParticipant.displayName,
        // Pass recipientAvatar if you have it
    });
  };

  // --- Render Chat Item ---
  const renderChatItem = ({ item }) => {
    const lastMsgDate = item.lastMessage?.createdAt instanceof Timestamp
        ? item.lastMessage.createdAt.toDate()
        : null;

    // Basic date formatting (consider using a library like date-fns for better formatting)
    const formatTimestamp = (date) => {
        if (!date) return '';
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            // Today: Show time
            return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        } else {
            // Older: Show date
            return date.toLocaleDateString();
        }
    };

    return (
      <TouchableOpacity style={styles.chatItem} onPress={() => navigateToChat(item)}>
        {/* Placeholder Avatar */}
        <View style={styles.avatarPlaceholder}>
           {/* If item.otherParticipant.avatar exists, use Image */}
           {item.otherParticipant.avatar ? (
               <Image source={{ uri: item.otherParticipant.avatar }} style={styles.avatarImage} />
           ) : (
               <Ionicons name="person-circle-outline" size={40} color={colors.textSecondary} />
           )}
        </View>
        {/* Chat Info */}
        <View style={styles.chatInfo}>
            <Text style={styles.participantName} numberOfLines={1}>
                {item.otherParticipant.displayName}
            </Text>
            <Text style={styles.lastMessageText} numberOfLines={1}>
                {item.lastMessage?.text || '...'}
            </Text>
        </View>
        {/* Timestamp */}
        <Text style={styles.timestamp}>
            {formatTimestamp(lastMsgDate)}
        </Text>
      </TouchableOpacity>
    );
  };


  // --- Themed Styles ---
  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: colors.background },
    errorText: { color: colors.error, fontSize: 16, textAlign: 'center' },
    listContainer: { paddingTop: 10 },
    emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: colors.textSecondary },
    chatItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 15,
        backgroundColor: colors.surface,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
    },
    avatarPlaceholder: {
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: colors.border, // Placeholder background
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 15,
    },
    avatarImage: {
        width: 50,
        height: 50,
        borderRadius: 25,
    },
    chatInfo: {
        flex: 1, // Takes available space
        justifyContent: 'center',
    },
    participantName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: colors.textPrimary,
        marginBottom: 4,
    },
    lastMessageText: {
        fontSize: 14,
        color: colors.textSecondary,
    },
    timestamp: {
        fontSize: 12,
        color: colors.textSecondary,
        marginLeft: 10,
    },
  }), [colors]);


  // --- Loading / Error States ---
  if (loading && chats.length === 0) { // Show loading only initially
    return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
  }
  if (error && chats.length === 0) { // Show error only if list is empty
    return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text></SafeAreaView>;
  }

  // --- Main List UI ---
  return (
    // Use View as root component
    <View style={styles.container}>
      <FlatList
        data={chats}
        renderItem={renderChatItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyText}>You have no active chats yet.</Text>}
        contentContainerStyle={styles.listContainer}
        refreshControl={ // Add pull-to-refresh
            <RefreshControl
                refreshing={isRefreshing}
                onRefresh={onRefresh}
                tintColor={colors.primaryTeal}
                colors={[colors.primaryTeal]}
            />
        }
      />
    </View>
  );
};

export default ChatListScreen;

