import React from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../theme';
import { RootStackParamList } from '../types';
import { PlayerProfileView } from '../components/PlayerProfileView';

/** Another player's profile (Instagram + Facebook style). */
export default function PlayerProfileScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, 'PlayerProfile'>>();
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} showsVerticalScrollIndicator={false}>
        <PlayerProfileView userId={route.params.userId} />
      </ScrollView>
      <TouchableOpacity style={[styles.back, { top: insets.top + 8 }]} onPress={() => navigation.goBack()} accessibilityRole="button">
        <Ionicons name="arrow-back" size={20} color={theme.colors.bone} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  back: {
    position: 'absolute', left: 14, width: 38, height: 38, borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
});
