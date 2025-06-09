// navigation/index.js (With FollowListScreen and all notification handling)

import Ionicons from '@expo/vector-icons/Ionicons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
    NavigationContainer,
    DarkTheme as NavigationDarkTheme,
    DefaultTheme as NavigationDefaultTheme,
    useNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';



import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, firestore } from '../firebaseConfig';
import { ThemeProvider, useTheme } from '../src/ThemeContext';

import * as Notifications from 'expo-notifications';

// Import Screens
import ChatBotScreen from '../screens/ChatBotScreen';
import ChatListScreen from '../screens/ChatListScreen';
import EditProductScreen from '../screens/EditProductScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import FollowListScreen from '../screens/FollowListScreen'; // Import FollowListScreen
import GroupChatScreen from '../screens/GroupChatScreen';
import HomeScreen from '../screens/HomeScreen';
import LoginScreen from '../screens/LoginScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import PrivateChatScreen from '../screens/PrivateChatScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import SellerReviewsScreen from '../screens/SellerReviewScreen';
import SignupScreen from '../screens/SignupScreen';
import SubmissionForm from '../screens/SubmissionForm';
import UserProfileScreen from '../screens/UserProfileScreen';
import WishlistScreen from '../screens/WishListScreen';


const AuthStack = createNativeStackNavigator();
const AppStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// --- Push Notification Helper Functions ---
async function registerForPushNotificationsAsync(userId) {
  if (!userId) {
    console.log("[PushNotifications] No user ID provided, skipping registration.");
    return null;
  }
  let token;
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
      console.log("[PushNotifications] Android channel 'default' set.");
    } catch (e) {
        console.error("[PushNotifications] Failed to set Android channel:", e);
    }
  }
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    console.log("[PushNotifications] Requesting notification permissions...");
    try {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    } catch (e) {
        console.error("[PushNotifications] Error requesting permissions:", e);
        Alert.alert("Permission Error", "Could not request notification permissions.");
        return null;
    }
  }
  if (finalStatus !== 'granted') {
    console.warn('[PushNotifications] Permission to receive notifications was denied.');
    Alert.alert(
        "Permissions Required",
        "Please enable notifications in your device settings to receive updates from YahdSell.",
        [{text: "OK"}]
    );
    return null;
  }
  try {
    // Pass project ID if you have it configured, otherwise, it might pick up a default
    // For EAS Build, ensure your google-services.json is correctly configured for your project.
    token = await Notifications.getExpoPushTokenAsync({
      // projectId: 'YOUR_FIREBASE_PROJECT_ID', // Optional: If you have multiple projects or issues. Usually not needed with correct google-services.json
    });
    console.log('[PushNotifications] Expo Push Token received:', token.data);
  } catch (e) {
    console.error("[PushNotifications] Failed to get Expo push token:", e);
    // Check the error message for more specific clues (like missing google-services.json or incorrect setup)
    Alert.alert("Push Token Error", `Failed to get push token. You may not receive notifications. Error: ${e.message || "Unknown error"}`);
    return null;
  }
  if (token?.data) {
    const tokenString = token.data;
    try {
      if (!firestore) {
          console.error("[PushNotifications] Firestore is not initialized. Cannot store token.");
          Alert.alert("Internal Error", "Cannot save notification token due to Firestore issue.");
          return null;
      }
      const userPushTokensCollectionRef = collection(firestore, 'users', userId, 'pushTokens');
      const tokenDocRef = doc(userPushTokensCollectionRef, tokenString);
      await setDoc(tokenDocRef, {
        userId: userId,
        token: tokenString,
        createdAt: serverTimestamp(),
        platform: Platform.OS,
      });
      console.log('[PushNotifications] Push token stored successfully for user:', userId);
    } catch (error) {
      console.error('[PushNotifications] Error storing push token in Firestore:', error);
      Alert.alert("Storage Error", "Could not save notification token. You might not receive notifications.");
    }
  }
  return token?.data || null;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false, // Typically handled server-side or by app logic
  }),
});
// --- End Push Notification Helper Functions ---

const ThemedNavigation = () => {
    const [initializingAuth, setInitializingAuth] = useState(true);
    const [user, setUser] = useState(() => auth.currentUser); // Initialize with current user
    const { colors, isDarkMode } = useTheme();
    const navigationRef = useNavigationContainerRef();

    // Notification tap listener
    useEffect(() => {
        const subscription = Notifications.addNotificationResponseReceivedListener(response => {
            console.log("[NotificationTap] Notification response received:", response);
            const notificationData = response.notification.request.content.data;
            console.log("[NotificationTap] Notification data:", notificationData);

            if (notificationData && user) { // Ensure user is logged in to handle navigation
                if (navigationRef.isReady()) {
                    if (notificationData.type === 'private_message' && notificationData.chatId && notificationData.senderId) {
                        console.log(`[NotificationTap] Navigating to PrivateChat with sender: ${notificationData.senderId}`);
                        navigationRef.navigate('PrivateChat', {
                            recipientId: notificationData.senderId,
                            recipientName: notificationData.senderName || "Chat",
                        });
                    } else if (notificationData.type === 'new_offer' && notificationData.productId) {
                        console.log(`[NotificationTap] Navigating to Details for product: ${notificationData.productId}`);
                        navigationRef.navigate('Details', { productId: notificationData.productId });
                    } else if ((notificationData.type === 'offer_accepted' || notificationData.type === 'offer_rejected') && notificationData.productId) {
                        console.log(`[NotificationTap] Navigating to Details (offer status) for product: ${notificationData.productId}`);
                        navigationRef.navigate('Details', { productId: notificationData.productId });
                    } else {
                        console.log("[NotificationTap] Unhandled notification type or missing data for navigation:", notificationData.type);
                    }
                } else {
                    console.warn("[NotificationTap] Navigation container not ready when notification tapped.");
                    // Optionally, store the notification data and navigate once ready
                }
            } else {
                console.log("[NotificationTap] No specific data or user not logged in for notification tap handling.");
            }
        });

        return () => {
            console.log("[NotificationTap] Removing notification response listener.");
            subscription.remove();
        };
    }, [user, navigationRef]); // Re-run if user or navigationRef changes

    // Auth state listener
    useEffect(() => {
        console.log("[Nav AuthEffect] Setting up onAuthStateChanged listener. Current initializingAuth:", initializingAuth);
        const unsubscribeAuth = onAuthStateChanged(auth, async (currentUserState) => {
            console.log("[Nav AuthEffect] onAuthStateChanged fired. New user UID:", currentUserState ? currentUserState.uid : 'null');
            setUser(currentUserState);
            if (initializingAuth) {
                console.log("[Nav AuthEffect] InitializingAuth was true, setting to false.");
                setInitializingAuth(false);
            }
            if (currentUserState) {
                console.log("[Nav AuthEffect] User logged in, attempting push notification registration for UID:", currentUserState.uid);
                try {
                    await registerForPushNotificationsAsync(currentUserState.uid);
                } catch (e) {
                    console.error("[Nav AuthEffect] Error during push notification registration:", e);
                }
            } else {
                console.log("[Nav AuthEffect] User logged out.");
            }
        });
        return () => {
            console.log("[Nav AuthEffect] Unsubscribing from onAuthStateChanged.");
            unsubscribeAuth();
        };
    }, [initializingAuth]); // Only re-run if initializingAuth changes

    // --- Navigators ---
    function AuthNavigator() {
        return (
            <AuthStack.Navigator screenOptions={{ headerShown: false }}>
                <AuthStack.Screen name="Login" component={LoginScreen} />
                <AuthStack.Screen name="Signup" component={SignupScreen} />
            </AuthStack.Navigator>
        );
    }

    function MainTabNavigator() {
        return (
            <Tab.Navigator
                screenOptions={({ route }) => ({
                    headerStyle: { backgroundColor: colors?.surface || '#1E1E1E' },
                    headerTintColor: colors?.primaryTeal || '#4DB6AC',
                    headerTitleStyle: { fontWeight: 'bold', color: colors?.textPrimary || '#E0E0E0' },
                    tabBarActiveTintColor: colors?.primaryTeal || '#4DB6AC',
                    tabBarInactiveTintColor: colors?.textSecondary || '#B0B0B0',
                    tabBarStyle: {
                        backgroundColor: colors?.surface || '#1E1E1E',
                        borderTopColor: colors?.border || '#424242',
                        height: Platform.OS === 'android' ? 60 : 80,
                        paddingBottom: Platform.OS === 'android' ? 5 : 20,
                    },
                    tabBarLabelStyle: { fontSize: 10, fontWeight: '500' },
                    tabBarIcon: ({ focused, color, size }) => {
                        let iconName = 'alert-circle-outline';
                        if (route.name === 'HomeTab') {
                            iconName = focused ? 'home' : 'home-outline';
                        } else if (route.name === 'WishlistTab') {
                            iconName = focused ? 'heart' : 'heart-outline';
                        } else if (route.name === 'ChatBotTab') {
                            iconName = focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
                        } else if (route.name === 'ChatListTab') {
                            iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
                        } else if (route.name === 'ProfileTab') {
                            iconName = focused ? 'person-circle' : 'person-circle-outline';
                        }
                        return <Ionicons name={iconName} size={focused ? size + 2 : size} color={color} />;
                    },
                })}
            >
                <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: 'Home', headerShown: false, tabBarLabel: 'Home' }} />
                <Tab.Screen name="WishlistTab" component={WishlistScreen} options={{ title: 'Wishlist', tabBarLabel: 'Wishlist' }} />
                <Tab.Screen name="ChatBotTab" component={ChatBotScreen} options={{ title: 'Chat Bot', tabBarLabel: 'AI Bot' }} />
                <Tab.Screen name="ChatListTab" component={ChatListScreen} options={{ title: 'Chats', tabBarLabel: 'Chats' }} />
                <Tab.Screen name="ProfileTab" component={UserProfileScreen} initialParams={{ userId: auth.currentUser?.uid }} options={{ title: 'My Profile', tabBarLabel: 'Profile' }} />
            </Tab.Navigator>
        );
    }

    function AppNavigator() {
        return (
            <AppStack.Navigator
                initialRouteName="MainTabs"
                screenOptions={{
                    headerStyle: { backgroundColor: colors?.surface || '#1E1E1E' },
                    headerTintColor: colors?.primaryTeal || '#4DB6AC',
                    headerTitleStyle: { fontWeight: 'bold', color: colors?.textPrimary || '#E0E0E0' },
                }}
            >
                <AppStack.Screen name="MainTabs" component={MainTabNavigator} options={{ headerShown: false }} />
                <AppStack.Screen name="Details" component={ProductDetailScreen} options={{ title: 'Product Details' }} />
                <AppStack.Screen name="SubmitItem" component={SubmissionForm} options={{ title: 'List New Item' }} />
                <AppStack.Screen name="GroupChat" component={GroupChatScreen} options={({ route }) => ({ title: route.params?.groupName || 'Group Chat' })} />
                <AppStack.Screen name="PrivateChat" component={PrivateChatScreen} options={({ route }) => ({ title: route.params?.recipientName || 'Chat' })} />
                <AppStack.Screen name="SellerReviews" component={SellerReviewsScreen} options={({ route }) => ({ title: `${route.params?.sellerName || 'Seller'}'s Reviews` })} />
                <AppStack.Screen name="EditProduct" component={EditProductScreen} options={{ title: 'Edit Listing' }} />
                <AppStack.Screen name="UserProfile" component={UserProfileScreen} options={({ route }) => ({ title: route.params?.userName || 'Profile' })} />
                <AppStack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: 'Edit Profile' }} />
                <AppStack.Screen name="SellerStore" component={UserProfileScreen} options={({ route }) => ({ title: `${route.params?.sellerName || 'Seller'}'s Store` })} />
                <AppStack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
                <AppStack.Screen name="FollowListScreen" component={FollowListScreen} /* Options can be set dynamically in the screen */ />
            </AppStack.Navigator>
        );
    }

    const navigationTheme = useMemo(() => {
        // Fallback for colors if not yet available from ThemeContext during initial renders
        const currentColors = colors || (isDarkMode ? NavigationDarkTheme.colors : NavigationDefaultTheme.colors);
        const baseTheme = isDarkMode ? NavigationDarkTheme : NavigationDefaultTheme;

        return {
            ...baseTheme,
            colors: {
                ...baseTheme.colors,
                primary: currentColors.primaryTeal || baseTheme.colors.primary,
                background: currentColors.background || baseTheme.colors.background,
                card: currentColors.surface || baseTheme.colors.card,
                text: currentColors.textPrimary || baseTheme.colors.text,
                border: currentColors.border || baseTheme.colors.border,
                notification: currentColors.primaryGreen || baseTheme.colors.notification, // Standard React Navigation key
            },
        };
    }, [isDarkMode, colors]);

    // Loading state
    if (initializingAuth || !colors) { // Also wait for colors to be available
        const loadingBackgroundColor = colors ? colors.background : (isDarkMode ? '#121212' : '#ffffff');
        const loadingIndicatorColor = colors ? colors.primaryTeal : '#007bff';
        const loadingTextColor = colors ? colors.textPrimary : (isDarkMode ? '#E0E0E0' : '#000000');
        console.log("[Nav] Rendering loading view. initializingAuth:", initializingAuth, "Colors defined:", !!colors);
        return (
            <View style={[styles.loadingContainer, { backgroundColor: loadingBackgroundColor }]}>
                <ActivityIndicator size="large" color={loadingIndicatorColor} />
                <Text style={{ color: loadingTextColor, marginTop: 10 }}>
                    {initializingAuth ? "Authenticating..." : "Loading theme..."}
                </Text>
            </View>
        );
    }

    console.log(`[Nav] Rendering NavigationContainer. User: ${user ? user.uid : 'null'}`);
    return (
        <NavigationContainer theme={navigationTheme} ref={navigationRef}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} backgroundColor={colors.background} />
            {user ? <AppNavigator /> : <AuthNavigator />}
        </NavigationContainer>
    );
}

export default function RootNavigator() {
    console.log("[RootNavigator] Rendering ThemeProvider and ThemedNavigation.");
    return (
        <ThemeProvider>
            <ThemedNavigation />
        </ThemeProvider>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    }
});
