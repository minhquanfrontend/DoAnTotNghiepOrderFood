import React, { useEffect, useState } from 'react'
import { View, StyleSheet, Alert } from 'react-native'
import { Button, Card, Text, Title, Paragraph } from 'react-native-paper'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { authAPI } from '../../services/api'

export default function SetWorkLocationScreen({ route, navigation }) {
  const [address, setAddress] = useState('')
  const [coords, setCoords] = useState(null) // { lat, lng }

  // Prefill from existing base location
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('shipper_base_location')
        if (raw) {
          const obj = JSON.parse(raw)
          setAddress(obj?.address || '')
          if (typeof obj?.lat === 'number' && typeof obj?.lng === 'number') {
            setCoords({ lat: obj.lat, lng: obj.lng })
          }
        }
      } catch {}
    })()
  }, [])

  // Receive selection from AddressPicker
  useEffect(() => {
    if (route?.params?.selectedAddress) setAddress(route.params.selectedAddress)
    if (route?.params?.selectedCoords) setCoords(route.params.selectedCoords)
  }, [route?.params?.selectedAddress, route?.params?.selectedCoords])

  const openPicker = () => {
    navigation.navigate('AddressPicker', { from: 'SetWorkLocation' })
  }

  const save = async () => {
    try {
      if (!coords || !address) {
        Alert.alert('Thiếu thông tin', 'Hãy chọn địa chỉ trên bản đồ trước khi lưu')
        return
      }
      const payload = { lat: coords.lat, lng: coords.lng, address }
      await AsyncStorage.setItem('shipper_base_location', JSON.stringify(payload))
      try { await authAPI.updateLocation(coords.lat, coords.lng, true) } catch {}
      Alert.alert('Thành công', 'Đã lưu điểm bắt đơn', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ])
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể lưu điểm bắt đơn')
    }
  }

  const clearBase = async () => {
    try {
      await AsyncStorage.removeItem('shipper_base_location')
      setAddress('')
      setCoords(null)
      Alert.alert('Đã xoá', 'Đã xoá điểm bắt đơn. Ứng dụng sẽ dùng vị trí GPS hiện tại để quét đơn.')
    } catch {}
  }

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Title>Đặt điểm bắt đơn</Title>
          <Paragraph>
            Chọn địa chỉ chính xác trên bản đồ. Điểm này sẽ được dùng để quét đơn xung quanh cho đến khi bạn thay đổi.
          </Paragraph>
          <Text style={{ marginTop: 12, color: '#666' }}>Địa chỉ hiện tại:</Text>
          <Text style={{ marginTop: 4 }}>{address || 'Chưa thiết lập'}</Text>
          <Text style={{ marginTop: 4, color: '#999' }}>
            Toạ độ: {coords ? `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}` : '--'}
          </Text>
          <View style={{ height: 12 }} />
          <Button mode="contained" onPress={openPicker} style={{ marginBottom: 8 }}>Chọn trên bản đồ</Button>
          <Button mode="contained" onPress={save} disabled={!coords}>Lưu làm điểm bắt đơn</Button>
          <View style={{ height: 8 }} />
          <Button mode="text" onPress={clearBase} disabled={!coords}>Xoá điểm bắt đơn</Button>
        </Card.Content>
      </Card>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  card: { borderRadius: 12 },
})
