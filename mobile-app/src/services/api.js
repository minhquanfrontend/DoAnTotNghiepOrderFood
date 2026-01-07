import axios from "axios"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { Platform } from "react-native"
// ================== BASE URL CONFIG (EMULATOR-OPTIMIZED) ==================
// Android emulator reaches host machine via 10.0.2.2; iOS simulator/desktop uses 127.0.0.1
const BASE_URL = Platform.OS === "android"
  ? "http://10.0.2.2:8000/api/"
  : "http://127.0.0.1:8000/api/"

// ================== AXIOS INSTANCE ==================
const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  // Do not set a global Content-Type header here so axios can
  // automatically set the correct headers (including multipart boundaries)
  // depending on the request body (JSON vs FormData).
});

// Base URL is selected from env/app.json or emulator defaults.

// ================== REQUEST INTERCEPTOR ==================
api.interceptors.request.use(
  async (config) => {
    // Support both key names to be compatible with different parts of app
    const token = (await AsyncStorage.getItem("accessToken")) || (await AsyncStorage.getItem("access_token"))
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// ================== RESPONSE INTERCEPTOR ==================
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config
    // If there's no response at all, it's likely a network error. Show helpful hints.
    if (!error.response) {
      return Promise.reject(error);
    }
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true
      try {
        // Try both refresh token key variants
        const refreshToken = (await AsyncStorage.getItem("refreshToken")) || (await AsyncStorage.getItem("refresh_token"))
        if (refreshToken) {
          // Avoid double-slash: baseURL already ends with '/'
          const base = (api?.defaults?.baseURL || BASE_URL).replace(/\/$/, '/')
          const response = await axios.post(`${base}auth/token/refresh/`, {
            refresh: refreshToken,
          })
          const { access } = response.data
          // persist both key variants to be safe across code paths
          await AsyncStorage.setItem("accessToken", access)
          await AsyncStorage.setItem("access_token", access)
          originalRequest.headers.Authorization = `Bearer ${access}`
          return api(originalRequest)
        }
      } catch (refreshError) {
        // Remove both variants on refresh failure
        await AsyncStorage.removeItem("accessToken")
        await AsyncStorage.removeItem("access_token")
        await AsyncStorage.removeItem("refreshToken")
        await AsyncStorage.removeItem("refresh_token")
      }
    }
    return Promise.reject(error)
  }
)

// ================== AUTH API ==================
export const authAPI = {
  login: async (username, password) => {
    try {
      const response = await api.post("/auth/login/", { username, password });
      const { access, refresh } = response.data;
      
      // Save tokens to AsyncStorage with both key variants for compatibility
      await AsyncStorage.multiSet([
        ["accessToken", access],
        ["access_token", access],
        ["refreshToken", refresh],
        ["refresh_token", refresh]
      ]);
      
      // Set default auth header for future requests
      api.defaults.headers.common['Authorization'] = `Bearer ${access}`;
      
      return response.data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },
  register: (userData) => api.post("/auth/register/", userData),
  getProfile: () => api.get("/auth/profile/"),
  updateProfile: (profileData) => api.put("/auth/profile/", profileData),
  
  // Gửi yêu cầu làm shipper/restaurant
  requestRole: (requestData) => api.post("/auth/request/", requestData),
  getMyRequests: () => api.get("/auth/my-requests/"),
  
  // Admin duyệt yêu cầu
  approveRequest: (requestId, action, note = "") =>
    api.post(`/auth/request/${requestId}/approve/`, { action, note }),

  updateLocation: (latitude, longitude, isAvailable) =>
    api.post("/auth/shipper/update-location/", {
      current_latitude: latitude,
      current_longitude: longitude,
      is_available: isAvailable,
    }),

  // 🔹 Logout chỉ xoá token trong AsyncStorage
  logout: async () => {
    await AsyncStorage.removeItem("access_token")
    await AsyncStorage.removeItem("refresh_token")
    return true
  },
}

// ================== RESTAURANT API ==================
export const restaurantAPI = {
  getCategories: () => api.get("/restaurants/categories/"),
  getCategoriesWithFoods: (limit = 5) => api.get("/restaurants/categories-with-foods/", { params: { limit } }),
  getRestaurants: (params = {}) => api.get("/restaurants/", { params }),
  getRestaurant: (id) => api.get(`/restaurants/${id}/`),
  getRestaurantFoods: (restaurantId, params = {}) =>
    api.get(`/restaurants/${restaurantId}/foods/`, { params }),
  getFoods: (params = {}) => api.get("/restaurants/foods/", { params }),
  getFood: (id) => api.get(`/restaurants/foods/${id}/`),
  searchFoods: (query) => api.get("/restaurants/foods/search/", { params: { q: query } }),
  getFoodReviews: (foodId) => api.get(`/restaurants/foods/${foodId}/reviews/`),
  createReview: (reviewData) => api.post("/restaurants/reviews/create/", reviewData),
  getFoodSuggestions: (foodId) => api.get(`/restaurants/foods/${foodId}/suggestions/`),
  createReviewWithImage: (formData, config) => api.post("/restaurants/reviews/create/", formData, config),
  getFoodRatingStats: (foodId) => api.get(`/restaurants/foods/${foodId}/rating-stats/`),
  getBanners: async () => {
    try { return await api.get("/restaurants/banners/") } catch (e) {
      if (e?.response?.status === 401) return []
      throw e
    }
  },

  // Seller APIs
  getMyRestaurant: () => api.get("/restaurants/my-restaurant/"),
  updateMyRestaurant: (restaurantData) => api.put("/restaurants/my-restaurant/", restaurantData),
  getMyFoods: () => api.get("/restaurants/my-foods/"),
  // allow passing FormData and optional axios config when creating food
  createFood: (foodData, config) => api.post("/restaurants/my-foods/", foodData, config),
  updateFood: async (foodId, foodData) => {
    const url = `/restaurants/my-foods/${foodId}/`
    const toFormData = (data) => {
      if (data instanceof FormData) return data
      const fd = new FormData()
      Object.entries(data || {}).forEach(([k, v]) => {
        if (v === undefined || v === null) return
        if (k === 'image' && v && typeof v === 'object' && v.uri) {
          const name = v.name || 'image.jpg'
          const type = v.type || 'image/jpeg'
          fd.append(k, { uri: v.uri, name, type })
        } else {
          fd.append(k, String(v))
        }
      })
      return fd
    }
    const hasFile = (foodData instanceof FormData) || (foodData?.image && typeof foodData.image === 'object' && foodData.image.uri)
    try {
      if (hasFile) {
        const fd = toFormData(foodData)
        return await api.patch(url, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      }
      return await api.patch(url, foodData)
    } catch (e) {
      const status = e?.response?.status
      const tryPut = async (targetUrl) => {
        if (hasFile) {
          const fd = toFormData(foodData)
          return await api.put(targetUrl, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        }
        return await api.put(targetUrl, foodData)
      }
      if (status === 400 || status === 405) {
        try { return await tryPut(url) } catch {}
        const alternates = [
          `/restaurants/foods/${foodId}/`,
          `/restaurants/my-foods/${foodId}/`,
        ]
        for (const p of alternates) { try { return await tryPut(p) } catch {} }
      }
      throw e
    }
  },
  deleteFood: (foodId) => api.delete(`/restaurants/my-foods/${foodId}/`),
  // Seller posts
  getRestaurantPosts: (restaurantId) => api.get(`/restaurants/${restaurantId}/posts/`),
  getMyPosts: () => api.get(`/restaurants/my-posts/`),
  createMyPost: (formData, config) => api.post(`/restaurants/my-posts/`, formData, config),
  deleteMyPost: (postId) => api.delete(`/restaurants/my-posts/${postId}/`),
}

// ================== CART API ==================
export const cartAPI = {
  getCart: async () => {
    // If there's no token (or invalid string), avoid server call
    const raw1 = await AsyncStorage.getItem("accessToken")
    const raw2 = await AsyncStorage.getItem("access_token")
    const token = raw1 || raw2
    if (!token || token === 'undefined' || token === 'null' || token.length < 10) {
      return { id: null, items: [], total_amount: 0, subtotal: 0, delivery_fee: 0 }
    }
    try {
      return await api.get("/orders/cart/")
    } catch (e) {
      if (e?.response?.status === 401) {
        return { id: null, items: [], total_amount: 0, subtotal: 0, delivery_fee: 0 }
      }
      throw e
    }
  },
  addToCart: (foodId, quantity, notes) => {
    const payload = {
      // support multiple param names for compatibility
      food_id: foodId,
      food: foodId,
      quantity,
      qty: quantity,
      notes,
    }
    return api.post("/orders/cart/add/", payload)
  },
  updateCartItem: (itemId, quantity, notes) =>
    api.put(`/orders/cart/update/${itemId}/`, { quantity, notes }),
  removeFromCart: (itemId) => api.delete(`/orders/cart/remove/${itemId}/`),
  clearCart: () => api.delete("/orders/cart/clear/"),
}

// ================== ORDER API ==================
export const orderAPI = {
  createOrder: async (orderData) => {
    // Normalize items for compatibility
    const normalized = { ...orderData }
    if (Array.isArray(orderData?.items)) {
      normalized.items = orderData.items
        .map((it) => {
          let fid = null
          if (it.food_id) {
            fid = typeof it.food_id === 'object' ? it.food_id?.id : it.food_id
          } else if (it.food) {
            fid = typeof it.food === 'object' ? it.food?.id : it.food
          } else if (it.foodId) {
            fid = it.foodId
          }
          // Ensure fid is a valid integer
          fid = parseInt(fid, 10)
          if (isNaN(fid) || fid <= 0) {
            console.warn('[createOrder] Invalid food_id:', it)
            return null
          }
          const q = Number(it.quantity ?? it.qty ?? 1) || 1
          return { food_id: fid, food: fid, quantity: q, qty: q, notes: it.notes || '' }
        })
        .filter(Boolean)
    }
    
    // Ensure required fields are present and not empty
    if (!normalized.delivery_address || normalized.delivery_address.trim() === '') {
      throw new Error('Vui lòng nhập địa chỉ giao hàng')
    }
    if (!normalized.delivery_phone || normalized.delivery_phone.trim() === '') {
      throw new Error('Vui lòng nhập số điện thoại')
    }
    if (!normalized.payment_method) {
      normalized.payment_method = 'cash'
    }
    
    // Ensure notes is a string, not null/undefined
    normalized.notes = normalized.notes || ''
    
    console.log('[createOrder] Sending payload:', JSON.stringify(normalized, null, 2))
    
    // Ensure backend cart contains current items before creating order
    if (Array.isArray(normalized.items) && normalized.items.length > 0) {
      console.log('[createOrder] Syncing cart with', normalized.items.length, 'items')
      try {
        await cartAPI.clearCart().catch(() => {})
        for (const it of normalized.items) {
          const foodId = it.food_id || it.food
          const qty = it.quantity || it.qty || 1
          console.log('[createOrder] Adding to cart:', foodId, 'qty:', qty)
          try { 
            await cartAPI.addToCart(foodId, qty, it.notes || '') 
          } catch (addErr) {
            console.error('[createOrder] Failed to add item:', foodId, addErr?.response?.data || addErr?.message)
          }
        }
      } catch (syncErr) {
        console.error('[createOrder] Cart sync error:', syncErr?.message)
      }
    }
    try {
      console.log('[createOrder] Calling /orders/orders/create/')
      const res = await api.post("/orders/orders/create/", normalized)
      console.log('[createOrder] Success:', res)
      // Backend may return { message, order } – unwrap to plain order
      if (res && res.order) return res.order
      return res
    } catch (err) {
      console.error('[createOrder] Error:', err?.response?.status, JSON.stringify(err?.response?.data, null, 2))
      // Fallback endpoints commonly used
      if (err?.response?.status === 404 || err?.response?.status === 405) {
        try {
          const res2 = await api.post("/orders/orders/checkout/", normalized)
          return (res2 && res2.order) ? res2.order : res2
        } catch (err2) {
          // Last resort: checkout from cart without explicit items
          const alt = await api.post("/orders/orders/cart/checkout/", {
            delivery_address: normalized.delivery_address || '',
            payment_method: normalized.payment_method || 'cash',
          })
          return (alt && alt.order) ? alt.order : alt
        }
      }
      throw err
    }
  },
  // Create order (aligned with backend: orders/create/)
  createOrderFromCart: async (delivery_address = '', payment_method = 'cash', delivery_phone = '', delivery_latitude = undefined, delivery_longitude = undefined) => {
    const payload = { delivery_address, delivery_phone, payment_method }
    if (typeof delivery_latitude === 'number' && typeof delivery_longitude === 'number') {
      payload.delivery_latitude = delivery_latitude
      payload.delivery_longitude = delivery_longitude
    }
    return await api.post('/orders/orders/create/', payload)
  },
  getMyOrders: () => api.get("/orders/orders/my/"),
  getOrderDetail: (id) => api.get(`/orders/orders/${id}/`),
  getOrder: async (id) => {
    try {
      return await api.get(`/orders/orders/${id}/`)
    } catch (e) {
      const code = e?.response?.status
      if (code === 404 || code === 403) {
        // Try shipper-specific endpoints
        const paths = [
          `/orders/shipper/orders/${id}/map-data/`,
          `/orders/shipper/orders/${id}/route-info/`,
        ]
        for (const p of paths) {
          try {
            const data = await api.get(p)
            // Convert map-data/route-info format to order format
            return {
              id: data.order_id || id,
              status: data.status,
              restaurant_name: data.restaurant?.name,
              delivery_address: data.customer?.address,
              delivery_latitude: data.customer?.latitude,
              delivery_longitude: data.customer?.longitude,
              pickup_latitude: data.restaurant?.latitude,
              pickup_longitude: data.restaurant?.longitude,
              pickup_address: data.restaurant?.address,
              ...data
            }
          } catch {}
        }
      }
      throw e
    }
  },
  cancelOrder: (orderId) => api.post(`/orders/orders/${orderId}/cancel/`, {}),
  deleteOrder: (orderId) => api.delete(`/orders/orders/${orderId}/delete/`),

  // Seller APIs
  getRestaurantOrders: async () => {
    // First try the specific endpoint, then fallback to all orders
    try {
      console.log("Trying specific endpoint: /orders/restaurant/orders/")
      const res = await api.get("/orders/restaurant/orders/")
      console.log("Response from /orders/restaurant/orders/:", res)
      
      if (Array.isArray(res?.results) && res.results.length > 0) {
        console.log(`Found ${res.results.length} orders from specific endpoint`)
        return res.results
      }
    } catch (e) {
      console.log("Specific endpoint failed:", e.response?.status || e.message)
    }
    
    // Fallback: get all orders and filter client-side
    try {
      console.log("Fallback: trying /orders/orders/ to get all orders")
      const res = await api.get("/orders/orders/")
      console.log("Response from /orders/orders/:", res)
      
      let allOrders = []
      if (Array.isArray(res?.results)) {
        allOrders = res.results
      } else if (Array.isArray(res)) {
        allOrders = res
      }
      
      console.log(`Total orders found: ${allOrders.length}`)
      
      // Get current seller's restaurant info
      try {
        const restaurantInfo = await restaurantAPI.getMyRestaurant()
        const sellerRestaurantId = restaurantInfo?.id
        console.log(`Filtering orders for restaurant ID: ${sellerRestaurantId}`)
        
        // Filter orders for this seller's restaurant
        const restaurantOrders = allOrders.filter(order => {
          const orderRestaurantId = order?.restaurant?.id || order?.restaurant
          console.log(`Order ${order.id} restaurant ID: ${orderRestaurantId}`)
          return orderRestaurantId === sellerRestaurantId
        })
        
        console.log(`Found ${restaurantOrders.length} orders for restaurant ${sellerRestaurantId}`)
        return restaurantOrders
      } catch (restaurantError) {
        console.log("Could not get restaurant info for filtering:", restaurantError)
        return allOrders // Return all orders if we can't filter
      }
    } catch (e) {
      console.log("All endpoints failed:", e)
      throw new Error("Unable to fetch orders")
    }
  },
  getRestaurantStats: async (period, startDate, endDate) => {
    const params = period ? { period } : {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    try {
      return await api.get("/orders/restaurant/stats/", { params });
    } catch (e) {
      console.error("Error fetching restaurant stats:", e);
      throw e;
    }
  },
  // ✅ FIXED: Action-based status update (STRICT flow - no skipping steps)
  updateOrderStatus: (orderId, actionOrStatus, message = "") => {
    // Support both action-based (new) and status-based (legacy)
    const validActions = [
      'confirm', 'start_preparing', 'mark_ready', 'accept', 'pick_up', 
      'start_delivering', 'deliver', 'complete',
      'cancel_by_user', 'cancel_by_seller', 'cancel_by_shipper', 'fail_delivery'
    ];
    const isAction = validActions.includes(actionOrStatus);
    if (isAction) {
      return api.post(`/orders/${orderId}/update-status/`, { action: actionOrStatus, message });
    }
    // Legacy: send as status
    return api.post(`/orders/${orderId}/update-status/`, { status: actionOrStatus, message });
  },

  // ✅ Seller Actions (STRICT flow)
  confirmOrder: (orderId) =>
    api.post(`/orders/${orderId}/update-status/`, { action: 'confirm' }),
  
  startPreparing: (orderId) =>
    api.post(`/orders/${orderId}/update-status/`, { action: 'start_preparing' }),
  
  markReady: (orderId) =>
    api.post(`/orders/${orderId}/update-status/`, { action: 'mark_ready' }),
  
  cancelOrder: (orderId) =>
    api.post(`/orders/${orderId}/update-status/`, { action: 'cancel' }),

  findShipper: (orderId) =>
    api.post(`/orders/${orderId}/find-shipper/`),


  // Shipper APIs
  getAvailableOrders: async (lat, lng, radiusKm) => {
    const params = {}
    if (typeof lat === 'number' && typeof lng === 'number') {
      params.lat = lat
      params.lng = lng
      // Also send alternative keys some backends expect
      params.latitude = lat
      params.longitude = lng
    }
    if (typeof radiusKm === 'number') {
      params.radius_km = radiusKm
      params.radius = radiusKm
    }
    // Enforce seller-first workflow: only fetch orders marked ready
    params.status = 'ready'
    try {
      return await api.get("/orders/shipper/orders/available/", Object.keys(params).length ? { params } : undefined)
    } catch (e) {
      const code = e?.response?.status
      if (code === 404 || code === 405) {
        // Try common alternates
        const candidates = [
          "/orders/shipper/available/",
          "/orders/available/",
          "/shipper/orders/available/",
        ]
        for (const path of candidates) {
          try { return await api.get(path, Object.keys(params).length ? { params } : undefined) } catch {}
        }
      }
      throw e
    }
  },
  acceptOrder: async (orderId) => {
    try { return await api.post(`/orders/shipper/orders/${orderId}/accept/`) } catch (e) {
      const code = e?.response?.status
      if (code === 404 || code === 405) {
        const paths = [
          `/orders/shipper/${orderId}/accept/`,
          `/shipper/orders/${orderId}/accept/`,
          `/shipper/${orderId}/accept/`,
        ]
        for (const p of paths) { try { return await api.post(p) } catch {} }
      }
      throw e
    }
  },
  getMyDeliveries: async () => {
    try { return await api.get("/orders/shipper/orders/my/") } catch (e) {
      const code = e?.response?.status
      if (code === 404 || code === 405) {
        const paths = [
          "/orders/shipper/my/",
          "/shipper/orders/my/",
          "/shipper/my/",
        ]
        for (const p of paths) { try { return await api.get(p) } catch {} }
      }
      throw e
    }
  },

  getShipperRouteInfo: async (orderId) => {
    try {
      return await api.get(`/orders/shipper/orders/${orderId}/route-info/`);
    } catch (e) {
      // Try alternate paths
      const paths = [
        `/orders/${orderId}/route-info/`,
        `/shipper/orders/${orderId}/route-info/`,
      ];
      for (const p of paths) {
        try { return await api.get(p); } catch {}
      }
      throw e;
    }
  },

  updateShipperLocation: (orderId, latitude, longitude) =>
    api.post('/orders/shipper/location/update/', { order: orderId, latitude, longitude }),

  // Guest Checkout APIs (No Login Required)
  createGuestOrder: (guestData) => api.post('/orders/guest/order/', guestData),
  trackGuestOrder: (orderNumber, email) => 
    api.get('/orders/guest/track/', { params: { order_number: orderNumber, email } }),
  guestConfirmDelivery: (orderNumber, email) =>
    api.post('/orders/guest/confirm-delivery/', { order_number: orderNumber, email }),
}

// ================== PAYMENT API ==================
export const paymentAPI = {
  getPayments: () => api.get("/payments/"),
  getPayment: (paymentId) => api.get(`/payments/${paymentId}/`),
  createPayment: (paymentData) => api.post("/payments/create/", paymentData),
  confirmPayment: (paymentId) => api.post(`/payments/${paymentId}/confirm/`),
  requestRefund: (paymentId, reason, amount) =>
    api.post(`/payments/${paymentId}/refund/`, { reason, amount }),
  // ✅ FIXED: Use correct endpoint - only returns VNPay + COD
  getPaymentMethods: async () => {
    try {
      const response = await api.get("/payments/available-methods/");
      // Response format: { success: true, methods: [...] }
      return response?.methods || response || [];
    } catch (e) {
      console.error('Error getting payment methods:', e);
      // Return default methods if API fails
      return [
        { id: 'cash', name: 'Tiền mặt (COD)', description: 'Thanh toán khi nhận hàng', icon: 'cash-outline', enabled: true, fee: 0, type: 'cash' },
        { id: 'vnpay', name: 'VNPay', description: 'Thanh toán online qua VNPay', icon: 'card-outline', enabled: true, fee: 0, type: 'online' }
      ];
    }
  },
  addPaymentMethod: (methodData) => api.post("/payments/methods/", methodData),
  deletePaymentMethod: (methodId) => api.delete(`/payments/methods/${methodId}/`),
}

// ================== NOTIFICATION API ==================
export const notificationAPI = {
  getNotifications: () => api.get("/notifications/"),
  getNotification: (notificationId) => api.get(`/notifications/${notificationId}/`),
  markAsRead: (notificationId) => api.post(`/notifications/${notificationId}/read/`),
  markAllAsRead: () => api.post("/notifications/mark-all-read/"),
  getUnreadCount: () => api.get("/notifications/unread-count/"),
  registerPushToken: (token, deviceType) =>
    api.post("/notifications/push-token/", { token, device_type: deviceType }),
}

// ================== AI API ==================
export const aiAPI = {
  getRecommendations: async () => {
    try { return await api.get("/ai/recommendations/") } catch (e) {
      if (e?.response?.status === 401) return []
      throw e
    }
  },
  trackFoodView: (foodId) => api.post("/ai/track-view/", { food_id: foodId }),
  likeFood: (foodId) => api.post("/ai/like-food/", { food_id: foodId }),
  getLikedFoods: () => api.get("/ai/liked-foods/"),
  updatePreferences: (preferences) => api.put("/ai/preferences/", preferences),
  getPreferences: () => api.get("/ai/preferences/"),

  sendChatMessage: async (message, sessionId) => {
    const payload = { message };
    if (sessionId) {
      payload.session_id = sessionId;
    }
    try {
      const response = await api.post("/ai/chat/send/", payload);
      return response;
    } catch (error) {
      console.error('Error sending chat message:', error);
      if (error.response) {
        console.error('Response data:', error.response.data);
        console.error('Response status:', error.response.status);
        console.error('Response headers:', error.response.headers);
      } else if (error.request) {
        console.error('No response received:', error.request);
      } else {
        console.error('Error setting up request:', error.message);
      }
      throw error;
    }
  },

  getChatSessions: async () => {
    try {
      const response = await api.get("/ai/chat/sessions/");
      return response;
    } catch (error) {
      console.error('Error fetching chat sessions:', error);
      if (error?.response?.status === 401) return [];
      throw error;
    }
  },
  
  getChatSession: async (sessionId) => {
    try {
      const response = await api.get(`/ai/chat/sessions/${sessionId}/`);
      return response;
    } catch (error) {
      console.error(`Error fetching chat session ${sessionId}:`, error);
      throw error;
    }
  },

  deleteChatSession: async (sessionId) => {
    try {
      return await api.delete(`/ai/chat/sessions/${sessionId}/`)
    } catch (error) {
      console.error(`Error deleting chat session ${sessionId}:`, error)
      throw error
    }
  },

  clearChatSessions: async () => {
    try {
      return await api.delete('/ai/chat/sessions/clear/')
    } catch (error) {
      console.error('Error clearing chat sessions:', error)
      throw error
    }
  },
}

// ================== WALLET API ==================
export const walletAPI = {
  getWallet: () => api.get('wallet/'),
  getTransactions: () => api.get('wallet/transactions/'),
  topUp: (amount) => api.post('wallet/top-up/', { amount }),
  withdraw: (amount) => api.post('wallet/withdraw/', { amount }),
  transfer: (receiverId, amount) => api.post('wallet/transfer/', { receiver_id: receiverId, amount }),
  getTransactionHistory: (params = {}) => api.get('wallet/transactions/', { params }),
}

export default api

// ================== PROVINCE (LOCATION) API ==================
export const provinceAPI = {
  // Public
  getProvinces: () => api.get("/restaurants/provinces/"),
  getProvince: (id) => api.get(`/restaurants/provinces/${id}/`),

  // Admin CRUD (require admin token)
  adminList: () => api.get("/restaurants/admin/provinces/"),
  adminCreate: (payload) => api.post("/restaurants/admin/provinces/", payload),
  adminUpdate: (id, payload) => api.put(`/restaurants/admin/provinces/${id}/`, payload),
  adminDelete: (id) => api.delete(`/restaurants/admin/provinces/${id}/`),
}
