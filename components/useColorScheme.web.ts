// RN styles don't support SSR; always return 'light' on server
export function useColorScheme(): 'light' {
  return 'light';
}
