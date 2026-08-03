import { JSX } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ExploreFeedType } from '@/types/feed';
import { EXPLORE_FEED_LABELS } from '@/constants/posts';

type FeedTypeSwitcherProps = {
  value: ExploreFeedType;
  onChange: (next: ExploreFeedType) => void;
};

const FEED_TYPES: ExploreFeedType[] = ['newest', 'mostLiked', 'region'];

export function FeedTypeSwitcher({ value, onChange }: FeedTypeSwitcherProps): JSX.Element {
  return (
    <View className="flex-row gap-2 p-3">
      {FEED_TYPES.map((feedType) => {
        const selected = feedType === value;
        return (
          <Pressable
            key={feedType}
            onPress={() => onChange(feedType)}
            className={`rounded-full border px-3 py-1 ${
              selected ? 'border-black bg-black' : 'border-gray-300'
            }`}
          >
            <Text className={selected ? 'text-white' : 'text-gray-700'}>
              {EXPLORE_FEED_LABELS[feedType]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
