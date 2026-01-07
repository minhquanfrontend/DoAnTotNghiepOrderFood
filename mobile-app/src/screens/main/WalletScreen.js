import React, { useEffect, useState } from 'react'
import { View, FlatList, StyleSheet, Alert } from 'react-native'
import { Card, Title, Paragraph, Button, TextInput, Appbar } from 'react-native-paper'
import { useAuth } from '../../context/AuthContext'
import { walletAPI } from '../../services/api'

export default function WalletScreen() {
  const { user } = useAuth()
  const [balance, setBalance] = useState(0)
  const [transactions, setTransactions] = useState([])
  const [loading, setLoading] = useState(true)
  const [amount, setAmount] = useState('')

  useEffect(() => {
    loadWallet()
  }, [])

  const loadWallet = async () => {
    try {
      const res = await walletAPI.getWallet()
      setBalance(res.balance || 0)
      setTransactions(res.transactions || [])
    } catch (e) {
      Alert.alert('Lỗi', 'Không tải được ví tiền')
    } finally {
      setLoading(false)
    }
  }

  const topUp = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Lỗi', 'Nhập số tiền hợp lệ')
      return
    }
    try {
      await api.post('/wallet/top-up/', { amount: parseFloat(amount) })
      Alert.alert('Thành công', 'Nạp tiền thành công')
      setAmount('')
      loadWallet()
    } catch (e) {
      Alert.alert('Lỗi', 'Nạp tiền thất bại')
    }
  }

  const renderTransaction = ({ item }) => (
    <Card style={styles.card}>
      <Card.Content>
        <Title>{item.type}</Title>
        <Paragraph>{item.amount} VND - {new Date(item.created_at).toLocaleString('vi-VN')}</Paragraph>
      </Card.Content>
    </Card>
  )

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.Content title="Ví tiền" />
      </Appbar.Header>
      <Card style={styles.balanceCard}>
        <Card.Content>
          <Title>Số dư</Title>
          <Paragraph style={styles.balance}>{balance.toLocaleString('vi-VN')} VND</Paragraph>
        </Card.Content>
      </Card>
      <TextInput
        label="Số tiền nạp"
        value={amount}
        onChangeText={setAmount}
        keyboardType="numeric"
        style={styles.input}
      />
      <Button mode="contained" onPress={topUp} style={styles.button}>
        Nạp tiền
      </Button>
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderTransaction}
        refreshing={loading}
        onRefresh={loadWallet}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  balanceCard: { margin: 16 },
  balance: { fontSize: 24, fontWeight: 'bold' },
  input: { margin: 16 },
  button: { margin: 16 },
  card: { margin: 8 },
})
