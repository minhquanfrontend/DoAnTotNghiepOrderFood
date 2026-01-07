import React from "react"
import { View, StyleSheet, Alert } from "react-native"
import { Card, Title, Paragraph, List, Button } from "react-native-paper"

export default function OrderDetailScreen({ route, navigation }) {
  const { order, serverOrderId } = route.params || {
    order: {
      id: "12345",
      items: [
        { id: "1", name: "Pizza", qty: 1, price: 120000 },
        { id: "2", name: "Burger", qty: 2, price: 100000 },
      ],
      status: "Đang giao",
      total: 320000,
    },
  }
  const displayId = order?.order_number || order?.id
  const canTrack = Number.isFinite(Number(serverOrderId))

  return (
    <View style={styles.container}>
      <Card style={styles.card}>
        <Card.Content>
          <Title>Đơn hàng #{displayId}</Title>
          <Paragraph>Trạng thái: {order.status}</Paragraph>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Title>Chi tiết món ăn</Title>
          {order.items.map((item) => (
            <List.Item
              key={item.id}
              title={`${item?.name || ""} x${item?.qty || 0}`}
              right={() => <Paragraph>{((item?.qty || 0) * (item?.price || 0)).toLocaleString()}₫</Paragraph>}
            />
          ))}
          <Paragraph style={styles.total}>Tổng cộng: {order.total.toLocaleString()}₫</Paragraph>
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        style={styles.button}
        disabled={!canTrack}
        onPress={() => {
          if (!canTrack) {
            Alert.alert('Chưa thể theo dõi', 'Đơn này chưa có mã đơn từ server. Hãy mở lại sau khi đơn được tạo thành công.')
            return
          }
          navigation.navigate("OrderTrackingScreen", { orderId: Number(serverOrderId) })
        }}
      >
        Theo dõi đơn hàng
      </Button>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  card: { marginBottom: 16, borderRadius: 12 },
  total: { marginTop: 12, fontWeight: "bold", fontSize: 16 },
  button: { marginTop: 12 },
})
