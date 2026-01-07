import React, { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { theme } from '../../theme/theme'
import { orderAPI } from '../../services/api'

export default function WaitingForShipperScreen({ route, navigation }) {
  const { orderId, order: initialOrder } = route.params || {}
  const [order, setOrder] = useState(initialOrder || null)
  const [loading, setLoading] = useState(!initialOrder)
  const timerRef = useRef(null)
  const [resolvedOrderId, setResolvedOrderId] = useState(Number.isFinite(Number(orderId)) ? Number(orderId) : null)

  // Try to fetch a specific order id
  const loadOrder = async () => {
    if (!resolvedOrderId) return
    try {
      const data = await orderAPI.getOrderDetail(resolvedOrderId)
      setOrder(data)
      // If shipper assigned or status advanced, go to tracking
      const s = (data?.status || '').toLowerCase()
      const hasShipper = !!data?.shipper
      if (hasShipper || ['accepted', 'picked_up', 'in_transit', 'delivering'].includes(s)) {
        Alert.alert('Thông báo', 'Shipper đã nhận đơn, chuyển sang màn hình theo dõi.')
        navigation.replace('OrderTrackingScreen', { orderId: resolvedOrderId })
      }
    } catch (e) {
      // If cannot load by id (e.g., 404 because we only have a temp/local id),
      // clear resolvedOrderId to switch to locate-by-list mode.
      setResolvedOrderId(null)
    } finally {
      setLoading(false)
    }
  }

  // If we don't yet have a real server order id, poll my orders to locate it
  const locateServerOrder = async () => {
    try {
      const list = await orderAPI.getMyOrders().catch(() => [])
      const arr = Array.isArray(list) ? list : (list?.results || [])
      if (!Array.isArray(arr)) return
      // Heuristics: pick most recent order in a waiting state and try to match by address/total
      const recent = arr
        .filter(o => (['ready','pending','processing','confirmed','preparing'].includes(String(o?.status||'').toLowerCase())))
        .sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0))
      if (recent.length === 0) return
      if (!initialOrder) {
        // adopt newest
        setOrder(recent[0])
        setResolvedOrderId(recent[0]?.id)
        return
      }
      const tgtTotal = Number(initialOrder?.total_amount ?? initialOrder?.total)
      const tgtAddr = String(initialOrder?.delivery_address||'').trim().toLowerCase()
      const found = recent.find(o => {
        const tot = Number(o?.total_amount ?? o?.total)
        const addr = String(o?.delivery_address||'').trim().toLowerCase()
        const closeTotal = !Number.isNaN(tgtTotal) ? Math.abs(tot - tgtTotal) < 1 : true
        const addrMatch = tgtAddr ? addr.includes(tgtAddr.slice(0, Math.min(10, tgtAddr.length))) : true
        return closeTotal && addrMatch
      }) || recent[0]
      if (found?.id) {
        setOrder(found)
        setResolvedOrderId(found.id)
      }
    } catch {}
  }

  useEffect(() => {
    if (resolvedOrderId) {
      loadOrder()
      timerRef.current = setInterval(loadOrder, 3000)
    } else {
      locateServerOrder()
      timerRef.current = setInterval(locateServerOrder, 3000)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [resolvedOrderId])

  const status = String(order?.status || '').toLowerCase()
  const waitingRestaurant = ['pending','processing','confirmed','preparing'].includes(status)
  const waitingShipper = ['ready','waiting_shipper'].includes(status)

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Ionicons name="time-outline" size={56} color={theme.colors.primary} />
        <Text style={styles.title}>
          {waitingRestaurant ? 'Đang chờ nhà hàng xác nhận/chuẩn bị' : 'Đang chờ shipper nhận đơn'}
        </Text>
        <Text style={styles.subtitle}>Mã đơn hàng #{resolvedOrderId ? resolvedOrderId : 'Đang tạo...'}</Text>
        <Text style={styles.address} numberOfLines={2}>{order?.delivery_address || 'Đang cập nhật địa chỉ...'}</Text>
        <View style={{ height: 16 }} />
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} />
        ) : (
          <Text style={styles.note}>
            {waitingRestaurant
              ? 'Nhà hàng đang xác nhận/chuẩn bị món. Khi nhà hàng đánh dấu "Sẵn sàng", đơn sẽ được chuyển cho shipper.'
              : 'Chúng tôi sẽ thông báo khi shipper đã nhận đơn. Bạn có thể theo dõi trạng thái ở màn Theo dõi đơn hàng.'}
          </Text>
        )}
        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnPrimary]} onPress={() => {
            if (resolvedOrderId) navigation.navigate('OrderTrackingScreen', { orderId: resolvedOrderId })
          }}>
            <Ionicons name="location" size={18} color="#fff" />
            <Text style={styles.btnPrimaryText}>Theo dõi đơn hàng</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => navigation.navigate('MainTabs', { screen: 'Orders' })}>
            <Text style={styles.btnGhostText}>Đơn của tôi</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => navigation.navigate('Home')}>
            <Text style={styles.btnGhostText}>Về trang chủ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background, padding: theme.spacing.md, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: theme.spacing.lg, width: '100%', alignItems: 'center', elevation: 2 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginTop: 12 },
  subtitle: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 4 },
  address: { fontSize: 14, color: theme.colors.text, marginTop: 6, textAlign: 'center' },
  note: { fontSize: 12, color: theme.colors.textSecondary, textAlign: 'center' },
  actions: { width: '100%', marginTop: 16, gap: 8 },
  btn: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 12, borderRadius: 10 },
  btnPrimary: { backgroundColor: theme.colors.primary, gap: 8 },
  btnPrimaryText: { color: '#fff', fontWeight: '700' },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.colors.border },
  btnGhostText: { color: theme.colors.text, fontWeight: '600' },
})
