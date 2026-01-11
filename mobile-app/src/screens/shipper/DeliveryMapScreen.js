import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View, Alert, Text, ScrollView, TouchableOpacity, Linking, Dimensions } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT, Callout } from "react-native-maps";
import { Button, Card } from "react-native-paper";
import { Ionicons } from "@expo/vector-icons";
import * as Location from 'expo-location';
import { orderAPI, authAPI } from "../../services/api";
import { theme } from "../../theme/theme";

const { width, height } = Dimensions.get('window');

export default function DeliveryMapScreen({ route, navigation }) {
  const { orderId } = route.params || {}
  const mapRef = useRef(null)
  const [order, setOrder] = useState(null)
  const [driver, setDriver] = useState(null) // { latitude, longitude }
  const [watchSub, setWatchSub] = useState(null)
  const [stage, setStage] = useState('pickup'); // 'pickup', 'start_delivery', or 'delivery'
  const [routeInfo, setRouteInfo] = useState(null);

  useEffect(() => {
    let sub;

    const startWatching = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission denied', 'Cannot track location without permission.');
          return;
        }

        sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, timeInterval: 5000, distanceInterval: 10 }, // Update every 5s or 10m
          async (pos) => {
            const newLocation = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
            setDriver(newLocation);

            // If there's an active order, send location updates for tracking
            if (orderId) {
              try {
                await orderAPI.updateShipperLocation(orderId, newLocation.latitude, newLocation.longitude);
              } catch (error) {
                console.error('Failed to update shipper location for order:', error);
              }
            }
          }
        );
        setWatchSub(sub);
      } catch (error) {
        console.error('Error starting location watch:', error);
      }
    };

    startWatching();

    return () => {
      if (sub) {
        sub.remove();
      }
    };
  }, [orderId]);

  useEffect(() => {
    const fetchOrderAndRoute = async () => {
      if (!orderId) return;
      try {
        const [orderData, routeData] = await Promise.all([
          orderAPI.getOrder(orderId),
          orderAPI.getShipperRouteInfo(orderId)
        ]);

        setOrder(orderData);
        setRouteInfo(routeData);

        // STRICT SHIPPER FLOW:
        // assigned → pick_up → picked_up → start_delivering → delivering → deliver → delivered
        if (orderData?.status === 'assigned' || orderData?.status === 'ready') {
          setStage('pickup'); // Shipper needs to pick up from restaurant
        } else if (orderData?.status === 'picked_up') {
          setStage('start_delivery'); // Shipper picked up, now start delivering
        } else if (orderData?.status === 'delivering') {
          setStage('delivery'); // Shipper is delivering, confirm when arrived
        }
      } catch (e) {
        Alert.alert('Lỗi', 'Không thể tải thông tin đơn hàng hoặc lộ trình.');
      }
    };

    fetchOrderAndRoute();
  }, [orderId]);

  // Convert location data to proper format for MapView
  const parseLocation = (loc) => {
    if (!loc) return null;
    const lat = parseFloat(loc.latitude);
    const lng = parseFloat(loc.longitude);
    if (isNaN(lat) || isNaN(lng)) return null;
    return { latitude: lat, longitude: lng };
  };

  const dest = parseLocation(routeInfo?.delivery_location);
  const pickup = parseLocation(routeInfo?.pickup_location);

  const initialRegion = () => {
    // Priority: driver location > pickup location > default HCM
    const lat = driver?.latitude || pickup?.latitude || 10.7769;
    const lng = driver?.longitude || pickup?.longitude || 106.7009;
    return { latitude: lat, longitude: lng, latitudeDelta: 0.04, longitudeDelta: 0.04 };
  };

  // Fit map to show all markers
  const fitMapToMarkers = () => {
    const coords = [];
    if (driver) coords.push(driver);
    if (pickup) coords.push(pickup);
    if (dest) coords.push(dest);
    
    if (coords.length >= 2 && mapRef.current) {
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 80, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  };

  // Fit map when order and locations are loaded
  useEffect(() => {
    if (order && (pickup || dest)) {
      setTimeout(fitMapToMarkers, 500);
    }
  }, [order, pickup, dest]);

  // Refresh route info from server
  const refreshRouteInfo = async () => {
    try {
      const routeData = await orderAPI.getShipperRouteInfo(orderId);
      setRouteInfo(routeData);
      return routeData;
    } catch (e) {
      console.error('Error refreshing route info:', e);
      return null;
    }
  };

  // Animate map to a location
  const animateToLocation = (location) => {
    if (location && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 1000);
    }
  };

  // STRICT SHIPPER FLOW - NO SKIPPING STEPS
  // assigned → pick_up → picked_up → start_delivering → delivering → deliver → delivered
  const handleConfirmAction = async () => {
    try {
      if (stage === 'pickup') {
        // Step 1: Pick up from restaurant (assigned → picked_up)
        await orderAPI.updateOrderStatus(orderId, 'pick_up', 'Shipper đã lấy hàng từ nhà hàng')
        setOrder(prev => ({ ...prev, status: 'picked_up' }))
        setStage('start_delivery')
        
        // Refresh route info and animate to customer location
        const newRoute = await refreshRouteInfo();
        if (newRoute?.delivery_location?.latitude && newRoute?.delivery_location?.longitude) {
          animateToLocation({
            latitude: newRoute.delivery_location.latitude,
            longitude: newRoute.delivery_location.longitude,
          });
        }
        
        Alert.alert('Thành công', 'Đã lấy hàng từ nhà hàng. Bấm "Bắt đầu giao" khi bạn rời nhà hàng.')
      } else if (stage === 'start_delivery') {
        // Step 2: Start delivering (picked_up → delivering)
        await orderAPI.updateOrderStatus(orderId, 'start_delivering', 'Shipper đang trên đường giao hàng')
        setOrder(prev => ({ ...prev, status: 'delivering' }))
        setStage('delivery')
        
        // Refresh route info
        await refreshRouteInfo();
        
        Alert.alert('Đang giao', 'Bạn đang trên đường giao hàng. Bấm "Xác nhận giao hàng" khi đến nơi.')
      } else if (stage === 'delivery') {
        // Step 3: Confirm delivery (delivering → delivered)
        await orderAPI.updateOrderStatus(orderId, 'deliver', 'Đơn hàng đã được giao thành công')
        Alert.alert('Hoàn tất', `Đơn hàng #${orderId} đã giao thành công! Chờ khách xác nhận.`, [
          { text: 'OK', onPress: () => navigation.goBack() }
        ])
      }
    } catch (e) {
      console.error('Error updating order status:', e)
      Alert.alert('Lỗi', e?.response?.data?.error || 'Không thể cập nhật trạng thái')
    }
  }

  // Call customer phone
  const callCustomer = () => {
    const phone = order?.delivery_phone
    if (phone) {
      Linking.openURL(`tel:${phone}`)
    } else {
      Alert.alert('Lỗi', 'Không có số điện thoại khách hàng')
    }
  }

  // Call restaurant phone
  const callRestaurant = () => {
    const phone = order?.pickup_phone || order?.restaurant?.phone
    if (phone) {
      Linking.openURL(`tel:${phone}`)
    } else {
      Alert.alert('Lỗi', 'Không có số điện thoại nhà hàng')
    }
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView 
        ref={mapRef} 
        style={styles.map} 
        initialRegion={initialRegion()}
        provider={PROVIDER_DEFAULT}
        mapType="standard"
        showsUserLocation={false}
      >
        {/* Driver/Shipper marker */}
        {driver && (
          <Marker coordinate={driver} title="Vị trí của bạn">
            <View style={styles.driverMarker}>
              <Ionicons name="bicycle" size={20} color="#fff" />
            </View>
          </Marker>
        )}
        
        {/* Restaurant/Pickup marker - always show */}
        {pickup && (
          <Marker coordinate={pickup} title={order?.restaurant_name || "Nhà hàng"}>
            <View style={styles.restaurantMarker}>
              <Ionicons name="restaurant" size={20} color="#fff" />
            </View>
            <Callout>
              <View style={styles.calloutContainer}>
                <Text style={styles.calloutTitle}>{order?.restaurant_name || 'Nhà hàng'}</Text>
                <Text style={styles.calloutText}>{order?.pickup_address}</Text>
                <Text style={styles.calloutPhone}>📞 {order?.pickup_phone || 'N/A'}</Text>
              </View>
            </Callout>
          </Marker>
        )}
        
        {/* Customer/Delivery marker - always show */}
        {dest && (
          <Marker coordinate={dest} title={order?.customer_name || "Khách hàng"}>
            <View style={styles.customerMarker}>
              <Ionicons name="person" size={20} color="#fff" />
            </View>
            <Callout>
              <View style={styles.calloutContainer}>
                <Text style={styles.calloutTitle}>{order?.customer_name || 'Khách hàng'}</Text>
                <Text style={styles.calloutText}>{order?.delivery_address}</Text>
                <Text style={styles.calloutPhone}>📞 {order?.delivery_phone || order?.customer_phone || 'N/A'}</Text>
              </View>
            </Callout>
          </Marker>
        )}

      </MapView>

      {/* Floating button to fit all markers */}
      <TouchableOpacity style={styles.fitButton} onPress={fitMapToMarkers}>
        <Ionicons name="expand" size={24} color={theme.colors.primary} />
      </TouchableOpacity>

      {/* Order Info Panel */}
      <View style={styles.infoPanel}>
        {/* Current Stage Indicator */}
        <View style={styles.stageIndicator}>
          <View style={[styles.stageDot, stage === 'pickup' && styles.stageDotActive]} />
          <View style={styles.stageLine} />
          <View style={[styles.stageDot, stage === 'start_delivery' && styles.stageDotActive]} />
          <View style={styles.stageLine} />
          <View style={[styles.stageDot, stage === 'delivery' && styles.stageDotActive]} />
        </View>
        <View style={styles.stageLabels}>
          <Text style={[styles.stageLabel, stage === 'pickup' && styles.stageLabelActive]}>Lấy hàng</Text>
          <Text style={[styles.stageLabel, stage === 'start_delivery' && styles.stageLabelActive]}>Đang giao</Text>
          <Text style={[styles.stageLabel, stage === 'delivery' && styles.stageLabelActive]}>Giao hàng</Text>
        </View>

        {/* Both addresses - always show for reference */}
        <ScrollView style={styles.addressScroll} showsVerticalScrollIndicator={false}>
          {/* Restaurant Info */}
          <View style={[styles.addressCard, stage === 'pickup' && styles.addressCardActive]}>
            <View style={styles.addressHeader}>
              <View style={[styles.addressIcon, { backgroundColor: '#FF6B35' }]}>
                <Ionicons name="restaurant" size={18} color="#fff" />
              </View>
              <View style={styles.addressInfo}>
                <Text style={styles.addressLabel}>Lấy hàng tại</Text>
                <Text style={styles.addressName}>{order?.restaurant_name || 'Nhà hàng'}</Text>
                <Text style={styles.addressText} numberOfLines={2}>{order?.pickup_address || 'Đang tải...'}</Text>
              </View>
              <TouchableOpacity style={styles.callIconBtn} onPress={callRestaurant}>
                <Ionicons name="call" size={20} color="#FF6B35" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Customer Info */}
          <View style={[styles.addressCard, (stage === 'start_delivery' || stage === 'delivery') && styles.addressCardActive]}>
            <View style={styles.addressHeader}>
              <View style={[styles.addressIcon, { backgroundColor: '#4CAF50' }]}>
                <Ionicons name="person" size={18} color="#fff" />
              </View>
              <View style={styles.addressInfo}>
                <Text style={styles.addressLabel}>Giao hàng cho</Text>
                <Text style={styles.addressName}>{order?.customer_name || 'Khách hàng'}</Text>
                <Text style={styles.addressText} numberOfLines={2}>{order?.delivery_address || 'Đang tải...'}</Text>
                <Text style={styles.phoneText}>📞 {order?.delivery_phone || order?.customer_phone || 'Không có SĐT'}</Text>
              </View>
              <TouchableOpacity style={styles.callIconBtn} onPress={callCustomer}>
                <Ionicons name="call" size={20} color="#4CAF50" />
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* Action Button */}
        <Button
          mode="contained"
          style={styles.actionButton}
          onPress={handleConfirmAction}
          icon={stage === 'delivery' ? 'check-circle' : 'arrow-right'}
        >
          {stage === 'pickup' ? 'Xác nhận đã lấy hàng' : 
           stage === 'start_delivery' ? 'Bắt đầu giao hàng' : 
           'Xác nhận đã giao'}
        </Button>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 0.55 },
  infoPanel: {
    flex: 0.45,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 5,
  },
  stageIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  stageDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ddd',
  },
  stageDotActive: {
    backgroundColor: theme.colors.primary,
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  stageLine: {
    width: 40,
    height: 2,
    backgroundColor: '#ddd',
    marginHorizontal: 4,
  },
  stageLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  stageLabel: {
    fontSize: 12,
    color: '#999',
    flex: 1,
    textAlign: 'center',
  },
  stageLabelActive: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  addressScroll: {
    flex: 1,
    marginBottom: 8,
  },
  addressCard: {
    backgroundColor: '#f8f8f8',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  addressCardActive: {
    borderColor: theme.colors.primary,
    backgroundColor: '#fff',
  },
  addressHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  addressIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  addressInfo: {
    flex: 1,
  },
  addressLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  addressName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 2,
  },
  addressText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  phoneText: {
    fontSize: 13,
    color: '#333',
    marginTop: 4,
  },
  callIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButton: {
    marginTop: 8,
    paddingVertical: 8,
  },
  // Custom markers
  driverMarker: {
    backgroundColor: '#2196F3',
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
  },
  restaurantMarker: {
    backgroundColor: '#FF6B35',
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
  },
  customerMarker: {
    backgroundColor: '#4CAF50',
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
  },
  calloutContainer: {
    width: 200,
    padding: 8,
  },
  calloutTitle: {
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 4,
  },
  calloutText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  calloutPhone: {
    fontSize: 12,
    color: '#333',
  },
  fitButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#fff',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
})
