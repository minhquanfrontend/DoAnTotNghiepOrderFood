"use client"

import { useEffect } from "react"
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { theme } from "../../theme/theme"

const OrderSuccessScreen = ({ route, navigation }) => {
  const { order, payment } = route.params
  const scaleAnim = new Animated.Value(0)

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      tension: 50,
      friction: 3,
      useNativeDriver: true,
    }).start()
  }, [])

  const getPaymentMethodName = (method) => {
    const methods = {
      cash: "Tiền mặt",
      stripe: "Thẻ tín dụng",
      momo: "Ví MoMo",
      zalopay: "ZaloPay",
      bank_transfer: "Chuyển khoản",
    }
    return methods[method] || method
  }

  const getStatusMessage = () => {
    if (payment.payment_method === "cash") {
      return "Đơn hàng đã được tạo thành công. Bạn sẽ thanh toán khi nhận hàng."
    } else if (payment.status === "completed") {
      return "Thanh toán thành công! Đơn hàng đang được xử lý."
    } else if (payment.status === "processing") {
      return "Đang xử lý thanh toán. Chúng tôi sẽ thông báo khi hoàn tất."
    } else {
      return "Đơn hàng đã được tạo. Vui lòng kiểm tra trạng thái thanh toán."
    }
  }

  const sp = theme?.spacing || { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 }
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Animated.View style={[styles.successIcon, { transform: [{ scale: scaleAnim }] }]}>
        <Ionicons name="checkmark-circle" size={80} color={theme.colors.success} />
      </Animated.View>

      <Text style={styles.successTitle}>Đặt hàng thành công!</Text>
      <Text style={styles.successMessage}>{getStatusMessage()}</Text>

      <View style={styles.orderDetails}>
        <Text style={styles.sectionTitle}>Chi tiết đơn hàng</Text>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Mã đơn hàng:</Text>
          <Text style={styles.detailValue}>#{order.id}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Tổng tiền:</Text>
          <Text style={styles.detailValue}>{order.total_amount?.toLocaleString("vi-VN")}đ</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Phương thức thanh toán:</Text>
          <Text style={styles.detailValue}>{getPaymentMethodName(payment.payment_method)}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Trạng thái thanh toán:</Text>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: payment.status === "completed" ? theme.colors.success : theme.colors.warning },
            ]}
          >
            <Text style={styles.statusText}>
              {payment.status === "completed"
                ? "Đã thanh toán"
                : payment.status === "processing"
                  ? "Đang xử lý"
                  : "Chờ thanh toán"}
            </Text>
          </View>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Địa chỉ giao hàng:</Text>
          <Text style={styles.detailValue}>{order.delivery_address}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Thời gian đặt:</Text>
          <Text style={styles.detailValue}>{new Date(order.created_at).toLocaleString("vi-VN")}</Text>
        </View>
      </View>

      <View style={styles.nextSteps}>
        <Text style={styles.sectionTitle}>Bước tiếp theo</Text>

        <View style={styles.stepItem}>
          <Ionicons name="restaurant" size={20} color={theme.colors.primary} />
          <Text style={styles.stepText}>Nhà hàng sẽ xác nhận và chuẩn bị đơn hàng</Text>
        </View>

        <View style={styles.stepItem}>
          <Ionicons name="bicycle" size={20} color={theme.colors.primary} />
          <Text style={styles.stepText}>Shipper sẽ đến lấy và giao hàng cho bạn</Text>
        </View>

        <View style={styles.stepItem}>
          <Ionicons name="notifications" size={20} color={theme.colors.primary} />
          <Text style={styles.stepText}>Bạn sẽ nhận được thông báo về trạng thái đơn hàng</Text>
        </View>
      </View>

      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.trackButton}
          onPress={() => {
            const num = Number(order?.id)
            const isServerId = Number.isFinite(num) && String(order?.id).length <= 10
            if (isServerId) {
              navigation.navigate("OrderTrackingScreen", { orderId: num })
            } else {
              navigation.navigate('MainTabs', { screen: 'Orders' })
            }
          }}
        >
          <Ionicons name="location" size={20} color="white" />
          <Text style={styles.trackButtonText}>Theo dõi đơn hàng</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.homeButton} onPress={() => navigation.navigate("Home")}>
          <Text style={styles.homeButtonText}>Về trang chủ</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.ordersButton} onPress={() => navigation.navigate('MainTabs', { screen: 'Orders' })}>
          <Text style={styles.ordersButtonText}>Xem đơn hàng của tôi</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: theme.spacing.md,
    alignItems: "center",
  },
  successIcon: {
    marginVertical: (theme.spacing && theme.spacing.xl) || 32,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: theme.colors.text,
    textAlign: "center",
    marginBottom: theme.spacing.sm,
  },
  successMessage: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginBottom: (theme.spacing && theme.spacing.xl) || 32,
    lineHeight: 24,
  },
  orderDetails: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: (theme.spacing && theme.spacing.md) || 16,
    width: "100%",
    marginBottom: (theme.spacing && theme.spacing.md) || 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: theme.colors.text,
    marginBottom: (theme.spacing && theme.spacing.md) || 16,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: (theme.spacing && theme.spacing.sm) || 8,
    minHeight: 24,
  },
  detailLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: "500",
    flex: 1,
    textAlign: "right",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  nextSteps: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: (theme.spacing && theme.spacing.md) || 16,
    width: "100%",
    marginBottom: (theme.spacing && theme.spacing.md) || 16,
  },
  stepItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: (theme.spacing && theme.spacing.sm) || 8,
  },
  stepText: {
    fontSize: 14,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  actionButtons: {
    width: "100%",
    gap: (theme.spacing && theme.spacing.sm) || 8,
  },
  trackButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
    padding: (theme.spacing && theme.spacing.md) || 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  trackButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: (theme.spacing && theme.spacing.sm) || 8,
  },
  homeButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: (theme.spacing && theme.spacing.md) || 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  homeButtonText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  ordersButton: {
    backgroundColor: "transparent",
    borderRadius: 12,
    padding: (theme.spacing && theme.spacing.md) || 16,
    alignItems: "center",
  },
  ordersButtonText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: "600",
  },
})

export default OrderSuccessScreen
