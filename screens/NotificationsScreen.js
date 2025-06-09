// screens/NotificationsScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import {
    collection,
    doc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp // For updating 'readAt' or 'lastInteracted'
    ,
    updateDoc
} from 'firebase/firestore';
import { useCallback, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    RefreshControl,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { auth, firestore } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

const NotificationsScreen = () => {
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();
    const currentUser = auth.currentUser;

    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchNotifications = useCallback(() => {
        if (!currentUser || !firestore) {
            setError("User not logged in or Firestore not available.");
            setNotifications([]);
            setLoading(false);
            setIsRefreshing(false);
            return () => {}; // Return empty cleanup
        }

        setLoading(true);
        setError(null);
        console.log(`[NotificationsScreen] Fetching notifications for user: ${currentUser.uid}`);

        const notificationsRef = collection(firestore, 'users', currentUser.uid, 'notifications');
        const q = query(notificationsRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedNotifications = [];
            snapshot.forEach((doc) => {
                fetchedNotifications.push({ id: doc.id, ...doc.data() });
            });
            setNotifications(fetchedNotifications);
            setLoading(false);
            setIsRefreshing(false);
            console.log(`[NotificationsScreen] Fetched ${fetchedNotifications.length} notifications.`);
        }, (err) => {
            console.error("[NotificationsScreen] Error fetching notifications:", err);
            setError("Failed to load notifications. " + err.message);
            setLoading(false);
            setIsRefreshing(false);
        });

        return unsubscribe;
    }, [currentUser]);

    useFocusEffect(
        useCallback(() => {
            const unsubscribe = fetchNotifications();
            return () => unsubscribe();
        }, [fetchNotifications])
    );

    const onRefresh = useCallback(() => {
        console.log("[NotificationsScreen] Refreshing notifications...");
        setIsRefreshing(true);
        fetchNotifications(); // fetchNotifications will set isRefreshing to false
    }, [fetchNotifications]);


    const handleNotificationPress = async (notification) => {
        if (!currentUser || !notification || !notification.id) return;

        console.log("[NotificationsScreen] Notification pressed:", notification);

        // 1. Mark as read in Firestore (if not already read)
        if (!notification.isRead) {
            const notificationRef = doc(firestore, 'users', currentUser.uid, 'notifications', notification.id);
            try {
                await updateDoc(notificationRef, {
                    isRead: true,
                    readAt: serverTimestamp() // Optionally store when it was read
                });
                console.log(`[NotificationsScreen] Marked notification ${notification.id} as read.`);
            } catch (err) {
                console.error("[NotificationsScreen] Error marking notification as read:", err);
                // Proceed with navigation even if marking as read fails
            }
        }

        // 2. Navigate based on notification data
        const notificationData = notification.data; // This is the 'data' field from the push notification
        if (notificationData) {
            if (notificationData.type === 'private_message' && notificationData.chatId && notificationData.senderId) {
                navigation.navigate('PrivateChat', {
                    recipientId: notificationData.senderId, // The sender of the message is the recipient in chat
                    recipientName: notificationData.senderName || "Chat",
                    // chatId: notificationData.chatId // Optional, PrivateChatScreen can derive it
                });
            } else if (notificationData.type === 'new_offer' && notificationData.productId) {
                navigation.navigate('Details', {
                    productId: notificationData.productId,
                    // highlightOfferId: notificationData.offerId // Optional
                });
            } else if ((notificationData.type === 'offer_accepted' || notificationData.type === 'offer_rejected') && notificationData.productId) {
                 navigation.navigate('Details', {
                    productId: notificationData.productId,
                    // offerStatusUpdate: notificationData.type // Optional
                });
            }
            // Add more navigation logic for other notification types here
            else {
                console.log("[NotificationsScreen] Unknown notification type or missing data for navigation:", notificationData.type);
            }
        } else {
            console.log("[NotificationsScreen] No navigation data found in notification:", notification.id);
        }
    };

    const renderNotificationItem = ({ item }) => {
        const createdAtDate = item.createdAt?.toDate ? item.createdAt.toDate() : null;
        const timeString = createdAtDate ? createdAtDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const dateString = createdAtDate ? createdAtDate.toLocaleDateString() : 'Date unknown';

        return (
            <TouchableOpacity
                style={[styles.notificationItem, !item.isRead && styles.unreadNotification]}
                onPress={() => handleNotificationPress(item)}
            >
                <View style={styles.notificationIconContainer}>
                    <Ionicons
                        name={
                            item.data?.type === 'private_message' ? 'chatbubbles-outline' :
                            item.data?.type === 'new_offer' ? 'pricetag-outline' :
                            item.data?.type === 'offer_accepted' ? 'checkmark-circle-outline' :
                            item.data?.type === 'offer_rejected' ? 'close-circle-outline' :
                            'notifications-outline' // Default icon
                        }
                        size={28}
                        color={!item.isRead ? colors.primaryTeal : colors.textSecondary}
                    />
                </View>
                <View style={styles.notificationContent}>
                    <Text style={[styles.notificationTitle, !item.isRead && styles.unreadText]} numberOfLines={1}>
                        {item.title || 'Notification'}
                    </Text>
                    <Text style={[styles.notificationBody, !item.isRead && styles.unreadText]} numberOfLines={2}>
                        {item.body || 'You have a new update.'}
                    </Text>
                    <Text style={styles.notificationTimestamp}>
                        {dateString} at {timeString}
                    </Text>
                </View>
                {!item.isRead && <View style={styles.unreadDot} />}
            </TouchableOpacity>
        );
    };

    const styles = useMemo(() => StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        centered: {
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 20,
            backgroundColor: colors.background,
        },
        errorText: {
            color: colors.error,
            fontSize: 16,
            textAlign: 'center',
        },
        emptyText: {
            textAlign: 'center',
            marginTop: 50,
            fontSize: 16,
            color: colors.textSecondary,
        },
        listContainer: {
            paddingVertical: 10,
        },
        notificationItem: {
            flexDirection: 'row',
            paddingVertical: 12,
            paddingHorizontal: 15,
            backgroundColor: colors.surface,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
            alignItems: 'center',
        },
        unreadNotification: {
            backgroundColor: isDarkMode ? colors.surface : colors.primaryTeal + '15', // Slight tint for unread
        },
        unreadText: {
            // fontWeight: 'bold', // Optional: make text bold for unread
            color: colors.textPrimary,
        },
        notificationIconContainer: {
            marginRight: 15,
            width: 40, // Fixed width for alignment
            alignItems: 'center',
        },
        notificationContent: {
            flex: 1,
        },
        notificationTitle: {
            fontSize: 15,
            fontWeight: '600',
            color: colors.textPrimary,
            marginBottom: 3,
        },
        notificationBody: {
            fontSize: 13,
            color: colors.textSecondary,
            lineHeight: 18,
            marginBottom: 5,
        },
        notificationTimestamp: {
            fontSize: 11,
            color: colors.textDisabled,
        },
        unreadDot: {
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: colors.primaryTeal,
            marginLeft: 10,
        },
    }), [colors, isDarkMode]);

    if (loading && notifications.length === 0) {
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
    }

    if (error) {
        return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text></SafeAreaView>;
    }

    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={notifications}
                renderItem={renderNotificationItem}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={<Text style={styles.emptyText}>You have no notifications yet.</Text>}
                contentContainerStyle={styles.listContainer}
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primaryTeal} // For iOS
                        colors={[colors.primaryTeal]} // For Android
                    />
                }
            />
        </SafeAreaView>
    );
};

export default NotificationsScreen;
