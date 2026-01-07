import React, { useState, useEffect } from 'react';
import { View, FlatList, Image, Alert } from 'react-native';
import { Text, Button, Card } from 'react-native-paper';
import API from '../../api/axiosInstance';
import { useAuth } from '../../context/AuthContext';

export default function PromotionsListScreen({ route, navigation }) {
  const { restaurantId } = route.params || {};
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();
  const [isOwner, setIsOwner] = useState(false);

  const fetchPromotions = async () => {
    setLoading(true);
    try {
      const res = await API.get(`/restaurants/${restaurantId}/promotions/`);
      setPromotions(res.data);
    } catch (err) {
      console.log('❌ Lỗi load promotions:', err.response?.data || err.message);
      Alert.alert('Lỗi', 'Không thể tải danh sách khuyến mãi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (restaurantId) fetchPromotions();
    // check if current user owns a restaurant
    const checkOwner = async () => {
      try {
        const res = await API.get('/restaurants/my-restaurant/');
        if (res.data && res.data.owner === user?.id) {
          setIsOwner(true);
        }
      } catch (err) {
        // ignore
      }
    };
    checkOwner();
  }, [restaurantId]);

  const renderItem = ({ item }) => (
    <Card style={{ margin: 8 }} onPress={() => {}}>
      {item.image ? <Card.Cover source={{ uri: item.image }} /> : null}
      <Card.Content>
        <Text variant="titleMedium">{item.title}</Text>
        <Text>{item.description}</Text>
      </Card.Content>
    </Card>
  );

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={promotions}
        keyExtractor={(i) => `${i.id}`}
        renderItem={renderItem}
      />
      {isOwner ? (
        <Button mode="contained" onPress={() => navigation.navigate('CreatePromotion')} style={{ margin: 12 }}>
          Tạo khuyến mãi mới
        </Button>
      ) : null}
    </View>
  );
}
