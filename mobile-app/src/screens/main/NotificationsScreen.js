import React, { useEffect, useState } from 'react'
import { View, FlatList, StyleSheet, Alert } from 'react-native'
import { List, Appbar, FAB } from 'react-native-paper'
import { notificationAPI } from '../../services/api'

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadNotifications()
  }, [])

  const loadNotifications = async () => {
    try {
      const data = await notificationAPI.getNotifications()
      setNotifications(data)
    } catch (e) {
      Alert.alert('Lỗi', 'Không tải được thông báo')
    } finally {
      setLoading(false)
    }
  }

  const markAsRead = async (id) => {
    try {
      await notificationAPI.markAsRead(id)
      setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n))
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể đánh dấu đã đọc')
    }
  }

  const renderItem = ({ item }) => (
    <List.Item
      title={item.title}
      description={item.message}
      left={() => <List.Icon icon={item.is_read ? 'bell-outline' : 'bell'} />}
      onPress={() => !item.is_read && markAsRead(item.id)}
    />
  )

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Thông báo" />
      </Appbar.Header>
      <FlatList
        data={notifications}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        refreshing={loading}
        onRefresh={loadNotifications}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
})
