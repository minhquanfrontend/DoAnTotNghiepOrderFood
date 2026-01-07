import React from "react"
import { View, Text, FlatList, StyleSheet } from "react-native"

export default function MenuScreen() {
  const menu = [
    { id: "1", name: "Pizza", price: 100000 },
    { id: "2", name: "Burger", price: 50000 },
  ]

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Thực đơn</Text>
      <FlatList
        data={menu}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.item}>
            <Text>{item?.name || ""}</Text>
            <Text>{item?.price || 0}</Text>
          </View>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 20, marginBottom: 16 },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
})
