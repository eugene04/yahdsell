// screens/NotificationsScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
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

// 1. Import the new firebase modules
import { auth, firestore } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

const NotificationsScreen = () => {
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();
    // 2. Use new auth syntax
    const currentUser = auth().currentUser;

    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchNotifications = useCallback(() => {
        if (!currentUser) {
            setError("User not logged in.");
            setNotifications([]);
            setLoading(false);
            setIsRefreshing(false);
            return () => {};
        }

        setError(null);

        // 3. Use new Firestore query syntax
        const notificationsQuery = firestore()
            .collection('users')
            .doc(currentUser.uid)
            .collection('notifications')
            .orderBy('createdAt', 'desc');

        const unsubscribe = notificationsQuery.onSnapshot((snapshot) => {
            const fetchedNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setNotifications(fetchedNotifications);
            if (loading) setLoading(false);
            if (isRefreshing) setIsRefreshing(false);
        }, (err) => {
            console.error("[NotificationsScreen] Error fetching notifications:", err);
            setError("Failed to load notifications.");
            setLoading(false);
            setIsRefreshing(false);
        });

        return unsubscribe;
    }, [currentUser, loading, isRefreshing]);

    useFocusEffect(
        useCallback(() => {
            // Set loading to true only on initial focus
            if (notifications.length === 0) {
                setLoading(true);
            }
            const unsubscribe = fetchNotifications();
            return () => unsubscribe();
        }, [fetchNotifications])
    );

    const onRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchNotifications();
    }, [fetchNotifications]);

    const handleNotificationPress = async (notification) => {
        if (!currentUser || !notification || !notification.id) return;

        // 4. Update Firestore write syntax
        if (!notification.isRead) {
            const notificationRef = firestore()
                .collection('users')
                .doc(currentUser.uid)
                .collection('notifications')
                .doc(notification.id);
            try {
                await notificationRef.update({
                    isRead: true,
                    readAt: firestore.FieldValue.serverTimestamp()
                });
            } catch (err) {
                console.error("Error marking notification as read:", err);
            }
        }

        const notificationData = notification.data;
        if (notificationData) {
            // Navigation logic remains the same
            if (notificationData.type === 'private_message' && notificationData.chatId && notificationData.senderId) {
                navigation.navigate('PrivateChat', {
                    recipientId: notificationData.senderId,
                    recipientName: notificationData.senderName || "Chat",
                });
            } else if (notificationData.type === 'new_offer' && notificationData.productId) {
                navigation.navigate('Details', { productId: notificationData.productId });
            } else if ((notificationData.type === 'offer_accepted' || notificationData.type === 'offer_rejected') && notificationData.productId) {
                 navigation.navigate('Details', { productId: notificationData.productId });
            }
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
                            'notifications-outline'
                        }
                        size={28}
                        color={!item.isRead ? colors.primaryTeal : colors.textSecondary}
                    />
                </View>
                <View style={styles.notificationContent}>
                    <Text style={[styles.notificationTitle, !item.isRead && styles.unreadText]} numberOfLines={1}>{item.title || 'Notification'}</Text>
                    <Text style={[styles.notificationBody, !item.isRead && styles.unreadText]} numberOfLines={2}>{item.body || 'You have a new update.'}</Text>
                    <Text style={styles.notificationTimestamp}>{dateString} at {timeString}</Text>
                </View>
                {!item.isRead && <View style={styles.unreadDot} />}
            </TouchableOpacity>
        );
    };

    // --- Styles ---
    const styles = useMemo(() => StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
        errorText: { color: colors.error, fontSize: 16, textAlign: 'center' },
        emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: colors.textSecondary },
        listContainer: { paddingVertical: 10 },
        notificationItem: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 15, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, alignItems: 'center' },
        unreadNotification: { backgroundColor: isDarkMode ? colors.surface : colors.primaryTeal + '15' },
        unreadText: { color: colors.textPrimary },
        notificationIconContainer: { marginRight: 15, width: 40, alignItems: 'center' },
        notificationContent: { flex: 1 },
        notificationTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary, marginBottom: 3 },
        notificationBody: { fontSize: 13, color: colors.textSecondary, lineHeight: 18, marginBottom: 5 },
        notificationTimestamp: { fontSize: 11, color: colors.textDisabled },
        unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primaryTeal, marginLeft: 10 },
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
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primaryTeal} colors={[colors.primaryTeal]} />}
            />
        </SafeAreaView>
    );
};

export default NotificationsScreen;
