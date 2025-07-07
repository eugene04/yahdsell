// screens/FollowListScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    RefreshControl,
    SafeAreaView,
    StyleSheet,
    Text,
    TouchableOpacity
} from 'react-native';

// 1. Import the new firebase module
import { firestore } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

const FollowListScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { colors, isDarkMode } = useTheme();

    const { userId, listType, userName } = route.params || {};

    const [userList, setUserList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Set navigation header title
    useEffect(() => {
        const titleName = userName || "User";
        navigation.setOptions({
            title: listType === 'followers' ? `${titleName}'s Followers` : `${titleName} is Following`
        });
    }, [navigation, listType, userName]);

    // --- Fetch User List ---
    const fetchUserList = useCallback(() => {
        if (!userId || !listType) {
            setError("Required information is missing.");
            setLoading(false);
            return () => {};
        }

        setError(null);

        // 2. Update Firestore query syntax
        const listQuery = firestore()
            .collection('users')
            .doc(userId)
            .collection(listType) // 'followers' or 'following'
            .orderBy('followedAt', 'desc');

        const unsubscribe = listQuery.onSnapshot((snapshot) => {
            const fetchedUsers = snapshot.docs.map((doc) => {
                const data = doc.data();
                // The structure of the stored data determines what we extract here.
                // Assuming we store the relevant user's name and avatar in the subcollection document.
                return {
                    id: doc.id, // This is the UID of the user in the list
                    displayName: data.userName || data.followerName || 'User',
                    avatarUrl: data.userAvatar || data.followerAvatar || null,
                };
            });
            setUserList(fetchedUsers);
            if (loading) setLoading(false);
            if (isRefreshing) setIsRefreshing(false);
        }, (err) => {
            console.error(`[FollowListScreen] Error fetching ${listType}:`, err);
            setError(`Failed to load ${listType} list.`);
            setLoading(false);
            setIsRefreshing(false);
        });

        return unsubscribe;
    }, [userId, listType, loading, isRefreshing]);

    useFocusEffect(
        useCallback(() => {
            if (userList.length === 0) setLoading(true);
            const unsubscribe = fetchUserList();
            return () => unsubscribe();
        }, [fetchUserList])
    );

    const onRefresh = useCallback(() => {
        setIsRefreshing(true);
        fetchUserList();
    }, [fetchUserList]);

    const handleUserPress = (itemUserId, itemUserName) => {
        // Use push to allow navigating to multiple profiles from the list
        navigation.push('UserProfile', {
            userId: itemUserId,
            userName: itemUserName || 'User Profile'
        });
    };

    // --- Render Logic ---
    const renderUserItem = ({ item }) => (
        <TouchableOpacity
            style={styles.userItem}
            onPress={() => handleUserPress(item.id, item.displayName)}
        >
            <Image
                source={{ uri: item.avatarUrl || 'https://placehold.co/60x60/E0E0E0/7F7F7F?text=User' }}
                style={styles.avatarImage}
            />
            <Text style={styles.userNameText} numberOfLines={1}>{item.displayName}</Text>
            <Ionicons name="chevron-forward-outline" size={20} color={colors.textSecondary} />
        </TouchableOpacity>
    );

    const styles = useMemo(() => StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
        errorText: { color: colors.error, fontSize: 16, textAlign: 'center' },
        emptyText: { textAlign: 'center', marginTop: 50, fontSize: 16, color: colors.textSecondary },
        listContainer: { paddingVertical: 10 },
        userItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
        avatarImage: { width: 44, height: 44, borderRadius: 22, marginRight: 15, backgroundColor: colors.border },
        userNameText: { flex: 1, fontSize: 16, fontWeight: '500', color: colors.textPrimary },
    }), [colors]);

    if (loading && userList.length === 0) {
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
    }

    if (error) {
        return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text></SafeAreaView>;
    }

    return (
        <SafeAreaView style={styles.container}>
            <FlatList
                data={userList}
                renderItem={renderUserItem}
                keyExtractor={(item) => item.id}
                ListEmptyComponent={
                    <Text style={styles.emptyText}>
                        {listType === 'followers' ? 'No followers yet.' : 'Not following anyone yet.'}
                    </Text>
                }
                contentContainerStyle={styles.listContainer}
                refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primaryTeal} colors={[colors.primaryTeal]} />}
            />
        </SafeAreaView>
    );
};

export default FollowListScreen;
