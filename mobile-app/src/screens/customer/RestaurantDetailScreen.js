import React, { useEffect, useState, useCallback } from "react"
import { View, Text, FlatList, StyleSheet, Image, TouchableOpacity, Alert, RefreshControl } from "react-native"
import { restaurantAPI } from "../../services/api"
import { useCart } from "../../context/CartContext"

export default function RestaurantDetailScreen({ route, navigation }) {
  // Nhận tham số từ màn trước: có thể truyền cả object hoặc chỉ id
  const restaurantParam = route.params?.restaurant
  const restaurantId = route.params?.restaurantId || restaurantParam?.id

  const [restaurant, setRestaurant] = useState(restaurantParam || null)
  const [foods, setFoods] = useState([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const { addToCart } = useCart()

  const loadRestaurant = useCallback(async () => {
    if (!restaurant && restaurantId) {
      try {
        const data = await restaurantAPI.getRestaurant(restaurantId)
        setRestaurant(data)
      } catch (e) {
        console.warn("Không tải được thông tin nhà hàng", e?.message || e)
      }
    }
  }, [restaurant, restaurantId])

  const loadFoods = useCallback(async () => {
    if (!restaurantId) return
    setLoading(true)
    try {
      const data = await restaurantAPI.getRestaurantFoods(restaurantId)
      // API có thể trả về {results: [...]} hoặc mảng trực tiếp
      setFoods(data?.results ?? data ?? [])
    } catch (e) {
      console.error("Lỗi tải danh sách món", e?.response?.data || e?.message || e)
      Alert.alert("Lỗi", "Không thể tải danh sách món ăn")
    } finally {
      setLoading(false)
    }
  }, [restaurantId])

  useEffect(() => {
    loadRestaurant()
  }, [loadRestaurant])

  useEffect(() => {
    loadFoods()
  }, [loadFoods])

  const onRefresh = async () => {
    setRefreshing(true)
    await loadFoods()
    setRefreshing(false)
  }

  const addToCartLocal = async (food) => {
    try {
      await addToCart(food.id, 1, "")
      Alert.alert("Thành công", `Đã thêm '${food.name}' vào giỏ hàng`)
    } catch (e) {
      console.error("addToCart error", e?.response?.data || e?.message || e)
      const msg = e?.response?.data?.detail || e?.response?.data?.error || "Không thể thêm vào giỏ hàng"
      Alert.alert("Lỗi", msg)
    }
  }

  const renderItem = ({ item }) => {
    return (
      <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('FoodDetail', { foodId: item.id, food: item })}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" />
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={styles.foodName}>{item.name}</Text>
          {item.description ? <Text style={styles.foodDesc} numberOfLines={2}>{item.description}</Text> : null}
          {typeof item.price !== 'undefined' ? (
            <Text style={styles.price}>{Number(item.price).toLocaleString()} đ</Text>
          ) : null}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => addToCartLocal(item)}>
          <Text style={styles.addBtnText}>Thêm</Text>
        </TouchableOpacity>
      </TouchableOpacity>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{restaurant?.name || "Nhà hàng"}</Text>
        <TouchableOpacity
          style={styles.cartBtn}
          onPress={() => navigation.navigate('Cart')}
        > 
          <Text style={styles.cartBtnText}>Xem giỏ hàng</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={foods}
        keyExtractor={(item, idx) => String(item.id ?? idx)}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 24 }}
        refreshing={loading && !refreshing}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={!loading ? (
          <View style={{ padding: 24, alignItems: 'center' }}>
            <Text>Chưa có món ăn nào</Text>
          </View>
        ) : null}
      />

      <View style={{ height: 12 }} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  title: { fontSize: 20, fontWeight: '700' },
  cartBtn: { backgroundColor: '#FF6B35', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  cartBtnText: { color: '#fff', fontWeight: '600' },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#eee' },
  image: { width: 72, height: 72, borderRadius: 8, marginRight: 8, backgroundColor: '#f2f2f2' },
  foodName: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  foodDesc: { fontSize: 13, color: '#666' },
  price: { marginTop: 6, fontSize: 14, fontWeight: '600', color: '#FF6B35' },
  addBtn: { backgroundColor: '#222', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, marginLeft: 8 },
  addBtnText: { color: '#fff', fontWeight: '600' },
})
