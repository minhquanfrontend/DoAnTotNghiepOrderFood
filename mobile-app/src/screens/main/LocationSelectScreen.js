import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, TextInput } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Location from 'expo-location'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { colors, spacing } from '../../theme/theme'

export default function LocationSelectScreen({ navigation }) {
  const [radiusKm, setRadiusKm] = useState(5)
  const [selected, setSelected] = useState(null) // { name, lat, lng }
  const [loading, setLoading] = useState(false)
  const [pasteText, setPasteText] = useState("")

  useEffect(() => {
    (async () => {
      try {
        const [savedLoc, savedRadius] = await Promise.all([
          AsyncStorage.getItem('selected_location'),
          AsyncStorage.getItem('radius_km'),
        ])
        if (savedLoc) setSelected(JSON.parse(savedLoc))
        if (savedRadius) {
          const num = Number(savedRadius)
          if (!Number.isNaN(num) && num > 0) setRadiusKm(num)
        }

  const parseLatLng = (text) => {
    try {
      // Accept "10.123,106.456" or Google Maps URL containing @lat,lng
      const atIdx = text.indexOf("@")
      let candidate = text
      if (atIdx !== -1) candidate = text.slice(atIdx + 1)
      const match = candidate.match(/(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/)
      if (match) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) }
      return null
    } catch { return null }
  }

  const applyPasted = () => {
    const coords = parseLatLng(pasteText)
    if (!coords) {
      Alert.alert('Không hợp lệ', 'Không tìm thấy toạ độ trong văn bản đã dán')
      return
    }
    setSelected({ name: pasteText.slice(0, 40) || 'Địa chỉ đã dán', lat: coords.lat, lng: coords.lng })
    Alert.alert('Đã chọn', 'Đã chọn vị trí từ địa chỉ đã dán')
  }
      } catch (e) {}
    })()
  }, [])

  const presetAreas = [
    { name: 'Quận 1', lat: 10.775658, lng: 106.700424 },
    { name: 'Quận 3', lat: 10.784245, lng: 106.686593 },
    { name: 'Quận 7', lat: 10.738, lng: 106.721 },
    { name: 'Thủ Đức', lat: 10.852, lng: 106.753 },
    { name: 'Hà Nội - Hoàn Kiếm', lat: 21.028511, lng: 105.804817 },
  ]

  const useCurrentLocation = async () => {
    try {
      setLoading(true)
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Quyền vị trí bị từ chối', 'Hãy cấp quyền vị trí để lọc theo khu vực')
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const { latitude, longitude } = pos.coords
      setSelected({ name: 'Vị trí hiện tại', lat: latitude, lng: longitude })
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể lấy vị trí hiện tại')
    } finally {
      setLoading(false)
    }
  }

  const apply = async () => {
    try {
      if (selected) {
        await AsyncStorage.setItem('selected_location', JSON.stringify(selected))
      } else {
        await AsyncStorage.removeItem('selected_location')
      }
      await AsyncStorage.setItem('radius_km', String(radiusKm))
      navigation.goBack()
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể lưu thiết lập khu vực')
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.lg }}>
      <Text style={styles.title}>Chọn khu vực</Text>

      <TouchableOpacity style={[styles.rowBtn, { backgroundColor: colors.primary }]} onPress={useCurrentLocation} disabled={loading}>
        <Ionicons name="locate" size={18} color={colors.white} />
        <Text style={styles.rowBtnText}>{loading ? 'Đang lấy vị trí...' : 'Dùng vị trí hiện tại'}</Text>
      </TouchableOpacity>

      <Text style={styles.subtitle}>Khu vực gợi ý</Text>
      <View style={styles.pasteBox}>
        <Text style={{ fontWeight: '600', marginBottom: 6 }}>Dán địa chỉ Google Maps hoặc toạ độ</Text>
        <TextInput
          value={pasteText}
          onChangeText={setPasteText}
          placeholder="Ví dụ: https://maps.google.com/.../@10.77,106.70... hoặc 10.77,106.70"
          style={styles.input}
          multiline
        />
        <TouchableOpacity style={[styles.rowBtn, { backgroundColor: colors.primary, marginTop: 8 }]} onPress={applyPasted}>
          <Ionicons name="checkmark-circle" size={18} color={colors.white} />
          <Text style={styles.rowBtnText}>Dùng vị trí từ văn bản đã dán</Text>
        </TouchableOpacity>
      </View>
      {presetAreas.map((a) => (
        <TouchableOpacity
          key={a.name}
          style={[styles.areaItem, selected?.name === a.name && styles.areaItemActive]}
          onPress={() => setSelected(a)}
        >
          <Ionicons name="pin" size={16} color={selected?.name === a.name ? colors.white : colors.primary} />
          <Text style={[styles.areaText, selected?.name === a.name && { color: colors.white }]}>{a.name}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.subtitle}>Bán kính</Text>
      <View style={styles.radiusRow}>
        {[2, 5, 10].map((km) => (
          <TouchableOpacity
            key={km}
            style={[styles.radiusChip, radiusKm === km && styles.radiusChipActive]}
            onPress={() => setRadiusKm(km)}
          >
            <Text style={[styles.radiusChipText, radiusKm === km && styles.radiusChipTextActive]}>{km} km</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.footerBtn, { backgroundColor: colors.gray }]} onPress={() => navigation.goBack()}>
          <Text style={styles.footerBtnText}>Huỷ</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.footerBtn, { backgroundColor: colors.primary }]} onPress={apply}>
          <Text style={styles.footerBtnText}>Áp dụng</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white },
  title: { fontSize: 20, fontWeight: '700', marginBottom: spacing.md },
  subtitle: { marginTop: spacing.lg, marginBottom: spacing.sm, fontWeight: '700' },
  rowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  rowBtnText: { color: colors.white, fontWeight: '600' },
  areaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 8,
    backgroundColor: colors.white,
  },
  areaItemActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  areaText: { color: colors.dark },
  radiusRow: { flexDirection: 'row', gap: 10 },
  radiusChip: { borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  radiusChipActive: { backgroundColor: '#FFEDE5', borderColor: '#FFC9B3' },
  radiusChipText: { color: colors.dark },
  radiusChipTextActive: { color: colors.primary, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: spacing.lg },
  footerBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  footerBtnText: { color: colors.white, fontWeight: '600' },
})
