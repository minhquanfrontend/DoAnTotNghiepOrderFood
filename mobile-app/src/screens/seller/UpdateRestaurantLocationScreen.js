import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Alert, Dimensions } from 'react-native';
import { TextInput, Button, Appbar, Text } from 'react-native-paper';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Location from 'expo-location';
import { restaurantAPI } from '../../services/api';

const { width, height } = Dimensions.get('window');
const ASPECT_RATIO = width / height;
const LATITUDE_DELTA = 0.0922;
const LONGITUDE_DELTA = LATITUDE_DELTA * ASPECT_RATIO;

export default function UpdateRestaurantLocationScreen({ navigation }) {
  const [address, setAddress] = useState('');
  const [location, setLocation] = useState(null); // { latitude, longitude }
  const [loading, setLoading] = useState(false);
  const mapRef = useRef(null);

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
        // Animate map to the restaurant's location
        mapRef.current?.animateToRegion({
          ...initialLocation,
          latitudeDelta: LATITUDE_DELTA,
          longitudeDelta: LONGITUDE_DELTA,
        });
      }
    } catch (e) {
      Alert.alert('Lỗi', 'Không tải được thông tin nhà hàng');
    } finally {
      setLoading(false);
    }
  };

  const onMarkerDragEnd = async (e) => {
    const newLocation = e.nativeEvent.coordinate;
    setLocation(newLocation);
    try {
      const addresses = await Location.reverseGeocodeAsync(newLocation);
      if (addresses.length > 0) {
        const first = addresses[0];
        const formattedAddress = `${first.street || ''}, ${first.subregion || ''}, ${first.region || ''}, ${first.country || ''}`.replace(/^, |, $/g, '');
        setAddress(formattedAddress);
      }
    } catch (error) {
      console.error('Reverse geocoding failed:', error);
    }
  };

  const handleUpdateLocation = async () => {
    if (!location) {
      Alert.alert('Lỗi', 'Vui lòng chọn một vị trí trên bản đồ.');
      return;
    }
    setLoading(true);
    try {
      const updateData = {
        address,
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
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Cập nhật địa điểm nhà hàng" />
      </Appbar.Header>
      <View style={styles.content}>
        <Text style={styles.instructions}>Kéo thả ghim trên bản đồ để chọn vị trí chính xác.</Text>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: 10.762622, // Default to HCMC
            longitude: 106.660172,
            latitudeDelta: LATITUDE_DELTA,
            longitudeDelta: LONGITUDE_DELTA,
          }}
          provider={PROVIDER_DEFAULT}
          mapType="standard"
        >
          {location && (
            <Marker
              coordinate={location}
              draggable
              onDragEnd={onMarkerDragEnd}
              title="Vị trí nhà hàng"
            />
          )}
        </MapView>
        <TextInput
          label="Địa chỉ nhà hàng"
          value={address}
          onChangeText={setAddress}
          style={styles.input}
          multiline
        />
        <Button mode="contained" onPress={handleUpdateLocation} loading={loading} style={styles.button}>
          Lưu Vị Trí
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { flex: 1, padding: 16 },
  instructions: { marginBottom: 10, textAlign: 'center', color: 'gray' },
  map: {
    width: '100%',
    height: 300,
    marginBottom: 16,
    borderRadius: 8,
  },
  input: { marginBottom: 16 },
  button: { marginTop: 16 },
});
