/**
 * A Link that opens external URLs in the system browser on web and an
 * in-app browser on native, instead of navigating within the app.
 */
import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { JSX } from 'react';
import { Platform } from 'react-native';

/** Renders a Link that opens its href in an in-app browser on native, a new tab on web. */
export function ExternalLink(
  props: Omit<React.ComponentProps<typeof Link>, 'href'> & { href: string }
): JSX.Element {
  return (
    <Link
      target="_blank"
      {...props}
      // @ts-expect-error: External URLs are not typed.
      href={props.href}
      onPress={(e) => {
        if (Platform.OS !== 'web') {
          // Prevent the default behavior of linking to the default browser on native.
          e.preventDefault();
          // Open the link in an in-app browser.
          WebBrowser.openBrowserAsync(props.href as string);
        }
      }}
    />
  );
}
