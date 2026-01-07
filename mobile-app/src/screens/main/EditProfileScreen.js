import React, { useState } from "react"
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, Image } from "react-native"
import * as ImagePicker from 'expo-image-picker'
import { useAuth } from "../../context/AuthContext"

export default function EditProfileScreen({ navigation }) {
  const { user, updateProfile } = useAuth()
  // derive name from first_name + last_name
  const initialName = `${user?.first_name || ""}${user?.last_name ? " " + user.last_name : ""}`.trim()
  const [name, setName] = useState(initialName)
  const [email, setEmail] = useState(user?.email || "")
  // user.avatar likely a full URL string
  const [avatarUri, setAvatarUri] = useState(user?.avatar || null)
  const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth ? String(user.date_of_birth) : "")

  const pickAvatar = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Quyền bị từ chối', 'Cần quyền truy cập ảnh để chọn avatar')
        return
      }
      
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      })

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setAvatarUri(result.assets[0].uri)
      }
    } catch (error) {
      console.error('Error picking image:', error)
      Alert.alert('Lỗi', 'Không thể chọn ảnh. Vui lòng thử lại.')
    }
  }

  const handleSave = async () => {
    if (!name || !email) {
      Alert.alert("Lỗi", "Vui lòng nhập đầy đủ thông tin")
      return
    }

    try {
      // split name into first_name / last_name
      const parts = name.trim().split(/\s+/)
      const first_name = parts[0] || ''
      const last_name = parts.length > 1 ? parts.slice(1).join(' ') : ''

      const payload = { first_name, last_name, email }
      // include date of birth as ISO string if provided
      if (dateOfBirth) payload.date_of_birth = dateOfBirth
      
      // If avatar selected, pass avatarUri and allow context.updateProfile to send multipart
      if (avatarUri) {
        // Check if avatarUri is a local file or remote URL
        if (avatarUri.startsWith('file://') || !avatarUri.startsWith('http')) {
          payload.avatarUri = avatarUri
        } else {
          // If it's a remote URL and hasn't changed, don't include it in the payload
          if (user?.avatar !== avatarUri) {
            payload.avatarUri = avatarUri
          }
        }
      }

      console.log('Sending update payload:', payload)
      const res = await updateProfile(payload)
      
      if (res.success) {
        Alert.alert("Thành công", "Cập nhật thông tin thành công", [
          { text: "OK", onPress: () => navigation.goBack() },
        ])
      } else {
        const errorMessage = res.error?.message || res.error || 'Có lỗi xảy ra khi cập nhật thông tin'
        Alert.alert("Lỗi", errorMessage)
      }
    } catch (error) {
      console.error('Error in handleSave:', error)
      Alert.alert("Lỗi", "Đã xảy ra lỗi khi lưu thông tin. Vui lòng thử lại sau.")
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Chỉnh sửa thông tin</Text>

      <TouchableOpacity onPress={pickAvatar} style={{ alignItems: 'center', marginBottom: 12 }}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={{ width: 100, height: 100, borderRadius: 50, marginBottom: 8 }} />
        ) : (
          <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#eee', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
            <Text>Chọn ảnh</Text>
          </View>
        )}
      </TouchableOpacity>

      <Text style={styles.label}>Họ và tên</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="Nhập tên của bạn"
      />

      <Text style={styles.label}>Email</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="Nhập email"
        keyboardType="email-address"
      />

      <Text style={styles.label}>Ngày sinh (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={dateOfBirth}
        onChangeText={setDateOfBirth}
        placeholder="Ví dụ: 1990-12-31"
      />

      <TouchableOpacity style={styles.button} onPress={handleSave}>
        <Text style={styles.buttonText}>Lưu thay đổi</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "bold", marginBottom: 20, color: "#FF6B35" },
  label: { fontSize: 16, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#FF6B35",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "bold" },
})
