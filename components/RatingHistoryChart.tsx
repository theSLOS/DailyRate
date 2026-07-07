import type { Post } from '@/types/posts';
import { JSX, useState } from 'react';
import { RATING_CHART_RANGES, type ChartRange } from '@/constants/chart';
import { filterPostsByRange } from '@/utils/filterPostsByRange';
import { Pressable, Text, View } from 'react-native';
import { VictoryAxis, VictoryChart, VictoryLine } from 'victory-native';

export type RatingHistoryChartProps = { posts: Post[] };

export function RatingHistoryChart(props: RatingHistoryChartProps): JSX.Element {
  const [range, setRange] = useState<ChartRange>('week');

  const filtered = filterPostsByRange(props.posts, range);
  const chartData = filtered.map((post) => ({ x: new Date(post.local_date), y: post.rating }));

  return (
    <View>
      <View className="flex-row gap-2">
        {RATING_CHART_RANGES.map((r) => (
          <Pressable
            key={r}
            onPress={() => setRange(r)}
            className={
              r === range ? 'bg-black rounded-full px-3 py-1' : 'bg-gray-200 rounded-full px-3 py-1'
            }
          >
            <Text className={r === range ? 'text-white' : 'text-black'}>{r}</Text>
          </Pressable>
        ))}
      </View>

      {chartData.length === 0 ? (
        <Text>Not enough data for this range</Text>
      ) : (
        <VictoryChart scale={{ x: 'time' }}>
          <VictoryAxis dependentAxis domain={[1, 10]} />
          <VictoryAxis />
          <VictoryLine data={chartData} />
        </VictoryChart>
      )}
    </View>
  );
}
