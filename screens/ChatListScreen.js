// screens/ChatListScreen.js

import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, RefreshControl, SafeAreaView, StyleSheet, Text, TouchableOpacity, View
} from 'react-native';

// 1. Import the new firebase modules
import { auth, firestore } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

// Import Icon library for placeholder
import Ionicons from '@expo/vector-icons/Ionicons';

const ChatListScreen = () => {
  const navigation = useNavigation();
  const { colors, isDarkMode } = useTheme();

  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // --- Fetch Chats Effect ---
  const fetchChats = useCallback(() => {
    // 2. Use new auth syntax to get current user
    const currentUser = auth().currentUser;
    if (!currentUser) {
      setError("Please log in to view chats.");
      setLoading(false);
      setIsRefreshing(false);
      setChats([]);
      return () => {};
    }

    setLoading(true);
    setError(null);

    // 3. Use new Firestore query syntax
    const chatsQuery = firestore()
      .collection('privateChats')
      .where('participants', 'array-contains', currentUser.uid)
      .orderBy('lastMessage.createdAt', 'desc');

    const unsubscribe = chatsQuery.onSnapshot(querySnapshot => {
      const fetchedChats = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Find the *other* participant's details
        const otherParticipantId = data.participants?.find(p => p !== currentUser.uid);
        if (!otherParticipantId) return; // Skip if chat is malformed

        const otherParticipantDetails = data.participantDetails?.[otherParticipantId];
        fetchedChats.push({
          id: doc.id,
          otherParticipant: {
            id: otherParticipantId,
            displayName: otherParticipantDetails?.displayName || 'Unknown User',
            avatar: otherParticipantDetails?.avatar || null,
          },
          lastMessage: {
            text: data.lastMessage?.text || '...',
            // The toDate() method is available on Timestamps from @react-native-firebase/firestore
            createdAt: data.lastMessage?.createdAt?.toDate(),
          },
        });
      });
      setChats(fetchedChats);
      setLoading(false);
      setIsRefreshing(false);
    }, (err) => {
      console.error("Error fetching chat list: ", err);
      setError("Failed to load chats.");
      setLoading(false);
      setIsRefreshing(false);
    });

    return unsubscribe; // Return cleanup function
  }, []);

  // Fetch chats when the screen comes into focus
  useFocusEffect(
    useCallback(() => {
      const unsubscribe = fetchChats();
      return () => unsubscribe();
    }, [fetchChats])
  );

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchChats();
  }, [fetchChats]);

  // --- Navigation ---
  const navigateToChat = (chatItem) => {
    navigation.navigate('PrivateChat', {
        recipientId: chatItem.otherParticipant.id,
        recipientName: chatItem.otherParticipant.displayName,
        recipientAvatar: chatItem.otherParticipant.avatar,
    });
  };

  // --- Render Item ---
  const renderChatItem = ({ item }) => {
    const formatTimestamp = (date) => {
        if (!date) return '';
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
        }
        return date.toLocaleDateString();
    };

    return (
      <TouchableOpacity style={styles.chatItem} onPress={() => navigateToChat(item)}>
        {item.otherParticipant.avatar ? (
           <Image source={{ uri: item.otherParticipant.avatar }} style={styles.avatarImage} />
        ) : (
           <View style={styles.avatarPlaceholder}>
               <Ionicons name="person-circle-outline" size={40} color={colors.textSecondary} />
           </View>
        )}
        <View style={styles.chatInfo}>
            <Text style={styles.participantName} numberOfLines={1}>{item.otherParticipant.displayName}</Text>
            <Text style={styles.lastMessageText} numberOfLines={1}>{item.lastMessage.text}</Text>
        </View>
        <Text style={styles.timestamp}>{formatTimestamp(item.lastMessage.createdAt)}</Text>
      </TouchableOpacity>
    );
  };

  // --- Styles ---
  const styles = useMemo(() => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    errorText: { color: colors.error, fontSize: 16, textAlign: 'center' },
    listContainer: { paddingTop: 10 },
    emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: colors.textSecondary },
    chatItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
    avatarImage: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
    chatInfo: { flex: 1, justifyContent: 'center' },
    participantName: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 4 },
    lastMessageText: { fontSize: 14, color: colors.textSecondary },
    timestamp: { fontSize: 12, color: colors.textSecondary, marginLeft: 10 },
  }), [colors]);

  if (loading && chats.length === 0) {
    return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
  }

  if (error) {
    return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text></SafeAreaView>;
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
        renderItem={renderChatItem}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={styles.emptyText}>You have no active chats yet.</Text>}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primaryTeal} colors={[colors.primaryTeal]} />}
      />
    </View>
  );
};

export default ChatListScreen;
