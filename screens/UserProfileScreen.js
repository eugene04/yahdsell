// screens/UserProfileScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';

// 1. Import the new firebase modules
import { auth, firestore, storage } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

// --- Helper Component ---
const StarRating = ({ rating = 0, size = 18, style, color }) => {
    const filledStars = Math.round(rating);
    const starColor = color || '#fadb14';
    return (
        <View style={[{ flexDirection: 'row' }, style]}>
            {[...Array(5)].map((_, index) => (
                <Text key={index} style={{ color: index < filledStars ? starColor : '#d9d9d9', fontSize: size, marginRight: 1 }}>★</Text>
            ))}
        </View>
    );
};

const UserProfileScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();

    // 2. Use new auth syntax
    const loggedInUser = auth().currentUser;
    const userIdToShow = route.params?.userId || loggedInUser?.uid;
    const isOwnProfile = loggedInUser?.uid === userIdToShow;

    // --- State Management ---
    const [profileUser, setProfileUser] = useState(null);
    const [userProducts, setUserProducts] = useState([]);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [loadingFollowAction, setLoadingFollowAction] = useState(false);
    const [followerCount, setFollowerCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [wishlistIds, setWishlistIds] = useState(new Set());

    // --- Data Fetching and Side Effects ---
    useEffect(() => {
        const title = isOwnProfile ? 'My Profile' : profileUser?.displayName || route.params?.userName || 'User Profile';
        navigation.setOptions({ title });
    }, [profileUser, navigation, isOwnProfile, route.params?.userName]);
    
    useFocusEffect(
        useCallback(() => {
            if (!userIdToShow) {
                setLoadingProfile(false);
                setLoadingProducts(false);
                return;
            }

            // 3. Update Firestore listeners with new syntax
            const unsubscribeProfile = firestore().collection('users').doc(userIdToShow).onSnapshot(doc => {
                setProfileUser(doc.exists ? { uid: doc.id, ...doc.data() } : null);
                if (loadingProfile) setLoadingProfile(false);
            });

            const productsQuery = firestore().collection('products').where('sellerId', '==', userIdToShow).orderBy('createdAt', 'desc');
            const unsubscribeProducts = productsQuery.onSnapshot(q => {
                setUserProducts(q.docs.map(d => ({ id: d.id, ...d.data() })));
                if (loadingProducts) setLoadingProducts(false);
            });

            const unsubscribeFollowers = firestore().collection('users').doc(userIdToShow).collection('followers').onSnapshot(s => setFollowerCount(s.size));
            const unsubscribeFollowing = firestore().collection('users').doc(userIdToShow).collection('following').onSnapshot(s => setFollowingCount(s.size));
            
            let unsubscribeFollowStatus = () => {};
            if (loggedInUser && !isOwnProfile) {
                unsubscribeFollowStatus = firestore().collection('users').doc(loggedInUser.uid).collection('following').doc(userIdToShow).onSnapshot(d => setIsFollowing(d.exists));
            }

            let unsubscribeWishlist = () => {};
            if (loggedInUser) {
                unsubscribeWishlist = firestore().collection('users').doc(loggedInUser.uid).collection('wishlist').onSnapshot(s => setWishlistIds(new Set(s.docs.map(d => d.id))));
            }

            return () => {
                unsubscribeProfile();
                unsubscribeProducts();
                unsubscribeFollowers();
                unsubscribeFollowing();
                unsubscribeFollowStatus();
                unsubscribeWishlist();
            };
        }, [userIdToShow, loggedInUser, isOwnProfile, loadingProfile, loadingProducts])
    );
    
    // --- Handlers ---
    const handleFollowToggle = async () => {
        if (!loggedInUser) { Alert.alert("Login Required"); return; }
        setLoadingFollowAction(true);

        const batch = firestore().batch();
        const currentUserFollowingRef = firestore().collection('users').doc(loggedInUser.uid).collection('following').doc(userIdToShow);
        const targetUserFollowersRef = firestore().collection('users').doc(userIdToShow).collection('followers').doc(loggedInUser.uid);

        try {
            if (isFollowing) {
                batch.delete(currentUserFollowingRef);
                batch.delete(targetUserFollowersRef);
            } else {
                const timestamp = firestore.FieldValue.serverTimestamp();
                batch.set(currentUserFollowingRef, { followedAt: timestamp, userName: profileUser.displayName, userAvatar: profileUser.profilePicUrl });
                batch.set(targetUserFollowersRef, { followedAt: timestamp, followerName: loggedInUser.displayName, followerAvatar: loggedInUser.photoURL });
            }
            await batch.commit();
        } catch (err) {
            Toast.show({ type: 'error', text1: 'Action Failed' });
        } finally {
            setLoadingFollowAction(false);
        }
    };
    
    const handleDeleteItem = (productId, imageStoragePaths = []) => {
        Alert.alert("Delete Item", "Are you sure?", [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: async () => {
                try {
                    await firestore().collection('products').doc(productId).delete();
                    await Promise.all(imageStoragePaths.map(path => path ? storage().ref(path).delete().catch(() => {}) : null));
                    Toast.show({ type: 'success', text1: 'Listing Deleted' });
                } catch (error) { Alert.alert("Deletion Failed"); }
            }},
        ]);
    };

    const renderProductItem = ({ item }) => {
        const isSaved = wishlistIds.has(item.id);
        return (
            <View style={styles.productItemContainer}>
                <TouchableOpacity style={styles.productItemTouchable} onPress={() => navigation.push('Details', { productId: item.id })}>
                    <Image source={{ uri: item.imageUrl || 'https://placehold.co/150x150/e0e0e0/7f7f7f?text=No+Image' }} style={styles.productImage} />
                    <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.productPrice}>${item.price?.toFixed(2)}</Text>
                    {item.isSold && <View style={styles.soldBadge}><Text style={styles.soldBadgeText}>SOLD</Text></View>}
                </TouchableOpacity>
                {isOwnProfile ? (
                    <View style={styles.actionButtonsContainer}>
                        <TouchableOpacity style={styles.iconButtonSmall} onPress={() => navigation.navigate('EditProduct', { productId: item.id })}><Ionicons name="pencil-outline" size={18} color={colors.primaryTeal} /></TouchableOpacity>
                        <TouchableOpacity style={styles.iconButtonSmall} onPress={() => handleDeleteItem(item.id, item.imageStoragePaths)}><Ionicons name="trash-bin-outline" size={18} color={colors.error} /></TouchableOpacity>
                    </View>
                ) : null}
            </View>
        );
    };
    
    // --- Styles and Render Logic ---
    const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);
    
    if (loadingProfile) {
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
    }
    if (!profileUser) {
        return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>User profile not found.</Text></SafeAreaView>;
    }

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            <FlatList
                data={userProducts}
                renderItem={renderProductItem}
                keyExtractor={(item) => item.id}
                numColumns={2}
                contentContainerStyle={styles.listContainer}
                ListHeaderComponent={
                    <View style={styles.profileHeaderContainer}>
                        <View style={styles.profileInfoSection}>
                            <Image source={{ uri: profileUser.profilePicUrl || 'https://placehold.co/80x80/E0E0E0/7F7F7F?text=User' }} style={styles.profileAvatarImage} />
                            <View style={styles.profileTextInfo}>
                                <Text style={styles.profileName}>{profileUser.displayName}</Text>
                                {profileUser.bio ? <Text style={styles.profileBio}>{profileUser.bio}</Text> : (isOwnProfile && <Text style={styles.profileBioMuted}>No bio yet. Tap "Edit Profile" to add one.</Text>)}
                            </View>
                        </View>
                        <View style={styles.followStatsContainer}>
                            <TouchableOpacity onPress={() => navigation.navigate('FollowListScreen', { userId: userIdToShow, listType: 'followers', userName: profileUser.displayName })} style={styles.followStatItem}>
                                <Text style={styles.followStatCount}>{followerCount}</Text><Text style={styles.followStatLabel}>Followers</Text>
                            </TouchableOpacity>
                            <View style={styles.statsDivider} />
                            <TouchableOpacity onPress={() => navigation.navigate('FollowListScreen', { userId: userIdToShow, listType: 'following', userName: profileUser.displayName })} style={styles.followStatItem}>
                                <Text style={styles.followStatCount}>{followingCount}</Text><Text style={styles.followStatLabel}>Following</Text>
                            </TouchableOpacity>
                        </View>
                        {isOwnProfile ? (
                            <TouchableOpacity onPress={() => navigation.navigate('EditProfile')} style={[styles.profileActionButton, styles.editProfileButton]}>
                                <Ionicons name="create-outline" size={20} color={colors.primaryTeal} style={{marginRight: 8}}/><Text style={styles.editProfileButtonText}>Edit Profile</Text>
                            </TouchableOpacity>
                        ) : loggedInUser && (
                            <TouchableOpacity style={[styles.profileActionButton, isFollowing ? styles.unfollowButtonActive : styles.followButtonActive]} onPress={handleFollowToggle} disabled={loadingFollowAction}>
                                {loadingFollowAction ? <ActivityIndicator size="small" color={isFollowing ? colors.textPrimary : colors.textOnPrimary} /> : (<><Ionicons name={isFollowing ? "person-remove-outline" : "person-add-outline"} size={20} color={isFollowing ? colors.textPrimary : colors.textOnPrimary} style={{marginRight: 8}} /><Text style={[styles.profileActionButtonText, isFollowing ? styles.unfollowButtonText : styles.followButtonText]}>{isFollowing ? 'Unfollow' : 'Follow'}</Text></>)}
                            </TouchableOpacity>
                        )}
                        <View style={styles.listingsHeaderContainer}><Text style={styles.listHeaderTitle}>Listings</Text></View>
                    </View>
                }
                ListEmptyComponent={!loadingProducts && <Text style={styles.emptyListText}>No active listings.</Text>}
            />
            <Toast />
        </SafeAreaView>
    );
};

// --- Styles ---
const themedStyles = (colors, isDarkMode) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorText: { color: colors.error, fontSize: 16 },
    profileHeaderContainer: { alignItems: 'center', backgroundColor: colors.surface, paddingBottom: 20, marginBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    profileInfoSection: { flexDirection: 'row', alignItems: 'center', padding: 20, width: '100%' },
    profileAvatarImage: { width: 80, height: 80, borderRadius: 40, marginRight: 20 },
    profileTextInfo: { flex: 1 },
    profileName: { fontSize: 24, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 6 },
    profileBio: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    profileBioMuted: { fontSize: 14, color: colors.textDisabled, fontStyle: 'italic' },
    followStatsContainer: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingVertical: 15, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
    followStatItem: { alignItems: 'center' },
    statsDivider: { width: 1, backgroundColor: colors.border },
    followStatCount: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary },
    followStatLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
    profileActionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8, width: '90%', marginVertical: 10 },
    editProfileButton: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primaryTeal },
    editProfileButtonText: { color: colors.primaryTeal, fontWeight: '600' },
    followButtonActive: { backgroundColor: colors.primaryTeal },
    unfollowButtonActive: { backgroundColor: colors.border },
    profileActionButtonText: { fontWeight: 'bold' },
    followButtonText: { color: colors.textOnPrimary },
    unfollowButtonText: { color: colors.textPrimary },
    listingsHeaderContainer: { width: '100%', paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border },
    listHeaderTitle: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' },
    listContainer: { paddingHorizontal: 5 },
    productItemContainer: { flex: 1/2, margin: 5, backgroundColor: colors.surface, borderRadius: 8 },
    productItemTouchable: { padding: 10 },
    productImage: { width: '100%', aspectRatio: 1, borderRadius: 4 },
    productName: { marginTop: 8, fontWeight: '600', color: colors.textPrimary },
    productPrice: { marginTop: 4, color: colors.primaryGreen, fontWeight: 'bold' },
    soldBadge: { position: 'absolute', top: 5, left: 5, backgroundColor: 'rgba(0,0,0,0.7)', padding: 4, borderRadius: 4 },
    soldBadgeText: { color: 'white', fontSize: 10 },
    actionButtonsContainer: { position: 'absolute', bottom: 5, right: 5, flexDirection: 'row' },
    iconButtonSmall: { padding: 5, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 15, marginLeft: 5 },
    emptyListText: { textAlign: 'center', marginTop: 30, color: colors.textSecondary },
});

export default UserProfileScreen;
