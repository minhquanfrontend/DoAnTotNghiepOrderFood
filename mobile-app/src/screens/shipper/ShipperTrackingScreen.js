"use client"

import { useState, useEffect, useRef } from "react"
import { View, Text, StyleSheet, Alert, TouchableOpacity, ScrollView, Switch } from "react-native"
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from "react-native-maps"
import * as Location from "expo-location"
import { Ionicons } from "@expo/vector-icons"
import { theme } from "../../theme/theme"
import api from "../../services/api"

const ShipperTrackingScreen = ({ navigation }) => {
  const [location, setLocation] = useState(null)
  const [isTracking, setIsTracking] = useState(false)
  const [activeDeliveries, setActiveDeliveries] = useState([])
  const [selectedDelivery, setSelectedDelivery] = useState(null)
  const [routePoints, setRoutePoints] = useState([])
  const mapRef = useRef(null)
  const locationSubscription = useRef(null)

  useEffect(() => {
    requestLocationPermission()
    fetchActiveDeliveries()

    return () => {
      if (locationSubscription.current) {
        locationSubscription.current.remove()
      }
    }
  }, [])

  const requestLocationPermission = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== "granted") {
        Alert.alert("Lỗi", "Cần cấp quyền truy cập vị trí để sử dụng tính năng này")
        return
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      })

      setLocation({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      })
    } catch (error) {
      console.error("Error requesting location permission:", error)
    }
  }

  const startTracking = async () => {
    try {
      const { status } = await Location.requestBackgroundPermissionsAsync()
      if (status !== "granted") {
        Alert.alert("Lỗi", "Cần cấp quyền truy cập vị trí nền để theo dõi liên tục")
        return
      }

      locationSubscription.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 10000, // 10 seconds
          distanceInterval: 10, // 10 meters
        },
        (newLocation) => {
          updateLocationOnServer(newLocation.coords)
          setLocation((prev) => ({
            ...prev,
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
          }))
        },
      )

      setIsTracking(true)
      Alert.alert("Thành công", "Đã bắt đầu theo dõi vị trí")
    } catch (error) {
      console.error("Error starting tracking:", error)
      Alert.alert("Lỗi", "Không thể bắt đầu theo dõi vị trí")
    }
  }

  const stopTracking = () => {
    if (locationSubscription.current) {
      locationSubscription.current.remove()
      locationSubscription.current = null
    }
    setIsTracking(false)
    Alert.alert("Thông báo", "Đã dừng theo dõi vị trí")
  }

  const updateLocationOnServer = async (coords) => {
    try {
      await api.post("/tracking/update-location/", {
        latitude: coords.latitude,
        longitude: coords.longitude,
        speed: coords.speed,
        heading: coords.heading,
        accuracy: coords.accuracy,
      })
    } catch (error) {
      console.error("Error updating location:", error)
    }
  }

  const fetchActiveDeliveries = async () => {
    try {
      const response = await api.get("/tracking/deliveries/")
      const active = response.data.filter((delivery) => ["picked_up", "in_transit"].includes(delivery.status))
      setActiveDeliveries(active)
    } catch (error) {
      console.error("Error fetching deliveries:", error)
    }
  }

  const updateDeliveryStatus = async (trackingId, newStatus) => {
    try {
      await api.put(`/tracking/deliveries/${trackingId}/status/`, {
        status: newStatus,
      })

      Alert.alert("Thành công", "Đã cập nhật trạng thái đơn hàng")
      fetchActiveDeliveries()
    } catch (error) {
      console.error("Error updating delivery status:", error)
      Alert.alert("Lỗi", "Không thể cập nhật trạng thái")
    }
  }

  const selectDelivery = (delivery) => {
    setSelectedDelivery(delivery)
    setRoutePoints(delivery.route_points || [])

    if (mapRef.current && delivery.pickup_location && delivery.delivery_location) {
      const coordinates = [
        {
          latitude: delivery.pickup_location.lat,
          longitude: delivery.pickup_location.lng,
        },
        {
          latitude: delivery.delivery_location.lat,
          longitude: delivery.delivery_location.lng,
        },
      ]

      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: { top: 50, right: 50, bottom: 50, left: 50 },
        animated: true,
      })
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case "picked_up":
        return theme.colors.warning
      case "in_transit":
        return theme.colors.primary
      case "near_destination":
        return theme.colors.info
      case "delivered":
        return theme.colors.success
      default:
        return theme.colors.text
    }
  }

  if (!location) {
    return (
      <View style={styles.loadingContainer}>
        <Text>Đang tải bản đồ...</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={location}
        showsUserLocation={true}
        showsMyLocationButton={true}
        provider={PROVIDER_DEFAULT}
        mapType="standard"
      >
        <Marker
          coordinate={{
            latitude: location.latitude,
            longitude: location.longitude,
          }}
          title="Vị trí của bạn"
          pinColor={theme.colors.primary}
        />

        {selectedDelivery && (
          <>
            <Marker
              coordinate={{
                latitude: selectedDelivery.pickup_location.lat,
                longitude: selectedDelivery.pickup_location.lng,
              }}
              title="Điểm lấy hàng"
              pinColor={theme.colors.warning}
            />
            <Marker
              coordinate={{
                latitude: selectedDelivery.delivery_location.lat,
                longitude: selectedDelivery.delivery_location.lng,
              }}
              title="Điểm giao hàng"
              pinColor={theme.colors.success}
            />

            {routePoints.length > 0 && (
              <Polyline
                coordinates={routePoints.map((point) => ({
                  latitude: Number.parseFloat(point.latitude),
                  longitude: Number.parseFloat(point.longitude),
                }))}
                strokeColor={theme.colors.primary}
                strokeWidth={3}
              />
            )}
          </>
        )}
      </MapView>

      <View style={styles.controlPanel}>
        <View style={styles.trackingControl}>
          <Text style={styles.trackingLabel}>Theo dõi vị trí:</Text>
          <Switch
            value={isTracking}
            onValueChange={isTracking ? stopTracking : startTracking}
            trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
          />
        </View>

        <ScrollView style={styles.deliveriesList} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Đơn hàng đang giao ({activeDeliveries.length})</Text>

          {activeDeliveries.map((delivery) => (
            <TouchableOpacity
              key={delivery.id}
              style={[styles.deliveryCard, selectedDelivery?.id === delivery.id && styles.selectedCard]}
              onPress={() => selectDelivery(delivery)}
            >
              <View style={styles.deliveryHeader}>
                <Text style={styles.orderId}>Đơn #{delivery.order}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(delivery.status) }]}>
                  <Text style={styles.statusText}>{delivery.status_display}</Text>
                </View>
              </View>

              <Text style={styles.deliveryAddress}>📍 {delivery.delivery_location?.address || delivery.delivery_address || 'Chưa có địa chỉ'}</Text>

              <View style={styles.deliveryActions}>
                {delivery.status === "picked_up" && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
                    onPress={() => updateDeliveryStatus(delivery.id, "in_transit")}
                  >
                    <Text style={styles.actionButtonText}>Bắt đầu giao</Text>
                  </TouchableOpacity>
                )}

                {delivery.status === "in_transit" && (
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: theme.colors.success }]}
                    onPress={() => updateDeliveryStatus(delivery.id, "delivered")}
                  >
                    <Text style={styles.actionButtonText}>Đã giao</Text>
                  </TouchableOpacity>
                )}
              </View>
            </TouchableOpacity>
          ))}

          {activeDeliveries.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="bicycle-outline" size={48} color={theme.colors.textSecondary} />
              <Text style={styles.emptyText}>Không có đơn hàng nào đang giao</Text>
            </View>
          )}
        </ScrollView>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  map: {
    flex: 1,
  },
  controlPanel: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "50%",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  trackingControl: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  trackingLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
  },
  deliveriesList: {
    flex: 1,
    padding: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  deliveryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  selectedCard: {
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  deliveryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: theme.spacing.sm,
  },
  orderId: {
    fontSize: 16,
    fontWeight: "600",
    color: theme.colors.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: "white",
    fontSize: 12,
    fontWeight: "600",
  },
  deliveryAddress: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  deliveryActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  actionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: theme.spacing.xl,
  },
  emptyText: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
})

export default ShipperTrackingScreen
