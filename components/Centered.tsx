import { JSX, ReactNode } from 'react';
import { View } from 'react-native';

type CenteredProps = {
  children: ReactNode;
};

export function Centered(props: CenteredProps): JSX.Element {
  return <View className="flex-1 items-center justify-center">{props.children}</View>;
}
