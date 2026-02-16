import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { useTranslation } from '../i18n';

export default function ScanScreen() {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t('scan.title')}</Text>
      </View>

      {/* Scanner Area */}
      <View style={styles.scannerArea}>
        <View style={styles.scanFrame}>
          {/* Corner brackets */}
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />

          <Ionicons name="qr-code-outline" size={80} color="rgba(255,30,30,0.3)" />
          <Text style={styles.scanHint}>{t('scan.hint')}</Text>
        </View>
      </View>

      {/* Instructions */}
      <View style={styles.instructions}>
        <View style={styles.instructionItem}>
          <View style={styles.instructionIcon}>
            <Ionicons name="ticket-outline" size={22} color={theme.colors.redPrimary} />
          </View>
          <View style={styles.instructionText}>
            <Text style={styles.instructionTitle}>{t('scan.ticket')}</Text>
            <Text style={styles.instructionDesc}>{t('scan.ticketDesc')}</Text>
          </View>
        </View>

        <View style={styles.instructionItem}>
          <View style={styles.instructionIcon}>
            <Ionicons name="game-controller-outline" size={22} color={theme.colors.redPrimary} />
          </View>
          <View style={styles.instructionText}>
            <Text style={styles.instructionTitle}>{t('scan.clues')}</Text>
            <Text style={styles.instructionDesc}>{t('scan.cluesDesc')}</Text>
          </View>
        </View>

        <View style={styles.instructionItem}>
          <View style={styles.instructionIcon}>
            <Ionicons name="gift-outline" size={22} color={theme.colors.redPrimary} />
          </View>
          <View style={styles.instructionText}>
            <Text style={styles.instructionTitle}>{t('scan.promos')}</Text>
            <Text style={styles.instructionDesc}>{t('scan.promosDesc')}</Text>
          </View>
        </View>
      </View>

      {/* Scan Button */}
      <TouchableOpacity
        style={styles.scanBtn}
        activeOpacity={0.8}
        onPress={() => Alert.alert(t('scan.cameraRequired'), t('scan.cameraMessage'))}
      >
        <Ionicons name="camera-outline" size={22} color="#fff" />
        <Text style={styles.scanBtnText}>{t('scan.openCamera')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: {
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    alignItems: 'center',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#fff' },

  scannerArea: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 30,
  },
  scanFrame: {
    width: 220, height: 220,
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  corner: {
    position: 'absolute', width: 40, height: 40,
    borderColor: theme.colors.redPrimary,
  },
  topLeft: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
  topRight: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },

  scanHint: {
    marginTop: 16, fontSize: 13, color: theme.colors.textMuted, textAlign: 'center',
  },

  instructions: {
    paddingHorizontal: 20, gap: 14, marginBottom: 30,
  },
  instructionItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 16, borderRadius: 16,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  instructionIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: theme.colors.redSubtle,
    alignItems: 'center', justifyContent: 'center',
  },
  instructionText: { flex: 1, gap: 2 },
  instructionTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  instructionDesc: { fontSize: 12, color: theme.colors.textSecondary },

  scanBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    marginHorizontal: 20, paddingVertical: 16,
    borderRadius: 30,
    backgroundColor: theme.colors.redPrimary,
    ...theme.shadow.red,
  },
  scanBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});
