// screens/ProductDetailScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { Video } from 'expo-av';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import ReanimatedCarousel from 'react-native-reanimated-carousel';
import Toast from 'react-native-toast-message';

import { auth, firestore } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

const { width: screenWidth } = Dimensions.get('window');

// --- Helper Components ---
const StarRating = ({ rating = 0, size = 16, style }) => {
    const { colors } = useTheme();
    const filledStars = Math.round(rating);
    const starColor = colors.accent || '#fadb14';
    return (
        <View style={[{ flexDirection: 'row' }, style]}>
            {[...Array(5)].map((_, index) => (
                <Ionicons key={index} name="star" size={size} color={index < filledStars ? starColor : colors.border} />
            ))}
        </View>
    );
};

const ProductMedia = React.memo(({ product, styles: parentStyles, onSavePress, isSaved }) => {
    const { colors } = useTheme();
    const [activeIndex, setActiveIndex] = useState(0);
    const carouselRef = useRef(null);

    const mediaItems = useMemo(() => {
        const items = [];
        if (product.videoUrl) {
            items.push({ type: 'video', uri: product.videoUrl, id: 'video-0' });
        }
        if (product.imageUrls && product.imageUrls.length > 0) {
            product.imageUrls.forEach((uri, i) => items.push({ type: 'image', uri, id: `image-${i}` }));
        } else if (product.imageUrl) {
            items.push({ type: 'image', uri: product.imageUrl, id: 'image-0' });
        }
        return items;
    }, [product]);

    const renderMediaItem = useCallback(({ item }) => {
        if (item.type === 'video') {
            return (
                <View style={parentStyles.galleryItemContainer}>
                    <Video source={{ uri: item.uri }} style={parentStyles.videoPlayer} useNativeControls resizeMode="contain" isLooping />
                </View>
            );
        }
        return (
            <View style={parentStyles.galleryItemContainer}>
                <Image source={{ uri: item.uri }} style={parentStyles.galleryImage} resizeMode="contain" />
            </View>
        );
    }, [parentStyles]);

    if (mediaItems.length === 0) {
        return <View style={[parentStyles.galleryOuterContainer, { justifyContent: 'center', alignItems: 'center' }]}><Text style={{ color: colors.textSecondary }}>No Media Available</Text></View>;
    }

    return (
        <View style={parentStyles.galleryOuterContainer}>
            <ReanimatedCarousel
                ref={carouselRef}
                data={mediaItems}
                renderItem={renderMediaItem}
                width={screenWidth}
                height={screenWidth * 0.9}
                onSnapToItem={setActiveIndex}
                loop={mediaItems.length > 1}
                autoPlay={false}
            />
            {product.isSold && <View style={parentStyles.soldBadge}><Text style={parentStyles.soldBadgeText}>SOLD</Text></View>}
            <TouchableOpacity style={parentStyles.saveButton} onPress={onSavePress}>
                <Ionicons name={isSaved ? "heart" : "heart-outline"} size={28} color={isSaved ? colors.error : colors.background} />
            </TouchableOpacity>
            {mediaItems.length > 1 && (
                <View style={parentStyles.paginationContainer}>
                    {mediaItems.map((_, index) => (
                        <TouchableOpacity key={`dot-${index}`} style={[parentStyles.paginationDot, index === activeIndex && parentStyles.activePaginationDot]} onPress={() => carouselRef.current?.scrollTo({ index, animated: true })} />
                    ))}
                </View>
            )}
        </View>
    );
});


const ProductDetailScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { productId } = route.params || {};
    const { colors, isDarkMode } = useTheme();

    const currentUser = auth().currentUser;
    const [product, setProduct] = useState(null);
    const [sellerProfile, setSellerProfile] = useState(null);
    const [otherProducts, setOtherProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [isOfferModalVisible, setIsOfferModalVisible] = useState(false);
    const [offerAmount, setOfferAmount] = useState('');
    const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
    const [productOffers, setProductOffers] = useState([]);
    const [userHasPendingOffer, setUserHasPendingOffer] = useState(false);
    const [processingOfferId, setProcessingOfferId] = useState(null);
    const [wishlistIds, setWishlistIds] = useState(new Set());

    const isOwnListing = currentUser?.uid === product?.sellerId;
    const isSavedToWishlist = wishlistIds.has(productId);

    // --- Login Gate Helper ---
    const requireLogin = (actionName) => {
        if (!currentUser) {
            Alert.alert(
                "Login Required",
                `You must be logged in to ${actionName}.`,
                [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Log In', onPress: () => navigation.navigate('Login') },
                ]
            );
            return false;
        }
        return true;
    };

    // --- Data Fetching Effects ---
    useEffect(() => {
        if (!productId) {
            setLoading(false);
            return;
        }

        const productRef = firestore().collection('products').doc(productId);
        const unsubscribeProduct = productRef.onSnapshot(async (docSnap) => {
            if (docSnap.exists) {
                const productData = { id: docSnap.id, ...docSnap.data() };
                setProduct(productData);
                navigation.setOptions({ title: productData.name || 'Product Details' });

                if (productData.sellerId) {
                    const sellerSnap = await firestore().collection('users').doc(productData.sellerId).get();
                    if (sellerSnap.exists) setSellerProfile({ uid: sellerSnap.id, ...sellerSnap.data() });

                    const otherProductsQuery = firestore().collection('products')
                        .where('sellerId', '==', productData.sellerId)
                        .where(firestore.FieldPath.documentId(), '!=', productId)
                        .limit(6);
                    const otherProductsSnap = await otherProductsQuery.get();
                    setOtherProducts(otherProductsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                }
            } else {
                setProduct(null);
            }
            setLoading(false);
        });

        const commentsQuery = firestore().collection('products').doc(productId).collection('comments').orderBy('createdAt', 'desc');
        // *** FIX IS HERE ***
        // We now convert the Firebase Timestamp to a JS Date object immediately
        const unsubscribeComments = commentsQuery.onSnapshot(q => {
            const fetchedComments = q.docs.map(doc => {
                const data = doc.data();
                return {
                    id: doc.id,
                    ...data,
                    createdAt: data.createdAt ? data.createdAt.toDate() : new Date(),
                };
            });
            setComments(fetchedComments);
        });

        const offersQuery = firestore().collection('products').doc(productId).collection('offers').orderBy('offerTimestamp', 'desc');
        const unsubscribeOffers = offersQuery.onSnapshot(q => {
            const offers = q.docs.map(d => ({ id: d.id, ...d.data() }));
            setProductOffers(offers);
            setUserHasPendingOffer(!!offers.find(o => o.buyerId === currentUser?.uid && o.status === 'pending'));
        });

        return () => {
            unsubscribeProduct();
            unsubscribeComments();
            unsubscribeOffers();
        };
    }, [productId, currentUser?.uid]);

    useFocusEffect(useCallback(() => {
        if (!currentUser) return;
        const wishlistQuery = firestore().collection('users').doc(currentUser.uid).collection('wishlist');
        const unsub = wishlistQuery.onSnapshot(snapshot => setWishlistIds(new Set(snapshot.docs.map(doc => doc.id))));
        return () => unsub();
    }, [currentUser]));


    // --- Handlers ---
    const handleSaveToggle = () => {
        if (!requireLogin('save items to your wishlist')) return;
        const wishlistItemRef = firestore().collection('users').doc(currentUser.uid).collection('wishlist').doc(productId);
        
        const previouslySaved = isSavedToWishlist;
        setWishlistIds(prev => {
            const newSet = new Set(prev);
            if (previouslySaved) {
                newSet.delete(productId);
            } else {
                newSet.add(productId);
            }
            return newSet;
        });

        if (previouslySaved) {
            Toast.show({ type: 'info', text1: 'Removed from Wishlist' });
            wishlistItemRef.delete().catch(() => {
                setWishlistIds(prev => new Set(prev).add(productId));
                Toast.show({ type: 'error', text1: 'Failed to remove from wishlist.' });
            });
        } else {
            Toast.show({ type: 'success', text1: 'Added to Wishlist!' });
            wishlistItemRef.set({ savedAt: firestore.FieldValue.serverTimestamp() }).catch(() => {
                setWishlistIds(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(productId);
                    return newSet;
                });
                Toast.show({ type: 'error', text1: 'Failed to add to wishlist.' });
            });
        }
    };

    const handlePostComment = async () => {
        if (!requireLogin('post a comment')) return;
        if (!newComment.trim()) return;

        setIsSubmittingComment(true);
        
        const tempCommentId = `temp_${Date.now()}`;
        const optimisticComment = {
            id: tempCommentId,
            text: newComment.trim(),
            userId: currentUser.uid,
            userName: currentUser.displayName,
            userPhotoURL: currentUser.photoURL,
            createdAt: new Date(),
        };
        setComments(prev => [optimisticComment, ...prev]);
        setNewComment('');
        Keyboard.dismiss();

        try {
            await firestore().collection('products').doc(productId).collection('comments').add({
                text: optimisticComment.text,
                userId: currentUser.uid,
                userName: currentUser.displayName,
                userPhotoURL: currentUser.photoURL,
                createdAt: firestore.FieldValue.serverTimestamp(),
            });
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Failed to post comment' });
            setComments(prev => prev.filter(c => c.id !== tempCommentId));
            console.error("Comment post error:", error);
        } finally {
            setIsSubmittingComment(false);
        }
    };

    const handleSubmitOffer = async () => {
        if (!requireLogin('make an offer')) return;
        const amount = parseFloat(offerAmount);
        if (isNaN(amount) || amount <= 0) {
            Alert.alert("Invalid Amount", "Please enter a valid offer amount.");
            return;
        }

        setIsSubmittingOffer(true);
        try {
            await firestore().collection('products').doc(productId).collection('offers').add({
                buyerId: currentUser.uid,
                buyerName: currentUser.displayName,
                sellerId: product.sellerId,
                offerAmount: amount,
                status: 'pending',
                offerTimestamp: firestore.FieldValue.serverTimestamp(),
            });
            Toast.show({ type: 'success', text1: 'Offer Sent!' });
            setIsOfferModalVisible(false);
            setOfferAmount('');
        } catch (error) {
            console.error("Offer submission error:", error);
            Toast.show({ type: 'error', text1: 'Failed to send offer.' });
        } finally {
            setIsSubmittingOffer(false);
        }
    };

    const handleOfferAction = async (offerId, newStatus) => {
        if (!isOwnListing) return;
        setProcessingOfferId(offerId);
        try {
            const offerRef = firestore().collection('products').doc(productId).collection('offers').doc(offerId);
            await offerRef.update({ status: newStatus });

            if (newStatus === 'accepted') {
                await firestore().collection('products').doc(productId).update({ isSold: true });
            }
            Toast.show({ type: 'info', text1: `Offer ${newStatus}` });
        } catch (error) {
            console.error("Offer action error:", error);
            Toast.show({ type: 'error', text1: 'Action failed.' });
        } finally {
            setProcessingOfferId(null);
        }
    };
    
    const handleMessage = () => {
        if (!requireLogin('chat with the seller')) return;
        navigation.navigate('PrivateChat', {
            recipientId: product.sellerId,
            recipientName: sellerProfile?.displayName,
            recipientAvatar: sellerProfile?.profilePicUrl,
        });
    };

    // --- Render Functions ---
    const renderCommentItem = ({ item }) => (
        <View style={[styles.commentItemContainer, item.id.startsWith('temp_') && { opacity: 0.6 }]}>
            <Image source={{ uri: item.userPhotoURL || 'https://placehold.co/40x40/E0E0E0/7F7F7F?text=User' }} style={styles.commentAvatar} />
            <View style={styles.commentContent}>
                <Text style={styles.commentUserName}>{item.userName}</Text>
                <Text style={styles.commentText}>{item.text}</Text>
                <Text style={styles.commentDate}>{item.createdAt?.toLocaleDateString()}</Text>
            </View>
        </View>
    );

    const renderOfferItem = ({ item }) => (
        <View style={styles.offerItemContainer}>
            <Text style={styles.offerText}><Text style={{fontWeight: 'bold'}}>{item.buyerName}</Text> offered <Text style={{color: colors.primaryGreen, fontWeight: 'bold'}}>${item.offerAmount.toFixed(2)}</Text></Text>
            {item.status === 'pending' ? (
                <View style={styles.offerActionContainer}>
                    <TouchableOpacity style={[styles.offerActionButton, styles.acceptButton]} onPress={() => handleOfferAction(item.id, 'accepted')} disabled={processingOfferId === item.id}>
                        {processingOfferId === item.id ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.offerActionButtonText}>Accept</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.offerActionButton, styles.rejectButton]} onPress={() => handleOfferAction(item.id, 'rejected')} disabled={processingOfferId === item.id}>
                        <Text style={styles.offerActionButtonText}>Reject</Text>
                    </TouchableOpacity>
                </View>
            ) : (
                <Text style={[styles.offerStatusText, {color: item.status === 'accepted' ? colors.primaryGreen : colors.error}]}>{item.status.charAt(0).toUpperCase() + item.status.slice(1)}</Text>
            )}
        </View>
    );
    
    const renderOtherProductItem = ({ item }) => (
        <TouchableOpacity style={styles.otherProductCard} onPress={() => navigation.push('Details', { productId: item.id })}>
            <Image source={{ uri: item.imageUrl }} style={styles.otherProductImage} />
            <Text style={styles.otherProductPrice}>${item.price?.toFixed(2)}</Text>
        </TouchableOpacity>
    );

    const styles = useMemo(() => themedStyles(colors, isDarkMode, screenWidth), [colors, isDarkMode, screenWidth]);

    if (loading) return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
    if (!product) return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>Product not found.</Text></SafeAreaView>;

    const makeOfferButtonDisabled = isOwnListing || product.isSold || userHasPendingOffer;

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView style={styles.scrollView}>
                <ProductMedia product={product} styles={styles} onSavePress={handleSaveToggle} isSaved={isSavedToWishlist} />
                
                <View style={styles.detailsContainer}>
                    <Text style={styles.productName}>{product.name}</Text>
                    <Text style={styles.productPrice}>${product.price?.toFixed(2)}</Text>
                    {product.condition && <Text style={styles.productCondition}>Condition: {product.condition}</Text>}
                    <Text style={styles.productDescription}>{product.description}</Text>
                </View>

                <TouchableOpacity style={styles.sellerCard} onPress={() => navigation.navigate('UserProfile', { userId: product.sellerId, userName: sellerProfile?.displayName })}>
                    <Image source={{ uri: sellerProfile?.profilePicUrl || 'https://placehold.co/50x50' }} style={styles.sellerAvatar} />
                    <View style={styles.sellerInfo}>
                        <Text style={styles.sellerName}>{sellerProfile?.displayName || 'Seller'}</Text>
                        <StarRating rating={sellerProfile?.averageRating || 0} />
                    </View>
                    <Ionicons name="chevron-forward" size={24} color={colors.textSecondary} />
                </TouchableOpacity>

                {otherProducts.length > 0 && (
                    <View style={styles.moreFromSellerSection}>
                        <Text style={styles.sectionTitle}>More from {sellerProfile?.displayName}</Text>
                        <FlatList
                            data={otherProducts}
                            renderItem={renderOtherProductItem}
                            keyExtractor={item => item.id}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal: 15 }}
                        />
                    </View>
                )}

                {isOwnListing && productOffers.length > 0 && (
                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionTitle}>Offers Received</Text>
                        {productOffers.map(item => <View key={item.id}>{renderOfferItem({ item })}</View>)}
                    </View>
                )}

                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionTitle}>Comments</Text>
                    <View style={styles.commentInputContainer}>
                        <TextInput style={styles.commentTextInput} placeholder="Add a public comment..." value={newComment} onChangeText={setNewComment} multiline placeholderTextColor={colors.textSecondary} />
                        <TouchableOpacity style={styles.postCommentButton} onPress={handlePostComment} disabled={isSubmittingComment}>
                            {isSubmittingComment ? <ActivityIndicator color={colors.textOnPrimary} /> : <Ionicons name="send" size={20} color={colors.textOnPrimary} />}
                        </TouchableOpacity>
                    </View>
                    {comments.length > 0 ? comments.map(item => <View key={item.id}>{renderCommentItem({ item })}</View>) : <Text style={styles.noCommentsText}>Be the first to comment!</Text>}
                </View>
            </ScrollView>

            {!isOwnListing && !product.isSold && (
                <View style={styles.bottomActionBar}>
                    <TouchableOpacity style={[styles.actionButton, styles.offerButton, makeOfferButtonDisabled && styles.disabledButton]} onPress={() => setIsOfferModalVisible(true)} disabled={makeOfferButtonDisabled}>
                        <Text style={[styles.actionButtonText, makeOfferButtonDisabled && styles.disabledButtonText]}>
                            {userHasPendingOffer ? 'Offer Pending' : 'Make Offer'}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionButton, styles.chatButton]} onPress={handleMessage}>
                        <Text style={styles.actionButtonText}>Chat</Text>
                    </TouchableOpacity>
                </View>
            )}

            <Modal
                animationType="slide"
                transparent={true}
                visible={isOfferModalVisible}
                onRequestClose={() => setIsOfferModalVisible(false)}
            >
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Make an Offer</Text>
                        <Text style={styles.modalProductPrice}>Listing Price: ${product.price?.toFixed(2)}</Text>
                        <TextInput
                            style={styles.modalInput}
                            placeholder="Your offer amount"
                            keyboardType="numeric"
                            value={offerAmount}
                            onChangeText={setOfferAmount}
                            placeholderTextColor={colors.textSecondary}
                        />
                        <View style={styles.modalButtonContainer}>
                            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setIsOfferModalVisible(false)}>
                                <Text style={styles.modalButtonText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.modalButton, styles.submitOfferButton, isSubmittingOffer && styles.disabledButton]} onPress={handleSubmitOffer} disabled={isSubmittingOffer}>
                                {isSubmittingOffer ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={styles.modalButtonText}>Submit Offer</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
        </SafeAreaView>
    );
};

const themedStyles = (colors, isDarkMode, screenWidth) => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    scrollView: { flex: 1 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    errorText: { color: colors.error, fontSize: 16 },
    
    videoPlayer: { width: screenWidth, height: screenWidth * 0.9, backgroundColor: '#000' },
    galleryOuterContainer: { height: screenWidth * 0.9, backgroundColor: colors.surfaceLight || '#f0f0f0' },
    galleryItemContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    galleryImage: { width: '100%', height: '100%' },
    soldBadge: { position: 'absolute', top: 15, left: 15, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, zIndex: 1 },
    soldBadgeText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
    saveButton: { position: 'absolute', top: 15, right: 15, padding: 8, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 25, zIndex: 1 },
    paginationContainer: { position: 'absolute', bottom: 15, flexDirection: 'row', alignSelf: 'center' },
    paginationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.6)', marginHorizontal: 4 },
    activePaginationDot: { backgroundColor: colors.primaryTeal },

    detailsContainer: { padding: 20, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    productName: { fontSize: 24, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 8 },
    productPrice: { fontSize: 22, fontWeight: '600', color: colors.primaryGreen, marginBottom: 12 },
    productCondition: { fontSize: 14, color: colors.textSecondary, marginBottom: 15, fontStyle: 'italic' },
    productDescription: { fontSize: 16, color: colors.textPrimary, lineHeight: 24 },
    
    sellerCard: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    sellerAvatar: { width: 50, height: 50, borderRadius: 25, marginRight: 15 },
    sellerInfo: { flex: 1 },
    sellerName: { fontSize: 16, fontWeight: 'bold', color: colors.textPrimary },
    
    moreFromSellerSection: { paddingVertical: 20, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 15, paddingHorizontal: 15 },
    otherProductCard: { width: 140, marginRight: 15, backgroundColor: colors.background, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
    otherProductImage: { width: '100%', height: 100 },
    otherProductPrice: { padding: 8, fontSize: 14, fontWeight: 'bold', color: colors.primaryGreen },

    sectionContainer: { marginTop: 10, paddingVertical: 15, backgroundColor: colors.surface },
    commentInputContainer: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginBottom: 15 },
    commentTextInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 15, color: colors.textPrimary, backgroundColor: colors.background, maxHeight: 100 },
    postCommentButton: { marginLeft: 10, backgroundColor: colors.primaryTeal, padding: 12, borderRadius: 25 },
    commentItemContainer: { flexDirection: 'row', paddingVertical: 15, borderTopWidth: 1, borderTopColor: colors.border, marginHorizontal: 15 },
    commentAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10 },
    commentContent: { flex: 1 },
    commentUserName: { fontSize: 14, fontWeight: 'bold', color: colors.textPrimary },
    commentText: { fontSize: 15, color: colors.textSecondary, marginTop: 2 },
    commentDate: { fontSize: 12, color: colors.textDisabled, marginTop: 4 },
    noCommentsText: { textAlign: 'center', color: colors.textDisabled, paddingVertical: 20, paddingHorizontal: 15 },

    offerItemContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 15, borderTopWidth: 1, borderTopColor: colors.border },
    offerText: { fontSize: 15, color: colors.textPrimary, flex: 1 },
    offerActionContainer: { flexDirection: 'row' },
    offerActionButton: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, marginLeft: 8 },
    acceptButton: { backgroundColor: colors.primaryGreen },
    rejectButton: { backgroundColor: colors.error },
    offerActionButtonText: { color: colors.textOnPrimary, fontWeight: 'bold' },
    offerStatusText: { fontSize: 14, fontWeight: 'bold' },

    bottomActionBar: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
    actionButton: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginHorizontal: 5 },
    actionButtonText: { fontSize: 16, fontWeight: 'bold', color: colors.textOnPrimary },
    offerButton: { backgroundColor: colors.primaryGreen },
    chatButton: { backgroundColor: colors.primaryTeal },
    disabledButton: { backgroundColor: colors.textDisabled },
    disabledButtonText: { color: colors.textSecondary },

    modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContent: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 30 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, textAlign: 'center', marginBottom: 10 },
    modalProductPrice: { fontSize: 16, color: colors.textSecondary, textAlign: 'center', marginBottom: 20 },
    modalInput: { width: '100%', height: 50, backgroundColor: colors.background, borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 15, marginBottom: 20, fontSize: 16, color: colors.textPrimary },
    modalButtonContainer: { flexDirection: 'row', justifyContent: 'space-between' },
    modalButton: { flex: 1, paddingVertical: 14, borderRadius: 10, alignItems: 'center', marginHorizontal: 5 },
    modalButtonText: { fontSize: 16, fontWeight: 'bold', color: colors.textOnPrimary },
    cancelButton: { backgroundColor: colors.border },
    submitOfferButton: { backgroundColor: colors.primaryGreen },
});

export default ProductDetailScreen;
