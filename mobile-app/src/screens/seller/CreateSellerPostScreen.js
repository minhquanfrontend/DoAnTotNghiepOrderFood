import React, { useState, useEffect } from "react"
import { CommonActions } from '@react-navigation/native'
import { View, StyleSheet, Alert, Image } from "react-native"
import { TextInput, Button, Text } from "react-native-paper"
import * as ImagePicker from 'expo-image-picker'
import { restaurantAPI } from "../../services/api"
import { Picker } from '@react-native-picker/picker'

export default function CreateSellerPostScreen({ navigation }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [price, setPrice] = useState('')
  const [imageUri, setImageUri] = useState(null)
  const [loading, setLoading] = useState(false)
  const [categories, setCategories] = useState([])
  const [categoryId, setCategoryId] = useState(null)

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      const res = await restaurantAPI.getCategories()
      setCategories(res.results || res)
    } catch (e) {
      console.error('loadCategories error', e)
    }
  }

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (permission.status !== 'granted') {
      Alert.alert('Quyền bị từ chối', 'Cần quyền truy cập ảnh để chọn hình')
      return
    }

    const mediaTypes = ImagePicker.MediaType || ImagePicker.MediaTypeOptions?.Images
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes,
      allowsEditing: true,
      quality: 0.7,
    })

    // Expo SDK 48+ returns `canceled` and `assets`
    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0]
      setImageUri(asset.uri)
    }
  }

  const submit = async () => {
    if (!title.trim()) { Alert.alert('Lỗi', 'Tiêu đề là bắt buộc'); return }
    setLoading(true)
    try {
      const form = new FormData()
      form.append('title', title)
      form.append('description', description)
      if (price) form.append('price', price)
      if (imageUri) {
        const filename = imageUri.split('/').pop() || 'photo.jpg'
        const match = /(\.[0-9a-z]+)$/i.exec(filename)
        const ext = match ? match[1].toLowerCase() : '.jpg'
        // Map common extensions to correct mime
        let mime = 'image/jpeg'
        if (ext === '.png') mime = 'image/png'
        else if (ext === '.jpg' || ext === '.jpeg') mime = 'image/jpeg'
        else if (ext === '.webp') mime = 'image/webp'
        form.append('image', { uri: imageUri, name: filename, type: mime })
      }
      if (categoryId) form.append('category', categoryId)

      // Explicitly set multipart for some Android environments
      const res = await restaurantAPI.createMyPost(form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      Alert.alert('Thành công', 'Đã tạo bài đăng')
      // Reset stack to show main area and then navigate to seller posts page
      navigation.dispatch(
        CommonActions.reset({
          index: 1,
          routes: [
            { name: 'MainTabs' },
            { name: 'SellerPosts' },
          ],
        })
      )
    } catch (err) {
      console.error('create post error', err?.response?.data || err?.message || err)
      const msg = err?.response?.data?.detail || err?.response?.data?.error || 'Không thể tạo bài đăng'
      Alert.alert('Lỗi', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={styles.container}>
      <TextInput label="Tiêu đề" value={title} onChangeText={setTitle} />
      <TextInput label="Mô tả" value={description} onChangeText={setDescription} multiline style={{ marginTop: 12 }} />
      <TextInput label="Giá (VNĐ)" value={price} onChangeText={setPrice} keyboardType="numeric" style={{ marginTop: 12 }} />

      <Text style={{ marginTop: 12, fontWeight: '600' }}>Danh mục</Text>
      <View style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginTop: 6 }}>
        <Picker selectedValue={categoryId} onValueChange={(v) => setCategoryId(v)}>
          <Picker.Item label="-- Không chọn --" value={null} />
          {categories.map(c => <Picker.Item key={c.id} label={c.name} value={c.id} />)}
        </Picker>
      </View>

      <Button mode="outlined" onPress={pickImage} style={{ marginTop: 12 }}>Chọn ảnh</Button>
      {imageUri ? <Image source={{ uri: imageUri }} style={{ width: 200, height: 150, marginTop: 12 }} /> : null}

      <Button mode="contained" onPress={submit} loading={loading} style={{ marginTop: 16 }}>Đăng bài</Button>
    </View>
  )
}

const styles = StyleSheet.create({ container: { flex: 1, padding: 12, backgroundColor: '#fff' } })
