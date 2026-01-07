import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Card, Title, Text, Button, Chip, ActivityIndicator, Divider, IconButton } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { theme } from '../../theme/theme';

export default function AdminSellersScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setError(null);
      const response = await api.get(`/admin/sellers/performance/?days=${days}`);
      setData(response);
    } catch (e) {
      console.error('Error fetching seller performance:', e);
      setError(e?.response?.data?.error || 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [days])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
  };

  const handleBlockRestaurant = async (restaurantId, restaurantName) => {
    Alert.alert(
      'Xác nhận khóa quán',
      `Bạn có chắc muốn khóa quán "${restaurantName}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Khóa',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.post(`/admin/restaurants/${restaurantId}/block/`, {
                reason: 'Vi phạm chính sách',
              });
              Alert.alert('Thành công', 'Đã khóa quán');
              fetchData();
            } catch (e) {
              Alert.alert('Lỗi', e?.response?.data?.error || 'Không thể khóa quán');
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
      {/* Period Selector */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📅 Khoảng thời gian phân tích</Text>
        <View style={styles.daysSelector}>
          {[7, 14, 30, 90].map((d) => (
            <Chip
              key={d}
              selected={days === d}
              onPress={() => setDays(d)}
              style={styles.dayChip}
            >
              {d} ngày
            </Chip>
          ))}
        </View>
        <Text style={styles.totalSellers}>Tổng: {data?.total_sellers || 0} quán có doanh thu</Text>
      </View>

      {/* Top Sellers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🏆 Top quán bán chạy</Text>
        {data?.top_sellers?.length > 0 ? (
          <Card style={styles.card}>
            <Card.Content>
              {data.top_sellers.map((seller, index) => (
                <View key={seller.restaurant_id} style={styles.sellerItem}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>#{index + 1}</Text>
                  </View>
                  <View style={styles.sellerInfo}>
                    <Text style={styles.sellerName}>{seller.restaurant_name}</Text>
                    <Text style={styles.sellerOwner}>👤 {seller.owner_name}</Text>
                    <View style={styles.sellerStats}>
                      <Text style={styles.revenue}>{formatMoney(seller.revenue)}</Text>
                      <Text style={styles.orders}>{seller.order_count} đơn</Text>
                      <Chip 
                        style={[
                          styles.growthChip,
                          { backgroundColor: seller.growth_percent >= 0 ? '#e8f5e9' : '#ffebee' }
                        ]}
                        textStyle={{ 
                          color: seller.growth_percent >= 0 ? '#4caf50' : '#f44336',
                          fontSize: 12 
                        }}
                      >
                        {seller.growth_percent >= 0 ? '↑' : '↓'} {Math.abs(seller.growth_percent)}%
                      </Chip>
                    </View>
                  </View>
                  <IconButton
                    icon="eye"
                    size={20}
                    onPress={() => navigation.navigate('AdminRestaurantDetail', { restaurantId: seller.restaurant_id })}
                  />
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.noData}>Chưa có dữ liệu</Text>
            </Card.Content>
          </Card>
        )}
      </View>

      {/* Declining Sellers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📉 Quán tụt doanh thu</Text>
        {data?.declining_sellers?.length > 0 ? (
          <Card style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#ff9800' }]}>
            <Card.Content>
              {data.declining_sellers.map((seller) => (
                <View key={seller.restaurant_id} style={styles.sellerItem}>
                  <Ionicons name="trending-down" size={24} color="#ff9800" />
                  <View style={styles.sellerInfo}>
                    <Text style={styles.sellerName}>{seller.restaurant_name}</Text>
                    <Text style={styles.sellerOwner}>👤 {seller.owner_name}</Text>
                    <View style={styles.sellerStats}>
                      <Text style={styles.revenue}>{formatMoney(seller.revenue)}</Text>
                      <Text style={styles.prevRevenue}>
                        Trước: {formatMoney(seller.prev_revenue)}
                      </Text>
                      <Chip 
                        style={[styles.growthChip, { backgroundColor: '#ffebee' }]}
                        textStyle={{ color: '#f44336', fontSize: 12 }}
                      >
                        ↓ {Math.abs(seller.growth_percent)}%
                      </Chip>
                    </View>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.noData}>Không có quán nào tụt doanh thu đáng kể</Text>
            </Card.Content>
          </Card>
        )}
      </View>

      {/* Suspicious Sellers */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚠️ Quán nghi gian lận</Text>
        {data?.suspicious_sellers?.length > 0 ? (
          <Card style={[styles.card, { borderLeftWidth: 4, borderLeftColor: '#f44336' }]}>
            <Card.Content>
              {data.suspicious_sellers.map((seller) => (
                <View key={seller.restaurant_id} style={styles.suspiciousItem}>
                  <View style={styles.suspiciousHeader}>
                    <Ionicons name="warning" size={24} color="#f44336" />
                    <Text style={styles.sellerName}>{seller.restaurant_name}</Text>
                  </View>
                  <Text style={styles.suspiciousReason}>🚨 {seller.reason}</Text>
                  <View style={styles.suspiciousStats}>
                    <Text>Tỷ lệ hủy: <Text style={{ color: '#f44336', fontWeight: 'bold' }}>{seller.cancel_rate}%</Text></Text>
                    <Text>Đơn hủy: {seller.cancelled_orders}/{seller.order_count + seller.cancelled_orders}</Text>
                  </View>
                  <View style={styles.actionButtons}>
                    <Button
                      mode="outlined"
                      onPress={() => navigation.navigate('AdminRestaurantDetail', { restaurantId: seller.restaurant_id })}
                      style={styles.actionButton}
                    >
                      Xem chi tiết
                    </Button>
                    <Button
                      mode="contained"
                      buttonColor="#f44336"
                      onPress={() => handleBlockRestaurant(seller.restaurant_id, seller.restaurant_name)}
                      style={styles.actionButton}
                    >
                      Khóa quán
                    </Button>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.noSuspicious}>
                <Ionicons name="checkmark-circle" size={48} color="#4caf50" />
                <Text style={styles.noSuspiciousText}>Không phát hiện quán nghi gian lận</Text>
              </View>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  daysSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  dayChip: {
    marginRight: 8,
    marginBottom: 8,
  },
  totalSellers: {
    color: '#666',
    fontSize: 14,
  },
  card: {
    borderRadius: 12,
    elevation: 2,
  },
  sellerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  rankBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  sellerInfo: {
    flex: 1,
  },
  sellerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  sellerOwner: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  sellerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  revenue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4caf50',
    marginRight: 8,
  },
  orders: {
    fontSize: 12,
    color: '#666',
    marginRight: 8,
  },
  prevRevenue: {
    fontSize: 12,
    color: '#999',
    marginRight: 8,
  },
  growthChip: {
    height: 24,
  },
  suspiciousItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  suspiciousHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  suspiciousReason: {
    fontSize: 14,
    color: '#f44336',
    marginBottom: 8,
    marginLeft: 32,
  },
  suspiciousStats: {
    marginLeft: 32,
    marginBottom: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    marginLeft: 32,
  },
  actionButton: {
    marginRight: 8,
  },
  noData: {
    textAlign: 'center',
    color: '#999',
    padding: 20,
  },
  noSuspicious: {
    alignItems: 'center',
    padding: 20,
  },
  noSuspiciousText: {
    marginTop: 12,
    fontSize: 16,
    color: '#4caf50',
  },
});
