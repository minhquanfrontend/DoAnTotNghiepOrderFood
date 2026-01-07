import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Alert, ScrollView } from "react-native";
import { Snackbar, Chip, Button, Card, Title, Paragraph } from "react-native-paper";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { orderAPI, restaurantAPI } from "../../services/api";
import OrdersList from "../../components/orders/OrdersList";
import { normalizeOrder } from "../../utils/orderUtils";
import NotificationService from "../../services/notificationService";
import PaymentService from "../../services/paymentService";

const SellerOrdersScreen = ({ navigation, route }) => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snack, setSnack] = useState({ visible: false, text: "" });
  const [filter, setFilter] = useState(route?.params?.filter || 'all');

  const loadOrders = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem("accessToken") || await AsyncStorage.getItem("access_token");
      
      if (!token) {
        setSnack({ visible: true, text: "Vui lòng đăng nhập lại" });
        return;
      }
      
      const res = await orderAPI.getRestaurantOrders();
      
      let list = [];
      if (Array.isArray(res)) {
        list = res;
      } else if (Array.isArray(res?.results)) {
        list = res.results;
      } else if (Array.isArray(res?.orders)) {
        list = res.orders;
      } else if (res?.data && Array.isArray(res.data)) {
        list = res.data;
      } else {
        console.log("Could not extract orders array from response");
      }
      
      const normalizedOrders = list.map(normalizeOrder);
      setOrders(normalizedOrders);
      
      const filteredCount = getFilteredOrders(normalizedOrders).length;
      if (filteredCount === 0) {
        setSnack({ visible: true, text: `Không có đơn hàng ${getFilterLabel(filter)}` });
      } else {
        setSnack({ visible: true, text: `Tìm thấy ${filteredCount} đơn hàng ${getFilterLabel(filter)}` });
      }
    } catch (error) {
      console.error("Error loading orders:", error.message);
      setSnack({ 
        visible: true, 
        text: "Lỗi tải đơn hàng: " + (error.response?.data?.message || error.message || "Vui lòng thử lại") 
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  const getFilteredOrders = (ordersList) => {
    // Seller should ONLY see orders in their control: pending, confirmed, preparing
    // Filter out shipper/customer stages
    const sellerRelevantOrders = ordersList.filter(order => 
      ['pending', 'confirmed', 'preparing', 'ready'].includes(order.status)
    );
    
    if (filter === 'all') return sellerRelevantOrders;
    return sellerRelevantOrders.filter(order => order.status === filter);
  };

  const getFilterLabel = (filterValue) => {
    const labels = {
      all: '',
      pending: 'chờ xác nhận',
      confirmed: 'đã xác nhận',
      preparing: 'đang chuẩn bị',
      ready: 'sẵn sàng giao',
      delivering: 'đang giao',
      delivered: 'đã giao',
      completed: 'hoàn thành'
    };
    return labels[filterValue] || '';
  };

  const getStatusCount = (status) => {
    return orders.filter(order => order.status === status).length;
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(loadOrders, 30000);
    return () => clearInterval(interval);
  }, [loadOrders]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadOrders();
  };

  const handleUpdateStatus = async (orderId, action) => {
    try {
      console.log(`Updating order ${orderId} with action: ${action}`);
      
      if (!action) {
        console.log('No action provided');
        setSnack({ visible: true, text: 'Không có hành động để thực hiện' });
        return;
      }
      
      // Get order data before updating
      const order = orders.find(o => o.id === orderId);
      
      // Special handling for mark_ready - also trigger find shipper
      if (action === 'mark_ready') {
        await orderAPI.updateOrderStatus(orderId, action);
        // Try to find shipper after marking ready
        try {
          await orderAPI.findShipper(orderId);
          setSnack({ visible: true, text: "Món ăn sẵn sàng! Đang tìm tài xế..." });
        } catch (e) {
          console.log('Find shipper API not available:', e);
          setSnack({ visible: true, text: "Món ăn sẵn sàng giao!" });
        }
      } else {
        // Update order status using action
        await orderAPI.updateOrderStatus(orderId, action);
        
        // Send notifications based on action
        try {
          await NotificationService.notifyOrderStatusChange(orderId, action, order?.status);
        } catch (e) {
          console.log('Notification error:', e);
        }
        
        // Process payment if order is completed
        if (action === 'complete' && order) {
          try {
            await PaymentService.processOrderPayment(orderId, order);
            setSnack({ visible: true, text: "Đơn hàng hoàn thành! Thanh toán đã được xử lý." });
          } catch (paymentError) {
            console.error('Payment processing error:', paymentError);
            setSnack({ visible: true, text: "Đơn hàng hoàn thành!" });
          }
        } else {
          const actionMessages = {
            'confirm': 'Đã xác nhận đơn hàng!',
            'start_preparing': 'Đang chuẩn bị món ăn...',
            'cancel': 'Đã hủy đơn hàng',
          };
          setSnack({ visible: true, text: actionMessages[action] || "Cập nhật trạng thái thành công" });
        }
      }
      
      loadOrders();
    } catch (error) {
      console.error("Error updating status:", error);
      // Extract error message from response
      const errorData = error.response?.data;
      let errorMsg = "Vui lòng thử lại";
      if (errorData?.error) {
        errorMsg = errorData.error;
      } else if (errorData?.errors?.status && Array.isArray(errorData.errors.status)) {
        errorMsg = errorData.errors.status[0];
      } else if (errorData?.message) {
        errorMsg = errorData.message;
      } else if (error.message) {
        errorMsg = error.message;
      }
      setSnack({ visible: true, text: "Lỗi: " + errorMsg });
    }
  };

  const handleViewDetail = (orderId) => {
    navigation.navigate("OrderDetail", { orderId });
  };

  const handleCancelOrder = async (orderId) => {
    try {
      console.log(`Cancelling order ${orderId}`);
      await orderAPI.updateOrderStatus(orderId, 'cancel_by_seller');
      setSnack({ visible: true, text: "Đã hủy đơn hàng" });
      loadOrders();
    } catch (error) {
      console.error("Error cancelling order:", error);
      setSnack({ 
        visible: true, 
        text: "Lỗi khi hủy đơn: " + (error.response?.data?.error || error.response?.data?.message || error.message || "Vui lòng thử lại") 
      });
    }
  };

  return (
    <View style={styles.container}>
      {/* Filter chips */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer}>
          <Chip
            mode={filter === 'all' ? 'flat' : 'outlined'}
            onPress={() => setFilter('all')}
            style={[styles.chip, filter === 'all' && styles.activeChip]}
          >
            Tất cả ({orders.length})
          </Chip>
          <Chip
            mode={filter === 'pending' ? 'flat' : 'outlined'}
            onPress={() => setFilter('pending')}
            style={[styles.chip, styles.pendingChip, filter === 'pending' && styles.activeChip]}
          >
            Chờ xác nhận ({getStatusCount('pending')})
          </Chip>
          <Chip
            mode={filter === 'confirmed' ? 'flat' : 'outlined'}
            onPress={() => setFilter('confirmed')}
            style={[styles.chip, filter === 'confirmed' && styles.activeChip]}
          >
            Đã xác nhận ({getStatusCount('confirmed')})
          </Chip>
          <Chip
            mode={filter === 'preparing' ? 'flat' : 'outlined'}
            onPress={() => setFilter('preparing')}
            style={[styles.chip, filter === 'preparing' && styles.activeChip]}
          >
            Đang chuẩn bị ({getStatusCount('preparing')})
          </Chip>
          <Chip
            mode={filter === 'ready' ? 'flat' : 'outlined'}
            onPress={() => setFilter('ready')}
            style={[styles.chip, filter === 'ready' && styles.activeChip]}
          >
            Sẵn sàng ({getStatusCount('ready')})
          </Chip>
        </ScrollView>
      </View>

      {/* Quick action for pending orders */}
      {getStatusCount('pending') > 0 && filter !== 'pending' && (
        <Card style={styles.quickActionCard}>
          <Card.Content>
            <Title style={styles.quickActionTitle}>Có {getStatusCount('pending')} đơn hàng chờ xác nhận!</Title>
            <Paragraph style={styles.quickActionText}>Xác nhận ngay để bắt đầu chuẩn bị đơn hàng</Paragraph>
            <Button
              mode="contained"
              onPress={() => setFilter('pending')}
              style={styles.quickActionButton}
            >
              Xem đơn chờ xác nhận
            </Button>
          </Card.Content>
        </Card>
      )}

      <OrdersList
        orders={getFilteredOrders(orders)}
        loading={loading && !refreshing}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onUpdateStatus={handleUpdateStatus}
        onViewDetail={handleViewDetail}
        onCancelOrder={handleCancelOrder}
        userRole="seller"
      />

      <Snackbar
        visible={snack.visible}
        onDismiss={() => setSnack(prev => ({ ...prev, visible: false }))}
        duration={3000}
        action={{
          label: "Đóng",
          onPress: () => setSnack(prev => ({ ...prev, visible: false })),
        }}
      >
        {snack.text}
      </Snackbar>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  filterContainer: {
    padding: 16,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  chipContainer: {
    paddingVertical: 8,
  },
  chip: {
    marginHorizontal: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
  },
  pendingChip: {
    backgroundColor: "#ffe6e6",
  },
  activeChip: {
    backgroundColor: "#007bff",
  },
  quickActionCard: {
    marginHorizontal: 16,
    marginVertical: 8,
  },
  quickActionTitle: {
    fontSize: 18,
    fontWeight: "bold",
  },
  quickActionText: {
    fontSize: 16,
    color: "#666",
  },
  quickActionButton: {
    marginTop: 8,
  },
});

export default SellerOrdersScreen;