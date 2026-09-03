/**
 * Layout primitive that centers its children, both axes, filling available space.
 */
import { JSX, ReactNode } from 'react';
import { View } from 'react-native';

type CenteredProps = {
  children: ReactNode;
};

/** Renders children centered in a flex-1 container — used for loading/error/empty states. */
export function Centered(props: CenteredProps): JSX.Element {
  return <View className="flex-1 items-center justify-center">{props.children}</View>;
}
