import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';
import { useTranslation } from '../i18n';
import { CompanyLogo } from './CompanyLogo';
import { jobPlace, type PublicJob } from '../jobs';

const LONG = 280;

/** One job ad, as players see it on the Jobs screen and on a company profile (same as escape-web JobCard). */
export function JobCard({ job, showCompany = true, onOpenCompany }: { job: PublicJob; showCompany?: boolean; onOpenCompany?: () => void }) {
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false);
  const long = job.description.length > LONG;
  const text = long && !open ? job.description.slice(0, LONG).trimEnd() + '…' : job.description;
  const where = jobPlace(job, language);
  const date = new Date(job.createdAt).toLocaleDateString(language === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short' });

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        {showCompany && (
          <TouchableOpacity onPress={onOpenCompany} disabled={!onOpenCompany} accessibilityLabel={job.company.name}>
            <CompanyLogo name={job.company.name} logo={job.company.logo} size={48} />
          </TouchableOpacity>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {showCompany && (
            <Text style={styles.company} onPress={onOpenCompany} numberOfLines={1}>{job.company.name}</Text>
          )}
          <Text style={styles.title}>{job.title}</Text>
          <View style={styles.metaRow}>
            {!!where && (
              <View style={styles.metaItem}>
                <Ionicons name="location-outline" size={12} color={theme.colors.textMuted} />
                <Text style={styles.meta}>{where}</Text>
              </View>
            )}
            <Text style={styles.meta}>{t('jobs.posted', { date })}</Text>
          </View>
        </View>
      </View>

      <View style={styles.chips}>
        {job.roles.map((r) => (
          <View key={r} style={styles.roleChip}>
            <Ionicons name="briefcase-outline" size={12} color={theme.colors.redLight} />
            <Text style={styles.roleText}>{t(`jobs.role.${r}`)}</Text>
          </View>
        ))}
        {job.genders.map((g) => (
          <View key={g} style={styles.genderChip}>
            <Ionicons name="person-outline" size={12} color={theme.colors.textSecondary} />
            <Text style={styles.genderText}>{t(`jobs.gender.${g}`)}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.desc}>
        {text}
        {long && (
          <Text style={styles.more} onPress={() => setOpen((o) => !o)}>
            {' '}{open ? t('jobs.less') : t('jobs.more')}
          </Text>
        )}
      </Text>

      {job.photos.length > 0 && (
        <View style={styles.photos}>
          {job.photos.map((src, i) => (
            <Image
              key={src}
              source={{ uri: src }}
              accessibilityLabel={`${job.title} ${i + 1}`}
              style={job.photos.length === 1 ? styles.photoOne : styles.photo}
              resizeMode="cover"
            />
          ))}
        </View>
      )}

      {(!!job.contactEmail || !!job.contactPhone) && (
        <View style={{ gap: 8 }}>
          {!!job.contactEmail && <ContactBox icon="mail-outline" label={t('jobs.email_label')} value={job.contactEmail} />}
          {!!job.contactPhone && <ContactBox icon="call-outline" label={t('jobs.phone_label')} value={job.contactPhone} />}
          <Text style={styles.hint}>{t('jobs.hold_to_copy')}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Email or phone of an ad: a yellow lid that says "Email" / "Phone". Tap and it
 * swings open; underneath is the value, which can be selected and copied.
 * Like the website, nothing opens a mail or phone app.
 */
function ContactBox({ icon, label, value }: { icon: React.ComponentProps<typeof Ionicons>['name']; label: string; value: string }) {
  const [anim] = useState(() => new Animated.Value(0));
  const [open, setOpen] = useState(false);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    Animated.timing(anim, { toValue: next ? 1 : 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  };
  const rotateX = anim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '100deg'] });
  const opacity = anim.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 0.4, 0] });
  return (
    <View style={styles.box}>
      <View style={styles.boxInner}>
        <Ionicons name={icon} size={16} color={theme.colors.gold} />
        <Text selectable style={styles.boxValue} numberOfLines={1}>{value}</Text>
        <TouchableOpacity onPress={toggle} hitSlop={8} accessibilityLabel={label}>
          <Ionicons name="close" size={16} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>
      <Animated.View
        pointerEvents={open ? 'none' : 'auto'}
        style={[StyleSheet.absoluteFill, { opacity, transform: [{ perspective: 600 }, { translateY: -24 }, { rotateX }, { translateY: 24 }] }]}
      >
        <TouchableOpacity style={styles.lid} onPress={toggle} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={label}>
          <Ionicons name={icon} size={16} color="#000" />
          <Text style={styles.lidText}>{label}</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 12, borderRadius: 14, backgroundColor: theme.colors.bgCard, borderWidth: 1, borderColor: theme.colors.border },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  company: { color: theme.colors.textSecondary, fontSize: 12, marginBottom: 2 },
  title: { fontFamily: theme.fonts.display, fontSize: 18, lineHeight: 23, color: theme.colors.bone },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 2, marginTop: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  meta: { color: theme.colors.textMuted, fontSize: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  roleChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(212,20,31,0.4)', backgroundColor: theme.colors.redSubtle },
  roleText: { color: theme.colors.redLight, fontSize: 12, fontWeight: '600' },
  genderChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border },
  genderText: { color: theme.colors.textSecondary, fontSize: 12 },
  desc: { color: theme.colors.textSecondary, fontSize: 13, lineHeight: 20 },
  more: { color: theme.colors.redLight, fontWeight: '600' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photo: { width: '48.8%', aspectRatio: 1, borderRadius: 10, backgroundColor: theme.colors.surface },
  photoOne: { width: '100%', aspectRatio: 16 / 10, borderRadius: 10, backgroundColor: theme.colors.surface },
  box: { height: 46 },
  boxInner: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(201,154,46,0.5)', backgroundColor: theme.colors.surface },
  boxValue: { flex: 1, color: theme.colors.bone, fontSize: 14 },
  lid: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 10, backgroundColor: theme.colors.gold },
  lidText: { color: '#000', fontWeight: '800', fontSize: 14 },
  hint: { color: theme.colors.textMuted, fontSize: 11, textAlign: 'center' },
});
