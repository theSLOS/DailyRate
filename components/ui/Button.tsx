import { JSX } from 'react';
import { Pressable, Text } from 'react-native';

export type ButtonVariant = 'primary' | 'plain';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: ButtonVariant;
  className?: string; // outer layout only (margin/spacing) — internal look comes from variant
  testID?: string;
};

const VARIANT_CLASSES: Record<ButtonVariant, { pressable: string; text: string }> = {
  primary: { pressable: 'bg-black rounded-lg p-4 items-center', text: 'text-white' },
  plain: { pressable: '', text: '' },
};

export function Button({
  label,
  onPress,
  disabled = false,
  variant = 'plain',
  className,
  testID,
}: ButtonProps): JSX.Element {
  const { pressable, text } = VARIANT_CLASSES[variant];

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      className={[pressable, className].filter(Boolean).join(' ')}
    >
      <Text className={text}>{label}</Text>
    </Pressable>
  );
}
