import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Alert, TouchableOpacity, TextInput, FlatList, ActivityIndicator } from 'react-native';
import { Button, Appbar, Text } from 'react-native-paper';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { restaurantAPI } from '../../services/api';
import { theme } from '../../theme/theme';

export default function UpdateRestaurantLocationScreen({ navigation }) {
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState(null); // { latitude, longitude }
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [region, setRegion] = useState({
    latitude: 10.762622,
    longitude: 106.660172,
    latitudeDelta: 0.02,
    longitudeDelta: 0.02,
  });
  const mapRef = useRef(null);

  // Giới hạn trong lãnh thổ Việt Nam
  const VN_BOUNDS = { minLat: 8.18, maxLat: 23.39, minLng: 102.14, maxLng: 109.47 };
  const clampToVN = (lat, lng) => ({
    latitude: Math.min(Math.max(lat, VN_BOUNDS.minLat), VN_BOUNDS.maxLat),
    longitude: Math.min(Math.max(lng, VN_BOUNDS.minLng), VN_BOUNDS.maxLng),
  });

  useEffect(() => {
    loadCurrentRestaurantLocation();
  }, []);

  const loadCurrentRestaurantLocation = async () => {
    setLoading(true);
    try {
      const restaurant = await restaurantAPI.getMyRestaurant();
      setAddress(restaurant.address || '');
      if (restaurant.latitude && restaurant.longitude) {
        const initialLocation = {
          latitude: parseFloat(restaurant.latitude),
          longitude: parseFloat(restaurant.longitude),
        };
        setLocation(initialLocation);
        const newRegion = {
          ...initialLocation,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        };
        setRegion(newRegion);
        setTimeout(() => {
          mapRef.current?.animateToRegion(newRegion, 600);
        }, 200);
      } else {
        // Nếu chưa có tọa độ, lấy vị trí hiện tại
        await useCurrentLocation();
      }
    } catch (e) {
      Alert.alert('Lỗi', 'Không tải được thông tin nhà hàng');
    } finally {
      setLoading(false);
    }
  };

  const reverseGeocode = async (lat, lng) => {
    try {
      const results = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (results && results.length) {
        const r = results[0];
        const composed = [r.name, r.street, r.subregion, r.region, r.country].filter(Boolean).join(', ');
        setAddress(composed || `${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      }
    } catch {
      setAddress(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    }
  };

  const onMapPress = (e) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const c = clampToVN(latitude, longitude);
    setLocation({ latitude: c.latitude, longitude: c.longitude });
    reverseGeocode(c.latitude, c.longitude);
  };

  const onRegionChangeComplete = (reg) => {
    const c = clampToVN(reg.latitude, reg.longitude);
    if (c.latitude !== reg.latitude || c.longitude !== reg.longitude) {
      const fixed = { ...reg, latitude: c.latitude, longitude: c.longitude };
      setRegion(fixed);
      try { mapRef.current?.animateToRegion(fixed, 0); } catch {}
    } else {
      setRegion(reg);
    }
  };

  // Tìm kiếm địa chỉ với Nominatim
  useEffect(() => {
    const h = setTimeout(async () => {
      const q = (search || '').trim();
      if (!q) { setSuggestions([]); return; }
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&countrycodes=vn&q=${encodeURIComponent(q)}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'food-delivery-app/1.0' } });
        const data = await res.json();
        const items = Array.isArray(data) ? data.map(d => ({
          key: String(d.place_id),
          title: d.display_name,
          lat: parseFloat(d.lat),
          lng: parseFloat(d.lon),
        })) : [];
        setSuggestions(items);
      } catch { setSuggestions([]); }
    }, 350);
    return () => clearTimeout(h);
  }, [search]);

  const pickSuggestion = (item) => {
    const c = clampToVN(item.lat, item.lng);
    const nextRegion = { latitude: c.latitude, longitude: c.longitude, latitudeDelta: 0.01, longitudeDelta: 0.01 };
    setRegion(nextRegion);
    setLocation({ latitude: c.latitude, longitude: c.longitude });
    setAddress(item.title);
    setSearch('');
    setSuggestions([]);
    try { mapRef.current?.animateToRegion(nextRegion, 600); } catch {}
  };

  const useCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Lỗi', 'Cần cấp quyền truy cập vị trí');
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const c = clampToVN(loc.coords.latitude, loc.coords.longitude);
      const nextRegion = { latitude: c.latitude, longitude: c.longitude, latitudeDelta: 0.02, longitudeDelta: 0.02 };
      setRegion(nextRegion);
      setLocation({ latitude: c.latitude, longitude: c.longitude });
      reverseGeocode(c.latitude, c.longitude);
      try { mapRef.current?.animateToRegion(nextRegion, 600); } catch {}
    } catch {
      Alert.alert('Lỗi', 'Không lấy được vị trí hiện tại');
    }
  };

  const handleUpdateLocation = async () => {
    if (!location) {
      Alert.alert('Lỗi', 'Vui lòng chọn một vị trí trên bản đồ.');
      return;
    }
    if (!address.trim()) {
      Alert.alert('Lỗi', 'Vui lòng nhập địa chỉ nhà hàng.');
      return;
    }
    setSaving(true);
    try {
      const updateData = {
        address: address.trim(),
        latitude: location.latitude,
        longitude: location.longitude,
      };

      await restaurantAPI.updateMyRestaurant(updateData);
      Alert.alert('Thành công', 'Cập nhật địa điểm thành công', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (e) {
      Alert.alert('Lỗi', 'Cập nhật thất bại');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Cập nhật địa điểm nhà hàng" />
        </Appbar.Header>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={{ marginTop: 10 }}>Đang tải thông tin...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Cập nhật địa điểm nhà hàng" />
      </Appbar.Header>
      
      <View style={styles.content}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={region}
          onRegionChangeComplete={onRegionChangeComplete}
          onPress={onMapPress}
          provider={PROVIDER_DEFAULT}
          mapType="standard"
        >
          {location && (
            <Marker
              coordinate={location}
              draggable
              onDragEnd={(e) => {
                const { latitude, longitude } = e.nativeEvent.coordinate;
                const c = clampToVN(latitude, longitude);
                setLocation({ latitude: c.latitude, longitude: c.longitude });
                reverseGeocode(c.latitude, c.longitude);
              }}
              title="Vị trí nhà hàng"
              description={address}
            >
              <View style={styles.markerContainer}>
                <Ionicons name="restaurant" size={24} color="#fff" />
              </View>
            </Marker>
          )}
        </MapView>

        {/* Thanh tìm kiếm */}
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm địa chỉ nhà hàng (chỉ trong Việt Nam)"
            value={search}
            onChangeText={setSearch}
          />
          <TouchableOpacity style={styles.currentBtn} onPress={useCurrentLocation}>
            <Ionicons name="locate" size={18} color="#fff" />
            <Text style={{ color: '#fff', marginLeft: 6 }}>Vị trí hiện tại</Text>
          </TouchableOpacity>
        </View>

        {/* Gợi ý địa chỉ */}
        {suggestions.length > 0 && (
          <View style={styles.suggestBox}>
            <FlatList
              data={suggestions}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.suggestItem} onPress={() => pickSuggestion(item)}>
                  <Ionicons name="location" size={16} color={theme.colors.primary} />
                  <Text style={styles.suggestText} numberOfLines={2}>{item.title}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}

        {/* Thanh địa chỉ và nút lưu */}
        <View style={styles.bottomBar}>
          <View style={styles.addressRow}>
            <Ionicons name="location" size={20} color={theme.colors.primary} />
            <Text style={styles.addressText} numberOfLines={2}>
              {address || 'Chạm vào bản đồ để chọn vị trí'}
            </Text>
          </View>
          <Button 
            mode="contained" 
            onPress={handleUpdateLocation} 
            loading={saving} 
            style={styles.saveButton}
            labelStyle={{ fontWeight: 'bold' }}
          >
            Lưu Vị Trí Nhà Hàng
          </Button>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  map: { flex: 1 },
  searchBar: {
    position: 'absolute',
    top: 16,
    left: 12,
    right: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 8,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#fff',
  },
  currentBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  suggestBox: {
    position: 'absolute',
    top: 100,
    left: 12,
    right: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    maxHeight: 180,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  suggestItem: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestText: { marginLeft: 8, flex: 1, fontSize: 14 },
  bottomBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  addressText: { flex: 1, marginLeft: 8, fontSize: 14, color: '#333' },
  saveButton: { borderRadius: 8 },
  markerContainer: {
    backgroundColor: theme.colors.primary,
    padding: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
  },
});
