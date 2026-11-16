/**
 * Platform guide for businesses. Same content as the website's
 * /company/docs page, worded for the app (tabs instead of pages).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, LayoutAnimation } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../theme';
import { useTranslation } from '../../i18n';
import { SUPPORT_EMAIL } from './companyFlags';

type IconName = keyof typeof Ionicons.glyphMap;
type Color = 'red' | 'green' | 'amber' | 'blue' | 'purple' | 'gray';

const BADGE: Record<Color, { bg: string; fg: string }> = {
  red: { bg: 'rgba(212,20,31,0.15)', fg: theme.colors.redLight },
  green: { bg: 'rgba(16,185,129,0.12)', fg: '#34D399' },
  amber: { bg: 'rgba(245,158,11,0.12)', fg: '#FBBF24' },
  blue: { bg: 'rgba(59,130,246,0.12)', fg: '#60A5FA' },
  purple: { bg: 'rgba(168,85,247,0.12)', fg: '#C084FC' },
  gray: { bg: 'rgba(255,255,255,0.08)', fg: theme.colors.textSecondary },
};

function Badge({ color = 'red', children }: { color?: Color; children: React.ReactNode }) {
  return (
    <View style={[styles.badge, { backgroundColor: BADGE[color].bg }]}>
      <Text style={[styles.badgeText, { color: BADGE[color].fg }]}>{children}</Text>
    </View>
  );
}

function Section({ icon, title, children, defaultOpen = false }: { icon: IconName; title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={styles.section}>
      <TouchableOpacity
        style={styles.sectionHead}
        activeOpacity={0.8}
        onPress={() => {
          LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
          setOpen(!open);
        }}
      >
        <View style={styles.sectionIcon}>
          <Ionicons name={icon} size={20} color={theme.colors.redLight} />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textSecondary} />
      </TouchableOpacity>
      {open && <View style={styles.sectionBody}>{children}</View>}
    </View>
  );
}

function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <View style={styles.card}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

const P = ({ children }: { children: React.ReactNode }) => <Text style={styles.p}>{children}</Text>;

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={{ gap: 6 }}>
      {items.map((s, i) => (
        <View key={i} style={styles.bulletRow}>
          <View style={styles.bulletDot} />
          <Text style={[styles.p, { flex: 1 }]}>{s}</Text>
        </View>
      ))}
    </View>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{n}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.strong}>{title}</Text>
        <Text style={[styles.p, { fontSize: 12, marginTop: 2 }]}>{desc}</Text>
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: 6 }}>
      <Text style={styles.muted}>{label}:</Text>
      <Text style={styles.strong}>{value}</Text>
    </View>
  );
}

function BadgeLine({ color, badge, text }: { color: Color; badge: string; text: string }) {
  return (
    <View style={styles.badgeLine}>
      <Badge color={color}>{badge}</Badge>
      <Text style={[styles.p, { flex: 1 }]}>{text}</Text>
    </View>
  );
}

const Wrap = ({ children }: { children: React.ReactNode }) => <View style={styles.wrap}>{children}</View>;

export default function CompanyGuide({ onBack }: { onBack: () => void }) {
  const { language } = useTranslation();
  const g = (el: string, en: string) => (language === 'el' ? el : en);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={theme.colors.bone} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{g('Οδηγός Πλατφόρμας', 'Platform Guide')}</Text>
          <Text style={styles.headerSub}>
            {g('Όλα όσα χρειάζεστε για να δέχεστε κρατήσεις με το UNLOCKED', 'Everything you need to take bookings with UNLOCKED')}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 120, gap: 10 }}>
        <Section icon="rocket-outline" title={g('Ξεκινώντας', 'Getting Started')} defaultOpen>
          <Card>
            <View style={{ gap: 14 }}>
              <Step n={1} title={g('Αποδοχή όρων', 'Accept the terms')} desc={g('Αποδεχτείτε τους όρους χρήσης και την πολιτική απορρήτου.', 'Accept the terms of service and the privacy policy.')} />
              <Step n={2} title={g('Επιλογή πλάνου', 'Choose a plan')} desc={g('Ξεκινήστε με Pay as you go χωρίς να πληρώσετε τίποτα τώρα, ή επιλέξτε Απεριόριστο και πληρώστε μέσω Stripe.', 'Start on pay as you go without paying anything now, or pick Unlimited and pay through Stripe.')} />
              <Step n={3} title={g('Έλεγχος στοιχείων', 'Account review')} desc={g('Ελέγχουμε τα στοιχεία σας, συνήθως μέσα σε 1 με 2 εργάσιμες. Θα λάβετε email μόλις εγκριθεί ο λογαριασμός σας.', 'We check your details, usually within 1 to 2 working days. You get an email as soon as your account is approved.')} />
              <Step n={4} title={g('Λίστα εκκίνησης', 'Getting-started checklist')} desc={g('Μόλις συνδεθείτε, μια σύντομη λίστα στον πίνακα ελέγχου σας οδηγεί: προφίλ εταιρείας, πρώτο δωμάτιο, φωτογραφία δωματίου, εβδομαδιαίες ώρες και widget στην ιστοσελίδα σας.', 'Once you sign in, a short checklist on your dashboard walks you through it: company profile, first room, a room photo, weekly times and the widget on your website.')} />
            </View>
          </Card>
        </Section>

        <Section icon="card-outline" title={g('Πλάνα & Τιμολόγηση', 'Plans & Pricing')}>
          <P>{g('Υπάρχουν δύο πλάνα. Και τα δύο περιλαμβάνουν όλες τις λειτουργίες και απεριόριστα δωμάτια. Διαφέρουν μόνο στον τρόπο που πληρώνετε.', 'There are two plans. Both include every feature and unlimited rooms. They only differ in how you pay.')}</P>
          <Card>
            <Badge color="green">Pay as you go</Badge>
            <Text style={styles.price}>€3 <Text style={styles.muted}>/ {g('κράτηση', 'booking')}</Text></Text>
            <Bullets items={[g('Χωρίς μηνιαία συνδρομή', 'No monthly fee'), g('Ποτέ πάνω από €250 τον μήνα', 'Never more than €250 a month'), g('Τιμολόγιο με email την 1η κάθε μήνα για τον προηγούμενο', 'Invoiced by email on the 1st for the previous month')]} />
          </Card>
          <Card>
            <Badge color="purple">{g('Απεριόριστο', 'Unlimited')}</Badge>
            <Text style={styles.price}>€198 <Text style={styles.muted}>/ {g('μήνα', 'month')}</Text></Text>
            <Bullets items={[g('Χωρίς χρεώσεις ανά κράτηση', 'No per-booking fees'), g('Ετήσια: €1980 (2 μήνες δωρεάν)', 'Yearly: €1980 (2 months free)'), g('Συμφέρει από 66 κρατήσεις τον μήνα', 'Worth it from 66 bookings a month')]} />
          </Card>
          <Card title={g('Ποιες κρατήσεις χρεώνονται', 'Which bookings count')}>
            <P>{g('Στο Pay as you go μετράνε οι κρατήσεις που κάνουν παίκτες στην εφαρμογή, στην ιστοσελίδα UNLOCKED ή στο widget της ιστοσελίδας σας. Ακυρωμένες κρατήσεις και κρατήσεις που περιμένουν πληρωμή δεν μετράνε. Όσες προσθέτετε εσείς (τηλέφωνο, walk-in, ιδιωτικές εκδηλώσεις, άλλες πλατφόρμες) είναι δωρεάν.', "On pay as you go, bookings players make in the app, on the UNLOCKED website or through your website widget count. Cancelled bookings and bookings still waiting for payment don't. Bookings you add yourself (phone, walk-in, private events, other platforms) are free.")}</P>
          </Card>
          <Card title={g('Αλλαγή πλάνου', 'Changing plan')}>
            <P>{g('Στις Χρεώσεις (Ρυθμίσεις → Χρεώσεις) βλέπετε πόσες κρατήσεις έχετε αυτόν τον μήνα. Από εκεί μπορείτε να περάσετε στο Απεριόριστο. Για να επιστρέψετε στο Pay as you go, ακυρώστε τη συνδρομή στο Stripe: η αλλαγή γίνεται όταν λήξει η περίοδος που έχετε πληρώσει.', "Billing (Settings → Billing) shows this month's bookings so far. You can switch to Unlimited from there. To go back to pay as you go, cancel the subscription in Stripe: you switch when the paid period ends.")}</P>
          </Card>
        </Section>

        <Section icon="calendar-outline" title={g('Σύστημα Κρατήσεων', 'Booking System')}>
          <P>{g('Οι παίκτες επιλέγουν δωμάτιο, ημερομηνία, ώρα και αριθμό παικτών. Κάθε κράτηση παίρνει έναν μοναδικό κωδικό, που ο παίκτης βλέπει στην επιβεβαίωση και στα εισιτήριά του. Ο ίδιος κωδικός εμφανίζεται στις Κρατήσεις, ώστε να τον συγκρίνετε στην είσοδο.', 'Players pick a room, date, time and number of players. Every booking gets a unique code, which the player sees on the confirmation and in their tickets. The same code is shown under Bookings, so you can match it at the door.')}</P>
          <Card title={g('Κωδικοί κράτησης', 'Booking codes')}>
            <InfoRow label={g('Εφαρμογή & ιστοσελίδα', 'App & website')} value="UNL-XXXXXX" />
            <InfoRow label="Widget" value="WEB-XXXXXX" />
          </Card>
          <Card title={g('Καταστάσεις κράτησης', 'Booking statuses')}>
            <Wrap>
              <Badge color="blue">{g('Προσεχής', 'Upcoming')}</Badge>
              <Badge color="green">{g('Ολοκληρωμένη', 'Completed')}</Badge>
              <Badge color="red">{g('Ακυρωμένη', 'Cancelled')}</Badge>
              <Badge color="amber">{g('Αναμονή πληρωμής', 'Awaiting payment')}</Badge>
            </Wrap>
          </Card>
          <Card title={g('Επιλογές πληρωμής ανά δωμάτιο', 'Payment options per room')}>
            <P>{g('Στις ρυθμίσεις κάθε δωματίου επιλέγετε ποιες επιλογές βλέπουν οι παίκτες. Μπορείτε να ενεργοποιήσετε μία ή περισσότερες:', "In each room's settings you choose which options players see. You can turn on one or more:")}</P>
            <BadgeLine color="green" badge={g('Πλήρης', 'Full')} text={g('Ο παίκτης πληρώνει όλο το ποσό online.', 'The player pays the whole amount online.')} />
            <BadgeLine color="amber" badge={g('Προκαταβολή', 'Deposit')} text={g('Ο παίκτης πληρώνει ένα ποσοστό online (προεπιλογή 20%) και το υπόλοιπο στον χώρο.', 'The player pays a share online (20% by default) and the rest at the venue.')} />
            <BadgeLine color="blue" badge={g('Στον χώρο', 'At the venue')} text={g('Καμία online πληρωμή. Η κράτηση επιβεβαιώνεται αμέσως.', 'No online payment. The booking is confirmed right away.')} />
            <P>{g('Οι online επιλογές εμφανίζονται μόνο αφού συνδέσετε λογαριασμό Stripe ή Viva (δείτε Online Πληρωμές).', 'The online options only appear once you connect a Stripe or Viva account (see Online Payments).')}</P>
          </Card>
          <View style={styles.notice}>
            <Ionicons name="timer-outline" size={20} color="#FBBF24" />
            <View style={{ flex: 1 }}>
              <Text style={styles.strong}>{g('Μη πληρωμένες κρατήσεις λήγουν σε 30 λεπτά', 'Unpaid bookings expire after 30 minutes')}</Text>
              <P>{g('Η ώρα κρατιέται για τον παίκτη όσο πληρώνει. Αν δεν ολοκληρώσει την πληρωμή μέσα σε 30 λεπτά, η κράτηση ακυρώνεται και η ώρα ανοίγει ξανά.', "The time is held for the player while they pay. If they don't finish paying within 30 minutes, the booking is cancelled and the time opens again.")}</P>
            </View>
          </View>
          <Card title={g('Χωρίς διπλές κρατήσεις', 'No double bookings')}>
            <P>{g('Πριν από κάθε κράτηση, το σύστημα ελέγχει αν υπάρχει ήδη ενεργή κράτηση στο ίδιο δωμάτιο, ημερομηνία και ώρα. Αν υπάρχει, η νέα κράτηση απορρίπτεται.', 'Before every booking, the system checks for an active booking at the same room, date and time. If there is one, the new booking is rejected.')}</P>
          </Card>
          <Card title={g('Email επιβεβαίωσης', 'Confirmation emails')}>
            <P>{g('Μόλις δημιουργηθεί η κράτηση (ή επιβεβαιωθεί η πληρωμή), στέλνεται αυτόματα email επιβεβαίωσης στον παίκτη και σε εσάς.', 'As soon as a booking is made (or its payment is confirmed), a confirmation email goes to the player and to you automatically.')}</P>
          </Card>
          <Card title={g('Ολοκλήρωση & badges', 'Completing & badges')}>
            <P>{g('Όταν ολοκληρώνετε μια κράτηση, σημειώστε αν η ομάδα απέδρασε, τον χρόνο και τις βοήθειες. Με αυτά τα στοιχεία οι παίκτες κερδίζουν αυτόματα badges.', 'When you complete a booking, note whether the team escaped, their time and the hints used. Players earn badges automatically from these details.')}</P>
          </Card>
        </Section>

        <Section icon="wallet-outline" title={g('Online Πληρωμές', 'Online Payments')}>
          <P>{g('Οι παίκτες πληρώνουν απευθείας στον δικό σας λογαριασμό Stripe ή Viva. Το UNLOCKED δεν κρατάει ποτέ τα χρήματα. Η σύνδεση γίνεται από Ρυθμίσεις → Online πληρωμές.', 'Players pay straight into your own Stripe or Viva account. UNLOCKED never holds the money. You connect your account in Settings → Online payments.')}</P>
          <Card title={g('Σύνδεση λογαριασμού', 'Connecting an account')}>
            <InfoRow label="Stripe" value={g('Επικολλήστε το Secret key από Developers → API keys', 'Paste your Secret key from Developers → API keys')} />
            <InfoRow label="Viva" value={g('Merchant ID, API Key, Smart Checkout credentials και τον κωδικό πηγής πληρωμής', 'Merchant ID, API Key, Smart Checkout credentials and the payment source code')} />
            <P>{g('Ελέγχουμε τα κλειδιά με τον πάροχο πριν τα αποθηκεύσουμε, τα κρατάμε κρυπτογραφημένα και δεν τα εμφανίζουμε ξανά. Για κάθε αλλαγή στα στοιχεία πληρωμής ζητάμε τον κωδικό σας, ώστε κανείς άλλος να μη μπορεί να ανακατευθύνει τα χρήματά σας.', 'We check the keys with the provider before saving them, store them encrypted and never show them again. Every change to payment details asks for your password, so nobody else can redirect your money.')}</P>
          </Card>
          <Card title={g('Δοκιμαστική λειτουργία', 'Test mode')}>
            <P>{g('Με κλειδιά δοκιμής (sk_test_ ή λογαριασμό Viva Demo) οι παίκτες βλέπουν δοκιμαστική σελίδα πληρωμής και δεν χρεώνονται πραγματικά χρήματα. Συνδέστε τα live κλειδιά όταν είστε έτοιμοι.', "With test keys (sk_test_ or a Viva demo account) players see a test checkout and no real money is charged. Connect your live keys when you're ready.")}</P>
          </Card>
          <Card title={g('Προκαταβολή & χρέωση κράτησης', 'Deposit & booking fee')}>
            <Bullets items={[
              g('Ορίστε το προεπιλεγμένο ποσοστό προκαταβολής (1 έως 99%) και, αν θέλετε, διαφορετικό ποσοστό ανά δωμάτιο.', 'Set your default deposit (1 to 99%) and, if you like, a different % per room.'),
              g('Προαιρετικά προσθέστε χρέωση κράτησης έως €20 στις online πληρωμές. Ο παίκτης τη βλέπει πριν πληρώσει και πηγαίνει σε εσάς μαζί με την κράτηση.', 'Optionally add a booking fee of up to €20 to online payments. The player sees it before paying and it goes to you with the booking.'),
            ]} />
          </Card>
          <Card title={g('Επιβεβαίωση & επιστροφές', 'Confirmation & refunds')}>
            <P>{g('Η κράτηση επιβεβαιώνεται μόνο αφού ο πάροχος επιβεβαιώσει ότι η πληρωμή πέτυχε για το σωστό ποσό. Οι επιστροφές χρημάτων γίνονται από το dashboard του Stripe ή της Viva. Αν αποσυνδέσετε τον λογαριασμό, οι παίκτες πληρώνουν μόνο στον χώρο και όσες κρατήσεις έχουν ήδη πληρωθεί μένουν πληρωμένες.', 'A booking is confirmed only after the provider confirms the payment succeeded for the right amount. Refunds are made from your Stripe or Viva dashboard. If you disconnect your account, players can only pay at the venue, and bookings already paid stay paid.')}</P>
          </Card>
        </Section>

        <Section icon="time-outline" title={g('Ώρες & Διαθεσιμότητα', 'Time Slots & Availability')}>
          <Card title={g('Εβδομαδιαίο πρόγραμμα', 'Weekly schedule')}>
            <P>{g('Για κάθε δωμάτιο ορίζετε τις ημέρες λειτουργίας και τις ώρες με την τιμή τους. Αυτό το πρόγραμμα ισχύει κάθε εβδομάδα. Τις ημέρες που το δωμάτιο δεν λειτουργεί, οι παίκτες το βλέπουν κλειστό.', "For each room you set its operating days and its times with their prices. This schedule repeats every week. On days the room doesn't operate, players see it as closed.")}</P>
          </Card>
          <Card title={g('Άνοιγμα & κλείσιμο ωρών', 'Opening & closing times')}>
            <P>{g('Στην καρτέλα Slots επιλέγετε μέρα και πατάτε μια ώρα για να την ανοίξετε ή να την κλείσετε. Οι παίκτες βλέπουν την αλλαγή αμέσως. Μπορείτε επίσης να κλείσετε ή να ανοίξετε όλη τη μέρα, και να προσθέσετε έξτρα ώρα μόνο για μία μέρα.', 'On the Slots tab, pick a day and tap a time to open or close it. Players see the change right away. You can also close or open a whole day, and add an extra time for one day only.')}</P>
          </Card>
          <Card title={g('Αργίες & πολλές ημέρες', 'Holidays & several days')}>
            <P>{g('Με το "Κλείσιμο πολλών ημερών" κλείνετε ή ανοίγετε ξανά έως 92 ημέρες για όσα δωμάτια θέλετε (αργίες, συντήρηση, ιδιωτικές εκδηλώσεις). Οι υπάρχουσες κρατήσεις μένουν ως έχουν· κλείνουν μόνο οι ελεύθερες ώρες.', 'With "Close several days" you close or reopen up to 92 days for the rooms you pick (holidays, maintenance, private events). Existing bookings stay as they are; only free times are closed.')}</P>
          </Card>
          <Card title={g('Κανόνας τελευταίας ώρας', 'Last-hour rule')}>
            <P>{g('Μια ελεύθερη ώρα κλείνει για κρατήσεις 1 ώρα πριν ξεκινήσει, εκτός αν η αμέσως προηγούμενη ώρα είναι κλεισμένη· τότε μένει ανοιχτή μέχρι να ξεκινήσει. Όσες ώρες έχουν ήδη ξεκινήσει κλείνουν αυτόματα.', 'A free time closes for booking 1 hour before it starts, unless the time right before it is booked; then it stays open until it starts. Times that have already started close automatically.')}</P>
          </Card>
          <Card title="Overflow slot">
            <P>{g('Μια επιπλέον ώρα που εμφανίζεται μόνο όταν ΟΛΕΣ οι κανονικές ώρες είναι κλεισμένες. Ρυθμίζεται ανά δωμάτιο με ώρα, τιμή και τις ημέρες που ισχύει.', 'A bonus time that only appears when ALL regular times are booked. Set per room with its time, price and the days it applies.')}</P>
          </Card>
          <Card title={g('Τρόποι τιμολόγησης', 'Pricing modes')}>
            <BadgeLine color="blue" badge={g('Ανά άτομο', 'Per person')} text={g('Τιμή × αριθμός παικτών', 'Price × number of players')} />
            <BadgeLine color="purple" badge={g('Ανά ομάδα', 'Per group')} text={g('Κλιμακωτή τιμή ανά μέγεθος ομάδας (π.χ. 2 άτομα = €50, 3 = €42, ...)', 'Tiered price per group size (e.g. 2 players = €50, 3 = €42, ...)')} />
          </Card>
        </Section>

        <Section icon="code-slash-outline" title={g('Widget Κρατήσεων', 'Booking Widget')}>
          <P>{g('Βάλτε το widget κρατήσεων στη δική σας ιστοσελίδα. Οι πελάτες κλείνουν χωρίς λογαριασμό UNLOCKED.', 'Put the booking widget on your own website. Customers book without an UNLOCKED account.')}</P>
          <Card title={g('Χαρακτηριστικά', 'Features')}>
            <Bullets items={[
              g('Διαθεσιμότητα σε πραγματικό χρόνο', 'Real-time availability'),
              g('Κράτηση ως επισκέπτης, χωρίς λογαριασμό', 'Guest booking, no account needed'),
              g('Online πληρωμή στον λογαριασμό σας Stripe ή Viva', 'Online payment into your Stripe or Viva account'),
              g('Αυτόματα email επιβεβαίωσης', 'Automatic confirmation emails'),
              g('Λειτουργεί σε κινητά', 'Works on mobile'),
              g('Ειδοποιήσεις διαθεσιμότητας για επισκέπτες', 'Slot alerts for guests'),
              g('Υποστηρίζει τιμή ανά ομάδα', 'Supports per-group pricing'),
            ]} />
          </Card>
          <Card title={g('Ενσωμάτωση', 'Adding it to your site')}>
            <P>{g('Στις Ρυθμίσεις → Widget αντιγράψτε τον κώδικα και επικολλήστε τον στο HTML της ιστοσελίδας σας, ή στείλτε τον με email στον developer σας με ένα πάτημα. Το widget παίρνει αυτόματα το όνομα, το λογότυπο και τα δωμάτιά σας.', "In Settings → Widget, copy the code and paste it into your website's HTML, or email it to your web developer in one tap. The widget picks up your name, logo and rooms automatically.")}</P>
          </Card>
        </Section>

        <Section icon="notifications-outline" title={g('Ειδοποιήσεις Διαθεσιμότητας', 'Slot Alerts')}>
          <P>{g('Οι παίκτες μπορούν να ζητήσουν ειδοποίηση για μια κλεισμένη ώρα. Αν η κράτηση ακυρωθεί, ειδοποιούνται αυτόματα ότι η ώρα είναι πάλι διαθέσιμη.', 'Players can ask to be alerted about a booked time. If that booking is cancelled, they are told automatically that the time is free again.')}</P>
          <Card>
            <P>{g('Λειτουργεί για εγγεγραμμένους παίκτες (ειδοποίηση στην εφαρμογή) και για επισκέπτες του widget (email ή τηλέφωνο).', 'Works for registered players (in-app notification) and for widget guests (email or phone).')}</P>
          </Card>
        </Section>

        <Section icon="camera-outline" title={g('Φωτογραφίες Ομάδων', 'Team Photos')}>
          <P>{g('Από τις Ρυθμίσεις → Φωτογραφίες ανεβάζετε φωτογραφίες ομάδων, βάζετε το branding σας και τις στέλνετε στους παίκτες με email.', 'From Settings → Photos you upload team photos, add your branding and email them to the players.')}</P>
          <Card title={g('Branding', 'Branding')}>
            <Bullets items={[
              g('Λογότυπο με μέγεθος και θέση (πάνω/κάτω, αριστερά/δεξιά, κάτω κέντρο)', 'Logo with size and position (top/bottom, left/right, bottom centre)'),
              g('Overlay σε όλο το κάδρο (PNG με διαφάνεια) και αδιαφάνεια', 'Full-frame overlay (transparent PNG) and opacity'),
              g('Χρώμα brand και προεπιλεγμένο φίλτρο', 'Brand colour and default filter'),
              g('Κείμενο στη φωτογραφία με {{room}}, {{team}} και {{time}} που συμπληρώνονται αυτόματα', 'Text on the photo, with {{room}}, {{team}} and {{time}} filled in automatically'),
            ]} />
          </Card>
          <Card title={g('Ροή εργασίας', 'Workflow')}>
            <Wrap>
              <Badge color="gray">{g('Πρόχειρη', 'Draft')}</Badge>
              <Text style={styles.muted}>→</Text>
              <Badge color="blue">{g('Έτοιμη', 'Ready')}</Badge>
              <Text style={styles.muted}>→</Text>
              <Badge color="green">{g('Στάλθηκε', 'Sent')}</Badge>
            </Wrap>
            <P>{g('Ανεβάστε τη φωτογραφία, γράψτε όνομα ομάδας, αποτέλεσμα και χρόνο, εφαρμόστε το branding και στείλτε τη στα email των παικτών.', "Upload the photo, add the team name, result and time, apply your branding and send it to the players' emails.")}</P>
          </Card>
        </Section>

        <Section icon="star-outline" title={g('Αξιολογήσεις', 'Reviews')}>
          <P>{g('Μόνο παίκτες με ολοκληρωμένη κράτηση μπορούν να αξιολογήσουν ένα δωμάτιο.', 'Only players with a completed booking can review a room.')}</P>
          <Card>
            <Bullets items={[
              g('Βαθμολογία 1 έως 5 αστέρια (υποχρεωτική)', 'Rating from 1 to 5 stars (required)'),
              g('Κάθε αξιολόγηση είναι επιβεβαιωμένη, συνδεδεμένη με πραγματική κράτηση', 'Every review is verified and linked to a real booking'),
              g('Μία αξιολόγηση ανά κράτηση', 'One review per booking'),
            ]} />
          </Card>
          <P>{g('Η μέση βαθμολογία και ο αριθμός αξιολογήσεων του δωματίου ενημερώνονται αυτόματα.', "The room's average rating and review count update automatically.")}</P>
        </Section>

        <Section icon="sparkles-outline" title={g('Πρόγραμμα Early Access', 'Early Access Partner Program')}>
          <P>{g('Ενταχθείτε από τις Ρυθμίσεις → Early Access. Ως Early Access Partner:', 'Join from Settings → Early Access. As an Early Access Partner:')}</P>
          <Card>
            <Bullets items={[
              g('Τα δωμάτιά σας εμφανίζονται στο Featured Spotlight της αρχικής σελίδας', 'Your rooms appear in the Featured Spotlight on the home page'),
              g('Ορίζετε ημερομηνία κυκλοφορίας και οι Premium παίκτες κλείνουν έως 3 ημέρες νωρίτερα', 'You set a release date and Premium players can book up to 3 days early'),
              g('Οι Premium παίκτες ειδοποιούνται όταν προσθέτετε νέο δωμάτιο', 'Premium players are notified when you add a new room'),
              g('Τα δωμάτιά σας έχουν το σήμα "Early Access"', 'Your rooms show the "Early Access" badge'),
            ]} />
          </Card>
        </Section>

        <Section icon="trophy-outline" title={g('Κατάταξη & Ποσοστό Απόδρασης', 'Leaderboard & Escape Rate')}>
          <Card title={g('Κατάταξη παικτών', 'Player ranking')}>
            <P>{g('Οι παίκτες κατατάσσονται με βάση πόσα διαφορετικά δωμάτια έχουν λύσει. Σε ισοβαθμία, προηγείται όποιος χρειάστηκε λιγότερες προσπάθειες.', 'Players are ranked by how many different rooms they escaped. On a tie, the player with fewer attempts goes first.')}</P>
          </Card>
          <Card title={g('Ποσοστό απόδρασης δωματίου', 'Room escape rate')}>
            <P>{g('(ολοκληρωμένες κρατήσεις / όλες οι παρελθούσες μη ακυρωμένες κρατήσεις) × 100%. Εμφανίζεται στην καρτέλα "Top Rooms".', '(completed bookings / all past non-cancelled bookings) × 100%. Shown on the "Top Rooms" tab.')}</P>
          </Card>
          <Card title="Badges">
            <Wrap>
              <Badge color="amber">🏆 Champion</Badge>
              <Badge color="red">🔥 On Fire</Badge>
              <Badge color="purple">🧠 Mastermind</Badge>
              <Badge color="blue">⚡ Speed Demon</Badge>
              <Badge color="green">👥 Team Leader</Badge>
              <Badge color="blue">🌍 Explorer</Badge>
              <Badge color="amber">🎯 Perfectionist</Badge>
              <Badge color="purple">🌙 Night Owl</Badge>
            </Wrap>
          </Card>
        </Section>

        <Section icon="megaphone-outline" title={g('Ειδοποιήσεις Παικτών', 'Player Notifications')}>
          <P>{g('Οι ειδοποιήσεις στέλνονται στα Ελληνικά ή στα Αγγλικά, ανάλογα με τη γλώσσα του παίκτη.', "Notifications are sent in Greek or English, depending on the player's language.")}</P>
          <Card>
            <Bullets items={[
              g('Επιβεβαίωση κράτησης', 'Booking confirmation'),
              g('Ακύρωση κράτησης', 'Booking cancelled'),
              g('Υπενθύμιση κράτησης', 'Booking reminder'),
              g('Η ώρα είναι διαθέσιμη', 'Slot available'),
              g('Νέο δωμάτιο (Premium)', 'New room (Premium)'),
              g('Φωτογραφίες έτοιμες', 'Photos ready'),
              g('Αίτημα & αποδοχή φιλίας', 'Friend request & accepted'),
              g('Πρόσκληση σε κράτηση', 'Booking invite'),
              g('Προσφορές & ανακοινώσεις', 'Offers & announcements'),
            ]} />
          </Card>
        </Section>

        <Section icon="people-outline" title={g('Φίλοι & Προσκλήσεις', 'Friends & Invitations')}>
          <P>{g('Οι παίκτες στέλνουν αιτήματα φιλίας και προσκαλούν φίλους στις κρατήσεις τους.', 'Players send friend requests and invite friends to their bookings.')}</P>
          <Card>
            <Bullets items={[
              g('Αιτήματα φιλίας (αποστολή, αποδοχή, απόρριψη)', 'Friend requests (send, accept, decline)'),
              g('Πρόσκληση φίλων σε κράτηση', 'Invite friends to a booking'),
              g('Ειδοποίηση σε κάθε βήμα', 'A notification at every step'),
            ]} />
          </Card>
        </Section>

        <TouchableOpacity style={styles.help} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})}>
          <Text style={styles.p}>{g('Χρειάζεστε βοήθεια; Στείλτε μας email στο', 'Need help? Email us at')}</Text>
          <Text style={[styles.strong, { color: theme.colors.redLight }]}>{SUPPORT_EMAIL}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bgPrimary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 56, paddingHorizontal: 20, paddingBottom: 16 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: theme.colors.glass,
    borderWidth: 1, borderColor: theme.colors.glassBorder, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 22, fontFamily: theme.fonts.display, color: theme.colors.bone },
  headerSub: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  section: {
    borderRadius: theme.radius.lg, backgroundColor: theme.colors.bgCardSolid,
    borderWidth: 1, borderColor: theme.colors.glassBorder, overflow: 'hidden',
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  sectionIcon: {
    width: 38, height: 38, borderRadius: theme.radius.md, backgroundColor: theme.colors.redSubtle,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: theme.colors.bone },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 16, gap: 10 },
  card: { backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: theme.radius.md, padding: 12, gap: 8 },
  cardTitle: { fontSize: 11, fontWeight: '700', color: theme.colors.bone, textTransform: 'uppercase', letterSpacing: 1 },
  p: { fontSize: 13, lineHeight: 19, color: theme.colors.textSecondary },
  strong: { fontSize: 13, fontWeight: '600', color: theme.colors.bone },
  muted: { fontSize: 12, color: theme.colors.textMuted },
  price: { fontSize: 20, fontWeight: '800', color: theme.colors.bone },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: theme.radius.md, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  bulletRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bulletDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.redLight, marginTop: 7 },
  stepRow: { flexDirection: 'row', gap: 12 },
  stepNum: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: theme.colors.redSubtle,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumText: { fontSize: 13, fontWeight: '700', color: theme.colors.redLight },
  notice: {
    flexDirection: 'row', gap: 10, padding: 12, borderRadius: theme.radius.md,
    backgroundColor: 'rgba(245,158,11,0.06)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.15)',
  },
  help: {
    marginTop: 14, padding: 18, alignItems: 'center', gap: 4, borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.bgCardSolid, borderWidth: 1, borderColor: theme.colors.glassBorder,
  },
});
