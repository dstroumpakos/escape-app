// Lets the app check for and open Instagram / Facebook / WhatsApp when sharing
// a photo (src/components/ShareSheet.tsx):
// iOS needs the URL schemes listed, Android 11+ needs the packages in <queries>.
const { withInfoPlist, withAndroidManifest } = require('@expo/config-plugins');

const IOS_SCHEMES = ['instagram', 'instagram-stories', 'facebook-stories', 'fb', 'whatsapp'];
const ANDROID_PACKAGES = ['com.instagram.android', 'com.facebook.katana', 'com.whatsapp', 'com.whatsapp.w4b'];

module.exports = function withShareTargets(config) {
  config = withInfoPlist(config, (c) => {
    const have = Array.isArray(c.modResults.LSApplicationQueriesSchemes) ? c.modResults.LSApplicationQueriesSchemes : [];
    c.modResults.LSApplicationQueriesSchemes = [...new Set([...have, ...IOS_SCHEMES])];
    return c;
  });
  config = withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest.queries = manifest.queries || [{}];
    const q = manifest.queries[0];
    q.package = q.package || [];
    const have = new Set(q.package.map((p) => p.$['android:name']));
    for (const name of ANDROID_PACKAGES) if (!have.has(name)) q.package.push({ $: { 'android:name': name } });
    return c;
  });
  return config;
};
