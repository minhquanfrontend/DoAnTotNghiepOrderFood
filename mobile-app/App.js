"use client"

import { useEffect, useState } from "react"
import { NavigationContainer } from "@react-navigation/native"
import { Provider as PaperProvider } from "react-native-paper"
import * as SplashScreen from "expo-splash-screen"
import { useFonts, Roboto_400Regular, Roboto_700Bold } from "@expo-google-fonts/roboto"

// Screens
import AuthNavigator from "./src/navigation/AuthNavigator"
import MainNavigator from "./src/navigation/MainNavigator"
import { AuthProvider, useAuth } from "./src/context/AuthContext"
import { CartProvider } from "./src/context/CartContext"
import { theme } from "./src/theme/theme"
import RequestRoleScreen from "./src/screens/Profile/RequestRoleScreen"






// Keep splash until ready
SplashScreen.preventAutoHideAsync()

function AppContent() {
  const { user, loading } = useAuth();
  const [fontsLoaded] = useFonts({
    "Roboto-Regular": Roboto_400Regular,
    "Roboto-Bold": Roboto_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded && !loading) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, loading]);

  if (!fontsLoaded || loading) {
    return null;
  }

  return (
    <NavigationContainer key={user ? user.id : 'guest'}>
      <MainNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <PaperProvider theme={theme}>
      <AuthProvider>
        <CartProvider>
          <AppContent />
        </CartProvider>
      </AuthProvider>
    </PaperProvider>
    
  )
}

