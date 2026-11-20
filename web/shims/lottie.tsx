// Web stand-in for lottie-react-native (its web build needs @lottiefiles/dotlottie-react).
import React, { forwardRef, useImperativeHandle } from 'react';
import { ActivityIndicator, StyleProp, ViewStyle } from 'react-native';

const LottieView = forwardRef(({ style }: { style?: StyleProp<ViewStyle> }, ref) => {
  useImperativeHandle(ref, () => ({ play: () => undefined, pause: () => undefined, reset: () => undefined }));
  return <ActivityIndicator style={style} />;
});

export default LottieView;
