// screens/ProductDetailScreen.js

import Ionicons from '@expo/vector-icons/Ionicons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useNavigation, useRoute } from '@react-navigation/native';
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
    View
} from 'react-native';
import ReanimatedCarousel from 'react-native-reanimated-carousel';
import Toast from 'react-native-toast-message';

// Import the firebase modules
import { auth, firestore } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

const { width: screenWidth } = Dimensions.get('window');

// --- Helper Components ---
const StarRating = ({ rating = 0, size = 20, style, color }) => {
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

const ProductImageCarousel = React.memo(({ images, styles: parentStyles }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const carouselRef = useRef(null);
    const renderImageItem = useCallback(({ item }) => (
        <View style={parentStyles.galleryItemContainer}>
            <Image source={{ uri: item.uri }} style={parentStyles.galleryImage} resizeMode="contain" onError={(e) => console.warn(`Image load error: ${e.nativeEvent.error}`)} />
        </View>
    ), [parentStyles]);

    if (!images || images.length === 0) {
        return <View style={parentStyles.galleryOuterContainer}><Text style={{color: parentStyles.errorText.color}}>No Images Available</Text></View>;
    }

    return (
        <View style={parentStyles.galleryOuterContainer}>
            <ReanimatedCarousel
                ref={carouselRef}
                data={images}
                renderItem={renderImageItem}
                width={screenWidth}
                height={screenWidth * 0.8}
                onSnapToItem={setActiveIndex}
                loop={images.length > 1}
                autoPlay={false}
            />
            {images.length > 1 && (
                <View style={parentStyles.paginationContainer}>
                    {images.map((_, index) => (
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
    const headerHeight = useHeaderHeight();

    // --- State ---
    const [product, setProduct] = useState(null);
    const [sellerProfile, setSellerProfile] = useState(null);
    const [loadingProduct, setLoadingProduct] = useState(true);
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(true);
    const [newComment, setNewComment] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [isOfferModalVisible, setIsOfferModalVisible] = useState(false);
    const [offerAmount, setOfferAmount] = useState('');
    const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
    const [productOffers, setProductOffers] = useState([]);
    const [loadingOffers, setLoadingOffers] = useState(true);
    const [userHasPendingOffer, setUserHasPendingOffer] = useState(false);
    const [processingOfferId, setProcessingOfferId] = useState(null);
    
    // --- Memoized Values ---
    const currentUser = auth().currentUser;
    const styles = useMemo(() => themedStyles(colors, isDarkMode, screenWidth), [colors, isDarkMode, screenWidth]);
    const imagesToDisplay = useMemo(() => (product?.imageUrls || [product?.imageUrl]).filter(Boolean).map((uri, i) => ({ id: `${i}`, uri })), [product]);
    const isOwnListing = currentUser?.uid === product?.sellerId;

    // --- Effects ---
    useEffect(() => {
        if (!productId) { setLoadingProduct(false); return; }

        const productRef = firestore().collection('products').doc(productId);
        const unsubscribeProduct = productRef.onSnapshot(async (docSnap) => {
            if (docSnap.exists) {
                const productData = { id: docSnap.id, ...docSnap.data() };
                setProduct(productData);
                if (productData.sellerId) {
                    const sellerSnap = await firestore().collection('users').doc(productData.sellerId).get();
                    if (sellerSnap.exists) setSellerProfile({ uid: sellerSnap.id, ...sellerSnap.data() });
                }
            } else setProduct(null);
            setLoadingProduct(false);
        });

        const commentsQuery = firestore().collection('products').doc(productId).collection('comments').orderBy('createdAt', 'desc');
        const unsubscribeComments = commentsQuery.onSnapshot(q => {
            setComments(q.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoadingComments(false);
        });

        const offersQuery = firestore().collection('products').doc(productId).collection('offers').orderBy('offerTimestamp', 'desc');
        const unsubscribeOffers = offersQuery.onSnapshot(q => {
            const offers = q.docs.map(d => ({ id: d.id, ...d.data() }));
            setProductOffers(offers);
            
            const pendingOffer = offers.find(offer => offer.buyerId === currentUser?.uid && offer.status === 'pending');
            setUserHasPendingOffer(!!pendingOffer);

            setLoadingOffers(false);
        });

        return () => {
            unsubscribeProduct();
            unsubscribeComments();
            unsubscribeOffers();
        };
    }, [productId, currentUser?.uid]);

    // --- Handlers ---
    const handlePostComment = async () => {
        if (!currentUser) { 
            Alert.alert("Login Required", "You must be logged in to comment.", [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log In', onPress: () => navigation.navigate('Login') },
            ]);
            return; 
        }
        if (!newComment.trim()) return;
        
        setIsSubmittingComment(true);
        try {
            await firestore().collection('products').doc(productId).collection('comments').add({
                text: newComment.trim(), userId: currentUser.uid, userName: currentUser.displayName,
                userPhotoURL: currentUser.photoURL, createdAt: firestore.FieldValue.serverTimestamp(),
            });
            setNewComment(''); Keyboard.dismiss();
            Toast.show({ type: 'success', text1: 'Comment Posted' });
        } catch (error) { Toast.show({ type: 'error', text1: 'Failed to post comment' }); }
        finally { setIsSubmittingComment(false); }
    };
    
    const sendAutoChatMessage = async () => {
        const chatId = [currentUser.uid, product.sellerId].sort().join('_');
        const chatRef = firestore().collection('privateChats').doc(chatId);
        const messageText = `Hi, I've just made an offer of $${parseFloat(offerAmount).toFixed(2)} for your item: "${product.name}".`;

        const messageData = {
            text: messageText,
            createdAt: firestore.FieldValue.serverTimestamp(),
            user: {
                _id: currentUser.uid,
                name: currentUser.displayName || 'User',
                avatar: currentUser.photoURL || null,
            },
        };

        const chatMetadata = {
            lastMessage: {
                text: messageText,
                createdAt: firestore.FieldValue.serverTimestamp(),
                senderId: currentUser.uid,
            },
            participants: [currentUser.uid, product.sellerId],
            participantDetails: {
                [currentUser.uid]: { displayName: currentUser.displayName || 'Me', avatar: currentUser.photoURL || null },
                [product.sellerId]: { displayName: sellerProfile?.displayName || 'Seller', avatar: sellerProfile?.profilePicUrl || null }
            },
            lastActivity: firestore.FieldValue.serverTimestamp(),
        };

        await chatRef.collection('messages').add(messageData);
        await chatRef.set(chatMetadata, { merge: true });
        console.log("Automatic chat message sent.");
    };

    const handleSubmitOffer = async () => {
        if (!currentUser) { 
             Alert.alert("Login Required", "You must be logged in to make an offer.", [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Log In', onPress: () => navigation.navigate('Login') },
            ]);
            return; 
        }
        if (!offerAmount.trim() || isNaN(parseFloat(offerAmount)) || parseFloat(offerAmount) <= 0) {
            Alert.alert("Invalid Amount", "Please enter a valid offer amount."); return;
        }
        setIsSubmittingOffer(true);
        try {
            const offerData = {
                productId,
                productName: product.name,
                buyerId: currentUser.uid,
                buyerName: currentUser.displayName,
                sellerId: product.sellerId,
                offerAmount: parseFloat(offerAmount),
                status: "pending",
                offerTimestamp: firestore.FieldValue.serverTimestamp(),
            };
            await firestore().collection('products').doc(productId).collection('offers').add(offerData);
            await sendAutoChatMessage();

            Toast.show({ type: 'success', text1: 'Offer Sent!' });
            setIsOfferModalVisible(false);
            setOfferAmount('');
        } catch (e) {
            console.error("Error submitting offer:", e);
            Toast.show({ type: 'error', text1: 'Offer Failed', text2: e.message });
        } finally {
            setIsSubmittingOffer(false);
        }
    };
    
    const handleOfferAction = async (offerId, newStatus) => {
        setProcessingOfferId(offerId);
        const productRef = firestore().collection('products').doc(productId);
        const offerRef = productRef.collection('offers').doc(offerId);

        try {
            if (newStatus === 'accepted') {
                // Use a transaction to ensure atomicity
                await firestore().runTransaction(async (transaction) => {
                    transaction.update(productRef, { isSold: true });
                    transaction.update(offerRef, { status: 'accepted' });
                });

                // After accepting, reject all other pending offers
                const otherOffersQuery = productRef.collection('offers').where('status', '==', 'pending');
                const otherOffersSnapshot = await otherOffersQuery.get();
                const batch = firestore().batch();
                otherOffersSnapshot.forEach(doc => {
                    if (doc.id !== offerId) {
                        batch.update(doc.ref, { status: 'rejected' });
                    }
                });
                await batch.commit();

                Toast.show({ type: 'success', text1: 'Offer Accepted!', text2: 'The item is now marked as sold.' });
            } else { // 'rejected'
                await offerRef.update({ status: 'rejected' });
                Toast.show({ type: 'info', text1: 'Offer Rejected' });
            }
        } catch (error) {
            console.error("Error handling offer action:", error);
            Toast.show({ type: 'error', text1: 'Action Failed', text2: 'Could not update the offer.' });
        } finally {
            setProcessingOfferId(null);
        }
    };

    const renderCommentItem = useCallback(({ item }) => (
        <View style={styles.commentItemContainer}>
            <Image source={{ uri: item.userPhotoURL || 'https://placehold.co/40x40/E0E0E0/7F7F7F?text=User' }} style={styles.commentAvatar} />
            <View style={styles.commentContent}>
                <Text style={styles.commentUserName}>{item.userName}</Text>
                <Text style={styles.commentText}>{item.text}</Text>
                <Text style={styles.commentDate}>{item.createdAt?.toDate().toLocaleDateString()}</Text>
            </View>
        </View>
    ), [styles]);

    const renderOfferItem = ({ item }) => {
        const isProcessing = processingOfferId === item.id;
        const statusStyle = styles[`status_${item.status}`] || styles.status_pending;

        return (
            <View style={styles.offerItemContainer}>
                <View style={styles.offerInfo}>
                    <Text style={styles.offerItemText}><Text style={styles.offerBuyerName}>{item.buyerName}</Text> offered ${item.offerAmount.toFixed(2)}</Text>
                    <View style={[styles.statusBadge, statusStyle.badge]}>
                        <Text style={statusStyle.text}>{item.status.charAt(0).toUpperCase() + item.status.slice(1)}</Text>
                    </View>
                </View>
                {isOwnListing && item.status === 'pending' && (
                    <View style={styles.offerActions}>
                        {isProcessing ? (
                            <ActivityIndicator color={colors.primaryTeal} />
                        ) : (
                            <>
                                <TouchableOpacity style={[styles.offerActionButton, styles.rejectButton]} onPress={() => handleOfferAction(item.id, 'rejected')}>
                                    <Ionicons name="close-circle-outline" size={22} color={colors.error} />
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.offerActionButton, styles.acceptButton]} onPress={() => handleOfferAction(item.id, 'accepted')}>
                                    <Ionicons name="checkmark-circle-outline" size={22} color={colors.primaryGreen} />
                                </TouchableOpacity>
                            </>
                        )}
                    </View>
                )}
            </View>
        );
    };

    if (loadingProduct) return <SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={colors.primaryTeal} /></SafeAreaView>;
    if (!product) return <SafeAreaView style={styles.centered}><Text style={styles.errorText}>Product not found.</Text></SafeAreaView>;

    const makeOfferButtonDisabled = isOwnListing || product.isSold || userHasPendingOffer;

    return (
        <SafeAreaView style={styles.safeArea}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : "height"}
                keyboardVerticalOffset={headerHeight}
            >
                <ScrollView
                    style={styles.scrollView}
                    keyboardShouldPersistTaps="handled"
                >
                    {product.videoUrl && <Video source={{ uri: product.videoUrl }} style={styles.videoPlayer} useNativeControls resizeMode="contain" />}
                    <ProductImageCarousel images={imagesToDisplay} styles={styles} />
                    {product.isSold && <View style={styles.soldOverlayDetailsPage}><Text style={styles.soldOverlayText}>SOLD</Text></View>}
                    
                    <View style={styles.detailsContainer}>
                        <Text style={styles.productName}>{product.name}</Text>
                        <Text style={styles.productPrice}>${product.price?.toFixed(2)}</Text>
                        {product.condition && <Text style={styles.productCondition}>Condition: {product.condition}</Text>}
                        <View style={styles.sellerInfoContainer}>
                            <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userId: product.sellerId, userName: sellerProfile?.displayName })}>
                                <Text style={styles.sellerNameText}>{sellerProfile?.displayName || 'Seller'}</Text>
                            </TouchableOpacity>
                            <StarRating rating={sellerProfile?.averageRating || 0} size={18} style={styles.sellerRatingStars} />
                            <TouchableOpacity onPress={() => navigation.navigate('SellerReviews', { sellerId: product.sellerId, sellerName: sellerProfile?.displayName })}>
                                <Text style={styles.sellerReviewsText}>({sellerProfile?.ratingCount || 0} reviews)</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.productDescription}>{product.description}</Text>
                        
                        {!isOwnListing && (
                             <View style={styles.actionButtonsContainer}>
                                <TouchableOpacity 
                                    style={[styles.offerButton, makeOfferButtonDisabled && styles.disabledButton]} 
                                    onPress={() => setIsOfferModalVisible(true)}
                                    disabled={makeOfferButtonDisabled}
                                >
                                    <Ionicons name="pricetag-outline" size={20} color={makeOfferButtonDisabled ? colors.textDisabled : colors.textOnPrimary} />
                                    <Text style={[styles.actionButtonText, makeOfferButtonDisabled && styles.disabledButtonText]}>
                                        {product.isSold ? 'Item Sold' : userHasPendingOffer ? 'Offer Pending' : 'Make Offer'}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.chatButton} onPress={() => {
                                     if (!currentUser) {
                                        Alert.alert("Login Required", "You must be logged in to chat.", [
                                            { text: 'Cancel', style: 'cancel' },
                                            { text: 'Log In', onPress: () => navigation.navigate('Login') },
                                        ]);
                                        return;
                                     }
                                     navigation.navigate('PrivateChat', { recipientId: product.sellerId, recipientName: sellerProfile?.displayName, recipientAvatar: sellerProfile?.profilePicUrl })
                                }}>
                                    <Ionicons name="chatbubbles-outline" size={20} color={colors.textOnPrimary} />
                                    <Text style={styles.actionButtonText}>Chat with Seller</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                    
                    {isOwnListing && (
                        <View style={styles.offersSection}>
                            <Text style={styles.offersTitle}>Offers Received</Text>
                            {loadingOffers ? <ActivityIndicator color={colors.primaryTeal}/> : (
                                <FlatList
                                    data={productOffers}
                                    renderItem={renderOfferItem}
                                    keyExtractor={(item) => item.id}
                                    scrollEnabled={false}
                                    ListEmptyComponent={<Text style={styles.noOffersText}>No offers yet.</Text>}
                                />
                            )}
                        </View>
                    )}

                    <View style={styles.commentsSection}>
                        <Text style={styles.commentsTitle}>Comments</Text>
                        <View style={styles.commentInputContainer}>
                            <TextInput style={styles.commentTextInput} placeholder="Add a public comment..." value={newComment} onChangeText={setNewComment} placeholderTextColor={colors.textDisabled} multiline />
                            <TouchableOpacity style={styles.postCommentButton} onPress={handlePostComment} disabled={isSubmittingComment}>
                                {isSubmittingComment ? <ActivityIndicator color={colors.textOnPrimary} /> : <Ionicons name="send" size={20} color={colors.textOnPrimary} />}
                            </TouchableOpacity>
                        </View>
                        {loadingComments ? <ActivityIndicator style={{marginVertical: 20}}/> : (
                            <FlatList
                                data={comments}
                                renderItem={renderCommentItem}
                                keyExtractor={(item) => item.id}
                                scrollEnabled={false}
                                ListEmptyComponent={<Text style={styles.noCommentsText}>Be the first to comment!</Text>}
                            />
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
            
            <Modal animationType="slide" transparent={true} visible={isOfferModalVisible} onRequestClose={() => setIsOfferModalVisible(false)}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalBackdrop}>
                    <View style={styles.modalContainer}>
                        <Text style={styles.modalTitle}>Make an Offer</Text>
                        <TextInput style={styles.offerInput} placeholder="Your Offer Amount" keyboardType="numeric" value={offerAmount} onChangeText={setOfferAmount} placeholderTextColor={colors.textDisabled} />
                        <View style={styles.modalButtonContainer}>
                            <TouchableOpacity style={[styles.modalButton, styles.cancelButton]} onPress={() => setIsOfferModalVisible(false)}><Text style={styles.cancelButtonText}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity style={[styles.modalButton, styles.submitButton]} onPress={handleSubmitOffer} disabled={isSubmittingOffer}>
                                {isSubmittingOffer ? <ActivityIndicator color={colors.textOnPrimary} /> : <Text style={styles.submitButtonText}>Submit Offer</Text>}
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
    galleryOuterContainer: { height: screenWidth * 0.8, backgroundColor: colors.surfaceLight },
    galleryItemContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    galleryImage: { width: '100%', height: '100%' },
    paginationContainer: { position: 'absolute', bottom: 10, flexDirection: 'row', alignSelf: 'center' },
    paginationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.5)', marginHorizontal: 4 },
    activePaginationDot: { backgroundColor: colors.primaryTeal },
    videoPlayer: { width: screenWidth, height: screenWidth * 0.8 },
    soldOverlayDetailsPage: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1 },
    soldOverlayText: { color: 'white', fontSize: 48, fontWeight: 'bold', transform: [{ rotate: '-25deg' }] },
    detailsContainer: { padding: 15, backgroundColor: colors.surface },
    productName: { fontSize: 26, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 5 },
    productPrice: { fontSize: 22, fontWeight: 'bold', color: colors.primaryGreen, marginBottom: 10 },
    productCondition: { fontSize: 16, color: colors.textSecondary, marginBottom: 15 },
    sellerInfoContainer: { flexDirection: 'row', alignItems: 'center', paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
    sellerNameText: { fontSize: 18, fontWeight: '600', color: colors.primaryTeal, marginRight: 8 },
    sellerRatingStars: { marginRight: 5 },
    sellerReviewsText: { fontSize: 14, color: colors.textSecondary, textDecorationLine: 'underline' },
    productDescription: { fontSize: 16, color: colors.textSecondary, lineHeight: 24, marginTop: 15 },
    actionButtonsContainer: { marginTop: 20, paddingTop: 15, borderTopWidth: 1, borderTopColor: colors.borderLight, flexDirection: 'column' },
    chatButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryTeal, paddingVertical: 14, borderRadius: 10, width: '100%', marginTop: 12 },
    offerButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent, paddingVertical: 14, borderRadius: 10, width: '100%' },
    disabledButton: { backgroundColor: colors.border, },
    disabledButtonText: { color: colors.textDisabled },
    actionButtonText: { color: colors.textOnPrimary, fontSize: 16, fontWeight: 'bold', marginLeft: 10 },
    offersSection: { marginTop: 10, paddingHorizontal: 15, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 15 },
    offersTitle: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 15 },
    offerItemContainer: {
        backgroundColor: colors.surface,
        borderRadius: 10,
        padding: 15,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.border,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    offerInfo: {
        flex: 1,
    },
    offerItemText: {
      color: colors.textPrimary,
      fontSize: 16,
      marginBottom: 5,
    },
    offerBuyerName: {
        fontWeight: 'bold',
        color: colors.textPrimary,
    },
    offerActions: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    offerActionButton: {
        padding: 8,
        marginLeft: 10,
        borderRadius: 20,
    },
    acceptButton: {
        backgroundColor: isDarkMode ? 'rgba(76, 175, 80, 0.2)' : '#E8F5E9',
    },
    rejectButton: {
        backgroundColor: isDarkMode ? 'rgba(220, 53, 69, 0.2)' : '#FDECEA',
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        alignSelf: 'flex-start',
        marginTop: 5,
    },
    status_pending: {
        badge: { backgroundColor: colors.accent + '33' },
        text: { color: colors.accent, fontWeight: 'bold' },
    },
    status_accepted: {
        badge: { backgroundColor: colors.primaryGreen + '33' },
        text: { color: colors.primaryGreen, fontWeight: 'bold' },
    },
    status_rejected: {
        badge: { backgroundColor: colors.error + '33' },
        text: { color: colors.error, fontWeight: 'bold' },
    },
    noOffersText: { textAlign: 'center', color: colors.textSecondary, paddingVertical: 15 },
    commentsSection: { marginTop: 10, paddingHorizontal: 15, paddingBottom: 20 },
    commentsTitle: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 15 },
    commentInputContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    commentTextInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingVertical: 10, paddingHorizontal: 15, color: colors.textPrimary, backgroundColor: colors.background, minHeight: 40, maxHeight: 120 },
    postCommentButton: { marginLeft: 10, backgroundColor: colors.primaryTeal, padding: 12, borderRadius: 25 },
    commentItemContainer: { flexDirection: 'row', paddingVertical: 15, borderTopWidth: 1, borderTopColor: colors.borderLight, marginHorizontal: 15 },
    commentAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 10, backgroundColor: colors.surfaceLight },
    commentContent: { flex: 1 },
    commentUserName: { fontSize: 14, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 2 },
    commentText: { fontSize: 15, color: colors.textSecondary },
    commentDate: { fontSize: 12, color: colors.textDisabled, marginTop: 4 },
    noCommentsText: { textAlign: 'center', color: colors.textDisabled, paddingVertical: 20 },
    modalBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
    modalContainer: { width: '85%', padding: 20, borderRadius: 15, backgroundColor: colors.surface },
    modalTitle: { fontSize: 22, fontWeight: 'bold', marginBottom: 15, color: colors.textPrimary, textAlign: 'center' },
    offerInput: { width: '100%', height: 50, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 15, fontSize: 18, marginBottom: 20, color: colors.textPrimary, backgroundColor: colors.background },
    modalButtonContainer: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
    modalButton: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginHorizontal: 5 },
    cancelButton: { backgroundColor: colors.surfaceLight },
    cancelButtonText: { color: colors.textPrimary, fontWeight: 'bold', fontSize: 16 },
    submitButton: { backgroundColor: colors.primaryGreen },
    submitButtonText: { color: colors.textOnPrimary, fontWeight: 'bold', fontSize: 16 },
});

export default ProductDetailScreen;
