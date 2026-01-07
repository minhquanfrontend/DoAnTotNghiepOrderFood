import React, { useState, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Alert } from 'react-native';
import { Card, Text, Button, Chip, ActivityIndicator, Searchbar, SegmentedButtons, IconButton, Avatar } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import api from '../../services/api';
import { theme } from '../../theme/theme';

export default function AdminUsersScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [userType, setUserType] = useState('all');
  const [error, setError] = useState(null);

  const fetchData = async (resetPage = false) => {
    try {
      setError(null);
      const currentPage = resetPage ? 1 : page;
      if (resetPage) setPage(1);
      
      const response = await api.get(`/admin/users/?type=${userType}&page=${currentPage}&limit=20`);
      setUsers(response.users || []);
      setTotal(response.total || 0);
    } catch (e) {
      console.error('Error fetching users:', e);
      setError(e?.response?.data?.error || 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData(true);
    }, [userType])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(true);
  };

  const handleUpdateRole = async (userId, username, newType) => {
    Alert.alert(
      'Cập nhật quyền',
      `Đổi quyền của "${username}" thành ${newType}?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận',
          onPress: async () => {
            try {
              await api.post(`/admin/users/${userId}/role/`, { user_type: newType });
              Alert.alert('Thành công', 'Đã cập nhật quyền');
              fetchData();
            } catch (e) {
              Alert.alert('Lỗi', e?.response?.data?.error || 'Không thể cập nhật');
            }
          },
        },
      ]
    );
  };

  const handleToggleActive = async (userId, username, currentActive) => {
    const action = currentActive ? 'khóa' : 'mở khóa';
    Alert.alert(
      `Xác nhận ${action}`,
      `Bạn có chắc muốn ${action} tài khoản "${username}"?`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xác nhận',
          style: currentActive ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await api.post(`/admin/users/${userId}/role/`, { is_active: !currentActive });
              Alert.alert('Thành công', `Đã ${action} tài khoản`);
              fetchData();
            } catch (e) {
              Alert.alert('Lỗi', e?.response?.data?.error || 'Không thể thực hiện');
            }
          },
        },
      ]
    );
  };

  const handleMakeAdmin = async (userId, username) => {
    Alert.alert(
      'Cấp quyền Admin',
      `Cấp quyền Admin cho "${username}"? Người này sẽ có toàn quyền quản lý hệ thống.`,
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Cấp quyền',
          onPress: async () => {
            try {
              await api.post(`/admin/users/${userId}/role/`, { is_staff: true });
              Alert.alert('Thành công', 'Đã cấp quyền Admin');
              fetchData();
            } catch (e) {
              Alert.alert('Lỗi', e?.response?.data?.error || 'Không thể cấp quyền');
            }
          },
        },
      ]
    );
  };

  const getUserTypeIcon = (type) => {
    switch (type) {
      case 'customer': return 'person';
      case 'seller': case 'restaurant': return 'storefront';
      case 'shipper': return 'bicycle';
      default: return 'person';
    }
  };

  const getUserTypeColor = (type) => {
    switch (type) {
      case 'customer': return '#2196f3';
      case 'seller': case 'restaurant': return '#ff9800';
      case 'shipper': return '#4caf50';
      default: return '#666';
    }
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
        <Button mode="contained" onPress={() => fetchData(true)}>Thử lại</Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Filter */}
      <View style={styles.filterSection}>
        <SegmentedButtons
          value={userType}
          onValueChange={setUserType}
          buttons={[
            { value: 'all', label: 'Tất cả' },
            { value: 'customer', label: 'Khách' },
            { value: 'seller', label: 'Seller' },
            { value: 'shipper', label: 'Shipper' },
          ]}
          style={styles.segmented}
        />
        <Text style={styles.totalCount}>Tổng: {total} người dùng</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {users.length > 0 ? (
          users.map((user) => (
            <Card key={user.id} style={styles.userCard}>
              <Card.Content>
                <View style={styles.userHeader}>
                  <View style={styles.userAvatar}>
                    <Ionicons 
                      name={getUserTypeIcon(user.user_type)} 
                      size={24} 
                      color={getUserTypeColor(user.user_type)} 
                    />
                  </View>
                  <View style={styles.userInfo}>
                    <View style={styles.userNameRow}>
                      <Text style={styles.userName}>{user.username}</Text>
                      {user.is_staff && (
                        <Chip style={styles.adminChip} textStyle={{ color: 'white', fontSize: 10 }}>
                          ADMIN
                        </Chip>
                      )}
                      {!user.is_active && (
                        <Chip style={styles.blockedChip} textStyle={{ color: 'white', fontSize: 10 }}>
                          KHÓA
                        </Chip>
                      )}
                    </View>
                    <Text style={styles.userEmail}>{user.email}</Text>
                    <Text style={styles.userMeta}>
                      {user.first_name} {user.last_name} • {user.user_type}
                    </Text>
                    <Text style={styles.userDate}>
                      Tham gia: {new Date(user.date_joined).toLocaleDateString('vi-VN')}
                    </Text>
                  </View>
                </View>

                <View style={styles.userActions}>
                  {/* Change Role */}
                  <View style={styles.roleButtons}>
                    <Text style={styles.roleLabel}>Đổi quyền:</Text>
                    {['customer', 'seller', 'shipper'].map((type) => (
                      <Chip
                        key={type}
                        selected={user.user_type === type}
                        onPress={() => user.user_type !== type && handleUpdateRole(user.id, user.username, type)}
                        style={styles.roleChip}
                        textStyle={{ fontSize: 11 }}
                      >
                        {type === 'customer' ? 'Khách' : type === 'seller' ? 'Seller' : 'Shipper'}
                      </Chip>
                    ))}
                  </View>

                  {/* Action Buttons */}
                  <View style={styles.actionButtons}>
                    <Button
                      mode={user.is_active ? 'contained' : 'outlined'}
                      compact
                      buttonColor={user.is_active ? '#f44336' : '#4caf50'}
                      onPress={() => handleToggleActive(user.id, user.username, user.is_active)}
                      style={styles.actionButton}
                    >
                      {user.is_active ? 'Khóa' : 'Mở khóa'}
                    </Button>
                    {!user.is_staff && (
                      <Button
                        mode="outlined"
                        compact
                        onPress={() => handleMakeAdmin(user.id, user.username)}
                        style={styles.actionButton}
                      >
                        Cấp Admin
                      </Button>
                    )}
                  </View>
                </View>
              </Card.Content>
            </Card>
          ))
        ) : (
          <Card style={styles.emptyCard}>
            <Card.Content style={styles.emptyContent}>
              <Ionicons name="people" size={48} color="#ccc" />
              <Text style={styles.emptyText}>Không có người dùng nào</Text>
            </Card.Content>
          </Card>
        )}

        {/* Pagination */}
        {total > 20 && (
          <View style={styles.pagination}>
            <Button
              mode="outlined"
              disabled={page === 1}
              onPress={() => { setPage(p => p - 1); fetchData(); }}
            >
              Trước
            </Button>
            <Text style={styles.pageInfo}>Trang {page} / {Math.ceil(total / 20)}</Text>
            <Button
              mode="outlined"
              disabled={page * 20 >= total}
              onPress={() => { setPage(p => p + 1); fetchData(); }}
            >
              Sau
            </Button>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
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
  filterSection: {
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  segmented: {
    marginBottom: 8,
  },
  totalCount: {
    textAlign: 'center',
    color: '#666',
    fontSize: 14,
  },
  scrollView: {
    flex: 1,
  },
  userCard: {
    margin: 8,
    marginBottom: 4,
    borderRadius: 12,
    elevation: 2,
  },
  userHeader: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  userAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginRight: 8,
  },
  adminChip: {
    backgroundColor: '#9c27b0',
    height: 20,
    marginRight: 4,
  },
  blockedChip: {
    backgroundColor: '#f44336',
    height: 20,
  },
  userEmail: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
  },
  userMeta: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  userDate: {
    fontSize: 11,
    color: '#bbb',
    marginTop: 2,
  },
  userActions: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
  },
  roleButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  roleLabel: {
    fontSize: 12,
    color: '#666',
    marginRight: 8,
  },
  roleChip: {
    marginRight: 4,
    marginBottom: 4,
    height: 28,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionButton: {
    marginRight: 8,
    marginTop: 4,
  },
  emptyCard: {
    margin: 16,
    borderRadius: 12,
  },
  emptyContent: {
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 16,
    fontSize: 16,
    color: '#999',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  pageInfo: {
    marginHorizontal: 16,
    color: '#666',
  },
});
