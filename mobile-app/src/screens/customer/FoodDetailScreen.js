import React, { useEffect, useState, useCallback } from "react"
import { ScrollView, StyleSheet, View, Image, Alert, Text, TextInput, TouchableOpacity, FlatList } from "react-native"
import { Card, Title, Paragraph, Button, ActivityIndicator } from "react-native-paper"
import { restaurantAPI } from "../../services/api"
import { useCart } from "../../context/CartContext"

const SuggestionCard = ({ item, onPress }) => (
  <TouchableOpacity style={styles.suggestionCard} onPress={onPress}>
    <Image source={{ uri: item.image }} style={styles.suggestionImage} />
    <Text style={styles.suggestionName} numberOfLines={1}>{item.name}</Text>
    <Text style={styles.suggestionPrice}>{Number(item.current_price || item.price).toLocaleString()}₫</Text>
  </TouchableOpacity>
);

export default function FoodDetailScreen({ route, navigation }) {
  const foodParam = route.params?.food
  const foodId = route.params?.foodId || foodParam?.id
  const [food, setFood] = useState(foodParam || null)
  const [loading, setLoading] = useState(!foodParam)
  const [suggestions, setSuggestions] = useState([])
  const [qty, setQty] = useState(1)
  const [reviews, setReviews] = useState([])
  const [myRating, setMyRating] = useState(5)
  const [myComment, setMyComment] = useState("")
  const { addToCart } = useCart()

  const isOutOfStock = food && (!food.is_available || food.quantity <= 0);

  const loadData = useCallback(async (id) => {
    if (!id) return;
    setLoading(true);
    try {
      const foodData = await restaurantAPI.getFood(id);
      setFood(foodData);

      // Always load suggestions for related products
      try {
        const suggestionData = await restaurantAPI.getFoodSuggestions(id);
        setSuggestions(suggestionData.results || suggestionData || []);
      } catch (e) {
        // If suggestions API fails, try to get foods from same category
        if (foodData.category) {
          try {
            const categoryFoods = await restaurantAPI.getFoods({ category: foodData.category, limit: 10 });
            const filtered = (categoryFoods.results || categoryFoods || []).filter(f => f.id !== id).slice(0, 6);
            setSuggestions(filtered);
          } catch {}
        }
      }
      
      const reviewData = await restaurantAPI.getFoodReviews(id);
      setReviews(reviewData?.results ?? reviewData ?? []);

    } catch (e) {
      Alert.alert("Lỗi", "Không tải được thông tin món ăn");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(foodId);
  }, [foodId, loadData]);

  const addToCartNow = async () => {
    if (!food || isOutOfStock) return;
    try {
      await addToCart(food.id, qty, "");
      Alert.alert(
        "Thành công",
        `Đã thêm ${qty} x '${food.name}' vào giỏ hàng`,
        [
          { text: 'Xem giỏ hàng', onPress: () => navigation.navigate('Cart') },
          { text: 'Tiếp tục', style: 'cancel' },
        ]
      );
    } catch (e) {
      const msg = e?.response?.data?.detail || e?.response?.data?.error || e?.message || 'Không thể thêm vào giỏ';
      Alert.alert('Lỗi', msg);
    }
  };

  const submitReview = async () => {
    if (!foodId) return;
    try {
      await restaurantAPI.createReview({ food: foodId, rating: myRating, comment: myComment });
      setMyComment("");
      setMyRating(5);
      loadData(foodId); // Reload reviews
    } catch (e) {
      const msg = e?.response?.data ? JSON.stringify(e.response.data) : (e?.message || 'Không thể gửi đánh giá');
      Alert.alert('Lỗi', msg);
    }
  };

  if (loading) {
    return <ActivityIndicator style={{ flex: 1 }} animating={true} />;
  }

  if (!food) {
    return <View style={styles.container}><Text style={{ textAlign: 'center', marginTop: 20 }}>Không tìm thấy món ăn.</Text></View>;
  }

  return (
    <ScrollView style={styles.container}>
      <Card style={styles.card}>
        <Image source={{ uri: food.image }} style={styles.cover} />
        {isOutOfStock && (
          <View style={styles.outOfStockOverlay}>
            <Text style={styles.outOfStockText}>Hết hàng</Text>
          </View>
        )}
        <Card.Content>
          <Title style={styles.title}>{food.name}</Title>
          {food.description ? <Paragraph>{food.description}</Paragraph> : null}
          <Paragraph style={styles.price}>{Number(food.current_price || food.price).toLocaleString()}₫</Paragraph>
        </Card.Content>
        {!isOutOfStock && (
          <Card.Actions style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={styles.stepper}>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setQty(q => Math.max(1, q - 1))}>
                <Text style={styles.stepBtnText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.qtyText}>{qty}</Text>
              <TouchableOpacity style={styles.stepBtn} onPress={() => setQty(q => q + 1)}>
                <Text style={styles.stepBtnText}>+</Text>
              </TouchableOpacity>
            </View>
            <Button mode="contained" onPress={addToCartNow}>Thêm vào giỏ</Button>
          </Card.Actions>
        )}
      </Card>

      {suggestions.length > 0 && (
        <View style={styles.section}>
          <Title>{isOutOfStock ? 'Món ăn tương tự' : 'Sản phẩm liên quan'}</Title>
          <Text style={styles.sectionSubtitle}>
            {isOutOfStock ? 'Món này đã hết, bạn có thể thử những món tương tự' : 'Khách hàng cũng thích những món này'}
          </Text>
          <FlatList
            data={suggestions}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <SuggestionCard 
                item={item} 
                onPress={() => navigation.push('FoodDetail', { foodId: item.id })} 
              />
            )}
            contentContainerStyle={{ paddingVertical: 10 }}
          />
        </View>
      )}

      {/* Reviews */}
      <View style={styles.section}>
        <Title>Đánh giá</Title>
        {reviews.length > 0 ? reviews.map((rv) => (
          <View key={rv.id} style={styles.reviewItem}>
            <Text style={styles.reviewHeader}>{rv.user_name || 'Ẩn danh'} • {rv.rating}⭐</Text>
            {rv.comment ? <Text style={styles.reviewText}>{rv.comment}</Text> : null}
          </View>
        )) : <Text>Chưa có đánh giá.</Text>}
      </View>

      {/* Write review */}
      <View style={styles.section}>
        <Title>Viết đánh giá</Title>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text>Chấm sao:</Text>
          <View style={{ flexDirection: 'row', marginLeft: 8 }}>
            {[1,2,3,4,5].map(star => (
              <TouchableOpacity key={star} onPress={() => setMyRating(star)}>
                <Text style={{ fontSize: 22, color: star <= myRating ? '#FFD700' : '#ccc' }}>★</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <TextInput
          placeholder="Chia sẻ cảm nhận của bạn..."
          value={myComment}
          onChangeText={setMyComment}
          style={styles.input}
          multiline
        />
        <Button mode="outlined" onPress={submitReview}>Gửi đánh giá</Button>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  suggestionCard: {
    width: 140,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    overflow: 'hidden',
  },
  suggestionImage: {
    width: '100%',
    height: 80,
  },
  suggestionName: {
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  suggestionPrice: {
    color: '#e91e63',
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  outOfStockOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  outOfStockText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
    transform: [{ rotate: '-15deg' }],
    borderWidth: 2,
    borderColor: 'white',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  container: { flex: 1, backgroundColor: "#fff" },
  card: { margin: 16, borderRadius: 12 },
  cover: { width: '100%', height: 220, backgroundColor: '#f2f2f2' },
  title: { fontSize: 22, marginBottom: 8 },
  price: { marginTop: 12, fontWeight: "bold", color: "#e91e63" },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#eee', alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { fontSize: 18, fontWeight: '700' },
  qtyText: { minWidth: 28, textAlign: 'center', fontSize: 16 },
  section: { paddingHorizontal: 16, paddingVertical: 12 },
  sectionSubtitle: { fontSize: 13, color: '#666', marginBottom: 8 },
  reviewItem: { paddingVertical: 8, borderBottomColor: '#eee', borderBottomWidth: 1 },
  reviewHeader: { fontWeight: '600', marginBottom: 4 },
  reviewText: { color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, minHeight: 60, marginBottom: 8 },
})
