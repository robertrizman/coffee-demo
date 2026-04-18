import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigationState, useIsFocused } from '@react-navigation/native';
import { useApp } from './AppContext';
import StoreClosedOverlay from './StoreClosedOverlay';
import { isCurrentlyInBreak } from './storeUtils';
import { trackTabNavigation } from './tealium';

import MenuScreen from './MenuScreen';
import ItemDetailScreen from './ItemDetailScreen';
import OrderSummaryScreen from './OrderSummaryScreen';
import OrdersProfileScreen from './OrdersProfileScreen';
import OffersScreen from './OffersScreen';
import OperatorMenuScreen from './OperatorMenuScreen';
import OperatorOrdersScreen from './OperatorOrdersScreen';
import SettingsScreen from './SettingsScreen';
import BaristaManagementScreen from './BaristaManagementScreen';
import LoginScreen from './LoginScreen';

import { useAuth } from './AuthContext';
import { colors } from './theme';
import { TakeawayCupIcon, ReceiptIcon, BaristaIcon as BaristaHat, TagIcon } from './CoffeeIcons';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function CustomerStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Menu" component={MenuScreen} />
      <Stack.Screen name="ItemDetail" component={ItemDetailScreen} />
      <Stack.Screen name="OrderSummary" component={OrderSummaryScreen} />
    </Stack.Navigator>
  );
}

function OperatorStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="OperatorOrders" component={OperatorOrdersScreen} />
      <Stack.Screen name="OperatorMenu" component={OperatorMenuScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="BaristaManagement" component={BaristaManagementScreen} />
    </Stack.Navigator>
  );
}

// Gate: show login screen if not authenticated
function BaristaTab() {
  const { isAdmin } = useAuth();
  return isAdmin ? <OperatorStack /> : <LoginScreen />;
}

function CupIcon({ focused }) {
  return <TakeawayCupIcon size={24} color={focused ? colors.primary : colors.textMuted} />;
}
function OrdersIcon({ focused }) {
  return <ReceiptIcon size={24} color={focused ? colors.primary : colors.textMuted} />;
}
function OffersIcon({ focused }) {
  return <TagIcon size={24} color={focused ? colors.primary : colors.textMuted} />;
}
function BaristaIcon({ focused }) {
  return <BaristaHat size={24} color={focused ? colors.primary : colors.textMuted} />;
}

export default function AppNavigator() {
  const insets = useSafeAreaInsets();
  const { state } = useApp();

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: '#fff',
            borderTopColor: colors.border,
            borderTopWidth: 1,
            paddingTop: 8,
            height: 60 + insets.bottom,
            paddingBottom: insets.bottom,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarLabelStyle: styles.tabLabel,
        }}
      >
        <Tab.Screen
          name="Order"
          component={CustomerStack}
          listeners={{ focus: () => trackTabNavigation('Order') }}
          options={{ tabBarIcon: ({ focused }) => <CupIcon focused={focused} /> }}
        />
        <Tab.Screen
          name="Orders & Profile"
          component={OrdersProfileScreen}
          listeners={{ focus: () => trackTabNavigation('Orders & Profile') }}
          options={{ tabBarIcon: ({ focused }) => <OrdersIcon focused={focused} /> }}
        />
        {state.offersEnabled !== false && (
          <Tab.Screen
            name="Offers"
            component={OffersScreen}
            listeners={{ focus: () => trackTabNavigation('Offers') }}
            options={{ tabBarIcon: ({ focused }) => <OffersIcon focused={focused} /> }}
          />
        )}
        <Tab.Screen
          name="Barista"
          component={BaristaTab}
          listeners={{ focus: () => trackTabNavigation('Barista') }}
          options={{ tabBarIcon: ({ focused }) => <BaristaIcon focused={focused} /> }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabLabel: { fontSize: 11, fontWeight: '600' },
});
