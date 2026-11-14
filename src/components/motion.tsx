/**
 * The app's motion, ported from the website's horror design system
 * (flicker, heartbeat, fade-up, watching eyes, blood drips, typewriter).
 *
 * Everything runs on the native driver (opacity and transforms only) and
 * stands still when the phone's Reduce Motion setting is on.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { theme } from '../theme';

/** True while the OS "Reduce Motion" accessibility setting is on. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** Content rises out of the dark: fade in while sliding up. */
export function FadeUp({
  children,
  delay = 0,
  distance = 24,
  duration = 650,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      progress.setValue(1);
      return;
    }
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.bezier(0.2, 0.7, 0.2, 1),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [reduced]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** A dying fluorescent tube: mostly on, with sudden drops. */
export function Flicker({
  children,
  period = 5000,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  /** Length of one full cycle in ms. */
  period?: number;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    // Same shape as the website's `flicker` keyframes, as [opacity, share of the cycle]
    const steps: [number, number][] = [
      [1, 0.18],
      [0.25, 0.02],
      [0.8, 0.01],
      [1, 0.01],
      [0.25, 0.02],
      [1, 0.01],
      [1, 0.28],
      [0.25, 0.02],
      [0.55, 0.01],
      [1, 0.01],
      [1, 0.43],
    ];
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        ...steps.map(([toValue, share]) =>
          Animated.timing(opacity, {
            toValue,
            duration: Math.max(16, share * period),
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, period, delay]);

  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

/** Two quick beats, then a rest. Wrap the thing that should feel alive. */
export function Heartbeat({
  children,
  active = true,
  rest = 1400,
  style,
}: {
  children: React.ReactNode;
  active?: boolean;
  /** Pause between beats in ms. */
  rest?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced || !active) {
      scale.setValue(1);
      return;
    }
    const beat = (toValue: number, duration: number) =>
      Animated.timing(scale, { toValue, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    const loop = Animated.loop(
      Animated.sequence([beat(1.045, 140), beat(0.99, 140), beat(1.045, 140), beat(1, 180), Animated.delay(rest)]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, active, rest]);

  return <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>;
}

/** A soft red light that breathes behind whatever sits on top of it. */
export function GlowPulse({ style, min = 0.25, max = 0.7 }: { style?: StyleProp<ViewStyle>; min?: number; max?: number }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(min)).current;

  useEffect(() => {
    if (reduced) {
      opacity.setValue((min + max) / 2);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: max, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: min, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced]);

  return <Animated.View pointerEvents="none" style={[styles.glow, style, { opacity }]} />;
}

export interface EyePair {
  /** Position in percent of the container. */
  x: number;
  y: number;
  size: number;
  /** ms before this pair first opens. */
  delay: number;
  tilt?: number;
}

function Eyes({ pair, reduced }: { pair: EyePair; reduced: boolean }) {
  const appear = useRef(new Animated.Value(0)).current;
  const lid = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) {
      appear.setValue(0.5);
      return;
    }
    const open = Animated.timing(appear, { toValue: 1, duration: 900, delay: pair.delay, useNativeDriver: true });
    const blink = Animated.loop(
      Animated.sequence([
        Animated.delay(pair.delay + 2600 + (pair.size % 7) * 350),
        Animated.timing(lid, { toValue: 0.08, duration: 90, useNativeDriver: true }),
        Animated.timing(lid, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.delay(240),
        Animated.timing(lid, { toValue: 0.08, duration: 90, useNativeDriver: true }),
        Animated.timing(lid, { toValue: 1, duration: 130, useNativeDriver: true }),
      ]),
    );
    open.start();
    blink.start();
    return () => {
      open.stop();
      blink.stop();
    };
  }, [reduced]);

  const w = pair.size;
  const h = pair.size * 0.5;
  const eye = (
    <Animated.View style={[styles.eye, { width: w, height: h, borderRadius: h, transform: [{ scaleY: lid }] }]}>
      <View style={{ width: h * 0.42, height: h * 0.9, borderRadius: h, backgroundColor: '#1a0000' }} />
    </Animated.View>
  );

  return (
    <Animated.View
      style={[
        styles.eyes,
        {
          left: `${pair.x}%`,
          top: `${pair.y}%`,
          gap: w * 0.55,
          opacity: appear.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }),
          transform: [{ rotate: `${pair.tilt ?? 0}deg` }],
        },
      ]}
    >
      {eye}
      {eye}
    </Animated.View>
  );
}

/** Eyes that open in the dark and blink. Fills its parent; touches pass through. */
export function WatchingEyes({ pairs }: { pairs: EyePair[] }) {
  const reduced = useReducedMotion();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {pairs.map((p, i) => (
        <Eyes key={i} pair={p} reduced={reduced} />
      ))}
    </View>
  );
}

function Drip({ left, length, delay, speed, reduced }: { left: number; length: number; delay: number; speed: number; reduced: boolean }) {
  const run = useRef(new Animated.Value(0)).current;
  const drop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) {
      run.setValue(0.6);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        // The streak creeps down the wall…
        Animated.timing(run, { toValue: 1, duration: speed, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        // …a drop lets go and falls…
        Animated.timing(drop, { toValue: 1, duration: 700, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        Animated.delay(900),
        // …and the streak dries up before the next one.
        Animated.parallel([
          Animated.timing(run, { toValue: 0, duration: 600, useNativeDriver: true }),
          Animated.timing(drop, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced]);

  return (
    <View style={[styles.dripSlot, { left: `${left}%`, height: length + 26 }]}>
      <View style={{ height: length, overflow: 'hidden' }}>
        <Animated.View
          style={[
            styles.dripStreak,
            { height: length, transform: [{ translateY: run.interpolate({ inputRange: [0, 1], outputRange: [-length, 0] }) }] },
          ]}
        />
      </View>
      <Animated.View
        style={[
          styles.dripDrop,
          {
            top: length - 4,
            opacity: drop.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] }),
            transform: [{ translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [0, 22] }) }],
          },
        ]}
      />
    </View>
  );
}

/** Blood running down from the top edge of whatever it is placed under. */
export function BloodDrips({ count = 6, maxLength = 34, seed = 1, style }: { count?: number; maxLength?: number; seed?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  // Deterministic "random" so the drips do not jump around between renders
  const drips = useMemo(() => {
    let s = seed * 9301 + 49297;
    const rand = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    return Array.from({ length: count }).map((_, i) => ({
      left: ((i + 0.2 + rand() * 0.6) / count) * 100,
      length: Math.round(maxLength * (0.35 + rand() * 0.65)),
      delay: Math.round(rand() * 3500),
      speed: 2200 + Math.round(rand() * 2600),
    }));
  }, [count, maxLength, seed]);

  return (
    <View pointerEvents="none" style={[styles.drips, { height: maxLength + 26 }, style]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {drips.map((d, i) => (
        <Drip key={i} {...d} reduced={reduced} />
      ))}
    </View>
  );
}

/** Text typed out one character at a time, with a blinking caret. */
export function Typewriter({
  text,
  speed = 55,
  delay = 0,
  style,
}: {
  text: string;
  /** ms per character. */
  speed?: number;
  delay?: number;
  style?: StyleProp<TextStyle>;
}) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const [caret, setCaret] = useState(true);

  useEffect(() => {
    if (reduced) {
      setShown(text.length);
      return;
    }
    setShown(0);
    let interval: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      interval = setInterval(() => {
        setShown((n) => {
          if (n >= text.length) {
            if (interval) clearInterval(interval);
            return n;
          }
          return n + 1;
        });
      }, speed);
    }, delay);
    return () => {
      clearTimeout(start);
      if (interval) clearInterval(interval);
    };
  }, [text, reduced]);

  useEffect(() => {
    if (reduced) return;
    const blink = setInterval(() => setCaret((c) => !c), 500);
    return () => clearInterval(blink);
  }, [reduced]);

  return (
    <Text style={style} accessibilityLabel={text}>
      {text.slice(0, shown)}
      <Text style={{ color: theme.colors.redLight, opacity: !reduced && caret ? 1 : 0 }}>▌</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: 'absolute',
    backgroundColor: theme.colors.redPrimary,
    shadowColor: theme.colors.redLight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },

  eyes: { position: 'absolute', flexDirection: 'row' },
  eye: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.redLight,
    shadowColor: theme.colors.redLight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
  },

  drips: { position: 'absolute', left: 0, right: 0 },
  dripSlot: { position: 'absolute', top: 0, width: 4, alignItems: 'center' },
  dripStreak: {
    width: 3,
    backgroundColor: '#B0000E',
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  dripDrop: {
    position: 'absolute',
    width: 5,
    height: 7,
    borderRadius: 3,
    backgroundColor: '#C8101B',
  },
});
