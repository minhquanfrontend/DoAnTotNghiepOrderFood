import React, { useMemo, useState } from "react"
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Linking } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { theme } from "../../theme/theme"
import { paymentAPI } from "../../services/api"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useCart } from "../../context/CartContext"

const PaymentScreen = ({ route, navigation }) => {
  const { order, offline } = route.params || {}
  const { clearCart } = useCart()
  const [selectedMethod, setSelectedMethod] = useState("cash")
  const [loading, setLoading] = useState(false)

  const toNumber = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const formatVND = (amount) => {
    try {
      return toNumber(amount).toLocaleString("vi-VN") + "đ"
    } catch (e) {
      return String(amount || 0) + "đ"
    }
  }

  const computedTotal = useMemo(() => {
    return toNumber(order?.total_amount) || 0
  }, [order?.total_amount])

  const deliveryAddress = order?.delivery_address || ""
  const deliveryPhone = order?.delivery_phone || ""

  const availablePaymentMethods = [
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

  const processPayment = async () => {
    if (!order?.id) {
      Alert.alert("Lỗi", "Không tìm thấy đơn hàng. Vui lòng thử lại.")
      return
    }

    setLoading(true)

    try {
      if (selectedMethod === "cash") {
        const payment = {
          id: Date.now(),
          payment_method: selectedMethod,
          status: "completed",
          amount: computedTotal,
          offline: !!offline,
        }

        try { 
          await AsyncStorage.setItem("last_order", JSON.stringify({ 
            order, 
            payment, 
            created_at: new Date().toISOString() 
          })) 
        } catch (e) {}
        try { await clearCart() } catch (e) {}
        
        Alert.alert(
          "Thành công",
          "Bạn sẽ thanh toán khi nhận hàng. Đơn đã chuyển cho shipper.",
          [{ text: "OK", onPress: () => navigation.navigate("WaitingForShipper", { orderId: order.id, order }) }]
        )
        return
      }

      if (selectedMethod === "vnpay") {
        try {
          const response = await paymentAPI.createPayment({
            order_id: order.id,
            payment_method: "vnpay",
          })

          const redirectUrl = response?.payment_url || response?.data?.payment_url || response?.redirect_url
          
          if (redirectUrl) {
            try { await clearCart() } catch (e) {}
            
            try {
              await Linking.openURL(String(redirectUrl))
              navigation.navigate("WaitingForShipper", { orderId: order.id, order })
            } catch (err) {
              console.error("Failed to open payment URL:", err)
              Alert.alert("Lỗi", "Không thể mở trang thanh toán VNPay")
            }
          } else {
            Alert.alert("Lỗi", "Không thể tạo thanh toán VNPay. Vui lòng thử lại.")
          }
        } catch (err) {
          console.error("VNPay error:", err?.response?.data || err)
          Alert.alert("Lỗi", "Không thể tạo thanh toán VNPay. Vui lòng thử lại.")
        }
      }
    } catch (error) {
      console.error("Payment error:", error)
      Alert.alert("Lỗi", "Không thể xử lý thanh toán. Vui lòng thử lại.")
    } finally {
      setLoading(false)
    }
  }

  const renderPaymentMethod = (method) => (
    <TouchableOpacity
      key={method.id}
      style={[styles.paymentMethod, selectedMethod === method.id && styles.selectedPaymentMethod]}
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
      <View style={[styles.radioButton, selectedMethod === method.id && styles.radioButtonSelected]}>
        {selectedMethod === method.id && <Ionicons name="checkmark" size={16} color="white" />}
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Thông tin giao hàng - chỉ hiển thị, không chỉnh sửa */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Thông tin giao hàng</Text>
          <View style={styles.infoRow}>
            <Ionicons name="location-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.infoText}>{deliveryAddress || "Chưa có địa chỉ"}</Text>
          </View>
          <View style={styles.infoRow}>
            <Ionicons name="call-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.infoText}>{deliveryPhone || "Chưa có SĐT"}</Text>
          </View>
        </View>

        {/* Tổng tiền */}
        <View style={styles.section}>
          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>Tổng thanh toán:</Text>
            <Text style={styles.totalValue}>{formatVND(computedTotal)}</Text>
          </View>
        </View>

        {/* Phương thức thanh toán */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Chọn phương thức thanh toán</Text>
          {availablePaymentMethods.map(renderPaymentMethod)}
        </View>

        <View style={styles.securityInfo}>
          <Ionicons name="shield-checkmark" size={20} color={theme.colors.success} />
          <Text style={styles.securityText}>Thông tin thanh toán của bạn được bảo mật</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.payButton, loading && styles.payButtonDisabled]}
          onPress={processPayment}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.payButtonText}>
              {selectedMethod === "cash" ? "Xác nhận đặt hàng" : "Thanh toán VNPay"} - {formatVND(computedTotal)}
            </Text>
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
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: theme.colors.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: theme.colors.text,
    marginLeft: 10,
    flex: 1,
  },
  totalContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: "bold",
    color: theme.colors.text,
  },
  totalValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: theme.colors.primary,
  },
  paymentMethod: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 8,
    backgroundColor: theme.colors.background,
  },
  selectedPaymentMethod: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
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
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  payButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
  },
  payButtonDisabled: {
    backgroundColor: theme.colors.textSecondary,
  },
  payButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
})

export default PaymentScreen