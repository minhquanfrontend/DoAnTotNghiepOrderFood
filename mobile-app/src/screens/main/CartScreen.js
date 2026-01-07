import React, { useEffect } from "react"
import { View, Text, FlatList, Button, StyleSheet, RefreshControl, Image, TouchableOpacity, Alert } from "react-native"
import { useCart } from "../../context/CartContext"
import { useAuth } from "../../context/AuthContext"

export default function CartScreen({ navigation }) {
  const { cart, loading, fetchCart, removeFromCart, clearCart, updateCartItem, getCartTotal } = useCart()
  const { user } = useAuth()
  const items = cart?.items || []

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchCart()
    })
    return unsubscribe
  }, [navigation])

  const handleCheckout = () => {
    if (user) {
      navigation.navigate('Checkout', { from: 'Cart', total: getCartTotal() })
    } else {
      Alert.alert(
        "Chọn cách đặt hàng",
        "Bạn có thể đăng nhập hoặc đặt hàng không cần tài khoản",
        [
          {
            text: "Đặt hàng không đăng nhập",
            onPress: () => navigation.navigate("GuestCheckout"),
          },
          {
            text: "Đăng nhập",
            onPress: () => navigation.navigate("Login"),
          },
          {
            text: "Hủy",
            style: "cancel",
          },
        ]
      )
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Giỏ hàng</Text>
      {(!items || items.length === 0) ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Giỏ hàng của bạn đang trống</Text>
          <Button title="Bắt đầu mua sắm" onPress={() => navigation.navigate("Home")} />
        </View>
      ) : (
        <>
          <FlatList
            data={items}
            keyExtractor={(item, idx) => String(item?.id ?? idx)}
            renderItem={({ item }) => (
              <View style={styles.item}>
                {item?.image || item?.food?.image ? (
                  <Image source={{ uri: item.image || item.food.image }} style={styles.thumb} />
                ) : null}
                <TouchableOpacity style={{ flex: 1 }} onPress={() => navigation.navigate('FoodDetail', { foodId: item.food_id || item.food?.id })}>
                  <Text style={styles.itemName}>{item?.name || item?.food?.name || ""}</Text>
                  {typeof item?.price !== 'undefined' ? (
                    <Text style={styles.itemSub}>{Number(item.price).toLocaleString()} đ x {item.quantity}</Text>
                  ) : null}
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <Button title="-" onPress={() => updateCartItem(item.id, Math.max(0, (item.quantity || 1) - 1))} />
                  <Text style={styles.qtyText}>{item.quantity}</Text>
                  <Button title="+" onPress={() => updateCartItem(item.id, (item.quantity || 1) + 1)} />
                </View>
              </View>
            )}
            refreshControl={<RefreshControl refreshing={!!loading} onRefresh={fetchCart} />}
          />
          <View style={styles.summaryBox}>
            <Text style={styles.totalLabel}>Tổng cộng</Text>
            <Text style={styles.total}>{Number(getCartTotal()).toLocaleString()} đ</Text>
          </View>
          <View style={styles.actionsRow}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Button title="Xóa hết" color="#888" onPress={clearCart} />
            </View>
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Button
                title="Thanh toán"
                onPress={handleCheckout}
              />
            </View>
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, marginBottom: 16 },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  itemName: { fontSize: 16, fontWeight: '600' },
  itemSub: { fontSize: 13, color: '#666', marginTop: 2 },
  summaryBox: { marginTop: 8, paddingVertical: 8, borderTopWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 16, fontWeight: '600' },
  total: { fontSize: 18, fontWeight: '700', color: '#FF6B35' },
  actionsRow: { flexDirection: 'row', marginTop: 12 },
  thumb: { width: 54, height: 54, borderRadius: 8, marginRight: 12, backgroundColor: '#f1f1f1' },
})
