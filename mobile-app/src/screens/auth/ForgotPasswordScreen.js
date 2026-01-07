import React, { useState } from "react"
import { View, Text, TextInput, Button, StyleSheet } from "react-native"

export default function ForgotPasswordScreen({ navigation }) {
  const [email, setEmail] = useState("")

  const handleReset = () => {
    // TODO: gọi API gửi email reset mật khẩu
    alert(`Đã gửi link reset mật khẩu tới: ${email}`)
    navigation.goBack()
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Quên mật khẩu</Text>
      <TextInput
        style={styles.input}
        placeholder="Nhập email của bạn"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <Button title="Gửi link reset" onPress={handleReset} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 20,
    marginBottom: 20,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 10,
    borderRadius: 8,
    marginBottom: 20,
  },
})
