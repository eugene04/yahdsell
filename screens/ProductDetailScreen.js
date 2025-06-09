// screens/ProductDetailScreen.js (Carousel Fix Attempt 3: Robust Style Handling)

import Ionicons from '@expo/vector-icons/Ionicons';
import { useHeaderHeight } from '@react-navigation/elements';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
    addDoc,
    collection,
    doc, getDoc,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from 'firebase/firestore';
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
    StatusBar,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import ReanimatedCarousel from 'react-native-reanimated-carousel';
import Toast from 'react-native-toast-message';

import { auth, firestore } from '../firebaseConfig';
import { useTheme } from '../src/ThemeContext';

const { width: screenWidth } = Dimensions.get('window');

// StarRating Component
const StarRating = ({ rating = 0, size = 20, style }) => {
    const filledStars = Math.round(rating);
    const totalStars = 5;
    return (
        <View style={[{ flexDirection: 'row' }, style]}>
            {[...Array(totalStars)].map((_, index) => {
                const starNumber = index + 1;
                return (
                    <Text key={starNumber} style={{ color: starNumber <= filledStars ? '#fadb14' : '#d9d9d9', fontSize: size, marginRight: 1 }}>
                        ★
                    </Text>
                );
            })}
        </View>
    );
};

const generateChatId = (uid1, uid2) => {
    if (!uid1 || !uid2) {
        console.warn("[generateChatId] One or both UIDs are missing:", uid1, uid2);
        return null;
    }
    return [uid1, uid2].sort().join('_');
};


// --- Decoupled Product Image Carousel Component with Robust Style Handling ---
const ProductImageCarousel = React.memo(({ images, styles: parentStyles }) => {
    const [activeIndex, setActiveIndex] = useState(0);
    const carouselRef = useRef(null);
    const numImages = images.length;

    // Define default/fallback styles directly within the component or ensure parentStyles is always valid
    const defaultGalleryBackgroundColor = '#ECECEC';
    const defaultErrorTextColor = 'red';
    const defaultPlaceholderImageStyle = { width: '100%', height: '100%' };
    const defaultGalleryOuterStyle = { height: screenWidth * 0.8, width: screenWidth, backgroundColor: '#DDD' }; // Fallback if parentStyles.galleryOuterContainer is missing
    const defaultPaginationContainerStyle = { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' };
    const defaultPaginationDotStyle = { width: 8, height: 8, borderRadius: 4, marginHorizontal: 4, backgroundColor: 'grey', opacity: 0.6 };
    const defaultActivePaginationDotStyle = { backgroundColor: 'blue', opacity: 1, width: 10, height: 10, borderRadius: 5 };


    const renderImageItem = useCallback(({ item, index }) => {
        const itemContainerStyle = {
            width: screenWidth,
            height: '100%',
            backgroundColor: parentStyles?.galleryOuterContainer?.backgroundColor || defaultGalleryBackgroundColor,
            justifyContent: 'center',
            alignItems: 'center',
        };
        const imageStyle = { width: '100%', height: '100%' };

        if (!item || !item.uri) {
            return (
                <View style={itemContainerStyle}>
                    <Text style={{color: parentStyles?.errorText?.color || defaultErrorTextColor}}>Image data missing</Text>
                </View>
            );
        }
        return (
            <View style={itemContainerStyle}>
                <Image
                    key={item.id || item.uri}
                    source={{ uri: item.uri }}
                    style={imageStyle}
                    resizeMode="contain"
                    onError={(e) => console.warn(`[IMG_LOAD_ERR] ${item.uri}:`, e.nativeEvent.error)}
                />
            </View>
        );
    }, [screenWidth, parentStyles]); // Depend on parentStyles directly

    if (!images || images.length === 0 || (images[0]?.id && images[0].id.startsWith('placeholder_'))) {
        // Use optional chaining for parentStyles and provide fallbacks
        const galleryOuterStyle = parentStyles?.galleryOuterContainer || defaultGalleryOuterStyle;
        const placeholderStyle = parentStyles?.placeholderImage || defaultPlaceholderImageStyle;
        return (
            <View style={galleryOuterStyle}>
                <Image source={{uri: images[0]?.uri || 'https://placehold.co/400x300/e0e0e0/7f7f7f?text=No+Image' }} style={placeholderStyle} resizeMode="contain"/>
            </View>
        );
    }

    // Use optional chaining for parentStyles and provide fallbacks for all style accesses
    const galleryOuterContainerStyle = parentStyles?.galleryOuterContainer || defaultGalleryOuterStyle;
    const paginationContainerStyle = parentStyles?.paginationContainer || defaultPaginationContainerStyle;
    const paginationDotStyle = parentStyles?.paginationDot || defaultPaginationDotStyle;
    const activePaginationDotStyle = parentStyles?.activePaginationDot || defaultActivePaginationDotStyle;


    return (
        <View style={galleryOuterContainerStyle}>
            <ReanimatedCarousel
                ref={carouselRef}
                data={images}
                renderItem={renderImageItem}
                width={screenWidth}
                height={screenWidth * 0.8} // Ensure this matches galleryOuterContainerStyle height
                onSnapToItem={(index) => setActiveIndex(index)}
                loop={numImages > 1}
                autoPlay={false}
            />
            {numImages > 1 && (
                <View style={paginationContainerStyle}>
                    {images.map((_, index) => (
                        <TouchableOpacity
                            key={`dot-${index}`}
                            style={[paginationDotStyle, index === activeIndex && activePaginationDotStyle]}
                            onPress={() => carouselRef.current?.scrollTo({ index: index, animated: true })}
                        />
                    ))}
                </View>
            )}
        </View>
    );
});
// --- END: Product Image Carousel Component ---


const ProductDetailScreen = () => {
    const route = useRoute();
    const navigation = useNavigation();
    const { productId } = route.params || {};
    const { colors: themeColors, isDarkMode } = useTheme();
    const headerHeight = useHeaderHeight();

    const [product, setProduct] = useState(null);
    const [sellerProfile, setSellerProfile] = useState(null);
    const [loadingProduct, setLoadingProduct] = useState(true);
    const [loadingSeller, setLoadingSeller] = useState(true);
    const [error, setError] = useState(null);
    const currentUser = auth.currentUser;
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(true);
    const [newComment, setNewComment] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [isOfferModalVisible, setIsOfferModalVisible] = useState(false);
    const [offerAmount, setOfferAmount] = useState('');
    const [isSubmittingOffer, setIsSubmittingOffer] = useState(false);
    const [existingUserOffer, setExistingUserOffer] = useState(null);
    const [loadingExistingOffer, setLoadingExistingOffer] = useState(false);
    const [productOffers, setProductOffers] = useState([]);
    const [loadingProductOffers, setLoadingProductOffers] = useState(false);
    const [processingOfferId, setProcessingOfferId] = useState(null);


    const styles = useMemo(() => {
        const currentColors = themeColors || {
            background: '#ffffff', textPrimary: '#000000', textSecondary: '#555555',
            textDisabled: '#aaaaaa', primaryTeal: '#007bff', primaryGreen: '#28a745',
            error: '#dc3545', border: '#dddddd', borderLight: '#eeeeee',
            surface: '#f8f8f8', textOnPrimary: '#ffffff', accent: '#FFCA28',
            backdrop: 'rgba(0,0,0,0.5)', surfaceLight: '#E0E0E0', errorMuted: '#EF9A9A'
        };
        // Ensure themedStyles is always called with valid arguments
        return themedStyles(currentColors, isDarkMode || false, product?.isSold || false, screenWidth);
    }, [themeColors, isDarkMode, product?.isSold, screenWidth]);

    // Ensure all callback functions are defined or stubbed if not fully implemented yet
    const promptUserToLogin = useCallback((actionText) => {
        Alert.alert( "Login Required", `You need to be logged in to ${actionText}. Please log in.`,
            [ { text: "Cancel", onPress: () => {}, style: "cancel" },
              { text: "Log In", onPress: () => { navigation.navigate('Login'); } }
            ], { cancelable: true }
        );
    }, [navigation]);

    const handlePrivateChat = useCallback(() => {
        if (!currentUser) { promptUserToLogin("chat with the seller"); return; }
        if (!product || !product.sellerId) { Alert.alert("Error", "Seller information missing."); return; }
        if (currentUser.uid === product.sellerId) { Alert.alert("Your Item", "You cannot chat with yourself about this item."); return; }
        if (product.isSold) { Alert.alert("Item Sold", "Cannot chat about a sold item."); return; }
        navigation.navigate('PrivateChat', { recipientId: product.sellerId, recipientName: sellerProfile?.displayName || product.sellerDisplayName || 'Seller' });
    }, [currentUser, product, sellerProfile, navigation, promptUserToLogin]);

    const handleViewSellerReviews = useCallback(() => {
        const sellerNameForNav = sellerProfile?.displayName || product?.sellerDisplayName || 'Seller';
        if (!product || !product.sellerId) { Alert.alert("Error", "Seller information missing."); return; }
        navigation.navigate('SellerReviews', { sellerId: product.sellerId, sellerName: sellerNameForNav });
    }, [product, sellerProfile, navigation]);

    const handleSellerNamePress = useCallback(() => {
        const sellerDisplayNameForNav = sellerProfile?.displayName || product?.sellerDisplayName || 'Seller';
        const isOwnListing = currentUser?.uid && product?.sellerId && currentUser.uid === product.sellerId;
        if (product?.sellerId) {
            if (isOwnListing) {
                navigation.navigate('MainTabs', { screen: 'ProfileTab' });
            } else {
                navigation.navigate('UserProfile', {
                    userId: product.sellerId,
                    userName: sellerDisplayNameForNav
                });
            }
        } else {
            Alert.alert("Error", "Seller information is unavailable for this product.");
        }
    }, [currentUser, product, sellerProfile, navigation]);

    const handlePostComment = useCallback(async () => {
        if (!currentUser) { promptUserToLogin("post a comment"); return; }
        if (!newComment.trim()) { Toast.show({ type: 'error', text1: 'Comment cannot be empty.' }); return; }
        if (!productId) { Toast.show({ type: 'error', text1: 'Cannot post comment (missing product ID).' }); return; }
        setIsSubmittingComment(true);
        try {
            const commenterDisplayName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Anonymous User';
            const commenterPhotoURL = currentUser.photoURL || null;
            const commentData = {
                text: newComment.trim(), userId: currentUser.uid, userName: commenterDisplayName,
                userPhotoURL: commenterPhotoURL, createdAt: serverTimestamp(), productId: productId,
            };
            await addDoc(collection(firestore, 'products', productId, 'comments'), commentData);
            setNewComment(''); Keyboard.dismiss();
            Toast.show({ type: 'success', text1: 'Comment posted!' });
        } catch (err) {
            console.error("[ProductDetailScreen] Error posting comment: ", err);
            Toast.show({ type: 'error', text1: 'Failed to post comment.' });
        } finally { setIsSubmittingComment(false); }
    }, [currentUser, newComment, productId, promptUserToLogin]);


    useEffect(() => {
        if (!productId) { setError('Product ID needed.'); setLoadingProduct(false); setLoadingSeller(false); return; }
        let isMounted = true;
        setLoadingProduct(true); setLoadingSeller(true); setError(null);
        const productRef = doc(firestore, 'products', productId);
        const unsubscribeProduct = onSnapshot(productRef, (docSnap) => {
            if (isMounted) {
                if (docSnap.exists()) {
                    const fetchedProductData = { id: docSnap.id, ...docSnap.data() };
                    setProduct(fetchedProductData);
                    if (fetchedProductData?.sellerId) {
                        const sellerRef = doc(firestore, 'users', fetchedProductData.sellerId);
                        getDoc(sellerRef).then(sellerDocSnap => {
                            if (isMounted) {
                                setSellerProfile(sellerDocSnap.exists() ? { uid: sellerDocSnap.id, ...sellerDocSnap.data() } : {});
                                setLoadingSeller(false);
                            }
                        }).catch(err => { if(isMounted) { console.error("Error fetching seller profile:", err); setLoadingSeller(false); }});
                    } else { setSellerProfile({}); setLoadingSeller(false); }
                } else { setError(`Product not found (ID: ${productId}).`); setProduct(null); }
                setLoadingProduct(false);
            }
        }, (err) => {
            if (isMounted) {
                setError('Failed to load product details.'); console.error("[ProductDetailScreen] Error fetching product details:", err);
                setLoadingProduct(false); setLoadingSeller(false);
            }
        });
        return () => { isMounted = false; unsubscribeProduct(); };
    }, [productId]);

    useEffect(() => {
        if (!productId) { setLoadingComments(false); return; }
        setLoadingComments(true);
        const commentsRef = collection(firestore, 'products', productId, 'comments');
        const q_comments = query(commentsRef, orderBy('createdAt', 'desc'));
        const unsubscribeComments = onSnapshot(q_comments, (querySnapshot) => {
            const fetchedComments = [];
            querySnapshot.forEach((docSn) => fetchedComments.push({ id: docSn.id, ...docSn.data() }));
            setComments(fetchedComments); setLoadingComments(false);
        }, (err) => {
            setError(prevError => prevError ? `${prevError}\nFailed to load comments.` : "Failed to load comments.");
            setLoadingComments(false);
        });
        return () => unsubscribeComments();
    }, [productId]);

    useEffect(() => {
        if (!productId || !currentUser?.uid) { setExistingUserOffer(null); setLoadingExistingOffer(false); return; }
        setLoadingExistingOffer(true);
        const offersRef = collection(firestore, 'products', productId, 'offers');
        const q_offers = query(offersRef, where('buyerId', '==', currentUser.uid), orderBy('offerTimestamp', 'desc'), limit(1));
        const unsubscribeOffers = onSnapshot(q_offers, (snapshot) => {
            if (!snapshot.empty) {
                const offerData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
                setExistingUserOffer(offerData);
            } else { setExistingUserOffer(null); }
            setLoadingExistingOffer(false);
        }, (err) => { console.error("Error fetching existing user offer:", err); setLoadingExistingOffer(false); });
        return () => unsubscribeOffers();
    }, [productId, currentUser?.uid]);

    useEffect(() => {
        if (!productId || !currentUser?.uid || !product || currentUser.uid !== product.sellerId) {
            setProductOffers([]); setLoadingProductOffers(false); return;
        }
        setLoadingProductOffers(true);
        const offersRef = collection(firestore, 'products', productId, 'offers');
        const q_all_offers = query(offersRef, orderBy('offerTimestamp', 'desc'));
        const unsubscribeAllOffers = onSnapshot(q_all_offers, (snapshot) => {
            const fetchedOffers = [];
            snapshot.forEach((docSn) => { fetchedOffers.push({ id: docSn.id, ...docSn.data() }); });
            setProductOffers(fetchedOffers); setLoadingProductOffers(false);
        }, (err) => {
            console.error("Error fetching product offers for seller:", err);
            setError("Failed to load offers for your product."); setLoadingProductOffers(false);
        });
        return () => unsubscribeAllOffers();
    }, [productId, currentUser?.uid, product]);

    const imagesToDisplay = useMemo(() => {
        if (!product) return [{ id: 'placeholder_loading', uri: 'https://placehold.co/400x300/e0e0e0/7f7f7f?text=Loading+Images...' }];
        let urls = [];
        if (product.imageUrls && Array.isArray(product.imageUrls) && product.imageUrls.length > 0) {
            urls = product.imageUrls.filter(url => typeof url === 'string' && url.trim() !== '');
        } else if (product.imageUrl && typeof product.imageUrl === 'string' && product.imageUrl.trim() !== '') {
            urls = [product.imageUrl];
        }
        if (urls.length === 0) {
            return [{ id: 'placeholder_no_image', uri: 'https://placehold.co/400x300/e0e0e0/7f7f7f?text=No+Image+Available' }];
        }
        return urls.map((url, index) => ({ id: `image_${index}_${product.id || 'no-id'}`, uri: url }));
    }, [product]);

    const renderCommentItem = ({ item }) => {
        const commentDateObj = item.createdAt?.toDate ? item.createdAt.toDate() : null;
        let SDate = 'date unavailable';
        if (commentDateObj) { SDate = `${commentDateObj.toLocaleDateString()} at ${commentDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`; }
        else if (item.createdAt && typeof item.createdAt === 'string') { SDate = item.createdAt; }
        return (
            <View style={styles.commentItemContainer}>
                {item.userPhotoURL ? ( <Image source={{ uri: item.userPhotoURL }} style={styles.commentAvatar} />
                ) : ( <View style={[styles.commentAvatar, {justifyContent: 'center', alignItems: 'center'}]}><Ionicons name="person-circle-outline" size={38} color={styles.commentUserName?.color || themeColors?.textDisabled || '#aaa'} /></View> )}
                <View style={styles.commentContent}>
                    <Text style={styles.commentUserName}>{item.userName || 'User'}</Text>
                    <Text style={styles.commentText}>{item.text}</Text>
                    <Text style={styles.commentDate}>{SDate}</Text>
                </View>
            </View>
        );
    };
    const handleOpenOfferModal = () => {
        if (!currentUser) { promptUserToLogin("make an offer"); return; }
        if (product?.sellerId === currentUser.uid) { Alert.alert("Your Item", "You cannot make an offer on your own listing."); return; }
        if (product?.isSold) { Alert.alert("Item Sold", "This item has already been sold."); return; }
        if (existingUserOffer && existingUserOffer.status === 'pending') {
            Alert.alert("Offer Pending", `You have a pending offer of $${existingUserOffer.offerAmount?.toFixed(2)}. You can withdraw it or wait for the seller's response.`);
            return;
        }
        setOfferAmount('');
        setIsOfferModalVisible(true);
    };
    const handleSubmitOffer = async () => {
        if (!offerAmount.trim() || isNaN(parseFloat(offerAmount)) || parseFloat(offerAmount) <= 0) {
            Alert.alert("Invalid Amount", "Please enter a valid offer amount greater than 0."); return;
        }
        if (!currentUser || !product || !productId) { Alert.alert("Error", "Cannot submit offer. Missing information."); return; }
        setIsSubmittingOffer(true);
        const numericOfferAmount = parseFloat(offerAmount);
        try {
            const offersCollectionRef = collection(firestore, 'products', productId, 'offers');
            const newOfferData = {
                productId: productId, productName: product.name || 'N/A', productImageUrl: product.imageUrl || product.imageUrls?.[0] || null,
                buyerId: currentUser.uid, buyerName: currentUser.displayName || currentUser.email?.split('@')[0] || 'Anonymous Buyer',
                buyerAvatar: currentUser.photoURL || null, sellerId: product.sellerId, offerAmount: numericOfferAmount,
                status: "pending", offerTimestamp: serverTimestamp(), lastUpdated: serverTimestamp(),
            };
            await addDoc(offersCollectionRef, newOfferData);
            Toast.show({ type: 'success', text1: 'Offer Sent!', text2: `Your offer of $${numericOfferAmount.toFixed(2)} has been submitted.`, position: 'bottom' });
            setIsOfferModalVisible(false); setOfferAmount('');
        } catch (e) {
            console.error("Error submitting offer:", e);
            Toast.show({ type: 'error', text1: 'Offer Failed', text2: e.message || 'Could not submit your offer.', position: 'bottom' });
        } finally { setIsSubmittingOffer(false); }
    };
    const sendSystemMessageToChat = async (buyerId, buyerName, systemMessageText) => {
        if (!currentUser || !buyerId || !product) { console.error("Cannot send system message: missing current user, buyerId, or product info."); return; }
        const chatWithBuyerId = generateChatId(currentUser.uid, buyerId);
        if (!chatWithBuyerId) { console.error("Cannot send system message: failed to generate chat ID."); return; }
        const newMessage = { _id: new Date().getTime().toString() + "_system" + Math.random().toString(16).slice(2), text: systemMessageText, createdAt: serverTimestamp(), system: true, };
        const messagesCollectionRef = collection(firestore, 'privateChats', chatWithBuyerId, 'messages');
        const chatDocRef = doc(firestore, 'privateChats', chatWithBuyerId);
        try {
            await addDoc(messagesCollectionRef, newMessage);
            const sellerName = currentUser.displayName || currentUser.email?.split('@')[0] || 'Seller';
            const sellerAvatar = currentUser.photoURL || null;
            const offerFromBuyer = productOffers.find(o => o.buyerId === buyerId);
            const buyerAvatar = offerFromBuyer?.buyerAvatar || null;
            await setDoc(chatDocRef, { lastMessage: { text: systemMessageText.length > 40 ? systemMessageText.substring(0, 37) + '...' : systemMessageText, createdAt: serverTimestamp(), senderId: 'system', }, participants: [currentUser.uid, buyerId], participantDetails: { [currentUser.uid]: { displayName: sellerName, avatar: sellerAvatar }, [buyerId]: { displayName: buyerName || 'Buyer', avatar: buyerAvatar } }, lastActivity: serverTimestamp(), }, { merge: true });
        } catch (error) { console.error("Error sending system message to chat:", error); }
    };
    const handleAcceptOffer = async (offer) => {
        if (!productId || !offer || !offer.id || !product) return;
        if (product.isSold) { Alert.alert("Already Sold", "This item has already been marked as sold."); return; }
        setProcessingOfferId(offer.id);
        try {
            const offerRef = doc(firestore, 'products', productId, 'offers', offer.id);
            const productRef = doc(firestore, 'products', productId);
            await updateDoc(offerRef, { status: "accepted", sellerResponseTimestamp: serverTimestamp(), lastUpdated: serverTimestamp() });
            await updateDoc(productRef, { isSold: true, acceptedOfferId: offer.id, lastUpdatedAt: serverTimestamp() });
            const messageText = `Your offer of $${offer.offerAmount.toFixed(2)} for "${product.name}" has been accepted! Please coordinate with the seller.`;
            await sendSystemMessageToChat(offer.buyerId, offer.buyerName, messageText);
            Toast.show({ type: 'success', text1: 'Offer Accepted!', text2: 'The item has been marked as sold & buyer notified.', position: 'bottom' });
        } catch (e) { console.error("Error accepting offer:", e); Toast.show({ type: 'error', text1: 'Accept Failed', text2: e.message || 'Could not accept offer.', position: 'bottom' });
        } finally { setProcessingOfferId(null); }
    };
    const handleRejectOffer = async (offer) => {
        if (!productId || !offer || !offer.id) return;
        setProcessingOfferId(offer.id);
        try {
            const offerRef = doc(firestore, 'products', productId, 'offers', offer.id);
            await updateDoc(offerRef, { status: "rejected", sellerResponseTimestamp: serverTimestamp(), lastUpdated: serverTimestamp() });
            const messageText = `Regarding your offer of $${offer.offerAmount.toFixed(2)} for "${product?.name || 'the item'}", the seller has decided not to accept it at this time.`;
            await sendSystemMessageToChat(offer.buyerId, offer.buyerName, messageText);
            Toast.show({ type: 'info', text1: 'Offer Rejected', text2: 'Buyer has been notified.', position: 'bottom' });
        } catch (e) { console.error("Error rejecting offer:", e); Toast.show({ type: 'error', text1: 'Reject Failed', text2: e.message || 'Could not reject offer.', position: 'bottom' });
        } finally { setProcessingOfferId(null); }
    };
    const handleChatWithOfferer = (offererId, offererName) => {
        if (!currentUser) { promptUserToLogin("chat with this user"); return; }
        if (currentUser.uid === offererId) { Alert.alert("Cannot Chat", "You cannot initiate a chat with yourself regarding an offer."); return; }
        navigation.navigate('PrivateChat', { recipientId: offererId, recipientName: offererName });
    };
    const renderProductOfferItem = ({ item: offer }) => {
        const offerDate = offer.offerTimestamp?.toDate();
        const formattedDate = offerDate ? `${offerDate.toLocaleDateString()} ${offerDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'N/A';
        const isProcessingThisOffer = processingOfferId === offer.id;
        return (
            <View style={styles.offerItemContainer}>
                <View style={styles.offerItemHeader}>
                    <Image source={{ uri: offer.buyerAvatar || 'https://placehold.co/40x40/E0E0E0/7F7F7F?text=User' }} style={styles.offerBuyerAvatar} />
                    <View style={styles.offerBuyerInfo}><Text style={styles.offerBuyerName} numberOfLines={1}>{offer.buyerName || 'Unknown Buyer'}</Text><Text style={styles.offerTimestamp}>{formattedDate}</Text></View>
                    <View style={styles.offerAmountContainer}><Text style={styles.offerAmountLabel}>Offer:</Text><Text style={styles.offerAmount}>${offer.offerAmount?.toFixed(2)}</Text></View>
                </View>
                {product && typeof product.price === 'number' && (<Text style={styles.originalPriceText}>Listed Price: ${product.price.toFixed(2)}</Text>)}
                <View style={styles.offerStatusContainer}><Text style={styles.offerStatusLabel}>Status: </Text><Text style={[styles.offerStatus, styles[`offerStatus_${offer.status}`]]}>{offer.status ? (offer.status.charAt(0).toUpperCase() + offer.status.slice(1)) : 'Unknown'}</Text></View>
                <View style={styles.offerActionsRow}>
                    {currentUser?.uid !== offer.buyerId && (!product?.isSold || (product?.isSold && product?.acceptedOfferId === offer.id)) && (<TouchableOpacity style={[styles.offerActionButton, styles.offerChatButton]} onPress={() => handleChatWithOfferer(offer.buyerId, offer.buyerName)} disabled={isProcessingThisOffer}><Ionicons name="chatbubbles-outline" size={18} color={styles.offerActionButtonText?.color || themeColors?.textOnPrimary} style={{marginRight: 6}}/><Text style={styles.offerActionButtonText}>Chat</Text></TouchableOpacity>)}
                    {offer.status === 'pending' && product && !product.isSold && (<>{isProcessingThisOffer ? ( <ActivityIndicator color={themeColors?.primaryTeal || '#007bff'} style={{marginLeft: 10}}/>) : ( <><TouchableOpacity style={[styles.offerActionButton, styles.offerRejectButton]} onPress={() => handleRejectOffer(offer)}><Ionicons name="close-circle-outline" size={18} color={styles.offerRejectButtonText?.color || themeColors?.textPrimary} style={{marginRight: 6}}/><Text style={[styles.offerActionButtonText, styles.offerRejectButtonText]}>Reject</Text></TouchableOpacity><TouchableOpacity style={[styles.offerActionButton, styles.offerAcceptButton]} onPress={() => handleAcceptOffer(offer)}><Ionicons name="checkmark-circle-outline" size={18} color={styles.offerActionButtonText?.color || themeColors?.textOnPrimary} style={{marginRight: 6}}/><Text style={styles.offerActionButtonText}>Accept</Text></TouchableOpacity></>)}</>)}
                </View>
            </View>
        );
    };


    const ListHeader = useCallback(() => {
        if (!product) return null;
        const isOwnListing = currentUser?.uid === product?.sellerId;
        const sellerAvgRating = sellerProfile?.averageRating || 0;
        const sellerRatingCount = sellerProfile?.ratingCount || 0;
        const sellerDisplayName = sellerProfile?.displayName || product?.sellerDisplayName || 'Unknown Seller';
        const pendingOffersCount = productOffers.filter(o => o.status === 'pending' && (!product.isSold || (product.isSold && product.acceptedOfferId === o.id))).length;

        return (
            <View>
                <ProductImageCarousel images={imagesToDisplay} styles={styles} />
                {product?.isSold && ( <View style={styles.soldOverlayDetailsPage}><Text style={styles.soldOverlayText}>SOLD</Text></View> )}
                <View style={styles.detailsContainer}>
                    <Text style={styles.productName}>{product?.name || 'Product Name'}</Text>
                    <Text style={styles.productPrice}>{typeof product?.price === 'number' ? `$${product.price.toFixed(2)}` : 'Price not available'}</Text>
                    {product.condition && <Text style={styles.productCondition}>Condition: {product.condition}</Text>}
                    <View style={styles.sellerInfoContainer}>
                        <TouchableOpacity onPress={handleSellerNamePress} disabled={!product?.sellerId}>
                            <Text style={!product?.sellerId ? styles.sellerNameTextNonClickable : styles.sellerNameTextClickable}>{`Sold by: ${sellerDisplayName}${isOwnListing ? ' (Your item)' : ''}`}</Text>
                        </TouchableOpacity>
                        {loadingSeller && !sellerProfile ? ( <ActivityIndicator size="small" color={styles.activityIndicatorText?.color || '#333'} style={{ alignSelf: 'flex-start', marginBottom: 5 }} />
                        ) : sellerProfile?.uid ? ( (sellerRatingCount > 0) ? (
                                <TouchableOpacity style={styles.ratingContainer} onPress={handleViewSellerReviews} disabled={!product?.sellerId}>
                                    <StarRating rating={sellerAvgRating} size={18} />
                                    <Text style={styles.ratingCountTextClickable}>({sellerRatingCount} ratings) - View Reviews</Text>
                                </TouchableOpacity>
                            ) : (<Text style={styles.noRatingText}>No seller ratings yet</Text>)
                        ) : (<Text style={styles.noRatingText}>Seller info unavailable</Text>)}
                    </View>
                    <Text style={styles.descriptionTitle}>Description</Text>
                    <Text style={styles.productDescription}>{product?.description || 'No description available.'}</Text>
                </View>
                <View style={styles.buttonContainer}>
                    {!isOwnListing && !product?.isSold && (<TouchableOpacity style={[styles.actionButton, styles.privateChatButton]} onPress={handlePrivateChat}><Ionicons name="chatbubbles-outline" size={20} color={styles.buttonText?.color || '#fff'} style={styles.buttonIcon} /><Text style={styles.buttonText}>Chat with Seller</Text></TouchableOpacity>)}
                    {!isOwnListing && !product?.isSold && (<TouchableOpacity style={[styles.actionButton, styles.makeOfferButton, (loadingExistingOffer || (existingUserOffer && existingUserOffer.status === 'pending')) && styles.buttonDisabled]} onPress={handleOpenOfferModal} disabled={loadingExistingOffer || (existingUserOffer && existingUserOffer.status === 'pending')}><Ionicons name="pricetag-outline" size={20} color={styles.buttonText?.color || '#fff'} style={styles.buttonIcon} /><Text style={styles.buttonText}>{loadingExistingOffer ? "Checking Offers..." : existingUserOffer && existingUserOffer.status === 'pending' ? `Offer Pending ($${existingUserOffer.offerAmount?.toFixed(2)})` : "Make Offer"}</Text></TouchableOpacity>)}
                    {product?.sellerId && (!isOwnListing || (sellerProfile && sellerProfile.ratingCount > 0)) && (<TouchableOpacity style={[styles.actionButton, styles.reviewsButton]} onPress={handleViewSellerReviews}><Ionicons name="star-outline" size={20} color={styles.buttonText?.color || '#fff'} style={styles.buttonIcon} /><Text style={styles.buttonText}>Seller Reviews</Text></TouchableOpacity>)}
                    {isOwnListing && (<Text style={styles.ownListingText}>This is your listing.</Text>)}
                </View>
                {isOwnListing && product && (
                    <View style={styles.productOffersSection}>
                        <Text style={styles.sectionTitle}>{product.isSold ? "Sale Details" : `Offers Received (${pendingOffersCount} Pending)`}</Text>
                        {loadingProductOffers ? ( <ActivityIndicator color={themeColors?.primaryTeal || '#007bff'} style={{marginVertical: 20}}/>
                        ) : productOffers.length > 0 ? ( <FlatList data={productOffers} renderItem={renderProductOfferItem} keyExtractor={(item) => item.id} scrollEnabled={false} ItemSeparatorComponent={() => <View style={styles.offerSeparator} />} />
                        ) : !product.isSold ? ( <Text style={styles.noOffersText}>No offers received yet.</Text>
                        ) : null }
                        {product.isSold && product.acceptedOfferId && (() => { const acceptedOffer = productOffers.find(o => o.id === product.acceptedOfferId && o.status === 'accepted'); return acceptedOffer ? ( <View style={styles.acceptedOfferInfo}><Text style={styles.acceptedOfferText}>Item sold for ${acceptedOffer.offerAmount.toFixed(2)} to {acceptedOffer.buyerName}.</Text></View>) : <Text style={styles.noOffersText}>Sale details unavailable.</Text>;})()}
                        {product.isSold && !product.acceptedOfferId && (<View style={styles.acceptedOfferInfo}><Text style={styles.acceptedOfferText}>This item has been sold.</Text></View>)}
                    </View>
                )}
                <View style={styles.commentsSectionHeader}><Text style={styles.commentsTitle}>Comments ({comments.length})</Text></View>
            </View>
        );
    }, [ product, currentUser, sellerProfile, imagesToDisplay, styles, screenWidth, loadingSeller, handleSellerNamePress, handleViewSellerReviews, handlePrivateChat, existingUserOffer, loadingExistingOffer, handleOpenOfferModal, comments.length, productOffers, loadingProductOffers, processingOfferId, themeColors, renderProductOfferItem ]);


    if (loadingProduct && !product) { return (<SafeAreaView style={styles.centered}><ActivityIndicator size="large" color={styles.activityIndicatorText?.color || '#007bff'} /><Text style={styles.activityIndicatorText}>Loading Details...</Text></SafeAreaView>); }
    if (error && !product && !loadingProduct) { return (<SafeAreaView style={styles.centered}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={() => navigation.goBack()} style={styles.button}><Text style={styles.buttonText}>Go Back</Text></TouchableOpacity></SafeAreaView>); }
    if (!product && !loadingProduct) { return (<SafeAreaView style={styles.centered}><Text style={styles.errorText}>Product data unavailable.</Text><TouchableOpacity onPress={() => navigation.goBack()} style={styles.button}><Text style={styles.buttonText}>Go Back</Text></TouchableOpacity></SafeAreaView>); }
    if (!themeColors || !styles || Object.keys(styles).length === 0) { return ( <SafeAreaView style={themedStyles({}, false, false, screenWidth).centered}><ActivityIndicator size="large" color="#007bff" /><Text style={themedStyles({}, false, false, screenWidth).activityIndicatorText}>Loading Theme...</Text></SafeAreaView> ); }

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }} keyboardVerticalOffset={headerHeight} >
            <SafeAreaView style={styles.safeArea}>
                <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={styles.safeArea?.backgroundColor || '#fff'} />
                <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent} keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} keyboardShouldPersistTaps="handled" nestedScrollEnabled={true} directionalLockEnabled={true}>
                    <ListHeader />
                    {loadingComments ? ( <ActivityIndicator size="small" color={styles.activityIndicatorText?.color} style={{ marginTop: 20 }} />
                    ) : comments.length > 0 ? ( <FlatList data={comments} renderItem={renderCommentItem} keyExtractor={(item) => item.id} scrollEnabled={false} contentContainerStyle={styles.commentsFlatListContent} />
                    ) : ( <View style={styles.noCommentsView}><Text style={styles.noCommentsText}>No comments yet. Be the first!</Text></View> )}
                </ScrollView>
                 <Modal animationType="slide" transparent={true} visible={isOfferModalVisible} onRequestClose={() => { if (!isSubmittingOffer) setIsOfferModalVisible(false); }}>
                    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPressOut={() => { if (!isSubmittingOffer) setIsOfferModalVisible(false);}}>
                        <TouchableOpacity activeOpacity={1} style={styles.modalContentContainer} onPress={() => Keyboard.dismiss()}>
                            <Text style={styles.modalTitle}>Make an Offer</Text>
                            <Text style={styles.modalProductInfo}>For: <Text style={{fontWeight: 'bold'}}>{product?.name}</Text></Text>
                            <Text style={styles.modalProductInfo}>Listed Price: <Text style={{fontWeight: 'bold'}}>${product?.price?.toFixed(2)}</Text></Text>
                            <View style={styles.offerInputContainer}><Text style={styles.currencySymbol}>$</Text><TextInput style={styles.offerInput} placeholder="Your Offer Amount" keyboardType="numeric" value={offerAmount} onChangeText={setOfferAmount} placeholderTextColor={styles.offerInput?.placeholderTextColor || styles.textDisabled?.color} autoFocus={true} onSubmitEditing={handleSubmitOffer} /></View>
                            {isSubmittingOffer ? ( <ActivityIndicator size="large" color={styles.activityIndicatorText?.color} style={{marginTop: 20}}/>
                            ) : ( <View style={styles.modalButtonRow}><TouchableOpacity style={[styles.modalButton, styles.modalCancelButton]} onPress={() => setIsOfferModalVisible(false)}><Text style={[styles.modalButtonText, {color: styles.modalCancelButton?.color || colors?.textPrimary}]}>Cancel</Text></TouchableOpacity><TouchableOpacity style={[styles.modalButton, styles.modalSubmitButton]} onPress={handleSubmitOffer}><Text style={styles.modalButtonText}>Submit Offer</Text></TouchableOpacity></View> )}
                        </TouchableOpacity>
                    </TouchableOpacity>
                </Modal>
                {!product?.isSold && ( currentUser ? (
                        <View style={styles.addCommentContainer}><TextInput style={styles.commentInput} placeholder="Write a comment..." value={newComment} onChangeText={setNewComment} placeholderTextColor={styles.commentInput?.placeholderTextColor || styles.textDisabled?.color} multiline /><TouchableOpacity style={[styles.postCommentButton, (isSubmittingComment || !newComment.trim()) && styles.buttonDisabled]} onPress={handlePostComment} disabled={isSubmittingComment || !newComment.trim()}>{isSubmittingComment ? ( <ActivityIndicator size="small" color={styles.buttonText?.color || '#fff'} /> ) : ( <Ionicons name="send" size={20} color={styles.buttonText?.color || '#fff'} /> )}</TouchableOpacity></View>
                    ) : ( <View style={styles.loginToCommentContainer}><TouchableOpacity onPress={() => promptUserToLogin("post a comment")}><Text style={styles.loginToCommentText}>Log in to post a comment</Text></TouchableOpacity></View> )
                )}
            </SafeAreaView>
        </KeyboardAvoidingView>
    );
};

// Styles
const themedStyles = (colors, isDarkMode, isProductSold, currentScreenWidth) => StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    scrollView: { flex: 1 },
    scrollViewContent: { paddingBottom: Platform.OS === 'ios' ? 70 : 80 },
    commentsFlatListContent: { paddingBottom: 10 },
    noCommentsView: { paddingHorizontal: 20, paddingVertical: 10 },
    loginToCommentContainer: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    loginToCommentText: { color: colors.primaryTeal, textAlign: 'center', paddingVertical: 10 },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: colors.background },
    activityIndicatorText: { color: colors.textPrimary, marginTop: 10 },
    galleryOuterContainer: { height: currentScreenWidth * 0.8, width: currentScreenWidth, backgroundColor: colors.borderLight || '#e0e0e0', marginBottom: isProductSold ? 0 : 10, position: 'relative' },
    placeholderImage: { width: '100%', height: '100%' },
    paginationContainer: { position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    paginationDot: { width: 8, height: 8, borderRadius: 4, marginHorizontal: 4, backgroundColor: colors.textDisabled || 'grey', opacity: 0.6 },
    activePaginationDot: { backgroundColor: colors.primaryTeal || '#007bff', opacity: 1, width: 10, height: 10, borderRadius: 5 },
    soldOverlayDetailsPage: { backgroundColor: 'rgba(100, 100, 100, 0.6)', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, marginBottom: 10 },
    soldOverlayText: { color: '#fff', fontSize: 36, fontWeight: 'bold', textTransform: 'uppercase', borderWidth: 2, borderColor: '#fff', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 5, transform: [{ rotate: '-10deg' }] },
    detailsContainer: { paddingHorizontal: 20, paddingTop: isProductSold ? 0 : 15, paddingBottom: 10 },
    productName: { fontSize: 24, fontWeight: 'bold', marginBottom: 8, color: colors.textPrimary },
    productPrice: { fontSize: 20, fontWeight: '600', color: colors.primaryGreen, marginBottom: 8 },
    productCondition: { fontSize: 14, color: colors.textSecondary, marginBottom: 15, fontStyle: 'italic' },
    descriptionTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 8, color: colors.textPrimary, marginTop: 10 },
    productDescription: { fontSize: 16, lineHeight: 24, color: colors.textSecondary, marginBottom: 20 },
    sellerInfoContainer: { marginBottom: 15 },
    sellerNameTextClickable: { fontSize: 16, color: colors.primaryTeal, textDecorationLine: 'underline', marginBottom: 5, fontWeight: '500' },
    sellerNameTextNonClickable: { fontSize: 16, color: colors.textSecondary, marginBottom: 5, fontStyle: 'italic' },
    ratingContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, paddingVertical: 3 },
    ratingCountTextClickable: { fontSize: 13, color: colors.primaryTeal, marginLeft: 8, textDecorationLine: 'underline' },
    noRatingText: { fontSize: 13, color: colors.textSecondary, fontStyle: 'italic', opacity: 0.7, marginBottom: 5 },
    buttonContainer: { paddingHorizontal: 20, marginTop: 10, marginBottom: 15 },
    actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 8, elevation: 2, marginBottom: 12, width: '100%', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 2 },
    buttonIcon: { marginRight: 10 },
    reviewsButton: { backgroundColor: colors.primaryTeal },
    privateChatButton: { backgroundColor: isProductSold ? colors.textDisabled : colors.primaryGreen },
    makeOfferButton: { backgroundColor: colors.accent || '#FFCA28', },
    buttonText: { color: colors.textOnPrimary || '#ffffff', fontSize: 16, fontWeight: 'bold' },
    buttonDisabled: { backgroundColor: colors.textDisabled, opacity: 0.7 },
    ownListingText: { textAlign: 'center', marginVertical: 10, fontSize: 16, color: colors.textSecondary, fontStyle: 'italic' },
    errorText: { color: colors.error, fontSize: 16, textAlign: 'center', marginBottom: 20 },
    commentsSectionHeader: { paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 20, marginTop: 5 },
    commentsTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 15 },
    commentItemContainer: { flexDirection: 'row', marginBottom: 15, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border ? colors.border + '90' : '#eee', paddingHorizontal: 20 },
    commentAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: colors.border || '#ddd', justifyContent: 'center', alignItems: 'center' },
    commentContent: { flex: 1 },
    commentUserName: { fontWeight: 'bold', color: colors.textPrimary, fontSize: 14, marginBottom: 3 },
    commentText: { fontSize: 14, color: colors.textSecondary, lineHeight: 20 },
    commentDate: { fontSize: 11, color: colors.textDisabled, marginTop: 5, textAlign: 'right' },
    noCommentsText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', fontStyle: 'italic', paddingVertical: 20, paddingHorizontal: 20 },
    addCommentContainer: { flexDirection: 'row', padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface, alignItems: 'center' },
    commentInput: { flex: 1, minHeight: 40, maxHeight: 100, backgroundColor: colors.background, borderRadius: 20, paddingHorizontal: 15, paddingVertical: Platform.OS === 'ios' ? 10 : 8, fontSize: 15, color: colors.textPrimary, marginRight: 10, borderWidth: 1, borderColor: colors.border, placeholderTextColor: colors.textDisabled },
    postCommentButton: { backgroundColor: colors.primaryTeal, padding: 10, borderRadius: 20, justifyContent: 'center', alignItems: 'center', width: 40, height: 40 },
    modalOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.backdrop || 'rgba(0, 0, 0, 0.6)' },
    modalContentContainer: { width: '90%', maxWidth: 400, backgroundColor: colors.surface, borderRadius: 12, padding: 25, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
    modalTitle: { fontSize: 20, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 15, textAlign: 'center' },
    modalProductInfo: { fontSize: 15, color: colors.textSecondary, marginBottom: 8, textAlign: 'center' },
    offerInputContainer: { flexDirection: 'row', alignItems: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, marginTop: 15, marginBottom: 25, backgroundColor: colors.background },
    currencySymbol: { fontSize: 18, color: colors.textPrimary, marginRight: 5 },
    offerInput: { flex: 1, height: 50, fontSize: 18, color: colors.textPrimary, placeholderTextColor: colors.textDisabled },
    modalButtonRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 10 },
    modalButton: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginHorizontal: 5 },
    modalCancelButton: { backgroundColor: colors.surfaceLight || colors.border, color: colors.textPrimary },
    modalSubmitButton: { backgroundColor: colors.primaryGreen },
    modalButtonText: { fontSize: 16, fontWeight: 'bold', color: colors.textOnPrimary },

    productOffersSection: { marginTop: 20, paddingVertical: 15, backgroundColor: colors.surfaceLight || '#f9f9f9', borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.borderLight || '#e0e0e0', },
    sectionTitle: { fontSize: 18, fontWeight: 'bold', color: colors.textPrimary, marginBottom: 15, paddingHorizontal: 20, },
    offerItemContainer: { backgroundColor: colors.surface, borderRadius: 10, padding: 15, marginBottom: 12, marginHorizontal: 15, borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 1, }, shadowOpacity: isDarkMode ? 0.15 : 0.1, shadowRadius: 2.22, elevation: 3, },
    offerItemHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, },
    offerBuyerAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: colors.borderLight, },
    offerBuyerInfo: { flex: 1, },
    offerBuyerName: { fontSize: 16, fontWeight: '600', color: colors.textPrimary, },
    offerTimestamp: { fontSize: 12, color: colors.textSecondary, marginTop: 3, },
    offerAmountContainer: { alignItems: 'flex-end', },
    offerAmountLabel: { fontSize: 12, color: colors.textSecondary, },
    offerAmount: { fontSize: 18, fontWeight: 'bold', color: colors.primaryGreen, },
    originalPriceText: { fontSize: 13, color: colors.textDisabled, fontStyle: 'italic', marginBottom: 8, marginLeft: 52, },
    offerStatusContainer: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, },
    offerStatusLabel: { fontSize: 14, color: colors.textSecondary, marginRight: 5, },
    offerStatus: { fontSize: 14, fontWeight: '500', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 4, overflow: 'hidden', },
    offerStatus_pending: { color: colors.accent || '#FFA726', backgroundColor: isDarkMode ? 'rgba(255, 167, 38, 0.2)' : 'rgba(255, 224, 178, 0.5)' },
    offerStatus_accepted: { color: colors.success || '#8BC34A', backgroundColor: isDarkMode ? 'rgba(139, 195, 74, 0.2)' : 'rgba(200, 230, 201, 0.5)' },
    offerStatus_rejected: { color: colors.error || '#EF5350', backgroundColor: isDarkMode ? 'rgba(239, 83, 80, 0.2)' : 'rgba(255, 205, 210, 0.5)' },
    offerStatus_withdrawn: { color: colors.textDisabled || '#B0B0B0', backgroundColor: isDarkMode ? 'rgba(120, 120, 120, 0.2)' : 'rgba(224, 224, 224, 0.5)' },
    offerActionsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10, alignItems: 'center', },
    offerActionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, marginLeft: 10, minWidth: 90, },
    offerChatButton: { backgroundColor: colors.primaryTeal, },
    offerAcceptButton: { backgroundColor: colors.primaryGreen, },
    offerRejectButton: { backgroundColor: colors.surfaceLight || colors.border, },
    offerActionButtonText: { fontSize: 14, fontWeight: 'bold', color: colors.textOnPrimary, },
    offerRejectButtonText: { color: colors.textPrimary, },
    noOffersText: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', paddingVertical: 25, paddingHorizontal: 20, },
    acceptedOfferInfo: { marginTop: 15, padding: 15, backgroundColor: isDarkMode ? colors.surfaceLight : '#E8F5E9', borderColor: colors.primaryGreen, borderWidth: 1, borderRadius: 8, marginHorizontal: 15, },
    acceptedOfferText: { fontSize: 16, color: colors.textPrimary, lineHeight: 24, textAlign: 'center' },
    offerSeparator: { height: 1, backgroundColor: colors.borderLight, marginHorizontal: 20, marginVertical: 5, }
});

export default ProductDetailScreen;
