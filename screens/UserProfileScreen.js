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

import { auth, firestore } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

// --- Helper Component for Star Ratings ---
const StarRating = ({ rating = 0, size = 18, style, color }) => {
  const filledStars = Math.round(rating);
  const starColor = color || '#fadb14';
  return (
    <View style={[{ flexDirection: 'row' }, style]}>
      {[...Array(5)].map((_, index) => (
        <Ionicons
          key={index}
          name="star"
          size={size}
          color={index < filledStars ? starColor : '#d9d9d9'}
          style={{ marginRight: 2 }}
        />
      ))}
    </View>
  );
};

const UserProfileScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { colors, isDarkMode } = useTheme();

  const loggedInUser = auth().currentUser;
  const userIdToShow = route.params?.userId || loggedInUser?.uid;
  const isOwnProfile = loggedInUser?.uid === userIdToShow;

  // --- State Management ---
  const [profileUser, setProfileUser] = useState(null);
  const [userProducts, setUserProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loadingFollowAction, setLoadingFollowAction] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [activeTab, setActiveTab] = useState('active'); // 'active' or 'sold'

  // --- Data Fetching and Side Effects ---
  useEffect(() => {
    const title = isOwnProfile ? 'My Profile' : profileUser?.displayName || route.params?.userName || 'User Profile';
    navigation.setOptions({ title });
  }, [profileUser, navigation, isOwnProfile, route.params?.userName]);

  useFocusEffect(
    useCallback(() => {
      if (!userIdToShow) {
        setLoading(false);
        return;
      }

      const unsubscribeProfile = firestore().collection('users').doc(userIdToShow).onSnapshot(doc => {
        setProfileUser(doc.exists ? { uid: doc.id, ...doc.data() } : null);
        if (loading) setLoading(false);
      });

      const productsQuery = firestore().collection('products').where('sellerId', '==', userIdToShow).orderBy('createdAt', 'desc');
      const unsubscribeProducts = productsQuery.onSnapshot(q => {
        setUserProducts(q.docs.map(d => ({ id: d.id, ...d.data() })));
      });

      const unsubscribeFollowers = firestore().collection('users').doc(userIdToShow).collection('followers').onSnapshot(s => setFollowerCount(s.size));
      const unsubscribeFollowing = firestore().collection('users').doc(userIdToShow).collection('following').onSnapshot(s => setFollowingCount(s.size));
      
      let unsubscribeFollowStatus = () => {};
      if (loggedInUser && !isOwnProfile) {
        unsubscribeFollowStatus = firestore().collection('users').doc(loggedInUser.uid).collection('following').doc(userIdToShow).onSnapshot(d => setIsFollowing(d.exists));
      }

      return () => {
        unsubscribeProfile();
        unsubscribeProducts();
        unsubscribeFollowers();
        unsubscribeFollowing();
        unsubscribeFollowStatus();
      };
    }, [userIdToShow, loggedInUser, isOwnProfile, loading])
  );

  // --- Filtered Products Memoization ---
  const filteredProducts = useMemo(() => {
    if (activeTab === 'active') {
      return userProducts.filter(p => !p.isSold);
    }
    return userProducts.filter(p => p.isSold);
  }, [userProducts, activeTab]);

  // --- Handlers ---
  const handleFollowToggle = async () => {
    if (!loggedInUser) {
      Alert.alert("Login Required", "You must be logged in to follow users.");
      return;
    }
    setLoadingFollowAction(true);

    // --- OPTIMISTIC UI UPDATE ---
    const previousFollowState = isFollowing;
    setIsFollowing(!previousFollowState); // Immediately update the UI

    const batch = firestore().batch();
    const currentUserFollowingRef = firestore().collection('users').doc(loggedInUser.uid).collection('following').doc(userIdToShow);
    const targetUserFollowersRef = firestore().collection('users').doc(userIdToShow).collection('followers').doc(loggedInUser.uid);

    try {
      if (previousFollowState) { // If the user was following, now unfollow
        batch.delete(currentUserFollowingRef);
        batch.delete(targetUserFollowersRef);
      } else { // If the user was not following, now follow
        const timestamp = firestore.FieldValue.serverTimestamp();
        batch.set(currentUserFollowingRef, {
          followedAt: timestamp,
          userName: profileUser?.displayName || 'User',
          userAvatar: profileUser?.profilePicUrl || null,
        });
        batch.set(targetUserFollowersRef, {
          followedAt: timestamp,
          followerName: loggedInUser.displayName || 'User',
          followerAvatar: loggedInUser.photoURL || null,
        });
      }
      await batch.commit();
    } catch (err) {
      // --- REVERT ON ERROR ---
      setIsFollowing(previousFollowState); // Revert the UI state if the server call fails
      console.error("Follow/Unfollow Error:", err);
      Toast.show({ type: 'error', text1: 'Action Failed', text2: 'Please try again.' });
    } finally {
      setLoadingFollowAction(false);
    }
  };


  const handleMessage = () => {
    if (!loggedInUser) {
        Alert.alert("Login Required", "You must be logged in to message users.");
        return;
    }
    navigation.navigate('PrivateChat', {
        recipientId: userIdToShow,
        recipientName: profileUser?.displayName || 'User',
        recipientAvatar: profileUser?.profilePicUrl || null,
    });
  };

  const renderProductItem = ({ item }) => (
    <TouchableOpacity style={styles.productItemContainer} onPress={() => navigation.push('Details', { productId: item.id })}>
      <Image source={{ uri: item.imageUrl || 'https://placehold.co/200x200/e0e0e0/7f7f7f?text=No+Image' }} style={styles.productImage} />
      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.productPrice}>${item.price?.toFixed(2)}</Text>
      </View>
      {item.isSold && <View style={styles.soldBadge}><Text style={styles.soldBadgeText}>SOLD</Text></View>}
    </TouchableOpacity>
  );

  const styles = useMemo(() => themedStyles(colors, isDarkMode), [colors, isDarkMode]);

  if (loading) {
    return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
  }

  if (!profileUser) {
    return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>User profile not found.</Text></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <FlatList
        data={filteredProducts}
        renderItem={renderProductItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContainer}
        ListHeaderComponent={
          <>
            <View style={styles.headerContainer}>
              <Image source={{ uri: profileUser.profilePicUrl || 'https://placehold.co/100x100/E0E0E0/7F7F7F?text=User' }} style={styles.avatar} />
              <Text style={styles.displayName}>{profileUser.displayName}</Text>
              <Text style={styles.joinDate}>Joined on {profileUser.createdAt?.toDate().toLocaleDateString() || 'N/A'}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('SellerReviews', { sellerId: userIdToShow, sellerName: profileUser.displayName })}>
                <View style={styles.ratingContainer}>
                  <StarRating rating={profileUser.averageRating || 0} />
                  <Text style={styles.ratingText}>({profileUser.ratingCount || 0} reviews)</Text>
                </View>
              </TouchableOpacity>
              {profileUser.bio ? <Text style={styles.bio}>{profileUser.bio}</Text> : (isOwnProfile && <Text style={styles.bioMuted}>No bio yet. Tap Edit Profile to add one.</Text>)}
            </View>

            <View style={styles.statsContainer}>
              <View style={styles.statItem}><Text style={styles.statCount}>{userProducts.length}</Text><Text style={styles.statLabel}>Listings</Text></View>
              <TouchableOpacity onPress={() => navigation.navigate('FollowListScreen', { userId: userIdToShow, listType: 'followers', userName: profileUser.displayName })} style={styles.statItem}><Text style={styles.statCount}>{followerCount}</Text><Text style={styles.statLabel}>Followers</Text></TouchableOpacity>
              <TouchableOpacity onPress={() => navigation.navigate('FollowListScreen', { userId: userIdToShow, listType: 'following', userName: profileUser.displayName })} style={styles.statItem}><Text style={styles.statCount}>{followingCount}</Text><Text style={styles.statLabel}>Following</Text></TouchableOpacity>
            </View>

            <View style={styles.actionButtonsContainer}>
              {isOwnProfile ? (
                <TouchableOpacity style={[styles.actionButton, styles.editButton]} onPress={() => navigation.navigate('EditProfile')}>
                  <Ionicons name="pencil-outline" size={20} color={colors.primaryTeal} />
                  <Text style={[styles.actionButtonText, styles.editButtonText]}>Edit Profile</Text>
                </TouchableOpacity>
              ) : (
                <>
                  <TouchableOpacity style={[styles.actionButton, isFollowing ? styles.secondaryButton : styles.primaryButton]} onPress={handleFollowToggle} disabled={loadingFollowAction}>
                    {loadingFollowAction ? <ActivityIndicator size="small" color={isFollowing ? colors.primaryTeal : colors.textOnPrimary} /> : <Ionicons name={isFollowing ? "checkmark-done" : "person-add-outline"} size={20} color={isFollowing ? colors.primaryTeal : colors.textOnPrimary} />}
                    <Text style={[styles.actionButtonText, isFollowing ? styles.secondaryButtonText : styles.primaryButtonText]}>{isFollowing ? 'Following' : 'Follow'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionButton, styles.secondaryButton]} onPress={handleMessage}>
                    <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.primaryTeal} />
                    <Text style={[styles.actionButtonText, styles.secondaryButtonText]}>Message</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            
            <View style={styles.tabContainer}>
                <TouchableOpacity style={[styles.tab, activeTab === 'active' && styles.activeTab]} onPress={() => setActiveTab('active')}>
                    <Text style={[styles.tabText, activeTab === 'active' && styles.activeTabText]}>Active</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tab, activeTab === 'sold' && styles.activeTab]} onPress={() => setActiveTab('sold')}>
                    <Text style={[styles.tabText, activeTab === 'sold' && styles.activeTabText]}>Sold</Text>
                </TouchableOpacity>
            </View>
          </>
        }
        ListEmptyComponent={
            <View style={styles.emptyContainer}>
                <Ionicons name="file-tray-outline" size={48} color={colors.textDisabled} />
                <Text style={styles.emptyText}>No {activeTab} listings yet.</Text>
            </View>
        }
      />
    </SafeAreaView>
  );
};

const themedStyles = (colors, isDarkMode) => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorText: { color: colors.error, fontSize: 16 },
    headerContainer: { alignItems: 'center', padding: 20, backgroundColor: colors.surface },
    avatar: { width: 100, height: 100, borderRadius: 50, marginBottom: 12, borderWidth: 3, borderColor: colors.primaryTeal },
    displayName: { fontSize: 24, fontWeight: 'bold', color: colors.textPrimary },
    joinDate: { fontSize: 13, color: colors.textSecondary, marginTop: 4, marginBottom: 10 },
    ratingContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
    ratingText: { marginLeft: 8, color: colors.textSecondary, fontSize: 14 },
    bio: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', marginHorizontal: 15, marginBottom: 15 },
    bioMuted: { fontStyle: 'italic', color: colors.textDisabled },
    statsContainer: { flexDirection: 'row', justifyContent: 'space-around', width: '100%', paddingVertical: 15, backgroundColor: colors.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
    statItem: { alignItems: 'center', flex: 1 },
    statCount: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary },
    statLabel: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
    actionButtonsContainer: { flexDirection: 'row', padding: 15, backgroundColor: colors.surface, width: '100%', justifyContent: 'space-around' },
    actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 8, marginHorizontal: 5 },
    actionButtonText: { fontSize: 16, fontWeight: 'bold', marginLeft: 8 },
    primaryButton: { backgroundColor: colors.primaryTeal },
    primaryButtonText: { color: colors.textOnPrimary },
    secondaryButton: { borderWidth: 1, borderColor: colors.primaryTeal, backgroundColor: 'transparent' },
    secondaryButtonText: { color: colors.primaryTeal },
    editButton: { borderWidth: 1, borderColor: colors.primaryTeal },
    editButtonText: { color: colors.primaryTeal },
    tabContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface, marginTop: 10 },
    tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
    activeTab: { borderBottomColor: colors.primaryTeal },
    tabText: { fontSize: 16, color: colors.textSecondary, fontWeight: '500' },
    activeTabText: { color: colors.primaryTeal, fontWeight: 'bold' },
    listContainer: { paddingBottom: 20 },
    productItemContainer: { flex: 0.5, margin: 5, backgroundColor: colors.surface, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
    productImage: { width: '100%', aspectRatio: 1 },
    productInfo: { padding: 10 },
    productName: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    productPrice: { fontSize: 14, fontWeight: 'bold', color: colors.primaryGreen, marginTop: 4 },
    soldBadge: { position: 'absolute', top: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
    soldBadgeText: { color: 'white', fontSize: 10, fontWeight: 'bold' },
    emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 80 },
    emptyText: { marginTop: 10, fontSize: 16, color: colors.textDisabled },
});

export default UserProfileScreen;
