import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert,
  ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import type { Id } from '../../../convex/_generated/dataModel';

interface Props {
  companyId: string;
  onClose: () => void;
}

export default function CompanyQRScanner({ companyId, onClose }: Props) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedCode, setScannedCode] = useState<string | null>(null);
  const [scanning, setScanning] = useState(true);

  const booking = useQuery(
    api.bookings.getByCode,
    scannedCode ? { bookingCode: scannedCode } : 'skip',
  );
  const completeBooking = useMutation(api.bookings.complete);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (!scanning) return;
    setScanning(false);

    try {
      // The QR contains JSON with a "code" field
      const parsed = JSON.parse(data);
      if (parsed.code) {
        setScannedCode(parsed.code);
      } else {
        // Maybe it's just the booking code string directly
        setScannedCode(data.trim());
      }
    } catch {
      // Not JSON — treat as raw booking code
      setScannedCode(data.trim());
    }
  };

  const handleValidate = async () => {
    if (!booking) return;
    // Check that this booking belongs to the company
    if (booking.room?.companyId && String(booking.room.companyId) !== String(companyId)) {
      Alert.alert(t('scanner.error'), t('scanner.notYourBooking'));
      return;
    }
    if (booking.status === 'completed') {
      Alert.alert(t('scanner.alreadyUsed'), t('scanner.alreadyUsedMsg'));
      return;
    }
    if (booking.status === 'cancelled') {
      Alert.alert(t('scanner.cancelled'), t('scanner.cancelledMsg'));
      return;
    }
    try {
      await completeBooking({ id: booking._id as Id<"bookings"> });
      Alert.alert(t('scanner.validated'), t('scanner.validatedMsg'), [
        { text: t('ok'), onPress: handleReset },
      ]);
    } catch {
      Alert.alert(t('error'), t('scanner.validateFailed'));
    }
  };

  const handleReset = () => {
    setScannedCode(null);
    setScanning(true);
  };

  // Permission not yet determined
  if (!permission) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={theme.colors.redPrimary} />
      </View>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.permCard}>
          <Ionicons name="camera-outline" size={56} color={theme.colors.textMuted} />
          <Text style={styles.permTitle}>{t('scanner.cameraRequired')}</Text>
          <Text style={styles.permText}>{t('scanner.cameraRequiredMsg')}</Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnText}>{t('scanner.grantAccess')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>{t('scanner.close')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const getStatusColor = (status?: string) => {
    if (status === 'upcoming') return '#4CAF50';
    if (status === 'completed') return theme.colors.textMuted;
    if (status === 'cancelled') return '#F44336';
    return theme.colors.textMuted;
  };

  const getStatusLabel = (status?: string) => {
    if (status === 'upcoming') return t('scanner.statusValid');
    if (status === 'completed') return t('scanner.statusUsed');
    if (status === 'cancelled') return t('scanner.statusCancelled');
    return status || '';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={onClose}>
          <Ionicons name="arrow-back" size={20} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('scanner.title')}</Text>
      </View>

      {/* Camera / Scanner */}
      {scanning && !scannedCode && (
        <View style={styles.cameraWrap}>
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleBarCodeScanned}
          />
          {/* Scan overlay */}
          <View style={styles.overlay}>
            <View style={styles.scanFrame}>
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <Text style={styles.scanHint}>{t('scanner.scanHint')}</Text>
          </View>
        </View>
      )}

      {/* Result */}
      {scannedCode && (
        <View style={styles.resultWrap}>
          {booking === undefined ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={theme.colors.redPrimary} />
              <Text style={styles.loadingText}>{t('scanner.lookingUp')}</Text>
            </View>
          ) : booking === null ? (
            <View style={styles.resultCard}>
              <View style={[styles.resultIcon, { backgroundColor: 'rgba(244,67,54,0.15)' }]}>
                <Ionicons name="close-circle" size={48} color="#F44336" />
              </View>
              <Text style={styles.resultTitle}>{t('scanner.notFound')}</Text>
              <Text style={styles.resultSubtitle}>{t('scanner.notFoundMsg')}</Text>
              <Text style={styles.scannedCodeText}>{scannedCode}</Text>
              <TouchableOpacity style={styles.scanAgainBtn} onPress={handleReset}>
                <Ionicons name="scan-outline" size={18} color="#fff" />
                <Text style={styles.scanAgainText}>{t('scanner.scanAgain')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.resultCard}>
              {/* Status icon */}
              <View style={[styles.resultIcon, {
                backgroundColor: booking.status === 'upcoming'
                  ? 'rgba(76,175,80,0.15)'
                  : booking.status === 'cancelled'
                  ? 'rgba(244,67,54,0.15)'
                  : 'rgba(100,100,100,0.15)',
              }]}>
                <Ionicons
                  name={booking.status === 'upcoming' ? 'checkmark-circle' : booking.status === 'cancelled' ? 'close-circle' : 'checkmark-done-circle'}
                  size={48}
                  color={getStatusColor(booking.status)}
                />
              </View>

              {/* Status badge */}
              <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) + '25' }]}>
                <Text style={[styles.statusBadgeText, { color: getStatusColor(booking.status) }]}>
                  {getStatusLabel(booking.status)}
                </Text>
              </View>

              {/* Booking info */}
              <Text style={styles.resultCode}>{booking.bookingCode}</Text>
              <Text style={styles.resultRoom}>{booking.room?.title || ''}</Text>

              <View style={styles.resultDetails}>
                <View style={styles.resultDetail}>
                  <Ionicons name="calendar-outline" size={16} color={theme.colors.textMuted} />
                  <Text style={styles.resultDetailText}>{booking.date}</Text>
                </View>
                <View style={styles.resultDetail}>
                  <Ionicons name="time-outline" size={16} color={theme.colors.textMuted} />
                  <Text style={styles.resultDetailText}>{booking.time}</Text>
                </View>
                <View style={styles.resultDetail}>
                  <Ionicons name="people-outline" size={16} color={theme.colors.textMuted} />
                  <Text style={styles.resultDetailText}>{booking.players} {t('players')}</Text>
                </View>
                {booking.playerName && (
                  <View style={styles.resultDetail}>
                    <Ionicons name="person-outline" size={16} color={theme.colors.textMuted} />
                    <Text style={styles.resultDetailText}>{booking.playerName}</Text>
                  </View>
                )}
                {booking.total > 0 && (
                  <View style={styles.resultDetail}>
                    <Ionicons name="cash-outline" size={16} color={theme.colors.textMuted} />
                    <Text style={styles.resultDetailText}>€{booking.total}</Text>
                  </View>
                )}
                {booking.paymentStatus && (
                  <View style={styles.resultDetail}>
                    <Ionicons name="card-outline" size={16} color={theme.colors.textMuted} />
                    <Text style={styles.resultDetailText}>
                      {booking.paymentStatus === 'paid' ? t('dashboard.paid')
                        : booking.paymentStatus === 'deposit' ? t('dashboard.deposit')
                        : t('dashboard.unpaid')}
                    </Text>
                  </View>
                )}
              </View>

              {/* Action buttons */}
              <View style={styles.resultActions}>
                {booking.status === 'upcoming' && (
                  <TouchableOpacity style={styles.validateBtn} onPress={handleValidate}>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.validateBtnText}>{t('scanner.validate')}</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.scanAgainBtn} onPress={handleReset}>
                  <Ionicons name="scan-outline" size={18} color="#fff" />
                  <Text style={styles.scanAgainText}>{t('scanner.scanAgain')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: theme.colors.bgPrimary,
    justifyContent: 'center', alignItems: 'center',
  },
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16,
    backgroundColor: 'rgba(26,13,13,0.85)',
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.colors.glass, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#fff' },

  // Camera
  cameraWrap: { flex: 1, width: '100%' },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center', alignItems: 'center',
  },
  scanFrame: {
    width: 250, height: 250,
    borderRadius: 20,
  },
  corner: {
    position: 'absolute', width: 40, height: 40,
    borderColor: theme.colors.redPrimary, borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderBottomWidth: 0, borderRightWidth: 0, borderTopLeftRadius: 20 },
  cornerTR: { top: 0, right: 0, borderBottomWidth: 0, borderLeftWidth: 0, borderTopRightRadius: 20 },
  cornerBL: { bottom: 0, left: 0, borderTopWidth: 0, borderRightWidth: 0, borderBottomLeftRadius: 20 },
  cornerBR: { bottom: 0, right: 0, borderTopWidth: 0, borderLeftWidth: 0, borderBottomRightRadius: 20 },
  scanHint: {
    marginTop: 280, fontSize: 15, fontWeight: '600', color: '#fff',
    textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6,
  },

  // Permission
  permCard: {
    alignItems: 'center', padding: 40, marginHorizontal: 30,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder, gap: 12,
  },
  permTitle: { fontSize: 20, fontWeight: '800', color: '#fff', textAlign: 'center' },
  permText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center' },
  permBtn: {
    paddingVertical: 14, paddingHorizontal: 40, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.redPrimary, marginTop: 10,
    ...theme.shadow.red,
  },
  permBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  closeBtn: { marginTop: 8 },
  closeBtnText: { fontSize: 14, color: theme.colors.textMuted },

  // Result
  resultWrap: {
    flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center',
    paddingTop: 100, paddingHorizontal: 20,
  },
  loadingWrap: { alignItems: 'center', gap: 14 },
  loadingText: { fontSize: 15, color: theme.colors.textSecondary },
  resultCard: {
    width: '100%', alignItems: 'center', padding: 28,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  resultIcon: {
    width: 80, height: 80, borderRadius: 40,
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  statusBadge: {
    paddingVertical: 5, paddingHorizontal: 16, borderRadius: 20, marginBottom: 16,
  },
  statusBadgeText: { fontSize: 13, fontWeight: '800' },
  resultTitle: { fontSize: 20, fontWeight: '800', color: '#fff', marginBottom: 6 },
  resultSubtitle: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginBottom: 12 },
  scannedCodeText: {
    fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary,
    backgroundColor: theme.colors.glass, paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: theme.radius.md, overflow: 'hidden', marginBottom: 16,
  },
  resultCode: {
    fontSize: 22, fontWeight: '800', color: theme.colors.redPrimary,
    letterSpacing: 2, marginBottom: 4,
  },
  resultRoom: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 16, textAlign: 'center' },
  resultDetails: {
    width: '100%', gap: 10, marginBottom: 20,
    paddingTop: 16, borderTopWidth: 1, borderTopColor: theme.colors.border,
  },
  resultDetail: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  resultDetailText: { fontSize: 14, color: theme.colors.textSecondary },

  // Actions
  resultActions: { width: '100%', gap: 10 },
  validateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 16, borderRadius: theme.radius.full,
    backgroundColor: '#4CAF50',
  },
  validateBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  scanAgainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: theme.radius.full,
    backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
  scanAgainText: { fontSize: 15, fontWeight: '600', color: '#fff' },
});
