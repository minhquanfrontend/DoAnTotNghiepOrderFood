import React, { useEffect, useState } from "react"
import { View, Text, Button, StyleSheet, Alert, ActivityIndicator, TextInput } from "react-native"
import { useCart } from "../../context/CartContext"
import { orderAPI, authAPI } from "../../services/api"
import AsyncStorage from "@react-native-async-storage/async-storage"

export default function CheckoutScreen({ navigation, route }) {
  const { cart, getCartTotal } = useCart()
  const [submitting, setSubmitting] = useState(false)
  const [address, setAddress] = useState("")
  const [phone, setPhone] = useState("")
  const [coords, setCoords] = useState(null) // { lat, lng }

  useEffect(() => {
    const addr = route?.params?.selectedAddress
    const c = route?.params?.selectedCoords
    if (addr) setAddress(addr)
    if (c && typeof c.lat === 'number' && typeof c.lng === 'number') setCoords(c)
  }, [route?.params?.selectedAddress, route?.params?.selectedCoords])

  const geocodeAddressVN = async (query) => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=1&countrycodes=vn&q=${encodeURIComponent(query)}`
      const res = await fetch(url, { headers: { 'User-Agent': 'food-delivery-app/1.0' } })
      const data = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      }
    } catch {}
    return null
  }

  // Load default saved address on first mount
  useEffect(() => {
    (async () => {
      try {
        if (!route?.params?.selectedAddress) {
          const raw = await AsyncStorage.getItem('default_delivery_address')
          if (raw) {
            const obj = JSON.parse(raw)
            if (obj?.address) setAddress(obj.address)
            if (typeof obj?.lat === 'number' && typeof obj?.lng === 'number') setCoords({ lat: obj.lat, lng: obj.lng })
          }
        }
        // Prefill phone from profile if empty
        try {
          if (!phone) {
            const profile = await authAPI.getProfile()
            const p = profile?.phone || profile?.phone_number || profile?.mobile
            if (p) setPhone(String(p))
          }
        } catch {}
      } catch {}
    })()
  }, [])

  const parseLatLng = (text) => {
    try {
      // Supports: "10.123,106.456" or Google Maps URLs like .../@10.123,106.456,...
      const atIdx = text.indexOf("@")
      let candidate = text
      if (atIdx !== -1) candidate = text.slice(atIdx + 1)
      const match = candidate.match(/(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/)
      if (match) {
        return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) }
      }
      return null
    } catch {
      return null
    }
  }

  const handleConfirm = async () => {
    try {
      setSubmitting(true)
      if (!address.trim()) {
        Alert.alert("Thiếu địa chỉ", "Vui lòng nhập địa chỉ giao hàng")
        setSubmitting(false)
        return
      }
      if (!phone.trim()) {
        Alert.alert("Thiếu số điện thoại", "Vui lòng nhập số điện thoại người nhận")
        setSubmitting(false)
        return
      }
      // Chuẩn bị payload đơn hàng tối thiểu. Điều chỉnh theo backend nếu cần.
      const items = (cart?.items || []).map((it) => ({
        food_id: (typeof it.food_id === 'object' ? it.food_id?.id : it.food_id) || (typeof it.food === 'object' ? it.food?.id : it.food) || it.foodId,
        quantity: Number(it.quantity) || 1,
        notes: it.notes || "",
      })).filter(x => x.food_id)
      const payload = {
        items,
        total_amount: Number(getCartTotal()) || 0,
        delivery_address: address,
        delivery_phone: phone,
        payment_method: "cash",
      }
      // Resolve coordinates: priority selected coords -> parsed from input -> geocode
      let resolved = coords || parseLatLng(address)
      if (!resolved && address && address.length > 5) {
        try { resolved = await geocodeAddressVN(address) } catch {}
      }
      if (resolved) {
        payload.delivery_latitude = resolved.lat
        payload.delivery_longitude = resolved.lng
      }
      try {
        const order = await orderAPI.createOrder(payload)
        if (order?.id) {
          const orderWithAddress = { ...order, delivery_address: address, delivery_phone: phone, delivery_latitude: payload.delivery_latitude, delivery_longitude: payload.delivery_longitude }
          try {
            let userId = null
            try { const me = await authAPI.getProfile(); userId = me?.id || me?.user?.id || me?.pk } catch {}
            const cacheKey = userId ? `last_order:${userId}` : 'last_order'
            await AsyncStorage.setItem(cacheKey, JSON.stringify({ order: orderWithAddress }))
          } catch {}
          // Điều hướng sang Payment; việc theo dõi sẽ được chuyển sau khi thanh toán
          navigation.navigate('Payment', { order: orderWithAddress })
          return
        }
        throw new Error('Order API returned no id')
      } catch (apiErr) {
        // Thử lấy đơn mới nhất rồi chuyển sang Payment
        try {
          const list = await orderAPI.getMyOrders().catch(() => null)
          const arr = Array.isArray(list) ? list : (list?.results || [])
          if (Array.isArray(arr) && arr.length > 0) {
            const recent = arr.sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0))[0]
            if (recent?.id) {
              try {
                let userId = null
                try { const me = await authAPI.getProfile(); userId = me?.id || me?.user?.id || me?.pk } catch {}
                const cacheKey = userId ? `last_order:${userId}` : 'last_order'
                await AsyncStorage.setItem(cacheKey, JSON.stringify({ order: recent }))
              } catch {}
              navigation.navigate('Payment', { order: recent })
              return
            }
          }
        } catch {}
        // Fallback: tạo đơn local và vẫn sang Payment
        const localOrder = {
          id: Date.now(),
          items,
          total_amount: payload.total_amount,
          subtotal: payload.total_amount,
          delivery_fee: 0,
          discount_amount: 0,
          delivery_address: address,
          status: 'created',
        }
        try {
          let userId = null
          try { const me = await authAPI.getProfile(); userId = me?.id || me?.user?.id || me?.pk } catch {}
          const cacheKey = userId ? `last_order:${userId}` : 'last_order'
          await AsyncStorage.setItem(cacheKey, JSON.stringify({ order: localOrder }))
        } catch {}
        navigation.navigate('Payment', { order: localOrder, offline: true })
      }
    } catch (e) {
      const msg = e?.response?.data ? JSON.stringify(e.response.data) : (e?.message || "Tạo đơn hàng thất bại")
      Alert.alert("Lỗi", msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Thanh toán</Text>
      <Text style={styles.total}>Tổng cộng: {Number(getCartTotal()).toLocaleString()}₫</Text>
      <TextInput
        style={styles.input}
        placeholder="Địa chỉ giao hàng"
        value={address}
        onChangeText={setAddress}
      />
      <View style={{ width: '90%', marginBottom: 8 }}>
        <Button title="Chọn địa chỉ trên bản đồ" onPress={() => navigation.navigate('AddressPicker', { from: 'Checkout', saveAsDefault: true })} />
      </View>
      <TextInput
        style={styles.input}
        placeholder="Số điện thoại người nhận"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      {submitting ? (
        <ActivityIndicator size="large" />
      ) : (
        <Button title="Tiếp tục chọn phương thức thanh toán" onPress={handleConfirm} />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, marginBottom: 16 },
  total: { fontSize: 18, marginBottom: 16, fontWeight: '600' },
  input: { width: '90%', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, marginBottom: 12 },
})
