import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Dimensions } from 'react-native';
import { Card, Title, Paragraph, Text, Button, Chip, ActivityIndicator, Divider } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { theme } from '../../theme/theme';

const { width } = Dimensions.get('window');

export default function AdminDashboardScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState(null);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setError(null);
      const data = await api.get('/admin/overview/');
      setOverview(data);
    } catch (e) {
      console.error('Error fetching admin overview:', e);
      setError(e?.response?.data?.error || 'Không thể tải dữ liệu. Bạn cần quyền Admin.');
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

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
  };

  const formatNumber = (num) => {
    return new Intl.NumberFormat('vi-VN').format(num || 0);
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
        <Button mode="contained" onPress={fetchData} style={styles.retryButton}>
          Thử lại
        </Button>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <Title style={styles.headerTitle}>🏢 Admin Dashboard</Title>
        <Text style={styles.headerSubtitle}>Quản lý hệ thống Food Delivery</Text>
      </View>

      {/* GMV Cards */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>💰 Tổng GMV (Gross Merchandise Value)</Text>
        <View style={styles.cardRow}>
          <Card style={[styles.statCard, styles.primaryCard]}>
            <Card.Content>
              <Text style={styles.statLabel}>Tổng GMV</Text>
              <Text style={styles.statValue}>{formatMoney(overview?.gmv?.total)}</Text>
            </Card.Content>
          </Card>
        </View>
        <View style={styles.cardRow}>
          <Card style={[styles.statCard, styles.smallCard]}>
            <Card.Content>
              <Text style={styles.smallLabel}>Hôm nay</Text>
              <Text style={styles.smallValue}>{formatMoney(overview?.gmv?.today)}</Text>
            </Card.Content>
          </Card>
          <Card style={[styles.statCard, styles.smallCard]}>
            <Card.Content>
              <Text style={styles.smallLabel}>Tuần này</Text>
              <Text style={styles.smallValue}>{formatMoney(overview?.gmv?.this_week)}</Text>
            </Card.Content>
          </Card>
          <Card style={[styles.statCard, styles.smallCard]}>
            <Card.Content>
              <Text style={styles.smallLabel}>Tháng này</Text>
              <Text style={styles.smallValue}>{formatMoney(overview?.gmv?.this_month)}</Text>
            </Card.Content>
          </Card>
        </View>
      </View>

      {/* Today's Orders */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📦 Đơn hàng hôm nay</Text>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.orderStats}>
              <View style={styles.orderStatItem}>
                <Text style={styles.orderStatNumber}>{overview?.orders?.today?.total || 0}</Text>
                <Text style={styles.orderStatLabel}>Tổng đơn</Text>
              </View>
              <View style={styles.orderStatItem}>
                <Text style={[styles.orderStatNumber, { color: '#4caf50' }]}>
                  {overview?.orders?.today?.completed || 0}
                </Text>
                <Text style={styles.orderStatLabel}>Hoàn thành</Text>
              </View>
              <View style={styles.orderStatItem}>
                <Text style={[styles.orderStatNumber, { color: '#f44336' }]}>
                  {overview?.orders?.today?.cancelled || 0}
                </Text>
                <Text style={styles.orderStatLabel}>Đã hủy</Text>
              </View>
              <View style={styles.orderStatItem}>
                <Text style={[styles.orderStatNumber, { color: '#2196f3' }]}>
                  {overview?.orders?.today?.success_rate || 0}%
                </Text>
                <Text style={styles.orderStatLabel}>Tỷ lệ TT</Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      </View>

      {/* Users & Restaurants */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>👥 Người dùng & Quán</Text>
        <View style={styles.cardRow}>
          <Card style={[styles.statCard, styles.halfCard]}>
            <Card.Content style={styles.iconCard}>
              <Ionicons name="people" size={32} color="#2196f3" />
              <Text style={styles.iconCardValue}>{formatNumber(overview?.users?.customers)}</Text>
              <Text style={styles.iconCardLabel}>Khách hàng</Text>
            </Card.Content>
          </Card>
          <Card style={[styles.statCard, styles.halfCard]}>
            <Card.Content style={styles.iconCard}>
              <Ionicons name="storefront" size={32} color="#ff9800" />
              <Text style={styles.iconCardValue}>{formatNumber(overview?.users?.sellers)}</Text>
              <Text style={styles.iconCardLabel}>Người bán</Text>
            </Card.Content>
          </Card>
        </View>
        <View style={styles.cardRow}>
          <Card style={[styles.statCard, styles.halfCard]}>
            <Card.Content style={styles.iconCard}>
              <Ionicons name="bicycle" size={32} color="#4caf50" />
              <Text style={styles.iconCardValue}>{formatNumber(overview?.users?.shippers)}</Text>
              <Text style={styles.iconCardLabel}>Shipper</Text>
            </Card.Content>
          </Card>
          <Card style={[styles.statCard, styles.halfCard]}>
            <Card.Content style={styles.iconCard}>
              <Ionicons name="restaurant" size={32} color="#9c27b0" />
              <Text style={styles.iconCardValue}>
                {formatNumber(overview?.restaurants?.active)}/{formatNumber(overview?.restaurants?.total)}
              </Text>
              <Text style={styles.iconCardLabel}>Quán hoạt động</Text>
            </Card.Content>
          </Card>
        </View>
      </View>

      {/* Quick Actions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>⚡ Truy cập nhanh</Text>
        <View style={styles.quickActions}>
          <Button
            mode="contained"
            icon="chart-line"
            onPress={() => navigation.navigate('AdminRevenue')}
            style={styles.quickButton}
          >
            Doanh thu
          </Button>
          <Button
            mode="contained"
            icon="store"
            onPress={() => navigation.navigate('AdminSellers')}
            style={[styles.quickButton, { backgroundColor: '#ff9800' }]}
          >
            Quán ăn
          </Button>
          <Button
            mode="contained"
            icon="alert-circle"
            onPress={() => navigation.navigate('AdminOperations')}
            style={[styles.quickButton, { backgroundColor: '#f44336' }]}
          >
            Vận hành
          </Button>
          <Button
            mode="contained"
            icon="account-group"
            onPress={() => navigation.navigate('AdminUsers')}
            style={[styles.quickButton, { backgroundColor: '#9c27b0' }]}
          >
            Users
          </Button>
        </View>
      </View>

      {/* Order Status Distribution */}
      {overview?.orders?.status_distribution && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 Phân bố trạng thái đơn</Text>
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.statusList}>
                {overview.orders.status_distribution.map((item, index) => (
                  <View key={index} style={styles.statusItem}>
                    <Chip style={styles.statusChip}>{item.status}</Chip>
                    <Text style={styles.statusCount}>{item.count} đơn</Text>
                  </View>
                ))}
              </View>
            </Card.Content>
          </Card>
        </View>
      )}

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
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 20,
  },
  header: {
    backgroundColor: theme.colors.primary,
    padding: 20,
    paddingTop: 40,
  },
  headerTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
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
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statCard: {
    borderRadius: 12,
    elevation: 2,
  },
  primaryCard: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  smallCard: {
    flex: 1,
    marginHorizontal: 4,
  },
  halfCard: {
    flex: 1,
    marginHorizontal: 4,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  statValue: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 4,
  },
  smallLabel: {
    color: '#666',
    fontSize: 12,
  },
  smallValue: {
    color: '#333',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 4,
  },
  card: {
    borderRadius: 12,
    elevation: 2,
  },
  orderStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  orderStatItem: {
    alignItems: 'center',
  },
  orderStatNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  orderStatLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  iconCard: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  iconCardValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
  },
  iconCardLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  quickButton: {
    width: '48%',
    marginBottom: 8,
  },
  statusList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
    marginBottom: 8,
  },
  statusChip: {
    marginRight: 8,
  },
  statusCount: {
    fontSize: 14,
    color: '#333',
  },
});
