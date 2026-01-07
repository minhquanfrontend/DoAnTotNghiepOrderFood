import React, { useEffect, useState } from "react"
import { View, StyleSheet, Image, Alert, FlatList } from "react-native"
import { List, FAB, Portal, Dialog, TextInput, Button, Text, IconButton, Switch } from "react-native-paper"
import * as ImagePicker from 'expo-image-picker'
import { restaurantAPI } from "../../services/api"
import { useAuth } from "../../context/AuthContext"

export default function ManageFoodsScreen({ route, navigation }) {
  const [foods, setFoods] = useState([])
  const [loading, setLoading] = useState(false)
  const { handleAuthError } = useAuth()

  const [visible, setVisible] = useState(false)
  const [newFood, setNewFood] = useState({ name: "", price: "", description: "", discount_price: "", imageUri: null, is_available: true, category: null, quantity: '100' })
  const [editingId, setEditingId] = useState(null)
  const [categories, setCategories] = useState([])
  const [showCategoryPicker, setShowCategoryPicker] = useState(false)

  const loadMyFoods = async () => {
    try {
      setLoading(true)
      const res = await restaurantAPI.getMyFoods()
      const list = res.results || res
      setFoods(Array.isArray(list) ? list : [])
    } catch (e) {
      console.error('Load foods error', e?.response?.data || e?.message || e)
      // Handle auth errors - token expired
      if (e?.response?.status === 401 || e?.response?.status === 403 || e?.isAuthError) {
        Alert.alert(
          'Phiên đăng nhập hết hạn',
          'Vui lòng đăng nhập lại để tiếp tục.',
          [{ text: 'OK', onPress: () => handleAuthError && handleAuthError() }]
        )
        return
      }
      Alert.alert('Lỗi', 'Không thể tải danh sách món ăn')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMyFoods()
    ;(async () => {
      try {
        const res = await restaurantAPI.getCategories()
        const list = res.results || res
        setCategories(Array.isArray(list) ? list : [])
      } catch (_) {}
    })()
  }, [])

  useEffect(() => {
    if (route?.params?.openCreate) {
      startCreate()
    }
  }, [route?.params?.openCreate])

  const pickFoodImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') { alert('Quyền bị từ chối'); return }
    const mediaTypes = ImagePicker.MediaType ? ImagePicker.MediaType.Images : (ImagePicker.MediaTypeOptions && ImagePicker.MediaTypeOptions.Images)
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes, allowsEditing: true, quality: 0.7 })
    if (res && (res.canceled === false || res.cancelled === false)) {
      const uri = (res.assets && res.assets[0]?.uri) || res.uri
      if (uri) setNewFood({ ...newFood, imageUri: uri })
    }
  }

  const saveFoodToServer = async () => {
    // send FormData to server via restaurantAPI.createFood
    try {
      // basic validation
      const priceNumber = Number(newFood.price)
      if (!newFood.name?.trim()) {
        Alert.alert('Thiếu thông tin', 'Vui lòng nhập tên món')
        return
      }
      if (!newFood.price || Number.isNaN(priceNumber) || priceNumber <= 0) {
        Alert.alert('Giá không hợp lệ', 'Vui lòng nhập giá > 0')
        return
      }
      const form = new FormData()
      form.append('name', newFood.name)
      form.append('price', String(priceNumber))
      if (newFood.description) form.append('description', newFood.description)
      if (newFood.discount_price) form.append('discount_price', newFood.discount_price)
      if (newFood.category) form.append('category', String(newFood.category))
      form.append('is_available', newFood.is_available ? 'true' : 'false')
      if (newFood.quantity) form.append('quantity', String(newFood.quantity))
      if (newFood.imageUri) {
        const filename = newFood.imageUri.split('/').pop()
        const match = /\.(\w+)$/.exec(filename)
        const ext = match ? match[1] : 'jpg'
        form.append('image', { uri: newFood.imageUri, name: filename, type: `image/${ext}` })
      }
      if (editingId) {
        // For update, allow JSON update when no new image, else use multipart
        if (!newFood.imageUri) {
          const payload = { ...newFood }
          delete payload.imageUri
          await restaurantAPI.updateFood(editingId, payload)
        } else {
          await restaurantAPI.updateFood(editingId, form)
        }
      } else {
        await restaurantAPI.createFood(form, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      await loadMyFoods()
      setNewFood({ name: "", price: "", description: "", discount_price: "", imageUri: null, is_available: true, category: null, quantity: '100' })
      setEditingId(null)
      setVisible(false)
      Alert.alert('Thành công', editingId ? 'Đã cập nhật sản phẩm' : 'Đã đăng sản phẩm')
    } catch (e) {
      const serverMsg = e?.response?.data ? JSON.stringify(e.response.data) : (e?.message || String(e))
      console.error('Save food error', serverMsg)
      Alert.alert('Lỗi', `Không thể lưu món lên server\n${serverMsg}`)
    }
  }

  const startCreate = () => {
    setEditingId(null)
    setNewFood({ name: "", price: "", description: "", discount_price: "", imageUri: null, is_available: true, category: null, quantity: '100' })
    setVisible(true)
  }

  const startEdit = (item) => {
    setEditingId(item.id)
    setNewFood({
      name: item.name || "",
      price: String(item.price || ""),
      description: item.description || "",
      discount_price: item.discount_price ? String(item.discount_price) : "",
      imageUri: null, // only set when user picks a new one
      is_available: item.is_available !== false,
      category: item.category || null,
      quantity: item.quantity !== null ? String(item.quantity) : '100',
    })
    setVisible(true)
  }

  const toggleAvailable = async (item) => {
    try {
      await restaurantAPI.updateFood(item.id, { is_available: !item.is_available })
      await loadMyFoods()
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể thay đổi trạng thái bán')
    }
  }

  const deleteFood = async (item) => {
    Alert.alert('Xoá món', `Bạn chắc chắn muốn xoá "${item.name}"?`, [
      { text: 'Huỷ' },
      { text: 'Xoá', style: 'destructive', onPress: async () => {
        try { await restaurantAPI.deleteFood(item.id); await loadMyFoods() } catch (e) { Alert.alert('Lỗi', 'Không thể xoá') }
      }}
    ])
  }
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Món ăn của tôi</Text>
        <Button mode="contained" onPress={startCreate}>
          Đăng món mới
        </Button>
      </View>
      <FlatList
        data={foods}
        keyExtractor={(item) => (item?.id != null ? String(item.id) : Math.random().toString(36))}
        refreshing={loading}
        onRefresh={loadMyFoods}
        renderItem={({ item }) => (
          <List.Item
            title={item?.name || ""}
            description={`${(Number(item?.price) || 0).toLocaleString()}₫`}
            left={(props) => <List.Icon {...props} icon="food" />}
            right={() => (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <IconButton icon={item.is_available ? 'toggle-switch' : 'toggle-switch-off'} onPress={() => toggleAvailable(item)} />
                <IconButton icon="pencil" onPress={() => startEdit(item)} />
                <IconButton icon="delete" onPress={() => deleteFood(item)} />
              </View>
            )}
          />
        )}
        ListEmptyComponent={!loading ? (
          <View style={styles.emptyWrap}>
            <Text style={{ marginBottom: 8 }}>Chưa có món ăn nào.</Text>
            <Button mode="contained" onPress={() => setVisible(true)}>Đăng món đầu tiên</Button>
          </View>
        ) : null}
        contentContainerStyle={{ paddingBottom: 90 }}
      />
      <Portal>
        <Dialog visible={visible} onDismiss={() => setVisible(false)}>
          <Dialog.Title>{editingId ? 'Cập nhật món' : 'Thêm món mới'}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Tên món"
              value={newFood.name}
              onChangeText={(text) => setNewFood({ ...newFood, name: text })}
              style={{ marginBottom: 12 }}
            />
            <View style={{ marginBottom: 12 }}>
              <Text style={{ marginBottom: 6 }}>Danh mục (tuỳ chọn)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ flex: 1 }} numberOfLines={1}>
                  {newFood.category
                    ? (categories.find(c => c.id === newFood.category)?.name || `ID: ${newFood.category}`)
                    : 'Chưa chọn'}
                </Text>
                {newFood.category ? (
                  <Button mode="text" onPress={() => setNewFood({ ...newFood, category: null })}>Bỏ chọn</Button>
                ) : null}
                <Button mode="outlined" onPress={() => setShowCategoryPicker(true)}>Chọn</Button>
              </View>
            </View>
            <TextInput
              label="Mô tả (tuỳ chọn)"
              multiline
              value={newFood.description}
              onChangeText={(text) => setNewFood({ ...newFood, description: text })}
              style={{ marginBottom: 12 }}
            />
            <TextInput
              label="Giá"
              keyboardType="numeric"
              value={newFood.price}
              onChangeText={(text) => setNewFood({ ...newFood, price: text })}
            />
            <TextInput
              label="Giá khuyến mãi (tuỳ chọn)"
              keyboardType="numeric"
              value={newFood.discount_price}
              onChangeText={(text) => setNewFood({ ...newFood, discount_price: text })}
              style={{ marginTop: 12 }}
            />
            <TextInput
              label="Số lượng còn lại trong ngày"
              keyboardType="numeric"
              value={newFood.quantity}
              onChangeText={(text) => setNewFood({ ...newFood, quantity: text })}
              style={{ marginTop: 12 }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
              <Text>Đang bán</Text>
              <Switch
                style={{ marginLeft: 12 }}
                value={newFood.is_available}
                onValueChange={(v) => setNewFood({ ...newFood, is_available: v })}
              />
            </View>
            <Button mode="outlined" onPress={pickFoodImage} style={{ marginTop: 12 }}>
              Chọn ảnh món
            </Button>
            {newFood.imageUri ? <Image source={{ uri: newFood.imageUri }} style={{ width: 180, height: 120, marginTop: 8 }} /> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setVisible(false)}>Hủy</Button>
            <Button onPress={saveFoodToServer}>{editingId ? 'Cập nhật' : 'Lưu'}</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      {/* Category Picker Dialog */}
      <Portal>
        <Dialog visible={showCategoryPicker} onDismiss={() => setShowCategoryPicker(false)}>
          <Dialog.Title>Chọn danh mục</Dialog.Title>
          <Dialog.Content>
            <FlatList
              data={categories}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item }) => (
                <List.Item
                  title={item.name}
                  description={`ID: ${item.id}`}
                  onPress={() => { setNewFood({ ...newFood, category: item.id }); setShowCategoryPicker(false); }}
                  left={(props) => <List.Icon {...props} icon={newFood.category === item.id ? 'checkbox-marked' : 'checkbox-blank-outline'} />}
                />
              )}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setShowCategoryPicker(false)}>Đóng</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <FAB style={styles.fab} icon="plus" onPress={startCreate} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  title: { fontSize: 18, fontWeight: '700' },
  fab: { position: "absolute", right: 16, bottom: 16, backgroundColor: "#6200ee" },
  emptyWrap: { alignItems: 'center', paddingTop: 40 },
})
