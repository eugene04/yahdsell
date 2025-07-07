// navigation/index.js

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
import { ActivityIndicator, Alert, Platform, StatusBar, StyleSheet, View } from 'react-native';

// Import the new firebase modules
import { auth, firestore } from '../firebaseConfig';
import { ThemeProvider, useTheme } from '../src/ThemeContext';

import * as Notifications from 'expo-notifications';

// Import Screens (no changes here)
import ChatBotScreen from '../screens/ChatBotScreen';
import ChatListScreen from '../screens/ChatListScreen';
import EditProductScreen from '../screens/EditProductScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import FollowListScreen from '../screens/FollowListScreen';
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
// This function can remain largely the same, but we'll use the new firestore() syntax.
async function registerForPushNotificationsAsync(userId) {
  if (!userId) {
    console.log("[PushNotifications] No user ID, skipping registration.");
    return null;
  }
  // ... (rest of the permission logic is the same)
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') {
    Alert.alert("Permissions Required", "Please enable notifications to receive updates.");
    return null;
  }
  
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  
  if (token) {
    try {
      // Use the new syntax for firestore
      await firestore()
        .collection('users')
        .doc(userId)
        .collection('pushTokens')
        .doc(token)
        .set({
          userId: userId,
          token: token,
          createdAt: firestore.FieldValue.serverTimestamp(),
          platform: Platform.OS,
        });
      console.log('[PushNotifications] Push token stored successfully for user:', userId);
    } catch (error) {
      console.error('[PushNotifications] Error storing push token in Firestore:', error);
    }
  }
  return token;
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});
// --- End Push Notification Helper Functions ---

const ThemedNavigation = () => {
    const [initializing, setInitializing] = useState(true);
    const [user, setUser] = useState(null);
    const { colors, isDarkMode } = useTheme();
    const navigationRef = useNavigationContainerRef();

    // --- NEW: Auth State Listener for @react-native-firebase/auth ---
    useEffect(() => {
        const subscriber = auth().onAuthStateChanged(user => {
            setUser(user);
            if (initializing) {
                setInitializing(false);
            }
            if (user) {
                registerForPushNotificationsAsync(user.uid);
            }
        });
        return subscriber; // unsubscribe on unmount
    }, [initializing]);

    // Notification tap listener (no changes needed here)
    useEffect(() => {
        const subscription = Notifications.addNotificationResponseReceivedListener(response => {
            console.log("[NotificationTap] Notification response received:", response);
            const notificationData = response.notification.request.content.data;
            if (notificationData && user && navigationRef.isReady()) {
                if (notificationData.type === 'private_message' && notificationData.chatId && notificationData.senderId) {
                    navigationRef.navigate('PrivateChat', { recipientId: notificationData.senderId, recipientName: notificationData.senderName || "Chat" });
                } else if (notificationData.type === 'new_offer' && notificationData.productId) {
                    navigationRef.navigate('Details', { productId: notificationData.productId });
                } else if ((notificationData.type === 'offer_accepted' || notificationData.type === 'offer_rejected') && notificationData.productId) {
                    navigationRef.navigate('Details', { productId: notificationData.productId });
                }
            }
        });
        return () => subscription.remove();
    }, [user, navigationRef]);
    
    // --- Navigators (no changes needed to the navigator structure itself) ---
    function AuthNavigator() {
        return (
            <AuthStack.Navigator screenOptions={{ headerShown: false }}>
                <AuthStack.Screen name="Login" component={LoginScreen} />
                <AuthStack.Screen name="Signup" component={SignupScreen} />
            </AuthStack.Navigator>
        );
    }

    function MainTabNavigator() {
        // We need to pass the current user's UID to the ProfileTab
        const currentUserId = auth().currentUser?.uid;

        return (
            <Tab.Navigator
                screenOptions={({ route }) => ({
                    headerStyle: { backgroundColor: colors?.surface },
                    headerTintColor: colors?.primaryTeal,
                    tabBarActiveTintColor: colors?.primaryTeal,
                    tabBarInactiveTintColor: colors?.textSecondary,
                    tabBarStyle: { backgroundColor: colors?.surface, borderTopColor: colors?.border },
                    tabBarIcon: ({ focused, color, size }) => {
                        let iconName;
                        if (route.name === 'HomeTab') iconName = focused ? 'home' : 'home-outline';
                        else if (route.name === 'WishlistTab') iconName = focused ? 'heart' : 'heart-outline';
                        else if (route.name === 'ChatBotTab') iconName = focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
                        else if (route.name === 'ChatListTab') iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
                        else if (route.name === 'ProfileTab') iconName = focused ? 'person-circle' : 'person-circle-outline';
                        return <Ionicons name={iconName} size={size} color={color} />;
                    },
                })}
            >
                <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: 'Home', headerShown: false }} />
                <Tab.Screen name="WishlistTab" component={WishlistScreen} options={{ title: 'Wishlist' }} />
                <Tab.Screen name="ChatBotTab" component={ChatBotScreen} options={{ title: 'Chat Bot' }} />
                <Tab.Screen name="ChatListTab" component={ChatListScreen} options={{ title: 'Chats' }} />
                <Tab.Screen name="ProfileTab" component={UserProfileScreen} initialParams={{ userId: currentUserId }} options={{ title: 'My Profile' }} />
            </Tab.Navigator>
        );
    }

    function AppNavigator() {
        return (
            <AppStack.Navigator
                screenOptions={{
                    headerStyle: { backgroundColor: colors?.surface },
                    headerTintColor: colors?.primaryTeal,
                }}
            >
                <AppStack.Screen name="MainTabs" component={MainTabNavigator} options={{ headerShown: false }} />
                <AppStack.Screen name="Details" component={ProductDetailScreen} />
                <AppStack.Screen name="SubmitItem" component={SubmissionForm} />
                <AppStack.Screen name="GroupChat" component={GroupChatScreen} />
                <AppStack.Screen name="PrivateChat" component={PrivateChatScreen} />
                <AppStack.Screen name="SellerReviews" component={SellerReviewsScreen} />
                <AppStack.Screen name="EditProduct" component={EditProductScreen} />
                <AppStack.Screen name="UserProfile" component={UserProfileScreen} />
                <AppStack.Screen name="EditProfile" component={EditProfileScreen} />
                <AppStack.Screen name="SellerStore" component={UserProfileScreen} />
                <AppStack.Screen name="Notifications" component={NotificationsScreen} />
                <AppStack.Screen name="FollowListScreen" component={FollowListScreen} />
            </AppStack.Navigator>
        );
    }

    const navigationTheme = useMemo(() => {
        const baseTheme = isDarkMode ? NavigationDarkTheme : NavigationDefaultTheme;
        return { ...baseTheme, colors: { ...baseTheme.colors, ...colors }};
    }, [isDarkMode, colors]);

    if (initializing) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primaryTeal} />
            </View>
        );
    }

    return (
        <NavigationContainer theme={navigationTheme} ref={navigationRef}>
            <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
            {user ? <AppNavigator /> : <AuthNavigator />}
        </NavigationContainer>
    );
}

export default function RootNavigator() {
    return (
        <ThemeProvider>
            <ThemedNavigation />
        </ThemeProvider>
    );
}

const styles = StyleSheet.create({
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' }
});
