import React from 'react';
import { Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

// Wrapper de íconos: SF Symbols en iOS (look nativo), Ionicons como respaldo
// en Android/web. Cada uso pasa el nombre SF (`sf`) y su equivalente Ionicon (`ion`).
// SF Symbols requieren un build nativo nuevo para renderizar (no se ven en Expo Go).
export function Icon({ sf, ion, size = 24, color, weight }: {
  sf: SymbolViewProps['name'];
  ion: IoniconName;
  size?: number;
  color?: string;
  weight?: SymbolViewProps['weight'];
}) {
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={sf}
        size={size}
        tintColor={color}
        weight={weight ?? 'regular'}
        resizeMode="scaleAspectFit"
        style={{ width: size, height: size }}
      />
    );
  }
  return <Ionicons name={ion} size={size} color={color} />;
}
