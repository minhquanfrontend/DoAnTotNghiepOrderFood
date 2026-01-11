"use client"

import { useState } from "react"
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, TouchableOpacity } from "react-native"
import { TextInput, Button, Card, IconButton } from "react-native-paper"
import { useAuth } from "../../context/AuthContext"
import { colors, spacing } from "../../theme/theme"

export default function RegisterScreen({ navigation, route }) {
  const returnTo = route?.params?.returnTo
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password: "",
    password_confirm: "",
    first_name: "",
    last_name: "",
    phone_number: "",
    address: "",
  })
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const { register, login } = useAuth()

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const validateForm = () => {
    const { username, email, password, password_confirm, first_name, last_name, phone_number } = formData

    if (!username.trim() || !email.trim() || !password.trim() || !first_name.trim() || !last_name.trim()) {
      Alert.alert("Lỗi", "Vui lòng nhập đầy đủ thông tin bắt buộc")
      return false
    }

    if (password !== password_confirm) {
      Alert.alert("Lỗi", "Mật khẩu xác nhận không khớp")
      return false
    }

    if (password.length < 8) {
      Alert.alert("Lỗi", "Mật khẩu phải có ít nhất 8 ký tự")
      return false
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      Alert.alert("Lỗi", "Email không hợp lệ")
      return false
    }

    if (phone_number && !/^\d{10,11}$/.test(phone_number.replace(/\s/g, ""))) {
      Alert.alert("Lỗi", "Số điện thoại không hợp lệ")
      return false
    }

    return true
  }

  const handleRegister = async () => {
    if (!validateForm()) return

    setLoading(true)
    const result = await register(formData)
    setLoading(false)

    if (result.success) {
      // Đăng ký thành công, tự động đăng nhập và vào app luôn
      const loginResult = await login(formData.username, formData.password)
      if (loginResult.success) {
        // login thành công: AuthContext sẽ cập nhật state và AppContent sẽ tự chuyển
        // Nếu có returnTo (từ Cart), navigate về đó để tiếp tục thanh toán
        if (returnTo) {
          navigation.navigate(returnTo)
        }
      } else {
        Alert.alert("Đăng ký thành công", "Tự động đăng nhập thất bại. Vui lòng đăng nhập lại.")
      }
    } else {
      Alert.alert("Đăng ký thất bại", result.error)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <View style={styles.backButtonContainer}>
          <IconButton
            icon="arrow-left"
            size={24}
            onPress={() => navigation.navigate("MainTabs", { screen: "Home" })}
            style={styles.backButton}
          />
        </View>
        <View style={styles.header}>
          <Text style={styles.title}>Đăng ký tài khoản</Text>
          <Text style={styles.subtitle}>Tạo tài khoản mới để bắt đầu</Text>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.row}>
              <TextInput
                label="Họ *"
                value={formData.first_name}
                onChangeText={(value) => handleInputChange("first_name", value)}
                mode="outlined"
                style={[styles.input, styles.halfInput]}
              />
              <TextInput
                label="Tên *"
                value={formData.last_name}
                onChangeText={(value) => handleInputChange("last_name", value)}
                mode="outlined"
                style={[styles.input, styles.halfInput]}
              />
            </View>

            <TextInput
              label="Tên đăng nhập *"
              value={formData.username}
              onChangeText={(value) => handleInputChange("username", value)}
              mode="outlined"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              label="Email *"
              value={formData.email}
              onChangeText={(value) => handleInputChange("email", value)}
              mode="outlined"
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              label="Số điện thoại"
              value={formData.phone_number}
              onChangeText={(value) => handleInputChange("phone_number", value)}
              mode="outlined"
              style={styles.input}
              keyboardType="phone-pad"
            />

            <TextInput
              label="Địa chỉ"
              value={formData.address}
              onChangeText={(value) => handleInputChange("address", value)}
              mode="outlined"
              style={styles.input}
              multiline
              numberOfLines={2}
            />

            <TextInput
              label="Mật khẩu *"
              value={formData.password}
              onChangeText={(value) => handleInputChange("password", value)}
              mode="outlined"
              secureTextEntry={!showPassword}
              right={
                <TextInput.Icon
                  icon={showPassword ? "eye-off" : "eye"}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
              style={styles.input}
            />

            <TextInput
              label="Xác nhận mật khẩu *"
              value={formData.password_confirm}
              onChangeText={(value) => handleInputChange("password_confirm", value)}
              mode="outlined"
              secureTextEntry={!showConfirmPassword}
              right={
                <TextInput.Icon
                  icon={showConfirmPassword ? "eye-off" : "eye"}
                  onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                />
              }
              style={styles.input}
            />

            <Button
              mode="contained"
              onPress={handleRegister}
              loading={loading}
              disabled={loading}
              style={styles.registerButton}
              contentStyle={styles.buttonContent}
            >
              Đăng ký
            </Button>
          </Card.Content>
        </Card>

        <View style={styles.loginContainer}>
          <Text style={styles.loginText}>Đã có tài khoản? </Text>
          <Button mode="text" onPress={() => navigation.navigate("Login", { returnTo })} textColor={colors.primary} compact>
            Đăng nhập ngay
          </Button>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: spacing.lg,
  },
  backButtonContainer: {
    position: "absolute",
    top: 40,
    left: 10,
    zIndex: 10,
  },
  backButton: {
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  header: {
    alignItems: "center",
    marginBottom: spacing.xl,
    marginTop: spacing.lg,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: 16,
    color: colors.gray,
  },
  card: {
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  input: {
    marginBottom: spacing.md,
  },
  halfInput: {
    flex: 0.48,
  },
  registerButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
  },
  buttonContent: {
    paddingVertical: spacing.sm,
  },
  loginContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  loginText: {
    color: colors.gray,
  },
})
