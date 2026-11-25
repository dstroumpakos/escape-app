import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { registerRootComponent } from 'expo';
import { readSavedSide } from './src/side';

/**
 * Reads the player's side (puzzles or horror, src/side.ts) before loading the
 * app, because every screen takes its colours from src/theme.ts when it loads.
 * Nothing here may import src/theme.ts or App.
 */
function Boot() {
  const [App, setApp] = useState<React.ComponentType | null>(null);
  useEffect(() => {
    readSavedSide().then((side) => {
      globalThis.__UNLOCKED_SIDE = side;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      setApp(() => require('./App').default);
    });
  }, []);
  return App ? React.createElement(App) : React.createElement(View, { style: { flex: 1, backgroundColor: '#050505' } });
}

// registerRootComponent calls AppRegistry.registerComponent('main', () => Boot).
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Boot);
