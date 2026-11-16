import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { theme } from '../../theme';
import { RootStackParamList } from '../../types';
import { useTranslation } from '../../i18n';
import { euro, groupBySeller, useCart } from '../../merchCart';
import { ScreenHeader, shopStyles } from '../../components/shop';
import { PrimaryButton } from '../../components/ui';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function CartScreen() {
  const navigation = useNavigation<Nav>();
  const { t } = useTranslation();
  const { lines, setQty } = useCart();
  const groups = groupBySeller(lines);

  return (
    <View style={styles.container}>
      <ScreenHeader title={t('shop.cart')} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60, gap: 16 }}>
        {groups.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60, gap: 14 }}>
            <Ionicons name="bag-handle-outline" size={46} color={theme.colors.textMuted} />
            <Text style={shopStyles.muted}>{t('shop.cartEmpty')}</Text>
            <PrimaryButton small label={t('shop.browse')} onPress={() => navigation.navigate('Shop', {})} />
          </View>
        ) : (
          <>
            {groups.length > 1 && <Text style={shopStyles.muted}>{t('shop.splitNote')}</Text>}
            {groups.map((g) => {
              const sub = g.lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);
              return (
                <View key={g.sellerKey} style={shopStyles.card}>
                  <Text style={shopStyles.sectionTitle}>{g.sellerName}</Text>
                  {g.lines.map((l) => (
                    <View key={l.productId + l.variantId} style={styles.line}>
                      {l.image ? <Image source={{ uri: l.image }} style={styles.img} /> : <View style={styles.img} />}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.lineTitle} numberOfLines={1}>
                          {l.title}
                        </Text>
                        <Text style={shopStyles.muted}>{l.variantLabel}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(l.productId, l.variantId, l.quantity - 1)}>
                            <Ionicons name="remove" size={14} color={theme.colors.bone} />
                          </TouchableOpacity>
                          <Text style={{ color: theme.colors.bone, width: 22, textAlign: 'center' }}>{l.quantity}</Text>
                          <TouchableOpacity style={styles.qtyBtn} onPress={() => setQty(l.productId, l.variantId, Math.min(10, l.quantity + 1))}>
                            <Ionicons name="add" size={14} color={theme.colors.bone} />
                          </TouchableOpacity>
                          <TouchableOpacity style={{ marginLeft: 8 }} onPress={() => setQty(l.productId, l.variantId, 0)}>
                            <Ionicons name="trash-outline" size={16} color={theme.colors.textMuted} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      <Text style={styles.lineTitle}>{euro(l.unitPriceCents * l.quantity)}</Text>
                    </View>
                  ))}
                  <View style={[shopStyles.row, { marginTop: 12 }]}>
                    <Text style={shopStyles.muted}>
                      {t('shop.subtotal')}: <Text style={{ color: theme.colors.bone, fontWeight: '700' }}>{euro(sub)}</Text>
                    </Text>
                    <PrimaryButton small label={t('shop.checkout')} onPress={() => navigation.navigate('MerchCheckout', { sellerKey: g.sellerKey })} />
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  img: { width: 56, height: 56, borderRadius: theme.radius.md, backgroundColor: 'rgba(0,0,0,0.4)' },
  lineTitle: { color: theme.colors.bone, fontSize: 14, fontWeight: '600' },
  qtyBtn: { padding: 4, borderWidth: 1, borderColor: theme.colors.border, borderRadius: theme.radius.sm },
});
