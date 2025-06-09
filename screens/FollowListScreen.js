// screens/FollowListScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
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
import { firestore } from '../firebaseConfig'; // Assuming auth is not directly needed here unless for current user context
import { useTheme } from '../src/ThemeContext';

const FollowListScreen = () => {
    const navigation = useNavigation();
    const route = useRoute();
    const { colors, isDarkMode } = useTheme();

    const { userId, listType, userName } // userId of the person whose list we are viewing
        = route.params || {};

    const [userList, setUserList] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        const titleName = userName || "User";
        if (listType === 'followers') {
            navigation.setOptions({ title: `${titleName}'s Followers` });
        } else if (listType === 'following') {
            navigation.setOptions({ title: `${titleName} is Following` });
        } else {
            navigation.setOptions({ title: 'User List' });
        }
    }, [navigation, listType, userName]);

    const fetchUserList = useCallback(() => {
        if (!userId || !listType || !firestore) {
            setError("Required information (userId or listType) is missing or Firestore is unavailable.");
            setUserList([]);
            setLoading(false);
            setIsRefreshing(false);
            return () => {};
        }

        setLoading(true);
        setError(null);
        console.log(`[FollowListScreen] Fetching ${listType} for user: ${userId}`);

        const listCollectionRef = collection(firestore, 'users', userId, listType);
        // Assuming 'followedAt' or 'createdAt' field exists for ordering
        const q = query(listCollectionRef, orderBy('followedAt', 'desc')); // Or 'createdAt'

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedUsers = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                // Construct user object based on denormalized data
                // For 'followers' list, the doc.id is the follower's UID
                // For 'following' list, the doc.id is the UID of the user being followed
                let userData = {
                    id: doc.id, // This is the UID of the user in the list item
                    displayName: 'Unknown User',
                    avatarUrl: null,
                };

                if (listType === 'followers') {
                    userData.displayName = data.followerName || 'Follower';
                    userData.avatarUrl = data.followerAvatar || null;
                } else if (listType === 'following') {
                    userData.displayName = data.userName || 'Following'; // Assuming 'userName' was stored
                    userData.avatarUrl = data.userAvatar || null; // Assuming 'userAvatar' was stored
                }
                fetchedUsers.push(userData);
            });
            setUserList(fetchedUsers);
            setLoading(false);
            setIsRefreshing(false);
            console.log(`[FollowListScreen] Fetched ${fetchedUsers.length} users for ${listType}.`);
        }, (err) => {
            console.error(`[FollowListScreen] Error fetching ${listType}:`, err);
            setError(`Failed to load ${listType} list. ` + err.message);
            setLoading(false);
            setIsRefreshing(false);
        });

        return unsubscribe;
    }, [userId, listType]);

    useFocusEffect(
        useCallback(() => {
            const unsubscribe = fetchUserList();
            return () => unsubscribe();
        }, [fetchUserList])
    );

    const onRefresh = useCallback(() => {
        console.log(`[FollowListScreen] Refreshing ${listType} list...`);
        setIsRefreshing(true);
        fetchUserList();
    }, [fetchUserList]);

    const handleUserPress = (itemUserId, itemUserName) => {
        // Navigate to the UserProfileScreen of the tapped user
        navigation.push('UserProfile', { // Use push to allow navigating to multiple profiles
            userId: itemUserId,
            userName: itemUserName || 'User Profile'
        });
    };

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
        userItem: {
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 12,
            paddingHorizontal: 15,
            backgroundColor: colors.surface,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border,
        },
        avatarImage: {
            width: 44,
            height: 44,
            borderRadius: 22,
            marginRight: 15,
            backgroundColor: colors.border,
        },
        userNameText: {
            flex: 1,
            fontSize: 16,
            fontWeight: '500',
            color: colors.textPrimary,
        },
    }), [colors, isDarkMode]);

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
                refreshControl={
                    <RefreshControl
                        refreshing={isRefreshing}
                        onRefresh={onRefresh}
                        tintColor={colors.primaryTeal}
                        colors={[colors.primaryTeal]}
                    />
                }
            />
        </SafeAreaView>
    );
};

export default FollowListScreen;
