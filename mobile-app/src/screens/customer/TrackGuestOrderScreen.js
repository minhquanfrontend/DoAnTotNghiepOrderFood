import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Card, Title, Button, Divider } from 'react-native-paper';
import { orderAPI } from '../../services/api';

export default function TrackGuestOrderScreen({ navigation, route }) {
  const [orderNumber, setOrderNumber] = useState(route?.params?.orderNumber || '');
  const [email, setEmail] = useState(route?.params?.email || '');
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);

  const fetchOrderStatus = useCallback(async () => {
    if (!orderNumber.trim()) {
      setError('Vui lòng nhập mã đơn hàng');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await orderAPI.trackGuestOrder(orderNumber.trim(), email.trim());
      if (response?.order) {
        setOrderData(response.order);
      } else {
        setError('Không tìm thấy đơn hàng');
      }
    } catch (err) {
      console.error('Track order error:', err);
      const errorMsg = err?.response?.data?.error || 'Không thể tải thông tin đơn hàng';
      setError(errorMsg);
      setOrderData(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [orderNumber, email]);

  useEffect(() => {
    if (route?.params?.orderNumber) {
      fetchOrderStatus();
    }
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchOrderStatus();
  };

  const handleConfirmDelivery = async () => {
    if (!email.trim()) {
      Alert.alert('Cần xác thực', 'Vui lòng nhập email để xác nhận đã nhận hàng');
      return;
    }

    Alert.alert(
      'Xác nhận nhận hàng',
      'Bạn đã nhận được đơn hàng này?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận',
          onPress: async () => {
            setConfirming(true);
            try {
              const response = await orderAPI.guestConfirmDelivery(orderNumber.trim(), email.trim());
              if (response?.success) {
                Alert.alert('Thành công', response.message || 'Cảm ơn bạn đã xác nhận nhận hàng!');
                fetchOrderStatus(); // Refresh order data
              } else {
                Alert.alert('Lỗi', response?.error || 'Không thể xác nhận đơn hàng');
              }
            } catch (err) {
              console.error('Confirm delivery error:', err);
              const errorMsg = err?.response?.data?.error || err?.message || 'Không thể xác nhận đơn hàng';
              Alert.alert('Lỗi', errorMsg);
            } finally {
              setConfirming(false);
            }
          },
        },
      ]
    );
  };

  const moneyFmt = (n) => new Intl.NumberFormat('vi-VN', { 
    style: 'currency', 
    currency: 'VND' 
  }).format(Number(n || 0));

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const statusConfig = {
    pending: { label: '🔄 Chờ xác nhận', color: '#ff9800', step: 1 },
    confirmed: { label: '✅ Đã xác nhận', color: '#2196f3', step: 2 },
    preparing: { label: '👨‍🍳 Đang chuẩn bị', color: '#673ab7', step: 3 },
    finding_shipper: { label: '🔍 Đang tìm tài xế', color: '#03a9f4', step: 4 },
    ready: { label: '📦 Sẵn sàng giao', color: '#4caf50', step: 4 },
    picked_up: { label: '🚶 Shipper đã nhận', color: '#009688', step: 5 },
    delivering: { label: '🛵 Đang giao hàng', color: '#009688', step: 6 },
    delivered: { label: '📬 Đã giao hàng', color: '#8bc34a', step: 7 },
    completed: { label: '💰 Hoàn thành', color: '#4caf50', step: 8 },
    cancelled: { label: '❌ Đã hủy', color: '#f44336', step: -1 },
  };

  const getStatusInfo = (status) => statusConfig[status] || { label: status, color: '#666', step: 0 };

  const OrderTimeline = ({ tracking }) => {
    if (!tracking || tracking.length === 0) return null;

    return (
      <View style={styles.timeline}>
        {tracking.map((item, index) => {
          const statusInfo = getStatusInfo(item.status);
          const isLast = index === tracking.length - 1;
          
          return (
            <View key={index} style={styles.timelineItem}>
              <View style={styles.timelineLeft}>
                <View style={[styles.timelineDot, { backgroundColor: statusInfo.color }]} />
                {!isLast && <View style={styles.timelineLine} />}
              </View>
              <View style={styles.timelineContent}>
                <Text style={[styles.timelineStatus, { color: statusInfo.color }]}>
                  {statusInfo.label}
                </Text>
                <Text style={styles.timelineMessage}>{item.message}</Text>
                <Text style={styles.timelineTime}>{formatDate(item.created_at)}</Text>
              </View>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        orderData ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Title style={styles.headerTitle}>📦 Theo dõi đơn hàng</Title>
        <Text style={styles.headerSubtitle}>
          Nhập mã đơn hàng để xem trạng thái giao hàng
        </Text>
      </View>

      {/* Search Form */}
      <Card style={styles.searchCard}>
        <Card.Content>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Mã đơn hàng *</Text>
            <TextInput
              style={styles.input}
              placeholder="VD: FD12345678"
              value={orderNumber}
              onChangeText={setOrderNumber}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email (tùy chọn)</Text>
            <TextInput
              style={styles.input}
              placeholder="email@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <Button
            mode="contained"
            onPress={fetchOrderStatus}
            style={styles.searchButton}
            loading={loading}
            disabled={loading || !orderNumber.trim()}
          >
            Tra cứu đơn hàng
          </Button>

          {error ? (
            <Text style={styles.errorText}>❌ {error}</Text>
          ) : null}
        </Card.Content>
      </Card>

      {/* Order Details */}
      {loading && !orderData ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a237e" />
          <Text style={styles.loadingText}>Đang tải thông tin đơn hàng...</Text>
        </View>
      ) : orderData ? (
        <>
          {/* Status Banner */}
          <Card style={[styles.statusCard, { borderLeftColor: getStatusInfo(orderData.status).color }]}>
            <Card.Content>
              <View style={styles.statusHeader}>
                <Text style={styles.statusEmoji}>
                  {getStatusInfo(orderData.status).label.split(' ')[0]}
                </Text>
                <View style={styles.statusInfo}>
                  <Text style={[styles.statusText, { color: getStatusInfo(orderData.status).color }]}>
                    {orderData.status_display || getStatusInfo(orderData.status).label}
                  </Text>
                  <Text style={styles.orderNumberText}>#{orderData.order_number}</Text>
                </View>
              </View>
            </Card.Content>
          </Card>

          {/* Order Info */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.sectionTitle}>📋 Thông tin đơn hàng</Title>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>🏪 Nhà hàng</Text>
                <Text style={styles.infoValue}>{orderData.restaurant_name}</Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>📍 Địa chỉ giao</Text>
                <Text style={styles.infoValue}>{orderData.delivery_address}</Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>📞 Điện thoại</Text>
                <Text style={styles.infoValue}>{orderData.delivery_phone}</Text>
              </View>
              
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>🕐 Đặt lúc</Text>
                <Text style={styles.infoValue}>{formatDate(orderData.created_at)}</Text>
              </View>

              {orderData.shipper_name && (
                <>
                  <Divider style={styles.divider} />
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>🛵 Tài xế</Text>
                    <Text style={styles.infoValue}>{orderData.shipper_name}</Text>
                  </View>
                  {orderData.shipper_phone && (
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>📱 SĐT tài xế</Text>
                      <Text style={styles.infoValue}>{orderData.shipper_phone}</Text>
                    </View>
                  )}
                </>
              )}
            </Card.Content>
          </Card>

          {/* Order Items */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.sectionTitle}>🛒 Chi tiết đơn hàng</Title>
              
              {orderData.items?.map((item, index) => (
                <View key={index} style={styles.orderItem}>
                  <View style={styles.orderItemLeft}>
                    <Text style={styles.orderItemName}>{item.food_name}</Text>
                    <Text style={styles.orderItemQty}>x{item.quantity}</Text>
                  </View>
                  <Text style={styles.orderItemPrice}>{moneyFmt(item.total)}</Text>
                </View>
              ))}
              
              <Divider style={styles.divider} />
              
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Tạm tính</Text>
                <Text style={styles.summaryValue}>{moneyFmt(orderData.subtotal)}</Text>
              </View>
              
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Phí giao hàng</Text>
                <Text style={styles.summaryValue}>{moneyFmt(orderData.delivery_fee)}</Text>
              </View>
              
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Tổng cộng</Text>
                <Text style={styles.totalValue}>{moneyFmt(orderData.total_amount)}</Text>
              </View>
            </Card.Content>
          </Card>

          {/* Order Timeline */}
          {orderData.tracking && orderData.tracking.length > 0 && (
            <Card style={styles.card}>
              <Card.Content>
                <Title style={styles.sectionTitle}>📜 Lịch sử đơn hàng</Title>
                <OrderTimeline tracking={orderData.tracking.reverse()} />
              </Card.Content>
            </Card>
          )}

          {/* Confirm Delivery Button - Show when order is delivered */}
          {orderData.can_confirm_delivery && (
            <Card style={styles.confirmCard}>
              <Card.Content>
                <Text style={styles.confirmTitle}>📬 Đơn hàng đã được giao!</Text>
                <Text style={styles.confirmText}>
                  Vui lòng xác nhận bạn đã nhận được hàng để hoàn tất đơn hàng.
                </Text>
                <Button
                  mode="contained"
                  onPress={handleConfirmDelivery}
                  style={styles.confirmButton}
                  loading={confirming}
                  disabled={confirming}
                  icon="check-circle"
                >
                  Xác nhận đã nhận hàng
                </Button>
              </Card.Content>
            </Card>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Button
              mode="outlined"
              onPress={onRefresh}
              style={styles.refreshButton}
              icon="refresh"
            >
              Cập nhật trạng thái
            </Button>
          </View>
        </>
      ) : null}

      {/* Help Section */}
      <Card style={styles.helpCard}>
        <Card.Content>
          <Text style={styles.helpTitle}>❓ Cần hỗ trợ?</Text>
          <Text style={styles.helpText}>
            Nếu bạn gặp vấn đề với đơn hàng, vui lòng liên hệ hotline: 1900-xxxx
          </Text>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#1a237e',
    padding: 20,
    paddingTop: 10,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 4,
  },
  searchCard: {
    margin: 16,
    borderRadius: 12,
    elevation: 3,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  searchButton: {
    marginTop: 8,
    backgroundColor: '#1a237e',
    paddingVertical: 4,
  },
  errorText: {
    color: '#f44336',
    textAlign: 'center',
    marginTop: 12,
  },
  loadingContainer: {
    padding: 40,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  statusCard: {
    margin: 16,
    marginTop: 8,
    borderRadius: 12,
    borderLeftWidth: 4,
    elevation: 3,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusEmoji: {
    fontSize: 40,
    marginRight: 16,
  },
  statusInfo: {
    flex: 1,
  },
  statusText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  orderNumberText: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  card: {
    margin: 16,
    marginTop: 8,
    borderRadius: 12,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  divider: {
    marginVertical: 12,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  orderItemLeft: {
    flex: 1,
  },
  orderItemName: {
    fontSize: 14,
    color: '#333',
  },
  orderItemQty: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  orderItemPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a237e',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    color: '#333',
  },
  totalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4caf50',
  },
  timeline: {
    paddingLeft: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    minHeight: 60,
  },
  timelineLeft: {
    width: 24,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 4,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: '#e0e0e0',
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 16,
  },
  timelineStatus: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  timelineMessage: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  timelineTime: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
  actions: {
    padding: 16,
    paddingTop: 8,
  },
  refreshButton: {
    borderColor: '#1a237e',
  },
  helpCard: {
    margin: 16,
    marginTop: 8,
    marginBottom: 30,
    borderRadius: 12,
    backgroundColor: '#fff3e0',
  },
  helpTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#e65100',
    marginBottom: 4,
  },
  helpText: {
    fontSize: 13,
    color: '#666',
  },
  confirmCard: {
    margin: 16,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#e8f5e9',
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
    elevation: 3,
  },
  confirmTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 8,
  },
  confirmText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
  },
  confirmButton: {
    backgroundColor: '#4caf50',
    paddingVertical: 4,
  },
});
