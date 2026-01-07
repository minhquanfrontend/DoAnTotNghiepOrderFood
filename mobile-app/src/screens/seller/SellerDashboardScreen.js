import React, { useEffect, useState, useCallback } from "react"
import { useFocusEffect } from "@react-navigation/native"
import { ScrollView, StyleSheet, View, RefreshControl, Text, Alert, TouchableOpacity } from "react-native"
import { Card, Title, Paragraph, Button, ActivityIndicator, Badge, Divider } from "react-native-paper"
import { useAuth } from "../../context/AuthContext"
import { restaurantAPI, orderAPI } from "../../services/api"
import { normalizeOrder } from "../../utils/orderUtils"

export default function SellerDashboardScreen({ navigation }) {
  const { user } = useAuth()
  const [hasRestaurant, setHasRestaurant] = useState(false)
  const [restaurant, setRestaurant] = useState(null)
  const [stats, setStats] = useState({
    total_revenue: 0,
    total_orders: 0,
    top_selling_items: [],
    status_counts: {},
  });
  const [recentOrders, setRecentOrders] = useState([])
  const [loading, setLoading] = useState(true)

  // Fetch restaurant info
  const fetchRestaurantInfo = useCallback(async () => {
    try {
      const res = await restaurantAPI.getMyRestaurant()
      if (res && res.id) {
        setRestaurant(res)
        setHasRestaurant(true)
        return true
      }
    } catch (error) {
      console.log('No restaurant found:', error?.response?.status || error.message)
      setHasRestaurant(false)
    }
    return false
  }, [])

  // Fetch stats - FIXED to use 'day' period for today's stats
  const fetchStats = useCallback(async () => {
    try {
      const response = await orderAPI.getRestaurantStats('day'); // Get today's data
      console.log('Stats response:', response);
      if (response) {
        setStats({
          // Use new API format with fallback to old format
          total_revenue: response.revenue?.potential_net_revenue || response.revenue?.net_revenue || response.total_revenue || 0,
          total_orders: response.orders?.total || response.total_orders || 0,
          top_selling_items: response.top_selling_items || [],
          status_counts: response.orders?.by_status || response.status_counts || {},
          // Additional new fields
          pending_count: response.orders?.pending || 0,
          completed_count: response.orders?.completed || 0,
          cancelled_count: response.orders?.cancelled || 0,
          active_count: response.orders?.active || 0,
          avg_order_value: response.metrics?.avg_order_value || response.avg_order_value || 0,
          revenue_growth: response.metrics?.revenue_growth || response.revenue_growth || 0,
          order_growth: response.metrics?.order_growth || response.order_growth || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  // Fetch recent orders
  const fetchRecentOrders = useCallback(async () => {
    try {
      const orders = await orderAPI.getRestaurantOrders()
      let orderList = []
      if (Array.isArray(orders)) {
        orderList = orders
      } else if (Array.isArray(orders?.results)) {
        orderList = orders.results
      }
      // Get recent 5 orders, prioritize pending/confirmed/preparing
      const sortedOrders = orderList.sort((a, b) => {
        const priorityOrder = ['pending', 'confirmed', 'preparing', 'ready', 'finding_shipper']
        const aPriority = priorityOrder.indexOf(a.status)
        const bPriority = priorityOrder.indexOf(b.status)
        if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority
        if (aPriority !== -1) return -1
        if (bPriority !== -1) return 1
        return new Date(b.created_at) - new Date(a.created_at)
      })
      setRecentOrders(sortedOrders.slice(0, 5).map(normalizeOrder))
    } catch (error) {
      console.error('Error fetching recent orders:', error)
    }
  }, [])

  // FIXED: Now receives action directly from getNextAction
  const handleUpdateOrderStatus = useCallback(async (orderId, action) => {
    try {
      console.log(`Updating order ${orderId} with action: ${action}`)
      
      if (!action) {
        console.log('No action provided');
        return;
      }
      
      // Special handling for mark_ready - this means finding shipper
      if (action === 'mark_ready') {
        Alert.alert(
          "Xác nhận hoàn thành chuẩn bị",
          "Món ăn đã sẵn sàng. Hệ thống sẽ tìm tài xế giao hàng.",
          [
            { text: "Hủy", style: 'cancel' },
            { text: "OK", onPress: async () => {
                try {
                  await orderAPI.updateOrderStatus(orderId, 'mark_ready');
                  // Also call find shipper API
                  try {
                    await orderAPI.findShipper(orderId);
                  } catch (e) {
                    console.log('Find shipper API not available, order is ready for pickup');
                  }
                  refreshAllData();
                } catch (e) {
                  console.error('Error updating to ready:', e);
                  Alert.alert('Lỗi', e?.response?.data?.error || 'Không thể cập nhật trạng thái. Vui lòng thử lại.');
                }
              }
            }
          ]
        );
      } else {
        await orderAPI.updateOrderStatus(orderId, action);
        refreshAllData();
      }
    } catch (error) {
      console.error('Error updating order status:', error)
      const errorMsg = error?.response?.data?.error || error?.response?.data?.errors?.status?.[0] || 'Không thể cập nhật trạng thái đơn hàng'
      Alert.alert('Lỗi', errorMsg)
    }
  }, [])

  const refreshAllData = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchStats(), fetchRecentOrders()])
    setLoading(false)
  }, [fetchStats, fetchRecentOrders])

  useFocusEffect(
    useCallback(() => {
      const initData = async () => {
        setLoading(true)
        const hasRest = await fetchRestaurantInfo()
        if (hasRest) {
          await Promise.all([fetchStats(), fetchRecentOrders()])
        }
        setLoading(false)
      }
      initData()
    }, [fetchRestaurantInfo, fetchStats, fetchRecentOrders])
  );

  const onRefresh = async () => {
    setLoading(true)
    await fetchRestaurantInfo()
    await Promise.all([fetchStats(), fetchRecentOrders()])
    setLoading(false)
  }

  const numberFmt = (n) => new Intl.NumberFormat('vi-VN').format(Number(n || 0))
  const moneyFmt = (n) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(n || 0))

  // Helper functions for order status and actions
  const getStatusColor = (status) => {
    const colors = {
      pending: '#ff9800',
      confirmed: '#2196f3', 
      preparing: '#673ab7',
      ready: '#4caf50',
      assigned: '#00bcd4',
      picked_up: '#009688',
      delivering: '#009688',
      delivered: '#8bc34a',
      completed: '#4caf50',
      cancelled_by_user: '#f44336',
      cancelled_by_seller: '#f44336',
      cancelled_by_shipper: '#f44336',
      failed_delivery: '#ff5722'
    }
    return colors[status] || '#666'
  }

  const getStatusText = (status) => {
    const texts = {
      pending: 'Chờ xác nhận',
      confirmed: 'Đã xác nhận',
      preparing: 'Đang chuẩn bị',
      ready: 'Sẵn sàng giao',
      assigned: 'Shipper nhận đơn',
      picked_up: 'Đã lấy hàng',
      delivering: 'Đang giao',
      delivered: 'Đã giao',
      completed: 'Hoàn thành',
      cancelled_by_user: 'Khách hủy',
      cancelled_by_seller: 'NH hủy',
      cancelled_by_shipper: 'Shipper hủy',
      failed_delivery: 'Giao thất bại'
    }
    return texts[status] || status
  }

  // SELLER ACTIONS ONLY - Seller CANNOT complete orders
  // Real-world flow: pending → confirmed → preparing → ready (STOP)
  // After ready, SHIPPER takes over. Customer/System completes after delivery.
  const getNextAction = (currentStatus) => {
    switch (currentStatus) {
      case 'pending': return 'confirm'
      case 'confirmed': return 'start_preparing'
      case 'preparing': return 'mark_ready'
      // NO ACTION after ready - shipper handles delivery
      default: return null
    }
  }

  const getActionLabel = (status) => {
    switch (status) {
      case 'pending': return 'Xác nhận đơn'
      case 'confirmed': return 'Bắt đầu nấu'
      case 'preparing': return 'Sẵn sàng giao'
      // NO LABEL after ready - shipper takes over
      default: return null
    }
  }

  const getActionButtons = (order, onUpdateStatus) => {
    const nextAction = getNextAction(order.status)
    const actionLabel = getActionLabel(order.status)
    
    // Show waiting message for ready orders
    if (order.status === 'ready') {
      return (
        <Text style={{ color: '#4caf50', fontStyle: 'italic', fontSize: 12 }}>
          ⏳ Đang chờ shipper nhận đơn...
        </Text>
      )
    }
    
    if (!actionLabel || !nextAction) return null
    
    return (
      <Button
        mode="contained"
        onPress={() => onUpdateStatus(order.id, nextAction)}
        style={[styles.actionButton, { backgroundColor: getStatusColor(order.status) }]}
        compact
      >
        {actionLabel}
      </Button>
    )
  }

  const pendingCount = Number(stats?.status_counts?.pending || 0)
  const preparingCount = Number(stats?.status_counts?.preparing || 0)
  const confirmedCount = Number(stats?.status_counts?.confirmed || 0)
  const readyCount = Number(stats?.status_counts?.ready || 0)
  const activeOrdersCount = pendingCount + preparingCount + confirmedCount + readyCount

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={!hasRestaurant && styles.emptyContainer}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={onRefresh} />}
    >
      {hasRestaurant ? (
        <>
          <View style={styles.statsRow}>
            <Card style={[styles.card, styles.statCard]}>
              <Card.Content>
                <Title style={styles.statTitle}>Tổng đơn hàng hôm nay</Title>
                <Paragraph style={styles.statValue}>{numberFmt(stats.total_orders)}</Paragraph>
              </Card.Content>
            </Card>
            <Card style={[styles.card, styles.statCard]}>
              <Card.Content>
                <Title style={styles.statTitle}>Doanh thu hôm nay</Title>
                <Paragraph style={styles.statValue}>{moneyFmt(stats.total_revenue)}</Paragraph>
              </Card.Content>
            </Card>
          </View>

          <Card style={styles.card}>
            <Card.Content>
              <Button 
                mode="contained" 
                icon="chart-line" 
                onPress={() => navigation.navigate('SellerAnalytics')}
                style={styles.analyticsButton}
              >
                Xem phân tích chi tiết (Ngày/Tuần/Tháng/Năm)
              </Button>
            </Card.Content>
          </Card>

          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.sectionTitle}>Món bán chạy nhất hôm nay</Title>
              {stats.top_selling_items && stats.top_selling_items.length > 0 ? (
                stats.top_selling_items.map((item, index) => (
                  <View key={index} style={styles.topItem}>
                    <Text style={styles.topItemName}>{index + 1}. {item.food__name}</Text>
                    <Text style={styles.topItemQuantity}>{item.quantity_sold} đã bán</Text>
                  </View>
                ))
              ) : (
                <Text>Chưa có dữ liệu.</Text>
              )}
            </Card.Content>
          </Card>

          {hasRestaurant && (
            <Card style={styles.card}>
              <Card.Content>
                <View style={styles.sectionHeader}>
                  <Title>Đơn hàng gần đây</Title>
                  <Badge 
                    size={25} 
                    style={styles.orderCountBadge}
                  >
                    {recentOrders.length}
                  </Badge>
                </View>
                
                {recentOrders.length === 0 ? (
                  <View style={styles.emptyOrders}>
                    <Text style={styles.emptyText}>Chưa có đơn hàng nào</Text>
                    <Text style={styles.emptySubText}>Khách hàng sẽ thấy đơn hàng của bạn khi họ đặt món</Text>
                  </View>
                ) : (
                  recentOrders.map((order) => (
                    <View key={order.id} style={styles.orderItem}>
                      <View style={styles.orderHeader}>
                        <Text style={styles.orderNumber}>#{order.order_number}</Text>
                        <View style={[
                          styles.statusBadge, 
                          { backgroundColor: getStatusColor(order.status) }
                        ]}>
                          <Text style={styles.statusText}>{getStatusText(order.status)}</Text>
                        </View>
                      </View>
                      
                      <View style={styles.orderDetails}>
                        <Text style={styles.customerName}>{order.customer}</Text>
                        <Text style={styles.orderTotal}>{moneyFmt(order.total)}</Text>
                      </View>
                      
                      <View style={styles.orderActions}>
                        {getActionButtons(order, handleUpdateOrderStatus)}
                      </View>
                      
                      <Divider style={styles.divider} />
                    </View>
                  ))
                )}
                
                <View style={{ height: 12 }} />
                <Button 
                  mode="contained" 
                  onPress={() => navigation.navigate('SellerOrders')}
                  style={styles.viewAllButton}
                >
                  Xem tất cả đơn hàng
                </Button>
              </Card.Content>
            </Card>
          )}
        </>
      ) : (
        <View style={styles.emptyState}>
          <View style={styles.emptyIllustration}>
            <Text style={styles.illustration}>🛒</Text>
          </View>
          <Title style={styles.emptyTitle}>Chưa có đơn hàng nào</Title>
          <Paragraph style={styles.emptyText}>
            Bạn chưa có đơn hàng nào. Hãy thêm món ăn và chia sẻ cửa hàng 
            để nhận đơn hàng đầu tiên!
          </Paragraph>
          <View style={styles.emptyActions}>
            <Button 
              mode="contained" 
              style={styles.primaryButton}
              onPress={() => navigation.navigate('ManageFoods', { openCreate: true })}
            >
              Thêm món ăn
            </Button>
            <Button 
              mode="outlined" 
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('PromotionsList')}
            >
              Tạo khuyến mãi
            </Button>
          </View>
        </View>
      )}
      
      {hasRestaurant && (
      <View style={{ marginTop: 12 }}>
        <Button mode="contained" onPress={() => navigation.navigate('ManageFoods', { openCreate: true })}>
          Đăng sản phẩm (Món ăn)
        </Button>
        <View style={{ height: 12 }} />
        <Button mode="contained" onPress={() => {
          try { navigation.navigate('PromotionsList') } catch(e) { }
        }}>
          Quản lý khuyến mãi
        </Button>
        <View style={{ height: 12 }} />
        <Button mode="outlined" onPress={() => {
          try { navigation.navigate('UpdateRestaurantLocation') } catch(e) {}
        }}>
          Cập nhật địa điểm nhà hàng
        </Button>
      </View>
    )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  periodSelector: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#e9ecef',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
  },
  periodButtonActive: {
    backgroundColor: '#fff',
    elevation: 1,
  },
  periodButtonText: {
    textAlign: 'center',
    color: '#495057',
    fontWeight: '500',
  },
  periodButtonTextActive: {
    color: '#1a237e',
    fontWeight: '700',
  },
  topItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f1f1',
  },
  topItemName: {
    fontSize: 14,
  },
  topItemQuantity: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a237e',
  },
  container: { 
    flex: 1, 
    padding: 16, 
    backgroundColor: "#f8f9fa" 
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center'
  },
  card: { 
    marginBottom: 16, 
    borderRadius: 12,
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    flex: 0.48,
    backgroundColor: '#f8f9ff',
  },
  statTitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 20, 
    fontWeight: 'bold',
    color: '#1a237e',
  },
  sectionTitle: {
    fontSize: 16,
    marginBottom: 12,
    color: '#333',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statusBadge: {
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
    minWidth: 70,
  },
  successBadge: {
    backgroundColor: '#e8f5e9',
  },
  statusCount: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statusLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    padding: 32,
  },
  emptyIllustration: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#f0f4ff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  illustration: {
    fontSize: 60,
  },
  emptyTitle: {
    marginBottom: 12,
    textAlign: 'center',
    color: '#333',
  },
  emptyText: {
    textAlign: 'center',
    color: '#666',
    marginBottom: 24,
    lineHeight: 22,
  },
  emptyActions: {
    width: '100%',
    maxWidth: 300,
  },
  primaryButton: {
    marginBottom: 12,
    paddingVertical: 6,
    backgroundColor: '#1a237e',
  },
  secondaryButton: {
    borderColor: '#1a237e',
  },
  // New styles for order management
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  orderCountBadge: {
    backgroundColor: '#1a237e',
  },
  emptyOrders: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 4,
  },
  emptySubText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
  },
  orderItem: {
    marginBottom: 12,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
  },
  orderDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  customerName: {
    fontSize: 14,
    color: '#666',
  },
  orderTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a237e',
  },
  orderActions: {
    marginBottom: 8,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  divider: {
    marginVertical: 8,
  },
  viewAllButton: {
    backgroundColor: '#1a237e',
  },
  // Additional styles for pending orders
  pendingBadge: {
    backgroundColor: '#ff9800',
  },
  quickActions: {
    marginTop: 16,
  },
  quickActionBtn: {
    backgroundColor: '#ff9800',
  },
  analyticsButton: {
    backgroundColor: '#1a237e',
  },
})
