import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Card, Button, Menu, Divider } from "react-native-paper";
import OrderStatusBadge from "./OrderStatusBadge";
import { format } from "date-fns";
import { vi } from "date-fns/locale";

const formatDate = (dateString) => {
  if (!dateString) return "";
  try {
    return format(new Date(dateString), "HH:mm - dd/MM/yyyy", { locale: vi });
  } catch {
    return dateString;
  }
};

const OrderCard = ({ 
  order, 
  onUpdateStatus, 
  onViewDetail, 
  onCancelOrder,
  showMenu = true,
  userRole = 'customer' // 'seller', 'shipper', 'customer'
}) => {
  const [visible, setVisible] = useState(false);

  // SELLER ACTIONS ONLY - Seller cannot complete orders
  // Flow: pending → confirmed → preparing → ready (STOP - wait for shipper)
  const getNextAction = (currentStatus) => {
    switch (currentStatus) {
      case "pending": return "confirm";
      case "confirmed": return "start_preparing";
      case "preparing": return "mark_ready";
      // Seller has NO action after ready - shipper takes over
      default: return null;
    }
  };

  const getActionLabel = (status) => {
    switch (status) {
      case "pending": return "Xác nhận đơn";
      case "confirmed": return "Bắt đầu chuẩn bị";
      case "preparing": return "Sẵn sàng giao";
      default: return null;
    }
  };

  const nextAction = getNextAction(order.status);
  const actionLabel = getActionLabel(order.status);

  return (
    <Card style={styles.card}>
      <Card.Content>
        <View style={styles.header}>
          <Text style={styles.orderNumber}>{order.order_number}</Text>
          <OrderStatusBadge status={order.status} />
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Khách hàng:</Text>
          <Text style={styles.value}>{order.customer_name || order.customer}</Text>
        </View>

        {/* ADDRESS VISIBILITY RULES:
            - Seller: ONLY sees pickup_address (their restaurant)
            - Shipper: sees BOTH pickup_address and delivery_address
            - Customer: ONLY sees delivery_address (their address)
        */}
        {userRole === 'seller' ? (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Lấy hàng tại:</Text>
            <Text style={styles.value} numberOfLines={2}>{order.pickup_address || order.restaurant_name || 'Nhà hàng của bạn'}</Text>
          </View>
        ) : userRole === 'shipper' ? (
          <>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Lấy hàng:</Text>
              <Text style={styles.value} numberOfLines={2}>{order.pickup_address || order.restaurant_name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Giao đến:</Text>
              <Text style={styles.value} numberOfLines={2}>{order.delivery_address}</Text>
            </View>
          </>
        ) : (
          <View style={styles.infoRow}>
            <Text style={styles.label}>Giao đến:</Text>
            <Text style={styles.value} numberOfLines={2}>{order.delivery_address}</Text>
          </View>
        )}

        <View style={styles.infoRow}>
          <Text style={styles.label}>SĐT:</Text>
          <Text style={styles.value}>{order.delivery_phone || order.phone}</Text>
        </View>

        <View style={[styles.infoRow, { marginTop: 8 }]}>
          <Text style={[styles.label, { fontSize: 16 }]}>Tổng tiền:</Text>
          <Text style={[styles.totalAmount, { color: "#4caf50" }]}>
            {(Number(order.total) || 0).toLocaleString("vi-VN")}₫
          </Text>
        </View>

        <View style={styles.timestamps}>
          <Text style={styles.timestamp}>
            Tạo lúc: {formatDate(order.created_at)}
          </Text>
          {order.updated_at !== order.created_at && (
            <Text style={styles.timestamp}>
              Cập nhật: {formatDate(order.updated_at)}
            </Text>
          )}
        </View>
      </Card.Content>

      <Card.Actions style={styles.actions}>
        {/* Show action button only for seller-controllable statuses */}
        {onUpdateStatus && nextAction && actionLabel && (
          <Button 
            mode="contained" 
            onPress={() => onUpdateStatus(order.id, nextAction)}
            style={styles.actionButton}
          >
            {actionLabel}
          </Button>
        )}
        
        {/* Show waiting message for ready orders (seller cannot do anything more) */}
        {userRole === 'seller' && order.status === 'ready' && (
          <Text style={{ color: '#4caf50', fontStyle: 'italic' }}>
            ⏳ Đang chờ shipper nhận đơn...
          </Text>
        )}

        {showMenu && (
          <Menu
            visible={visible}
            onDismiss={() => setVisible(false)}
            anchor={
              <Button 
                onPress={() => setVisible(true)}
                icon="dots-vertical"
              />
            }
          >
            <Menu.Item 
              title="Xem chi tiết" 
              onPress={() => {
                onViewDetail?.(order.id);
                setVisible(false);
              }}
            />
            {order.status === "pending" && !["delivered", "completed"].includes(order.status) && (
              <>
                <Divider />
                <Menu.Item
                  title="Hủy đơn hàng"
                  onPress={() => {
                    onCancelOrder?.(order.id);
                    setVisible(false);
                  }}
                  titleStyle={{ color: "#f44336" }}
                />
              </>
            )}
          </Menu>
        )}
      </Card.Actions>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    borderRadius: 12,
    elevation: 2,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  orderNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  infoRow: {
    flexDirection: "row",
    marginBottom: 6,
  },
  label: {
    width: 100,
    color: "#666",
    fontSize: 14,
  },
  value: {
    flex: 1,
    color: "#333",
    fontSize: 14,
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: "bold",
  },
  timestamps: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 8,
  },
  timestamp: {
    fontSize: 12,
    color: "#888",
    fontStyle: "italic",
  },
  actions: {
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  actionButton: {
    minWidth: 120,
  },
});

export default OrderCard;