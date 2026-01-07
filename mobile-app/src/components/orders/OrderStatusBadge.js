import React from "react";
import { View, Text, StyleSheet } from "react-native";

const statusConfig = {
  pending: { label: "🔄 Chờ xác nhận", color: "#ff9800" },
  confirmed: { label: "✅ Đã xác nhận", color: "#2196f3" },
  preparing: { label: "👨‍🍳 Đang chuẩn bị", color: "#673ab7" },
  ready: { label: "📦 Sẵn sàng giao", color: "#4caf50" },
  assigned: { label: "🚴 Shipper nhận đơn", color: "#00bcd4" },
  picked_up: { label: "🚶‍♂️ Đã lấy hàng", color: "#009688" },
  delivering: { label: "🛵 Đang giao", color: "#009688" },
  delivered: { label: "📬 Đã giao", color: "#8bc34a" },
  completed: { label: "💰 Hoàn tất", color: "#4caf50" },
  cancelled_by_user: { label: "❌ Khách hủy", color: "#f44336" },
  cancelled_by_seller: { label: "❌ NH hủy", color: "#f44336" },
  cancelled_by_shipper: { label: "❌ Shipper hủy", color: "#f44336" },
  failed_delivery: { label: "⚠️ Giao thất bại", color: "#ff5722" }
};

const OrderStatusBadge = ({ status }) => {
  const config = statusConfig[status] || { label: status, color: "#666" };
  
  return (
    <View style={[styles.container, { backgroundColor: config.color }]}>
      <Text style={styles.text}>{config.label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start"
  },
  text: {
    color: "white",
    fontSize: 12,
    fontWeight: "500"
  }
});

export default OrderStatusBadge;