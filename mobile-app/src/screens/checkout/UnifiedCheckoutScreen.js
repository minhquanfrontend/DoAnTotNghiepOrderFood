import React, { useEffect, useState, useMemo, useCallback } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Linking,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { theme } from "../../theme/theme"
import { useCart } from "../../context/CartContext"
import { useFocusEffect } from "@react-navigation/native"
import { orderAPI, paymentAPI, authAPI } from "../../services/api"
import AsyncStorage from "@react-native-async-storage/async-storage"

/**
 * UNIFIED CHECKOUT SCREEN - Like GrabFood/ShopeeFood
 * Single screen for:
 * 1. Delivery address
 * 2. Order summary
 * 3. Payment method selection
 * 4. Place order
 */
const UnifiedCheckoutScreen = ({ route, navigation }) => {
  const { cart, getCartTotal, clearCart } = useCart()
  
  // Address state
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")
  const [coords, setCoords] = useState(null)
  const [note, setNote] = useState("")
  
  // Payment state
  const [selectedMethod, setSelectedMethod] = useState("cash")
  
  // UI state
  const [loading, setLoading] = useState(false)
  const [loadingProfile, setLoadingProfile] = useState(true)

  // Restaurant info from cart
  const restaurant = cart?.restaurant || route?.params?.restaurant

  // Load address from AsyncStorage when screen is focused (after returning from AddressPicker)
  useFocusEffect(
    useCallback(() => {
      const loadSelectedAddress = async () => {
        console.log('[UnifiedCheckout] Screen focused, checking for new address...')
        
        // Always try to load from temp_selected_address first (set by AddressPicker)
        try {
          const raw = await AsyncStorage.getItem('temp_selected_address')
          console.log('[UnifiedCheckout] temp_selected_address raw:', raw)
          
          if (raw) {
            const data = JSON.parse(raw)
            // Use if recent (within 5 minutes)
            const isRecent = data.timestamp && (Date.now() - data.timestamp < 300000)
            console.log('[UnifiedCheckout] Temp data:', data, 'isRecent:', isRecent)
            
            if (isRecent && data.address) {
              console.log('[UnifiedCheckout] ✅ Setting address from temp:', data.address)
              setAddress(data.address)
              
              if (data.coords) {
                const lat = data.coords.lat ?? data.coords.latitude
                const lng = data.coords.lng ?? data.coords.longitude
                if (typeof lat === "number" && typeof lng === "number") {
                  console.log('[UnifiedCheckout] ✅ Setting coords:', { lat, lng })
                  setCoords({ lat, lng })
                }
              }
              // Clear temp storage after reading
              await AsyncStorage.removeItem('temp_selected_address')
              return // Got address from temp, done
            }
          }
        } catch (e) {
          console.error('[UnifiedCheckout] Error reading temp address:', e)
        }
      }
      loadSelectedAddress()
    }, [])
  )

  // Load saved address and phone on mount
  useEffect(() => {
    const loadDefaults = async () => {
      try {
        // Load saved address
        if (!route?.params?.selectedAddress) {
          const raw = await AsyncStorage.getItem("default_delivery_address")
          if (raw) {
            const obj = JSON.parse(raw)
            if (obj?.address) setAddress(obj.address)
            if (typeof obj?.lat === "number" && typeof obj?.lng === "number") {
              setCoords({ lat: obj.lat, lng: obj.lng })
            }
          }
        }
        
        // Load phone from profile
        try {
          const profile = await authAPI.getProfile()
          const p = profile?.phone || profile?.phone_number || profile?.mobile
          if (p) setPhone(String(p))
          
          // Also try to get address from profile if not set
          if (!address) {
            const profileAddr = profile?.address || profile?.delivery_address
            if (profileAddr) setAddress(profileAddr)
          }
        } catch {}
      } catch {}
      setLoadingProfile(false)
    }
    loadDefaults()
  }, [])

  // Geocode address to coordinates
  const geocodeAddress = async (query) => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=vn&q=${encodeURIComponent(query)}`
      const res = await fetch(url, { headers: { "User-Agent": "food-delivery-app/1.0" } })
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      }
    } catch {}
    return null
  }

  // Calculate totals
  const subtotal = useMemo(() => {
    return Number(getCartTotal()) || 0
  }, [cart])

  const deliveryFee = useMemo(() => {
    // Simple delivery fee calculation - can be enhanced
    return 15000
  }, [])

  const total = useMemo(() => {
    return subtotal + deliveryFee
  }, [subtotal, deliveryFee])

  const formatVND = (amount) => {
    return Number(amount || 0).toLocaleString("vi-VN") + "đ"
  }

  // Payment methods
  const paymentMethods = [
    {
      id: "cash",
      name: "Tiền mặt (COD)",
      description: "Thanh toán khi nhận hàng",
      icon: "cash-outline",
      color: theme.colors.success,
    },
    {
      id: "vnpay",
      name: "VNPay",
      description: "Thanh toán online qua VNPay",
      icon: "card-outline",
      color: "#0066CC",
    },
  ]

  // Validate before placing order
  const validateOrder = () => {
    if (!address.trim()) {
      Alert.alert("Thiếu địa chỉ", "Vui lòng nhập địa chỉ giao hàng")
      return false
    }
    if (!phone.trim()) {
      Alert.alert("Thiếu số điện thoại", "Vui lòng nhập số điện thoại người nhận")
      return false
    }
    if (!cart?.items?.length) {
      Alert.alert("Giỏ hàng trống", "Vui lòng thêm món ăn vào giỏ hàng")
      return false
    }
    return true
  }

  // Place order - SINGLE ACTION
  const handlePlaceOrder = async () => {
    if (!validateOrder()) return

    setLoading(true)

    try {
      // Prepare order items - extract food_id properly
      const items = (cart?.items || []).map((it) => {
        // Try multiple ways to get food_id
        let foodId = null
        if (it.food_id) {
          foodId = typeof it.food_id === "object" ? it.food_id?.id : it.food_id
        } else if (it.food) {
          foodId = typeof it.food === "object" ? it.food?.id : it.food
        } else if (it.foodId) {
          foodId = it.foodId
        }
        
        // Ensure foodId is a valid number
        foodId = parseInt(foodId, 10)
        if (isNaN(foodId) || foodId <= 0) {
          console.warn('[UnifiedCheckout] Invalid food_id for item:', it)
          return null
        }
        
        return {
          food_id: foodId,
          quantity: Number(it.quantity) || 1,
          notes: it.notes || "",
        }
      }).filter(Boolean)

      // Resolve coordinates
      let resolvedCoords = coords
      if (!resolvedCoords && address && address.length > 5) {
        resolvedCoords = await geocodeAddress(address)
      }

      // Create order payload - ensure all values are properly formatted
      // Limit to 2 decimal places to avoid "too many digits" error from backend
      const safeToFixed = (val) => {
        const num = Number(val)
        return isNaN(num) ? 0 : Math.round(num * 100) / 100
      }
      
      const orderPayload = {
        items,
        total_amount: safeToFixed(total),
        subtotal: safeToFixed(subtotal),
        delivery_fee: safeToFixed(deliveryFee),
        delivery_address: address.trim(),
        delivery_phone: phone.trim(),
        payment_method: selectedMethod || 'cash',
        notes: note || '',
      }

      // Only add coordinates if they exist and are valid numbers
      // Limit to 6 decimal places to avoid "too many digits" error from backend
      if (resolvedCoords) {
        const latVal = resolvedCoords.lat ?? resolvedCoords.latitude
        const lngVal = resolvedCoords.lng ?? resolvedCoords.longitude
        const lat = Number(latVal)
        const lng = Number(lngVal)
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
          orderPayload.delivery_latitude = Math.round(lat * 1000000) / 1000000
          orderPayload.delivery_longitude = Math.round(lng * 1000000) / 1000000
        }
      }
      
      console.log('[UnifiedCheckout] Order payload:', JSON.stringify(orderPayload, null, 2))

      // Create order
      const order = await orderAPI.createOrder(orderPayload)

      if (!order?.id) {
        throw new Error("Không thể tạo đơn hàng")
      }

      // Process payment based on method
      if (selectedMethod === "cash") {
        // COD - Order created, waiting for seller confirmation
        await clearCart()
        
        Alert.alert(
          "Đặt hàng thành công! 🎉",
          "Đơn hàng của bạn đã được gửi đến nhà hàng. Bạn sẽ thanh toán khi nhận hàng.",
          [
            {
              text: "Theo dõi đơn hàng",
              onPress: () => navigation.replace("OrderTrackingScreen", { orderId: order.id }),
            },
          ]
        )
      } else if (selectedMethod === "vnpay") {
        // VNPay - Create payment and redirect
        try {
          const paymentResponse = await paymentAPI.createPayment({
            order_id: order.id,
            payment_method: "vnpay",
          })

          const paymentUrl = paymentResponse?.payment_url || 
                            paymentResponse?.data?.payment_url || 
                            paymentResponse?.redirect_url

          if (paymentUrl) {
            await clearCart()
            await Linking.openURL(String(paymentUrl))
            navigation.replace("OrderTrackingScreen", { orderId: order.id })
          } else {
            throw new Error("Không thể tạo thanh toán VNPay")
          }
        } catch (paymentError) {
          console.error("VNPay error:", paymentError)
          Alert.alert(
            "Lỗi thanh toán",
            "Không thể tạo thanh toán VNPay. Đơn hàng đã được tạo, bạn có thể thanh toán lại sau.",
            [
              {
                text: "Xem đơn hàng",
                onPress: () => navigation.replace("OrderTrackingScreen", { orderId: order.id }),
              },
            ]
          )
        }
      }
    } catch (error) {
      console.error("Order error:", error)
      console.error("Order error response:", JSON.stringify(error?.response?.data, null, 2))
      const errorData = error?.response?.data
      let msg = "Không thể tạo đơn hàng"
      if (errorData?.errors) {
        // Serializer validation errors
        const errorMessages = Object.entries(errorData.errors)
          .map(([field, errors]) => `${field}: ${Array.isArray(errors) ? errors.join(', ') : errors}`)
          .join('\n')
        msg = errorMessages || msg
      } else if (errorData?.error) {
        msg = errorData.error
      } else if (errorData?.message) {
        msg = errorData.message
      } else if (error?.message) {
        msg = error.message
      }
      Alert.alert("Lỗi đặt hàng", msg)
    } finally {
      setLoading(false)
    }
  }

  if (loadingProfile) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* 1. DELIVERY ADDRESS SECTION */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="location" size={24} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>Địa chỉ giao hàng</Text>
          </View>
          
          <TextInput
            style={styles.addressInput}
            placeholder="Nhập địa chỉ giao hàng..."
            value={address}
            onChangeText={setAddress}
            multiline
          />
          
          <TouchableOpacity
            style={styles.mapButton}
            onPress={() => navigation.navigate("AddressPicker", { 
              from: "Checkout", 
              saveAsDefault: true 
            })}
          >
            <Ionicons name="map-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.mapButtonText}>Chọn trên bản đồ</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.phoneInput}
            placeholder="Số điện thoại người nhận"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
          />

          <TextInput
            style={styles.noteInput}
            placeholder="Ghi chú cho shipper (tùy chọn)"
            value={note}
            onChangeText={setNote}
          />
        </View>

        {/* 2. RESTAURANT INFO */}
        {restaurant && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="restaurant" size={24} color={theme.colors.primary} />
              <Text style={styles.sectionTitle}>Nhà hàng</Text>
            </View>
            <Text style={styles.restaurantName}>{restaurant.name}</Text>
            <Text style={styles.restaurantAddress}>{restaurant.address}</Text>
          </View>
        )}

        {/* 3. ORDER SUMMARY */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="receipt" size={24} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>Chi tiết đơn hàng</Text>
          </View>

          {(cart?.items || []).map((item, index) => (
            <View key={index} style={styles.orderItem}>
              <View style={styles.itemInfo}>
                <Text style={styles.itemQuantity}>{item.quantity}x</Text>
                <Text style={styles.itemName}>
                  {item.food?.name || item.name || "Món ăn"}
                </Text>
              </View>
              <Text style={styles.itemPrice}>
                {formatVND((item.food?.price || item.price || 0) * item.quantity)}
              </Text>
            </View>
          ))}

          <View style={styles.divider} />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Tạm tính</Text>
            <Text style={styles.summaryValue}>{formatVND(subtotal)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Phí giao hàng</Text>
            <Text style={styles.summaryValue}>{formatVND(deliveryFee)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Tổng cộng</Text>
            <Text style={styles.totalValue}>{formatVND(total)}</Text>
          </View>
        </View>

        {/* 4. PAYMENT METHOD */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="wallet" size={24} color={theme.colors.primary} />
            <Text style={styles.sectionTitle}>Phương thức thanh toán</Text>
          </View>

          {paymentMethods.map((method) => (
            <TouchableOpacity
              key={method.id}
              style={[
                styles.paymentMethod,
                selectedMethod === method.id && styles.selectedPaymentMethod,
              ]}
              onPress={() => setSelectedMethod(method.id)}
            >
              <View style={styles.methodLeft}>
                <View style={[styles.methodIcon, { backgroundColor: method.color }]}>
                  <Ionicons name={method.icon} size={24} color="white" />
                </View>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodName}>{method.name}</Text>
                  <Text style={styles.methodDescription}>{method.description}</Text>
                </View>
              </View>
              <View
                style={[
                  styles.radioButton,
                  selectedMethod === method.id && styles.radioButtonSelected,
                ]}
              >
                {selectedMethod === method.id && (
                  <Ionicons name="checkmark" size={16} color="white" />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Security note */}
        <View style={styles.securityInfo}>
          <Ionicons name="shield-checkmark" size={20} color={theme.colors.success} />
          <Text style={styles.securityText}>
            Thông tin của bạn được bảo mật an toàn
          </Text>
        </View>
      </ScrollView>

      {/* PLACE ORDER BUTTON */}
      <View style={styles.footer}>
        <View style={styles.footerTotal}>
          <Text style={styles.footerTotalLabel}>Tổng thanh toán</Text>
          <Text style={styles.footerTotalValue}>{formatVND(total)}</Text>
        </View>
        <TouchableOpacity
          style={[styles.placeOrderButton, loading && styles.buttonDisabled]}
          onPress={handlePlaceOrder}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color="white" />
              <Text style={styles.placeOrderText}>Đặt hàng</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flex: 1,
  },
  section: {
    backgroundColor: theme.colors.surface,
    margin: 12,
    marginBottom: 0,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: theme.colors.text,
    marginLeft: 8,
  },
  addressInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: "top",
  },
  mapButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: 8,
    borderStyle: "dashed",
  },
  mapButtonText: {
    color: theme.colors.primary,
    marginLeft: 8,
    fontWeight: "500",
  },
  phoneInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginTop: 12,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginTop: 8,
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
  },
  restaurantAddress: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  orderItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  itemInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  itemQuantity: {
    fontSize: 14,
    fontWeight: "600",
    color: theme.colors.primary,
    marginRight: 8,
    minWidth: 30,
  },
  itemName: {
    fontSize: 14,
    color: theme.colors.text,
    flex: 1,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: "500",
    color: theme.colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: 12,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  summaryValue: {
    fontSize: 14,
    color: theme.colors.text,
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: theme.colors.text,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: theme.colors.primary,
  },
  paymentMethod: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
    backgroundColor: theme.colors.background,
  },
  selectedPaymentMethod: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
    backgroundColor: theme.colors.primary + "10",
  },
  methodLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  methodIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  methodInfo: {
    flex: 1,
  },
  methodName: {
    fontSize: 15,
    fontWeight: "600",
    color: theme.colors.text,
  },
  methodDescription: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  radioButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  radioButtonSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  securityInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: 16,
    margin: 12,
  },
  securityText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginLeft: 8,
    flex: 1,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  footerTotal: {
    flex: 1,
  },
  footerTotalLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  footerTotalValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: theme.colors.primary,
  },
  placeOrderButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonDisabled: {
    backgroundColor: theme.colors.textSecondary,
  },
  placeOrderText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
    marginLeft: 8,
  },
})

export default UnifiedCheckoutScreen
