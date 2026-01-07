import React, { useEffect, useRef, useState } from 'react'
import { View, TouchableOpacity, Animated, PanResponder, Dimensions, StyleSheet, Text } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Ionicons } from '@expo/vector-icons'
import { colors, spacing } from '../../theme/theme'

const FAB_SIZE = 56
const MARGIN = 16

export default function FloatingChatFAB({ onChat, onOrders, onHelp }) {
  const window = Dimensions.get('window')
  const initialPos = { x: window.width - FAB_SIZE - MARGIN, y: window.height * 0.6 }
  const pos = useRef(new Animated.ValueXY(initialPos)).current
  const posRef = useRef(initialPos)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem('ai_fab_pos')
        if (saved) {
          const p = JSON.parse(saved)
          if (typeof p.x === 'number' && typeof p.y === 'number') {
            pos.setValue(p)
            posRef.current = p
          }
        }
      } catch {}
    })()
  }, [])

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

  const panResponder = useRef(
    PanResponder.create({
      // Do NOT steal taps; only start pan when moving
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 5 || Math.abs(g.dy) > 5,
      onPanResponderGrant: () => {
        pos.setOffset({ x: posRef.current.x, y: posRef.current.y })
        pos.setValue({ x: 0, y: 0 })
        setOpen(false)
      },
      onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], { useNativeDriver: false }),
      onPanResponderRelease: async (_e, g) => {
        pos.flattenOffset()
        const rawX = posRef.current.x + g.dx
        const rawY = posRef.current.y + g.dy
        const maxX = window.width - FAB_SIZE - MARGIN
        const maxY = window.height - FAB_SIZE - MARGIN - 24
        const snappedX = rawX < window.width / 2 ? MARGIN : maxX
        const x = clamp(snappedX, MARGIN, maxX)
        const y = clamp(rawY, MARGIN, maxY)
        posRef.current = { x, y }
        Animated.spring(pos, { toValue: { x, y }, useNativeDriver: false, bounciness: 6 }).start()
        try { await AsyncStorage.setItem('ai_fab_pos', JSON.stringify({ x, y })) } catch {}
      },
    })
  ).current

  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 999, elevation: 999 }]}>
      {/* Menu */}
      {open && (
        <View style={[styles.menu, { left: posRef.current.x - 4, top: Math.max(MARGIN, posRef.current.y - 8) }]}>
          <TouchableOpacity style={styles.menuItem} onPress={() => { setOpen(false); onChat && onChat() }}>
            <Ionicons name="chatbubble-ellipses" size={18} color={colors.primary} />
            <Text style={styles.menuText}>Chat AI</Text>
          </TouchableOpacity>
          {onOrders && (
            <TouchableOpacity style={styles.menuItem} onPress={() => { setOpen(false); onOrders() }}>
              <Ionicons name="receipt" size={18} color={colors.primary} />
              <Text style={styles.menuText}>Đơn của tôi</Text>
            </TouchableOpacity>
          )}
          {onHelp && (
            <TouchableOpacity style={styles.menuItem} onPress={() => { setOpen(false); onHelp() }}>
              <Ionicons name="help-circle" size={18} color={colors.primary} />
              <Text style={styles.menuText}>Trợ giúp</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* FAB */}
      <Animated.View
        style={[styles.fab, { transform: [{ translateX: pos.x }, { translateY: pos.y }] }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => { setOpen(false); onChat && onChat() }}
          onLongPress={() => setOpen(v => !v)}
          delayLongPress={200}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <View style={styles.fabInner}>
            <Ionicons name={open ? 'close' : 'chatbubble-ellipses'} size={24} color={'#fff'} />
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  fab: { position: 'absolute', left: 0, top: 0, width: FAB_SIZE, height: FAB_SIZE },
  fabInner: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4.5,
  },
  menu: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6 },
  menuText: { marginLeft: 8, color: colors.dark, fontWeight: '600' },
})
