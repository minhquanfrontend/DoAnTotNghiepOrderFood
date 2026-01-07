import React from "react"
import { View, StyleSheet, Alert, TouchableOpacity, Image } from "react-native"
import { Avatar, Text, List, Button } from "react-native-paper"
import { useAuth } from "../../context/AuthContext"

export default function ProfileScreen({ navigation }) {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    Alert.alert(
      'Xác nhận',
      'Bạn có chắc muốn đăng xuất không?',
      [
        { text: 'Hủy', style: 'cancel' },
        { text: 'Đăng xuất', style: 'destructive', onPress: async () => {
            await logout();
          }
        }
      ]
    );
  };

  if (!user) {
    return (
      <View style={[styles.container, styles.guestContainer]}>
        <Avatar.Icon size={80} icon="account-circle-outline" style={{ backgroundColor: '#e0e0e0' }} />
        <Text style={styles.guestTitle}>Chào mừng bạn!</Text>
        <Text style={styles.guestSubtitle}>Đăng nhập hoặc đăng ký để trải nghiệm đầy đủ tính năng.</Text>
        <Button
          mode="contained"
          style={styles.authButton}
          onPress={() => navigation.navigate('Login')}
        >
          Đăng nhập
        </Button>
        <Button
          mode="outlined"
          style={styles.authButton}
          onPress={() => navigation.navigate('Register')}
        >
          Đăng ký
        </Button>
        
        {/* Guest order tracking */}
        <View style={styles.guestDivider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>hoặc</Text>
          <View style={styles.dividerLine} />
        </View>
        
        <Button
          mode="text"
          icon="package-variant"
          style={styles.trackButton}
          onPress={() => navigation.navigate('TrackGuestOrder')}
        >
          Tra cứu đơn hàng bằng mã
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.navigate('EditProfile')}>
          {user?.avatar ? (
            <Image source={{ uri: user.avatar }} style={{ width: 80, height: 80, borderRadius: 40 }} />
          ) : (
            <Avatar.Text
              size={80}
              label={user?.username?.[0]?.toUpperCase() || "U"}
            />
          )}
        </TouchableOpacity>
        <Text style={styles.name}>{user?.username || "Người dùng"}</Text>
        <Text style={styles.email}>{user?.email || "Chưa có email"}</Text>
      </View>

      <List.Section>
        <List.Item
          title="Họ và tên"
          description={`${user?.first_name || ""} ${user?.last_name || ""}`}
          left={(props) => <List.Icon {...props} icon="account" />}
        />
        <List.Item
          title="Số điện thoại"
          description={user?.phone_number || "Chưa có"}
          left={(props) => <List.Icon {...props} icon="phone" />}
        />
        <List.Item
          title="Địa chỉ"
          description={user?.address || "Chưa có"}
          left={(props) => <List.Icon {...props} icon="home" />}
        />
        <List.Item
          title="Ngày sinh"
          description={user?.date_of_birth ? String(user.date_of_birth) : 'Chưa có'}
          left={(props) => <List.Icon {...props} icon="cake" />}
        />
      </List.Section>
      <Button mode="outlined" style={{ marginTop: 10 }} onPress={() => navigation.navigate('EditProfile')}>
        Chỉnh sửa hồ sơ
      </Button>

      {user?.user_type === 'seller' && (
        <View style={{ marginTop: 12 }}>
          <Button
            mode="outlined"
            onPress={() => navigation.navigate('MainTabs', { screen: 'ManageFoods' })}
          >
            Quản lý món
          </Button>
          <View style={{ height: 8 }} />
          <Button mode="outlined" onPress={() => navigation.navigate('SellerPosts')}>Bài đăng bán</Button>
        </View>
      )}
      <Button
        mode="outlined"
        style={{ marginTop: 10 }}
        onPress={() => navigation.navigate("RequestRole")}
      >
        Đăng ký làm Shipper / Seller
      </Button>

      {/* Admin Dashboard - Only show for staff users */}
      {user?.is_staff && (
        <Button
          mode="contained"
          style={{ marginTop: 10, backgroundColor: '#9c27b0' }}
          onPress={() => navigation.navigate("AdminDashboard")}
          icon="shield-crown"
        >
          🏢 Admin Dashboard
        </Button>
      )}

      <Button
        mode="contained"
        style={styles.logoutBtn}
        onPress={handleLogout}
        icon="logout"
      >
        Đăng xuất
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 20 },
  guestContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 8,
  },
  guestSubtitle: {
    fontSize: 16,
    color: 'gray',
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  authButton: {
    width: '80%',
    marginVertical: 8,
  },
  header: { alignItems: "center", marginBottom: 20 },
  name: { fontSize: 20, fontWeight: "bold", marginTop: 10 },
  email: { fontSize: 14, color: "gray" },
  logoutBtn: { marginTop: 20, padding: 5, borderRadius: 10 },
  guestDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '80%',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ddd',
  },
  dividerText: {
    marginHorizontal: 12,
    color: '#888',
    fontSize: 14,
  },
  trackButton: {
    marginTop: 8,
  },
})
