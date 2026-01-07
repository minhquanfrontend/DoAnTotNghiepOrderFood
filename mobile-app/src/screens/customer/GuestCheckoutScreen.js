import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Card, Title, Divider, Button } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { orderAPI } from '../../services/api';
import { useCart } from '../../context/CartContext';

export default function GuestCheckoutScreen({ navigation, route }) {
  const { cart, getCartTotal, clearCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  
  // Guest info form
  const [guestName, setGuestName] = useState('');
  const [guestPhone, setGuestPhone] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [coords, setCoords] = useState(null);
  
  // Validation errors
  const [errors, setErrors] = useState({});

  // Load address from AsyncStorage when screen is focused (after returning from AddressPicker)
  useFocusEffect(
    useCallback(() => {
      const loadSelectedAddress = async () => {
        console.log('[GuestCheckout] Screen focused, checking for new address...')
        
        // Try to load from temp_selected_address first (set by AddressPicker)
        try {
          const raw = await AsyncStorage.getItem('temp_selected_address')
          console.log('[GuestCheckout] temp_selected_address raw:', raw)
          
          if (raw) {
            const data = JSON.parse(raw)
            // Use if recent (within 5 minutes)
            const isRecent = data.timestamp && (Date.now() - data.timestamp < 300000)
            console.log('[GuestCheckout] Temp data:', data, 'isRecent:', isRecent)
            
            if (isRecent && data.address) {
              console.log('[GuestCheckout] ✅ Setting address from temp:', data.address)
              setDeliveryAddress(data.address)
              
              if (data.coords) {
                const lat = data.coords.lat ?? data.coords.latitude
                const lng = data.coords.lng ?? data.coords.longitude
                if (typeof lat === 'number' && typeof lng === 'number') {
                  console.log('[GuestCheckout] ✅ Setting coords:', { lat, lng })
                  setCoords({ lat, lng })
                }
              }
              // Clear error if address was set
              if (errors.deliveryAddress) {
                setErrors(prev => ({ ...prev, deliveryAddress: null }))
              }
              // Clear temp storage after reading
              await AsyncStorage.removeItem('temp_selected_address')
              return // Got address from temp, done
            }
          }
        } catch (e) {
          console.error('[GuestCheckout] Error reading temp address:', e)
        }
        
        // Fallback: try to load from default_delivery_address if no address set yet
        if (!deliveryAddress) {
          try {
            const defaultRaw = await AsyncStorage.getItem('default_delivery_address')
            if (defaultRaw) {
              const obj = JSON.parse(defaultRaw)
              if (obj?.address) {
                console.log('[GuestCheckout] ✅ Setting address from default:', obj.address)
                setDeliveryAddress(obj.address)
              }
              if (typeof obj?.lat === 'number' && typeof obj?.lng === 'number') {
                setCoords({ lat: obj.lat, lng: obj.lng })
              }
            }
          } catch (e) {
            console.error('[GuestCheckout] Error reading default address:', e)
          }
        }
      }
      loadSelectedAddress()
    }, [deliveryAddress, errors.deliveryAddress])
  )

  useEffect(() => {
    // Get address from route params if available (legacy support)
    const addr = route?.params?.selectedAddress;
    const c = route?.params?.selectedCoords;
    if (addr) setDeliveryAddress(addr);
    if (c && typeof c.lat === 'number' && typeof c.lng === 'number') setCoords(c);
  }, [route?.params]);

  const validateForm = () => {
    const newErrors = {};
    
    if (!guestName.trim()) {
      newErrors.guestName = 'Vui lòng nhập họ tên';
    }
    
    if (!guestPhone.trim()) {
      newErrors.guestPhone = 'Vui lòng nhập số điện thoại';
    } else if (!/^(0|\+84)[0-9]{9,10}$/.test(guestPhone.replace(/\s/g, ''))) {
      newErrors.guestPhone = 'Số điện thoại không hợp lệ (VD: 0912345678)';
    }
    
    if (!guestEmail.trim()) {
      newErrors.guestEmail = 'Vui lòng nhập email để nhận mã đơn hàng';
    } else if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(guestEmail)) {
      newErrors.guestEmail = 'Email không hợp lệ';
    }
    
    if (!deliveryAddress.trim()) {
      newErrors.deliveryAddress = 'Vui lòng nhập địa chỉ giao hàng';
    }
    
    if (!cart?.items || cart.items.length === 0) {
      newErrors.cart = 'Giỏ hàng trống';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmitOrder = async () => {
    if (!validateForm()) {
      Alert.alert('Thông tin chưa đầy đủ', 'Vui lòng điền đầy đủ thông tin để đặt hàng');
      return;
    }

    setLoading(true);
    try {
      // Prepare items
      const items = (cart?.items || []).map((it) => ({
        food_id: (typeof it.food_id === 'object' ? it.food_id?.id : it.food_id) 
          || (typeof it.food === 'object' ? it.food?.id : it.food) 
          || it.foodId,
        quantity: Number(it.quantity) || 1,
        notes: it.notes || '',
      })).filter(x => x.food_id);

      const payload = {
        guest_name: guestName.trim(),
        guest_phone: guestPhone.trim(),
        guest_email: guestEmail.trim(),
        delivery_address: deliveryAddress.trim(),
        notes: notes.trim(),
        items,
      };

      if (coords) {
        payload.delivery_latitude = coords.lat;
        payload.delivery_longitude = coords.lng;
      }

      const response = await orderAPI.createGuestOrder(payload);
      
      if (response?.order) {
        setOrderSuccess(response);
        // Clear cart after successful order
        if (clearCart) {
          try { await clearCart(); } catch {}
        }
      } else {
        throw new Error('Không nhận được thông tin đơn hàng');
      }
    } catch (error) {
      console.error('Guest order error:', error);
      const errorData = error?.response?.data;
      
      if (errorData?.errors) {
        setErrors(errorData.errors);
        Alert.alert('Lỗi', 'Vui lòng kiểm tra lại thông tin');
      } else {
        Alert.alert(
          'Lỗi đặt hàng',
          errorData?.error || error?.message || 'Không thể đặt hàng. Vui lòng thử lại.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const moneyFmt = (n) => new Intl.NumberFormat('vi-VN', { 
    style: 'currency', 
    currency: 'VND' 
  }).format(Number(n || 0));

  // Success screen
  if (orderSuccess) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.successContainer}>
        <View style={styles.successIcon}>
          <Text style={styles.successEmoji}>✅</Text>
        </View>
        
        <Title style={styles.successTitle}>Đặt hàng thành công!</Title>
        
        <Card style={styles.orderCard}>
          <Card.Content>
            <View style={styles.orderNumberContainer}>
              <Text style={styles.orderNumberLabel}>Mã đơn hàng của bạn</Text>
              <Text style={styles.orderNumber}>{orderSuccess.order?.order_number}</Text>
            </View>
            
            <Divider style={styles.divider} />
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>📧 Email</Text>
              <Text style={styles.infoValue}>{orderSuccess.order?.guest_email}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>🏪 Nhà hàng</Text>
              <Text style={styles.infoValue}>{orderSuccess.order?.restaurant_name}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>📍 Địa chỉ giao</Text>
              <Text style={styles.infoValue}>{orderSuccess.order?.delivery_address}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>💰 Tổng tiền</Text>
              <Text style={[styles.infoValue, styles.totalAmount]}>
                {moneyFmt(orderSuccess.order?.total_amount)}
              </Text>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.emailNotice}>
          <Card.Content>
            <Text style={styles.emailNoticeIcon}>📬</Text>
            <Text style={styles.emailNoticeText}>
              Mã đơn hàng đã được gửi đến email của bạn.{'\n'}
              Sử dụng mã này để theo dõi đơn hàng.
            </Text>
          </Card.Content>
        </Card>

        <View style={styles.successActions}>
          <Button
            mode="contained"
            onPress={() => navigation.navigate('TrackGuestOrder', { 
              orderNumber: orderSuccess.order?.order_number,
              email: orderSuccess.order?.guest_email 
            })}
            style={styles.trackButton}
          >
            Theo dõi đơn hàng
          </Button>
          
          <Button
            mode="outlined"
            onPress={() => navigation.navigate('Home')}
            style={styles.homeButton}
          >
            Về trang chủ
          </Button>
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Title style={styles.headerTitle}>🛒 Đặt hàng không cần đăng nhập</Title>
          <Text style={styles.headerSubtitle}>
            Điền thông tin bên dưới để đặt hàng. Mã đơn hàng sẽ được gửi qua email.
          </Text>
        </View>

        {/* Guest Info Form */}
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>👤 Thông tin người nhận</Title>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Họ và tên *</Text>
              <TextInput
                style={[styles.input, errors.guestName && styles.inputError]}
                placeholder="Nguyễn Văn A"
                value={guestName}
                onChangeText={(text) => {
                  setGuestName(text);
                  if (errors.guestName) setErrors({...errors, guestName: null});
                }}
              />
              {errors.guestName && <Text style={styles.errorText}>{errors.guestName}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Số điện thoại *</Text>
              <TextInput
                style={[styles.input, errors.guestPhone && styles.inputError]}
                placeholder="0912345678"
                value={guestPhone}
                onChangeText={(text) => {
                  setGuestPhone(text);
                  if (errors.guestPhone) setErrors({...errors, guestPhone: null});
                }}
                keyboardType="phone-pad"
              />
              {errors.guestPhone && <Text style={styles.errorText}>{errors.guestPhone}</Text>}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email * (để nhận mã đơn hàng)</Text>
              <TextInput
                style={[styles.input, errors.guestEmail && styles.inputError]}
                placeholder="email@example.com"
                value={guestEmail}
                onChangeText={(text) => {
                  setGuestEmail(text);
                  if (errors.guestEmail) setErrors({...errors, guestEmail: null});
                }}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              {errors.guestEmail && <Text style={styles.errorText}>{errors.guestEmail}</Text>}
            </View>
          </Card.Content>
        </Card>

        {/* Delivery Address */}
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>📍 Địa chỉ giao hàng</Title>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Địa chỉ chi tiết *</Text>
              <TextInput
                style={[styles.input, styles.textArea, errors.deliveryAddress && styles.inputError]}
                placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/thành phố"
                value={deliveryAddress}
                onChangeText={(text) => {
                  setDeliveryAddress(text);
                  if (errors.deliveryAddress) setErrors({...errors, deliveryAddress: null});
                }}
                multiline
                numberOfLines={3}
              />
              {errors.deliveryAddress && <Text style={styles.errorText}>{errors.deliveryAddress}</Text>}
            </View>

            <TouchableOpacity
              style={styles.mapButton}
              onPress={() => navigation.navigate('AddressPicker', { from: 'GuestCheckout' })}
            >
              <Text style={styles.mapButtonText}>📍 Chọn trên bản đồ</Text>
            </TouchableOpacity>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Ghi chú cho shipper</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="VD: Gọi điện trước khi giao, để ở cổng..."
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={2}
              />
            </View>
          </Card.Content>
        </Card>

        {/* Order Summary */}
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>🛒 Đơn hàng của bạn</Title>
            
            {cart?.items && cart.items.length > 0 ? (
              <>
                {cart.items.map((item, index) => {
                  const food = item.food || item;
                  const name = food?.name || item?.food_name || 'Món ăn';
                  const price = food?.price || food?.discount_price || item?.price || 0;
                  const quantity = item?.quantity || 1;
                  
                  return (
                    <View key={index} style={styles.cartItem}>
                      <View style={styles.cartItemLeft}>
                        <Text style={styles.cartItemName}>{name}</Text>
                        <Text style={styles.cartItemQty}>x{quantity}</Text>
                      </View>
                      <Text style={styles.cartItemPrice}>
                        {moneyFmt(price * quantity)}
                      </Text>
                    </View>
                  );
                })}
                
                <Divider style={styles.divider} />
                
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Tổng cộng</Text>
                  <Text style={styles.totalValue}>{moneyFmt(getCartTotal())}</Text>
                </View>
              </>
            ) : (
              <View style={styles.emptyCart}>
                <Text style={styles.emptyCartText}>🛒 Giỏ hàng trống</Text>
                <Button
                  mode="outlined"
                  onPress={() => navigation.navigate('Home')}
                  style={styles.shopButton}
                >
                  Xem món ăn
                </Button>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Payment Method */}
        <Card style={styles.card}>
          <Card.Content>
            <Title style={styles.sectionTitle}>💳 Phương thức thanh toán</Title>
            <View style={styles.paymentMethod}>
              <Text style={styles.paymentIcon}>💵</Text>
              <View style={styles.paymentInfo}>
                <Text style={styles.paymentName}>Thanh toán khi nhận hàng (COD)</Text>
                <Text style={styles.paymentDesc}>Trả tiền mặt cho shipper khi nhận hàng</Text>
              </View>
              <Text style={styles.paymentCheck}>✓</Text>
            </View>
          </Card.Content>
        </Card>

        {/* Submit Button */}
        <View style={styles.submitContainer}>
          {loading ? (
            <ActivityIndicator size="large" color="#1a237e" />
          ) : (
            <Button
              mode="contained"
              onPress={handleSubmitOrder}
              style={styles.submitButton}
              labelStyle={styles.submitButtonText}
              disabled={!cart?.items || cart.items.length === 0}
            >
              Đặt hàng - {moneyFmt(getCartTotal())}
            </Button>
          )}
          
          <Text style={styles.termsText}>
            Bằng việc đặt hàng, bạn đồng ý với điều khoản sử dụng của chúng tôi
          </Text>
        </View>

        {/* Login Prompt */}
        <Card style={styles.loginPrompt}>
          <Card.Content>
            <Text style={styles.loginPromptText}>
              Đã có tài khoản? Đăng nhập để theo dõi đơn hàng dễ dàng hơn
            </Text>
            <Button
              mode="text"
              onPress={() => navigation.navigate('Login')}
            >
              Đăng nhập
            </Button>
          </Card.Content>
        </Card>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    paddingBottom: 30,
  },
  header: {
    backgroundColor: '#1a237e',
    padding: 20,
    paddingTop: 10,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    margin: 16,
    marginBottom: 8,
    borderRadius: 12,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  inputError: {
    borderColor: '#f44336',
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  errorText: {
    color: '#f44336',
    fontSize: 12,
    marginTop: 4,
  },
  mapButton: {
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  mapButtonText: {
    color: '#1a237e',
    fontWeight: '600',
  },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  cartItemLeft: {
    flex: 1,
  },
  cartItemName: {
    fontSize: 14,
    color: '#333',
  },
  cartItemQty: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  cartItemPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a237e',
  },
  divider: {
    marginVertical: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  totalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4caf50',
  },
  emptyCart: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyCartText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 12,
  },
  shopButton: {
    marginTop: 8,
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    padding: 12,
    borderRadius: 8,
  },
  paymentIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  paymentInfo: {
    flex: 1,
  },
  paymentName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  paymentDesc: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  paymentCheck: {
    fontSize: 20,
    color: '#4caf50',
    fontWeight: 'bold',
  },
  submitContainer: {
    padding: 16,
    alignItems: 'center',
  },
  submitButton: {
    width: '100%',
    paddingVertical: 8,
    backgroundColor: '#4caf50',
    borderRadius: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  termsText: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginTop: 12,
  },
  loginPrompt: {
    margin: 16,
    marginTop: 8,
    borderRadius: 12,
    backgroundColor: '#fff3e0',
  },
  loginPromptText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  // Success styles
  successContainer: {
    flexGrow: 1,
    padding: 20,
    alignItems: 'center',
  },
  successIcon: {
    marginTop: 30,
    marginBottom: 20,
  },
  successEmoji: {
    fontSize: 80,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4caf50',
    marginBottom: 20,
  },
  orderCard: {
    width: '100%',
    borderRadius: 12,
    elevation: 3,
  },
  orderNumberContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  orderNumberLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  orderNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a237e',
    letterSpacing: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  totalAmount: {
    color: '#4caf50',
    fontWeight: 'bold',
    fontSize: 16,
  },
  emailNotice: {
    width: '100%',
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: '#e3f2fd',
  },
  emailNoticeIcon: {
    fontSize: 32,
    textAlign: 'center',
    marginBottom: 8,
  },
  emailNoticeText: {
    fontSize: 14,
    color: '#1a237e',
    textAlign: 'center',
    lineHeight: 22,
  },
  successActions: {
    width: '100%',
    marginTop: 24,
  },
  trackButton: {
    marginBottom: 12,
    backgroundColor: '#1a237e',
    paddingVertical: 6,
  },
  homeButton: {
    borderColor: '#1a237e',
  },
});
