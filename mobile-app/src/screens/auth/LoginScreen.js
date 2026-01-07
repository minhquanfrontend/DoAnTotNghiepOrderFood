"use client"

import { useState } from "react"
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, TouchableOpacity } from "react-native"
import { TextInput, Button, Card, IconButton } from "react-native-paper"
import { useAuth } from "../../context/AuthContext"
import { colors, spacing } from "../../theme/theme"

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const { login } = useAuth()

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert("Lỗi", "Vui lòng nhập đầy đủ thông tin")
      return
    }

    setLoading(true)
    const result = await login(username.trim(), password)
    setLoading(false)

    if (!result.success) {
      let msg = result.error
      if (typeof msg === 'object') {
        try {
          // handle common DRF error shapes
          if (Array.isArray(msg?.non_field_errors)) msg = msg.non_field_errors.join("\n")
          else if (msg?.detail) msg = String(msg.detail)
          else msg = JSON.stringify(msg)
        } catch {
          msg = String(msg)
        }
      }
      Alert.alert("Đăng nhập thất bại", String(msg))
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
          <Text style={styles.title}>Food Delivery</Text>
          <Text style={styles.subtitle}>Đăng nhập để tiếp tục</Text>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <TextInput
              label="Tên đăng nhập"
              value={username}
              onChangeText={setUsername}
              mode="outlined"
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <TextInput
              label="Mật khẩu"
              value={password}
              onChangeText={setPassword}
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

            <Button
              mode="contained"
              onPress={handleLogin}
              loading={loading}
              disabled={loading}
              style={styles.loginButton}
              contentStyle={styles.buttonContent}
            >
              Đăng nhập
            </Button>

            <View style={styles.linkContainer}>
              <Button mode="text" onPress={() => navigation.navigate("ForgotPassword")} textColor={colors.primary}>
                Quên mật khẩu?
              </Button>
            </View>
          </Card.Content>
        </Card>

        <View style={styles.registerContainer}>
          <Text style={styles.registerText}>Chưa có tài khoản? </Text>
          <Button mode="text" onPress={() => navigation.navigate("Register")} textColor={colors.primary} compact>
            Đăng ký ngay
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
    justifyContent: "center",
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
  },
  title: {
    fontSize: 32,
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
  input: {
    marginBottom: spacing.md,
  },
  loginButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
  },
  buttonContent: {
    paddingVertical: spacing.sm,
  },
  linkContainer: {
    alignItems: "center",
    marginTop: spacing.md,
  },
  registerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  registerText: {
    color: colors.gray,
  },
})
