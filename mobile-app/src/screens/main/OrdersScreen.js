import React, { useState, useEffect } from "react"
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Alert } from "react-native"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { orderAPI, authAPI } from "../../services/api"
import { colors, spacing } from "../../theme/theme"
import { useIsFocused } from "@react-navigation/native"

export default function OrdersScreen({ navigation }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('all') // all | active | history
  const isFocused = useIsFocused()

  useEffect(() => {
    if (isFocused) loadOrders()
  }, [isFocused])

  // Auto-refresh while focused to reflect shipper acceptance/status changes
  useEffect(() => {
    if (!isFocused) return
    const interval = setInterval(() => {
      // Refresh more aggressively when viewing active orders
      loadOrders()
    }, filter === 'active' ? 5000 : 12000)
    return () => clearInterval(interval)
  }, [isFocused, filter])

  const normalizeOrder = (o) => {
    if (!o) return null
    // Support both backend and local fallback shape
    const items = (o.items || []).map((it, idx) => ({
      id: it.id || idx.toString(),
      name: it.name || it.food_name || it.food?.name || "Món ăn",
      qty: it.qty || it.quantity || 1,
      price: Number(it.price ?? it.unit_price ?? it.food?.price ?? 0),
      image: it.image || it.food_image || it.food?.image || null,
    }))
    const subtotal = Number(o.subtotal ?? o.total_amount ?? o.total ?? items.reduce((s, x) => s + (x.qty * x.price), 0)) || 0
    const delivery_fee = Number(o.delivery_fee ?? o.shipping_fee ?? 0) || 0
    const discount = Number(o.discount_amount ?? o.discount ?? 0) || 0
    const total = subtotal + delivery_fee - discount
    
    // Check payment status
    const paymentStatus = o.payment?.status || o.payment_status || 'pending'
    const paymentMethod = o.payment?.payment_method || o.payment_method || 'cash'
    
    // Determine status based on payment and order status
    let status = o.status
    if (paymentStatus === 'pending' && paymentMethod !== 'cash') {
      status = 'pending_payment'
    } else if (paymentStatus === 'paid') {
      status = o.status || 'waiting_shipper'
    } else {
      status = o.status || (paymentStatus === 'completed' ? 'waiting_shipper' : 'processing')
    }
    
    return { ...o, items, subtotal, delivery_fee, discount_amount: discount, total, status, paymentStatus, paymentMethod }
  }

  const loadOrders = async () => {
    setLoading(true)
    try {
      // identify current user to scope local cache
      let userId = null
      let isAuthenticated = false
      try { 
        const me = await authAPI.getProfile(); 
        userId = me?.id || me?.user?.id || me?.pk
        isAuthenticated = true
      } catch { 
        // User not authenticated, clear any existing orders
        setOrders([])
        return
      }
      
      const cacheKey = userId ? `last_order:${userId}` : 'last_order'
      
      // Only proceed if user is authenticated
      if (!isAuthenticated) {
        setOrders([])
        return
      }
      // 1) Try server
      const list = await orderAPI.getMyOrders().catch(() => null)
      if (list && (Array.isArray(list) || Array.isArray(list?.results))) {
        const arr = (Array.isArray(list) ? list : list.results).map(normalizeOrder)
        // Also merge the last locally saved order if server list is empty or missing it
        try {
          const last = await AsyncStorage.getItem(cacheKey)
          if (last) {
            const parsed = JSON.parse(last)
            const local = normalizeOrder(parsed?.order)
            if (local) {
              const exists = arr.find(x => String(x.id) === String(local.id))
              const merged = exists ? arr : [local, ...arr]
              // If server already has it, clear the cache
              if (exists) { try { await AsyncStorage.removeItem(cacheKey) } catch {} }
              setOrders(merged)
              return
            }
          }
        } catch {}
        setOrders(arr)
        return
      }
      // Fallback to last saved order in storage
      const last = await AsyncStorage.getItem(cacheKey)
      if (last) {
        const parsed = JSON.parse(last)
        if (parsed?.order) setOrders([normalizeOrder(parsed.order)])
        else setOrders([])
      } else {
        setOrders([])
      }
    } catch (e) {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  const confirmCancel = (orderId) => {
    Alert.alert('Hủy đơn', 'Bạn có chắc muốn hủy đơn này?', [
      { text: 'Không' },
      { text: 'Hủy đơn', style: 'destructive', onPress: async () => {
        try { await orderAPI.cancelOrder(orderId); await loadOrders() } catch (e) { Alert.alert('Lỗi', 'Không thể hủy đơn') }
      }}
    ])
  }

  const confirmDelete = (orderId) => {
    Alert.alert('Xóa đơn', 'Xóa khỏi lịch sử đơn hàng?', [
      { text: 'Không' },
      { text: 'Xóa', style: 'destructive', onPress: async () => {
        try { await orderAPI.deleteOrder(orderId); await loadOrders() } catch (e) { Alert.alert('Lỗi', e?.response?.data?.error || 'Không thể xóa đơn') }
      }}
    ])
  }

  const renderStatus = (status) => {
    const st = String(status || '').toLowerCase()
    switch (st) {
      case 'pending': return 'Chờ xác nhận'
      case 'confirmed': return 'Đã xác nhận'
      case 'preparing': return 'Đang chuẩn bị'
      case 'ready': return 'Sẵn sàng'
      case 'assigned': return 'Đã giao shipper'
      case 'picked_up': return 'Shipper đã lấy hàng'
      case 'delivering': return 'Đang giao hàng'
      case 'delivered': return 'Đã giao'
      case 'cancelled': return 'Đã hủy'
      case 'pending_payment': return 'Chờ thanh toán'
      default: return st || 'Đang xử lý'
    }
  }

  const renderItem = ({ item }) => {
    const numericId = Number(item?.id)
    const isServerId = Number.isFinite(numericId) && String(item?.id).length <= 10
    const canCancel = isServerId && ['pending','confirmed','ready','processing'].includes(String(item?.status).toLowerCase())
    const canDelete = isServerId && ['delivered','cancelled','ready'].includes(String(item?.status).toLowerCase())
    return (
    <View style={styles.orderItem}>
      <TouchableOpacity
        style={{ flex: 1 }}
        onPress={() => {
          // Only navigate to server-tracked detail when we have a real server ID
          if (isServerId) {
            navigation.navigate('OrderTrackingScreen', { orderId: numericId })
          } else {
            Alert.alert(
              'Đang xử lý',
              'Đơn đang được tạo trên hệ thống. Vui lòng chờ vài giây và kéo xuống để làm mới. Đơn sẽ xuất hiện khi đã được lưu.'
            )
          }
        }}
      >
        <Text style={styles.orderTitle}>Đơn hàng #{item.id}</Text>
        <Text style={styles.orderSub}>
          {item.items?.length || 0} món • {renderStatus(item.status)}
          {typeof item.delivery_fee === 'number' ? ` • Phí ship: ${Number(item.delivery_fee).toLocaleString()}₫` : ''}
        </Text>
      </TouchableOpacity>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.orderTotal}>{Number(item.total).toLocaleString()}₫</Text>
        <View style={styles.rowActions}>
          {canCancel && (
            <TouchableOpacity style={[styles.actionBtn, styles.cancelBtn]} onPress={() => confirmCancel(item.id)}>
              <Text style={styles.actionBtnText}>Hủy</Text>
            </TouchableOpacity>
          )}
          {canDelete && (
            <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => confirmDelete(item.id)}>
              <Text style={styles.actionBtnText}>Xóa</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  )}

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Đơn hàng của tôi</Text>
      <View style={styles.filters}>
        {['all','active','history'].map(key => (
          <TouchableOpacity key={key} onPress={() => setFilter(key)} style={[styles.filterChip, filter===key && styles.filterChipActive]}>
            <Text style={[styles.filterText, filter===key && styles.filterTextActive]}>
              {key==='all'?'Tất cả':key==='active'?'Đang xử lý':'Lịch sử'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={orders.filter(o => {
          const st = String(o?.status||'').toLowerCase()
          if (filter==='active') return !['delivered','cancelled'].includes(st)
          if (filter==='history') return ['delivered','cancelled'].includes(st)
          return true
        })}
        keyExtractor={(item, idx) => String(item?.id ?? idx)}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={loadOrders} />}
        ListEmptyComponent={!loading ? <Text>Chưa có đơn hàng</Text> : null}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md, backgroundColor: colors.white },
  title: { fontSize: 20, marginBottom: spacing.md, fontWeight: '700' },
  orderItem: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orderTitle: { fontSize: 16, fontWeight: '600', color: colors.dark },
  orderSub: { fontSize: 12, color: colors.gray, marginTop: 2 },
  orderTotal: { fontSize: 16, fontWeight: '700', color: colors.primary },
  rowActions: { flexDirection: 'row', gap: 12, marginTop: 6 },
  actionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  actionBtnText: { color: '#fff', fontWeight: '700' },
  cancelBtn: { backgroundColor: '#E67E22' },
  deleteBtn: { backgroundColor: '#E74C3C' },
  filters: { flexDirection: 'row', gap: 8, marginBottom: spacing.sm },
  filterChip: { borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  filterChipActive: { backgroundColor: '#F5F7FF', borderColor: colors.primary },
  filterText: { color: colors.dark },
  filterTextActive: { color: colors.primary, fontWeight: '700' },
})
