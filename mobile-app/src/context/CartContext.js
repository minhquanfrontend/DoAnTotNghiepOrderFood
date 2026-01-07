"use client"

import { createContext, useContext, useEffect, useState, useCallback } from "react"
import AsyncStorage from '@react-native-async-storage/async-storage'
import { cartAPI, restaurantAPI } from "../services/api"
import { useAuth } from "./AuthContext"

const CartContext = createContext({})
const GUEST_CART_KEY = 'guest_cart'

export const useCart = () => {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error("useCart must be used within a CartProvider")
  }
  return context
}

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()

  const normalizeCart = (data) => {
    if (!data) return { items: [], total_amount: 0, total_items: 0 }
    const rawItems = data.items || data.results || data.cart?.items || []
    const items = (rawItems || []).map((it) => {
      const foodObj = it.food && typeof it.food === 'object' ? it.food : null
      const image = it.image || it.food_image || it.image_url || it.food_image_url || foodObj?.image || foodObj?.image_url || null
      const name = it.food_name || it.name || foodObj?.name || ''
      const price = Number(it.price ?? it.unit_price ?? foodObj?.price ?? 0)
      const quantity = Number(it.quantity ?? it.qty ?? it.quantity_value ?? 1)
      const food_id = (typeof it.food_id === 'object' ? it.food_id?.id : it.food_id) || (typeof it.food === 'object' ? it.food?.id : it.food) || it.foodId
      return { ...it, image, name, price, quantity, food_id }
    })
    const total_items = items.reduce((s, x) => s + (Number(x.quantity) || 0), 0)
    const total_amount = items.reduce((s, x) => s + (Number(x.price) || 0) * (Number(x.quantity) || 0), 0)
    return { ...data, items, total_items, total_amount }
  }

  const loadGuestCart = async () => {
    try {
      setLoading(true)
      const guestCartRaw = await AsyncStorage.getItem(GUEST_CART_KEY)
      const guestCart = guestCartRaw ? JSON.parse(guestCartRaw) : { items: [] }
      setCart(normalizeCart(guestCart))
    } catch (error) {
      console.error("Lỗi tải giỏ hàng khách:", error)
      setCart({ items: [], total_amount: 0, total_items: 0 })
    } finally {
      setLoading(false)
    }
  }

  const saveGuestCart = async (newCart) => {
    try {
      const normalized = normalizeCart(newCart)
      await AsyncStorage.setItem(GUEST_CART_KEY, JSON.stringify(normalized))
      setCart(normalized)
    } catch (error) {
      console.error("Lỗi lưu giỏ hàng khách:", error)
    }
  }

  const mergeGuestCartToServer = async () => {
    try {
      const guestCartRaw = await AsyncStorage.getItem(GUEST_CART_KEY)
      const guestCart = guestCartRaw ? JSON.parse(guestCartRaw) : null
      if (guestCart && guestCart.items && guestCart.items.length > 0) {
        // Use Promise.all to add all items from guest cart to server cart
        await Promise.all(guestCart.items.map(item => 
          cartAPI.addToCart(item.food.id, item.quantity, item.notes || "")
        ))
        // Clear guest cart after successful merge
        await AsyncStorage.removeItem(GUEST_CART_KEY)
      }
    } catch (error) {
      console.error("Lỗi hợp nhất giỏ hàng:", error)
    } finally {
      // Fetch the final, merged cart from server
      await fetchCart()
    }
  }

  useEffect(() => {
    const handleAuthChange = async () => {
      if (user) {
        setLoading(true)
        await mergeGuestCartToServer()
      } else {
        loadGuestCart()
      }
    }
    handleAuthChange()
  }, [user])

  const fetchCart = async () => {
    if (!user) return loadGuestCart()
    try {
      setLoading(true)
      const cartData = await cartAPI.getCart()
      setCart(normalizeCart(cartData))
    } catch (error) {
      console.error("Lỗi tải giỏ hàng từ server:", error)
      // Handle auth errors - token expired
      if (error.response?.status === 401 || error.response?.status === 403 || error.isAuthError) {
        console.log("Token hết hạn, chuyển sang giỏ hàng khách")
        // Fall back to guest cart when auth fails
        await loadGuestCart()
        return
      }
      if (error.response?.status === 404) {
        setCart({ items: [], total_amount: 0, total_items: 0 })
      }
    } finally {
      setLoading(false)
    }
  }

  const addToCart = async (foodId, quantity = 1, notes = "") => {
    if (user) {
      try {
        await cartAPI.addToCart(foodId, quantity, notes)
        await fetchCart()
        return { success: true }
      } catch (error) {
        return { success: false, error: error.response?.data?.error || "Thêm vào giỏ hàng thất bại" }
      }
    } else {
      // Guest cart logic
      const currentCart = cart || { items: [] }
      const existingItemIndex = currentCart.items.findIndex(item => item.food.id === foodId)
      let newItems = [...currentCart.items]

      if (existingItemIndex > -1) {
        newItems[existingItemIndex].quantity += quantity
      } else {
        try {
          const foodDetails = await restaurantAPI.getFood(foodId)
          newItems.push({ id: `guest-${Date.now()}`, food: foodDetails, quantity, notes })
        } catch (e) {
          return { success: false, error: "Không tìm thấy thông tin món ăn" }
        }
      }
      await saveGuestCart({ ...currentCart, items: newItems })
      return { success: true }
    }
  }

  const updateCartItem = async (itemId, quantity, notes = "") => {
    if (user) {
      try {
        await cartAPI.updateCartItem(itemId, quantity, notes)
        await fetchCart()
        return { success: true }
      } catch (error) {
        return { success: false, error: error.response?.data?.error || "Cập nhật giỏ hàng thất bại" }
      }
    } else {
      // Guest cart logic
      const currentCart = cart || { items: [] }
      const itemIndex = currentCart.items.findIndex(item => item.id === itemId)
      if (itemIndex > -1) {
        let newItems = [...currentCart.items]
        if (quantity > 0) {
          newItems[itemIndex].quantity = quantity
          if (notes) newItems[itemIndex].notes = notes
        } else {
          newItems.splice(itemIndex, 1)
        }
        await saveGuestCart({ ...currentCart, items: newItems })
      }
      return { success: true }
    }
  }

  const removeFromCart = async (itemId) => {
    return updateCartItem(itemId, 0)
  }

  const clearCart = async () => {
    if (user) {
      try {
        await cartAPI.clearCart()
        setCart({ items: [], total_amount: 0, total_items: 0 })
        return { success: true }
      } catch (error) {
        return { success: false, error: error.response?.data?.error || "Xóa giỏ hàng thất bại" }
      }
    } else {
      await saveGuestCart({ items: [] })
      return { success: true }
    }
  }

  const getCartItemCount = () => cart?.total_items || 0
  const getCartTotal = () => cart?.total_amount || 0

  const value = {
    cart,
    loading,
    addToCart,
    updateCartItem,
    removeFromCart,
    clearCart,
    fetchCart,
    getCartItemCount,
    getCartTotal,
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
