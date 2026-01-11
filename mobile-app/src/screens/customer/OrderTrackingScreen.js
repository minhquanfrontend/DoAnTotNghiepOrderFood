"use client"

import { useState, useEffect, useRef } from "react"
import { View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Linking, Alert } from "react-native"
import MapView, { Marker, PROVIDER_DEFAULT } from "react-native-maps"
import { Ionicons } from "@expo/vector-icons"
import { theme } from "../../theme/theme"
import api, { orderAPI } from "../../services/api"

const OrderTrackingScreen = ({ route, navigation }) => {
  const rawOrderId = route?.params?.orderId
  const [orderId, setOrderId] = useState(Number.isFinite(Number(rawOrderId)) ? Number(rawOrderId) : null)
  const isPlaceholderId = (id) => {
    try {
      const s = String(id ?? '')
      return Number.isFinite(Number(id)) && s.length > 10
    } catch { return false }
  }
  const [tracking, setTracking] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [shipperLocation, setShipperLocation] = useState(null); // Real-time location from WebSocket
  const mapRef = useRef(null);

  useEffect(() => {
    if (!orderId || isPlaceholderId(orderId)) {
      // Try to resolve a server order id by looking at recent orders
      locateServerOrderId()
      return
    }
    fetchTrackingInfo();

    // Use polling instead of WebSocket for real-time tracking
    // Poll every 5 seconds for order updates when shipper is delivering
    const pollInterval = setInterval(() => {
      fetchTrackingInfo();
    }, 5000);

    // Cleanup on component unmount
    return () => {
      clearInterval(pollInterval);
    };
  }, [orderId])

  const locateServerOrderId = async () => {
    try {
      const my = await orderAPI.getMyOrders().catch(() => [])
      const arr = Array.isArray(my) ? my : (my?.results || [])
      if (!Array.isArray(arr) || arr.length === 0) { setLoading(false); return }
      // pick the most recent active order
      const recent = arr
        .filter(o => (['ready','pending','processing','confirmed','preparing','delivering','shipping','accepted','picked_up','in_transit'].includes(String(o?.status||'').toLowerCase())))
        .sort((a,b) => new Date(b.created_at||0) - new Date(a.created_at||0))
      const chosen = recent[0] || arr[0]
      if (chosen?.id) setOrderId(Number(chosen.id))
    } catch (_) {
      setLoading(false)
    }
  }

  const fetchTrackingInfo = async () => {
    try {
      if (!orderId || isPlaceholderId(orderId)) return
      const response = await api.get(`/orders/${orderId}/tracking/`)
      // axios instance already returns response.data
      setTracking(response)
      
      // Update shipper location from response if available
      if (response?.current_location) {
        const newLocation = {
          latitude: response.current_location.latitude,
          longitude: response.current_location.longitude,
        }
        setShipperLocation(newLocation)
        
        // Animate map to shipper location when delivering
        if (['delivering', 'picked_up'].includes(response?.status) && mapRef.current) {
          mapRef.current.animateToRegion({
            ...newLocation,
            latitudeDelta: 0.015,
            longitudeDelta: 0.015,
          }, 500)
        }
      }
    } catch (error) {
      // avoid noisy logs in dev
      if (__DEV__) {
        try { const code = error?.response?.status; code !== 404 && console.warn('Tracking API error', code) } catch {}
      }
      // Fallback: use order detail if tracking API not available
      if (error.response?.status === 404) {
        try {
          const order = await api.get(`/orders/orders/${orderId}/`)
          // Map minimal fields for UI
          const mapped = {
            status: order.status || 'created',
            status_display: order.status_display || 'Đang chờ xử lý',
            shipper_info: order.shipper || {},
            delivery_location: {
              address: order.delivery_address || '',
              lat: Number(order.delivery_latitude) || undefined,
              lng: Number(order.delivery_longitude) || undefined,
            },
            current_location: null,
            route_points: [],
            distance_traveled: 0,
            actual_pickup_time: order.picked_at || null,
            actual_delivery_time: order.delivered_at || null,
            estimated_arrival: order.eta || null,
            notes: order.note || '',
          }
          setTracking(mapped)
          // If order is still created/pending → start polling until shipper assigned, then retry tracking
          const st = String(order.status || '').toLowerCase()
          if (["created", "pending", "processing"].includes(st) || !order.shipper) {
            startWaitingPoll()
          }
        } catch (_) {
          // Maybe the passed id was a local placeholder. Try to resolve a real id and retry
          await locateServerOrderId()
        }
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // ---- Waiting poll ----
  const pollRef = useRef(null)
  const startWaitingPoll = () => {
    try { if (pollRef.current) clearInterval(pollRef.current) } catch {}
    pollRef.current = setInterval(async () => {
      try {
        const order = await api.get(`/orders/orders/${orderId}/`)
        const st = String(order.status || '').toLowerCase()
        if (order.shipper || ["assigned", "picked_up", "in_transit", "delivering"].includes(st)) {
          try { if (pollRef.current) clearInterval(pollRef.current) } catch {}
          // retry tracking API now that assignment likely exists
          setLoading(true)
          await fetchTrackingInfo()
        }
      } catch {}
    }, 5000)
  }

  useEffect(() => {
    return () => { try { if (pollRef.current) clearInterval(pollRef.current) } catch {} }
  }, [])

  const onRefresh = () => {
    setRefreshing(true)
    fetchTrackingInfo()
  }

  const callShipper = () => {
    if (tracking?.shipper_info?.phone) {
      Linking.openURL(`tel:${tracking.shipper_info.phone}`)
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case "assigned":
        return "person"
      case "picked_up":
        return "checkmark-circle"
      case "in_transit":
        return "car"
      case "near_destination":
        return "location"
      case "delivered":
        return "checkmark-done-circle"
      default:
        return "time"
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case "assigned":
        return theme.colors.warning
      case "picked_up":
        return theme.colors.warning
      case "in_transit":
        return theme.colors.primary
      case "near_destination":
        return theme.colors.info
      case "delivered":
        return theme.colors.success
      default:
        return theme.colors.textSecondary
    }
  }

  const formatTime = (dateString) => {
    if (!dateString) return "--:--"
    return new Date(dateString).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Đang tải thông tin tracking...</Text>
      </View>
    )
  }

  if (!orderId) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color={theme.colors.error} />
        <Text style={styles.errorText}>Thiếu orderId để theo dõi đơn hàng</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => navigation.goBack()}>
          <Text style={styles.retryButtonText}>Quay lại</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (!tracking) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle" size={48} color={theme.colors.error} />
        <Text style={styles.errorText}>Không tìm thấy thông tin giao hàng</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchTrackingInfo}>
          <Text style={styles.retryButtonText}>Thử lại</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Show map when shipper is assigned or delivering */}
      {(tracking.current_location || tracking.delivery_location?.lat || ['assigned', 'picked_up', 'delivering', 'delivered'].includes(tracking.status)) && (
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={styles.map}
            initialRegion={{
              latitude: shipperLocation?.latitude || tracking.current_location?.latitude || tracking.delivery_location?.lat || 10.7769,
              longitude: shipperLocation?.longitude || tracking.current_location?.longitude || tracking.delivery_location?.lng || 106.7009,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            }}
            provider={PROVIDER_DEFAULT}
            mapType="standard"
          >
            {/* Shipper location marker */}
            {(shipperLocation || tracking.current_location) && (
              <Marker
                coordinate={{
                  latitude: shipperLocation?.latitude || tracking.current_location?.latitude || tracking.current_location?.lat,
                  longitude: shipperLocation?.longitude || tracking.current_location?.longitude || tracking.current_location?.lng,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
                title="Shipper"
              >
                <View style={{ backgroundColor: theme.colors.primary, padding: 8, borderRadius: 20 }}>
                  <Ionicons name="bicycle" size={24} color="white" />
                </View>
              </Marker>
            )}

            {/* Delivery location marker (customer address) */}
            {tracking.delivery_location?.lat && tracking.delivery_location?.lng && (
              <Marker
                coordinate={{
                  latitude: parseFloat(tracking.delivery_location.lat),
                  longitude: parseFloat(tracking.delivery_location.lng),
                }}
                title="Điểm giao hàng"
                description={tracking.delivery_location?.address || 'Địa chỉ của bạn'}
                pinColor="green"
              />
            )}
          </MapView>
        </View>
      )}

      <View style={styles.statusContainer}>
        <Text style={styles.sectionTitle}>Trạng thái đơn hàng</Text>

        <View style={styles.currentStatus}>
          <Ionicons name={getStatusIcon(tracking.status)} size={24} color={getStatusColor(tracking.status)} />
          <Text style={[styles.statusText, { color: getStatusColor(tracking.status) }]}>{tracking.status_display}</Text>
        </View>

        <View style={styles.timeline}>
          <View style={styles.timelineItem}>
            <View style={[styles.timelineIcon, { backgroundColor: theme.colors.success }]}>
              <Ionicons name="restaurant" size={16} color="white" />
            </View>
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>Đã giao shipper</Text>
              <Text style={styles.timelineTime}>
                {tracking.status === "assigned" ? "Đang đến lấy hàng" : formatTime(tracking.actual_pickup_time)}
              </Text>
            </View>
          </View>

          <View style={styles.timelineItem}>
            <View
              style={[
                styles.timelineIcon,
                {
                  backgroundColor: ["picked_up", "delivering", "in_transit", "near_destination", "delivered", "completed"].includes(tracking.status)
                    ? theme.colors.primary
                    : theme.colors.border,
                },
              ]}
            >
              <Ionicons name="checkmark-circle" size={16} color="white" />
            </View>
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>Đã lấy hàng</Text>
              <Text style={styles.timelineTime}>{tracking.status === "picked_up" ? "Đã lấy" : formatTime(tracking.actual_pickup_time)}</Text>
            </View>
          </View>

          <View style={styles.timelineItem}>
            <View
              style={[
                styles.timelineIcon,
                {
                  backgroundColor: ["delivering", "in_transit", "near_destination", "delivered", "completed"].includes(tracking.status)
                    ? theme.colors.primary
                    : theme.colors.border,
                },
              ]}
            >
              <Ionicons name="car" size={16} color="white" />
            </View>
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>Đang giao hàng</Text>
              <Text style={styles.timelineTime}>{["delivering", "in_transit"].includes(tracking.status) ? "Đang thực hiện" : "--:--"}</Text>
            </View>
          </View>

          <View style={styles.timelineItem}>
            <View
              style={[
                styles.timelineIcon,
                { backgroundColor: ["delivered", "completed"].includes(tracking.status) ? theme.colors.success : theme.colors.border },
              ]}
            >
              <Ionicons name="checkmark-done" size={16} color="white" />
            </View>
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>Đã giao hàng</Text>
              <Text style={styles.timelineTime}>{formatTime(tracking.actual_delivery_time)}</Text>
            </View>
          </View>
        </View>
      </View>

      {tracking.shipper_info && tracking.shipper_info.first_name && (
        <View style={styles.shipperContainer}>
          <Text style={styles.sectionTitle}>Thông tin shipper</Text>

          <View style={styles.shipperInfo}>
            <View style={styles.shipperDetails}>
              <Text style={styles.shipperName}>
                {tracking.shipper_info.first_name} {tracking.shipper_info.last_name}
              </Text>
              <Text style={styles.shipperPhone}>📞 {tracking.shipper_info.phone_number || tracking.shipper_info.phone}</Text>
            </View>

            <TouchableOpacity style={styles.callButton} onPress={callShipper}>
              <Ionicons name="call" size={20} color="white" />
              <Text style={styles.callButtonText}>Gọi</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      <View style={styles.detailsContainer}>
        <Text style={styles.sectionTitle}>Chi tiết giao hàng</Text>

        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Địa chỉ giao hàng:</Text>
          <Text style={styles.detailValue}>{tracking.delivery_location?.address || 'Chưa có địa chỉ'}</Text>
        </View>

        {tracking.estimated_arrival && (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Dự kiến giao hàng:</Text>
            <Text style={styles.detailValue}>{new Date(tracking.estimated_arrival).toLocaleString("vi-VN")}</Text>
          </View>
        )}

        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Khoảng cách đã đi:</Text>
          <Text style={styles.detailValue}>{(Number(tracking.distance_traveled) || 0).toFixed(1)} km</Text>
        </View>

        {tracking.notes && (
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Ghi chú:</Text>
            <Text style={styles.detailValue}>{tracking.notes}</Text>
          </View>
        )}
      </View>

      {/* CUSTOMER ACTION: Confirm receipt when order is delivered */}
      {tracking.status === 'delivered' && (
        <View style={styles.confirmContainer}>
          <Text style={styles.confirmTitle}>🎉 Đơn hàng đã được giao!</Text>
          <Text style={styles.confirmText}>Vui lòng xác nhận bạn đã nhận được hàng</Text>
          <TouchableOpacity 
            style={styles.confirmButton} 
            onPress={async () => {
              try {
                await orderAPI.updateOrderStatus(orderId, 'complete', 'Khách hàng xác nhận đã nhận hàng')
                Alert.alert('Cảm ơn bạn!', 'Đơn hàng đã hoàn tất. Cảm ơn bạn đã sử dụng dịch vụ!', [
                  { text: 'OK', onPress: () => navigation.goBack() }
                ])
              } catch (e) {
                Alert.alert('Lỗi', e?.response?.data?.error || 'Không thể xác nhận đơn hàng')
              }
            }}
          >
            <Ionicons name="checkmark-circle" size={24} color="white" />
            <Text style={styles.confirmButtonText}>Xác nhận đã nhận hàng</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Show completed status */}
      {tracking.status === 'completed' && (
        <View style={[styles.confirmContainer, { backgroundColor: theme.colors.success + '20' }]}>
          <Text style={styles.confirmTitle}>✅ Đơn hàng hoàn tất!</Text>
          <Text style={styles.confirmText}>Cảm ơn bạn đã sử dụng dịch vụ của chúng tôi</Text>
        </View>
      )}

      {/* Home button - always visible */}
      <View style={styles.homeButtonContainer}>
        <TouchableOpacity 
          style={styles.homeButton} 
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] })}
        >
          <Ionicons name="home" size={20} color="white" />
          <Text style={styles.homeButtonText}>Về trang chủ</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.homeButton, { backgroundColor: theme.colors.secondary, marginLeft: 12 }]} 
          onPress={() => navigation.reset({ index: 0, routes: [{ name: 'MainTabs', state: { routes: [{ name: 'Orders' }], index: 0 } }] })}
        >
          <Ionicons name="receipt-outline" size={20} color="white" />
          <Text style={styles.homeButtonText}>Đơn hàng của tôi</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.spacing.xl,
  },
  errorText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: "center",
    marginVertical: theme.spacing.md,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  mapContainer: {
    height: 250,
    margin: theme.spacing.md,
    borderRadius: 12,
    overflow: "hidden",
  },
  map: {
    flex: 1,
  },
  statusContainer: {
    backgroundColor: theme.colors.surface,
    margin: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  currentStatus: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.lg,
  },
  statusText: {
    fontSize: 18,
    fontWeight: "600",
    marginLeft: theme.spacing.sm,
  },
  timeline: {
    paddingLeft: theme.spacing.sm,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.spacing.md,
  },
  timelineIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginRight: theme.spacing.md,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
  },
  timelineTime: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  shipperContainer: {
    backgroundColor: theme.colors.surface,
    margin: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: 12,
  },
  shipperInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  shipperDetails: {
    flex: 1,
  },
  shipperName: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
    marginBottom: 4,
  },
  shipperPhone: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  callButton: {
    backgroundColor: theme.colors.success,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  callButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
    marginLeft: 4,
  },
  detailsContainer: {
    backgroundColor: theme.colors.surface,
    margin: theme.spacing.md,
    padding: theme.spacing.md,
    borderRadius: 12,
  },
  detailItem: {
    marginBottom: theme.spacing.md,
  },
  detailLabel: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 16,
    color: theme.colors.text,
    fontWeight: "500",
  },
  confirmContainer: {
    backgroundColor: theme.colors.primary + '10',
    margin: theme.spacing.md,
    padding: theme.spacing.lg,
    borderRadius: 12,
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  confirmText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  confirmButton: {
    backgroundColor: theme.colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  homeButtonContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xl,
  },
  homeButton: {
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  homeButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
})

export default OrderTrackingScreen
