// navigation/navigation.js

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

import { auth, firestore } from '../firebaseConfig';
import { ThemeProvider, useTheme } from '../src/ThemeContext';

import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';

// --- Import all your screens ---
import AnalyticsScreen from '../screens/AnalyticsScreen';
import ChatBotScreen from '../screens/ChatBotScreen';
import ChatListScreen from '../screens/ChatListScreen';
import EditProductScreen from '../screens/EditProductScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import FollowListScreen from '../screens/FollowListScreen';
import GroupChatScreen from '../screens/GroupChatScreen';
import HomeScreen from '../screens/HomeScreen';
import LoginScreen from '../screens/LoginScreen';
import MapScreen from '../screens/MapScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import PrivateChatScreen from '../screens/PrivateChatScreen';
import ProductDetailScreen from '../screens/ProductDetailScreen';
import SavedSearchesScreen from '../screens/SavedSearchesScreen';
import SellerReviewsScreen from '../screens/SellerReviewScreen';
import SignupScreen from '../screens/SignupScreen';
import SubmissionForm from '../screens/SubmissionForm';
import UserProfileScreen from '../screens/UserProfileScreen';
import WishlistScreen from '../screens/WishListScreen';

const AuthStack = createNativeStackNavigator();
const AppStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// --- Push Notification Setup ---

// This function registers the device for push notifications and stores the token.
async function registerForPushNotificationsAsync(userId) {
  if (!userId) {
    console.log("[PushNotifications] No user ID, skipping registration.");
    return null;
  }
  
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
  
  // Get the Expo push token.
  const token = (await Notifications.getExpoPushTokenAsync()).data;
  
  // Store the token in Firestore for the current user.
  if (token) {
    try {
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
        }, { merge: true });
      console.log('[PushNotifications] Push token stored successfully for user:', userId);
    } catch (error) {
      console.error('[PushNotifications] Error storing push token in Firestore:', error);
    }
  }
  return token;
}

// This sets how notifications are handled when the app is in the foreground.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});


// --- Main Navigation Component ---

const ThemedNavigation = () => {
    const [initializing, setInitializing] = useState(true);
    const [user, setUser] = useState(null);
    const { colors, isDarkMode } = useTheme();
    const navigationRef = useNavigationContainerRef();

    // --- Deep Linking Configuration ---
    const linking = {
        prefixes: [Linking.createURL('/')], // Uses your app's scheme (e.g., yahdsell2://)
        config: {
            screens: {
                // Define paths for screens in the main AppStack
                Details: 'product/:productId',
                PrivateChat: 'chat/:recipientId',
                UserProfile: 'user/:userId',
                // Add other screens you want to deep link to here
            },
        },
    };

    // --- Authentication State Listener ---
    useEffect(() => {
        const subscriber = auth().onAuthStateChanged(user => {
            setUser(user);
            if (initializing) {
                setInitializing(false);
            }
            if (user) {
                // Register for push notifications when user logs in
                registerForPushNotificationsAsync(user.uid);
            }
        });
        return subscriber; // Unsubscribe on unmount
    }, [initializing]);

    // --- Notification Tapped Listener (for when app is open/backgrounded) ---
    useEffect(() => {
        const subscription = Notifications.addNotificationResponseReceivedListener(response => {
            const url = response.notification.request.content.data.url;
            if (url) {
                Linking.openURL(url);
            }
        });
        return () => subscription.remove();
    }, []);
    
    // --- Navigator Definitions ---
    function AuthNavigator() {
        return (
            <AuthStack.Navigator screenOptions={{ headerShown: false }}>
                <AuthStack.Screen name="Login" component={LoginScreen} />
                <AuthStack.Screen name="Signup" component={SignupScreen} />
            </AuthStack.Navigator>
        );
    }

    function MainTabNavigator() {
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
                        else if (route.name === 'MapTab') iconName = focused ? 'map' : 'map-outline';
                        else if (route.name === 'WishlistTab') iconName = focused ? 'heart' : 'heart-outline';
                        else if (route.name === 'ChatBotTab') iconName = focused ? 'chatbubble-ellipses' : 'chatbubble-ellipses-outline';
                        else if (route.name === 'ChatListTab') iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
                        else if (route.name === 'ProfileTab') iconName = focused ? 'person-circle' : 'person-circle-outline';
                        return <Ionicons name={iconName} size={size} color={color} />;
                    },
                })}
            >
                <Tab.Screen name="HomeTab" component={HomeScreen} options={{ title: 'Home', headerShown: false }} />
                <Tab.Screen name="MapTab" component={MapScreen} options={{ title: 'Map View' }} />
                <Tab.Screen name="WishlistTab" component={WishlistScreen} options={{ title: 'Wishlist' }} />
                <Tab.Screen name="ChatBotTab" component={ChatBotScreen} options={{ title: 'AI Assistant' }} />
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
                <AppStack.Screen name="SavedSearches" component={SavedSearchesScreen} options={{ title: 'My Saved Searches' }} />
                <AppStack.Screen name="Analytics" component={AnalyticsScreen} options={{ title: 'Performance Dashboard' }} />
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
                <ActivityIndicator size="large" color={colors?.primaryTeal || '#008080'} />
            </View>
        );
    }

    return (
        <NavigationContainer theme={navigationTheme} ref={navigationRef} linking={linking}>
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
