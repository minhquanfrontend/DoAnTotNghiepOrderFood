import React, { useState, useEffect, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Dimensions } from 'react-native';
import { Card, Title, Text, Button, Chip, ActivityIndicator, SegmentedButtons } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { theme } from '../../theme/theme';

export default function AdminRevenueScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('day');
  const [days, setDays] = useState(30);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    try {
      setError(null);
      const response = await api.get(`/admin/revenue/?period=${period}&days=${days}`);
      setData(response);
    } catch (e) {
      console.error('Error fetching revenue:', e);
      setError(e?.response?.data?.error || 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [period, days])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const formatMoney = (amount) => {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount || 0);
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
        <Text style={styles.sectionTitle}>📅 Khoảng thời gian</Text>
        <SegmentedButtons
          value={period}
          onValueChange={setPeriod}
          buttons={[
            { value: 'day', label: 'Ngày' },
            { value: 'week', label: 'Tuần' },
            { value: 'month', label: 'Tháng' },
          ]}
          style={styles.segmented}
        />
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
      </View>

      {/* Revenue by Period */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📈 Doanh thu theo {period === 'day' ? 'ngày' : period === 'week' ? 'tuần' : 'tháng'}</Text>
        {data?.revenue_by_period?.length > 0 ? (
          <Card style={styles.card}>
            <Card.Content>
              {data.revenue_by_period.slice(-10).map((item, index) => (
                <View key={index} style={styles.revenueItem}>
                  <Text style={styles.revenueDate}>
                    {item.period ? new Date(item.period).toLocaleDateString('vi-VN') : 'N/A'}
                  </Text>
                  <View style={styles.revenueDetails}>
                    <Text style={styles.revenueAmount}>{formatMoney(item.revenue)}</Text>
                    <Text style={styles.revenueOrders}>{item.order_count} đơn</Text>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.noData}>Chưa có dữ liệu doanh thu</Text>
            </Card.Content>
          </Card>
        )}
      </View>

      {/* Revenue by Category */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🏷️ Doanh thu theo loại quán</Text>
        {data?.revenue_by_category?.length > 0 ? (
          <Card style={styles.card}>
            <Card.Content>
              {data.revenue_by_category.map((item, index) => (
                <View key={index} style={styles.categoryItem}>
                  <View style={styles.categoryRank}>
                    <Text style={styles.rankNumber}>#{index + 1}</Text>
                  </View>
                  <View style={styles.categoryInfo}>
                    <Text style={styles.categoryName}>{item.category}</Text>
                    <Text style={styles.categoryStats}>
                      {formatMoney(item.revenue)} • {item.order_count} đơn
                    </Text>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.noData}>Chưa có dữ liệu theo loại quán</Text>
            </Card.Content>
          </Card>
        )}
      </View>

      {/* Revenue by Region */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📍 Doanh thu theo khu vực</Text>
        {data?.revenue_by_region?.length > 0 ? (
          <Card style={styles.card}>
            <Card.Content>
              {data.revenue_by_region.slice(0, 10).map((item, index) => (
                <View key={index} style={styles.regionItem}>
                  <Ionicons name="location" size={20} color={theme.colors.primary} />
                  <View style={styles.regionInfo}>
                    <Text style={styles.regionName}>{item.region}</Text>
                    <Text style={styles.regionStats}>
                      {formatMoney(item.revenue)} • {item.order_count} đơn
                    </Text>
                  </View>
                </View>
              ))}
            </Card.Content>
          </Card>
        ) : (
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.noData}>Chưa có dữ liệu theo khu vực</Text>
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
  segmented: {
    marginBottom: 12,
  },
  daysSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayChip: {
    marginRight: 8,
    marginBottom: 8,
  },
  card: {
    borderRadius: 12,
    elevation: 2,
  },
  revenueItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  revenueDate: {
    fontSize: 14,
    color: '#666',
  },
  revenueDetails: {
    alignItems: 'flex-end',
  },
  revenueAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4caf50',
  },
  revenueOrders: {
    fontSize: 12,
    color: '#999',
  },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  categoryRank: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankNumber: {
    color: 'white',
    fontWeight: 'bold',
  },
  categoryInfo: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  categoryStats: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  regionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  regionInfo: {
    flex: 1,
    marginLeft: 12,
  },
  regionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  regionStats: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  noData: {
    textAlign: 'center',
    color: '#999',
    padding: 20,
  },
});
