// screens/UserProfileScreen.js (Further UI Enhancements)

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import {
    collection,
    deleteDoc,
    doc, getDoc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    where,
    writeBatch
} from 'firebase/firestore';
import { deleteObject, ref } from 'firebase/storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Image,
    Platform,
    RefreshControl,
    SafeAreaView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Toast from 'react-native-toast-message';
import { auth, firestore, storage } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

// --- Star Rating Component ---
const StarRating = ({ rating = 0, size = 18, style, color }) => {
    const filledStars = Math.round(rating);
    const totalStars = 5;
    const starColor = color || '#fadb14';
    return (
        <View style={[{ flexDirection: 'row' }, style]}>
            {[...Array(totalStars)].map((_, index) => {
                const starNumber = index + 1;
                return (
                    <Text key={starNumber} style={{ color: starNumber <= filledStars ? starColor : '#d9d9d9', fontSize: size, marginRight: 1 }}>
                        ★
                    </Text>
                );
            })}
        </View>
    );
};
// --- End Star Rating ---

const UserProfileScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { colors, isDarkMode } = useTheme();

    const loggedInUser = auth.currentUser;
    const userIdToShow = route.params?.userId || loggedInUser?.uid;
    const isOwnProfile = loggedInUser?.uid === userIdToShow;

    const [profileUser, setProfileUser] = useState(null);
    const [userProducts, setUserProducts] = useState([]);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [loadingProducts, setLoadingProducts] = useState(true);
    const [error, setError] = useState(null);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const [isFollowing, setIsFollowing] = useState(false);
    const [loadingFollowAction, setLoadingFollowAction] = useState(false);
    const [followerCount, setFollowerCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [loadingFollowCounts, setLoadingFollowCounts] = useState(true);

    const [wishlistIds, setWishlistIds] = useState(new Set());
    const [loadingWishlist, setLoadingWishlist] = useState(false);


    useEffect(() => {
        if (profileUser) {
            navigation.setOptions({ title: isOwnProfile ? 'My Profile' : `${profileUser.displayName || 'User'}'s Profile` });
        } else if (route.params?.userName) {
             navigation.setOptions({ title: `${route.params.userName}'s Profile` });
        }
    }, [profileUser, navigation, isOwnProfile, route.params?.userName]);

    const fetchUserProfile = useCallback(async () => {
        if (!userIdToShow) {
            setError("User not identified. Cannot load profile.");
            setLoadingProfile(false); setProfileUser(null); return;
        }
        setLoadingProfile(true); setError(null);
        try {
            const userDocRef = doc(firestore, 'users', userIdToShow);
            const docSnap = await getDoc(userDocRef);
            if (docSnap.exists()) {
                setProfileUser({ uid: docSnap.id, ...docSnap.data() });
            } else {
                setError(`User profile not found.`); setProfileUser(null);
            }
        } catch (err) {
            console.error("[UserProfileScreen] Error fetching profile:", err);
            setError("Failed to load profile. Please try again."); setProfileUser(null);
        } finally {
            setLoadingProfile(false);
        }
    }, [userIdToShow]);

    const fetchUserProducts = useCallback(() => {
        if (!userIdToShow) {
            setUserProducts([]); setLoadingProducts(false); return () => {};
        }
        setLoadingProducts(true);
        const productsRef = collection(firestore, 'products');
        const q = query(productsRef, where('sellerId', '==', userIdToShow), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const productsData = [];
            querySnapshot.forEach((doc) => productsData.push({ id: doc.id, ...doc.data() }));
            setUserProducts(productsData);
            setLoadingProducts(false);
        }, (err) => {
            console.error("[UserProfileScreen] Error fetching user products:", err);
            setError(prevError => prevError ? `${prevError}\nFailed to load listings.` : "Failed to load listings.");
            setUserProducts([]); setLoadingProducts(false);
        });
        return unsubscribe;
    }, [userIdToShow]);

    const fetchFollowData = useCallback(() => {
        if (!userIdToShow) return () => {};
        setLoadingFollowCounts(true);
        let unsubscribeFollowStatus = () => {};
        let unsubscribeFollowers = () => {};
        let unsubscribeFollowingUsers = () => {};

        if (loggedInUser && !isOwnProfile) {
            const followRef = doc(firestore, 'users', loggedInUser.uid, 'following', userIdToShow);
            unsubscribeFollowStatus = onSnapshot(followRef, (docSnap) => {
                setIsFollowing(docSnap.exists());
            }, (err) => console.error("[UserProfileScreen] Error fetching follow status:", err));
        } else {
            setIsFollowing(false);
        }
        const followersRef = collection(firestore, 'users', userIdToShow, 'followers');
        unsubscribeFollowers = onSnapshot(followersRef, (snapshot) => setFollowerCount(snapshot.size),
            (err) => console.error("[UserProfileScreen] Error fetching follower count:", err));
        const followingUsersRef = collection(firestore, 'users', userIdToShow, 'following');
        unsubscribeFollowingUsers = onSnapshot(followingUsersRef, (snapshot) => setFollowingCount(snapshot.size),
            (err) => console.error("[UserProfileScreen] Error fetching following count:", err));
        setLoadingFollowCounts(false);
        return () => { unsubscribeFollowStatus(); unsubscribeFollowers(); unsubscribeFollowingUsers(); };
    }, [userIdToShow, loggedInUser, isOwnProfile]);

    useFocusEffect(
        useCallback(() => {
            if (!loggedInUser) {
                setWishlistIds(new Set()); setLoadingWishlist(false); return () => {};
            }
            setLoadingWishlist(true);
            const wishlistRef = collection(firestore, 'users', loggedInUser.uid, 'wishlist');
            const unsubscribeWishlist = onSnapshot(wishlistRef, (snapshot) => {
                const ids = new Set();
                snapshot.forEach((doc) => ids.add(doc.id));
                setWishlistIds(ids); setLoadingWishlist(false);
            }, (error) => {
                console.error("[UserProfileScreen] Error fetching wishlist:", error);
                Toast.show({ type: 'error', text1: 'Error loading wishlist status' });
                setLoadingWishlist(false);
            });
            return () => unsubscribeWishlist();
        }, [loggedInUser])
    );

    useFocusEffect(
        useCallback(() => {
            let unsubscribeProducts = () => {};
            let unsubscribeFollow = () => {};
            if (userIdToShow) {
                fetchUserProfile();
                unsubscribeProducts = fetchUserProducts();
                unsubscribeFollow = fetchFollowData();
            } else {
                setError("Cannot load profile: User not identified.");
                setLoadingProfile(false); setLoadingProducts(false); setLoadingFollowCounts(false);
                setProfileUser(null); setUserProducts([]);
                setFollowerCount(0); setFollowingCount(0); setIsFollowing(false);
            }
            return () => { unsubscribeProducts(); unsubscribeFollow(); };
        }, [userIdToShow, fetchUserProfile, fetchUserProducts, fetchFollowData])
    );

    const onRefresh = useCallback(() => {
        setIsRefreshing(true); setError(null);
        if (userIdToShow) {
            fetchUserProfile(); fetchUserProducts(); fetchFollowData();
        } else {
            setError("Cannot refresh: User not identified.");
        }
        setIsRefreshing(false);
    }, [userIdToShow, fetchUserProfile, fetchUserProducts, fetchFollowData]);

    const handleFollowToggle = async () => {
        if (!loggedInUser) { Alert.alert("Login Required", "Please log in to follow users."); return; }
        if (!profileUser || isOwnProfile) return;
        setLoadingFollowAction(true);
        const batch = writeBatch(firestore);
        const currentUserFollowingRef = doc(firestore, 'users', loggedInUser.uid, 'following', profileUser.uid);
        const targetUserFollowersRef = doc(firestore, 'users', profileUser.uid, 'followers', loggedInUser.uid);
        try {
            if (isFollowing) {
                batch.delete(currentUserFollowingRef); batch.delete(targetUserFollowersRef);
                await batch.commit(); setIsFollowing(false);
                Toast.show({ type: 'info', text1: `Unfollowed ${profileUser.displayName || 'User'}` });
            } else {
                batch.set(currentUserFollowingRef, { followedAt: serverTimestamp(), userId: profileUser.uid, userName: profileUser.displayName || null, userAvatar: profileUser.profilePicUrl || null });
                batch.set(targetUserFollowersRef, { followerId: loggedInUser.uid, followerName: loggedInUser.displayName || loggedInUser.email || 'Anonymous', followerAvatar: loggedInUser.photoURL || null, followedAt: serverTimestamp() });
                await batch.commit(); setIsFollowing(true);
                Toast.show({ type: 'success', text1: `Now following ${profileUser.displayName || 'User'}!` });
            }
        } catch (err) {
            console.error("[UserProfileScreen] Error during follow/unfollow action:", err);
            Toast.show({ type: 'error', text1: 'Action Failed', text2: err.message });
            setIsFollowing(!isFollowing);
        } finally {
            setLoadingFollowAction(false);
        }
    };

    const handleSaveItem = async (productId) => {
        if (!loggedInUser) { Toast.show({ type: 'error', text1: 'Login Required', text2: 'Please log in to save items.' }); return; }
        if (!productId) return;
        setLoadingWishlist(true);
        const wishlistItemRef = doc(firestore, 'users', loggedInUser.uid, 'wishlist', productId);
        try {
            await setDoc(wishlistItemRef, { savedAt: serverTimestamp() });
            Toast.show({ type: 'success', text1: 'Added to Wishlist!', position: 'bottom', visibilityTime: 2000 });
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Error Saving Item', text2: error.message, position: 'bottom', visibilityTime: 3000 });
        } finally {
            setLoadingWishlist(false);
        }
    };

    const handleUnsaveItem = async (productId) => {
        if (!loggedInUser || !productId) return;
        setLoadingWishlist(true);
        const wishlistItemRef = doc(firestore, 'users', loggedInUser.uid, 'wishlist', productId);
        try {
            await deleteDoc(wishlistItemRef);
            Toast.show({ type: 'info', text1: 'Removed from Wishlist', position: 'bottom', visibilityTime: 2000 });
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Error Removing Item', text2: error.message, position: 'bottom', visibilityTime: 3000 });
        } finally {
            setLoadingWishlist(false);
        }
    };

    const handleDeleteItem = (productId, imageStoragePaths) => {
        if (!loggedInUser || !productId || !isOwnProfile) { Alert.alert("Error", "Not authorized."); return; }
        Alert.alert( "Delete Item", "Are you sure?",
            [ { text: "Cancel", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: async () => {
                    const productDocRef = doc(firestore, 'products', productId);
                    try {
                        await deleteDoc(productDocRef);
                        if (imageStoragePaths && Array.isArray(imageStoragePaths)) {
                            const deletePromises = imageStoragePaths.map(path => {
                                if (path && typeof path === 'string') {
                                    const imageRef = ref(storage, path);
                                    return deleteObject(imageRef).catch(err => {
                                        if (err.code !== 'storage/object-not-found') console.error("Err del storage img:", path, err);
                                    });
                                } return Promise.resolve();
                            });
                            await Promise.all(deletePromises);
                        }
                        Toast.show({ type: 'success', text1: 'Listing Deleted' });
                    } catch (error) { Alert.alert("Deletion Failed", "Could not delete listing."); }
                },
              },
            ], { cancelable: true }
        );
    };

    const handleEditItem = (productId) => {
        if (!isOwnProfile || !productId) return;
        navigation.navigate('EditProduct', { productId: productId });
    };

    const renderProductItem = ({ item }) => {
        const isSavedToWishlist = wishlistIds.has(item.id);
        return (
            <View style={styles.productItemContainer}>
                <TouchableOpacity
                    style={styles.productItemTouchable}
                    onPress={() => navigation.push('Details', { productId: item.id })}
                >
                    <Image source={{ uri: item.imageUrl || 'https://placehold.co/150x150/e0e0e0/7f7f7f?text=No+Image' }} style={styles.productImage} resizeMode="cover" />
                    <Text style={styles.productName} numberOfLines={1}>{item.name || 'No Name'}</Text>
                    <Text style={styles.productPrice}>{typeof item.price === 'number' ? `$${item.price.toFixed(2)}` : 'N/A'}</Text>
                    {item.isSold && (<View style={styles.soldBadge}><Text style={styles.soldBadgeText}>SOLD</Text></View>)}
                </TouchableOpacity>
                {isOwnProfile ? (
                    <View style={styles.actionButtonsContainer}>
                        <TouchableOpacity style={styles.iconButtonSmall} onPress={() => handleEditItem(item.id)}><Ionicons name="pencil-outline" size={18} color={colors.primaryTeal} /></TouchableOpacity>
                        <TouchableOpacity style={styles.iconButtonSmall} onPress={() => handleDeleteItem(item.id, item.imageStoragePaths || (item.imageStoragePath ? [item.imageStoragePath] : []))}><Ionicons name="trash-bin-outline" size={18} color={colors.error} /></TouchableOpacity>
                    </View>
                ) : loggedInUser && !item.isSold && (
                    <TouchableOpacity
                        style={styles.saveButtonOnProduct}
                        onPress={() => isSavedToWishlist ? handleUnsaveItem(item.id) : handleSaveItem(item.id)}
                        disabled={loadingWishlist}
                    >
                        {loadingWishlist && isSavedToWishlist === wishlistIds.has(item.id) ?
                            <ActivityIndicator size="small" color={colors.primaryTeal} /> :
                            <Ionicons name={isSavedToWishlist ? "heart" : "heart-outline"} size={22} color={isSavedToWishlist ? colors.error : colors.textSecondary} />
                        }
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);

    if (loadingProfile && !profileUser) {
        return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /><Text style={styles.loadingText}>Loading Profile...</Text></SafeAreaView>;
    }
    if (error && !profileUser && !loadingProfile) {
        return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text><TouchableOpacity style={styles.buttonSmall} onPress={onRefresh}><Text style={styles.buttonSmallText}>Try Again</Text></TouchableOpacity></SafeAreaView>;
    }
    if (!profileUser && !loadingProfile) {
        return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>User profile could not be loaded.</Text><TouchableOpacity style={styles.buttonSmall} onPress={onRefresh}><Text style={styles.buttonSmallText}>Try Again</Text></TouchableOpacity></SafeAreaView>;
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
                    profileUser && (
                        <View style={styles.profileHeaderContainer}>
                            {/* Profile Info: Avatar, Name, Bio */}
                            <View style={styles.profileInfoSection}>
                                {profileUser.profilePicUrl ? (
                                    <Image source={{ uri: profileUser.profilePicUrl }} style={styles.profileAvatarImage} />
                                ) : (
                                   <View style={styles.profileAvatarPlaceholder}><Text style={styles.profileAvatarInitial}>{profileUser.displayName ? profileUser.displayName.charAt(0).toUpperCase() : (profileUser.email ? profileUser.email.charAt(0).toUpperCase() : '?')}</Text></View>
                                )}
                                <View style={styles.profileTextInfo}>
                                    <Text style={styles.profileName}>{profileUser.displayName || profileUser.email || 'User'}</Text>
                                    {profileUser.bio ? (<Text style={styles.profileBio} numberOfLines={3}>{profileUser.bio}</Text>
                                    ) : ( isOwnProfile && <Text style={styles.profileBioMuted}>No bio yet. Tap "Edit Profile" to add one!</Text> )}
                                </View>
                            </View>

                            {/* Follow Stats */}
                            <View style={styles.followStatsContainer}>
                                <TouchableOpacity onPress={() => navigation.navigate('FollowListScreen', { userId: userIdToShow, listType: 'followers', userName: profileUser.displayName })} style={styles.followStatItem}>
                                    <Text style={styles.followStatCount}>{followerCount}</Text>
                                    <Text style={styles.followStatLabel}>Followers</Text>
                                </TouchableOpacity>
                                <View style={styles.statsDivider} />
                                <TouchableOpacity onPress={() => navigation.navigate('FollowListScreen', { userId: userIdToShow, listType: 'following', userName: profileUser.displayName })} style={styles.followStatItem}>
                                    <Text style={styles.followStatCount}>{followingCount}</Text>
                                    <Text style={styles.followStatLabel}>Following</Text>
                                </TouchableOpacity>
                            </View>

                            {/* Ratings Section */}
                            {(profileUser.ratingCount !== undefined && profileUser.ratingCount > 0) ? (
                                <TouchableOpacity style={styles.ratingSection} onPress={() => navigation.navigate('SellerReviews', { sellerId: userIdToShow, sellerName: profileUser.displayName || 'Seller' })}>
                                    <StarRating rating={profileUser.averageRating || 0} size={20} color={colors.accent || '#FFC107'}/>
                                    <Text style={styles.ratingCountText}>({profileUser.ratingCount} ratings)</Text>
                                    <Ionicons name="chevron-forward-outline" size={18} color={colors.textSecondary} style={styles.ratingChevron} />
                                </TouchableOpacity>
                            ) : ( <Text style={styles.noRatingText}>No ratings yet</Text> )}

                            {/* Action Buttons: Edit Profile or Follow/Unfollow */}
                            {isOwnProfile ? (
                                <TouchableOpacity onPress={() => navigation.navigate('EditProfile')} style={[styles.profileActionButton, styles.editProfileButton]}>
                                    <Ionicons name="create-outline" size={20} color={colors.primaryTeal} style={{marginRight: 8}}/>
                                    <Text style={styles.editProfileButtonText}>Edit Profile</Text>
                                </TouchableOpacity>
                            ) : loggedInUser && profileUser && (
                                <TouchableOpacity
                                    style={[styles.profileActionButton, isFollowing ? styles.unfollowButtonActive : styles.followButtonActive, loadingFollowAction && styles.buttonDisabled]}
                                    onPress={handleFollowToggle}
                                    disabled={loadingFollowAction}
                                >
                                    {loadingFollowAction ? ( <ActivityIndicator size="small" color={isFollowing ? colors.textPrimary : colors.textOnPrimary} />
                                    ) : (
                                        <>
                                            <Ionicons name={isFollowing ? "person-remove-outline" : "person-add-outline"} size={20} color={isFollowing ? colors.textPrimary : colors.textOnPrimary} style={{marginRight: 8}} />
                                            <Text style={[styles.profileActionButtonText, isFollowing ? styles.unfollowButtonText : styles.followButtonText]}>{isFollowing ? 'Unfollow' : 'Follow'}</Text>
                                        </>
                                    )}
                                </TouchableOpacity>
                            )}

                            {/* Listings Header */}
                            <View style={styles.listingsHeaderContainer}>
                                <Text style={styles.listHeaderTitle}>{isOwnProfile ? "Your Active Listings" : `${profileUser.displayName || 'User'}'s Active Listings`}</Text>
                            </View>
                        </View>
                    )
                }
                ListEmptyComponent={ !loadingProducts && userProducts.length === 0 ? ( <Text style={styles.emptyListText}>{isOwnProfile ? "You haven't listed any items yet." : `${profileUser?.displayName || 'This user'} hasn't listed any items.`}</Text>) : null }
                ListFooterComponent={loadingProducts && userProducts.length > 0 ? <ActivityIndicator style={{ marginVertical: 20 }} size="small" color={colors.primaryTeal} /> : null}
                refreshControl={ <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor={colors.primaryTeal} colors={[colors.primaryTeal]} /> }
                extraData={{isOwnProfile, isFollowing, followerCount, followingCount, wishlistIds, loadingWishlist}}
            />
            <Toast />
        </SafeAreaView>
    );
};

const themedStyles = (colors, isDarkMode) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: colors.background },
    loadingText: { marginTop: 10, fontSize: 16, color: colors.textSecondary },
    errorText: { color: colors.error, fontSize: 16, textAlign: 'center', paddingHorizontal: 20, marginBottom: 15, },
    buttonSmall: { backgroundColor: colors.primaryTeal, paddingVertical: 8, paddingHorizontal: 15, borderRadius: 6, marginTop: 10, },
    buttonSmallText: { color: colors.textOnPrimary || '#ffffff', fontSize: 14, fontWeight: 'bold', },

    profileHeaderContainer: {
        alignItems: 'center',
        backgroundColor: colors.surface,
        paddingBottom: 20, // Increased bottom padding
        marginBottom: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    profileInfoSection: {
        flexDirection: 'row',
        alignItems: 'flex-start', // Align items to the top for bio wrapping
        paddingHorizontal: 20,
        paddingTop: Platform.OS === "android" ? 20 : 25,
        marginBottom: 20,
        width: '100%',
    },
    profileAvatarPlaceholder: { width: 80, height: 80, borderRadius: 40, backgroundColor: colors.border, justifyContent: 'center', alignItems: 'center', marginRight: 20, },
    profileAvatarImage: { width: 80, height: 80, borderRadius: 40, marginRight: 20, borderWidth: 2, borderColor: colors.primaryTeal, },
    profileAvatarInitial: { fontSize: 32, fontWeight: 'bold', color: colors.textSecondary, },
    profileTextInfo: { flex: 1, justifyContent: 'center', },
    profileName: { fontSize: 24, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 6, },
    profileBio: { fontSize: 14, color: colors.textSecondary, lineHeight: 20, },
    profileBioMuted: { fontSize: 14, color: colors.textDisabled, fontStyle: 'italic', },

    followStatsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
        paddingVertical: 15,
        backgroundColor: colors.background, // Different background for emphasis
        borderTopWidth: StyleSheet.hairlineWidth,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: colors.border,
        marginBottom: 20,
    },
    followStatItem: { alignItems: 'center', paddingHorizontal: 10, }, // Renamed from followStat
    statsDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border, height: '60%', alignSelf: 'center'},
    followStatCount: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, },
    followStatLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },

    ratingSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingVertical: 10, paddingHorizontal:15, backgroundColor: colors.surface, borderRadius:8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    ratingCountText: { fontSize: 14, color: colors.primaryTeal, marginLeft: 10, fontWeight:'500' },
    ratingChevron: { marginLeft: 'auto', opacity: 0.7},
    noRatingText: { fontSize: 14, color: colors.textSecondary, fontStyle: 'italic', marginBottom: 20, paddingVertical: 10 },

    profileActionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 25, minWidth: 180, width: '80%', alignSelf: 'center', marginTop: 0, marginBottom: 25, borderWidth: 1.5, elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 2, },
    editProfileButton: { borderColor: colors.primaryTeal, backgroundColor: colors.surface, },
    editProfileButtonText: { color: colors.primaryTeal, fontSize: 16, fontWeight: '600' },
    followButtonActive: { backgroundColor: colors.primaryTeal, borderColor: colors.primaryTeal, },
    unfollowButtonActive: { backgroundColor: colors.surfaceLight || colors.border, borderColor: colors.textSecondary, }, // Renamed from unfollowButton
    profileActionButtonText: { fontSize: 16, fontWeight: 'bold'}, // Base for both
    followButtonText: { color: colors.textOnPrimary, }, // Specific for active follow
    unfollowButtonText: { color: colors.textPrimary, }, // Specific for active unfollow
    buttonDisabled: { opacity: 0.6, },

    listingsHeaderContainer: { width: '100%', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.background, },
    listHeaderTitle: { fontSize: 18, fontWeight: '600', color: colors.textPrimary, textAlign: 'center', }, // Renamed from listHeader

    listContainer: { paddingHorizontal: 5, paddingBottom: 20, backgroundColor: colors.background },
    productItemContainer: { flex: 1/2, margin: 5, backgroundColor: colors.surface, borderRadius: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: isDarkMode ? 0.25 : 0.1, shadowRadius: 2.5, elevation: 2, position: 'relative', overflow: 'hidden'},
    productItemTouchable: { padding: 10, alignItems: 'center', flex: 1, justifyContent: 'space-between', },
    productImage: { width: '100%', aspectRatio: 1, borderRadius: 4, marginBottom: 8, backgroundColor: colors.border },
    productName: { fontSize: 14, fontWeight: '600', textAlign: 'center', color: colors.textPrimary, marginBottom: 4, minHeight: 36, },
    productPrice: { fontSize: 14, color: colors.primaryGreen, fontWeight: 'bold', marginTop: 4, },
    soldBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, zIndex: 1, },
    soldBadgeText: { color: '#ffffff', fontSize: 10, fontWeight: 'bold', },
    actionButtonsContainer: { position: 'absolute', bottom: 5, right: 5, flexDirection: 'row', zIndex: 1, backgroundColor: isDarkMode ? 'rgba(30,30,30,0.7)' : 'rgba(255,255,255,0.7)', borderRadius: 15, paddingVertical:2, paddingHorizontal:3 },
    iconButtonSmall: { padding: 5, },
    emptyListText: { textAlign: 'center', marginTop: 30, fontSize: 16, color: colors.textSecondary, paddingHorizontal: 20, },
    saveButtonOnProduct: { position: 'absolute', top: 8, right: 8, zIndex: 2, padding: 6, backgroundColor: isDarkMode ? 'rgba(40,40,40,0.75)' : 'rgba(255,255,255,0.75)', borderRadius: 18, },
});

export default UserProfileScreen;
