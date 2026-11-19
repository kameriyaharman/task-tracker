/**
 * Keyboard handling that works with Android edge-to-edge (Android 15+), where the window no longer
 * resizes for the keyboard. No native dependency: listens to keyboard events, reports the keyboard
 * height and scrolls the focused input above the keyboard.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { DeviceEventEmitter, Keyboard, Platform, TextInput, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView } from 'react-native';

const FOCUS_EVENT = 'wt-input-focus';
const GAP = 24; // space kept between the focused field and the keyboard

/** Call from any TextInput's onFocus so an already-open keyboard still scrolls to the new field. */
export const notifyInputFocus = () => DeviceEventEmitter.emit(FOCUS_EVENT);

/** Current keyboard height (0 when hidden). */
export function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return height;
}

/**
 * For a ScrollView: returns the extra bottom padding to add and an onScroll handler.
 * When the keyboard opens (or another field is focused) the focused input is scrolled into view.
 */
export function useKeyboardAwareScroll(scrollRef: RefObject<React.ComponentRef<typeof ScrollView> | null>) {
  const [height, setHeight] = useState(0);
  const keyboardTop = useRef(0);
  const offset = useRef(0);

  const scrollToFocused = useCallback(() => {
    const input = (TextInput.State as any).currentlyFocusedInput?.() ?? null;
    const sv = scrollRef.current;
    if (!input || !sv || !keyboardTop.current) return;
    input.measureInWindow((_x: number, y: number, _w: number, h: number) => {
      const limit = keyboardTop.current - GAP;
      if (y + h > limit) sv.scrollTo({ y: offset.current + (y + h - limit), animated: true });
      else if (y < 80) sv.scrollTo({ y: Math.max(0, offset.current - (80 - y)), animated: true });
    });
  }, [scrollRef]);

  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      keyboardTop.current = e.endCoordinates.screenY;
      setHeight(e.endCoordinates.height);
      setTimeout(scrollToFocused, Platform.OS === 'ios' ? 250 : 60);
    });
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      keyboardTop.current = 0;
      setHeight(0);
    });
    const focus = DeviceEventEmitter.addListener(FOCUS_EVENT, () => setTimeout(scrollToFocused, 60));
    return () => { show.remove(); hide.remove(); focus.remove(); };
  }, [scrollToFocused]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offset.current = e.nativeEvent.contentOffset.y;
  }, []);

  return { keyboardHeight: height, onScroll };
}
