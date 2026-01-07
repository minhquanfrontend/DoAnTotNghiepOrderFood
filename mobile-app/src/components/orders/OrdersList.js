import React from "react";
import { View, StyleSheet, RefreshControl, FlatList } from "react-native";
import { ActivityIndicator, Text, Button } from "react-native-paper";
import OrderCard from "./OrderCard";

const OrdersList = ({ 
  orders, 
  loading, 
  refreshing, 
  onRefresh,
  onUpdateStatus,
  onViewDetail,
  onCancelOrder,
  emptyMessage = "Chưa có đơn hàng nào",
  showMenu = true,
  userRole = 'customer' // 'seller', 'shipper', 'customer'
}) => {
  const renderItem = ({ item }) => (
    <OrderCard
      order={item}
      onUpdateStatus={onUpdateStatus}
      onViewDetail={onViewDetail}
      onCancelOrder={onCancelOrder}
      showMenu={showMenu}
      userRole={userRole}
    />
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Đang tải đơn hàng...</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={orders}
      renderItem={renderItem}
      keyExtractor={item => item.id.toString()}
      contentContainerStyle={styles.listContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      ListEmptyComponent={
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{emptyMessage}</Text>
          <Button 
            mode="contained" 
            onPress={onRefresh}
            style={styles.retryButton}
          >
            Thử lại
          </Button>
        </View>
      }
    />
  );
};

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    color: "#666",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
    marginBottom: 16,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 8,
  },
});

export default OrdersList;