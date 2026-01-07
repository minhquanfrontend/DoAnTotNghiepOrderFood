import React, { useEffect, useMemo, useState } from "react"
import { View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity, Image } from "react-native"
import { restaurantAPI } from "../../services/api"
import { colors, spacing } from "../../theme/theme"

export default function SearchScreen({ route, navigation }) {
  const [query, setQuery] = useState(route?.params?.query || "")
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (route?.params?.query) {
      setQuery(route.params.query)
    }
  }, [route?.params?.query])

  useEffect(() => {
    // initial search if query provided
    if (route?.params?.query) {
      doSearch(route.params.query)
    }
  }, [])

  const doSearch = async (text) => {
    const q = (text || "").trim()
    setQuery(text)
    if (!q) { setResults([]); return }
    setLoading(true)
    try {
      const res = await restaurantAPI.searchFoods(q)
      const list = res.results || res
      setResults(Array.isArray(list) ? list : [])
    } catch (e) {
      try {
        // Fallback: fetch foods and filter client-side if search endpoint missing
        const all = await restaurantAPI.getFoods()
        const list = (all.results || all || []).filter((f) => {
          const name = (f?.name || '').toLowerCase()
          return name.includes(q.toLowerCase())
        })
        setResults(list)
      } catch (e2) {
        setResults([])
      }
    } finally {
      setLoading(false)
    }
  }

  // simple debounce
  const debouncedDoSearch = useMemo(() => {
    let t
    return (text) => {
      if (t) clearTimeout(t)
      t = setTimeout(() => doSearch(text), 300)
    }
  }, [])

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('FoodDetail', { foodId: item.id })}>
      <Image source={{ uri: item.image }} style={styles.thumb} />
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{item.name}</Text>
        {!!item.restaurant_name && <Text style={styles.restaurant}>{item.restaurant_name}</Text>}
        <Text style={styles.price}>{Number(item.current_price ?? item.price ?? 0).toLocaleString()}₫</Text>
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tìm kiếm món ăn</Text>
      <TextInput
        style={styles.input}
        placeholder="Nhập tên món ăn..."
        value={query}
        onChangeText={debouncedDoSearch}
        defaultValue={route?.params?.query || ''}
      />
      <FlatList
        data={results}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        ListEmptyComponent={!loading ? <Text>Không tìm thấy kết quả</Text> : null}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.md, backgroundColor: colors.white },
  title: { fontSize: 20, marginBottom: spacing.md, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    gap: 10,
  },
  thumb: { width: 64, height: 64, borderRadius: 8, marginRight: 10, backgroundColor: '#f2f2f2' },
  name: { fontSize: 16, fontWeight: '600', color: colors.dark },
  restaurant: { fontSize: 12, color: colors.gray, marginTop: 2 },
  price: { fontSize: 14, fontWeight: '700', color: colors.primary, marginTop: 4 },
})
