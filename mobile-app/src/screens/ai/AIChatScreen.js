"use client"

import { useEffect, useState, useRef } from "react"
import { View, Text, StyleSheet, FlatList, KeyboardAvoidingView, Platform, TouchableOpacity, Image, Alert, Dimensions, Modal } from "react-native"
import { TextInput, Button, Card, ActivityIndicator } from "react-native-paper"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { Ionicons } from "@expo/vector-icons"
import { aiAPI } from "../../services/api"
import { colors, spacing } from "../../theme/theme"
import FoodRecommendation from "../../components/chat/FoodRecommendation"

const { width } = Dimensions.get('window')

export default function AIChatScreen({ navigation, route }) {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState("")
  const [loading, setLoading] = useState(false)
  const [sessionId, setSessionId] = useState(route.params?.sessionId || null)
  const [historyVisible, setHistoryVisible] = useState(false)
  const [chatHistory, setChatHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const flatListRef = useRef(null)

  useEffect(() => {
    if (sessionId) {
      loadChatSession()
    } else {
      // Add welcome message
      setMessages([
        {
          id: "welcome",
          message_type: "bot",
          content:
            "Xin chào! Tôi là Bot Tư Vấn của Food Delivery. Tôi có thể giúp bạn:\n\n• Gợi ý món ăn phù hợp\n• • Tư vấn thực đơn\n•\nBạn muốn tôi giúp gì?",
          created_at: new Date().toISOString(),
        },
      ])
    }
  }, [sessionId])

  const loadChatSession = async () => {
    if (!sessionId) return 
    try {
      const session = await aiAPI.getChatSession(sessionId)
      setMessages(session.messages || [])
    } catch (error) {
      console.error("Error loading chat session:", error)
      Alert.alert("Lỗi", "Không thể tải cuộc trò chuyện")
    }
  }

  const loadChatHistory = async () => {
    try {
      setHistoryLoading(true)
      const data = await aiAPI.getChatSessions()
      const list = data?.results || data || []
      setChatHistory(Array.isArray(list) ? list : [])
    } catch (error) {
      console.error('Error loading chat history:', error)
      Alert.alert('Lỗi', 'Không thể tải lịch sử chat')
    } finally {
      setHistoryLoading(false)
    }
  }

  const handleOpenHistory = () => {
    setHistoryVisible(true)
    loadChatHistory()
  }

  const handleSelectSession = async (session) => {
    try {
      setLoading(true)
      const detail = await aiAPI.getChatSession(session.session_id)
      setSessionId(detail.session_id)
      setMessages(detail.messages || [])
      setHistoryVisible(false)
    } catch (error) {
      console.error('Error selecting session:', error)
      Alert.alert('Lỗi', 'Không thể mở cuộc trò chuyện này')
    } finally {
      setLoading(false)
    }
  }

  const confirmDeleteSession = (session) => {
    Alert.alert(
      'Xóa cuộc trò chuyện',
      'Bạn chắc chắn muốn xóa cuộc trò chuyện này?',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa',
          style: 'destructive',
          onPress: () => handleDeleteSession(session.session_id),
        },
      ]
    )
  }

  const handleDeleteSession = async (targetSessionId) => {
    try {
      await aiAPI.deleteChatSession(targetSessionId)
      await loadChatHistory()
      if (sessionId === targetSessionId) {
        setSessionId(null)
        setMessages([
          {
            id: 'welcome',
            message_type: 'bot',
            content: 'Xin chào! Tôi là Bot Tư Vấn của Food Delivery. Bạn cứ hỏi mình nhé!',
            created_at: new Date().toISOString(),
          },
        ])
      }
    } catch (error) {
      console.error('Error deleting session:', error)
      Alert.alert('Lỗi', 'Không thể xóa cuộc trò chuyện')
    }
  }

  const confirmClearHistory = () => {
    Alert.alert(
      'Xóa toàn bộ lịch sử',
      'Bạn muốn xóa tất cả cuộc trò chuyện? Thao tác này không thể hoàn tác.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Xóa tất cả',
          style: 'destructive',
          onPress: handleClearHistory,
        },
      ]
    )
  }

  const handleClearHistory = async () => {
    try {
      await aiAPI.clearChatSessions()
      setChatHistory([])
      setSessionId(null)
      setMessages([
        {
          id: 'welcome',
          message_type: 'bot',
          content: 'Xin chào! Tôi là Bot Tư Vấn của Food Delivery. Bạn cứ hỏi mình nhé!',
          created_at: new Date().toISOString(),
        },
      ])
      setHistoryVisible(false)
    } catch (error) {
      console.error('Error clearing chat history:', error)
      Alert.alert('Lỗi', 'Không thể xóa lịch sử')
    }
  }

  const sendMessage = async () => {
    const trimmed = inputText.trim()
    if (!trimmed) return

    // Ensure user is authenticated before calling protected AI endpoints
    const [tokenPrimary, tokenLegacy] = await Promise.all([
      AsyncStorage.getItem('accessToken'),
      AsyncStorage.getItem('access_token'),
    ])
    const rawToken = tokenPrimary || tokenLegacy
    if (!rawToken || rawToken === 'null' || rawToken === 'undefined') {
      Alert.alert('Yêu cầu đăng nhập', 'Vui lòng đăng nhập để sử dụng Bot Tư Vấn Món Ăn')
      return
    }

    const userMessage = {
      id: Date.now().toString(),
      message_type: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputText("")
    setLoading(true)

    try {
      const response = await aiAPI.sendChatMessage(trimmed, sessionId)

      if (!sessionId && response.session_id) {
        setSessionId(response.session_id)
      }

      // Handle the response based on its type
      if (response.type === 'food_recommendation' && response.metadata?.recommendations) {
        // Create a single message that contains both the text and recommendations
        const recommendationMessage = {
          id: Date.now().toString() + "_rec",
          message_type: "bot",
          type: "food_recommendation",
          content: response.text || 'Đề xuất món ăn',
          metadata: response.metadata,
          created_at: new Date().toISOString(),
        };
        setMessages(prev => [...prev, recommendationMessage]);
      } else if (response.messages && response.messages[1]) {
        // Handle regular bot messages
        const botMessage = response.messages[1];
        setMessages(prev => [...prev, botMessage]);
      }
    } catch (error) {
      console.error("Error sending message:", error)
      const errorMessage = {
        id: Date.now().toString() + "_error",
        message_type: "bot",
        content: "Xin lỗi, tôi đang gặp sự cố. Vui lòng thử lại sau.",
        created_at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, errorMessage])
    } finally {
      setLoading(false)
    }
  }

  const handleOrderPress = (foodItem) => {
    // Navigate to food detail screen with food and restaurant info
    navigation.navigate('FoodDetail', {
      foodId: foodItem.food_id,
      foodName: foodItem.food_name,
      restaurantId: foodItem.restaurant?.id,
      restaurantName: foodItem.restaurant?.name
    });
  };

  const renderMessage = ({ item }) => {
    const isUser = item.message_type === 'user';

    // Handle food recommendation message
    if (item.type === 'food_recommendation' || item.metadata?.recommendations) {
      const recommendations = item.metadata?.recommendations || [];
      return (
        <View style={styles.recommendationsContainer}>
          {item.content && (
            <View style={[
              styles.messageContainer,
              styles.botMessage,
              { marginBottom: 8 }
            ]}>
              <Text style={styles.messageText}>{item.content}</Text>
            </View>
          )}
          <FoodRecommendation 
            recommendations={recommendations}
            onOrderPress={handleOrderPress}
          />
        </View>
      );
    }

    // Regular message
    return (
      <View
        style={[
          styles.messageContainer,
          isUser ? styles.userMessage : styles.botMessage,
        ]}
      >
        <Text style={styles.messageText}>{item.content}</Text>
        <Text style={styles.messageTime}>
          {new Date(item.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </Text>
      </View>
    );
  }

  const scrollToBottom = () => {
    if (flatListRef.current && messages.length > 0) {
      flatListRef.current.scrollToEnd({ animated: true })
    }
  }

  useEffect(() => {
    if (sessionId) {
      loadChatSession()
    } else {
      // Add welcome message
      setMessages([
        {
          id: "welcome",
          message_type: "bot",
          content:
            "Xin chào! Tôi là Bot tư vấn của Food Delivery. Tôi có thể giúp bạn:\n\n• Gợi ý món ăn phù hợp\n• Tư vấn thực đơn\n Bạn muốn tôi giúp gì?",
          created_at: new Date().toISOString(),
        },
      ])
    }
  }, [sessionId])

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Bot Tư Vấn </Text>
          <Text style={styles.headerSubtitle}>Bot Tư vấn Món Ăn </Text>
        </View>
        <TouchableOpacity style={styles.historyButton} onPress={handleOpenHistory}>
          <Ionicons name="time-outline" size={18} color={colors.black} />
          <Text style={styles.historyButtonText} >Lịch sử chat</Text>
        </TouchableOpacity>
        <View style={styles.aiIndicator}>
          <Ionicons name="sparkles" size={20} color={colors.white} />
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item, index) => String(item?.id ?? index)}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={scrollToBottom}
      />

      {/* Loading indicator */}
      {loading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Bot đang suy nghĩ...</Text>
        </View>
      )}

      {/* Input */}
      <View style={styles.inputContainer}>
        <TextInput
          value={inputText}
          onChangeText={setInputText}
          placeholder="Nhập tin nhắn..."
          style={styles.textInput}
          multiline
          maxLength={500}
          onSubmitEditing={sendMessage}
        />
        <Button
          mode="contained"
          onPress={sendMessage}
          disabled={!inputText.trim() || loading}
          style={styles.sendButton}
          contentStyle={styles.sendButtonContent}
        >
          <Ionicons name="send" size={20} color={colors.white} />
        </Button>
      </View>

      <Modal visible={historyVisible} animationType="slide" transparent>
        <View style={styles.historyModalOverlay}>
          <View style={styles.historyModalContent}>
            <View style={styles.historyHeader}>
              <Text style={styles.historyTitle}>Lịch sử chat</Text>
              <View style={styles.historyActions}>
                {chatHistory.length > 0 && (
                  <TouchableOpacity onPress={confirmClearHistory} style={styles.clearButton}>
                    <Ionicons name="trash-bin-outline" size={18} color={colors.danger || '#e74c3c'} />
                    <Text style={styles.clearText}>Xóa tất cả</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => setHistoryVisible(false)}>
                  <Ionicons name="close" size={22} color={colors.text} />
                </TouchableOpacity>
              </View>
            </View>
            {historyLoading ? (
              <View style={styles.historyEmpty}>
                <ActivityIndicator size="small" color={colors.primary} />
                <Text style={styles.historyEmptyText}>Đang tải...</Text>
              </View>
            ) : chatHistory.length === 0 ? (
              <View style={styles.historyEmpty}>
                <Text style={styles.historyEmptyText}>Chưa có cuộc trò chuyện nào</Text>
              </View>
            ) : (
              <FlatList
                data={chatHistory}
                keyExtractor={(item) => item.session_id}
                renderItem={({ item }) => (
                  <View style={styles.historyItem}>
                    <TouchableOpacity style={styles.historyInfo} onPress={() => handleSelectSession(item)}>
                      <Text style={styles.historyItemTitle}>{item.title || 'Cuộc trò chuyện'}</Text>
                      <Text style={styles.historyItemMeta}>
                        {(item.message_count ?? item.messages?.length ?? 0)} tin nhắn · {new Date(item.updated_at || item.created_at).toLocaleString('vi-VN')}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmDeleteSession(item)}>
                      <Ionicons name="trash-outline" size={20} color={colors.gray} />
                    </TouchableOpacity>
                  </View>
                )}
                ItemSeparatorComponent={() => <View style={styles.historyDivider} />}
              />
            )}
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  messagesContainer: {
    flex: 1,
    padding: 16,
  },
  messageContainer: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  headerInfo: {
    padding: 16,
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomRightRadius: 4,
  },
  botMessage: {
    alignSelf: 'flex-start',
    backgroundColor: colors.lightGray,
    borderBottomLeftRadius: 4,
  },
  messageText: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 22,
  },
  messageTime: {
    fontSize: 10,
    color: colors.gray,
    marginTop: 4,
    textAlign: 'right',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.lightGray,
    backgroundColor: colors.white,
  },
  input: {
    flex: 1,
    backgroundColor: colors.lightGray,
    borderRadius: 20,
    paddingHorizontal: 16,
    marginRight: 8,
    maxHeight: 100,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.primary,
  },
  historyModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  historyModalContent: {
    maxHeight: '70%',
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.md,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  historyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.text,
  },
  historyActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.lightGray,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: spacing.xs,
  },
  clearText: {
    color: colors.danger || '#e74c3c',
    marginLeft: 4,
    fontWeight: '600',
  },
  historyEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.lg,
  },
  historyEmptyText: {
    color: colors.gray,
    marginTop: spacing.xs,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  historyInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  historyItemTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  historyItemMeta: {
    fontSize: 12,
    color: colors.gray,
    marginTop: 2,
  },
  historyDivider: {
    height: 1,
    backgroundColor: colors.lightGray,
  },
  // Food recommendation styles
  recommendationsContainer: {
    marginVertical: spacing.sm,
    width: '100%',
  },
  recommendationsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  foodCard: {
    width: width * 0.8,
    marginRight: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.white,
    elevation: 2,
  },
  foodImage: {
    width: '100%',
    height: '100%',
  },
  foodInfo: {
    padding: spacing.md,
  },
  foodHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  foodName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.dark,
    flex: 1,
  },
  foodPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: colors.primary,
    marginBottom: 4,
  },
  foodDescription: {
    fontSize: 12,
    color: colors.gray,
    marginBottom: 8,
  },
  restaurantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  restaurantName: {
    fontSize: 12,
    color: colors.darkGray,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.lightPrimary,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  ratingText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: 'bold',
    marginLeft: 2,
  },
  orderButton: {
    marginTop: 8,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  orderButtonLabel: {
    color: colors.white,
    fontWeight: 'bold',
    fontSize: 14,
  },
  recommendationsList: {
    paddingBottom: spacing.sm,
  },
  recommendationCard: {
    width: 200,
    backgroundColor: colors.white,
    borderRadius: 12,
    marginRight: spacing.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    overflow: 'hidden',
  },
  cardImageContainer: {
    position: 'relative',
    height: 120,
    width: '100%',
  },
  recImage: {
    width: '100%',
    height: '100%',
  },
  priceTag: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  priceText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  recInfo: {
    padding: spacing.md,
  },
  recName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.dark,
    marginBottom: 4,
  },
  recDescription: {
    fontSize: 11,
    color: colors.gray,
    marginBottom: 8,
    lineHeight: 14,
    height: 28, // 2 lines
  },
  restaurantInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  icon: {
    marginRight: 4,
  },
  recRestaurant: {
    fontSize: 11,
    color: colors.gray,
    flex: 1,
  },
  recAddress: {
    fontSize: 10,
    color: colors.lightGray,
    flex: 1,
  },
  orderButton: {
    marginTop: 8,
    backgroundColor: colors.primary,
    paddingVertical: 6,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.md,
  },
  loadingText: {
    marginLeft: spacing.sm,
    color: colors.gray,
    fontSize: 12,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    padding: spacing.lg,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.lightGray,
  },
  historyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.25)',
    gap: 6,
  },
  historyButtonText: {
    color: colors.black,
    fontWeight: '500',
    fontSize: 13,
  },
  textInput: {
    flex: 1,
    marginRight: spacing.md,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: 25,
  },
  sendButtonContent: {
    width: 50,
    height: 50,
  },
})
