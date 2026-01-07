import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Card, Title, Text, Button, Chip, ActivityIndicator, Divider, IconButton } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { theme } from '../../theme/theme';

export default function AdminOperationsScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setError(null);
      const response = await api.get('/admin/operations/issues/');
      setData(response);
    } catch (e) {
      console.error('Error fetching operations:', e);
      setError(e?.response?.data?.error || 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleInterveneOrder = async (orderId, action, orderNumber) => {
    const actionLabels = {
      cancel: 'hủy',
      reassign_shipper: 'gỡ shipper',
      force_complete: 'hoàn thành',
    };

    Alert.alert(
      'Xác nhận can thiệp',
      `Bạn có chắc muốn ${actionLabels[action]} đơn #${orderNumber}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận',
          style: action === 'cancel' ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await api.post(`/admin/orders/${orderId}/intervene/`, {
                action,
                reason: `Admin can thiệp: ${actionLabels[action]}`,
              });
              Alert.alert('Thành công', `Đã ${actionLabels[action]} đơn hàng`);
              fetchData();
            } catch (e) {
              Alert.alert('Lỗi', e?.response?.data?.error || 'Không thể thực hiện');
            }
          },
        },
      ]
    );
  };

  const handleBlockShipper = async (shipperId, shipperName) => {
    Alert.alert(
      'Xác nhận khóa shipper',
      `Bạn có chắc muốn khóa shipper "${shipperName}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Khóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/admin/shippers/${shipperId}/block/`, {
                reason: 'Vi phạm chính sách giao hàng',
              });
              Alert.alert('Thành công', 'Đã khóa shipper');
              fetchData();
            } catch (e) {
              Alert.alert('Lỗi', e?.response?.data?.error || 'Không thể khóa shipper');
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Đang tải dữ liệu...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={64} color={theme.colors.error} />
        <Text style={styles.errorText}>{error}</Text>
        <Button mode="contained" onPress={fetchData}>Thử lại</Button>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Stuck Orders */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>🚨 Đơn hàng bị stuck ({data?.stuck_count || 0})</Text>
          {data?.stuck_count > 0 && (
            <Chip icon="alert" style={styles.alertChip} textStyle={{ color: 'white' }}>
              Cần xử lý
            </Chip>
          )}
        </View>
        
        {data?.stuck_orders?.length > 0 ? (
          <Card style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#f44336' }]}>
            <Card.Content>
              {data.stuck_orders.slice(0, 10).map((order) => (
                <View key={order.order_id} style={styles.stuckItem}>
                  <View style={styles.stuckHeader}>
                    <Text style={styles.orderNumber}>#{order.order_number}</Text>
                    <Chip style={styles.statusChip}>{order.status_display}</Chip>
                  </View>
                  <View style={styles.stuckInfo}>
                    <Text style={styles.stuckTime}>
                      ⏱️ Stuck {order.stuck_minutes} phút
                    </Text>
                    <Text style={styles.stuckDetail}>🏪 {order.restaurant_name}</Text>
                    {order.shipper_name && (
                      <Text style={styles.stuckDetail}>🚴 {order.shipper_name}</Text>
                    )}
                    <Text style={styles.issueType}>{order.issue_type}</Text>
                  </View>
                  <View style={styles.actionButtons}>
                    {order.shipper_name && (
                      <Button
                        mode="outlined"
                        compact
                        onPress={() => handleInterveneOrder(order.order_id, 'reassign_shipper', order.order_number)}
                        style={styles.smallButton}
                      >
                        Gỡ shipper
                      </Button>
                    )}
                    <Button
                      mode="outlined"
                      compact
                      onPress={() => handleInterveneOrder(order.order_id, 'force_complete', order.order_number)}
                      style={styles.smallButton}
                    >
                      Hoàn thành
                    </Button>
                    <Button
                      mode="contained"
                      compact
                      buttonColor="#f44336"
                      onPress={() => handleInterveneOrder(order.order_id, 'cancel', order.order_number)}
                      style={styles.smallButton}
                    >
                      Hủy đơn
                    </Button>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.card}>
            <Card.Content style={styles.noIssues}>
              <Ionicons name="checkmark-circle" size={48} color="#4caf50" />
              <Text style={styles.noIssuesText}>Không có đơn hàng bị stuck</Text>
            </Card.Content>
          </Card>
        )}
      </View>

      {/* Slow Confirmation Sellers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🐢 Seller xác nhận chậm</Text>
        {data?.slow_confirmation_sellers?.length > 0 ? (
          <Card style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#ff9800' }]}>
            <Card.Content>
              {data.slow_confirmation_sellers.map((seller) => (
                <View key={seller.restaurant_id} style={styles.slowItem}>
                  <Ionicons name="time" size={24} color="#ff9800" />
                  <View style={styles.slowInfo}>
                    <Text style={styles.sellerName}>{seller.restaurant_name}</Text>
                    <Text style={styles.slowStats}>
                      Trung bình: <Text style={{ color: '#ff9800', fontWeight: 'bold' }}>
                        {seller.avg_confirmation_minutes} phút
                      </Text> ({seller.sample_size} đơn)
                    </Text>
                  </View>
                  <Button
                    mode="outlined"
                    compact
                    onPress={() => Alert.alert('Thông báo', `Gửi cảnh báo đến ${seller.restaurant_name}`)}
                  >
                    Cảnh báo
                  </Button>
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.card}>
            <Card.Content style={styles.noIssues}>
              <Ionicons name="checkmark-circle" size={48} color="#4caf50" />
              <Text style={styles.noIssuesText}>Tất cả seller xác nhận nhanh</Text>
            </Card.Content>
          </Card>
        )}
      </View>

      {/* High Cancellation Sellers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>❌ Seller tỷ lệ hủy cao</Text>
        {data?.high_cancellation_sellers?.length > 0 ? (
          <Card style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#f44336' }]}>
            <Card.Content>
              {data.high_cancellation_sellers.map((seller) => (
                <View key={seller.restaurant_id} style={styles.cancelItem}>
                  <View style={styles.cancelInfo}>
                    <Text style={styles.sellerName}>{seller.restaurant_name}</Text>
                    <View style={styles.cancelStats}>
                      <Text>
                        Tỷ lệ hủy: <Text style={{ color: '#f44336', fontWeight: 'bold' }}>
                          {seller.cancel_rate}%
                        </Text>
                      </Text>
                      <Text style={styles.cancelCount}>
                        ({seller.cancelled_orders}/{seller.total_orders} đơn)
                      </Text>
                    </View>
                  </View>
                  <Button
                    mode="contained"
                    compact
                    buttonColor="#f44336"
                    onPress={() => Alert.alert(
                      'Khóa quán',
                      `Khóa quán ${seller.restaurant_name}?`,
                      [
                        { text: 'Hủy', style: 'cancel' },
                        { text: 'Khóa', style: 'destructive', onPress: () => {} }
                      ]
                    )}
                  >
                    Khóa
                  </Button>
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.card}>
            <Card.Content style={styles.noIssues}>
              <Ionicons name="checkmark-circle" size={48} color="#4caf50" />
              <Text style={styles.noIssuesText}>Không có seller tỷ lệ hủy cao</Text>
            </Card.Content>
          </Card>
        )}
      </View>

      {/* Shipper Issues */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🚴 Shipper có vấn đề</Text>
        {data?.shipper_issues?.length > 0 ? (
          <Card style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#9c27b0' }]}>
            <Card.Content>
              {data.shipper_issues.map((shipper) => (
                <View key={shipper.shipper_id} style={styles.shipperItem}>
                  <Ionicons name="bicycle" size={24} color="#9c27b0" />
                  <View style={styles.shipperInfo}>
                    <Text style={styles.shipperName}>{shipper.shipper_name}</Text>
                    <View style={styles.shipperStats}>
                      <Text>
                        Tỷ lệ giao: <Text style={{ 
                          color: shipper.success_rate < 80 ? '#f44336' : '#4caf50',
                          fontWeight: 'bold' 
                        }}>
                          {shipper.success_rate}%
                        </Text>
                      </Text>
                      <Text style={styles.shipperDetail}>
                        Giao: {shipper.delivered} | Thất bại: {shipper.failed} | Hủy: {shipper.cancelled}
                      </Text>
                    </View>
                  </View>
                  <Button
                    mode="contained"
                    compact
                    buttonColor="#f44336"
                    onPress={() => handleBlockShipper(shipper.shipper_id, shipper.shipper_name)}
                  >
                    Khóa
                  </Button>
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.card}>
            <Card.Content style={styles.noIssues}>
              <Ionicons name="checkmark-circle" size={48} color="#4caf50" />
              <Text style={styles.noIssuesText}>Tất cả shipper hoạt động tốt</Text>
            </Card.Content>
          </Card>
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    marginBottom: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  section: {
    padding: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  alertChip: {
    backgroundColor: '#f44336',
  },
  card: {
    borderRadius: 12,
    elevation: 2,
  },
  stuckItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  stuckHeader: {
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
  statusChip: {
    height: 28,
  },
  stuckInfo: {
    marginBottom: 8,
  },
  stuckTime: {
    fontSize: 14,
    color: '#f44336',
    fontWeight: '600',
    marginBottom: 4,
  },
  stuckDetail: {
    fontSize: 13,
    color: '#666',
  },
  issueType: {
    fontSize: 12,
    color: '#ff9800',
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  smallButton: {
    marginRight: 8,
    marginTop: 4,
  },
  noIssues: {
    alignItems: 'center',
    padding: 20,
  },
  noIssuesText: {
    marginTop: 12,
    fontSize: 16,
    color: '#4caf50',
  },
  slowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  slowInfo: {
    flex: 1,
    marginLeft: 12,
  },
  sellerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  slowStats: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  cancelItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  cancelInfo: {
    flex: 1,
  },
  cancelStats: {
    marginTop: 4,
  },
  cancelCount: {
    fontSize: 12,
    color: '#999',
  },
  shipperItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  shipperInfo: {
    flex: 1,
    marginLeft: 12,
  },
  shipperName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  shipperStats: {
    marginTop: 4,
  },
  shipperDetail: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
});
