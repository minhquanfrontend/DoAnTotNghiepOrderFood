import React, { useEffect, useState } from "react"
import { View, Text, FlatList, StyleSheet, Image, TouchableOpacity, Alert } from "react-native"
import { Button, Card } from "react-native-paper"
import { restaurantAPI } from "../../services/api"

export default function SellerPostsListScreen({ navigation }) {
  const [posts, setPosts] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const unsub = navigation.addListener('focus', loadPosts)
    return unsub
  }, [navigation])

  const loadPosts = async () => {
    try {
      setLoading(true)
  const res = await restaurantAPI.getMyPosts()
  // api wrapper returns data directly in many places; ensure data format
  setPosts(res || [])
    } catch (err) {
      console.error(err)
      Alert.alert('Lỗi', 'Không thể tải bài đăng')
    } finally {
      setLoading(false)
    }
  }

  const renderItem = ({ item }) => (
    <Card style={styles.card}>
      <Card.Cover source={{ uri: item.image }} />
      <Card.Title title={item.title || ''} subtitle={item.restaurant_name || ''} />
      <Card.Content>
        <Text>{item.description || ''}</Text>
        {item.price ? <Text style={styles.price}>{Number(item.price).toLocaleString()}₫</Text> : null}
      </Card.Content>
      <Card.Actions>
        <Button onPress={() => navigation.navigate('EditSellerPost', { postId: item.id })}>Sửa</Button>
        <Button onPress={async () => {
          try {
            await restaurantAPI.deleteMyPost(item.id)
            loadPosts()
          } catch (e) { Alert.alert('Lỗi', 'Không thể xóa bài đăng') }
        }}>Xóa</Button>
      </Card.Actions>
    </Card>
  )

  return (
    <View style={styles.container}>
      <Button mode="contained" onPress={() => navigation.navigate('CreateSellerPost')}>Tạo bài đăng mới</Button>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 12 }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  card: { marginBottom: 12 },
  price: { marginTop: 8, fontWeight: 'bold', color: '#e91e63' }
})
