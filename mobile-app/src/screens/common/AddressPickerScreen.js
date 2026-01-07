import React, { useEffect, useState, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, TextInput, FlatList } from 'react-native'
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps'
import * as Location from 'expo-location'
import { Ionicons } from '@expo/vector-icons'
import { colors } from '../../theme/theme'
import AsyncStorage from '@react-native-async-storage/async-storage'

export default function AddressPickerScreen({ route, navigation }) {
  const from = route?.params?.from || 'Checkout'
  const mapRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [region, setRegion] = useState({
    latitude: 10.7769,
    longitude: 106.7009,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  })
  const [pin, setPin] = useState(null) // { latitude, longitude }
  const [address, setAddress] = useState('')
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState([])

  // Giới hạn trong lãnh thổ Việt Nam (ước lượng)
  const VN_BOUNDS = { minLat: 8.18, maxLat: 23.39, minLng: 102.14, maxLng: 109.47 }
  const clampToVN = (lat, lng) => ({
    latitude: Math.min(Math.max(lat, VN_BOUNDS.minLat), VN_BOUNDS.maxLat),
    longitude: Math.min(Math.max(lng, VN_BOUNDS.minLng), VN_BOUNDS.maxLng),
  })

  useEffect(() => {
    (async () => {
      try {
        // First, try to load saved address
        const savedAddress = await AsyncStorage.getItem('default_delivery_address')
        if (savedAddress) {
          const saved = JSON.parse(savedAddress)
          if (saved.lat && saved.lng) {
            const initial = {
              latitude: saved.lat,
              longitude: saved.lng,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }
            setRegion(initial)
            setPin({ latitude: saved.lat, longitude: saved.lng })
            setAddress(saved.address || '')
            setTimeout(() => {
              try { mapRef.current?.animateToRegion(initial, 600) } catch {}
            }, 200)
            setLoading(false)
            return
          }
        }

        // If no saved address, use current location
        const { status } = await Location.requestForegroundPermissionsAsync()
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
          const clamped = clampToVN(loc.coords.latitude, loc.coords.longitude)
          const initial = {
            latitude: clamped.latitude,
            longitude: clamped.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }
          setRegion(initial)
          setPin({ latitude: initial.latitude, longitude: initial.longitude })
          reverseGeocode(initial.latitude, initial.longitude)
          setTimeout(() => {
            try { mapRef.current?.animateToRegion(initial, 600) } catch {}
          }, 200)
        }
      } catch (e) {
        // ignore permission errors, keep default region
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const reverseGeocode = async (lat, lng) => {
    const safeLat = Number(lat) || 0
    const safeLng = Number(lng) || 0
    const fallbackAddr = `${(safeLat).toFixed(6)}, ${(safeLng).toFixed(6)}`
    
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: safeLat, longitude: safeLng })
      if (results && results.length) {
        const r = results[0]
        const composed = [r.name, r.street, r.subregion, r.region, r.country].filter(Boolean).join(', ')
        setAddress(composed || fallbackAddr)
      } else {
        setAddress(fallbackAddr)
      }
    } catch {
      setAddress(fallbackAddr)
    }
  }

  const onMapPress = (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate
    const c = clampToVN(latitude, longitude)
    setPin({ latitude: c.latitude, longitude: c.longitude })
    reverseGeocode(c.latitude, c.longitude)
  }

  // Giới hạn di chuyển bản đồ trong VN
  const onRegionChangeComplete = (reg) => {
    const c = clampToVN(reg.latitude, reg.longitude)
    if (c.latitude !== reg.latitude || c.longitude !== reg.longitude) {
      const fixed = { ...reg, latitude: c.latitude, longitude: c.longitude }
      setRegion(fixed)
      try { mapRef.current?.animateToRegion(fixed, 0) } catch {}
    } else {
      setRegion(reg)
    }
  }

  // Tìm kiếm địa chỉ với Nominatim (không cần API key), giới hạn country=vn
  useEffect(() => {
    const h = setTimeout(async () => {
      const q = (search || '').trim()
      if (!q) { setSuggestions([]); return }
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=vn&q=${encodeURIComponent(q)}`
        const res = await fetch(url, { headers: { 'User-Agent': 'food-delivery-app/1.0' } })
        const data = await res.json()
        const items = Array.isArray(data) ? data.map(d => ({
          key: String(d.place_id),
          title: d.display_name,
          lat: parseFloat(d.lat),
          lng: parseFloat(d.lon),
        })) : []
        setSuggestions(items)
      } catch { setSuggestions([]) }
    }, 350)
    return () => clearTimeout(h)
  }, [search])

  const pickSuggestion = (item) => {
    const c = clampToVN(item.lat, item.lng)
    const nextRegion = { latitude: c.latitude, longitude: c.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 }
    setRegion(nextRegion)
    setPin({ latitude: c.latitude, longitude: c.longitude })
    setAddress(item.title)
    setSuggestions([])
    try { mapRef.current?.animateToRegion(nextRegion, 600) } catch {}
  }

  const useCurrent = async () => {
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const c = clampToVN(loc.coords.latitude, loc.coords.longitude)
      const nextRegion = { latitude: c.latitude, longitude: c.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 }
      setRegion(nextRegion)
      setPin({ latitude: c.latitude, longitude: c.longitude })
      reverseGeocode(c.latitude, c.longitude)
      try { mapRef.current?.animateToRegion(nextRegion, 600) } catch {}
    } catch {
      Alert.alert('Lỗi', 'Không lấy được vị trí hiện tại')
    }
  }

  const confirm = async () => {
    if (!pin || !address) {
      Alert.alert('Chưa chọn vị trí', 'Chạm vào bản đồ để chọn vị trí giao hàng')
      return
    }
    const coords = { lat: pin.latitude, lng: pin.longitude }
    
    console.log('[AddressPicker] Confirming address:', address, 'coords:', coords)
    
    // Save to temp storage for immediate use - this is the PRIMARY way to pass data
    try {
      await AsyncStorage.setItem('temp_selected_address', JSON.stringify({
        address,
        coords,
        timestamp: Date.now()
      }))
      console.log('[AddressPicker] ✅ Saved to temp_selected_address')
    } catch (e) {
      console.error('[AddressPicker] Error saving temp address:', e)
    }
    
    // Also save as default for future orders
    try {
      await AsyncStorage.setItem('default_delivery_address', JSON.stringify({ address, ...coords }))
      console.log('[AddressPicker] ✅ Saved to default_delivery_address')
    } catch (e) {
      console.error('[AddressPicker] Error saving default address:', e)
    }
    
    // Go back - the Checkout screen will read from AsyncStorage on focus
    console.log('[AddressPicker] Going back...')
    navigation.goBack()
  }

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.center}> 
          <ActivityIndicator size="large" />
          <Text>Đang lấy vị trí hiện tại...</Text>
        </View>
      ) : (
        <>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={region}
            onRegionChangeComplete={onRegionChangeComplete}
            onPress={onMapPress}
            provider={PROVIDER_DEFAULT}
            mapType="standard"
          >
            {pin && (
              <Marker coordinate={pin} title="Vị trí giao hàng" description={address} />
            )}
          </MapView>
          {/* Thanh tìm kiếm */}
          <View style={styles.searchBar}>
            <TextInput
              style={styles.searchInput}
              placeholder="Tìm địa chỉ (chỉ trong Việt Nam)"
              value={search}
              onChangeText={setSearch}
            />
            <TouchableOpacity style={styles.currentBtn} onPress={useCurrent}>
              <Ionicons name="locate" size={18} color="#fff" />
              <Text style={{ color: '#fff', marginLeft: 6 }}>Vị trí của tôi</Text>
            </TouchableOpacity>
          </View>
          {suggestions.length > 0 && (
            <View style={styles.suggestBox}>
              <FlatList
                data={suggestions}
                keyExtractor={(item) => item.key}
                renderItem={({ item }) => (
                  <TouchableOpacity style={styles.suggestItem} onPress={() => pickSuggestion(item)}>
                    <Ionicons name="search" size={16} color={colors.primary} />
                    <Text style={styles.suggestText} numberOfLines={2}>{item.title}</Text>
                  </TouchableOpacity>
                )}
              />
            </View>
          )}
          <View style={styles.addressBar}>
            <Ionicons name="location" size={18} color={colors.primary} />
            <Text style={styles.addressText} numberOfLines={2}>{address || 'Chọn vị trí trên bản đồ'}</Text>
            <TouchableOpacity style={styles.confirmBtn} onPress={confirm}>
              <Text style={styles.confirmText}>Xác nhận</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  map: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  searchBar: {
    position: 'absolute', top: 16, left: 12, right: 12,
    backgroundColor: 'white', borderRadius: 12, padding: 8, elevation: 3,
  },
  searchInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, backgroundColor: '#fff' },
  currentBtn: {
    marginTop: 8, alignSelf: 'flex-start', backgroundColor: colors.primary,
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', alignItems: 'center'
  },
  suggestBox: {
    position: 'absolute', top: 80, left: 12, right: 12,
    backgroundColor: 'white', borderRadius: 12, maxHeight: 180, elevation: 3,
  },
  suggestItem: { flexDirection: 'row', padding: 10, alignItems: 'center' },
  suggestText: { marginLeft: 8, flex: 1 },
  addressBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 3,
  },
  addressText: { flex: 1, marginHorizontal: 8 },
  confirmBtn: { backgroundColor: colors.primary, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  confirmText: { color: 'white', fontWeight: '600' },
})
