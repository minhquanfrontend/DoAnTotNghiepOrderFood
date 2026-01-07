import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TouchableOpacity, 
  Image, 
  Dimensions,
  Linking 
} from 'react-native';
import { Card, Button, IconButton } from 'react-native-paper';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../../theme/theme';

const { width } = Dimensions.get('window');

const FoodRecommendation = ({ recommendations, onOrderPress }) => {
  const handleCallRestaurant = (phoneNumber) => {
    if (phoneNumber) {
      Linking.openURL(`tel:${phoneNumber}`);
    }
  };

  const renderFoodItem = ({ item }) => (
    <Card style={styles.foodCard}>
      <View style={styles.foodImageContainer}>
        {item.image ? (
          <Image 
            source={{ uri: item.image.startsWith('http') ? item.image : `http://10.0.2.2:8000${item.image}` }} 
            style={styles.foodImage} 
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.foodImage, styles.foodImagePlaceholder]}>
            <Ionicons name="restaurant" size={40} color={colors.gray} />
            <Text style={styles.placeholderText}>Không có ảnh</Text>
          </View>
        )}
        {item.restaurant?.is_open === false && (
          <View style={styles.closedOverlay}>
            <Text style={styles.closedText}>Đã đóng cửa</Text>
          </View>
        )}
      </View>
      <View style={styles.foodInfo}>
        <View style={styles.foodHeader}>
          <Text style={styles.foodName} numberOfLines={1}>{item.food_name || item.name || 'Món ngon'}</Text>
          <Text style={styles.foodCategory} numberOfLines={1}>
            {item.category}
          </Text>
        </View>
        
        <Text style={styles.foodPrice}>
          {item.formatted_price || 'Liên hệ'}
          {item.original_price > item.price && (
            <Text style={styles.originalPrice}>
              {' '}{item.original_price?.toLocaleString('vi-VN')}đ
            </Text>
          )}
        </Text>
        
        <Text style={styles.foodDescription} numberOfLines={2}>
          {item.description || 'Món ngon hấp dẫn'}
        </Text>
        
        <View style={styles.divider} />
        
        <View style={styles.restaurantSection}>
          <View style={styles.restaurantHeader}>
            <Ionicons name="restaurant" size={16} color={colors.primary} />
            <Text style={styles.sectionTitle}>Thông tin nhà hàng</Text>
          </View>
          
          <View style={styles.restaurantInfo}>
            <Text style={styles.restaurantName} numberOfLines={1}>
              {item.restaurant?.name || 'Nhà hàng'}
            </Text>
            <View style={styles.ratingContainer}>
              <Ionicons name="star" size={14} color={colors.warning} />
              <Text style={styles.ratingText}>
                {item.restaurant?.rating?.toFixed(1) || '5.0'}
              </Text>
            </View>
          </View>
          
          <View style={styles.restaurantDetail}>
            <Ionicons name="location" size={14} color={colors.gray} style={styles.detailIcon} />
            <Text style={styles.restaurantAddress} numberOfLines={2}>
              {item.restaurant?.address || 'Đang cập nhật địa chỉ'}
            </Text>
          </View>
          
          <View style={styles.restaurantDetail}>
            <Ionicons name="time" size={14} color={colors.gray} style={styles.detailIcon} />
            <Text style={styles.restaurantTime}>
              {item.restaurant?.estimated_delivery_time || '30-45 phút'} • 
              Phí giao hàng: {item.restaurant?.delivery_fee?.toLocaleString('vi-VN')}đ
            </Text>
          </View>
          
          {item.restaurant?.phone && (
            <TouchableOpacity 
              style={styles.phoneButton}
              onPress={() => handleCallRestaurant(item.restaurant.phone)}
            >
              <Ionicons name="call" size={16} color={colors.primary} />
              <Text style={styles.phoneText}>Gọi ngay</Text>
            </TouchableOpacity>
          )}
        </View>
        
        <Button 
          mode="contained" 
          style={styles.orderButton}
          labelStyle={styles.orderButtonLabel}
          onPress={() => onOrderPress(item)}
          disabled={item.restaurant?.is_open === false}
        >
          {item.restaurant?.is_open === false ? 'Đã đóng cửa' : 'Đặt món ngay'}
        </Button>
      </View>
    </Card>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={recommendations}
        renderItem={renderFoodItem}
        keyExtractor={(item, index) => String(item?.food_id ?? item?.id ?? index)}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        snapToInterval={width * 0.8 + spacing.md}
        decelerationRate="fast"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: spacing.sm,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  foodCard: {
    width: width * 0.85,
    marginRight: spacing.md,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.white,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  foodImageContainer: {
    width: '100%',
    height: 180,
    backgroundColor: colors.lightGray,
    position: 'relative',
  },
  foodImage: {
    width: '100%',
    height: '100%',
  },
  foodImagePlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.lightGray,
  },
  closedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closedText: {
    color: 'white',
    fontWeight: 'bold',
    backgroundColor: colors.danger,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 4,
  },
  placeholderText: {
    color: colors.gray,
    fontSize: 14,
    marginTop: spacing.xs,
  },
  foodInfo: {
    padding: spacing.md,
  },
  foodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  foodName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.dark,
    flex: 1,
    marginRight: spacing.sm,
  },
  foodCategory: {
    fontSize: 12,
    color: colors.gray,
    backgroundColor: colors.lightGray,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 10,
  },
  foodPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: spacing.sm,
  },
  originalPrice: {
    fontSize: 14,
    color: colors.gray,
    textDecorationLine: 'line-through',
    marginLeft: spacing.xs,
  },
  foodDescription: {
    fontSize: 14,
    color: colors.darkGray,
    marginBottom: spacing.md,
    lineHeight: 20,
  },
  divider: {
    height: 1,
    backgroundColor: colors.lightGray,
    marginVertical: spacing.sm,
  },
  restaurantSection: {
    marginBottom: spacing.md,
  },
  restaurantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
    marginLeft: spacing.xs,
  },
  restaurantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  restaurantName: {
    flex: 1,
    fontSize: 15,
    color: colors.dark,
    fontWeight: '500',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.lightPrimary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: spacing.xs,
  },
  ratingText: {
    fontSize: 12,
    color: colors.warning,
    fontWeight: 'bold',
    marginLeft: 2,
  },
  restaurantDetail: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
  },
  detailIcon: {
    marginTop: 2,
    marginRight: 6,
  },
  restaurantAddress: {
    flex: 1,
    fontSize: 13,
    color: colors.darkGray,
    lineHeight: 18,
  },
  restaurantTime: {
    flex: 1,
    fontSize: 13,
    color: colors.darkGray,
  },
  phoneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    padding: 6,
    backgroundColor: colors.lightPrimary,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  phoneText: {
    color: colors.primary,
    fontWeight: '500',
    marginLeft: 4,
  },
  orderButton: {
    marginTop: 'auto',
    borderRadius: 8,
    backgroundColor: colors.primary,
    paddingVertical: 6,
  },
  orderButtonLabel: {
    color: colors.white,
    fontWeight: 'bold',
    fontSize: 15,
  },
});

export default FoodRecommendation;
