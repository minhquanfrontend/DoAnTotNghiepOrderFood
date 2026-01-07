import React, { useEffect, useState } from "react"
import { ScrollView, StyleSheet, RefreshControl, View, Alert } from "react-native"
import { Card, Title, Paragraph, Button, Text, Chip, Switch, Snackbar } from "react-native-paper"
import * as Location from 'expo-location'
import { orderAPI, authAPI } from "../../services/api"
import AsyncStorage from "@react-native-async-storage/async-storage"

export default function ShipperDashboardScreen({ navigation }) {
  const [available, setAvailable] = useState([])
  const [myDeliveries, setMyDeliveries] = useState([])
  const [loading, setLoading] = useState(false)
  const [isAvailable, setIsAvailable] = useState(true)
  const [radiusKm, setRadiusKm] = useState(3)
  const [loc, setLoc] = useState(null) // live gps
  const [baseLoc, setBaseLoc] = useState(null) // persistent work location { lat, lng, address }
  const [baseAddress, setBaseAddress] = useState('')
  const [watchSub, setWatchSub] = useState(null)
  const [prevAvailIds, setPrevAvailIds] = useState([])
  const [snack, setSnack] = useState({ visible: false, text: '' })
  const [permDenied, setPermDenied] = useState(false)

  const loadData = async (forceAll = false) => {
    try {
      setLoading(true)
      // prefer persistent base location for scanning; fallback to live gps
      const scanLat = (baseLoc?.lat ?? loc?.latitude)
      const scanLng = (baseLoc?.lng ?? loc?.longitude)
      let [availRes, myRes] = await Promise.all([
        forceAll ? orderAPI.getAvailableOrders(undefined, undefined, undefined).catch(() => []) : orderAPI.getAvailableOrders(scanLat, scanLng, radiusKm).catch(() => []),
        orderAPI.getMyDeliveries().catch(() => []),
      ])
      let list = (availRes?.results || availRes) ?? []
      // Fallback: if filtered scan returns empty but we had a location, retry without filters
      if (!forceAll && Array.isArray(list) && list.length === 0 && (typeof scanLat === 'number' && typeof scanLng === 'number')) {
        try {
          const unfiltered = await orderAPI.getAvailableOrders(undefined, undefined, undefined)
          list = (unfiltered?.results || unfiltered) ?? []
          if (Array.isArray(list) && list.length > 0) {
            setSnack({ visible: true, text: 'Hiển thị tất cả đơn (ngoài bán kính đã chọn)' })
          }
        } catch {}
      }
      // If no location is available and result empty, auto try show-all once
      if (!forceAll && (!scanLat || !scanLng) && Array.isArray(list) && list.length === 0) {
        try {
          const unfiltered = await orderAPI.getAvailableOrders(undefined, undefined, undefined)
          list = (unfiltered?.results || unfiltered) ?? []
          if (Array.isArray(list) && list.length > 0) {
            setSnack({ visible: true, text: 'Hiển thị tất cả đơn (không có vị trí hiện tại)' })
          }
        } catch {}
      }
      // Backend now sends orders with 'finding_shipper' status, so no need to filter on client.
      try {
        if (Array.isArray(list)) {
          setAvailable(list);
          if (list.length === 0 && (scanLat && scanLng)) {
            setSnack({ visible: true, text: 'Chưa có đơn hàng mới nào gần bạn.' });
          }
        } else {
          setAvailable([]);
        }
      } catch {
        setAvailable(list || []);
      }
      // detect newly appeared orders to notify
      try {
        const currIds = Array.isArray(list) ? list.map(o => o.id) : []
        const newOnes = currIds.filter(id => !prevAvailIds.includes(id))
        if (newOnes.length > 0) {
          setSnack({ visible: true, text: `Có ${newOnes.length} đơn mới gần bạn` })
        }
        setPrevAvailIds(currIds)
      } catch {}
      setMyDeliveries((myRes?.results || myRes) ?? [])
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [baseLoc?.lat, baseLoc?.lng, loc?.latitude, loc?.longitude, radiusKm])

  // Load persistent base location
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('shipper_base_location')
        if (raw) {
          const obj = JSON.parse(raw)
          setBaseLoc(obj)
          setBaseAddress(obj?.address || '')
        }
      } catch {}
    })()
  }, [])

  // Reload base location when screen is focused
  useEffect(() => {
    const unsub = navigation.addListener('focus', async () => {
      try {
        const raw = await AsyncStorage.getItem('shipper_base_location')
        if (raw) {
          const obj = JSON.parse(raw)
          setBaseLoc(obj)
          setBaseAddress(obj?.address || '')
        }
      } catch {}
    })
    return unsub
  }, [navigation])

  // Watch current location and periodically update backend
  useEffect(() => {
    let sub
    ;(async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          sub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 },
            async (pos) => {
              const ll = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }
              setLoc(ll)
              try { await authAPI.updateLocation(ll.latitude, ll.longitude, isAvailable) } catch {}
            }
          )
          setWatchSub(sub)
          setPermDenied(false)
        } else {
          setPermDenied(true)
        }
      } catch {}
    })()
    return () => { try { sub && sub.remove() } catch {} }
  }, [isAvailable])

  // Auto-poll for new available orders every 15s
  useEffect(() => {
    const id = setInterval(() => { loadData() }, 15000)
    return () => clearInterval(id)
  }, [baseLoc?.lat, baseLoc?.lng, loc?.latitude, loc?.longitude, radiusKm])

  const acceptOrder = async (orderId) => {
    console.log(`Attempting to accept order ${orderId}`)
    try {
      const result = await orderAPI.acceptOrder(orderId)
      console.log('Order accepted successfully:', result)
      await loadData()
      navigation.navigate("DeliveryMap", { orderId })
    } catch (e) {
      console.error('Error accepting order:', e)
      const msg = e?.response?.data?.error || e?.response?.data?.message || e?.message || "Lỗi không xác định"
      console.error('Error details:', { status: e?.response?.status, data: e?.response?.data, message: e?.message })
      Alert.alert("Không thể nhận đơn", msg + ". Vui lòng thử lại.")
    }
  }

  return (
    <ScrollView style={styles.container} refreshControl={<RefreshControl refreshing={loading} onRefresh={loadData} />}>
      <Card style={styles.card}>
        <Card.Content>
          <Title>Trạng thái hoạt động</Title>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <Text>Nhận đơn</Text>
            <Switch value={isAvailable} onValueChange={async (v) => { setIsAvailable(v); if (loc) { try { await authAPI.updateLocation(loc.latitude, loc.longitude, v) } catch {} } }} />
          </View>
          <View style={{ marginTop: 12 }}>
            <Text>Bán kính quét: {radiusKm} km</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              {[1,3,5,10].map(km => (
                <Chip key={km} selected={radiusKm===km} onPress={() => setRadiusKm(km)} style={{ marginRight: 8, marginBottom: 8 }}>{km} km</Chip>
              ))}
              <Button onPress={loadData} mode="outlined">Quét đơn quanh tôi</Button>
            </View>
            <Text style={{ marginTop: 8, color: '#666' }}>Điểm bắt đơn: {baseAddress ? baseAddress : (baseLoc ? `${baseLoc.lat?.toFixed(5)}, ${baseLoc.lng?.toFixed(5)}` : 'Chưa thiết lập')}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Button mode="contained" onPress={() => navigation.navigate('SetWorkLocation')}>Đặt điểm bắt đơn</Button>
            </View>
            <Text style={{ marginTop: 8, color: '#999' }}>Vị trí GPS hiện tại: {loc ? `${loc.latitude.toFixed(5)}, ${loc.longitude.toFixed(5)}` : 'Đang cập nhật...'}</Text>
          </View>
        </Card.Content>
      </Card>
      <Text variant="titleMedium" style={{ marginBottom: 8 }}>Đơn có thể nhận</Text>
      {(!baseLoc && !loc) && (
        <Chip icon="information-outline" style={{ marginBottom: 8 }}>
          Không có vị trí hiện tại. Đang hiển thị tất cả đơn.
        </Chip>
      )}
      {available.length === 0 ? (
        <Card style={[styles.card, { alignItems: 'center' } ]}>
          <Card.Content style={{ alignItems: 'center' }}>
            <Title>Chưa có đơn sẵn sàng</Title>
            <Paragraph style={{ textAlign: 'center', color: '#666' }}>
              {permDenied
                ? 'Ứng dụng chưa được cấp quyền vị trí. Cấp quyền để quét đơn quanh bạn.'
                : 'Hiện chưa có đơn hàng nào cần giao trong khu vực của bạn. Vui lòng thử lại sau.'}
            </Paragraph>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, justifyContent: 'center' }}>
              {permDenied ? (
                <Button mode="contained" onPress={async () => {
                  try {
                    const { status } = await Location.requestForegroundPermissionsAsync()
                    setPermDenied(status !== 'granted')
                    if (status === 'granted') loadData()
                  } catch {}
                }}>Cấp quyền vị trí</Button>
              ) : (
                <>
                  <Button mode="contained" onPress={() => setRadiusKm(Math.min(10, radiusKm + 2))}>+2 km</Button>
                  <Button mode="outlined" onPress={() => navigation.navigate('SetWorkLocation')}>Đặt điểm bắt đơn</Button>
                  <Button mode="outlined" onPress={() => loadData(true)}>Hiển thị tất cả đơn</Button>
                  <Button onPress={() => loadData()} icon="refresh">Quét lại</Button>
                </>
              )}
            </View>
          </Card.Content>
        </Card>
      ) : available.map((o) => (
        <Card key={`a_${o.id}`} style={styles.card}>
          <Card.Content>
            <Title>Đơn #{o.id}</Title>
            <Paragraph>Nhà hàng: {o.restaurant_name || o.restaurant?.name}</Paragraph>
            <Paragraph>Giao đến: {o.delivery_address || o.customer_address}</Paragraph>
            {typeof o.distance_km === 'number' ? (
              <Paragraph>Khoảng cách: {o.distance_km.toFixed(1)} km</Paragraph>
            ) : null}
          </Card.Content>
          <Card.Actions>
            <Button mode="contained" onPress={() => acceptOrder(o.id)}>Nhận đơn</Button>
          </Card.Actions>
        </Card>
      ))}

      <Text variant="titleMedium" style={{ marginVertical: 8 }}>Đơn đang giao</Text>
      {myDeliveries.length === 0 ? (
        <Card style={styles.card}>
          <Card.Content>
            <Paragraph>Chưa có đơn đang giao. Khi bạn nhận đơn, đơn sẽ hiển thị tại đây.</Paragraph>
          </Card.Content>
        </Card>
      ) : myDeliveries.map((o) => (
        <Card key={`m_${o.id}`} style={styles.card}>
          <Card.Content>
            <Title>Đơn #{o.id}</Title>
            <Paragraph>Nhà hàng: {o.restaurant_name || o.restaurant?.name}</Paragraph>
            <Paragraph>Giao đến: {o.delivery_address || o.customer_address}</Paragraph>
            <Paragraph>Trạng thái: {o.status}</Paragraph>
          </Card.Content>
          <Card.Actions>
            <Button mode="outlined" onPress={() => navigation.navigate("DeliveryMap", { orderId: o.id })}>Xem bản đồ</Button>
          </Card.Actions>
        </Card>
      ))}
      <Snackbar
        visible={snack.visible}
        onDismiss={() => setSnack({ visible: false, text: '' })}
        duration={3000}
        action={{ label: 'Xem', onPress: () => {} }}
      >
        {snack.text}
      </Snackbar>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  card: { marginBottom: 16, borderRadius: 12 },
})
