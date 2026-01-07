"use client"

import { useEffect, useState } from "react"
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  FlatList,
  RefreshControl,
  Alert,
  Modal,
  Pressable,
} from "react-native"
import { Searchbar, ActivityIndicator } from "react-native-paper"
import { Ionicons } from "@expo/vector-icons"
import { restaurantAPI, aiAPI, provinceAPI, notificationAPI } from "../../services/api"
import { useAuth } from "../../context/AuthContext"
import { colors, spacing } from "../../theme/theme"
import * as Location from 'expo-location'
import AsyncStorage from '@react-native-async-storage/async-storage'
import FloatingChatFAB from "../../components/common/FloatingChatFAB"

export default function HomeScreen({ navigation }) {
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState("")
  const [banners, setBanners] = useState([])
  const [categories, setCategories] = useState([])
  const [categoryGroups, setCategoryGroups] = useState([])
  const [expandedCategoryId, setExpandedCategoryId] = useState(null)
  const [showAllCategoryFoods, setShowAllCategoryFoods] = useState({})
  const [recommendations, setRecommendations] = useState([])
  const [nearbyRestaurants, setNearbyRestaurants] = useState([])
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Vị trí được chọn và bán kính
  const [selectedLocation, setSelectedLocation] = useState(null) // { name, lat, lng }
  const [radiusKm, setRadiusKm] = useState(5)
  const [locationModalVisible, setLocationModalVisible] = useState(false)
  const [provinces, setProvinces] = useState([])


  useEffect(() => {
    const init = async () => {
      try {
        const [savedLoc, savedRadius] = await Promise.all([
          AsyncStorage.getItem('selected_location'),
          AsyncStorage.getItem('radius_km'),
        ])
        if (savedLoc) {
          const parsed = JSON.parse(savedLoc)
          if (parsed && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
            setSelectedLocation(parsed)
          }
        }
        if (savedRadius) {
          const num = Number(savedRadius)
          if (!Number.isNaN(num) && num > 0) setRadiusKm(num)
        }
      } catch (e) {
        // ignore
      } finally {
        loadHomeData()
      }
    }
    init()
  }, [])

  // Lưu lại khi người dùng thay đổi khu vực hoặc bán kính
  useEffect(() => {
    (async () => {
      try {
        if (selectedLocation) {
          await AsyncStorage.setItem('selected_location', JSON.stringify(selectedLocation))
        } else {
          await AsyncStorage.removeItem('selected_location')
        }
        await AsyncStorage.setItem('radius_km', String(radiusKm))
      } catch (e) {
        // ignore
      }
    })()
  }, [selectedLocation, radiusKm])

  const loadHomeData = async () => {
    try {
      setLoading(true)
      const params = { ordering: "-rating" }
      if (selectedLocation?.lat && selectedLocation?.lng) {
        params.lat = selectedLocation.lat
        params.lng = selectedLocation.lng
        params.radius_km = radiusKm
      }

      // Fetch independently so one failure doesn't break the whole screen
      let bannersData = []
      let categoriesData = []
      let categoriesWithFoodsData = []
      let recommendationsData = []
      let restaurantsData = []
      try { bannersData = await restaurantAPI.getBanners() } catch (e) { console.warn('banners err', e?.message || e) }
      try { categoriesData = await restaurantAPI.getCategories() } catch (e) { console.warn('categories err', e?.message || e) }
      try { categoriesWithFoodsData = await restaurantAPI.getCategoriesWithFoods(6) } catch (e) { console.warn('categories-with-foods err', e?.message || e) }
      try { recommendationsData = await aiAPI.getRecommendations() } catch (e) { recommendationsData = []; console.warn('recs err', e?.message || e) }
      try { restaurantsData = await restaurantAPI.getRestaurants(params) } catch (e) { console.warn('restaurants err', e?.message || e) }

      setBanners((bannersData?.results || bannersData) ?? [])
      setCategories((categoriesData?.results || categoriesData) ?? [])
      const grouped = (categoriesWithFoodsData?.results || categoriesWithFoodsData) ?? []
      const normalizedGroups = Array.isArray(grouped) ? grouped.filter((c) => Array.isArray(c?.foods) && c.foods.length > 0) : []
      setCategoryGroups(normalizedGroups)
      setShowAllCategoryFoods({})
      setExpandedCategoryId((prev) => {
        if (normalizedGroups.length === 0) return null
        if (prev && normalizedGroups.some((c) => c.id === prev)) return prev
        return normalizedGroups[0]?.id ?? null
      })
      setRecommendations((recommendationsData?.results || recommendationsData) ?? [])

      // Notifications: only fetch when user is authenticated
      let unreadValue = 0
      try {
        const [token1, token2] = await Promise.all([
          AsyncStorage.getItem('accessToken'),
          AsyncStorage.getItem('access_token'),
        ])
        const rawToken = token1 || token2
        const hasToken = rawToken && rawToken !== 'null' && rawToken !== 'undefined'
        if (hasToken) {
          try {
            const unreadResp = await notificationAPI.getUnreadCount()
            unreadValue = (unreadResp?.count ?? unreadResp?.unread ?? 0) || 0
          } catch (unreadErr) {
            // Ignore 401 and 404 errors silently
            if (unreadErr?.response?.status !== 401 && unreadErr?.response?.status !== 404) {
              console.warn('unread-count err', unreadErr?.message || unreadErr)
            }
          }
        }
      } catch (tokenErr) {
        console.warn('token read err', tokenErr?.message || tokenErr)
      }
      setUnreadNotifications(unreadValue)
      const initialList = (restaurantsData?.results || restaurantsData) ?? []
      // If filtered query returns empty, retry unfiltered to avoid empty home after reset
      if (Array.isArray(initialList) && initialList.length === 0 && (params.lat && params.lng)) {
        try {
          const all = await restaurantAPI.getRestaurants({ ordering: "-rating" })
          setNearbyRestaurants(all.results || all)
        } catch (_) {
          setNearbyRestaurants(initialList)
        }
      } else {
        setNearbyRestaurants(initialList)
      }
    } catch (error) {
      console.warn("Error loading home data:", error?.message || error)
    } finally {
      setLoading(false)
    }
  }

  const onRefresh = async () => {
    setRefreshing(true)
    await loadHomeData()
    setRefreshing(false)
  }

  const handleSearch = () => {
    if (searchQuery.trim()) {
      navigation.navigate("Search", { query: searchQuery })
    }
  }

  // --------- Location helpers ---------
  const loadProvinces = async () => {
    try {
      const res = await provinceAPI.getProvinces()
      const list = res.results || res
      setProvinces(Array.isArray(list) ? list : [])
    } catch (e) {
      // fallback: keep empty
    }
  }

  const useCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Quyền vị trí bị từ chối', 'Hãy cấp quyền vị trí để lọc theo khu vực')
        return
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const { latitude, longitude } = pos.coords
      setSelectedLocation({ name: 'Vị trí hiện tại', lat: latitude, lng: longitude })
      setLocationModalVisible(false)
      // Reload with new params
      setLoading(true)
      const restaurantsData = await restaurantAPI.getRestaurants({
        ordering: '-rating',
        lat: latitude,
        lng: longitude,
        radius_km: radiusKm,
      })
      setNearbyRestaurants(restaurantsData.results || restaurantsData)
    } catch (e) {
      console.warn('Không lấy được vị trí hiện tại', e?.message || e)
      Alert.alert('Lỗi', 'Không thể lấy vị trí hiện tại')
    } finally {
      setLoading(false)
    }
  }

  const choosePresetArea = async (area) => {
    setSelectedLocation(area)
    setLocationModalVisible(false)
    setLoading(true)
    try {
      const restaurantsData = await restaurantAPI.getRestaurants({
        ordering: '-rating',
        lat: area.lat,
        lng: area.lng,
        radius_km: radiusKm,
      })
      setNearbyRestaurants(restaurantsData.results || restaurantsData)
    } catch (e) {
      console.error('Lỗi tải nhà hàng theo khu vực', e?.response?.data || e?.message || e)
      Alert.alert('Lỗi', 'Không thể tải nhà hàng theo khu vực đã chọn')
    } finally {
      setLoading(false)
    }
  }

  const loadAllRestaurants = async () => {
    try {
      setLoading(true)
      const all = await restaurantAPI.getRestaurants({ ordering: '-rating' })
      setNearbyRestaurants(all.results || all)
    } catch (e) {
      Alert.alert('Lỗi', 'Không thể tải danh sách nhà hàng')
    } finally {
      setLoading(false)
    }
  }

  const renderBanner = ({ item }) => (
    <TouchableOpacity
      style={styles.bannerItem}
      onPress={() => {
        if (item.restaurant) {
          navigation.navigate("RestaurantDetail", { restaurantId: item.restaurant })
        } else if (item.food) {
          navigation.navigate("FoodDetail", { foodId: item.food })
        }
      }}
    >
      <Image source={{ uri: item.image }} style={styles.bannerImage} />
      <View style={styles.bannerOverlay}>
        <Text style={styles.bannerTitle}>{item.title}</Text>
        {item.description && <Text style={styles.bannerDescription}>{item.description}</Text>}
      </View>
    </TouchableOpacity>
  )

  const renderCategoryFood = ({ item }) => (
    <TouchableOpacity
      style={styles.categoryFoodCard}
      onPress={() => navigation.navigate("FoodDetail", { foodId: item.id })}
    >
      <Image source={{ uri: item.image }} style={styles.categoryFoodImage} />
      <Text style={styles.categoryFoodName} numberOfLines={1}>{item.name}</Text>
      <Text style={styles.categoryFoodPrice}>
        {Number(item.current_price ?? item.price ?? 0).toLocaleString("vi-VN", { style: "currency", currency: "VND" })}
      </Text>
    </TouchableOpacity>
  )

  const handleCategoryPress = (categoryId) => {
    setExpandedCategoryId((prev) => (prev === categoryId ? null : categoryId))
  }

  const toggleShowAllFoods = (categoryId) => {
    setShowAllCategoryFoods((prev) => ({
      ...prev,
      [categoryId]: !prev?.[categoryId],
    }))
  }

  const renderCategory = ({ item }) => {
    const isActive = expandedCategoryId === item.id
    return (
      <TouchableOpacity style={[styles.categoryItem, isActive && styles.categoryItemActive]} onPress={() => handleCategoryPress(item.id)}>
        <Image source={{ uri: item.image }} style={styles.categoryImage} />
        <Text style={[styles.categoryName, isActive && { color: colors.primary }]} numberOfLines={2}>{item?.name || ""}</Text>
      </TouchableOpacity>
    )
  }

  const renderRecommendation = ({ item }) => (
    <TouchableOpacity
      style={styles.recommendationItem}
      onPress={() => {
        // Track view
        if (item?.food?.id) {
          aiAPI.trackFoodView(item.food.id).catch(console.error)
          navigation.navigate("FoodDetail", { foodId: item.food.id })
        }
      }}
    >
      <Image source={{ uri: item.food?.image }} style={styles.recommendationImage} />
      <View style={styles.recommendationInfo}>
        <Text style={styles.recommendationName}>{item.food?.name || ""}</Text>
        <Text style={styles.recommendationRestaurant}>{item.food?.restaurant_name || ""}</Text>
        <Text style={styles.recommendationPrice}>
          {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(item.food?.current_price || 0)}
        </Text>
        <Text style={styles.recommendationReason}>{item.reason}</Text>
      </View>
    </TouchableOpacity>
  )

  const renderRestaurant = ({ item }) => (
    <TouchableOpacity
      style={styles.restaurantItem}
      onPress={() => navigation.navigate("RestaurantDetail", { restaurantId: item.id })}
    >
      <Image source={{ uri: item.cover_image || item.logo }} style={styles.restaurantImage} />
      <View style={styles.restaurantInfo}>
        <Text style={styles.restaurantName}>{item?.name || ""}</Text>
        <Text style={styles.restaurantAddress}>{item?.address || ""}</Text>
        <View style={styles.restaurantMeta}>
          <View style={styles.ratingContainer}>
            <Ionicons name="star" size={16} color={colors.warning} />
            <Text style={styles.rating}>{item?.rating ?? ""}</Text>
          </View>
          <Text style={styles.deliveryFee}>
            Phí giao: {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(item.delivery_fee)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  )

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Đang tải...</Text>
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Food Delivery</Text>
          <TouchableOpacity style={styles.locationBadge} onPress={() => setLocationModalVisible(true)}>
            <Ionicons name="location" size={16} color={colors.primary} />
            <Text style={styles.locationText} numberOfLines={1}>
              {selectedLocation?.name ? `Khu vực: ${selectedLocation.name} (${radiusKm} km)` : 'Chọn khu vực'}
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.headerActions}>
          {user ? (
            <>
              <TouchableOpacity style={styles.notificationButton} onPress={() => navigation.navigate("Notifications")}>
                <Ionicons name={unreadNotifications > 0 ? 'notifications' : 'notifications-outline'} size={26} color={colors.primary} />
                {unreadNotifications > 0 && (
                  <View style={styles.notificationBadge}>
                    <Text style={styles.notificationBadgeText}>
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.profileButton} onPress={() => navigation.navigate("MainTabs", { screen: "Profile" })}>
                <Ionicons name="person-circle-outline" size={32} color={colors.primary} />
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.authActions}>
              <TouchableOpacity style={styles.authButton} onPress={() => navigation.navigate("Login")}>
                <Text style={styles.authButtonText}>Đăng nhập</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.authButton, styles.registerButton]} onPress={() => navigation.navigate("Register")}>
                <Text style={[styles.authButtonText, styles.registerButtonText]}>Đăng ký</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Search Bar */}
      <Searchbar
        placeholder="Tìm kiếm món ăn, nhà hàng..."
        onChangeText={setSearchQuery}
        value={searchQuery}
        onSubmitEditing={handleSearch}
        style={styles.searchBar}
      />

      {/* Banners */}
      {banners.length > 0 && (
        <View style={styles.section}>
          <FlatList
            data={banners}
            renderItem={renderBanner}
            keyExtractor={(item, index) => String(item?.id ?? index)}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.bannerList}
          />
        </View>
      )}
      {/* Categories */}
      {categories.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Danh mục</Text>
          <FlatList
            data={categories}
            renderItem={renderCategory}
            keyExtractor={(item, index) => String(item?.id ?? index)}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryList}
          />
        </View>
      )}

      {/* Category Foods */}
      {categoryGroups.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Món theo danh mục</Text>
            <Ionicons name="fast-food-outline" size={20} color={colors.primary} />
          </View>
          {categoryGroups.map((cat) => {
            const isExpanded = expandedCategoryId === cat.id
            const showAll = !!showAllCategoryFoods?.[cat.id]
            const foodsToRender = !isExpanded
              ? []
              : showAll
                ? cat.foods
                : cat.foods.slice(0, 4)

            return (
              <View key={cat.id} style={styles.categoryGroup}>
                <TouchableOpacity style={[styles.categoryGroupHeader, isExpanded && styles.categoryGroupHeaderActive]} onPress={() => handleCategoryPress(cat.id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.categoryGroupTitle}>{cat.name}</Text>
                    <Text style={styles.categoryGroupSubtitle}>{cat.foods.length} món</Text>
                  </View>
                  <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.primary} />
                </TouchableOpacity>
                {isExpanded && (
                  <>
                    <FlatList
                      data={foodsToRender}
                      renderItem={renderCategoryFood}
                      keyExtractor={(item, index) => String(item?.id ?? index)}
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.categoryFoodList}
                    />
                    {cat.foods.length > 4 && (
                      <TouchableOpacity style={styles.showAllButton} onPress={() => toggleShowAllFoods(cat.id)}>
                        <Text style={styles.showAllButtonText}>{showAll ? 'Thu gọn' : 'Xem tất cả món'}</Text>
                      </TouchableOpacity>
                    )}
                  </>
                )}
              </View>
            )
          })}
        </View>
      )}

      {/* AI Recommendations */}
      {recommendations.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Gợi ý cho bạn</Text>
            <Ionicons name="sparkles" size={20} color={colors.primary} />
          </View>
          <FlatList
            data={recommendations}
            renderItem={renderRecommendation}
            keyExtractor={(item, index) => String(item?.id ?? index)}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.recommendationList}
          />
        </View>
      )}

      {/* Nearby Restaurants */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Nhà hàng gần bạn</Text>
        {nearbyRestaurants.length === 0 ? (
          <View style={{ paddingHorizontal: spacing.lg }}>
            <Text style={{ color: colors.gray, marginBottom: 8 }}>Không tìm thấy nhà hàng theo khu vực đã chọn.</Text>
            <TouchableOpacity className="btn" onPress={loadAllRestaurants} style={{ backgroundColor: colors.primary, paddingVertical: 10, borderRadius: 10, alignItems: 'center' }}>
              <Text style={{ color: colors.white, fontWeight: '700' }}>Hiện tất cả nhà hàng</Text>
            </TouchableOpacity>
          </View>
        ) : (
          nearbyRestaurants.map((restaurant) => (
            <View key={restaurant.id}>{renderRestaurant({ item: restaurant })}</View>
          ))
        )}
      </View>

      {/* Location Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={locationModalVisible}
        onRequestClose={() => setLocationModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Chọn khu vực</Text>
            <TouchableOpacity style={styles.actionBtn} onPress={useCurrentLocation}>
              <Ionicons name="locate" size={18} color={colors.white} />
              <Text style={styles.actionBtnText}>Dùng vị trí hiện tại</Text>
            </TouchableOpacity>

            <Text style={[styles.sectionTitle, { paddingHorizontal: 0, marginTop: spacing.md }]}>Tỉnh/Thành</Text>
            {provinces.map((p) => (
              <Pressable key={p.id} style={styles.presetItem} onPress={() => choosePresetArea({ name: p.name, lat: Number(p.center_latitude), lng: Number(p.center_longitude), radius: Number(p.default_radius_km) })}>
                <Ionicons name="pin" size={16} color={colors.primary} />
                <Text style={{ marginLeft: 8 }}>{p.name}</Text>
              </Pressable>
            ))}

            <Text style={[styles.sectionTitle, { paddingHorizontal: 0, marginTop: spacing.md }]}>Bán kính</Text>
            <View style={styles.radiusRow}>
              {[2,5,10].map(km => (
                <TouchableOpacity
                  key={km}
                  style={[styles.radiusChip, radiusKm === km && styles.radiusChipActive]}
                  onPress={() => setRadiusKm(km)}
                >
                  <Text style={[styles.radiusChipText, radiusKm === km && styles.radiusChipTextActive]}>{km} km</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalFooter}>
              <TouchableOpacity style={[styles.footerBtn, { backgroundColor: colors.gray }]} onPress={() => setLocationModalVisible(false)}>
                <Text style={styles.footerBtnText}>Đóng</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.footerBtn, { backgroundColor: colors.primary }]}
                onPress={async () => { setLocationModalVisible(false); if (!provinces.length) { await loadProvinces(); } loadHomeData(); }}
              >
                <Text style={styles.footerBtnText}>Áp dụng</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </ScrollView>

      {/* Global Floating FAB overlay */}
      <FloatingChatFAB
        onChat={() => navigation.navigate("AIChat")}
        onOrders={() => navigation.navigate('MainTabs', { screen: 'Orders' })}
        onHelp={() => navigation.navigate('AIChat')}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.light,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.light,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.gray,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: spacing.lg,
    paddingTop: spacing.xl,
    backgroundColor: colors.white,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.primary,
  },
  locationBadge: {
    marginTop: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: '#eee',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 14,
    maxWidth: 220,
    gap: 6,
  },
  locationText: { fontSize: 12, color: colors.dark },
  searchBar: {
    margin: spacing.lg,
    elevation: 2,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: colors.dark,
    marginRight: spacing.sm,
  },
  bannerList: {
    paddingHorizontal: spacing.lg,
  },
  bannerItem: {
    width: 300,
    height: 150,
    marginRight: spacing.md,
    borderRadius: 12,
    overflow: "hidden",
  },
  bannerImage: {
    width: "100%",
    height: "100%",
  },
  bannerOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    padding: spacing.md,
  },
  bannerTitle: {
    color: colors.white,
    fontSize: 16,
    fontWeight: "bold",
  },
  bannerDescription: {
    color: colors.white,
    fontSize: 12,
    marginTop: spacing.xs,
  },
  categoryList: {
    paddingHorizontal: spacing.lg,
  },
  categoryItem: {
    alignItems: "center",
    marginRight: spacing.lg,
    width: 80,
  },
  categoryImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: spacing.sm,
  },
  categoryName: {
    fontSize: 12,
    textAlign: "center",
    color: colors.dark,
  },
  categoryGroup: {
    marginBottom: spacing.lg,
  },
  categoryGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  categoryGroupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
  },
  categoryGroupAction: {
    fontSize: 13,
    color: colors.primary,
    fontWeight: '600',
  },
  categoryFoodList: {
    paddingHorizontal: spacing.lg,
  },
  categoryFoodCard: {
    width: 150,
    marginRight: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.md,
    elevation: 2,
  },
  categoryFoodImage: {
    width: '100%',
    height: 80,
    borderRadius: 8,
    marginBottom: spacing.sm,
    backgroundColor: colors.light,
  },
  categoryFoodName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
  },
  categoryFoodPrice: {
    fontSize: 13,
    color: colors.primary,
    marginTop: 4,
  },
  recommendationList: {
    paddingHorizontal: spacing.lg,
  },
  recommendationItem: {
    width: 200,
    marginRight: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 12,
    overflow: "hidden",
    elevation: 2,
  },
  recommendationImage: {
    width: "100%",
    height: 120,
  },
  recommendationInfo: {
    padding: spacing.md,
  },
  recommendationName: {
    fontSize: 14,
    fontWeight: "bold",
    color: colors.dark,
    marginBottom: spacing.xs,
  },
  recommendationRestaurant: {
    fontSize: 12,
    color: colors.gray,
    marginBottom: spacing.xs,
  },
  recommendationPrice: {
    fontSize: 14,
    fontWeight: "bold",
    color: colors.primary,
    marginBottom: spacing.xs,
  },
  recommendationReason: {
    fontSize: 11,
    color: colors.info,
    fontStyle: "italic",
  },
  restaurantItem: {
    flexDirection: "row",
    backgroundColor: colors.white,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: 12,
    overflow: "hidden",
    elevation: 2,
  },
  restaurantImage: {
    width: 100,
    height: 100,
  },
  restaurantInfo: {
    flex: 1,
    padding: spacing.md,
  },
  restaurantName: {
    fontSize: 16,
    fontWeight: "bold",
    color: colors.dark,
    marginBottom: spacing.xs,
  },
  restaurantAddress: {
    fontSize: 12,
    color: colors.gray,
    marginBottom: spacing.sm,
  },
  restaurantMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  rating: {
    marginLeft: spacing.xs,
    fontSize: 12,
    color: colors.dark,
  },
  deliveryFee: {
    fontSize: 12,
    color: colors.primary,
  },
  chatButton: {
    position: "absolute",
    bottom: 20,
    right: 20,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 25,
    elevation: 5,
    shadowColor: colors.black,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  chatButtonText: {
    color: colors.white,
    marginLeft: spacing.sm,
    fontWeight: "bold",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: spacing.md },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  authActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  authButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  authButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
  registerButton: {
    backgroundColor: colors.primary,
  },
  registerButtonText: {
    color: colors.white,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  actionBtnText: { color: colors.white, fontWeight: '600' },
  presetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  radiusRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
  radiusChip: { borderWidth: 1, borderColor: '#ddd', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16 },
  radiusChipActive: { backgroundColor: '#FFEDE5', borderColor: '#FFC9B3' },
  radiusChipText: { color: colors.dark },
  radiusChipTextActive: { color: colors.primary, fontWeight: '700' },
  modalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: spacing.lg },
  footerBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10 },
  footerBtnText: { color: colors.white, fontWeight: '600' },
  // Draggable AI Chat FAB
  fab: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 56,
    height: 56,
  },
  fabInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4.5,
  },
})
