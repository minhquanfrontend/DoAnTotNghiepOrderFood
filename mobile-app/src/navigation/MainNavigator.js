"use client"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { createStackNavigator } from "@react-navigation/stack"
import { Ionicons } from "@expo/vector-icons"
import { useAuth } from "../context/AuthContext"

// Screens
import HomeScreen from "../screens/main/HomeScreen"
import SearchScreen from "../screens/main/SearchScreen"
import CartScreen from "../screens/main/CartScreen"
import OrdersScreen from "../screens/main/OrdersScreen"
import ProfileScreen from "../screens/main/ProfileScreen"
import NotificationsScreen from "../screens/main/NotificationsScreen"
import WalletScreen from "../screens/main/WalletScreen"

// Customer screens
import RestaurantDetailScreen from "../screens/customer/RestaurantDetailScreen"
import FoodDetailScreen from "../screens/customer/FoodDetailScreen"
import OrderDetailScreen from "../screens/customer/OrderDetailScreen"
import OrderTrackingScreen from "../screens/customer/OrderTrackingScreen"
import OrderSuccessScreen from "../screens/checkout/OrderSuccessScreen"
import UnifiedCheckoutScreen from "../screens/checkout/UnifiedCheckoutScreen"
import GuestCheckoutScreen from "../screens/customer/GuestCheckoutScreen"
import TrackGuestOrderScreen from "../screens/customer/TrackGuestOrderScreen"

// Seller screens
import SellerDashboardScreen from "../screens/seller/SellerDashboardScreen"
import ManageFoodsScreen from "../screens/seller/ManageFoodsScreen"
import SellerOrdersScreen from "../screens/seller/SellerOrdersScreen"
import SellerPostsListScreen from "../screens/seller/SellerPostsListScreen"
import CreateSellerPostScreen from "../screens/seller/CreateSellerPostScreen"
import SellerAnalyticsScreen from "../screens/seller/SellerAnalyticsScreen"

// Shipper screens
import ShipperDashboardScreen from "../screens/shipper/ShipperDashboardScreen"
import DeliveryMapScreen from "../screens/shipper/DeliveryMapScreen"

// Auth screens
import LoginScreen from "../screens/auth/LoginScreen"
import RegisterScreen from "../screens/auth/RegisterScreen"
import RequestRoleScreen from "../screens/Profile/RequestRoleScreen"



// AI screens
import AIChatScreen from "../screens/ai/AIChatScreen"
import EditProfileScreen from "../screens/main/EditProfileScreen"
import MyRequestsScreen from "../screens/account/MyRequestsScreen"
import PromotionsListScreen from "../screens/restaurant/PromotionsListScreen"
import CreatePromotionScreen from "../screens/restaurant/CreatePromotionScreen"
import LocationSelectScreen from "../screens/main/LocationSelectScreen"
import AddressPickerScreen from "../screens/common/AddressPickerScreen"
import SetWorkLocationScreen from "../screens/shipper/SetWorkLocationScreen"
import WaitingForShipperScreen from "../screens/checkout/WaitingForShipperScreen"
import UpdateRestaurantLocationScreen from "../screens/seller/UpdateRestaurantLocationScreen"

// Admin screens
import {
  AdminDashboardScreen,
  AdminRevenueScreen,
  AdminSellersScreen,
  AdminOperationsScreen,
  AdminUsersScreen,
} from "../screens/admin"

const Tab = createBottomTabNavigator()
const Stack = createStackNavigator()

// ---------------- Customer Tabs ----------------
function CustomerTabs() {
  const { user } = useAuth();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName
          if (route.name === "Home") {
            iconName = focused ? "home" : "home-outline"
          } else if (route.name === "Search") {
            iconName = focused ? "search" : "search-outline"
          } else if (route.name === "Cart") {
            iconName = focused ? "bag" : "bag-outline"
          } else if (route.name === "Orders") {
            iconName = focused ? "list" : "list-outline"
          } else if (route.name === "Profile") {
            iconName = focused ? "person" : "person-outline"
          }
          return <Ionicons name={iconName} size={size} color={color} />
        },
        tabBarActiveTintColor: "#FF6B35",
        tabBarInactiveTintColor: "gray",
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: "Trang chủ" }} />
      <Tab.Screen name="Search" component={SearchScreen} options={{ title: "Tìm kiếm" }} />
      <Tab.Screen name="Cart" component={CartScreen} options={{ title: "Giỏ hàng" }} />
      <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: "Đơn hàng" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: user ? "Tài khoản" : "Đăng nhập" }} />
    </Tab.Navigator>
  )
}

// ---------------- Seller Tabs ----------------
function SellerTabs() {
  const { user } = useAuth();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === "Dashboard") {
            iconName = focused ? "stats-chart" : "stats-chart-outline";
          } else if (route.name === "ManageFoods") {
            iconName = focused ? "restaurant" : "restaurant-outline";
          } else if (route.name === "SellerAnalytics") {
            iconName = focused ? "analytics" : "analytics-outline";
          } else if (route.name === "SellerOrders") {
            iconName = focused ? "receipt" : "receipt-outline";
          } else if (route.name === "Profile") {
            iconName = focused ? "person" : "person-outline";
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: "#FF6B35",
        tabBarInactiveTintColor: "gray",
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={SellerDashboardScreen} options={{ title: "Tổng quan" }} />
      <Tab.Screen name="ManageFoods" component={ManageFoodsScreen} options={{ title: "Món ăn" }} />
      <Tab.Screen name="SellerAnalytics" component={SellerAnalyticsScreen} options={{ title: "Phân tích" }} />
      <Tab.Screen name="SellerOrders" component={SellerOrdersScreen} options={{ title: "Đơn hàng" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: user ? "Tài khoản" : "Đăng nhập" }} />
    </Tab.Navigator>
  )
}

// ---------------- Shipper Tabs ----------------
function ShipperTabs() {
  const { user } = useAuth();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName
          if (route.name === "ShipperDashboard") {
            iconName = focused ? "bicycle" : "bicycle-outline"
          } else if (route.name === "DeliveryMap") {
            iconName = focused ? "map" : "map-outline"
          } else if (route.name === "Profile") {
            iconName = focused ? "person" : "person-outline"
          }
          return <Ionicons name={iconName} size={size} color={color} />
        },
        tabBarActiveTintColor: "#FF6B35",
        tabBarInactiveTintColor: "gray",
        headerShown: false,
      })}
    >
      <Tab.Screen name="ShipperDashboard" component={ShipperDashboardScreen} options={{ title: "Đơn giao" }} />
      <Tab.Screen name="DeliveryMap" component={DeliveryMapScreen} options={{ title: "Bản đồ" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: user ? "Tài khoản" : "Đăng nhập" }} />
    </Tab.Navigator>
  )
}

// ---------------- Main Navigator ----------------
export default function MainNavigator() {
  const { user } = useAuth()

  const getTabNavigator = () => {
    switch (user?.user_type) {
      case "seller":
      case "restaurant":
        return SellerTabs
      case "shipper":
        return ShipperTabs
      default:
        return CustomerTabs
    }
  }

  const TabNavigator = getTabNavigator()

  return (
    <Stack.Navigator>
      {/* Tabs theo vai trò */}
      <Stack.Screen name="MainTabs" component={TabNavigator} options={{ headerShown: false }} />

      {/* Customer screens */}
      <Stack.Screen name="RestaurantDetail" component={RestaurantDetailScreen} options={{ title: "Chi tiết nhà hàng" }} />
      <Stack.Screen name="FoodDetail" component={FoodDetailScreen} options={{ title: "Chi tiết món ăn" }} />
      <Stack.Screen name="Checkout" component={UnifiedCheckoutScreen} options={{ title: "Đặt hàng" }} />
      <Stack.Screen name="OrderSuccess" component={OrderSuccessScreen} options={{ title: "Đặt hàng thành công" }} />
      <Stack.Screen name="OrderDetail" component={OrderDetailScreen} options={{ title: "Chi tiết đơn hàng" }} />
      <Stack.Screen name="OrderTrackingScreen" component={OrderTrackingScreen} options={{ title: "Theo dõi đơn hàng" }} />
      {/* Ensure Cart is always reachable */}
      <Stack.Screen name="Cart" component={CartScreen} options={{ title: "Giỏ hàng" }} />

      {/* AI chat */}
      <Stack.Screen name="AIChat" component={AIChatScreen} options={{ title: "Bot Tư Vấn " }} />

      {/* Auth screens */}
      <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Register" component={RegisterScreen} options={{ headerShown: false }} />
      
      {/* Home */}
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: "Trang chủ" }} />

      {/* Profile chi tiết/chỉnh sửa */}
      <Stack.Screen name="EditProfile" component={EditProfileScreen} options={{ title: "Chỉnh sửa hồ sơ" }} />
      
      <Stack.Screen
        name="RequestRole"
        component={RequestRoleScreen}
        options={{ title: "Đăng ký vai trò" }}
      />
      <Stack.Screen name="MyRequests" component={MyRequestsScreen} options={{ title: "Lịch sử yêu cầu" }} />
      <Stack.Screen name="SellerAnalytics" component={SellerAnalyticsScreen} options={{ title: "Phân tích Doanh thu" }} />
  <Stack.Screen name="PromotionsList" component={PromotionsListScreen} options={{ title: "Khuyến mãi" }} />
  <Stack.Screen name="CreatePromotion" component={CreatePromotionScreen} options={{ title: "Tạo khuyến mãi" }} />
  <Stack.Screen name="SellerPosts" component={SellerPostsListScreen} options={{ title: "Bài đăng bán" }} />
  <Stack.Screen name="CreateSellerPost" component={CreateSellerPostScreen} options={{ title: "Tạo bài đăng" }} />

      {/* Location select */}
      <Stack.Screen name="LocationSelect" component={LocationSelectScreen} options={{ title: "Chọn khu vực" }} />
      <Stack.Screen name="AddressPicker" component={AddressPickerScreen} options={{ title: "Chọn trên bản đồ" }} />
      <Stack.Screen name="SetWorkLocation" component={SetWorkLocationScreen} options={{ title: "Đặt điểm bắt đơn" }} />
      <Stack.Screen name="WaitingForShipper" component={WaitingForShipperScreen} options={{ title: "Đang chờ shipper" }} />
      <Stack.Screen name="UpdateRestaurantLocation" component={UpdateRestaurantLocationScreen} options={{ title: "Cập nhật địa điểm" }} />

      {/* Guest Checkout (No Login Required) */}
      <Stack.Screen name="GuestCheckout" component={GuestCheckoutScreen} options={{ title: "Đặt hàng" }} />
      <Stack.Screen name="TrackGuestOrder" component={TrackGuestOrderScreen} options={{ title: "Theo dõi đơn hàng" }} />

      {/* Admin screens */}
      <Stack.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: "Admin Dashboard" }} />
      <Stack.Screen name="AdminRevenue" component={AdminRevenueScreen} options={{ title: "Doanh thu hệ thống" }} />
      <Stack.Screen name="AdminSellers" component={AdminSellersScreen} options={{ title: "Quản lý Seller" }} />
      <Stack.Screen name="AdminOperations" component={AdminOperationsScreen} options={{ title: "Giám sát vận hành" }} />
      <Stack.Screen name="AdminUsers" component={AdminUsersScreen} options={{ title: "Quản lý Users" }} />

    </Stack.Navigator>
  )
}
