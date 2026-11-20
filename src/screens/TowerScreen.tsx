import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useTranslation } from '../i18n';
import { useUser } from '../UserContext';

// The 3D tower lives on the website (three.js) and is shown here in a WebView.
// The app keeps the login: it sends the passport numbers in and places the
// stamps itself, so the session token never goes to the page.
const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://unlocked.gr').replace(/\/+$/, '');
const URL_ = `${SITE}/embed/tower`;

export default function TowerScreen() {
  const navigation = useNavigation<any>();
  const { t, language } = useTranslation();
  const { sessionToken } = useUser();
  const data = useQuery(api.passport.mine, sessionToken ? { sessionToken } : 'skip');
  const placeStamp = useMutation(api.passport.placeStamp);
  const web = useRef<WebView>(null);
  const ready = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const push = useCallback(() => {
    if (!ready.current || !data) return;
    web.current?.postMessage(JSON.stringify({
      type: 'state',
      placed: data.placed,
      chambers: data.chambers,
      pocket: Math.max(0, data.total - data.placed),
      busy,
      error,
    }));
  }, [data, busy, error]);
  useEffect(push, [push]);

  const onMessage = async (e: WebViewMessageEvent) => {
    let m: any;
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m?.type === 'ready') { ready.current = true; push(); }
    else if (m?.type === 'close') navigation.goBack();
    else if (m?.type === 'place' && sessionToken && !busy) {
      setBusy(true);
      setError('');
      try {
        await placeStamp({ sessionToken });
      } catch (err: any) {
        setError(typeof err?.data === 'string' ? err.data : err?.message || t('error'));
        setTimeout(() => setError(''), 4000);
      } finally {
        setBusy(false);
      }
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      <WebView
        ref={web}
        source={{ uri: URL_ }}
        style={styles.container}
        onMessage={onMessage}
        // The page uses the site's language setting: match the app's.
        injectedJavaScriptBeforeContentLoaded={`try{localStorage.setItem('unlocked-lang','${language === 'el' ? 'el' : 'en'}')}catch(e){};true;`}
        // Stay on the tower page: anything else opens nowhere.
        originWhitelist={[SITE]}
        onShouldStartLoadWithRequest={(r) => r.url.startsWith(URL_)}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        bounces={false}
        overScrollMode="never"
        setSupportMultipleWindows={false}
        startInLoadingState
        renderLoading={() => (
          <View style={[StyleSheet.absoluteFill, styles.center]}><ActivityIndicator color="#c8101b" /></View>
        )}
        onLoadStart={() => { ready.current = false; }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
});
