import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Dimensions, TouchableOpacity, ActivityIndicator, RefreshControl, Modal, Platform, TextInput } from 'react-native';
import { Card, Title, Paragraph, Divider, Badge, Button, IconButton } from 'react-native-paper';
import { LineChart, BarChart, PieChart } from 'react-native-chart-kit';
import { orderAPI } from '../../services/api';

const screenWidth = Dimensions.get('window').width;

export default function SellerAnalyticsScreen() {
  const [period, setPeriod] = useState('week');
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Date picker states
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  });
  const [endDate, setEndDate] = useState(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [customDateMode, setCustomDateMode] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      let data;
      if (customDateMode) {
        // Use custom date range
        const startStr = startDate.toISOString().split('T')[0];
        const endStr = endDate.toISOString().split('T')[0];
        data = await orderAPI.getRestaurantStats('custom', startStr, endStr);
      } else {
        data = await orderAPI.getRestaurantStats(period);
      }
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      setStats(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period, customDateMode, startDate, endDate]);

  useEffect(() => {
    setLoading(true);
    fetchStats();
  }, [fetchStats]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const moneyFmt = (n) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(n || 0));
  const numberFmt = (n) => new Intl.NumberFormat('vi-VN').format(Number(n || 0));

  const getPeriodLabel = () => {
    switch (period) {
      case 'day': return 'Hôm nay';
      case 'week': return 'Tuần này';
      case 'month': return 'Tháng này';
      case 'year': return 'Năm nay';
      default: return '';
    }
  };

  const getChartLegend = () => {
    switch (period) {
      case 'day': return 'Doanh thu theo giờ';
      case 'week': return 'Doanh thu theo ngày';
      case 'month': return 'Doanh thu theo ngày';
      case 'year': return 'Doanh thu theo tháng';
      default: return 'Doanh thu';
    }
  };

  // Prepare chart data with fallback - support both old and new API format
  const chartLabels = stats?.chart?.labels || stats?.chart_data?.labels || ['N/A'];
  const chartValues = stats?.chart?.values || stats?.chart_data?.values || [0];
  
  // Ensure we have at least 2 data points for the chart
  const safeChartValues = chartValues.length > 0 ? chartValues : [0];
  const maxValue = Math.max(...safeChartValues, 1);

  const lineChartData = {
    labels: chartLabels.length > 10 ? chartLabels.filter((_, i) => i % Math.ceil(chartLabels.length / 10) === 0) : chartLabels,
    datasets: [{
      data: safeChartValues.length > 10 
        ? safeChartValues.filter((_, i) => i % Math.ceil(safeChartValues.length / 10) === 0)
        : safeChartValues,
      color: (opacity = 1) => `rgba(26, 35, 126, ${opacity})`,
      strokeWidth: 2,
    }],
    legend: [getChartLegend()],
  };

  // Status distribution for pie chart
  const statusColors = {
    pending: '#ff9800',
    confirmed: '#2196f3',
    preparing: '#673ab7',
    ready: '#4caf50',
    delivering: '#009688',
    delivered: '#8bc34a',
    completed: '#4caf50',
    cancelled: '#f44336',
  };

  const statusLabels = {
    pending: 'Chờ xác nhận',
    confirmed: 'Đã xác nhận',
    preparing: 'Đang chuẩn bị',
    ready: 'Sẵn sàng',
    delivering: 'Đang giao',
    delivered: 'Đã giao',
    completed: 'Hoàn thành',
    cancelled: 'Đã hủy',
  };

  // Support both old (status_counts) and new (orders.by_status) API format
  const statusCounts = stats?.orders?.by_status || stats?.status_counts || {};
  const pieChartData = statusCounts
    ? Object.entries(statusCounts)
        .filter(([key, value]) => key !== 'total' && value > 0)
        .map(([key, value]) => ({
          name: statusLabels[key] || key,
          count: value,
          color: statusColors[key] || '#666',
          legendFontColor: '#333',
          legendFontSize: 12,
        }))
    : [];

  const GrowthIndicator = ({ value, label }) => {
    // Handle NaN, undefined, null values
    const safeValue = (value === null || value === undefined || isNaN(value)) ? 0 : Number(value);
    const isPositive = safeValue >= 0;
    return (
      <View style={styles.growthContainer}>
        <Text style={[styles.growthValue, { color: isPositive ? '#4caf50' : '#f44336' }]}>
          {isPositive ? '↑' : '↓'} {Math.abs(safeValue).toFixed(1)}%
        </Text>
        <Text style={styles.growthLabel}>{label}</Text>
      </View>
    );
  };

  const StatCard = ({ title, value, subValue, icon, color = '#1a237e' }) => (
    <Card style={[styles.statCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
      <Card.Content style={styles.statCardContent}>
        <Text style={styles.statCardIcon}>{icon}</Text>
        <View style={styles.statCardText}>
          <Text style={styles.statCardTitle}>{title}</Text>
          <Text style={[styles.statCardValue, { color }]}>{value}</Text>
          {subValue && <Text style={styles.statCardSubValue}>{subValue}</Text>}
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={styles.header}>
        <Title style={styles.screenTitle}>📊 Phân tích Kinh doanh</Title>
        <Text style={styles.subtitle}>Thống kê chi tiết hoạt động cửa hàng</Text>
      </View>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {['day', 'week', 'month', 'year'].map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.periodButton, period === p && !customDateMode && styles.periodButtonActive]}
            onPress={() => {
              setCustomDateMode(false);
              setPeriod(p);
            }}
          >
            <Text style={[styles.periodButtonText, period === p && !customDateMode && styles.periodButtonTextActive]}>
              {p === 'day' ? 'Ngày' : p === 'week' ? 'Tuần' : p === 'month' ? 'Tháng' : 'Năm'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Custom Date Range Picker */}
      <View style={styles.dateRangeContainer}>
        <TouchableOpacity 
          style={[styles.dateButton, customDateMode && styles.dateButtonActive]}
          onPress={() => setShowStartPicker(true)}
        >
          <Text style={styles.dateButtonLabel}>Từ ngày</Text>
          <Text style={[styles.dateButtonValue, customDateMode && styles.dateButtonValueActive]}>
            {startDate.toLocaleDateString('vi-VN')}
          </Text>
        </TouchableOpacity>
        
        <Text style={styles.dateSeparator}>→</Text>
        
        <TouchableOpacity 
          style={[styles.dateButton, customDateMode && styles.dateButtonActive]}
          onPress={() => setShowEndPicker(true)}
        >
          <Text style={styles.dateButtonLabel}>Đến ngày</Text>
          <Text style={[styles.dateButtonValue, customDateMode && styles.dateButtonValueActive]}>
            {endDate.toLocaleDateString('vi-VN')}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.applyDateButton, customDateMode && styles.applyDateButtonActive]}
          onPress={() => {
            setCustomDateMode(true);
            setLoading(true);
            fetchStats();
          }}
        >
          <Text style={styles.applyDateButtonText}>Áp dụng</Text>
        </TouchableOpacity>
      </View>

      {/* Date Picker Modal */}
      <Modal visible={showStartPicker || showEndPicker} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.datePickerModal}>
            <Text style={styles.datePickerTitle}>
              {showStartPicker ? 'Chọn ngày bắt đầu' : 'Chọn ngày kết thúc'}
            </Text>
            <View style={styles.dateInputRow}>
              <TextInput
                style={styles.dateInput}
                placeholder="DD"
                keyboardType="number-pad"
                maxLength={2}
                value={showStartPicker ? String(startDate.getDate()) : String(endDate.getDate())}
                onChangeText={(text) => {
                  const day = parseInt(text) || 1;
                  if (showStartPicker) {
                    const newDate = new Date(startDate);
                    newDate.setDate(Math.min(day, 31));
                    setStartDate(newDate);
                  } else {
                    const newDate = new Date(endDate);
                    newDate.setDate(Math.min(day, 31));
                    setEndDate(newDate);
                  }
                }}
              />
              <Text style={styles.dateDivider}>/</Text>
              <TextInput
                style={styles.dateInput}
                placeholder="MM"
                keyboardType="number-pad"
                maxLength={2}
                value={showStartPicker ? String(startDate.getMonth() + 1) : String(endDate.getMonth() + 1)}
                onChangeText={(text) => {
                  const month = (parseInt(text) || 1) - 1;
                  if (showStartPicker) {
                    const newDate = new Date(startDate);
                    newDate.setMonth(Math.min(month, 11));
                    setStartDate(newDate);
                  } else {
                    const newDate = new Date(endDate);
                    newDate.setMonth(Math.min(month, 11));
                    setEndDate(newDate);
                  }
                }}
              />
              <Text style={styles.dateDivider}>/</Text>
              <TextInput
                style={[styles.dateInput, { width: 70 }]}
                placeholder="YYYY"
                keyboardType="number-pad"
                maxLength={4}
                value={showStartPicker ? String(startDate.getFullYear()) : String(endDate.getFullYear())}
                onChangeText={(text) => {
                  const year = parseInt(text) || 2024;
                  if (showStartPicker) {
                    const newDate = new Date(startDate);
                    newDate.setFullYear(year);
                    setStartDate(newDate);
                  } else {
                    const newDate = new Date(endDate);
                    newDate.setFullYear(year);
                    setEndDate(newDate);
                  }
                }}
              />
            </View>
            <TouchableOpacity 
              style={styles.datePickerConfirm}
              onPress={() => {
                setShowStartPicker(false);
                setShowEndPicker(false);
              }}
            >
              <Text style={styles.datePickerConfirmText}>Xác nhận</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1a237e" />
          <Text style={styles.loadingText}>Đang tải dữ liệu...</Text>
        </View>
      ) : !stats ? (
        <Card style={styles.errorCard}>
          <Card.Content>
            <Text style={styles.errorText}>❌ Không thể tải dữ liệu thống kê</Text>
            <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
              <Text style={styles.retryButtonText}>Thử lại</Text>
            </TouchableOpacity>
          </Card.Content>
        </Card>
      ) : (
        <>
          {/* Overview Stats - Support both old and new API format */}
          <View style={styles.statsGrid}>
            <StatCard 
              title="Doanh thu" 
              value={moneyFmt(stats.revenue?.potential_net_revenue || stats.revenue?.net_revenue || stats.total_revenue || 0)}
              subValue={(() => {
                const growth = stats.metrics?.revenue_growth ?? stats.revenue_growth;
                if (growth === null || growth === undefined || isNaN(growth)) return null;
                return `${growth > 0 ? '+' : ''}${Number(growth).toFixed(1)}% so với kỳ trước`;
              })()}
              icon="💰"
              color="#4caf50"
            />
            <StatCard 
              title="Đơn hàng" 
              value={numberFmt(stats.orders?.total || stats.total_orders || 0)}
              subValue={`${stats.orders?.completed || stats.completed_orders || 0} hoàn thành`}
              icon="📦"
              color="#2196f3"
            />
            <StatCard 
              title="Giá trị TB/đơn" 
              value={moneyFmt(stats.metrics?.avg_order_value || stats.avg_order_value || 0)}
              icon="📈"
              color="#ff9800"
            />
            <StatCard 
              title="Tỷ lệ hủy" 
              value={(stats.orders?.total || stats.total_orders) > 0 ? `${(((stats.orders?.cancelled || stats.cancelled_orders || 0) / (stats.orders?.total || stats.total_orders)) * 100).toFixed(1)}%` : '0%'}
              subValue={`${stats.orders?.cancelled || stats.cancelled_orders || 0} đơn hủy`}
              icon="❌"
              color="#f44336"
            />
          </View>

          {/* Growth Comparison - Only show if we have valid growth data */}
          {(stats.metrics?.revenue_growth != null || stats.revenue_growth != null || 
            stats.metrics?.order_growth != null || stats.order_growth != null) && (
            <Card style={styles.card}>
              <Card.Content>
                <Title style={styles.cardTitle}>📈 So sánh với kỳ trước</Title>
                <View style={styles.comparisonRow}>
                  <View style={styles.comparisonItem}>
                    <Text style={styles.comparisonLabel}>Doanh thu kỳ trước</Text>
                    <Text style={styles.comparisonValue}>{moneyFmt(stats.comparison?.prev_revenue)}</Text>
                    <GrowthIndicator value={stats.metrics?.revenue_growth ?? stats.revenue_growth} label="tăng trưởng" />
                  </View>
                  <View style={styles.comparisonDivider} />
                  <View style={styles.comparisonItem}>
                    <Text style={styles.comparisonLabel}>Đơn hàng kỳ trước</Text>
                    <Text style={styles.comparisonValue}>{numberFmt(stats.comparison?.prev_orders)}</Text>
                    <GrowthIndicator value={stats.metrics?.order_growth ?? stats.order_growth} label="tăng trưởng" />
                  </View>
                </View>
              </Card.Content>
            </Card>
          )}

          {/* Revenue Chart */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>📊 Biểu đồ Doanh thu - {getPeriodLabel()}</Title>
              {safeChartValues.some(v => v > 0) ? (
                <LineChart
                  data={lineChartData}
                  width={screenWidth - 50}
                  height={220}
                  yAxisLabel=""
                  yAxisSuffix={maxValue >= 1000000 ? 'tr' : maxValue >= 1000 ? 'k' : ''}
                  yAxisInterval={1}
                  chartConfig={{
                    backgroundColor: '#1a237e',
                    backgroundGradientFrom: '#1a237e',
                    backgroundGradientTo: '#3949ab',
                    decimalPlaces: 0,
                    color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                    style: { borderRadius: 16 },
                    propsForDots: { r: '4', strokeWidth: '2', stroke: '#ffa726' },
                  }}
                  bezier
                  style={{ marginVertical: 8, borderRadius: 16 }}
                />
              ) : (
                <View style={styles.noDataChart}>
                  <Text style={styles.noDataText}>📭 Chưa có dữ liệu doanh thu trong kỳ này</Text>
                </View>
              )}
            </Card.Content>
          </Card>

          {/* Order Status Distribution */}
          {pieChartData.length > 0 && (
            <Card style={styles.card}>
              <Card.Content>
                <Title style={styles.cardTitle}>🥧 Phân bổ Trạng thái Đơn hàng</Title>
                <View style={styles.statusGrid}>
                  {Object.entries(statusCounts)
                    .filter(([key]) => key !== 'total')
                    .map(([status, count]) => (
                      <View key={status} style={styles.statusItem}>
                        <View style={[styles.statusDot, { backgroundColor: statusColors[status] || '#666' }]} />
                        <Text style={styles.statusLabel}>{statusLabels[status] || status}</Text>
                        <Badge style={[styles.statusBadge, { backgroundColor: statusColors[status] || '#666' }]}>
                          {count}
                        </Badge>
                      </View>
                    ))}
                </View>
                <Divider style={{ marginVertical: 12 }} />
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Tổng số đơn hàng</Text>
                  <Text style={styles.totalValue}>{numberFmt(stats.orders?.total || statusCounts?.total || 0)}</Text>
                </View>
              </Card.Content>
            </Card>
          )}

          {/* Top Selling Items */}
          <Card style={styles.card}>
            <Card.Content>
              <Title style={styles.cardTitle}>🏆 Top 10 Món bán chạy - {getPeriodLabel()}</Title>
              {stats.top_selling_items && stats.top_selling_items.length > 0 ? (
                stats.top_selling_items.map((item, index) => (
                  <View key={index} style={styles.topItem}>
                    <View style={styles.topItemLeft}>
                      <View style={[styles.rankBadge, index < 3 && styles.topRankBadge]}>
                        <Text style={[styles.rankText, index < 3 && styles.topRankText]}>
                          {index < 3 ? ['🥇', '🥈', '🥉'][index] : index + 1}
                        </Text>
                      </View>
                      <Text style={styles.topItemName}>{item.food__name}</Text>
                    </View>
                    <View style={styles.topItemRight}>
                      <Text style={styles.topItemQuantity}>{item.quantity_sold} đã bán</Text>
                      {item.revenue && (
                        <Text style={styles.topItemRevenue}>{moneyFmt(item.revenue)}</Text>
                      )}
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.noDataContainer}>
                  <Text style={styles.noDataText}>📭 Chưa có dữ liệu bán hàng trong kỳ này</Text>
                </View>
              )}
            </Card.Content>
          </Card>

          {/* Recent Orders */}
          {stats.recent_orders && stats.recent_orders.length > 0 && (
            <Card style={[styles.card, { marginBottom: 30 }]}>
              <Card.Content>
                <Title style={styles.cardTitle}>🕐 Đơn hàng Gần đây</Title>
                {stats.recent_orders.map((order, index) => (
                  <View key={index} style={styles.recentOrderItem}>
                    <View style={styles.recentOrderLeft}>
                      <Text style={styles.recentOrderNumber}>#{order.order_number}</Text>
                      <Text style={styles.recentOrderCustomer}>
                        {order.customer__first_name || ''} {order.customer__last_name || 'Khách'}
                      </Text>
                    </View>
                    <View style={styles.recentOrderRight}>
                      <Text style={styles.recentOrderAmount}>{moneyFmt(order.total_amount)}</Text>
                      <View style={[styles.recentOrderStatus, { backgroundColor: statusColors[order.status] || '#666' }]}>
                        <Text style={styles.recentOrderStatusText}>{statusLabels[order.status] || order.status}</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </Card.Content>
            </Card>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f5f5f5' 
  },
  header: {
    padding: 16,
    backgroundColor: '#1a237e',
  },
  screenTitle: { 
    fontSize: 24, 
    fontWeight: 'bold', 
    color: '#fff',
    marginBottom: 4,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  periodSelector: { 
    flexDirection: 'row', 
    justifyContent: 'space-around', 
    backgroundColor: '#fff', 
    borderRadius: 12, 
    padding: 4, 
    margin: 16,
    marginBottom: 8,
    elevation: 2,
  },
  dateRangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 16,
    elevation: 2,
  },
  dateButton: {
    flex: 1,
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  dateButtonActive: {
    backgroundColor: '#e3f2fd',
    borderColor: '#1a237e',
    borderWidth: 1,
  },
  dateButtonLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 2,
  },
  dateButtonValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  dateButtonValueActive: {
    color: '#1a237e',
  },
  dateSeparator: {
    marginHorizontal: 8,
    color: '#666',
    fontSize: 16,
  },
  applyDateButton: {
    backgroundColor: '#1a237e',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    marginLeft: 8,
  },
  applyDateButtonActive: {
    backgroundColor: '#4caf50',
  },
  applyDateButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerModal: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    alignItems: 'center',
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
  },
  dateInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    width: 50,
    textAlign: 'center',
    fontSize: 16,
  },
  dateDivider: {
    fontSize: 20,
    marginHorizontal: 8,
    color: '#666',
  },
  datePickerConfirm: {
    backgroundColor: '#1a237e',
    paddingVertical: 12,
    paddingHorizontal: 40,
    borderRadius: 8,
  },
  datePickerConfirmText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
  periodButton: { 
    flex: 1, 
    paddingVertical: 10, 
    borderRadius: 8,
    marginHorizontal: 2,
  },
  periodButtonActive: { 
    backgroundColor: '#1a237e',
  },
  periodButtonText: { 
    textAlign: 'center', 
    color: '#666', 
    fontWeight: '600',
    fontSize: 14,
  },
  periodButtonTextActive: { 
    color: '#fff', 
    fontWeight: '700',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
  },
  loadingText: {
    marginTop: 12,
    color: '#666',
  },
  errorCard: {
    margin: 16,
    borderRadius: 12,
  },
  errorText: { 
    textAlign: 'center', 
    fontSize: 16, 
    color: '#f44336',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#1a237e',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
  },
  statCard: {
    width: (screenWidth - 48) / 2,
    margin: 8,
    borderRadius: 12,
    elevation: 2,
  },
  statCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statCardIcon: {
    fontSize: 28,
    marginRight: 12,
  },
  statCardText: {
    flex: 1,
  },
  statCardTitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  statCardValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  statCardSubValue: {
    fontSize: 10,
    color: '#888',
    marginTop: 2,
  },
  card: { 
    margin: 16, 
    marginTop: 8,
    borderRadius: 12, 
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  comparisonRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  comparisonItem: {
    flex: 1,
    alignItems: 'center',
  },
  comparisonDivider: {
    width: 1,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 16,
  },
  comparisonLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  comparisonValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  growthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  growthValue: {
    fontSize: 14,
    fontWeight: 'bold',
    marginRight: 4,
  },
  growthLabel: {
    fontSize: 12,
    color: '#888',
  },
  noDataChart: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 12,
  },
  noDataContainer: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  noDataText: {
    color: '#888',
    fontSize: 14,
  },
  statusGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '50%',
    paddingVertical: 8,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  statusLabel: {
    flex: 1,
    fontSize: 13,
    color: '#333',
  },
  statusBadge: {
    marginRight: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    color: '#666',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a237e',
  },
  topItem: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center',
    paddingVertical: 12, 
    borderBottomWidth: 1, 
    borderBottomColor: '#f0f0f0',
  },
  topItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  topRankBadge: {
    backgroundColor: 'transparent',
  },
  rankText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
  },
  topRankText: {
    fontSize: 18,
  },
  topItemName: { 
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
  topItemRight: {
    alignItems: 'flex-end',
  },
  topItemQuantity: { 
    fontSize: 14, 
    fontWeight: 'bold',
    color: '#1a237e',
  },
  topItemRevenue: {
    fontSize: 12,
    color: '#4caf50',
    marginTop: 2,
  },
  recentOrderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  recentOrderLeft: {
    flex: 1,
  },
  recentOrderNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  recentOrderCustomer: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  recentOrderRight: {
    alignItems: 'flex-end',
  },
  recentOrderAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4caf50',
  },
  recentOrderStatus: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    marginTop: 4,
  },
  recentOrderStatusText: {
    fontSize: 10,
    color: '#fff',
    fontWeight: '500',
  },
});
